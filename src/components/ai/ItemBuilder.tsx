"use client";

import { useMemo, useState } from "react";
import type { Item } from "@/lib/catalog";
import { DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES } from "@/lib/catalog/labels";
import { ITEM_TEMPLATES, WEAPON_PROPS, joinDesc, splitDesc, type TextBlock } from "@/lib/ai-blocks";
import { rid } from "@/lib/forge";
import { ItemCard } from "@/components/ItemCard";
import { Num } from "@/components/npc/NpcParts";
import { Field } from "@/components/ai/AiEditor";
import { BlockList, SaveBar, TemplatePalette } from "@/components/ai/BuilderParts";

const opts = (map: Record<string, string>) =>
  Object.entries(map).map(([k, v]) => (
    <option key={k} value={k}>
      {v}
    </option>
  ));
const ARMOR_CATS: Record<string, string> = { light: "Лёгкий", medium: "Средний", heavy: "Тяжёлый", shield: "Щит" };

/** Сборщик предмета: основа, блок оружия/доспеха, свойства-блоки из шаблонов, живой предпросмотр. */
export function ItemBuilder({ initial, id }: { initial: Item; id?: number }) {
  const [it, setIt] = useState<Item>(initial);
  const [blocks, setBlocks] = useState<TextBlock[]>(() => splitDesc(initial.desc));
  const set = (p: Partial<Item>) => setIt((x) => ({ ...x, ...p }));
  const preview = useMemo<Item>(() => ({ ...it, desc: joinDesc(blocks), priceEstimated: false }), [it, blocks]);
  const input = "input w-full py-1 text-sm";
  const w = it.weapon;
  const a = it.armor;

  return (
    <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_26rem]">
      {/* Палитра */}
      <aside className="card space-y-4 p-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:overflow-y-auto">
        <TemplatePalette title="Свойства — клик добавляет блок" templates={ITEM_TEMPLATES} onAdd={(t) => setBlocks((b) => [...b, { id: rid(), title: t.title, text: t.text }])} />
      </aside>

      {/* Схема предмета */}
      <div className="min-w-0 space-y-4">
        <section className="card space-y-3 p-4" style={{ borderTop: "3px solid var(--color-accent, #d4a95a)" }}>
          <input value={it.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Название предмета…" className="input w-full py-2 font-display text-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Категория">
              <select value={it.category} onChange={(e) => set({ category: e.target.value })} className={input}>
                {opts(ITEM_CATEGORIES)}
              </select>
            </Field>
            <Field label="Редкость">
              <select value={it.rarity ?? ""} onChange={(e) => set({ rarity: e.target.value || null, magic: !!e.target.value })} className={input}>
                <option value="">немагический</option>
                {opts(RARITIES)}
              </select>
            </Field>
            <Field label="Цена, зм">
              <Num value={it.price ?? 0} max={1000000} onChange={(n) => set({ price: n || null })} className="w-full" />
            </Field>
            <Field label="Вес, фнт.">
              <Num value={it.weight ?? 0} max={10000} onChange={(n) => set({ weight: n || null })} className="w-full" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5 text-muted">
              <input type="checkbox" checked={it.attunement} onChange={(e) => set({ attunement: e.target.checked })} /> требует настройки
            </label>
            {it.attunement && <input value={it.attunementDetail ?? ""} onChange={(e) => set({ attunementDetail: e.target.value || null })} placeholder="кем: волшебником, жрецом…" className="input py-1 text-sm" />}
            <span className="ml-auto flex gap-2">
              {!w && (
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => set({ weapon: { damage: "1d8", damageType: "slashing", kind: "martial", properties: [] } })}>
                  ⚔️ + Оружие
                </button>
              )}
              {!a && (
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => set({ armor: { ac: "14 + модификатор Ловкости (макс. 2)", category: "medium", stealthDisadvantage: false, strength: null } })}>
                  🛡️ + Доспех
                </button>
              )}
            </span>
          </div>
        </section>

        {w && (
          <section className="card space-y-3 p-4" style={{ borderLeft: "4px solid #ef4444", borderRadius: 0 }}>
            <div className="flex items-center">
              <h3 className="font-display text-lg">⚔️ Оружие</h3>
              <button type="button" className="ml-auto text-xs text-muted hover:text-red-400" onClick={() => set({ weapon: null })}>
                убрать
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Урон">
                <input value={w.damage} onChange={(e) => set({ weapon: { ...w, damage: e.target.value } })} placeholder="1d8" className={input} />
              </Field>
              <Field label="Тип урона">
                <select value={w.damageType} onChange={(e) => set({ weapon: { ...w, damageType: e.target.value } })} className={input}>
                  {opts(DAMAGE_TYPES)}
                </select>
              </Field>
              <Field label="Вид">
                <select value={w.kind ?? ""} onChange={(e) => set({ weapon: { ...w, kind: (e.target.value || null) as "simple" | "martial" | null } })} className={input}>
                  <option value="">—</option>
                  <option value="simple">простое</option>
                  <option value="martial">воинское</option>
                </select>
              </Field>
            </div>
            <Field label="Свойства (клик — вкл/выкл)">
              <div className="flex flex-wrap gap-1">
                {WEAPON_PROPS.map((p) => {
                  const cur = w.properties.find((x) => x.name === p.name);
                  return (
                    <span key={p.name} className="inline-flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          set({ weapon: { ...w, properties: cur ? w.properties.filter((x) => x.name !== p.name) : [...w.properties, { name: p.name, detail: p.detail ?? null, desc: "" }] } })
                        }
                        className={`rounded border px-2 py-0.5 text-xs ${cur ? "border-accent bg-panel-2 text-accent" : "border-border text-muted hover:text-text"}`}
                      >
                        {p.name}
                      </button>
                      {cur && p.detail && (
                        <input
                          value={cur.detail ?? ""}
                          onChange={(e) => set({ weapon: { ...w, properties: w.properties.map((x) => (x.name === p.name ? { ...x, detail: e.target.value || null } : x)) } })}
                          className="input ml-0.5 w-16 px-1 py-0 text-xs"
                        />
                      )}
                    </span>
                  );
                })}
              </div>
            </Field>
          </section>
        )}

        {a && (
          <section className="card space-y-3 p-4" style={{ borderLeft: "4px solid #38bdf8", borderRadius: 0 }}>
            <div className="flex items-center">
              <h3 className="font-display text-lg">🛡️ Доспех</h3>
              <button type="button" className="ml-auto text-xs text-muted hover:text-red-400" onClick={() => set({ armor: null })}>
                убрать
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="КД" className="sm:col-span-2">
                <input value={a.ac} onChange={(e) => set({ armor: { ...a, ac: e.target.value } })} className={input} />
              </Field>
              <Field label="Тип">
                <select value={a.category} onChange={(e) => set({ armor: { ...a, category: e.target.value } })} className={input}>
                  {opts(ARMOR_CATS)}
                </select>
              </Field>
              <Field label="Требуемая Сила">
                <Num value={a.strength ?? 0} max={30} onChange={(n) => set({ armor: { ...a, strength: n || null } })} className="w-full" />
              </Field>
            </div>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={a.stealthDisadvantage} onChange={(e) => set({ armor: { ...a, stealthDisadvantage: e.target.checked } })} /> помеха к Скрытности
            </label>
          </section>
        )}

        <section className="card space-y-2 p-4">
          <h3 className="font-display text-lg">📜 Свойства и описание</h3>
          <BlockList blocks={blocks} onChange={setBlocks} />
        </section>
      </div>

      {/* Предпросмотр */}
      <aside className="space-y-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:overflow-y-auto">
        <SaveBar id={id} entity={{ kind: "item", item: preview }} />
        <ItemCard i={preview} />
      </aside>
    </div>
  );
}
