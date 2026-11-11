"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createForgedNpc, translateTexts, updateForgedNpc } from "@/app/forge-actions";
import { ABILITY_KEYS, SKILLS, mod, type AbilityKey } from "@/lib/character";
import { ALIGN_LAW, ALIGN_MORAL, DAMAGE_TYPES, MONSTER_CONDITIONS, MONSTER_TYPES, SIZES } from "@/lib/catalog/labels";
import { CR_LIST, crText, estimateCr, profBonus } from "@/lib/cr";
import {
  ABIL_FULL,
  DMG_KEYS,
  SECTION_LABEL,
  USAGES,
  attackNumbers,
  diceAvg,
  blankDraft,
  buildMonster,
  draftFromMonster,
  hitDice,
  multiattackCount,
  rid,
  saveDc,
  textAbility,
  type ForgeAbility,
  type ForgeDraft,
  type Section,
  type SpellAbility,
} from "@/lib/forge";
import type { Monster } from "@/lib/open5e";
import { StatBlock } from "@/components/StatBlock";

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

function AbilityEditor({
  a,
  d,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  a: ForgeAbility;
  d: ForgeDraft;
  index: number;
  total: number;
  onChange: (a: ForgeAbility) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const kindIcon = { text: "📜", attack: "⚔️", save: "💥", spells: "✨" }[a.kind];
  let summary = "";
  if (a.kind === "attack") {
    const n = attackNumbers(d, a);
    summary = `${signed(n.toHit)} к попаданию · ~${n.dmg} урона`;
  } else if (a.kind === "save") summary = `Сл ${saveDc(d, a)} · ~${diceAvg(a.dice)} урона`;
  else if (a.kind === "spells") summary = `${a.spells.length} заклинаний`;


  return (
    <details className="rounded-xl border border-border bg-panel-2/40" open={a.kind !== "text" && !a.from}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
        <span>{kindIcon}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{a.kind === "spells" ? "Использование заклинаний" : a.name}</span>
        <span className="hidden text-xs text-muted sm:inline">{summary}</span>
        <span className="tag shrink-0">{a.kind === "spells" ? "Особенность" : SECTION_LABEL[a.section]}</span>
        {a.from && <span className="hidden text-[11px] text-muted md:inline">из {a.from}</span>}
        <span className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
          <button type="button" className="px-1 text-muted hover:text-text disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Выше">
            ↑
          </button>
          <button type="button" className="px-1 text-muted hover:text-text disabled:opacity-30" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Ниже">
            ↓
          </button>
          <button type="button" className="px-1 text-muted hover:text-red-400" onClick={onRemove} aria-label="Удалить способность">
            ✕
          </button>
        </span>
      </summary>

      <div className="border-t border-border px-3 py-3">
        <AbilityBody a={a} d={d} onChange={onChange} />
      </div>
    </details>
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

// ---------- Конструктор ----------

/** editId — id NPC, которого правим (черновик берётся из базы, а не из браузера). */
export function NpcForge({ initial, editId }: { initial?: ForgeDraft; editId?: number } = {}) {
  const [d, setD] = useState<ForgeDraft>(() => initial ?? blankDraft());
  const [tab, setTab] = useState<"donor" | "own">("donor");
  const [baseBusy, setBaseBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const loaded = useRef(false);

  // Черновик хранится в браузере: перезагрузка страницы его не теряет.
  useEffect(() => {
    if (editId) {
      loaded.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только на клиенте
      if (raw) setD({ ...blankDraft(), ...(JSON.parse(raw) as ForgeDraft) });
    } catch {}
    loaded.current = true;
  }, [editId]);
  useEffect(() => {
    if (!loaded.current || editId) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(d));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [d, editId]);

  const set = (patch: Partial<ForgeDraft>) => setD((p) => ({ ...p, ...patch }));
  const monster = useMemo(() => buildMonster(d), [d]);
  const est = useMemo(() => estimateCr(monster, d.multiattack), [monster, d.multiattack]);
  const pb = profBonus(d.cr);

  const [donorAdded, setDonorAdded] = useState<Set<string>>(new Set());

  const [translating, setTranslating] = useState(false);
  const [transNote, setTransNote] = useState<string | null>(null);

  /** Переводит названия и тексты переданных способностей; правки пользователя, сделанные за это время, не затираются. */
  async function translateAbilities(list: ForgeAbility[]) {
    const items = list.filter((a): a is Extract<ForgeAbility, { kind: "text" }> => a.kind === "text" && needsTranslation(a));
    if (items.length === 0) return;
    setTranslating(true);
    setTransNote(null);
    try {
      const map = await translateTexts(items.flatMap((a) => [a.name, a.desc]));
      let changed = 0;
      setD((p) => ({
        ...p,
        abilities: p.abilities.map((x) => {
          const orig = items.find((i) => i.id === x.id);
          if (!orig || x.kind !== "text") return x;
          const name = x.name === orig.name ? (map[orig.name] ?? x.name) : x.name;
          const desc = x.desc === orig.desc ? (map[orig.desc] ?? x.desc) : x.desc;
          if (name !== x.name || desc !== x.desc) changed++;
          return { ...x, name, desc };
        }),
      }));
      if (changed < items.length) setTransNote("Часть текстов перевести не удалось (сервис перевода недоступен или занят) — повторите позже.");
    } catch {
      setTransNote("Не удалось перевести — сервис перевода недоступен.");
    } finally {
      setTranslating(false);
    }
  }

  function addDonor(h: AbilityHit) {
    const ab = textAbility(h.section, h.name, h.desc, h.monster);
    void translateAbilities([ab]);
    const next = new Set(donorAdded).add(`${h.monsterKey}|${h.section}|${h.name}`);
    setDonorAdded(next);
    setD((p) => ({
      ...p,
      abilities: [...p.abilities, ab],
      multiattack: /multiattack|мультиатак/i.test(h.name) ? Math.max(p.multiattack, multiattackCount(h.desc)) : p.multiattack,
    }));
  }

  function addOwn(kind: "attack" | "save" | "spells" | "trait" | "reaction" | "legendary") {
    const common = { id: rid(), from: undefined };
    let ab: ForgeAbility;
    if (kind === "attack") ab = { ...common, kind: "attack", section: "action", name: "Новая атака", ranged: false, spell: false, abil: "str", reach: "5 фт.", dice: "2d8", dmgType: "piercing", extraDice: "", extraType: "fire", usage: "" };
    else if (kind === "save") ab = { ...common, kind: "save", section: "action", name: "Новая область", dcAbil: "con", saveAbil: "dex", shape: "конус 30 фт.", dice: "8d6", dmgType: "fire", half: true, effect: "", usage: "Перезарядка 5–6" };
    else if (kind === "spells") {
      if (d.abilities.some((a) => a.kind === "spells")) return;
      ab = { ...common, kind: "spells", section: "special", name: "Использование заклинаний", abil: "int", slots: Array(9).fill(0), spells: [] };
    } else if (kind === "reaction") ab = { ...common, kind: "text", section: "reaction", name: "Новая реакция", desc: "" };
    else if (kind === "legendary") ab = { ...common, kind: "text", section: "legendary", name: "Новое легендарное действие", desc: "" };
    else ab = { ...common, kind: "text", section: "special", name: "Новая особенность", desc: "" };
    setD((p) => ({ ...p, abilities: [...p.abilities, ab] }));
  }

  async function pickBase(key: string) {
    if (d.abilities.length > 0 && !confirm("Основа заменит характеристики и ВСЕ способности в конструкторе (имя и предыстория останутся). Продолжить?")) return;
    setBaseBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/monsters/detail?${new URLSearchParams({ key })}`);
      if (!r.ok) throw new Error("Не удалось загрузить основу");
      const { entry } = (await r.json()) as { entry: Monster };
      const next = draftFromMonster(entry, d);
      setD((p) => ({ ...next, name: p.name, backstory: p.backstory, motivation: p.motivation }));
      setDonorAdded(new Set());
      void translateAbilities(next.abilities);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки основы");
    } finally {
      setBaseBusy(false);
    }
  }

  const patchAbility = (id: string, a: ForgeAbility) => setD((p) => ({ ...p, abilities: p.abilities.map((x) => (x.id === id ? a : x)) }));
  const removeAbility = (id: string) => setD((p) => ({ ...p, abilities: p.abilities.filter((x) => x.id !== id) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((p) => {
      const list = [...p.abilities];
      const j = i + dir;
      if (j < 0 || j >= list.length) return p;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...p, abilities: list };
    });

  function submit() {
    setError(null);
    if (!d.name.trim()) {
      setError("Укажите имя NPC");
      return;
    }
    start(async () => {
      try {
        if (editId) {
          await updateForgedNpc(editId, d);
        } else {
          await createForgedNpc(d);
          try {
            localStorage.removeItem(STORE_KEY);
          } catch {}
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось создать NPC");
      }
    });
  }

  const crDiff = Math.abs(CR_LIST.indexOf(est.cr) - CR_LIST.indexOf(d.cr));
  const append = (field: "vulnerabilities" | "resistances" | "immunities" | "conditionImmunities", word: string) =>
    set({ [field]: d[field] ? `${d[field]}, ${word}` : word } as Partial<ForgeDraft>);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)_minmax(0,30rem)]">
      {/* ---------- 1. Ядро ---------- */}
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg text-accent">1. Ядро</h2>
          <button
            type="button"
            className={`btn ml-auto px-2 py-1 text-xs ${editId ? "hidden" : ""}`}
            onClick={() => {
              if (confirm("Очистить конструктор и начать с нуля?")) {
                setD(blankDraft());
                setDonorAdded(new Set());
              }
            }}
          >
            ⟲ Сбросить
          </button>
        </div>

        <label className="block">
          <span className={lbl}>Имя</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Например: Ифрит-воин Каззар" className="input w-full" />
        </label>

        <details className="rounded-lg border border-border bg-bg/40 p-2" open={!d.baseName}>
          <summary className="cursor-pointer text-sm">
            Основа: <b>{d.baseName || "с нуля"}</b> <span className="text-xs text-muted">— выбрать другую</span>
          </summary>
          <div className="mt-2">
            <BasePicker onPick={pickBase} busy={baseBusy} />
          </div>
        </details>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={lbl}>Размер</span>
            <select value={d.size} onChange={(e) => set({ size: e.target.value })} className="input w-full py-1">
              <option value="">Любой</option>
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>Тип</span>
            <select value={d.type} onChange={(e) => set({ type: e.target.value })} className="input w-full py-1">
              <option value="">Любой</option>
              {Object.entries(MONSTER_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>Порядок</span>
            <select value={d.law} onChange={(e) => set({ law: e.target.value })} className="input w-full py-1">
              <option value="">Любой</option>
              {Object.entries(ALIGN_LAW).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={lbl}>Мораль</span>
            <select value={d.moral} onChange={(e) => set({ moral: e.target.value })} className="input w-full py-1">
              <option value="">Любой</option>
              {Object.entries(ALIGN_MORAL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className={lbl}>КД</span>
            <Num value={d.ac} min={1} max={40} className="w-full" onChange={(n) => set({ ac: n })} />
          </label>
          <label className="block">
            <span className={lbl}>Хиты</span>
            <Num value={d.hp} min={1} max={9999} className="w-full" onChange={(n) => set({ hp: n })} />
          </label>
          <div className="block">
            <span className={lbl}>Кости хитов</span>
            <div className="py-1.5 text-center text-sm text-muted">{hitDice(d)}</div>
          </div>
        </div>
        <input value={d.armorDesc} onChange={(e) => set({ armorDesc: e.target.value })} maxLength={80} placeholder="Доспех (необязательно): латы, природная броня…" className="input w-full py-1 text-sm" />

        <div>
          <span className={lbl}>Скорость, фт.</span>
          <div className="grid grid-cols-5 gap-1 text-center text-[11px] text-muted">
            {(["walk", "fly", "swim", "climb", "burrow"] as const).map((k) => (
              <label key={k}>
                {{ walk: "ходьба", fly: "полёт", swim: "плавание", climb: "лазание", burrow: "копание" }[k]}
                <Num value={d.speed[k]} max={400} className="w-full" onChange={(n) => set({ speed: { ...d.speed, [k]: n } })} />
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className={lbl}>Характеристики · спасброски (☑ — владеет)</span>
          <div className="grid grid-cols-3 gap-2">
            {ABILITY_KEYS.map((k) => (
              <div key={k} className="rounded-lg border border-border bg-bg/40 p-1.5 text-center">
                <div className="text-[11px] uppercase text-muted">{ABIL_FULL[k].slice(0, 3)}</div>
                <Num value={d.scores[k]} min={1} max={30} className="w-full" onChange={(n) => set({ scores: { ...d.scores, [k]: n } })} />
                <div className="mt-0.5 text-xs">
                  {signed(mod(d.scores[k]))}
                  <label className="ml-2 inline-flex items-center gap-0.5 text-muted" title="Спасбросок с бонусом мастерства">
                    <input type="checkbox" checked={d.saves.includes(k)} onChange={(e) => set({ saves: e.target.checked ? [...d.saves, k] : d.saves.filter((x) => x !== k) })} />
                    {signed(mod(d.scores[k]) + (d.saves.includes(k) ? pb : 0))}
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className={lbl}>Навыки (владеет, бонус мастерства {signed(pb)})</span>
          <div className="flex flex-wrap gap-1">
            {SKILLS.map((s) => {
              const on = d.skills.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ skills: on ? d.skills.filter((x) => x !== s.key) : [...d.skills, s.key] })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-text"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {(
          [
            ["resistances", "Сопротивление урону", DAMAGE_TYPES],
            ["immunities", "Иммунитет к урону", DAMAGE_TYPES],
            ["vulnerabilities", "Уязвимость к урону", DAMAGE_TYPES],
            ["conditionImmunities", "Иммунитет к состояниям", MONSTER_CONDITIONS],
          ] as const
        ).map(([field, title, opts]) => (
          <label key={field} className="block">
            <span className={`${lbl} flex items-center gap-2`}>
              {title} <AppendSelect options={opts} onPick={(w) => append(field, w)} />
            </span>
            <input value={d[field]} onChange={(e) => set({ [field]: e.target.value } as Partial<ForgeDraft>)} maxLength={200} className="input w-full py-1 text-sm" />
          </label>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={lbl}>Чувства</span>
            <input value={d.senses} onChange={(e) => set({ senses: e.target.value })} maxLength={200} placeholder="тёмное зрение 60 фт." className="input w-full py-1 text-sm" />
          </label>
          <label className="block">
            <span className={lbl}>Языки</span>
            <input value={d.languages} onChange={(e) => set({ languages: e.target.value })} maxLength={200} placeholder="Общий, Игнан" className="input w-full py-1 text-sm" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg/40 p-2">
          <label className="block">
            <span className={lbl}>Целевой CR</span>
            <select value={d.cr} onChange={(e) => set({ cr: Number(e.target.value) })} className="input w-full py-1">
              {CR_LIST.map((c) => (
                <option key={c} value={c}>
                  {crText(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="block" title="Сколько атак за действие даёт мультиатака (для оценки CR)">
            <span className={lbl}>Атак за ход</span>
            <Num value={d.multiattack} min={1} max={8} className="w-full" onChange={(n) => set({ multiattack: n })} />
          </label>
          <p className="col-span-2 text-[11px] text-muted">От CR зависят бонус мастерства ({signed(pb)}) и числа в ваших атаках, областях и заклинаниях.</p>
        </div>

        <label className="block">
          <span className={lbl}>Предыстория</span>
          <textarea value={d.backstory} onChange={(e) => set({ backstory: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
        </label>
        <label className="block">
          <span className={lbl}>Мотивация</span>
          <textarea value={d.motivation} onChange={(e) => set({ motivation: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
        </label>
      </section>

      {/* ---------- 2. Способности ---------- */}
      <section className="card flex min-w-0 flex-col gap-3 p-4">
        <h2 className="font-display text-lg text-accent">2. Способности</h2>
        <div className="flex gap-1">
          {(
            [
              ["donor", "🐲 Из монстров"],
              ["own", "✍️ Свои"],
            ] as const
          ).map(([k, text]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-sm ${tab === k ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
              {text}
            </button>
          ))}
        </div>

        {tab === "donor" ? (
          <DonorSearch onAdd={addDonor} added={donorAdded} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["attack", "⚔️ Атака", "Бонус попадания и урон считаются от характеристики и CR"],
                ["save", "💥 Область со спасброском", "Дыхание, взрыв, аура: Сл считается сама"],
                ["spells", "✨ Заклинания", "Из каталога: заговоры, ячейки, по желанию, N/день"],
                ["trait", "📜 Особенность", "Пассивное умение, текст пишете сами"],
                ["reaction", "↩️ Реакция", "Текст пишете сами"],
                ["legendary", "👑 Легендарное действие", "Текст пишете сами"],
              ] as const
            ).map(([k, text, hint]) => (
              <button key={k} type="button" onClick={() => addOwn(k)} disabled={k === "spells" && d.abilities.some((a) => a.kind === "spells")} className="btn flex-col items-start gap-0.5 px-3 py-2 text-left disabled:opacity-50">
                <span>{text}</span>
                <span className="text-[11px] font-normal text-muted">{hint}</span>
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm uppercase tracking-wide text-muted">Добавлено ({d.abilities.length})</h3>
            {(translating || d.abilities.some(needsTranslation)) && (
              <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" disabled={translating} onClick={() => void translateAbilities(d.abilities)} title="Перевести на русский способности, которые ещё на английском">
                {translating ? "Перевожу…" : `🌐 Перевести (${d.abilities.filter(needsTranslation).length})`}
              </button>
            )}
          </div>
          {transNote && <p className="mb-2 text-xs text-amber-300">{transNote}</p>}
          {d.abilities.length === 0 ? (
            <p className="text-sm text-muted">Пока пусто. Выберите основу слева или добавьте способности — они сразу появятся в статблоке справа.</p>
          ) : (
            <div className="space-y-2">
              {d.abilities.map((a, i) => (
                <AbilityEditor key={a.id} a={a} d={d} index={i} total={d.abilities.length} onChange={(x) => patchAbility(a.id, x)} onRemove={() => removeAbility(a.id)} onMove={(dir) => move(i, dir)} />
              ))}
            </div>
          )}
          {d.abilities.some((a) => a.section === "legendary") && (
            <label className="mt-3 block">
              <span className={lbl}>Текст о легендарных действиях (пусто — стандартный)</span>
              <textarea value={d.legendaryDesc} onChange={(e) => set({ legendaryDesc: e.target.value })} rows={2} className="input w-full resize-y text-sm" />
            </label>
          )}
        </div>
      </section>

      {/* ---------- 3. Превью ---------- */}
      <section className="min-w-0 space-y-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg text-accent">3. Оценка CR</h2>
            <span className="text-sm">
              цель <b>{crText(d.cr)}</b> · оценка <b className={crDiff <= 1 ? "text-emerald-300" : "text-amber-300"}>≈ {crText(est.cr)}</b>
            </span>
            {est.cr !== d.cr && (
              <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" onClick={() => set({ cr: est.cr })}>
                принять {crText(est.cr)}
              </button>
            )}
          </div>
          <p className="text-xs text-muted">
            защита CR {crText(est.defCr)} (хиты {d.hp}, КД {d.ac}) · атака CR {crText(est.offCr)} (урон за раунд ≈ {est.dpr}
            {est.offBy === "attack" ? `, попадание ${signed(est.offValue)}` : est.offBy === "save" ? `, Сл ${est.offValue}` : ""})
          </p>
          {crDiff > 1 && <p className="text-xs text-amber-300">Оценка заметно отличается от цели — подправьте хиты, КД или урон либо примите оценку.</p>}
          {est.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              ⚠ {n}
            </p>
          ))}
          <p className="text-[11px] text-muted">Метод DMG 2014: ориентир, а не точный расчёт.</p>
        </div>

        <StatBlock m={monster} lang="ru" />

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="button" className="btn btn-primary w-full py-2.5 text-base" disabled={pending} onClick={submit}>
          {pending ? (editId ? "Сохраняю…" : "Собираю лист…") : editId ? "💾 Сохранить изменения" : "🎭 Создать NPC"}
        </button>
        <p className="text-xs text-muted">
          {editId
            ? "При сохранении пересчитаются характеристики, КД, хиты, атаки, особенности и заклинания листа. Снаряжение, монеты, заметки личности и текущие хиты (не выше нового максимума) останутся."
            : "Лист соберётся из этого статблока (как у обычного NPC), его можно будет править. Черновик хранится в браузере до создания."}
        </p>
      </section>
    </div>
  );
}
