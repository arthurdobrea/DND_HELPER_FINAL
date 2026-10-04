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
import { NpcCards } from "@/components/npc/NpcCards";
import { buildCards } from "@/lib/npc-actions";

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

  // Карточки по бокам от листа: слева действия и оружие, справа особенности (и заклинания в тексте умения).
  const cards = statblock ? buildCards(statblock) : [];
  const actionCards = cards.filter((c) => c.section !== "special");
  const traitCards = cards.filter((c) => c.section === "special");
  // Высота колонок: от шапки сайта и панели листа до низа окна.
  const stickyCol = "xl:sticky xl:top-[calc(var(--header-h,49px)+64px)] xl:max-h-[calc(100dvh-var(--header-h,49px)-80px)] xl:overflow-y-auto xl:pr-1";

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
      {/* На широком экране: слева действия, по центру лист, справа особенности. На узком — карточки ниже листа. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-start xl:gap-4 xl:px-4">
        <NpcCards title="Действия и оружие" cards={actionCards} className={`hidden xl:block ${stickyCol}`} />
        <CharacterSheet key={`${row.id}-${row.updatedAt.getTime()}`} id={row.id} initial={normalizeSheet(JSON.parse(row.data))} backHref="/npcs" backLabel="← NPC" noun="NPC" />
        <NpcCards title="Особенности" cards={traitCards} className={`hidden xl:block ${stickyCol}`} />
      </div>
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-10 xl:hidden">
        <NpcCards title="Действия и оружие" cards={actionCards} />
        <NpcCards title="Особенности" cards={traitCards} />
      </div>
    </div>
  );
}
