"use client";

import type { Item, Spell } from "@/lib/catalog";
import { SECTION_LABEL, abilityView, type ForgeAbility, type ForgeDraft, type Section } from "@/lib/forge";
import { lbl } from "@/components/npc/NpcParts";

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={lbl}>{label}</span>
      {children}
    </label>
  );
}

/** Набор переключаемых «чипов» (классы, типы урона, состояния). */
export function Toggles({ map, value, onChange }: { map: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(map).map(([k, v]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={`rounded border px-2 py-0.5 text-xs ${on ? "border-accent bg-panel-2 text-accent" : "border-border text-muted hover:text-text"}`}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Монстр ----------

/** Способность в редакторе: исходная (если не тронута — остаётся «умной», с пересчётом чисел) и редактируемый текст. */
export type AbilityRow = { id: string; section: Section; name: string; desc: string; orig: ForgeAbility | null; origName: string; origDesc: string };

export const rowsFromDraft = (d: ForgeDraft): AbilityRow[] =>
  d.abilities.map((a) => {
    const v = abilityView(d, a);
    return { id: a.id, section: a.section, name: v.name, desc: v.desc, orig: a, origName: v.name, origDesc: v.desc };
  });

/** Обратно в черновик: тронутые способности становятся обычным текстом, нетронутые остаются как были. */
export function applyRows(d: ForgeDraft, rows: AbilityRow[]): ForgeDraft {
  const abilities: ForgeAbility[] = rows
    .filter((r) => r.name.trim() || r.desc.trim())
    .map((r) => {
      const same = r.orig && r.name === r.origName && r.desc === r.origDesc;
      if (same && r.orig) return { ...r.orig, section: r.orig.kind === "spells" ? "special" : r.section } as ForgeAbility;
      return { id: r.id, kind: "text", section: r.section, name: r.name.trim() || "Способность", desc: r.desc, from: r.orig?.from };
    });
  return { ...d, abilities };
}

const area = "input w-full resize-y text-sm leading-relaxed";
const rowsFor = (t: string, min = 3) => Math.min(14, Math.max(min, Math.ceil(t.length / 90)));

/** Быстрая правка существа: только текст (имя, способности, мотивация, предыстория). Статы — в сборщике. */
export function MonsterText({ d, rows, onDraft, onRows }: { d: ForgeDraft; rows: AbilityRow[]; onDraft: (d: ForgeDraft) => void; onRows: (r: AbilityRow[]) => void }) {
  const set = (p: Partial<ForgeDraft>) => onDraft({ ...d, ...p });
  const setRow = (id: string, p: Partial<AbilityRow>) => onRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  return (
    <div className="space-y-3">
      <Field label="Имя">
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className="input w-full py-1 font-display text-lg" />
      </Field>
      <p className="text-xs text-muted">Нетронутые атаки и области пересчитываются сами. Если поправить текст способности, она станет обычным текстом и числа в ней будут ваши.</p>
      {rows.map((r) => (
        <div key={r.id} className="space-y-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-2">
            <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} className="input min-w-0 flex-1 py-1 text-sm font-semibold" />
            <span className="text-[11px] text-muted">{SECTION_LABEL[r.section]}</span>
          </div>
          <textarea value={r.desc} onChange={(e) => setRow(r.id, { desc: e.target.value })} rows={rowsFor(r.desc, 2)} className={area} />
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Мотивация">
          <textarea value={d.motivation} onChange={(e) => set({ motivation: e.target.value })} rows={3} className={area} />
        </Field>
        <Field label="Предыстория">
          <textarea value={d.backstory} onChange={(e) => set({ backstory: e.target.value })} rows={3} className={area} />
        </Field>
      </div>
    </div>
  );
}

/** Быстрая правка заклинания: название, описание и «на более высоких кругах». */
export function SpellText({ s, onChange }: { s: Spell; onChange: (s: Spell) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Название">
        <input value={s.name} onChange={(e) => onChange({ ...s, name: e.target.value })} maxLength={100} className="input w-full py-1 font-display text-lg" />
      </Field>
      <Field label="Описание">
        <textarea value={s.desc} onChange={(e) => onChange({ ...s, desc: e.target.value })} rows={rowsFor(s.desc, 8)} className={area} />
      </Field>
      <Field label="На более высоких кругах">
        <textarea value={s.higherLevel} onChange={(e) => onChange({ ...s, higherLevel: e.target.value })} rows={3} className={area} />
      </Field>
    </div>
  );
}

/** Быстрая правка предмета: название и описание. */
export function ItemText({ i, onChange }: { i: Item; onChange: (i: Item) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Название">
        <input value={i.name} onChange={(e) => onChange({ ...i, name: e.target.value })} maxLength={100} className="input w-full py-1 font-display text-lg" />
      </Field>
      <Field label="Описание">
        <textarea value={i.desc} onChange={(e) => onChange({ ...i, desc: e.target.value })} rows={rowsFor(i.desc, 10)} className={area} />
      </Field>
    </div>
  );
}
