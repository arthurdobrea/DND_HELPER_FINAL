"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EntryKind } from "@/lib/db/schema";

export type EntrySummary = {
  id: number;
  kind: EntryKind;
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

/**
 * Список закладок мира: поиск, фильтр по типу, группы.
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
  const [kind, setKind] = useState<EntryKind | "">("");
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLAnchorElement>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) =>
        (!kind || e.kind === kind) &&
        (!needle || `${e.title}\n${e.subtitle}\n${e.tags}`.toLowerCase().includes(needle)),
    );
  }, [entries, q, kind]);

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
      if (!step || visible.length === 0) return;
      ev.preventDefault();
      const idx = visible.findIndex((e) => e.id === selectedId);
      const next = visible[Math.min(Math.max(idx + step, 0), visible.length - 1)];
      if (next && next.id !== selectedId) router.push(`/world?e=${next.id}`, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, router]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const counts = useMemo(() => {
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
        <div className="flex gap-1">
          <button
            onClick={() => setKind("")}
            className={`flex-1 rounded-md px-1 py-1 text-xs ${kind === "" ? "bg-accent text-bg" : "bg-panel-2 text-muted hover:text-text"}`}
          >
            Все {entries.length}
          </button>
          {KINDS.map((k) => (
            <button
              key={k}
              title={KIND_META[k].label}
              onClick={() => setKind(kind === k ? "" : k)}
              className={`flex-1 rounded-md px-1 py-1 text-xs ${kind === k ? "bg-accent text-bg" : "bg-panel-2 text-muted hover:text-text"}`}
            >
              {KIND_META[k].icon} {counts[k] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {KINDS.filter((k) => !kind || k === kind).map((k) => {
          const group = visible.filter((e) => e.kind === k);
          if (group.length === 0 && (q || kind !== k)) return null;
          return (
            <div key={k} className="mb-3">
              <div className="flex items-center justify-between px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                <span>
                  {KIND_META[k].icon} {KIND_META[k].label}
                </span>
                <Link href={KIND_META[k].add} className="normal-case hover:text-accent" title="Добавить">
                  ＋
                </Link>
              </div>
              {group.length === 0 && <p className="px-2 text-xs text-muted">пусто</p>}
              {group.map((e) => {
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
      </nav>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">j / k — следующая / предыдущая · / — поиск</p>
    </aside>
  );
}
