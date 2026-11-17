import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { entryRefs, requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { HeroCard } from "@/components/character/HeroCard";
import { isAppHero } from "@/lib/heroes";
import { createCharacter } from "@/app/actions";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Персонажи", "🧙");

export default async function CharactersPage() {
  await connection();
  const world = await requireWorld();
  const rows = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .orderBy(asc(schema.characters.name))
    .all();
  // Герои из приложения игрока живут во вкладке «Герои», здесь их не дублируем.
  const party = rows.map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) })).filter(({ id, s }) => !isAppHero(id, s));
  const pinned = entryRefs(world.id, "hero");

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <h1 className="font-display text-2xl text-accent">🧙 Персонажи мира «{world.name}»</h1>

      {party.length === 0 && <p className="mt-4 text-muted">Пока нет персонажей — создайте первого ниже.</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {party.map(({ id, s }) => (
          <HeroCard key={id} id={id} s={s} pinned={pinned.has(String(id))} />
        ))}
      </div>

      <form action={createCharacter} className="card mt-6 flex flex-wrap items-center gap-2 p-3">
        <span className="font-display">＋ Новый персонаж</span>
        <input name="name" required placeholder="Имя персонажа" className="input flex-1" />
        <input name="playerName" placeholder="Игрок" className="input w-48" />
        <button className="btn btn-primary">Создать лист</button>
      </form>
    </div>
  );
}
