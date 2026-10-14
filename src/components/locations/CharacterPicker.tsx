"use client";

import Link from "next/link";
import { useState } from "react";
import { characterHref, type CharacterOption } from "@/lib/locations";

/**
 * Чипы выбранных героев и NPC (ссылки на их листы) и кнопка «＋», открывающая список с поиском.
 * Список отмечается галочками — как чекбоксы: клик добавляет или убирает.
 */
export function CharacterPicker({
  options,
  selectedIds,
  onToggle,
  label = "＋ Персонаж",
}: {
  options: CharacterOption[];
  selectedIds: number[];
  onToggle: (id: number, on: boolean) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const byId = new Map(options.map((o) => [o.id, o]));
  const selected = selectedIds.map((id) => byId.get(id)).filter((o): o is CharacterOption => !!o);
  const q = query.trim().toLowerCase();
  const shown = options.filter((o) => !q || `${o.name} ${o.sub}`.toLowerCase().includes(q));

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {selected.map((c) => (
        <span key={c.id} className="flex items-center overflow-hidden rounded-full border border-border bg-panel-2 text-sm">
          <Link href={characterHref(c)} className="px-2.5 py-0.5 hover:text-accent" title={c.sub || (c.kind === "npc" ? "NPC" : "Герой")}>
            {c.kind === "npc" ? "🎭" : "🧙"} {c.name}
          </Link>
          <button className="px-1.5 py-0.5 text-muted hover:bg-red-500/20 hover:text-red-400" onClick={() => onToggle(c.id, false)} title="Убрать">
            ✕
          </button>
        </span>
      ))}
      <button className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-sm text-muted hover:border-accent hover:text-accent" onClick={() => setOpen((v) => !v)}>
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-full z-40 mt-1 w-72 space-y-2 p-2 shadow-xl">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск героя или NPC…" className="input w-full text-sm" />
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {(["pc", "npc"] as const).map((kind) => {
                const list = shown.filter((o) => o.kind === kind);
                if (list.length === 0) return null;
                return (
                  <li key={kind}>
                    <div className="px-1 pt-1 text-[11px] uppercase tracking-wide text-muted">{kind === "pc" ? "Герои" : "NPC"}</div>
                    {list.map((o) => {
                      const on = selectedIds.includes(o.id);
                      return (
                        <label key={o.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${on ? "bg-panel-2" : "hover:bg-panel-2"}`}>
                          <input type="checkbox" checked={on} onChange={() => onToggle(o.id, !on)} />
                          <span className="min-w-0 flex-1 truncate">{o.name}</span>
                          {o.sub && <span className="truncate text-xs text-muted">{o.sub}</span>}
                        </label>
                      );
                    })}
                  </li>
                );
              })}
              {shown.length === 0 && <li className="p-2 text-sm text-muted">{options.length === 0 ? "В мире пока нет героев и NPC" : "Ничего не найдено"}</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
