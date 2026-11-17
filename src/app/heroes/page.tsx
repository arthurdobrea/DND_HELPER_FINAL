import Link from "next/link";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb, schema } from "@/lib/db";
import { entryRefs, requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { isAppHero } from "@/lib/heroes";
import { HeroCard } from "@/components/character/HeroCard";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Герои", "🦸");

/** Герои из приложения игрока (DnD Tracker): те, что прислали полный файл или тему. Руками заведённые персонажи — во вкладке «Персонажи». */
export default async function HeroesPage() {
  await connection();
  const world = await requireWorld();
  const rows = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .orderBy(asc(schema.characters.name))
    .all();
  const heroes = rows
    .map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) }))
    .filter(({ id, s }) => isAppHero(id, s));
  const pinned = entryRefs(world.id, "hero");

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <h1 className="font-display text-2xl text-accent">🦸 Герои мира «{world.name}»</h1>
      <p className="mt-1 text-sm text-muted">Герои из приложения игроков. Зелёный бабл: игрок на связи; красный: нет.</p>
      {heroes.length === 0 ? (
        <p className="mt-4 text-muted">
          Пока никого. Игроки подключаются по QR на странице <Link href="/connect" className="text-accent hover:underline">«Подключение»</Link>.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {heroes.map(({ id, s }) => (
            <HeroCard key={id} id={id} s={s} pinned={pinned.has(String(id))} />
          ))}
        </div>
      )}
    </div>
  );
}
