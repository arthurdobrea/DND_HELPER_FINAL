import Link from "next/link";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { StoryKind } from "@/lib/db/schema";
import { requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { STORY_META, STORY_ORDER } from "@/lib/story";
import { hrefWith } from "@/lib/url";
import { geminiEnabled } from "@/lib/ai/gemini";
import { StoryCard, type StoryCardData } from "@/components/story/StoryCard";
import { NewStory } from "@/components/story/NewStory";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import { getCurrentWorld } from "@/lib/world";

const STATUSES = [
  { key: "open", label: "К рассказу" },
  { key: "told", label: "Рассказано" },
  { key: "all", label: "Все" },
] as const;

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : null);

export async function generateMetadata({ searchParams }: PageProps<"/story">): Promise<Metadata> {
  const world = await getCurrentWorld();
  const { h } = await searchParams;
  const hero =
    world && typeof h === "string" && /^\d+$/.test(h)
      ? getDb().select().from(schema.characters).where(and(eq(schema.characters.id, Number(h)), eq(schema.characters.worldId, world.id))).get()
      : undefined;
  return pageMeta(hero ? `Сюжет · ${hero.name}` : "Сюжет", "📜");
}

export default async function StoryPage({ searchParams }: PageProps<"/story">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

  const db = getDb();
  const heroRows = db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .orderBy(asc(schema.characters.name))
    .all()
    .map((r) => ({ id: r.id, sheet: normalizeSheet(JSON.parse(r.data)) }));
  const heroName = new Map(heroRows.map((h) => [h.id, h.sheet.name || "Без имени"]));
  const heroOptions = heroRows.map((h) => ({ id: h.id, name: h.sheet.name || "Без имени" }));

  const notes = db.select().from(schema.storyNotes).where(eq(schema.storyNotes.worldId, world.id)).orderBy(asc(schema.storyNotes.createdAt)).all();

  // ---------- Фильтры ----------
  const hParam = one(sp.h) || "all"; // all | party | <id>
  const heroId = /^\d+$/.test(hParam) && heroName.has(Number(hParam)) ? Number(hParam) : null;
  const hero = heroId === null ? (hParam === "party" ? "party" : "all") : heroId;
  const kind = STORY_ORDER.find((k) => k === one(sp.k)) ?? null;
  const status = STATUSES.find((s) => s.key === one(sp.s))?.key ?? "open";
  const q = one(sp.q).trim().toLowerCase();

  // «К рассказу» — ещё не рассказано ИЛИ рассказано, но баф так и не выдан (чтобы не забыть).
  const isOpen = (n: (typeof notes)[number]) => !n.told || (n.boon.trim() !== "" && !n.boonGiven);

  const matches = (n: (typeof notes)[number]) =>
    (hero === "all" || (hero === "party" ? n.characterId === null : n.characterId === hero)) &&
    (!kind || n.kind === kind) &&
    (status === "all" || (status === "open" ? isOpen(n) : n.told)) &&
    (!q || `${n.title}\n${n.body}\n${n.subject}\n${n.trigger}\n${n.boon}\n${n.reaction}`.toLowerCase().includes(q));

  const shown = notes
    .filter(matches)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.told) - Number(b.told) || a.createdAt.getTime() - b.createdAt.getTime());

  const toCard = (n: (typeof notes)[number]): StoryCardData => ({
    id: n.id,
    characterId: n.characterId,
    heroName: n.characterId === null ? null : (heroName.get(n.characterId) ?? null),
    kind: n.kind,
    title: n.title,
    body: n.body,
    subject: n.subject,
    trigger: n.trigger,
    boon: n.boon,
    boonGiven: n.boonGiven,
    told: n.told,
    toldAt: fmtDate(n.toldAt),
    reaction: n.reaction,
    pinned: n.pinned,
  });

  // Группировка: в общем списке — по героям, затем по видам; у одного героя — по видам.
  type Group = { key: string; title: string; notes: typeof shown };
  const groups: Group[] = [];
  const addByKind = (prefix: string, list: typeof shown) => {
    for (const k of STORY_ORDER) {
      const part = list.filter((n) => n.kind === k);
      if (part.length) groups.push({ key: `${prefix}-${k}`, title: `${STORY_META[k].icon} ${STORY_META[k].label}`, notes: part });
    }
  };
  if (hero === "all") {
    const owners: (number | null)[] = [null, ...heroRows.map((h) => h.id)];
    for (const owner of owners) {
      const list = shown.filter((n) => n.characterId === owner);
      if (list.length) groups.push({ key: `h${owner}`, title: owner === null ? "👥 Вся партия" : `🧙 ${heroName.get(owner)}`, notes: list });
    }
  } else addByKind("k", shown);

  const suggestions = [...new Set(notes.filter((n) => n.kind === "deity" && n.subject).map((n) => n.subject))];

  // Счётчики для списка героев.
  const countFor = (id: number | null) => {
    const own = notes.filter((n) => n.characterId === id);
    return { open: own.filter(isOpen).length, boons: own.filter((n) => n.boon.trim() !== "" && !n.boonGiven).length };
  };

  const sheet = typeof hero === "number" ? heroRows.find((h) => h.id === hero)?.sheet : undefined;
  const sheetFacts = sheet
    ? ([
        ["Предыстория", sheet.backstory],
        ["Черты характера", sheet.personality],
        ["Идеалы", sheet.ideals],
        ["Привязанности", sheet.bonds],
      ] as const).filter(([, v]) => v.trim() !== "")
    : [];

  const newKind: StoryKind = kind ?? "hook";
  const heroLink = (value: string) => hrefWith("/story", sp, { h: value === "all" ? null : value });

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row">
      {/* ---------- Герои ---------- */}
      <aside className="w-full shrink-0 space-y-1 lg:sticky lg:top-[calc(var(--header-h,49px)+1rem)] lg:w-64 lg:self-start">
        <h1 className="mb-2 font-display text-2xl text-accent">📜 Сюжет героев</h1>
        {(
          [
            ["all", "Все герои", null],
            ["party", "👥 Вся партия", countFor(null)],
            ...heroRows.map((h) => [String(h.id), h.sheet.name || "Без имени", countFor(h.id)] as const),
          ] as const
        ).map(([value, text, c]) => {
          const active = String(hero) === value;
          const total = c ? c.open : notes.filter(isOpen).length;
          return (
            <Link
              key={value}
              href={heroLink(value)}
              scroll={false}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${active ? "border-accent bg-panel-2 text-accent" : "border-border bg-panel hover:border-accent"}`}
            >
              <span className="min-w-0 flex-1 truncate">{text}</span>
              {total > 0 && (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent" title="К рассказу или выдаче">
                  {total}
                </span>
              )}
            </Link>
          );
        })}
        {heroRows.length === 0 && <p className="text-xs text-muted">Персонажей в мире пока нет — заметки можно вести для всей партии.</p>}
      </aside>

      {/* ---------- Заметки ---------- */}
      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <NewStory aiEnabled={geminiEnabled()} heroes={heroOptions} suggestions={suggestions} characterId={typeof hero === "number" ? hero : null} kind={newKind} />
          <div className="flex gap-1" role="tablist" aria-label="Статус">
            {STATUSES.map((s) => (
              <Link
                key={s.key}
                href={hrefWith("/story", sp, { s: s.key === "open" ? null : s.key })}
                scroll={false}
                className={`rounded-md px-2.5 py-1 text-sm ${status === s.key ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <form method="get" className="ml-auto flex gap-1.5">
            {Object.entries({ h: one(sp.h), k: one(sp.k), s: one(sp.s) }).map(([name, value]) => value && <input key={name} type="hidden" name={name} value={value} />)}
            <input name="q" defaultValue={one(sp.q)} type="search" placeholder="🔎 Поиск по заметкам" className="input w-56 py-1 text-sm" />
          </form>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Link href={hrefWith("/story", sp, { k: null })} scroll={false} className={`rounded-md border px-2.5 py-1 text-sm ${!kind ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}>
            Все виды
          </Link>
          {STORY_ORDER.map((k) => {
            const m = STORY_META[k];
            const on = kind === k;
            return (
              <Link
                key={k}
                href={hrefWith("/story", sp, { k: on ? null : k })}
                scroll={false}
                title={m.hint}
                className="rounded-md border border-border px-2.5 py-1 text-sm text-muted hover:text-text"
                style={on ? { borderColor: m.color, color: m.color, backgroundColor: `${m.color}1f` } : undefined}
              >
                {m.icon} {m.label}
              </Link>
            );
          })}
        </div>

        {sheet && (
          <details className="card p-3" open={sheetFacts.length > 0 && notes.every((n) => n.characterId !== hero)}>
            <summary className="cursor-pointer text-sm text-muted hover:text-accent">
              Из листа персонажа «{sheet.name}» (ур. {sheet.level}, {[sheet.race, sheet.className].filter(Boolean).join(" · ") || "—"}) — основа для зацепок
            </summary>
            {sheetFacts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">В листе пока нет предыстории и привязанностей — заполните их в «Персонажах».</p>
            ) : (
              <dl className="mt-2 space-y-2 text-sm">
                {sheetFacts.map(([name, text]) => (
                  <div key={name}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{name}</dt>
                    <dd className="whitespace-pre-wrap">{text}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Link href={`/characters/${hero}`} className="mt-2 inline-block text-xs text-accent hover:underline">
              Открыть лист →
            </Link>
          </details>
        )}

        {shown.length === 0 && (
          <div className="card p-6 text-center text-muted">
            {notes.length === 0 ? (
              <>
                <p className="font-display text-xl text-accent">Здесь будут зацепки, послания божеств и награды</p>
                <p className="mt-2 text-sm">
                  Например: «🪶 Божество · Raven Queen — что сказать герою, когда он помолится, и какой дар выдать». Нажмите «＋ Новая заметка».
                </p>
              </>
            ) : (
              <p>По выбранным фильтрам ничего нет.</p>
            )}
          </div>
        )}

        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              {g.title} · {g.notes.length}
            </h2>
            {g.notes.map((n) => (
              <StoryCard key={`${n.id}-${n.told}-${n.pinned}-${n.boonGiven}`} note={toCard(n)} heroes={heroOptions} suggestions={suggestions} showHero={false} aiEnabled={geminiEnabled()} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
