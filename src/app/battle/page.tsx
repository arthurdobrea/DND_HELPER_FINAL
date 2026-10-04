import type { Metadata } from "next";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { getMonsters } from "@/lib/catalog";
import { initiative, normalizeSheet } from "@/lib/character";
import { emptyBattle, sanitizeBattle } from "@/lib/battle";
import { pageMeta } from "@/lib/meta";
import { BattleTracker, type PartyEntry } from "@/components/battle/BattleTracker";

export const metadata: Metadata = pageMeta("Бой", "🛡️");

export default async function BattlePage() {
  await connection();
  const world = await requireWorld();
  const db = getDb();

  const row = db.select().from(schema.battles).where(eq(schema.battles.worldId, world.id)).get();
  let initial = emptyBattle();
  try {
    if (row) initial = sanitizeBattle(JSON.parse(row.state));
  } catch {
    // Повреждённое состояние не должно ронять страницу — начинаем с пустого боя.
  }

  const chars = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.worldId, world.id))
    .orderBy(asc(schema.characters.name))
    .all();
  const monsters = new Map((await getMonsters().catch(() => [])).map((m) => [m.key, m]));
  const toEntry = (r: (typeof chars)[number]): PartyEntry => {
    const s = normalizeSheet(JSON.parse(r.data));
    const base = r.monsterKey ? monsters.get(r.monsterKey) : undefined;
    return {
      id: r.id,
      name: s.name || "Без имени",
      sub: [s.race, s.className].filter(Boolean).join(" · ") || "—",
      ac: s.ac,
      hp: s.hpCurrent,
      hpMax: s.hpMax,
      initBonus: initiative(s),
      monsterKey: r.monsterKey ?? "",
      cr: base?.cr ?? 0,
      type: base?.type ?? "",
    };
  };

  return (
    <BattleTracker
      initial={initial}
      heroes={chars.filter((c) => c.kind === "pc").map(toEntry)}
      npcs={chars.filter((c) => c.kind === "npc").map(toEntry)}
    />
  );
}
