"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toggleEntry } from "@/app/actions";
import type { Spell } from "@/lib/catalog";
import { SpellCard } from "./SpellCard";

type Card = { spell: Spell; untranslated: boolean; bookmarked: boolean };

// Уже загруженные карточки — повторное наведение открывается мгновенно.
const cache = new Map<string, Card>();

/** Всплывающее окно с описанием заклинания над страницей PDF. Позиционируется у найденного фрагмента (anchor). */
export function SpellPopover({
  spellKey,
  anchor,
  pinned,
  onClose,
  onEnter,
  onLeave,
}: {
  spellKey: string;
  anchor: { left: number; top: number; bottom: number };
  pinned: boolean;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [card, setCard] = useState<Card | null>(cache.get(spellKey) ?? null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  // Компонент пересоздаётся для каждого заклинания (key), поэтому состояние здесь не нужно сбрасывать.
  useEffect(() => {
    if (cache.has(spellKey)) return;
    const ctl = new AbortController();
    fetch(`/api/spells/card?key=${encodeURIComponent(spellKey)}&lang=ru`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Card>) : Promise.reject(new Error(String(r.status)))))
      .then((c) => {
        // Недопереведённое не кэшируем — при следующем наведении перевод может быть уже готов.
        if (!c.untranslated) cache.set(spellKey, c);
        setCard(c);
      })
      .catch((e) => e.name !== "AbortError" && setFailed(true));
    return () => ctl.abort();
  }, [spellKey]);

  function toggle() {
    start(async () => {
      await toggleEntry("spell", spellKey);
      setCard((c) => {
        if (!c) return c;
        const next = { ...c, bookmarked: !c.bookmarked };
        cache.set(spellKey, next);
        return next;
      });
    });
  }

  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const width = Math.min(460, vw - 16);
  const left = Math.min(Math.max(8, anchor.left), vw - width - 8);
  const below = vh - anchor.bottom - 14;
  const above = anchor.top - 14;
  const placeBelow = below >= 320 || below >= above;
  const maxHeight = Math.max(200, placeBelow ? below : above);

  return (
    <div
      role="dialog"
      aria-label="Описание заклинания"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-accent/60 bg-panel shadow-2xl"
      style={{
        left,
        width,
        maxHeight,
        ...(placeBelow ? { top: anchor.bottom + 6 } : { bottom: vh - anchor.top + 6 }),
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
        <span className="text-muted">{pinned ? "📌 закреплено" : "наведено — клик закрепит"}</span>
        <span className="flex-1" />
        {card && (
          <>
            <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={toggle}>
              {pending ? "…" : card.bookmarked ? "✓ В закладках" : "🔖 В закладки мира"}
            </button>
            <Link href={`/spells?open=${encodeURIComponent(spellKey)}`} target="_blank" className="btn px-2 py-1 text-xs" title="Открыть во вкладке «Заклинания»">
              ↗
            </Link>
          </>
        )}
        <button className="px-1 text-base leading-none text-muted hover:text-accent" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {card ? (
          <>
            {card.untranslated && <p className="mb-2 text-xs text-muted">Перевод не готов — показан оригинал.</p>}
            <SpellCard s={card.spell} />
          </>
        ) : failed ? (
          <p className="p-4 text-center text-red-400">Не удалось загрузить заклинание</p>
        ) : (
          <p className="p-6 text-center text-muted">Загружаю и перевожу…</p>
        )}
      </div>
    </div>
  );
}
