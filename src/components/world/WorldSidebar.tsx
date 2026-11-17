"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setEntryGroup } from "@/app/actions";
import { GroupIcon, GroupTile } from "@/components/CategoryIcon";
import type { EntryGroup, EntryKind } from "@/lib/db/schema";
import type { Category } from "@/lib/groups";
import { CategoryDialog } from "./CategoryDialog";

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

type Menu = { id: number; x: number; y: number };

/**
 * Закладки мира по категориям: Монстры, NPC, Артефакты, Локации, Карты, свои (+ «Без категории»).
 * Закладку можно перетащить на заголовок категории или перенести кнопкой «⋯».
 * Сверху поиск и (мелко) фильтр по типу записи.
 * j/k (или о/л в русской раскладке) — следующая/предыдущая закладка, / — поиск.
 */
export function WorldSidebar({
  worldName,
  categories,
  entries,
  selectedId,
}: {
  worldName: string;
  categories: Category[];
  entries: EntrySummary[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const [, startMove] = useTransition();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntryKind | "">("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // Окно категории: null — закрыто, "new" — создание, иначе правка этой категории.
  const [dialog, setDialog] = useState<Category | "new" | null>(null);
  const pendingMove = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLAnchorElement>(null);

  // Перенос показываем сразу, не дожидаясь сервера; после обновления данных подмена сбрасывается.
  const [moved, setMoved] = useState<{ base: EntrySummary[]; map: Record<number, EntryGroup> }>({ base: entries, map: {} });
  if (moved.base !== entries) setMoved({ base: entries, map: {} });
  const groupOf = (e: EntrySummary) => moved.map[e.id] ?? e.group;

  function move(id: number, to: EntryGroup) {
    setMenu(null);
    setMoved((m) => ({ ...m, map: { ...m.map, [id]: to } }));
    startMove(async () => {
      await setEntryGroup(id, to);
      router.refresh();
    });
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(
      (e) => (!kind || e.kind === kind) && (!needle || `${e.title}\n${e.subtitle}\n${e.tags}`.toLowerCase().includes(needle)),
    );
  }, [entries, q, kind]);

  // Порядок для j/k совпадает с экранным: по категориям, свёрнутые пропускаются.
  const ordered = useMemo(
    () => categories.filter((g) => !collapsed.has(g.key)).flatMap((g) => visible.filter((e) => (moved.map[e.id] ?? e.group) === g.key)),
    [categories, visible, collapsed, moved],
  );

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const t = ev.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") {
        if (ev.key === "Escape") (t as HTMLInputElement).blur();
        return;
      }
      if (ev.key === "Escape") setMenu(null);
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

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  const filtering = q.trim() !== "" || kind !== "";
  const toggle = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <aside className="flex w-full shrink-0 flex-col border-r border-border bg-panel lg:w-[22rem]">
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
          <span className="ml-auto flex gap-2">
            <button className="hover:text-accent" title="Свернуть все категории" onClick={() => setCollapsed(new Set(categories.map((g) => g.key)))}>
              ▲
            </button>
            <button className="hover:text-accent" title="Развернуть все категории" onClick={() => setCollapsed(new Set())}>
              ▼
            </button>
          </span>
        </div>
      </div>

      <nav className="relative flex-1 space-y-2 overflow-y-auto p-2">
        {categories.map((g) => {
          const items = visible.filter((e) => groupOf(e) === g.key);
          const total = entries.filter((e) => groupOf(e) === g.key).length;
          // «Без категории» видна, только пока в ней что-то есть (или при перетаскивании — чтобы вернуть закладку).
          if (g.key === "" && total === 0 && dragId === null) return null;
          // При поиске/фильтре не показываем пустые категории (но при перетаскивании — все, это цели для броска).
          if (filtering && items.length === 0 && dragId === null) return null;
          const open = !collapsed.has(g.key);
          const hot = overGroup === g.key;
          return (
            <section
              key={g.key || "none"}
              onDragOver={(e) => {
                if (dragId === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overGroup !== g.key) setOverGroup(g.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverGroup(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = dragId ?? Number(e.dataTransfer.getData("text/plain"));
                setOverGroup(null);
                setDragId(null);
                const entry = entries.find((x) => x.id === id);
                if (entry && groupOf(entry) !== g.key) move(id, g.key);
              }}
              style={hot ? { boxShadow: `0 0 0 2px ${g.color}99` } : undefined}
              className={`rounded-xl border transition-colors ${hot ? "border-transparent bg-panel-2" : "border-border/60 bg-bg/40"}`}
            >
              <div className="group/head flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-panel-2"
                  aria-expanded={open}
                >
                  <GroupTile cat={g} size={40} active={hot} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-base leading-tight">{g.label}</span>
                    <span className="block truncate text-[11px] text-muted">{g.hint}</span>
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${g.color}26`, color: g.color }}>
                    {total}
                  </span>
                  <span className={`text-xs text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                </button>
                {!g.builtin && (
                  <button
                    type="button"
                    title="Изменить категорию"
                    onClick={() => setDialog(g)}
                    className="mr-1.5 rounded px-1.5 py-1 text-sm text-muted hover:bg-panel-2 hover:text-accent"
                  >
                    ✏️
                  </button>
                )}
              </div>

              {open && (
                <div className="px-1.5 pb-1.5">
                  {items.length === 0 && (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-xs text-muted">
                      {total === 0 ? "Перетащите сюда закладку" : "Нет совпадений"}
                    </p>
                  )}
                  {items.map((e) => {
                    const active = e.id === selectedId;
                    return (
                      <div
                        key={e.id}
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("text/plain", String(e.id));
                          ev.dataTransfer.effectAllowed = "move";
                          setDragId(e.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverGroup(null);
                        }}
                        className={`group relative rounded-md ${dragId === e.id ? "opacity-40" : ""}`}
                      >
                        <Link
                          ref={active ? selectedRef : undefined}
                          href={`/world?e=${e.id}`}
                          scroll={false}
                          draggable={false}
                          className={`block cursor-grab rounded-md py-1.5 pl-2 pr-8 text-sm hover:bg-panel-2 ${active ? "bg-panel-2 ring-1 ring-accent" : ""}`}
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
                        <button
                          type="button"
                          title="Перенести в категорию…"
                          onClick={(ev) => {
                            const r = ev.currentTarget.getBoundingClientRect();
                            setMenu(menu?.id === e.id ? null : { id: e.id, x: Math.max(8, r.right - 224), y: Math.min(r.bottom + 4, window.innerHeight - 340) });
                          }}
                          className={`absolute right-1 top-1.5 rounded px-1.5 text-base leading-none text-muted hover:bg-bg hover:text-accent ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"} focus:opacity-100 [@media(hover:none)]:opacity-70`}
                        >
                          ⋯
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {entries.length > 0 && visible.length === 0 && <p className="p-2 text-sm text-muted">Ничего не найдено</p>}
      </nav>

      {/* Меню «Перенести в…» — поверх всего, чтобы не обрезалось прокруткой списка */}
      {menu && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenu(null)} />
          <div className="fixed z-40 w-56 rounded-xl border border-border bg-panel p-1.5 shadow-2xl" style={{ left: menu.x, top: menu.y }}>
            <p className="px-2 pb-1 pt-0.5 text-[11px] uppercase tracking-wide text-muted">Перенести в…</p>
            {categories.map((g) => {
              const current = entries.some((e) => e.id === menu.id && groupOf(e) === g.key);
              return (
                <button
                  key={g.key || "none"}
                  type="button"
                  disabled={current}
                  onClick={() => move(menu.id, g.key)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-panel-2 disabled:opacity-50"
                >
                  <GroupIcon cat={g} size={20} />
                  <span className="flex-1 text-text">{g.label}</span>
                  {current && <span className="text-xs text-muted">✓</span>}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                pendingMove.current = menu.id;
                setMenu(null);
                setDialog("new");
              }}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg border-t border-border px-2 py-1.5 pt-2 text-left text-sm text-muted hover:text-accent"
            >
              <span className="w-5 text-center text-lg leading-none">＋</span>
              <span>Новая категория…</span>
            </button>
          </div>
        </>
      )}

      <button type="button" onClick={() => setDialog("new")} className="border-t border-border px-3 py-2 text-left text-xs text-muted hover:text-accent">
        ＋ Своя категория (название, цвет, значок)
      </button>
      {dialog && (
        <CategoryDialog
          key={dialog === "new" ? "new" : dialog.key}
          editing={dialog === "new" ? undefined : dialog}
          onClose={() => {
            pendingMove.current = null;
            setDialog(null);
          }}
          onCreated={(key) => {
            // Если категорию создали из меню «Перенести в…», закладка сразу переезжает в неё.
            if (pendingMove.current !== null) move(pendingMove.current, key);
            pendingMove.current = null;
          }}
        />
      )}

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
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted">
        Перетащите закладку на категорию · j / k — следующая / предыдущая · / — поиск
      </p>
    </aside>
  );
}
