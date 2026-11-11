import { and, eq } from "drizzle-orm";
import { getMonsterRaw } from "@/lib/catalog";
import { getDb, schema } from "@/lib/db";
import { getMonster, type Monster } from "@/lib/open5e";
import type { RawMonster } from "@/lib/catalog/monsters";
import { normalizeSheet } from "@/lib/character";
import { CR_LIST } from "@/lib/cr";
import { blankDraft, draftFromMonster, sanitizeDraft, textAbility, type ForgeDraft } from "@/lib/forge";
import { localize } from "@/lib/translate/view";

/** Ключ монстра из конструктора: «custom:12». У монстров каталога такого префикса нет. */
export const CUSTOM_PREFIX = "custom:";
export const isCustomKey = (key: string | null | undefined): key is string => !!key && key.startsWith(CUSTOM_PREFIX);
export const customKey = (id: number) => `${CUSTOM_PREFIX}${id}`;

/** Статблок кастомного монстра мира (или undefined — нет такого или он из другого мира). */
export function getCustomMonster(key: string, worldId: number): Monster | undefined {
  if (!isCustomKey(key)) return undefined;
  const id = Number(key.slice(CUSTOM_PREFIX.length));
  if (!Number.isInteger(id)) return undefined;
  const row = getDb()
    .select()
    .from(schema.customMonsters)
    .where(and(eq(schema.customMonsters.id, id), eq(schema.customMonsters.worldId, worldId)))
    .get();
  if (!row) return undefined;
  try {
    return JSON.parse(row.data) as Monster;
  } catch {
    return undefined;
  }
}

/** Статблок по ключу: свой монстр мира или монстр каталога (затем Open5e). */
export async function resolveMonster(key: string, worldId: number | null | undefined): Promise<Monster | undefined> {
  if (isCustomKey(key)) return worldId ? getCustomMonster(key, worldId) : undefined;
  return ((await getMonsterRaw(key).catch(() => undefined)) as Monster | undefined) ?? ((await getMonster(key).catch(() => null)) ?? undefined);
}

/** CR и тип всех кастомных монстров мира — для списка NPC в бою. */
export function customMonsterInfo(worldId: number): Map<string, { cr: number; type: string }> {
  const rows = getDb().select().from(schema.customMonsters).where(eq(schema.customMonsters.worldId, worldId)).all();
  const map = new Map<string, { cr: number; type: string }>();
  for (const r of rows) {
    try {
      const m = JSON.parse(r.data) as Monster;
      map.set(customKey(r.id), { cr: m.cr, type: m.type });
    } catch {
      /* битая запись пропускается */
    }
  }
  return map;
}

/**
 * Черновик конструктора для правки NPC (любого, не только созданного в конструкторе): id NPC и черновик, либо null — NPC не найден.
 * NPC из конструктора — сохранённый черновик; NPC на основе монстра бестиария — черновик из его статблока (по возможности на русском)
 * с именем, предысторией и мотивацией из листа; если монстра в каталоге уже нет — черновик из полей листа.
 */
export async function loadForgeDraft(characterId: number, worldId: number): Promise<{ editId: number; draft: ForgeDraft; converted: boolean } | null> {
  if (!Number.isInteger(characterId)) return null;
  const db = getDb();
  const row = db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, characterId), eq(schema.characters.worldId, worldId), eq(schema.characters.kind, "npc")))
    .get();
  if (!row) return null;

  if (isCustomKey(row.monsterKey)) {
    const mon = db
      .select()
      .from(schema.customMonsters)
      .where(and(eq(schema.customMonsters.id, Number(row.monsterKey.slice(CUSTOM_PREFIX.length))), eq(schema.customMonsters.worldId, worldId)))
      .get();
    if (mon) {
      try {
        return { editId: row.id, draft: sanitizeDraft(JSON.parse(mon.draft)), converted: false };
      } catch {
        /* битый черновик — соберём из листа ниже */
      }
    }
  }

  const sheet = normalizeSheet(JSON.parse(row.data));
  const raw = row.monsterKey && !isCustomKey(row.monsterKey) ? await resolveMonster(row.monsterKey, worldId) : undefined;
  let draft: ForgeDraft;
  if (raw) {
    const base = draftFromMonster(localize("monster", raw as RawMonster, "ru").entry as Monster);
    draft = { ...base, name: sheet.name, backstory: sheet.backstory, motivation: sheet.motivation };
  } else {
    draft = {
      ...blankDraft(),
      name: sheet.name,
      backstory: sheet.backstory,
      motivation: sheet.motivation,
      scores: { ...sheet.abilities },
      ac: sheet.ac,
      hp: sheet.hpMax,
      speed: { walk: sheet.speed, fly: 0, swim: 0, climb: 0, burrow: 0 },
      cr: CR_LIST.find((c) => c >= sheet.level) ?? 30,
      abilities: sheet.features.trim() ? [textAbility("special", "Особенности из листа", sheet.features)] : [],
    };
  }
  return { editId: row.id, draft: sanitizeDraft(draft), converted: true };
}
