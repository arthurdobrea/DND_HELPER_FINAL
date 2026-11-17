import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { trackerFileId } from "@/lib/sync";
import { normalizeSheet, type CharacterSheet } from "@/lib/character";
import { ONLINE_MS, ageMs } from "@/lib/presence";

/** Герой из приложения игрока: прислал полный файл или тему (руками заведённые персонажи их не имеют). */
export const isAppHero = (id: number, s: CharacterSheet) => !!(s.theme || trackerFileId(id));

export type HeroPick = { id: number; name: string; online: boolean };

/** Герои мира из приложения игрока: кому мастер может дать вещь. */
export function appHeroes(worldId: number): HeroPick[] {
  return getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, worldId), eq(schema.characters.kind, "pc")))
    .orderBy(asc(schema.characters.name))
    .all()
    .map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) }))
    .filter(({ id, s }) => isAppHero(id, s))
    .map(({ id, s }) => ({ id, name: s.name || "Без имени", online: (ageMs(id) ?? Infinity) < ONLINE_MS }));
}
