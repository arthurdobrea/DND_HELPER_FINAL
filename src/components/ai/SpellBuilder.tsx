"use client";

import { useMemo, useState } from "react";
import type { Spell } from "@/lib/catalog";
import { CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, SCHOOLS } from "@/lib/catalog/labels";
import { SPELL_DAMAGE, SPELL_TEMPLATES, fill, higherLevelText, joinDesc, splitDesc, type TextBlock } from "@/lib/ai-blocks";
import { rid } from "@/lib/forge";
import { SpellCard } from "@/components/SpellCard";
import { Field, Toggles } from "@/components/ai/AiEditor";
import { BlockList, SaveBar, TemplatePalette } from "@/components/ai/BuilderParts";

const opts = (map: Record<string, string>) =>
  Object.entries(map).map(([k, v]) => (
    <option key={k} value={k}>
      {v}
    </option>
  ));
const SAVES: Record<string, string> = { strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение", intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма" };

/** Сборщик заклинания: параметры, механика с подсказкой урона по кругу, эффекты-блоки из шаблонов, живой предпросмотр. */
export function SpellBuilder({ initial, id }: { initial: Spell; id?: number }) {
  const [s, setS] = useState<Spell>(initial);
  const [blocks, setBlocks] = useState<TextBlock[]>(() => splitDesc(initial.desc));
  const set = (p: Partial<Spell>) => setS((x) => ({ ...x, ...p }));
  const preview = useMemo<Spell>(() => ({ ...s, desc: joinDesc(blocks) }), [s, blocks]);
  const rec = SPELL_DAMAGE[s.level] ?? SPELL_DAMAGE[1];
  const dmgWord = (DAMAGE_TYPES[s.damageTypes[0]] ?? "Огонь").toLowerCase();
  const input = "input w-full py-1 text-sm";

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_26rem]">
      {/* Палитра */}
      <aside className="card space-y-4 p-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:overflow-y-auto">
        <TemplatePalette
          title="Эффекты — клик добавляет блок"
          templates={SPELL_TEMPLATES}
          onAdd={(t) => setBlocks((b) => [...b, { id: rid(), title: t.title, text: fill(t.text, { single: rec.single, multi: rec.multi, dmg: dmgWord }) }])}
        />
        <p className="text-[11px] text-muted">
          Урон в шаблонах берётся по таблице DMG для {s.level ? `${s.level} круга` : "заговора"}: {rec.single} по одной цели, {rec.multi} по области. Тип — первый выбранный тип урона.
        </p>
      </aside>

      {/* Схема заклинания */}
      <div className="min-w-0 space-y-4">
        <section className="card space-y-3 p-4" style={{ borderTop: "3px solid var(--color-accent, #d4a95a)" }}>
          <input value={s.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Название заклинания…" className="input w-full py-2 font-display text-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <Field label="Время">
              <select value={s.castingTime} onChange={(e) => set({ castingTime: e.target.value })} className={input}>
                {opts(CASTING_TIMES)}
              </select>
            </Field>
            <Field label="Длительность">
              <input value={s.duration} onChange={(e) => set({ duration: e.target.value })} className={input} />
            </Field>
            <Field label="Дистанция">
              <input value={s.range} onChange={(e) => set({ range: e.target.value })} className={input} />
            </Field>
            <Field label="Область">
              <input value={s.area ?? ""} onChange={(e) => set({ area: e.target.value || null })} placeholder="сфера 20 фт." className={input} />
            </Field>
            {s.castingTime === "reaction" && (
              <Field label="Условие реакции" className="sm:col-span-2">
                <input value={s.reactionCondition ?? ""} onChange={(e) => set({ reactionCondition: e.target.value || null })} className={input} />
              </Field>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(
              [
                ["В", s.components.v, (v: boolean) => set({ components: { ...s.components, v } })],
                ["С", s.components.s, (v: boolean) => set({ components: { ...s.components, s: v } })],
                ["М", s.components.m, (v: boolean) => set({ components: { ...s.components, m: v } })],
                ["концентрация", s.concentration, (v: boolean) => set({ concentration: v })],
                ["ритуал", s.ritual, (v: boolean) => set({ ritual: v })],
              ] as const
            ).map(([label, val, fn]) => (
              <label key={label} className="flex items-center gap-1.5 text-muted">
                <input type="checkbox" checked={val} onChange={(e) => fn(e.target.checked)} /> {label}
              </label>
            ))}
            {s.components.m && <input value={s.material} onChange={(e) => set({ material: e.target.value })} placeholder="материальный компонент" className="input min-w-0 flex-1 py-1 text-sm" />}
          </div>
        </section>

        <section className="card space-y-3 p-4" style={{ borderLeft: "4px solid #a855f7", borderRadius: 0 }}>
          <h3 className="font-display text-lg">⚙️ Механика</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Спасбросок">
              <select value={s.save} onChange={(e) => set({ save: e.target.value })} className={input}>
                <option value="">нет</option>
                {opts(SAVES)}
              </select>
            </Field>
            <Field label="Урон (кости)">
              <input value={s.damageRoll} onChange={(e) => set({ damageRoll: e.target.value })} placeholder={rec.multi} className={input} />
            </Field>
            <label className="flex items-end gap-1.5 pb-1.5 text-sm text-muted">
              <input type="checkbox" checked={s.attack} onChange={(e) => set({ attack: e.target.checked })} /> бросок атаки
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Рекомендуемый урон для {s.level ? `${s.level} круга` : "заговора"}:
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => set({ damageRoll: rec.single })}>
              {rec.single} — одна цель
            </button>
            <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => set({ damageRoll: rec.multi })}>
              {rec.multi} — область
            </button>
          </div>
          <Field label="Типы урона">
            <Toggles map={DAMAGE_TYPES} value={s.damageTypes} onChange={(v) => set({ damageTypes: v })} />
          </Field>
          <Field label="Состояния">
            <Toggles map={CONDITIONS} value={s.conditions} onChange={(v) => set({ conditions: v })} />
          </Field>
          <Field label="Классы">
            <Toggles map={CLASSES} value={s.classes} onChange={(v) => set({ classes: v })} />
          </Field>
        </section>

        <section className="card space-y-2 p-4">
          <h3 className="font-display text-lg">📜 Эффекты и описание</h3>
          <BlockList blocks={blocks} onChange={setBlocks} />
        </section>

        <section className="card space-y-2 p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg">⬆️ На более высоких кругах</h3>
            <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" onClick={() => set({ higherLevel: higherLevelText(s.level, s.attack ? "1d10" : "1d6") })}>
              шаблон
            </button>
          </div>
          <textarea value={s.higherLevel} onChange={(e) => set({ higherLevel: e.target.value })} rows={3} className="input w-full resize-y text-sm leading-relaxed" />
        </section>
      </div>

      {/* Предпросмотр */}
      <aside className="space-y-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:overflow-y-auto">
        <SaveBar id={id} entity={{ kind: "spell", spell: preview }} />
        <SpellCard s={preview} />
      </aside>
    </div>
  );
}
