/**
 * Звери, которых мастер дал герою. Очередь как у вещей (gifts.ts), отдельный файл DATA_DIR/tracker/creatures-<id>.json:
 * старое приложение знает только вещи и зверя за вещь не примет. GET /api/sync/characters/<id> отдаёт очередь в поле creatures,
 * POST …/gifts {takenCreatures} убирает забранных.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "@/lib/config";
import type { CreatureJson } from "@/lib/monster-creature";

export type CreatureGift = { id: string; creature: CreatureJson };

const file = (heroId: number) => path.join(DATA_DIR, "tracker", `creatures-${heroId}.json`);

export function readCreatureGifts(heroId: number): CreatureGift[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(heroId), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(heroId: number, list: CreatureGift[]) {
  fs.mkdirSync(path.dirname(file(heroId)), { recursive: true });
  const tmp = `${file(heroId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, file(heroId));
}

/** Не больше стольких зверей в очереди (как MAX_GIFTS у вещей). */
export const MAX_CREATURES = 20;

export function addCreatureGift(heroId: number, creature: CreatureJson): CreatureGift | null {
  const list = readCreatureGifts(heroId);
  if (list.length >= MAX_CREATURES) return null;
  const gift = { id: randomUUID(), creature };
  write(heroId, [...list, gift]);
  return gift;
}

export function dropCreatureGifts(heroId: number, ids: string[]) {
  write(heroId, readCreatureGifts(heroId).filter((g) => !ids.includes(g.id)));
}
