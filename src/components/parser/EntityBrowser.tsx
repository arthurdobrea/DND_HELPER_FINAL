"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBookEntities, deleteBookEntity } from "@/app/parser-actions";
import { ABILITY_FIELDS, ABILITY_LABELS, abilityMod, signed, type Feature, type ParsedCharacter, type ParsedItem } from "@/lib/parser";

export type EntityDto<T> = { id: number; name: string; pages: number[]; data: T };

type Props = {
  bookId: number;
  characters: EntityDto<ParsedCharacter>[];
  items: EntityDto<ParsedItem>[];
};

function Rule() {
  return <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />;
}

function Line({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-bold text-[var(--sb-rule)]">{label}</span> {value}
    </p>
  );
}

function Features({ title, list }: { title: string; list: Feature[] }) {
  if (!list.length) return null;
  return (
    <section className="mt-3">
      <h3 className="border-b border-[var(--sb-rule)] font-display text-xl text-[var(--sb-rule)]">{title}</h3>
      <div className="mt-1 space-y-1.5">
        {list.map((f, i) => (
          <p key={i}>
            <span className="font-bold italic">{f.name}.</span> {f.desc}
          </p>
        ))}
      </div>
    </section>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <section className="mt-3">
      <h3 className="border-b border-[var(--sb-rule)] font-display text-lg text-[var(--sb-rule)]">{title}</h3>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </section>
  );
}

function PageLinks({ bookId, pages }: { bookId: number; pages: number[] }) {
  if (!pages.length) return null;
  return (
    <p className="mt-4 text-xs opacity-70">
      В книге:{" "}
      {pages.map((p, i) => (
        <span key={p}>
          {i > 0 && ", "}
          <Link href={`/books/${bookId}?page=${p}`} className="underline hover:text-[var(--sb-rule)]">
            стр. {p}
          </Link>
        </span>
      ))}
    </p>
  );
}

/** Лист персонажа в стиле статблока; без блока характеристик показывает только описание. */
export function CharacterSheet({ e, bookId }: { e: EntityDto<ParsedCharacter>; bookId: number }) {
  const c = e.data;
  const s = c.stats;
  const sub = [c.race, c.role, c.alignment].filter(Boolean).join(" · ");
  return (
    <article className="rounded-md bg-[var(--sb-bg)] p-5 text-[15px] leading-snug text-[var(--sb-text)] shadow-xl">
      <h2 className="font-display text-3xl font-bold text-[var(--sb-rule)]">{c.name}</h2>
      {sub && <p className="italic">{sub}</p>}
      {c.location && <p className="text-sm opacity-80">📍 {c.location}</p>}
      <Rule />
      {s ? (
        <>
          <Line label="Класс доспеха" value={s.ac} />
          <Line label="Хиты" value={s.hp} />
          <Line label="Скорость" value={s.speed} />
          {ABILITY_FIELDS.some((k) => s[k] !== null) && (
            <>
              <Rule />
              <div className="grid grid-cols-6 text-center">
                {ABILITY_FIELDS.map((k) => (
                  <div key={k}>
                    <div className="font-bold text-[var(--sb-rule)]">{ABILITY_LABELS[k]}</div>
                    <div>{s[k] === null ? "—" : `${s[k]} (${signed(abilityMod(s[k]))})`}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <Rule />
          <Line label="Спасброски" value={s.saves} />
          <Line label="Навыки" value={s.skills} />
          <Line label="Сопротивления и иммунитеты" value={s.resist} />
          <Line label="Чувства" value={s.senses} />
          <Line label="Языки" value={s.languages} />
          <Line label="Опасность" value={s.cr} />
          {s.traits.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {s.traits.map((f, i) => (
                <p key={i}>
                  <span className="font-bold italic">{f.name}.</span> {f.desc}
                </p>
              ))}
            </div>
          )}
          <Features title="Действия" list={s.actions} />
        </>
      ) : (
        <p className="text-sm italic opacity-70">В книге нет блока характеристик для этого персонажа.</p>
      )}
      <Block title="Описание" text={c.description} />
      <Block title="Характер и мотивация" text={c.personality} />
      <PageLinks bookId={bookId} pages={e.pages} />
    </article>
  );
}

export function ItemSheet({ e, bookId }: { e: EntityDto<ParsedItem>; bookId: number }) {
  const i = e.data;
  const sub = [i.type, i.rarity, i.attunement && `требует настройки: ${i.attunement}`].filter(Boolean).join(", ");
  return (
    <article className="rounded-md bg-[var(--sb-bg)] p-5 text-[15px] leading-snug text-[var(--sb-text)] shadow-xl">
      <h2 className="font-display text-3xl font-bold text-[var(--sb-rule)]">{i.name}</h2>
      {sub && <p className="italic">{sub}</p>}
      <Rule />
      <Line label="Где находится:" value={i.location} />
      <Block title="Описание" text={i.description} />
      <Block title="Свойства" text={i.properties} />
      <PageLinks bookId={bookId} pages={e.pages} />
    </article>
  );
}

export function EntityBrowser({ bookId, characters, items }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"character" | "item">("character");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"book" | "name">("book");
  const [onlyStats, setOnlyStats] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, start] = useTransition();
  // Отмеченные галочками для массового удаления (id уникальны среди персонажей и предметов).
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const lastChecked = useRef<number | null>(null);

  const list = (tab === "character" ? characters : items) as EntityDto<ParsedCharacter | ParsedItem>[];
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    let out = list.filter((e) => !q || `${e.name} ${JSON.stringify(e.data)}`.toLowerCase().includes(q));
    if (tab === "character" && onlyStats) out = out.filter((e) => (e.data as ParsedCharacter).stats);
    return [...out].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "ru") : (a.pages[0] ?? 0) - (b.pages[0] ?? 0) || a.name.localeCompare(b.name, "ru")));
  }, [list, q, sort, onlyStats, tab]);

  // Удаляются только отмеченные из того, что сейчас показано: скрытые фильтром записи случайно не пострадают.
  const checkedShown = shown.filter((e) => checked.has(e.id));
  const allShownChecked = shown.length > 0 && checkedShown.length === shown.length;

  function toggle(id: number, index: number, shift: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      const on = !prev.has(id);
      // Shift + клик: отметить (или снять) всё между прошлым и этим кликом.
      const from = shift && lastChecked.current !== null ? shown.findIndex((e) => e.id === lastChecked.current) : -1;
      const range = from >= 0 ? shown.slice(Math.min(from, index), Math.max(from, index) + 1) : [shown[index]];
      for (const e of range) {
        if (on) next.add(e.id);
        else next.delete(e.id);
      }
      return next;
    });
    lastChecked.current = id;
  }

  function removeChecked() {
    const ids = checkedShown.map((e) => e.id);
    if (ids.length === 0) return;
    if (!confirm(`Убрать из результатов выбранные записи (${ids.length})? При повторном разборе они могут найтись снова.`)) return;
    start(async () => {
      await deleteBookEntities(ids);
      setChecked((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      setSelected(null);
      router.refresh();
    });
  }

  const current = shown.find((e) => e.id === selected) ?? shown[0] ?? null;

  const tabBtn = (key: "character" | "item", text: string, n: number) => (
    <button
      className={`flex-1 rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
      onClick={() => {
        setTab(key);
        setSelected(null);
      }}
    >
      {text} ({n})
    </button>
  );

  return (
    <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[22rem_1fr]">
      <aside className="card flex max-h-[75vh] flex-col overflow-hidden">
        <div className="flex gap-1 border-b border-border p-2">
          {tabBtn("character", "🧙 Персонажи", characters.length)}
          {tabBtn("item", "🗡️ Предметы", items.length)}
        </div>
        <div className="space-y-2 border-b border-border p-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по имени и тексту…" className="input w-full py-1.5 text-sm" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <button className="underline-offset-2 hover:text-text" onClick={() => setSort(sort === "book" ? "name" : "book")}>
              Порядок: {sort === "book" ? "как в книге" : "по алфавиту"}
            </button>
            {tab === "character" && (
              <label className="ml-auto flex cursor-pointer items-center gap-1">
                <input type="checkbox" checked={onlyStats} onChange={(e) => setOnlyStats(e.target.checked)} /> только со статблоком
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5 text-xs">
          <button className="btn px-2 py-1 text-xs" disabled={shown.length === 0 || allShownChecked} onClick={() => setChecked((p) => new Set([...p, ...shown.map((e) => e.id)]))}>
            ☑ Выбрать все ({shown.length})
          </button>
          <button className="btn px-2 py-1 text-xs" disabled={checked.size === 0} onClick={() => setChecked(new Set())}>
            ☐ Снять все
          </button>
          <span className="text-muted">Выбрано: {checkedShown.length}</span>
          {checkedShown.length > 0 && (
            <button className="btn btn-danger ml-auto px-2 py-1 text-xs" disabled={pending} onClick={removeChecked}>
              🗑 Удалить ({checkedShown.length})
            </button>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {shown.length === 0 && <li className="p-3 text-sm text-muted">Ничего не найдено</li>}
          {shown.map((e, index) => {
            const isChar = tab === "character";
            const d = e.data as ParsedCharacter & ParsedItem;
            const sub = isChar ? [d.race, d.role].filter(Boolean).join(" · ") : [d.type, d.rarity].filter(Boolean).join(" · ");
            return (
              <li key={e.id} className="mb-1 flex items-stretch gap-1">
                <label className="flex w-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-panel-2" title="Отметить (Shift — диапазон)">
                  <input
                    type="checkbox"
                    checked={checked.has(e.id)}
                    onChange={() => {}}
                    onClick={(ev) => toggle(e.id, index, ev.shiftKey)}
                    className="h-4 w-4 cursor-pointer"
                  />
                </label>
                <button
                  onClick={() => setSelected(e.id)}
                  className={`min-w-0 flex-1 rounded-md border px-2 py-1.5 text-left ${checked.has(e.id) ? "border-red-400/60" : ""} ${current?.id === e.id ? "border-accent bg-panel-2" : checked.has(e.id) ? "" : "border-transparent hover:border-border"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.name}</span>
                    {isChar && d.stats && <span title="Есть блок характеристик">⚔️</span>}
                    {e.pages[0] && <span className="tag shrink-0">стр. {e.pages[0]}</span>}
                  </div>
                  {sub && <div className="truncate text-xs text-muted">{sub}</div>}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="min-w-0">
        {current ? (
          <>
            <div className="mb-2 flex justify-end">
              <button
                className="btn btn-danger"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Убрать «${current.name}» из результатов? При повторном разборе он может найтись снова.`)) return;
                  setSelected(null);
                  start(async () => {
                    await deleteBookEntity(current.id);
                    router.refresh();
                  });
                }}
              >
                🗑 Убрать
              </button>
            </div>
            {tab === "character" ? <CharacterSheet e={current as EntityDto<ParsedCharacter>} bookId={bookId} /> : <ItemSheet e={current as EntityDto<ParsedItem>} bookId={bookId} />}
          </>
        ) : (
          <p className="p-6 text-muted">{characters.length + items.length === 0 ? "Пока ничего не найдено — запустите разбор книги." : "Выберите запись слева."}</p>
        )}
      </section>
    </div>
  );
}
