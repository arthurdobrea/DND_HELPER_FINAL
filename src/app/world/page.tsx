import Link from "next/link";
import { connection } from "next/server";
import { getDb, schema } from "@/lib/db";
import type { WorldEntry } from "@/lib/db/schema";
import { requireWorld, worldEntries } from "@/lib/world";
import { getItems, getSpells, type Item, type Spell } from "@/lib/catalog";
import { ITEM_CATEGORIES, RARITIES, SCHOOLS, label } from "@/lib/catalog/labels";
import { spellLevelLabel } from "@/lib/catalog/spells";
import type { Monster } from "@/lib/open5e";
import { saveEntryNotes } from "@/app/actions";
import { WorldSidebar, type EntrySummary } from "@/components/world/WorldSidebar";
import { EntryHeader } from "@/components/world/EntryHeader";
import { PageEntryViewer } from "@/components/world/PageEntryViewer";
import { NotesEditor } from "@/components/NotesEditor";
import { SpellCard } from "@/components/SpellCard";
import { ItemCard } from "@/components/ItemCard";
import { StatBlock } from "@/components/StatBlock";

const KIND_ORDER = { page: 0, spell: 1, item: 2, monster: 3 } as const;

function parse<T>(e: WorldEntry): T | null {
  return e.data ? (JSON.parse(e.data) as T) : null;
}

function subtitle(e: WorldEntry, bookTitles: Map<number, string>): string {
  switch (e.kind) {
    case "page":
      return `${bookTitles.get(e.bookId ?? 0) ?? "книга удалена"} · стр. ${e.page}`;
    case "spell": {
      const s = parse<Spell>(e);
      return s ? `${spellLevelLabel(s.level)} · ${label(SCHOOLS, s.school)}` : "";
    }
    case "item": {
      const i = parse<Item>(e);
      return i ? [label(ITEM_CATEGORIES, i.category), i.rarity && label(RARITIES, i.rarity)].filter(Boolean).join(" · ") : "";
    }
    case "monster": {
      const m = parse<Monster>(e);
      return m ? `CR ${m.challenge_rating} · ${m.type}` : "";
    }
  }
}

export default async function WorldPage({ searchParams }: PageProps<"/world">) {
  await connection();
  const world = await requireWorld();
  const { e } = await searchParams;

  const bookTitles = new Map(
    getDb().select({ id: schema.books.id, title: schema.books.title }).from(schema.books).all().map((b) => [b.id, b.title]),
  );
  const entries = worldEntries(world.id).sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (a.kind === "page"
        ? (bookTitles.get(a.bookId ?? 0) ?? "").localeCompare(bookTitles.get(b.bookId ?? 0) ?? "") ||
          (a.page ?? 0) - (b.page ?? 0)
        : a.title.localeCompare(b.title)),
  );
  const summaries: EntrySummary[] = entries.map((x) => ({
    id: x.id,
    kind: x.kind,
    title: x.title,
    subtitle: subtitle(x, bookTitles),
    tags: x.tags,
    hasNotes: x.notes.trim() !== "",
  }));

  const selected = entries.find((x) => String(x.id) === e) ?? entries[0];

  let detail: React.ReactNode = null;
  if (selected) {
    const notes = (
      <NotesEditor key={`${selected.id}:${selected.notes}`} initial={selected.notes} save={saveEntryNotes.bind(null, selected.id)} />
    );
    const header = <EntryHeader key={`header-${selected.id}`} entry={{ id: selected.id, kind: selected.kind, title: selected.title, tags: selected.tags }} />;

    if (selected.kind === "page") {
      detail =
        selected.bookId && bookTitles.has(selected.bookId) ? (
          <div className="flex h-full min-h-0 flex-col">
            {header}
            <PageEntryViewer
              key={`page-${selected.id}`}
              bookId={selected.bookId}
              page={selected.page ?? 1}
              notes={notes}
              hasNotes={selected.notes.trim() !== ""}
            />
          </div>
        ) : (
          <div className="p-4">
            {header}
            <p className="mt-4 text-red-400">Книга этой закладки удалена.</p>
          </div>
        );
    } else {
      // Заклинания/предметы — свежая версия из каталога, если есть; иначе сохранённая копия.
      let card: React.ReactNode = null;
      if (selected.kind === "spell") {
        const s = (await getSpells().catch(() => [])).find((x) => x.key === selected.ref) ?? parse<Spell>(selected);
        card = s && <SpellCard s={s} />;
      } else if (selected.kind === "item") {
        const i = (await getItems().catch(() => [])).find((x) => x.key === selected.ref) ?? parse<Item>(selected);
        card = i && <ItemCard i={i} />;
      } else {
        const m = parse<Monster>(selected);
        card = m && <StatBlock m={m} />;
      }
      detail = (
        <div className="h-full overflow-y-auto">
          {header}
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>{card ?? <p className="text-red-400">Нет данных записи</p>}</div>
            <div className="space-y-3">{notes}</div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-1 lg:h-[calc(100vh-49px)] lg:overflow-hidden">
      <WorldSidebar worldName={world.name} entries={summaries} selectedId={selected?.id ?? null} />
      <section className="min-w-0 flex-1">
        {detail ?? (
          <div className="mx-auto max-w-xl p-10 text-center">
            <h2 className="font-display text-2xl text-accent">В мире «{world.name}» пока нет закладок</h2>
            <p className="mt-2 text-muted">Добавляйте их кнопкой «🔖 В закладки мира» или клавишей B в книге.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Link href="/books" className="btn">📖 Страницы книг</Link>
              <Link href="/spells" className="btn">✨ Заклинания</Link>
              <Link href="/items" className="btn">🗡️ Предметы</Link>
              <Link href="/monsters" className="btn">🐲 Монстры</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
