/**
 * Обмен с приложением игрока DnD Tracker: общие помощники для /api/sync/*.
 * Игрок присылает свой лист и опрашивает сервер раз в несколько секунд (HTTP JSON, без WebSocket).
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { DATA_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { normalizeSheet, type CharacterSheet } from "@/lib/character";
import { CORS_HEADERS } from "@/lib/sync-cors";
import { ordered, sideOf, type Battle } from "@/lib/battle";

export { CORS_HEADERS, SYNC_KEY_HEADER } from "@/lib/sync-cors";

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });

export const notFound = () => json({ error: "not found" }, 404);
export const badRequest = (error: string) => json({ error }, 400);

/** Герой (PC) по id; NPC мастера через обмен не отдаются и не правятся. */
export function findPc(id: number) {
  return getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, id), eq(schema.characters.kind, "pc")))
    .get();
}

export function pcView(row: { id: number; worldId: number; name: string; data: string; updatedAt: Date }) {
  return {
    id: row.id,
    worldId: row.worldId,
    name: row.name,
    updatedAt: row.updatedAt.getTime(),
    /** id персонажа в приложении игрока из сохранённого файла; null — файла нет. */
    fileId: trackerFileId(row.id),
    sheet: normalizeSheet(JSON.parse(row.data)),
  };
}

// ---------- Полный файл персонажа DnD Tracker ----------
// Лист мастера хранит не всё (эффекты, заклинания целиком, предметы с зарядами), поэтому рядом с базой лежит
// полный файл персонажа в формате приложения игрока — чтобы игрок мог забрать его обратно на телефон.

const TRACKER_DIR = path.join(DATA_DIR, "tracker");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const trackerPath = (id: number) => path.join(TRACKER_DIR, `${id}.json`);

/** Похоже ли на файл персонажа DnD Tracker: {schemaVersion, character: {id, …}} не больше 2 МБ. */
export function isTrackerFile(file: unknown): boolean {
  const f = file as { schemaVersion?: unknown; character?: { id?: unknown } } | null;
  return !!f && typeof f === "object" && typeof f.schemaVersion === "number" && typeof f.character?.id === "string" &&
    JSON.stringify(f).length <= MAX_FILE_BYTES;
}

/** Перезаписывает полный файл персонажа. false — файл не тот. */
export function saveTrackerFile(id: number, file: unknown): boolean {
  if (!isTrackerFile(file)) return false;
  const text = JSON.stringify(file);
  fs.mkdirSync(TRACKER_DIR, { recursive: true });
  // Сначала во временный файл, потом переименование: обрыв записи не портит прежний файл.
  const tmp = `${trackerPath(id)}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, trackerPath(id));
  return true;
}

export function readTrackerFile(id: number): string | undefined {
  try {
    return fs.readFileSync(trackerPath(id), "utf8");
  } catch {
    return undefined;
  }
}

export function trackerFileId(id: number): string | null {
  const text = readTrackerFile(id);
  if (!text) return null;
  try {
    const f = JSON.parse(text) as { character?: { id?: unknown } };
    return typeof f.character?.id === "string" ? f.character.id : null;
  } catch {
    return null;
  }
}

/**
 * Присланные игроком поля поверх сохранённого листа: чего игрок не прислал (предыстория, заметки мастера…),
 * остаётся как было.
 */
export function mergeSheet(existing: unknown, patch: unknown): CharacterSheet {
  const base = normalizeSheet(existing);
  const p = (patch && typeof patch === "object" ? patch : {}) as Partial<CharacterSheet>;
  return normalizeSheet({
    ...base,
    ...p,
    abilities: { ...base.abilities, ...p.abilities },
    saves: { ...base.saves, ...p.saves },
    skills: { ...base.skills, ...p.skills },
    coins: { ...base.coins, ...p.coins },
  });
}

/** Бой для игроков: порядок ходов и чей ход. Хиты — только героев, у монстров не показываем. */
export function battleView(b: Battle, updatedAt: Date | null) {
  return {
    started: b.started,
    round: b.round,
    activeId: b.activeId,
    updatedAt: updatedAt?.getTime() ?? 0,
    order: ordered(b.combatants).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      side: sideOf(c),
      init: c.init,
      sheetId: c.sheetId,
      active: c.id === b.activeId,
      down: c.hp <= 0,
      ...(c.kind === "hero" ? { hp: c.hp, hpMax: c.hpMax } : {}),
    })),
  };
}
