"use client";

import { useState } from "react";
import type { Spell } from "@/lib/catalog";
import { ABILITIES, CASTING_TIMES, DAMAGE_TYPES, SCHOOLS, label } from "@/lib/catalog/labels";
import { spellLevelLabel } from "@/lib/catalog/spells";
import { RichText } from "@/components/RichText";

/** Заклинание листа для боковой карточки: полная запись из каталога (без служебного поля поиска) или null, если не найдено. */
export type SideSpell = { name: string; spell: Omit<Spell, "haystack"> | null };
export type SideGroup = { level: number; slots: number; items: SideSpell[] };

const LEVEL_COLORS = ["#38bdf8", "#34d399", "#a3e635", "#fbbf24", "#fb923c", "#f87171", "#f472b6", "#a78bfa", "#818cf8", "#e879f9"];

function Card({ item, level }: { item: SideSpell; level: number }) {
  const [open, setOpen] = useState(false);
  const color = LEVEL_COLORS[level] ?? "#9ca3af";
  const s = item.spell;

  if (!s) {
    return (
      <article className="rounded-2xl border border-dashed border-border bg-panel/60 p-3 text-sm" style={{ borderLeft: `4px solid ${color}` }}>
        <h3 className="font-display text-lg leading-tight">{item.name}</h3>
        <p className="mt-1 text-xs text-muted">Не найдено в каталоге заклинаний — описания нет. Проверьте написание названия (по-английски, как во вкладке «Заклинания»).</p>
      </article>
    );
  }

  const comps = [s.components.v && "В", s.components.s && "С", s.components.m && "М"].filter(Boolean).join(", ");
  const damage = [s.damageRoll, s.damageTypes.map((d) => label(DAMAGE_TYPES, d).toLowerCase()).join(", ")].filter(Boolean).join(" ");
  const long = s.desc.length > 360;

  return (
    <article className="rounded-2xl border border-border bg-panel p-3 shadow-md" style={{ borderLeft: `4px solid ${color}` }}>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="min-w-0 flex-1 font-display text-lg leading-tight">{s.name}</h3>
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${color}26`, color }}>
          {spellLevelLabel(s.level)} · {label(SCHOOLS, s.school).toLowerCase()}
        </span>
      </header>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">⏱ {label(CASTING_TIMES, s.castingTime)}</span>
        <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">📏 {s.range}{s.area ? ` · ${s.area}` : ""}</span>
        <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">⌛ {s.concentration ? "конц., " : ""}{s.duration}</span>
        {comps && <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">✋ {comps}</span>}
        {s.ritual && <span className="rounded-md border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-violet-300">ритуал</span>}
        {s.attack && <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">🎯 бросок атаки заклинанием</span>}
        {s.save && <span className="rounded-md border border-border bg-bg/60 px-2 py-0.5">🛡 спасбросок: {label(ABILITIES, s.save)}</span>}
        {damage && <span className="rounded-md border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-red-200">💥 {damage}</span>}
      </div>
      {s.material && <p className="mt-1 text-[11px] text-muted">Материал: {s.material}</p>}

      <div className="mt-2">
        <RichText text={s.desc} className={`space-y-1 text-sm leading-relaxed text-text/90 ${long && !open ? "line-clamp-5" : ""}`} />
        {s.higherLevel && open && (
          <div className="mt-2 text-sm">
            <span className="font-semibold italic">На более высоких кругах. </span>
            <RichText text={s.higherLevel} className="inline [&>p]:inline" />
          </div>
        )}
        {(long || s.higherLevel) && (
          <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => setOpen((v) => !v)}>
            {open ? "Свернуть" : "Показать полностью"}
          </button>
        )}
      </div>
    </article>
  );
}

/** Колонка карточек заклинаний: группы по кругам с заголовками, у каждого заклинания своя карточка с описанием. */
export function SpellSideCards({ title, groups, className = "" }: { title: string; groups: SideGroup[]; className?: string }) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  if (count === 0) return null;
  return (
    <aside className={className}>
      <h2 className="mb-2 px-1 font-display text-lg text-accent">
        {title} <span className="text-sm text-muted">· {count}</span>
      </h2>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <section key={g.level} className="space-y-3">
            <h3 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              {g.level === 0 ? "Заговоры" : `${g.level}-й круг`}
              {g.slots > 0 && ` · ячеек: ${g.slots}`}
            </h3>
            {g.items.map((it) => (
              <Card key={`${g.level}-${it.name}`} item={it} level={g.level} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
