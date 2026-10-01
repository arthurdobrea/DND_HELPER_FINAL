"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryGroup, EntryKind } from "@/lib/db/schema";
import { GROUPS } from "@/lib/groups";

export type EntrySummary = {
  id: number;
  kind: EntryKind;
  group: EntryGroup;
  title: string;
  subtitle: string;
  tags: string;
  hasNotes: boolean;
};

export const KIND_META: Record<EntryKind, { icon: string; label: string; add: string }> = {
  page: { icon: "📖", label: "Страницы книг", add: "/books" },
  spell: { icon: "✨", label: "Заклинания", add: "/spells" },
  item: { icon: "🗡️", label: "Предметы", add: "/items" },
  monster: { icon: "🐲", label: "Монстры", add: "/monsters" },
};
const KINDS = Object.keys(KIND_META) as EntryKind[];

const chip = (active: boolean) =>
  `flex-1 rounded-md px-1 py-1 text-xs ${active ? "bg-accent text-bg" : "bg-panel-2 text-muted hover:text-text"}`;

/**
 * Список закладок мира по группам: Локации, NPC, Артефакты, Прочее.
 * Сверху поиск, фильтр по группе и (мелко) по типу записи.
 * j/k (или о/л в русской раскладке) — следующая/предыдущая закладка, / — поиск.
 */
export function WorldSidebar({
  worldName,
  entries,
  selectedId,
}: {
  worldName: string;
  entries: EntrySummary[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<EntryGroup | "all">("all");
  const [kind, setKind] = useState<EntryKind | "">("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLAnchorElement>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (group === "all" || e.group === group) &&
        (!kind || e.kind === kind) &&
        (!needle || `${e.title}\n${e.subtitle}\n${e.tags}`.toLowerCase().includes(needle)),
    );
  }, [entries, q, group, kind]);

  // Порядок для j/k совпадает с порядком на экране: по группам, внутри — как в списке.
  const ordered = useMemo(
    () => GROUPS.flatMap((g) => visible.filter((e) => e.group === g.key)),
    [visible],
  );

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
        if (ev.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      const k = ev.key.toLowerCase();
      if (k === "/" || k === ".") {
        ev.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const step = k === "j" || k === "о" ? 1 : k === "k" || k === "л" ? -1 : 0;
      if (!step || ordered.length === 0) return;
      ev.preventDefault();
      const idx = ordered.findIndex((e) => e.id === selectedId);
      const next = ordered[Math.min(Math.max(idx + step, 0), ordered.length - 1)];
      if (next && next.id !== selectedId) router.push(`/world?e=${next.id}`, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selectedId, router]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const groupCounts = useMemo(() => {
    const c = new Map<EntryGroup, number>();
    for (const e of entries) c.set(e.group, (c.get(e.group) ?? 0) + 1);
    return c;
  }, [entries]);
  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-border bg-panel lg:w-80">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="truncate font-display text-xl text-accent" title={worldName}>
            🌍 {worldName}
          </h1>
          <Link href="/worlds" className="shrink-0 text-xs text-muted hover:text-accent">
            сменить
          </Link>
        </div>
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔎 Поиск по закладкам ( / )"
          className="input w-full py-1.5 text-sm"
        />

        {/* Группы */}
        <div className="grid grid-cols-5 gap-1">
          <button onClick={() => setGroup("all")} className={chip(group === "all")} title="Все закладки">
            Все {entries.length}
          </button>
          {GROUPS.map((g) => (
            <button
              key={g.key || "other"}
              title={g.label}
              onClick={() => setGroup(group === g.key ? "all" : g.key)}
              className={chip(group === g.key)}
            >
              {g.icon} {groupCounts.get(g.key) ?? 0}
            </button>
          ))}
        </div>

        {/* Тип записи — второстепенный фильтр */}
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <span className="mr-1">тип:</span>
          {KINDS.map((k) => (
            <button
              key={k}
              title={KIND_META[k].label}
              onClick={() => setKind(kind === k ? "" : k)}
              className={`rounded px-1.5 py-0.5 ${kind === k ? "bg-accent text-bg" : "bg-panel-2 hover:text-text"}`}
            >
              {KIND_META[k].icon} {kindCounts[k] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {GROUPS.filter((g) => group === "all" || g.key === group).map((g) => {
          const items = visible.filter((e) => e.group === g.key);
          // Пустые группы показываем только когда ничего не отфильтровано (иначе список был бы пустыми заголовками).
          if (items.length === 0 && (q || kind || (group === "all" && g.key === ""))) return null;
          return (
            <div key={g.key || "other"} className="mb-3">
              <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {g.icon} {g.label} <span className="font-normal">({items.length})</span>
              </div>
              {items.length === 0 && <p className="px-2 text-xs text-muted">пока пусто</p>}
              {items.map((e) => {
                const active = e.id === selectedId;
                return (
                  <Link
                    key={e.id}
                    ref={active ? selectedRef : undefined}
                    href={`/world?e=${e.id}`}
                    scroll={false}
                    className={`block rounded-md px-2 py-1.5 text-sm hover:bg-panel-2 ${active ? "bg-panel-2 ring-1 ring-accent" : ""}`}
                  >
                    <span className={`block truncate ${active ? "text-accent" : ""}`}>
                      <span className="mr-1" title={KIND_META[e.kind].label}>
                        {KIND_META[e.kind].icon}
                      </span>
                      {e.title}
                      {e.hasNotes && <span className="ml-1 text-xs text-muted">📝</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{e.subtitle}</span>
                    {e.tags && (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {e.tags.split(",").map((t) => (
                          <span key={t} className="tag">
                            {t.trim()}
                          </span>
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
        {entries.length > 0 && visible.length === 0 && <p className="p-2 text-sm text-muted">Ничего не найдено</p>}
      </nav>

      <details className="border-t border-border px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-accent">＋ Добавить закладку</summary>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {KINDS.map((k) => (
            <Link key={k} href={KIND_META[k].add} className="btn px-2 py-1 text-xs">
              {KIND_META[k].icon} {KIND_META[k].label}
            </Link>
          ))}
        </div>
      </details>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">j / k — следующая / предыдущая · / — поиск</p>
    </aside>
  );
}
