"use client";

import { ABILITY_KEYS, ABILITY_LABELS, SKILLS, type AbilityKey } from "@/lib/character";
import { ALIGN_LAW, ALIGN_MORAL, CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, ITEM_CATEGORIES, MONSTER_TYPES, RARITIES, SCHOOLS, SIZES } from "@/lib/catalog/labels";
import type { Item, Spell } from "@/lib/catalog";
import { CR_LIST, crText } from "@/lib/cr";
import { SECTION_LABEL, abilityView, rid, type ForgeAbility, type ForgeDraft, type Section } from "@/lib/forge";
import { Num, lbl } from "@/components/npc/NpcParts";

const SECTIONS: Section[] = ["special", "action", "bonus", "reaction", "legendary"];

const opts = (map: Record<string, string>) =>
  Object.entries(map).map(([k, v]) => (
    <option key={k} value={k}>
      {v}
    </option>
  ));

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={lbl}>{label}</span>
      {children}
    </label>
  );
}

/** Набор переключаемых «чипов» (классы, типы урона, состояния). */
function Toggles({ map, value, onChange }: { map: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
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

export function MonsterFields({ d, rows, onDraft, onRows }: { d: ForgeDraft; rows: AbilityRow[]; onDraft: (d: ForgeDraft) => void; onRows: (r: AbilityRow[]) => void }) {
  const set = (p: Partial<ForgeDraft>) => onDraft({ ...d, ...p });
  const setRow = (id: string, p: Partial<AbilityRow>) => onRows(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const input = "input w-full py-1 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Имя" className="sm:col-span-2">
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className={`${input} font-display text-lg`} />
        </Field>
        <Field label="Размер">
          <select value={d.size} onChange={(e) => set({ size: e.target.value })} className={input}>
            {opts(SIZES)}
          </select>
        </Field>
        <Field label="Тип">
          <select value={d.type} onChange={(e) => set({ type: e.target.value })} className={input}>
            {opts(MONSTER_TYPES)}
          </select>
        </Field>
        <Field label="Закон">
          <select value={d.law} onChange={(e) => set({ law: e.target.value })} className={input}>
            <option value="">любое</option>
            {opts(ALIGN_LAW)}
          </select>
        </Field>
        <Field label="Мораль">
          <select value={d.moral} onChange={(e) => set({ moral: e.target.value })} className={input}>
            <option value="">любая</option>
            {opts(ALIGN_MORAL)}
          </select>
        </Field>
        <Field label="CR">
          <select value={d.cr} onChange={(e) => set({ cr: Number(e.target.value) })} className={input}>
            {CR_LIST.map((c) => (
              <option key={c} value={c}>
                {crText(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Атак за действие">
          <Num value={d.multiattack} min={1} max={8} onChange={(n) => set({ multiattack: n })} className="w-full" />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="КД">
          <Num value={d.ac} min={1} max={40} onChange={(n) => set({ ac: n })} className="w-full" />
        </Field>
        <Field label="Хиты">
          <Num value={d.hp} min={1} max={9999} onChange={(n) => set({ hp: n })} className="w-full" />
        </Field>
        <Field label="Доспех" className="sm:col-span-2">
          <input value={d.armorDesc} onChange={(e) => set({ armorDesc: e.target.value })} placeholder="природный доспех" className={input} />
        </Field>
        <Field label="Скорость, фт.">
          <Num value={d.speed.walk} max={400} onChange={(n) => set({ speed: { ...d.speed, walk: n } })} className="w-full" />
        </Field>
        <Field label="Полёт">
          <Num value={d.speed.fly} max={400} onChange={(n) => set({ speed: { ...d.speed, fly: n } })} className="w-full" />
        </Field>
        <Field label="Плавание">
          <Num value={d.speed.swim} max={400} onChange={(n) => set({ speed: { ...d.speed, swim: n } })} className="w-full" />
        </Field>
        <Field label="Лазание">
          <Num value={d.speed.climb} max={400} onChange={(n) => set({ speed: { ...d.speed, climb: n } })} className="w-full" />
        </Field>
        <Field label="Копание">
          <Num value={d.speed.burrow} max={400} onChange={(n) => set({ speed: { ...d.speed, burrow: n } })} className="w-full" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {ABILITY_KEYS.map((k: AbilityKey) => (
          <Field key={k} label={ABILITY_LABELS[k].short}>
            <Num value={d.scores[k]} min={1} max={30} onChange={(n) => set({ scores: { ...d.scores, [k]: n } })} className="w-full" />
          </Field>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Спасброски с владением">
          <Toggles map={Object.fromEntries(ABILITY_KEYS.map((k) => [k, ABILITY_LABELS[k].short]))} value={d.saves} onChange={(v) => set({ saves: v as AbilityKey[] })} />
        </Field>
        <Field label="Навыки с владением">
          <Toggles map={Object.fromEntries(SKILLS.map((s) => [s.key, s.label]))} value={d.skills} onChange={(v) => set({ skills: v as ForgeDraft["skills"] })} />
        </Field>
        <Field label="Уязвимости">
          <input value={d.vulnerabilities} onChange={(e) => set({ vulnerabilities: e.target.value })} className={input} />
        </Field>
        <Field label="Сопротивления">
          <input value={d.resistances} onChange={(e) => set({ resistances: e.target.value })} className={input} />
        </Field>
        <Field label="Иммунитет к урону">
          <input value={d.immunities} onChange={(e) => set({ immunities: e.target.value })} className={input} />
        </Field>
        <Field label="Иммунитет к состояниям">
          <input value={d.conditionImmunities} onChange={(e) => set({ conditionImmunities: e.target.value })} className={input} />
        </Field>
        <Field label="Чувства">
          <input value={d.senses} onChange={(e) => set({ senses: e.target.value })} className={input} />
        </Field>
        <Field label="Языки">
          <input value={d.languages} onChange={(e) => set({ languages: e.target.value })} className={input} />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`${lbl} mb-0`}>Способности (текст)</span>
          <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" onClick={() => onRows([...rows, { id: rid(), section: "action", name: "", desc: "", orig: null, origName: "", origDesc: "" }])}>
            ＋ Способность
          </button>
        </div>
        <p className="text-xs text-muted">Нетронутые атаки и области пересчитываются сами (бонус, Сл, урон). Если вы правите текст способности, она становится обычным текстом и числа считаете вы.</p>
        {rows.map((r) => (
          <div key={r.id} className="card space-y-2 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} placeholder="Название" className="input min-w-0 flex-1 py-1 text-sm font-semibold" />
              {r.orig?.kind === "spells" ? (
                <span className="text-xs text-muted">Особенность</span>
              ) : (
                <select value={r.section} onChange={(e) => setRow(r.id, { section: e.target.value as Section })} className="input py-1 text-sm">
                  {SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {SECTION_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="text-muted hover:text-red-400" title="Удалить способность" onClick={() => onRows(rows.filter((x) => x.id !== r.id))}>
                ✕
              </button>
            </div>
            <textarea value={r.desc} onChange={(e) => setRow(r.id, { desc: e.target.value })} rows={Math.min(10, Math.max(3, Math.ceil(r.desc.length / 90)))} className="input w-full resize-y text-sm leading-relaxed" />
          </div>
        ))}
        {d.abilities.some((a) => a.section === "legendary") || rows.some((r) => r.section === "legendary") ? (
          <Field label="Вступление к легендарным действиям (пусто — стандартный текст)">
            <textarea value={d.legendaryDesc} onChange={(e) => set({ legendaryDesc: e.target.value })} rows={2} className="input w-full resize-y text-sm" />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Мотивация">
          <textarea value={d.motivation} onChange={(e) => set({ motivation: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
        </Field>
        <Field label="Предыстория">
          <textarea value={d.backstory} onChange={(e) => set({ backstory: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
        </Field>
      </div>
    </div>
  );
}

// ---------- Заклинание ----------

export function SpellFields({ s, onChange }: { s: Spell; onChange: (s: Spell) => void }) {
  const set = (p: Partial<Spell>) => onChange({ ...s, ...p });
  const input = "input w-full py-1 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Название" className="sm:col-span-2">
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className={`${input} font-display text-lg`} />
        </Field>
        <Field label="Круг">
          <select value={s.level} onChange={(e) => set({ level: Number(e.target.value) })} className={input}>
            <option value={0}>Заговор</option>
            {Array.from({ length: 9 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} круг
              </option>
            ))}
          </select>
        </Field>
        <Field label="Школа">
          <select value={s.school} onChange={(e) => set({ school: e.target.value })} className={input}>
            {opts(SCHOOLS)}
          </select>
        </Field>
        <Field label="Время накладывания">
          <select value={s.castingTime} onChange={(e) => set({ castingTime: e.target.value })} className={input}>
            {opts(CASTING_TIMES)}
          </select>
        </Field>
        <Field label="Условие реакции">
          <input value={s.reactionCondition ?? ""} onChange={(e) => set({ reactionCondition: e.target.value || null })} className={input} />
        </Field>
        <Field label="Дистанция">
          <input value={s.range} onChange={(e) => set({ range: e.target.value })} className={input} />
        </Field>
        <Field label="Область">
          <input value={s.area ?? ""} onChange={(e) => set({ area: e.target.value || null })} className={input} />
        </Field>
        <Field label="Длительность">
          <input value={s.duration} onChange={(e) => set({ duration: e.target.value })} className={input} />
        </Field>
        <Field label="Спасбросок">
          <select value={s.save} onChange={(e) => set({ save: e.target.value })} className={input}>
            <option value="">нет</option>
            {opts({ strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение", intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма" })}
          </select>
        </Field>
        <Field label="Урон (кости)">
          <input value={s.damageRoll} onChange={(e) => set({ damageRoll: e.target.value })} placeholder="8d6" className={input} />
        </Field>
        <Field label="Материал">
          <input value={s.material} onChange={(e) => set({ material: e.target.value })} className={input} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {(
          [
            ["Концентрация", s.concentration, (v: boolean) => set({ concentration: v })],
            ["Ритуал", s.ritual, (v: boolean) => set({ ritual: v })],
            ["Бросок атаки", s.attack, (v: boolean) => set({ attack: v })],
            ["В — вербальный", s.components.v, (v: boolean) => set({ components: { ...s.components, v } })],
            ["С — соматический", s.components.s, (v: boolean) => set({ components: { ...s.components, s: v } })],
            ["М — материальный", s.components.m, (v: boolean) => set({ components: { ...s.components, m: v } })],
          ] as const
        ).map(([label, val, fn]) => (
          <label key={label} className="flex items-center gap-1.5 text-muted">
            <input type="checkbox" checked={val} onChange={(e) => fn(e.target.checked)} /> {label}
          </label>
        ))}
      </div>
      <Field label="Классы">
        <Toggles map={CLASSES} value={s.classes} onChange={(v) => set({ classes: v })} />
      </Field>
      <Field label="Типы урона">
        <Toggles map={DAMAGE_TYPES} value={s.damageTypes} onChange={(v) => set({ damageTypes: v })} />
      </Field>
      <Field label="Накладываемые состояния">
        <Toggles map={CONDITIONS} value={s.conditions} onChange={(v) => set({ conditions: v })} />
      </Field>
      <Field label="Описание">
        <textarea value={s.desc} onChange={(e) => set({ desc: e.target.value })} rows={10} className="input w-full resize-y text-sm leading-relaxed" />
      </Field>
      <Field label="На более высоких кругах">
        <textarea value={s.higherLevel} onChange={(e) => set({ higherLevel: e.target.value })} rows={3} className="input w-full resize-y text-sm leading-relaxed" />
      </Field>
    </div>
  );
}

// ---------- Предмет ----------

export function ItemFields({ i, onChange }: { i: Item; onChange: (i: Item) => void }) {
  const set = (p: Partial<Item>) => onChange({ ...i, ...p });
  const input = "input w-full py-1 text-sm";
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Название" className="sm:col-span-2">
          <input value={i.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} className={`${input} font-display text-lg`} />
        </Field>
        <Field label="Категория">
          <select value={i.category} onChange={(e) => set({ category: e.target.value })} className={input}>
            {opts(ITEM_CATEGORIES)}
          </select>
        </Field>
        <Field label="Редкость">
          <select value={i.rarity ?? ""} onChange={(e) => set({ rarity: e.target.value || null, magic: !!e.target.value })} className={input}>
            <option value="">немагический</option>
            {opts(RARITIES)}
          </select>
        </Field>
        <Field label="Цена, зм">
          <Num value={i.price ?? 0} max={1000000} onChange={(n) => set({ price: n || null, priceEstimated: false })} className="w-full" />
        </Field>
        <Field label="Вес, фнт.">
          <Num value={i.weight ?? 0} max={10000} onChange={(n) => set({ weight: n || null })} className="w-full" />
        </Field>
        <label className="flex items-end gap-1.5 pb-1.5 text-sm text-muted">
          <input type="checkbox" checked={i.attunement} onChange={(e) => set({ attunement: e.target.checked })} /> Требует настройки
        </label>
        <Field label="Кем настраивается">
          <input value={i.attunementDetail ?? ""} onChange={(e) => set({ attunementDetail: e.target.value || null })} placeholder="волшебником" className={input} />
        </Field>
      </div>
      {i.weapon && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Урон">
            <input value={i.weapon.damage} onChange={(e) => set({ weapon: { ...i.weapon!, damage: e.target.value } })} className={input} />
          </Field>
          <Field label="Тип урона">
            <select value={i.weapon.damageType} onChange={(e) => set({ weapon: { ...i.weapon!, damageType: e.target.value } })} className={input}>
              {opts(DAMAGE_TYPES)}
            </select>
          </Field>
          <Field label="Вид">
            <select value={i.weapon.kind ?? ""} onChange={(e) => set({ weapon: { ...i.weapon!, kind: (e.target.value || null) as "simple" | "martial" | null } })} className={input}>
              <option value="">—</option>
              <option value="simple">простое</option>
              <option value="martial">воинское</option>
            </select>
          </Field>
        </div>
      )}
      {i.armor && (
        <Field label="Класс доспеха">
          <input value={i.armor.ac} onChange={(e) => set({ armor: { ...i.armor!, ac: e.target.value } })} className={input} />
        </Field>
      )}
      <Field label="Описание">
        <textarea value={i.desc} onChange={(e) => set({ desc: e.target.value })} rows={12} className="input w-full resize-y text-sm leading-relaxed" />
      </Field>
    </div>
  );
}
