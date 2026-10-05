import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { CharacterSheet } from "@/components/character/CharacterSheet";
import { SpellSideCards, type SideGroup } from "@/components/character/SpellSideCards";
import { AutoTranslate } from "@/components/translate/AutoTranslate";
import { getSpells, type Spell } from "@/lib/catalog";
import { resolveSheetSpells } from "@/lib/sheet-spells";
import { localizeMany } from "@/lib/translate/view";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { getCurrentWorld } from "@/lib/world";

export async function generateMetadata({ params }: PageProps<"/characters/[id]">): Promise<Metadata> {
  const world = await getCurrentWorld();
  const { id } = await params;
  const row = world
    ? getDb().select().from(schema.characters).where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id))).get()
    : undefined;
  return pageMeta(row?.name || "Персонаж", "🧙");
}

export default async function CharacterPage({ params }: PageProps<"/characters/[id]">) {
  await connection();
  const world = await requireWorld();
  const { id } = await params;
  const row = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id)))
    .get();
  if (!row) notFound();
  // NPC открываются в своём разделе.
  if (row.kind === "npc") redirect(`/npcs/${row.id}`);

  const sheet = normalizeSheet(JSON.parse(row.data));

  // Магия с листа: каждое заклинание — карточкой с описанием по бокам от листа (как способности NPC).
  const entries = resolveSheetSpells(sheet.spells, await getSpells().catch(() => []));
  const found = entries.filter((e) => e.spell).map((e) => e.spell!);
  const loc = localizeMany("spell", found, "ru");
  const localized = new Map(found.map((s, i) => [s.key, loc.entries[i]]));
  const groups: SideGroup[] = sheet.spells
    .map((_, level) => ({
      level,
      slots: level > 0 ? sheet.slots[level - 1].max : 0,
      items: entries
        .filter((e) => e.level === level)
        .map((e) => {
          const spell = e.spell ? localized.get(e.spell.key) : null;
          // Служебное поле поиска не нужно браузеру — не передаём.
          const { haystack: _h, ...rest } = spell ?? ({} as Spell);
          void _h;
          return { name: e.name, spell: spell ? rest : null };
        }),
    }))
    .filter((g) => g.items.length > 0);

  // Делим группы кругов на две колонки примерно поровну, не разрывая круг.
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  let acc = 0;
  const left: SideGroup[] = [];
  const right: SideGroup[] = [];
  for (const g of groups) {
    (acc < total / 2 ? left : right).push(g);
    acc += g.items.length;
  }
  const range = (list: SideGroup[]) => (list.length === 0 ? "" : list.length === 1 ? (list[0].level === 0 ? "заговоры" : `${list[0].level} круг`) : `${list[0].level === 0 ? "заговоры" : list[0].level} – ${list[list.length - 1].level} круг`);
  const leftTitle = right.length ? `Заклинания: ${range(left)}` : "Заклинания";
  const rightTitle = `Заклинания: ${range(right)}`;
  const stickyCol = "xl:sticky xl:top-[calc(var(--header-h,49px)+64px)] xl:max-h-[calc(100dvh-var(--header-h,49px)-80px)] xl:overflow-y-auto xl:pr-1";

  return (
    <div>
      {/* Недостающие переводы описаний дописываются в фоне, страница обновится сама. */}
      {loc.enabled && loc.missing.length > 0 && (
        <div className="mx-auto mt-3 w-full max-w-3xl px-4">
          <AutoTranslate texts={loc.missing} />
        </div>
      )}
      {/* На широком экране: слева и справа карточки магии, по центру лист. На узком — карточки ниже листа. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-start xl:gap-4 xl:px-4">
        <SpellSideCards title={leftTitle} groups={left} className={`hidden xl:block ${stickyCol}`} />
        <CharacterSheet key={row.id} id={row.id} initial={sheet} refreshOnSpells />
        <SpellSideCards title={rightTitle} groups={right} className={`hidden xl:block ${stickyCol}`} />
      </div>
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-10 xl:hidden">
        <SpellSideCards title="Заклинания" groups={groups} />
      </div>
    </div>
  );
}
