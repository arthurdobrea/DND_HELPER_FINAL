"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadSpellNames } from "@/lib/pdf-spell-refs";
import { normalizeSpellName } from "@/lib/spell-names";
import { SpellPopover } from "./SpellPopover";

const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 350;

type Popup = { key: string; anchor: { left: number; top: number; bottom: number }; pinned: boolean };

/** «fire bolt (3/день), Shield*» → список чистых названий для поиска в каталоге (с исходным написанием для показа). */
function parseNames(text: string): { label: string; norm: string }[] {
  const seen = new Set<string>();
  const out: { label: string; norm: string }[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const label = part.replace(/\([^)]*\)/g, "").replace(/[*_]/g, "").trim();
    const norm = normalizeSpellName(label);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push({ label, norm });
    }
  }
  return out;
}

/**
 * Полоса под списком заклинаний: каждое найденное в каталоге заклинание — кнопка. При наведении (или клике, для сенсорных экранов)
 * открывается окно с описанием на русском: что оно делает, дальность, длительность, урон. На печать не выводится.
 */
export function SpellChips({ text }: { text: string }) {
  const [names, setNames] = useState<Record<string, string> | null>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    loadSpellNames().then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    popupRef.current = popup;
  }, [popup]);
  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!popup) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setPopup(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [popup]);

  const chips = useMemo(
    () => (names ? parseNames(text).flatMap((p) => (names[p.norm] ? [{ ...p, key: names[p.norm] }] : [])) : []),
    [text, names],
  );
  if (chips.length === 0) return null;

  const anchorOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom };
  };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPopup((p) => (p?.pinned ? p : null)), HOVER_CLOSE_MS);
  };

  return (
    <div className="no-print mt-1 flex flex-wrap gap-1 border-t border-[#8a7a66]/50 pt-1">
      {chips.map((c) => (
        <button
          key={c.norm}
          type="button"
          onMouseEnter={(e) => {
            clearTimeout(closeTimer.current);
            const anchor = anchorOf(e.currentTarget);
            clearTimeout(openTimer.current);
            openTimer.current = setTimeout(() => !popupRef.current?.pinned && setPopup({ key: c.key, anchor, pinned: false }), HOVER_OPEN_MS);
          }}
          onMouseLeave={() => {
            clearTimeout(openTimer.current);
            if (popupRef.current && !popupRef.current.pinned) scheduleClose();
          }}
          onClick={(e) => {
            clearTimeout(openTimer.current);
            clearTimeout(closeTimer.current);
            setPopup({ key: c.key, anchor: anchorOf(e.currentTarget), pinned: true });
          }}
          title="Наведите, чтобы увидеть описание заклинания"
          className="cursor-help rounded border border-[#8a7a66] bg-[#3b2f22]/10 px-1.5 py-0.5 text-[10px] leading-none text-[#3b2f22] hover:bg-[#9c2b23]/15"
        >
          {c.label}
        </button>
      ))}
      {popup && (
        <SpellPopover
          key={popup.key}
          spellKey={popup.key}
          anchor={popup.anchor}
          pinned={popup.pinned}
          onClose={() => setPopup(null)}
          onEnter={() => clearTimeout(closeTimer.current)}
          onLeave={() => !popup.pinned && scheduleClose()}
        />
      )}
    </div>
  );
}
