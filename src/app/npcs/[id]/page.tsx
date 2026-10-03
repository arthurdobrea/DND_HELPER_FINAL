import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentWorld, requireWorld } from "@/lib/world";
import { getMonsterRaw, type RawMonster } from "@/lib/catalog";
import { normalizeSheet } from "@/lib/character";
import { localize } from "@/lib/translate/view";
import { pageMeta } from "@/lib/meta";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { StatBlock } from "@/components/StatBlock";
import { ImportSpellsButton } from "@/components/npc/ImportSpellsButton";

export async function generateMetadata({ params }: PageProps<"/npcs/[id]">): Promise<Metadata> {
  const world = await getCurrentWorld();
  const { id } = await params;
  const row = world
    ? getDb()
        .select()
        .from(schema.characters)
        .where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "npc")))
        .get()
    : undefined;
  return pageMeta(row?.name || "NPC", "🎭");
}

export default async function NpcPage({ params }: PageProps<"/npcs/[id]">) {
  await connection();
  const world = await requireWorld();
  const { id } = await params;
  const row = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "npc")))
    .get();
  if (!row) notFound();

  // Исходный статблок существа — для сверки (если оно ещё есть в каталоге).
  const raw = row.monsterKey ? await getMonsterRaw(row.monsterKey).catch(() => undefined) : undefined;
  const statblock = raw ? localize("monster", raw as RawMonster, "ru").entry : null;

  return (
    <div>
      {row.monsterKey && (
        <div className="mx-auto mt-3 w-full max-w-3xl px-4">
          <ImportSpellsButton id={row.id} />
        </div>
      )}
      {raw && statblock && (
        <details className="mx-auto mt-3 w-full max-w-3xl px-4">
          <summary className="cursor-pointer text-sm text-muted hover:text-accent">
            Основа из бестиария: {raw.name} (CR {raw.challenge_rating}) — показать исходный статблок
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <StatBlock m={statblock} lang="ru" />
            <Link href={`/monsters?open=${encodeURIComponent(row.monsterKey!)}`} className="text-xs text-accent hover:underline">
              Открыть во вкладке «Монстры» →
            </Link>
          </div>
        </details>
      )}
      <CharacterSheet key={`${row.id}-${row.updatedAt.getTime()}`} id={row.id} initial={normalizeSheet(JSON.parse(row.data))} backHref="/npcs" backLabel="← NPC" noun="NPC" />
    </div>
  );
}
