"use client";

import { useEffect, useState } from "react";
import { ABILITY_KEYS, type AbilityKey } from "@/lib/character";
import { DAMAGE_TYPES } from "@/lib/catalog/labels";
import { crText, profBonus } from "@/lib/cr";
import { ABIL_FULL, DMG_KEYS, SECTION_LABEL, USAGES, attackNumbers, diceAvg, saveDc, type ForgeAbility, type ForgeDraft, type Section, type SpellAbility } from "@/lib/forge";

export const STORE_KEY = "dnd-helper:forge-draft:v1";

export type MonsterHit = { key: string; name: string; typeLabel: string; crLabel: string; hp: number; ac: number; source: string };
export type AbilityHit = { monster: string; monsterKey: string; cr: number; section: Section; name: string; desc: string };
export type SpellHit = { name: string; level: number; school: string; key: string };

export const lbl = "mb-1 block text-xs uppercase tracking-wide text-muted";
/** Текст в основном на английском — его стоит перевести. */
export const looksEnglish = (s: string) => {
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  const cyr = (s.match(/[А-Яа-яЁё]/g) ?? []).length;
  return latin >= 3 && latin > cyr;
};
export const needsTranslation = (a: ForgeAbility) => a.kind === "text" && (looksEnglish(a.name) || looksEnglish(a.desc));

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Num({ value, onChange, min = 0, max = 999, className = "w-16" }: { value: number; onChange: (n: number) => void; min?: number; max?: number; className?: string }) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))}
      className={`input px-2 py-1 text-center ${className}`}
    />
  );
}

/** Выпадающий список, который дописывает выбранное слово в текстовое поле. */
export function AppendSelect({ options, onPick }: { options: Record<string, string>; onPick: (word: string) => void }) {
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="rounded border border-border bg-panel-2 px-1 py-0.5 text-[11px] text-muted"
      aria-label="Добавить из списка"
    >
      <option value="">＋ из списка</option>
      {Object.values(options).map((v) => (
        <option key={v} value={v.toLowerCase()}>
          {v}
        </option>
      ))}
    </select>
  );
}

// ---------- Редакторы способностей ----------

function SectionSelect({ value, onChange, only }: { value: Section; onChange: (s: Section) => void; only: Section[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Section)} className="input py-1 text-xs" aria-label="Раздел">
      {only.map((s) => (
        <option key={s} value={s}>
          {SECTION_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function AbilSelect({ value, onChange, only }: { value: AbilityKey; onChange: (k: AbilityKey) => void; only?: readonly AbilityKey[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AbilityKey)} className="input py-1 text-xs">
      {(only ?? ABILITY_KEYS).map((k) => (
        <option key={k} value={k}>
          {ABIL_FULL[k]}
        </option>
      ))}
    </select>
  );
}

function DmgSelect({ value, onChange }: { value: string; onChange: (k: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-1 text-xs">
      {DMG_KEYS.map((k) => (
        <option key={k} value={k}>
          {DAMAGE_TYPES[k] ?? k}
        </option>
      ))}
    </select>
  );
}

function UsageSelect({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input py-1 text-xs" aria-label="Ограничение">
      {USAGES.map((u) => (
        <option key={u} value={u}>
          {u || "без ограничений"}
        </option>
      ))}
    </select>
  );
}

export function SpellEditor({ a, onChange }: { a: SpellAbility; onChange: (a: SpellAbility) => void }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const dq = useDebounced(q);
  const [hits, setHits] = useState<SpellHit[]>([]);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/spells/search?${new URLSearchParams({ q: dq, level })}`, { signal: ctl.signal })
      .then((r) => r.json() as Promise<{ items: SpellHit[] }>)
      .then((d) => setHits(d.items))
      .catch(() => {});
    return () => ctl.abort();
  }, [dq, level]);

  const add = (h: SpellHit) => {
    if (a.spells.some((s) => s.name === h.name)) return;
    onChange({ ...a, spells: [...a.spells, { name: h.name, level: h.level, usage: "slot" }] });
  };
  const slotLevels = [...new Set(a.spells.filter((s) => s.level > 0 && s.usage === "slot").map((s) => s.level))].sort((x, y) => x - y);

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">Базовая характеристика</span>
        <AbilSelect value={a.abil} onChange={(k) => onChange({ ...a, abil: k as "int" | "wis" | "cha" })} only={["int", "wis", "cha"]} />
      </label>

      <div className="flex flex-wrap gap-1">
        {a.spells.map((s, i) => (
          <span key={s.name} className="inline-flex items-center gap-1 rounded-full border border-border bg-panel-2 py-0.5 pl-2 pr-1 text-xs">
            <span className="text-muted">{s.level === 0 ? "з" : s.level}</span> {s.name}
            {s.level > 0 && (
              <select
                value={s.usage}
                onChange={(e) => onChange({ ...a, spells: a.spells.map((x, j) => (j === i ? { ...x, usage: e.target.value as typeof s.usage } : x)) })}
                className="rounded bg-bg/40 px-0.5 text-[11px]"
                aria-label={`Как используется ${s.name}`}
              >
                <option value="slot">ячейка</option>
                <option value="will">по желанию</option>
                <option value="1">1/день</option>
                <option value="2">2/день</option>
                <option value="3">3/день</option>
              </select>
            )}
            <button type="button" className="px-1 text-muted hover:text-red-400" onClick={() => onChange({ ...a, spells: a.spells.filter((_, j) => j !== i) })} aria-label="Убрать заклинание">
              ✕
            </button>
          </span>
        ))}
        {a.spells.length === 0 && <span className="text-xs text-muted">Найдите заклинания ниже и нажмите на них.</span>}
      </div>

      {slotLevels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Ячейки:</span>
          {slotLevels.map((l) => (
            <label key={l} className="flex items-center gap-1">
              {l} круг
              <Num value={a.slots[l - 1] ?? 0} min={0} max={9} className="w-12" onChange={(n) => onChange({ ...a, slots: a.slots.map((x, j) => (j === l - 1 ? n : x)) })} />
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Заклинание: fireball, shield…" className="input min-w-0 flex-1 py-1 text-sm" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-28 py-1 text-sm" aria-label="Круг">
          <option value="">любой круг</option>
          <option value="0">заговоры</option>
          {Array.from({ length: 9 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1} круг
            </option>
          ))}
        </select>
      </div>
      <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {hits.map((h) => (
          <li key={h.key}>
            <button type="button" onClick={() => add(h)} className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-panel-2">
              <span className="w-12 shrink-0 text-muted">{h.level === 0 ? "заговор" : `${h.level} круг`}</span>
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <span className="text-accent">＋</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="p-2 text-center text-xs text-muted">Ничего не найдено</li>}
      </ul>
    </div>
  );
}

/** Поля редактирования одной способности (без рамки) — используется и в списке, и в инспекторе сборщика. */
export function AbilityBody({ a, d, onChange, lanes }: { a: ForgeAbility; d: ForgeDraft; onChange: (a: ForgeAbility) => void; lanes?: Section[] }) {
  const attack = a.kind === "attack" ? a : null;
  const save = a.kind === "save" ? a : null;
  const txt = a.kind === "text" ? a : null;
  const upd = (patch: Record<string, unknown>) => onChange({ ...a, ...patch } as ForgeAbility);
  return (
    <div className="space-y-2 text-sm">
      {attack && (
        <p className="rounded bg-bg/40 px-2 py-1 text-xs text-muted">
          {signed(attackNumbers(d, attack).toHit)} к попаданию · урон ≈ {attackNumbers(d, attack).dmg} (бонус мастерства {signed(profBonus(d.cr))})
        </p>
      )}
      {save && (
        <p className="rounded bg-bg/40 px-2 py-1 text-xs text-muted">
          Сл {saveDc(d, save)} · урон ≈ {diceAvg(save.dice)}
        </p>
      )}
        {a.kind !== "spells" && (
          <div className="flex flex-wrap items-center gap-2">
            <input value={a.name} onChange={(e) => onChange({ ...a, name: e.target.value } as ForgeAbility)} maxLength={80} className="input min-w-0 flex-1 py-1" aria-label="Название" />
            <SectionSelect
              value={a.section}
              onChange={(s) => onChange({ ...a, section: s } as ForgeAbility)}
              only={lanes ?? (a.kind === "attack" || a.kind === "save" ? ["action", "bonus", "reaction", "legendary"] : ["special", "action", "bonus", "reaction", "legendary"])}
            />
          </div>
        )}

        {txt && <textarea value={txt.desc} onChange={(e) => onChange({ ...txt, desc: e.target.value })} rows={5} className="input w-full resize-y text-sm" aria-label="Описание" />}

        {attack && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Характеристика</span>
              <AbilSelect value={attack.abil} onChange={(k) => upd({ abil: k })} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">{attack.ranged ? "Дистанция" : "Досягаемость"}</span>
              <input value={attack.reach} onChange={(e) => upd({ reach: e.target.value })} placeholder={attack.ranged ? "80/320 фт." : "5 фт."} className="input min-w-0 flex-1 py-1" />
            </label>
            <div className="flex flex-wrap gap-3 text-xs sm:col-span-2">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={attack.ranged} onChange={(e) => upd({ ranged: e.target.checked })} /> дальнобойная
              </label>
              <label className="flex items-center gap-1" title="Заклинательная атака: к урону не прибавляется модификатор">
                <input type="checkbox" checked={attack.spell} onChange={(e) => upd({ spell: e.target.checked })} /> заклинанием
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Урон</span>
              <input value={attack.dice} onChange={(e) => upd({ dice: e.target.value })} placeholder="2d8" className="input w-20 py-1" />
              <DmgSelect value={attack.dmgType} onChange={(k) => upd({ dmgType: k })} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Доп. урон</span>
              <input value={attack.extraDice} onChange={(e) => upd({ extraDice: e.target.value })} placeholder="напр. 1d6" className="input w-20 py-1" />
              <DmgSelect value={attack.extraType} onChange={(k) => upd({ extraType: k })} />
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <span className="w-24 text-muted">Ограничение</span>
              <UsageSelect value={attack.usage} onChange={(u) => upd({ usage: u })} />
            </label>
          </div>
        )}

        {save && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Сл от</span>
              <AbilSelect value={save.dcAbil} onChange={(k) => upd({ dcAbil: k })} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Спасбросок</span>
              <AbilSelect value={save.saveAbil} onChange={(k) => upd({ saveAbil: k })} />
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <span className="w-24 text-muted">Область</span>
              <input value={save.shape} onChange={(e) => upd({ shape: e.target.value })} placeholder="конус 30 фт. / сфера 20 фт. радиусом" className="input min-w-0 flex-1 py-1" />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-24 text-muted">Урон</span>
              <input value={save.dice} onChange={(e) => upd({ dice: e.target.value })} placeholder="8d6" className="input w-20 py-1" />
              <DmgSelect value={save.dmgType} onChange={(k) => upd({ dmgType: k })} />
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={save.half} onChange={(e) => upd({ half: e.target.checked })} /> половина урона при успехе
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <span className="w-24 text-muted">Доп. эффект</span>
              <input value={save.effect} onChange={(e) => upd({ effect: e.target.value })} placeholder="напр. Цели поджигаются" className="input min-w-0 flex-1 py-1" />
            </label>
            <label className="flex items-center gap-2 text-xs sm:col-span-2">
              <span className="w-24 text-muted">Ограничение</span>
              <UsageSelect value={save.usage} onChange={(u) => upd({ usage: u })} />
            </label>
          </div>
        )}

        {a.kind === "spells" && <SpellEditor a={a} onChange={onChange} />}
    </div>
  );
}

// ---------- Поиск способностей в бестиарии ----------

export function DonorSearch({ onAdd, added, replacing = false }: { onAdd: (h: AbilityHit) => void; added: Set<string>; replacing?: boolean }) {
  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [inDesc, setInDesc] = useState(false);
  const dq = useDebounced(q, 300);
  const [res, setRes] = useState<{ total: number; items: AbilityHit[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dq.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс результатов при пустом запросе
      setRes(null);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    fetch(`/api/monsters/abilities?${new URLSearchParams({ q: dq, section, inDesc: inDesc ? "1" : "" })}`, { signal: ctl.signal })
      .then((r) => r.json() as Promise<{ total: number; items: AbilityHit[] }>)
      .then((d) => {
        setRes(d);
        setLoading(false);
      })
      .catch((e) => e.name !== "AbortError" && setLoading(false));
    return () => ctl.abort();
  }, [dq, section, inDesc]);

  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Способность или монстр: fire, spear, efreeti, mage…" className="input w-full" />
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <select value={section} onChange={(e) => setSection(e.target.value)} className="input py-1 text-xs" aria-label="Раздел">
          <option value="">все разделы</option>
          {(Object.keys(SECTION_LABEL) as Section[]).map((s) => (
            <option key={s} value={s}>
              {SECTION_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" checked={inDesc} onChange={(e) => setInDesc(e.target.checked)} /> искать и в тексте
        </label>
        <span className="ml-auto text-muted">{loading ? "ищу…" : res ? `найдено ${res.total}${res.total > res.items.length ? `, первые ${res.items.length}` : ""}` : "введите минимум 2 буквы"}</span>
      </div>
      <p className="text-[11px] text-muted">Если ввести имя монстра — покажутся все его способности. Числа в чужих способностях не пересчитываются.</p>
      <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {res?.items.map((h, i) => {
          const id = `${h.monsterKey}|${h.section}|${h.name}`;
          const has = added.has(id);
          return (
            <li
              key={`${id}|${i}`}
              className="cursor-grab px-3 py-2"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-forge", JSON.stringify({ t: "donor", hit: h }));
                e.dataTransfer.effectAllowed = "copyMove";
              }}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{h.name}</span>
                <span className="tag shrink-0">{SECTION_LABEL[h.section]}</span>
                <button type="button" className="btn px-2 py-0.5 text-xs" disabled={has && !replacing} onClick={() => onAdd(h)}>
                  {replacing ? "⇄ заменить" : has ? "✓" : "＋"}
                </button>
              </div>
              <div className="text-[11px] text-muted">
                {h.monster} · CR {crText(h.cr)}
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer truncate text-muted">{h.desc.replace(/\\n/g, " ").slice(0, 110)}…</summary>
                <p className="mt-1 whitespace-pre-line">{h.desc.replace(/\\n/g, "\n")}</p>
              </details>
            </li>
          );
        })}
        {res && res.items.length === 0 && <li className="p-4 text-center text-sm text-muted">Ничего не найдено</li>}
      </ul>
    </div>
  );
}

// ---------- Выбор основы ----------

export function BasePicker({ onPick, busy }: { onPick: (key: string) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [hits, setHits] = useState<MonsterHit[]>([]);
  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/monsters/search?${new URLSearchParams({ q: dq })}`, { signal: ctl.signal })
      .then((r) => r.json() as Promise<{ items: MonsterHit[] }>)
      .then((d) => setHits(d.items))
      .catch(() => {});
    return () => ctl.abort();
  }, [dq]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Основа: mage, efreeti, knight…" className="input w-full py-1.5 text-sm" />
      <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {hits.map((h) => (
          <li key={h.key}>
            <button type="button" disabled={busy} onClick={() => onPick(h.key)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2 disabled:opacity-50">
              <span className="w-10 shrink-0 text-center font-mono text-muted">CR {h.crLabel}</span>
              <span className="min-w-0 flex-1 truncate">
                {h.name} <span className="text-muted">· {h.typeLabel} · КД {h.ac} · хиты {h.hp}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
