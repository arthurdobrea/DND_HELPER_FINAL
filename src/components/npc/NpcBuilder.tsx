"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { createForgedNpc, translateTexts, updateForgedNpc } from "@/app/forge-actions";
import { ABILITY_KEYS, SKILLS, mod } from "@/lib/character";
import { ALIGN_LAW, ALIGN_MORAL, DAMAGE_TYPES, MONSTER_CONDITIONS, MONSTER_TYPES, SIZES } from "@/lib/catalog/labels";
import { CR_LIST, crText, estimateCr, profBonus } from "@/lib/cr";
import {
  ABIL_FULL,
  DMG_ADJ,
  SECTION_LABEL,
  attackNumbers,
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
  type SpellEntry,
} from "@/lib/forge";
import { TEMPLATES, type Template } from "@/lib/forge-templates";
import type { Monster } from "@/lib/open5e";
import { StatBlock } from "@/components/StatBlock";
import { SuggestPanel } from "@/components/npc/SuggestPanel";
import { profileOf, profileOfAbility } from "@/lib/suggest";
import {
  AbilSelect,
  AbilityBody,
  AppendSelect,
  BasePicker,
  DonorSearch,
  Num,
  STORE_KEY,
  lbl,
  needsTranslation,
  signed,
  useDebounced,
  type AbilityHit,
  type SpellHit,
} from "@/components/npc/NpcParts";

// ---------- Дорожки и цвета ----------

const LANES: { id: Section; icon: string; title: string; hint: string; color: string }[] = [
  { id: "action", icon: "⚔️", title: "Действия", hint: "Что делает в свой ход", color: "#f87171" },
  { id: "bonus", icon: "⚡", title: "Бонусные действия", hint: "Быстрые умения", color: "#fbbf24" },
  { id: "reaction", icon: "↩️", title: "Реакции", hint: "Ответ вне своего хода", color: "#38bdf8" },
  { id: "special", icon: "🛡️", title: "Особенности", hint: "Пассивные умения и ауры", color: "#34d399" },
  { id: "legendary", icon: "👑", title: "Легендарные действия", hint: "В конце чужих ходов", color: "#c084fc" },
];
const NO_ADDED = new Set<string>();
const LANE_COLOR = Object.fromEntries(LANES.map((l) => [l.id, l.color])) as Record<Section, string>;

const DMG_COLOR: Record<string, string> = {
  fire: "#f97316", cold: "#38bdf8", lightning: "#facc15", acid: "#a3e635", poison: "#4ade80", necrotic: "#a78bfa",
  radiant: "#fde047", psychic: "#f472b6", force: "#818cf8", thunder: "#94a3b8", piercing: "#cbd5e1", slashing: "#cbd5e1", bludgeoning: "#cbd5e1",
};
const GUESS: [RegExp, string][] = [
  [/огн|пламен|fire|flame/i, "fire"], [/холод|мороз|лёд|льд|cold|frost/i, "cold"], [/электр|молни|lightning/i, "lightning"],
  [/кислот|acid/i, "acid"], [/яд|poison/i, "poison"], [/некрот|necrotic/i, "necrotic"], [/излуч|radiant/i, "radiant"],
  [/психич|psychic/i, "psychic"], [/силов|force/i, "force"], [/звук|гром|thunder/i, "thunder"],
];
const guessColor = (a: ForgeAbility): string => {
  if (a.kind === "attack" || a.kind === "save") return DMG_COLOR[a.dmgType] ?? LANE_COLOR[a.section];
  if (a.kind === "text") {
    const hit = GUESS.find(([re]) => re.test(`${a.name} ${a.desc}`));
    if (hit) return DMG_COLOR[hit[1]];
  }
  return LANE_COLOR[a.section];
};

const allowedLanes = (a: ForgeAbility): Section[] => (a.kind === "text" ? ["action", "bonus", "reaction", "special", "legendary"] : a.kind === "spells" ? ["special"] : ["action", "bonus", "reaction", "legendary"]);
const fitSection = (a: ForgeAbility, wanted: Section): Section => (allowedLanes(a).includes(wanted) ? wanted : a.section);

function subtitle(a: ForgeAbility, d: ForgeDraft): string {
  if (a.kind === "attack") {
    const n = attackNumbers(d, a);
    return `${signed(n.toHit)} к попаданию · ${a.dice}${n.dmgBonus ? signed(n.dmgBonus) : ""} ${DMG_ADJ[a.dmgType] ?? ""}${a.extraDice ? ` + ${a.extraDice}` : ""}${a.usage ? ` · ${a.usage}` : ""}`;
  }
  if (a.kind === "save") return `Сл ${saveDc(d, a)} · ${a.dice} ${DMG_ADJ[a.dmgType] ?? ""} · ${a.shape}${a.usage ? ` · ${a.usage}` : ""}`;
  if (a.kind === "text") return a.desc.replace(/\s+/g, " ").slice(0, 70) || "без описания";
  return "";
}
const kindIcon = (a: ForgeAbility) => ({ text: "📜", attack: "⚔️", save: "💥", spells: "✨" })[a.kind];

type Payload = { t: "move"; id: string } | { t: "donor"; hit: AbilityHit } | { t: "tpl"; id: string } | { t: "spell"; hit: SpellHit };
const setPayload = (e: DragEvent, p: Payload) => {
  e.dataTransfer.setData("application/x-forge", JSON.stringify(p));
  e.dataTransfer.effectAllowed = "copyMove";
};

// ---------- Блок ----------

function Block({
  a, d, selected, replacing, onSelect, onReplace, onRemove, onDropBefore, setOver,
}: {
  a: ForgeAbility;
  d: ForgeDraft;
  selected: boolean;
  replacing: boolean;
  onSelect: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onDropBefore: (e: DragEvent) => void;
  setOver: (v: { lane: Section; before?: string } | null) => void;
}) {
  const color = guessColor(a);
  return (
    <div
      draggable
      onDragStart={(e) => setPayload(e, { t: "move", id: a.id })}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver({ lane: a.section, before: a.id });
      }}
      onDrop={onDropBefore}
      onClick={onSelect}
      style={{ borderLeft: `4px solid ${color}` }}
      className={`cursor-grab rounded-xl border border-border bg-panel-2/70 p-2.5 pl-3 transition hover:bg-panel-2 ${selected ? "ring-2 ring-accent" : ""} ${replacing ? "outline-dashed outline-2 outline-accent" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{kindIcon(a)}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{a.name}</div>
          <div className="truncate text-xs text-muted">{subtitle(a, d)}</div>
          {a.from && <div className="text-[10px] text-muted/80">из «{a.from}»</div>}
        </div>
        <button type="button" className="rounded px-1 text-muted hover:bg-bg/50 hover:text-accent" title="Заменить другим блоком" onClick={(e) => { e.stopPropagation(); onReplace(); }}>
          ⇄
        </button>
        <button type="button" className="rounded px-1 text-muted hover:bg-bg/50 hover:text-red-400" title="Убрать" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------- Книга заклинаний ----------

const USAGE_ORDER: SpellEntry["usage"][] = ["slot", "will", "1", "2", "3"];
const usageText = (u: SpellEntry["usage"]) => (u === "slot" ? "ячейка" : u === "will" ? "по желанию" : `${u}/день`);

function Spellbook({ a, onChange, onDropSpell }: { a: SpellAbility | undefined; onChange: (a: SpellAbility) => void; onDropSpell: (e: DragEvent) => void }) {
  const [over, setOver] = useState(false);
  const spells = a?.spells ?? [];
  const levels = [...new Set(spells.map((s) => s.level))].sort((x, y) => x - y);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDropSpell(e);
      }}
      className={`rounded-2xl border p-3 ${over ? "border-accent bg-accent/5" : "border-border bg-panel"}`}
      style={{ borderTop: "3px solid #a78bfa" }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg">✨ Книга заклинаний</h3>
        <span className="text-xs text-muted">{spells.length} шт.</span>
        {a && (
          <label className="ml-auto flex items-center gap-1 text-xs text-muted">
            характеристика
            <AbilSelect value={a.abil} onChange={(k) => onChange({ ...a, abil: k as "int" | "wis" | "cha" })} only={["int", "wis", "cha"]} />
          </label>
        )}
      </div>
      {spells.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">Перетащите заклинания из каталога слева или нажмите на них. Здесь они сгруппируются по кругам.</p>}
      <div className="space-y-2">
        {a &&
          levels.map((l) => {
            const inLevel = spells.map((s, i) => ({ s, i })).filter(({ s }) => s.level === l);
            const hasSlots = l > 0 && inLevel.some(({ s }) => s.usage === "slot");
            return (
              <div key={l} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-muted">{l === 0 ? "заговоры" : `${l} круг`}</span>
                {inLevel.map(({ s, i }) => (
                  <span key={s.name} className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/10 py-0.5 pl-2.5 pr-1 text-xs">
                    {s.name}
                    {l > 0 && (
                      <button
                        type="button"
                        title="Нажмите, чтобы сменить: ячейка → по желанию → N/день"
                        className="rounded bg-bg/40 px-1 text-[10px] text-muted hover:text-text"
                        onClick={() => onChange({ ...a, spells: a.spells.map((x, j) => (j === i ? { ...x, usage: USAGE_ORDER[(USAGE_ORDER.indexOf(x.usage) + 1) % USAGE_ORDER.length] } : x)) })}
                      >
                        {usageText(s.usage)}
                      </button>
                    )}
                    <button type="button" className="px-1 text-muted hover:text-red-400" aria-label={`Убрать ${s.name}`} onClick={() => onChange({ ...a, spells: a.spells.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </span>
                ))}
                {hasSlots && (
                  <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
                    ячеек
                    <Num value={a.slots[l - 1] ?? 0} min={0} max={9} className="w-12" onChange={(n) => onChange({ ...a, slots: a.slots.map((x, j) => (j === l - 1 ? n : x)) })} />
                  </label>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ---------- Каталог ----------

function SpellPalette({ onAdd }: { onAdd: (h: SpellHit) => void }) {
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
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 fireball, shield, misty step…" className="input min-w-0 flex-1 py-1.5 text-sm" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="input w-24 py-1 text-sm" aria-label="Круг">
          <option value="">все</option>
          <option value="0">заговоры</option>
          {Array.from({ length: 9 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1} круг
            </option>
          ))}
        </select>
      </div>
      <ul className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {hits.map((h) => (
          <li key={h.key} draggable onDragStart={(e) => setPayload(e, { t: "spell", hit: h })} className="cursor-grab">
            <button type="button" onClick={() => onAdd(h)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-panel-2">
              <span className="w-12 shrink-0 text-muted">{h.level === 0 ? "заговор" : `${h.level} круг`}</span>
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              <span className="text-accent">＋</span>
            </button>
          </li>
        ))}
        {hits.length === 0 && <li className="p-3 text-center text-xs text-muted">Ничего не найдено</li>}
      </ul>
    </div>
  );
}

function TemplatePalette({ onPick, replacing }: { onPick: (t: Template) => void; replacing: boolean }) {
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  return (
    <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g}>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-muted">{g}</h4>
          <div className="grid gap-1.5">
            {TEMPLATES.filter((t) => t.group === g).map((t) => (
              <button
                key={t.id}
                type="button"
                draggable
                onDragStart={(e) => setPayload(e, { t: "tpl", id: t.id })}
                onClick={() => onPick(t)}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-panel-2/50 px-2.5 py-1.5 text-left hover:border-accent"
              >
                <span className="text-lg">{t.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.title}</span>
                  <span className="block truncate text-[11px] text-muted">{t.hint}</span>
                </span>
                <span className="text-xs text-accent">{replacing ? "⇄" : "＋"}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Сборщик ----------

export function NpcBuilder({ initial, editId }: { initial?: ForgeDraft; editId?: number } = {}) {
  const [d, setD] = useState<ForgeDraft>(() => initial ?? blankDraft());
  const [palTab, setPalTab] = useState<"base" | "tip" | "donor" | "spell" | "tpl">(initial ? "tip" : "base");
  const [rightTab, setRightTab] = useState<"inspect" | "stat">("inspect");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [over, setOver] = useState<{ lane: Section; before?: string } | null>(null);
  const [baseBusy, setBaseBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [pending, start] = useTransition();
  const loaded = useRef(false);

  // Черновик сборщика (общий с ИИ-кузницей) (если не правим готового NPC).
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
  const profile = useMemo(() => profileOf(d), [d]);
  const spellbook = d.abilities.find((a): a is SpellAbility => a.kind === "spells");
  const selected = d.abilities.find((a) => a.id === selectedId && a.kind !== "spells") ?? null;
  const replaceTarget = d.abilities.find((a) => a.id === replaceId) ?? null;

  // ----- Перевод способностей из бестиария -----
  async function translateAbilities(list: ForgeAbility[]) {
    const items = list.filter((a): a is Extract<ForgeAbility, { kind: "text" }> => a.kind === "text" && needsTranslation(a));
    if (items.length === 0) return;
    setTranslating(true);
    setNote(null);
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
      if (changed < items.length) setNote("Часть текстов перевести не удалось — повторите позже.");
    } catch {
      setNote("Не удалось перевести — сервис перевода недоступен.");
    } finally {
      setTranslating(false);
    }
  }

  // ----- Операции над блоками -----
  function insert(ab: ForgeAbility, lane?: Section, beforeId?: string) {
    const placed = { ...ab, section: lane ? fitSection(ab, lane) : ab.section } as ForgeAbility;
    setD((p) => {
      const list = [...p.abilities];
      const at = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
      if (at >= 0) list.splice(at, 0, placed);
      else list.push(placed);
      return { ...p, abilities: list };
    });
    setSelectedId(placed.id);
    setRightTab("inspect");
    if (ab.kind === "text") void translateAbilities([placed]);
  }
  const move = (id: string, lane: Section, beforeId?: string) =>
    setD((p) => {
      const cur = p.abilities.find((x) => x.id === id);
      if (!cur || id === beforeId) return p;
      const rest = p.abilities.filter((x) => x.id !== id);
      const moved = { ...cur, section: fitSection(cur, lane) } as ForgeAbility;
      const at = beforeId ? rest.findIndex((x) => x.id === beforeId) : -1;
      if (at >= 0) rest.splice(at, 0, moved);
      else rest.push(moved);
      return { ...p, abilities: rest };
    });
  const replaceWith = (ab: ForgeAbility, extra?: Partial<ForgeDraft>) => {
    if (!replaceId) return;
    setD((p) => {
      const i = p.abilities.findIndex((x) => x.id === replaceId);
      if (i < 0) return p;
      const list = [...p.abilities];
      list[i] = { ...ab, section: fitSection(ab, list[i].section) } as ForgeAbility;
      return { ...p, ...extra, abilities: list };
    });
    setSelectedId(ab.id);
    setReplaceId(null);
    if (ab.kind === "text") void translateAbilities([ab]);
  };
  const patchAbility = (a: ForgeAbility) => setD((p) => ({ ...p, abilities: p.abilities.map((x) => (x.id === a.id ? a : x)) }));
  const removeAbility = (id: string) => {
    setD((p) => ({ ...p, abilities: p.abilities.filter((x) => x.id !== id) }));
    if (selectedId === id) setSelectedId(null);
    if (replaceId === id) setReplaceId(null);
  };
  const duplicate = (a: ForgeAbility) => insert({ ...a, id: rid(), name: `${a.name} (копия)` } as ForgeAbility, a.section);

  function addSpell(h: SpellHit) {
    setD((p) => {
      const book = p.abilities.find((x): x is SpellAbility => x.kind === "spells");
      const entry: SpellEntry = { name: h.name, level: h.level, usage: "slot" };
      if (book) {
        if (book.spells.some((s) => s.name === h.name)) return p;
        return { ...p, abilities: p.abilities.map((x) => (x.id === book.id ? { ...book, spells: [...book.spells, entry] } : x)) };
      }
      const created: SpellAbility = { id: rid(), kind: "spells", section: "special", name: "Использование заклинаний", abil: "int", slots: Array(9).fill(0), spells: [entry] };
      return { ...p, abilities: [...p.abilities, created] };
    });
  }

  function fromDonor(h: AbilityHit): ForgeAbility {
    return textAbility(h.section, h.name, h.desc, h.monster);
  }
  const mult = (h: { name: string; desc: string }) => (/multiattack|мультиатак/i.test(h.name) ? { multiattack: Math.max(d.multiattack, multiattackCount(h.desc)) } : undefined);

  function pickDonor(h: AbilityHit) {
    const ab = fromDonor(h);
    if (replaceId) replaceWith(ab, mult(h));
    else {
      insert(ab);
      const m = mult(h);
      if (m) set(m);
    }
  }
  function pickTemplate(t: Template, lane?: Section, beforeId?: string) {
    const ab = t.make();
    const extra = t.multiattack ? { multiattack: Math.max(d.multiattack, t.multiattack) } : undefined;
    if (replaceId) replaceWith(ab, extra);
    else {
      insert(ab, lane ?? t.section, beforeId);
      if (extra) set(extra);
    }
  }

  function handleDrop(e: DragEvent, lane: Section, beforeId?: string) {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    let p: Payload;
    try {
      p = JSON.parse(e.dataTransfer.getData("application/x-forge")) as Payload;
    } catch {
      return;
    }
    if (p.t === "move") move(p.id, lane, beforeId);
    else if (p.t === "donor") {
      insert(fromDonor(p.hit), lane, beforeId);
      const m = mult(p.hit);
      if (m) set(m);
    } else if (p.t === "tpl") {
      const t = TEMPLATES.find((x) => x.id === p.id);
      if (t) {
        insert(t.make(), lane, beforeId);
        if (t.multiattack) set({ multiattack: Math.max(d.multiattack, t.multiattack) });
      }
    } else if (p.t === "spell") addSpell(p.hit);
  }

  async function pickBase(key: string) {
    if (d.abilities.length > 0 && !confirm("Основа заменит характеристики и ВСЕ блоки (имя и предыстория останутся). Продолжить?")) return;
    setBaseBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/monsters/detail?${new URLSearchParams({ key })}`);
      if (!r.ok) throw new Error("Не удалось загрузить основу");
      const { entry } = (await r.json()) as { entry: Monster };
      const next = draftFromMonster(entry, d);
      setD((p) => ({ ...next, name: p.name, backstory: p.backstory, motivation: p.motivation }));
      setSelectedId(null);
      setReplaceId(null);
      setPalTab("tip");
      void translateAbilities(next.abilities);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки основы");
    } finally {
      setBaseBusy(false);
    }
  }

  function submit() {
    setError(null);
    if (!d.name.trim()) {
      setError("Укажите имя NPC");
      return;
    }
    start(async () => {
      try {
        if (editId) await updateForgedNpc(editId, d);
        else {
          await createForgedNpc(d);
          try {
            localStorage.removeItem(STORE_KEY);
          } catch {}
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось сохранить NPC");
      }
    });
  }

  const [pdfBusy, setPdfBusy] = useState(false);
  async function exportPdf() {
    setError(null);
    setPdfBusy(true);
    try {
      const res = await fetch("/api/npcs/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: d, characterId: editId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `Ошибка ${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(d.name.trim() || "NPC").replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось собрать PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  const crDiff = Math.abs(CR_LIST.indexOf(est.cr) - CR_LIST.indexOf(d.cr));
  const append = (field: "vulnerabilities" | "resistances" | "immunities" | "conditionImmunities", word: string) =>
    set({ [field]: d[field] ? `${d[field]}, ${word}` : word } as Partial<ForgeDraft>);
  const untranslated = d.abilities.filter(needsTranslation).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[21rem_minmax(0,1fr)_27rem]">
      {/* ================= Центр: схема существа ================= */}
      <div className="min-w-0 space-y-4 xl:col-start-2 xl:row-start-1">
        {/* Шапка существа */}
        <section className="card space-y-3 p-4" style={{ borderTop: "3px solid var(--color-accent, #d4a95a)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <input value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} placeholder="Имя существа…" className="input min-w-0 flex-1 py-2 font-display text-2xl" />
            <button type="button" className="btn text-sm" onClick={() => setPalTab("tip")} title="Что ещё можно добавить этому существу">
              💡 Советы
            </button>
            <button type="button" className="btn text-sm" onClick={() => setPalTab("base")} title="Выбрать другую основу">
              🧬 Основа: <b>{d.baseName || "с нуля"}</b>
            </button>
            {!editId && (
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                onClick={() => {
                  if (confirm("Очистить сборщик и начать с нуля?")) {
                    setD(blankDraft());
                    setSelectedId(null);
                    setReplaceId(null);
                  }
                }}
              >
                ⟲ Сбросить
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["КД", <Num key="ac" value={d.ac} min={1} max={40} className="w-16" onChange={(n) => set({ ac: n })} />, ""],
              ["Хиты", <Num key="hp" value={d.hp} min={1} max={9999} className="w-20" onChange={(n) => set({ hp: n })} />, hitDice(d)],
              ["Скорость", <Num key="sp" value={d.speed.walk} max={400} className="w-16" onChange={(n) => set({ speed: { ...d.speed, walk: n } })} />, "фт."],
            ].map(([t, el, sub]) => (
              <div key={String(t)} className="rounded-xl border border-border bg-bg/40 px-3 py-1.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted">{t}</div>
                {el}
                {sub && <div className="text-[10px] text-muted">{sub}</div>}
              </div>
            ))}
            <div className="rounded-xl border border-border bg-bg/40 px-3 py-1.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted">CR</div>
              <select value={d.cr} onChange={(e) => set({ cr: Number(e.target.value) })} className="input w-20 px-1 py-1 text-center">
                {CR_LIST.map((c) => (
                  <option key={c} value={c}>
                    {crText(c)}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-muted">мастерство {signed(pb)}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg/40 px-3 py-1.5 text-center" title="Сколько атак за действие (для оценки CR)">
              <div className="text-[10px] uppercase tracking-wide text-muted">Атак за ход</div>
              <Num value={d.multiattack} min={1} max={8} className="w-16" onChange={(n) => set({ multiattack: n })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ABILITY_KEYS.map((k) => (
              <div key={k} className="rounded-xl border border-border bg-bg/40 p-1.5 text-center">
                <div className="text-[10px] uppercase tracking-wide text-muted">{ABIL_FULL[k].slice(0, 3)}</div>
                <Num value={d.scores[k]} min={1} max={30} className="w-full" onChange={(n) => set({ scores: { ...d.scores, [k]: n } })} />
                <div className="mt-0.5 text-xs">
                  <b>{signed(mod(d.scores[k]))}</b>
                  <label className="ml-1.5 inline-flex items-center gap-0.5 text-muted" title="Спасбросок с бонусом мастерства">
                    <input type="checkbox" checked={d.saves.includes(k)} onChange={(e) => set({ saves: e.target.checked ? [...d.saves, k] : d.saves.filter((x) => x !== k) })} />
                    {signed(mod(d.scores[k]) + (d.saves.includes(k) ? pb : 0))}
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="text-sm text-muted hover:text-accent" onClick={() => setShowMore((v) => !v)}>
            {showMore ? "▾" : "▸"} Подробнее: размер, тип, навыки, сопротивления, предыстория…
          </button>
          {showMore && (
            <div className="space-y-3 rounded-xl border border-border bg-bg/30 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Размер", "size", SIZES],
                    ["Тип", "type", MONSTER_TYPES],
                    ["Порядок", "law", ALIGN_LAW],
                    ["Мораль", "moral", ALIGN_MORAL],
                  ] as const
                ).map(([title, field, opts]) => (
                  <label key={field} className="block">
                    <span className={lbl}>{title}</span>
                    <select value={d[field]} onChange={(e) => set({ [field]: e.target.value } as Partial<ForgeDraft>)} className="input w-full py-1 text-sm">
                      <option value="">Любой</option>
                      {Object.entries(opts).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-1 text-center text-[11px] text-muted">
                {(["walk", "fly", "swim", "climb", "burrow"] as const).map((k) => (
                  <label key={k}>
                    {{ walk: "ходьба", fly: "полёт", swim: "плавание", climb: "лазание", burrow: "копание" }[k]}
                    <Num value={d.speed[k]} max={400} className="w-full" onChange={(n) => set({ speed: { ...d.speed, [k]: n } })} />
                  </label>
                ))}
              </div>
              <input value={d.armorDesc} onChange={(e) => set({ armorDesc: e.target.value })} maxLength={80} placeholder="Доспех: латы, природная броня…" className="input w-full py-1 text-sm" />
              <div>
                <span className={lbl}>Навыки</span>
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
              <div className="grid gap-2 sm:grid-cols-2">
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
                <label className="block">
                  <span className={lbl}>Чувства</span>
                  <input value={d.senses} onChange={(e) => set({ senses: e.target.value })} maxLength={200} className="input w-full py-1 text-sm" />
                </label>
                <label className="block">
                  <span className={lbl}>Языки</span>
                  <input value={d.languages} onChange={(e) => set({ languages: e.target.value })} maxLength={200} className="input w-full py-1 text-sm" />
                </label>
              </div>
              <label className="block">
                <span className={lbl}>Предыстория</span>
                <textarea value={d.backstory} onChange={(e) => set({ backstory: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
              </label>
              <label className="block">
                <span className={lbl}>Мотивация</span>
                <textarea value={d.motivation} onChange={(e) => set({ motivation: e.target.value })} rows={3} className="input w-full resize-y text-sm" />
              </label>
              {d.abilities.some((a) => a.section === "legendary") && (
                <label className="block">
                  <span className={lbl}>Текст о легендарных действиях (пусто — стандартный)</span>
                  <textarea value={d.legendaryDesc} onChange={(e) => set({ legendaryDesc: e.target.value })} rows={2} className="input w-full resize-y text-sm" />
                </label>
              )}
            </div>
          )}
        </section>

        {replaceTarget && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent/10 px-3 py-2 text-sm">
            ⇄ Заменяем «<b>{replaceTarget.name}</b>»: выберите замену в каталоге слева (вкладки «Способности» или «Шаблоны»).
            <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" onClick={() => setReplaceId(null)}>
              отмена
            </button>
          </div>
        )}

        {/* Дорожки */}
        <div className="grid gap-3 lg:grid-cols-2">
          {LANES.map((lane) => {
            const items = d.abilities.filter((a) => a.kind !== "spells" && a.section === lane.id);
            const isOver = over?.lane === lane.id;
            return (
              <section
                key={lane.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver({ lane: lane.id });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
                }}
                onDrop={(e) => handleDrop(e, lane.id)}
                className={`rounded-2xl border p-2.5 transition ${isOver ? "border-accent bg-accent/5" : "border-border bg-panel"}`}
                style={{ borderTop: `3px solid ${lane.color}` }}
              >
                <div className="mb-2 flex items-baseline gap-2">
                  <h3 className="font-display text-lg">
                    {lane.icon} {lane.title}
                  </h3>
                  <span className="text-xs text-muted">{items.length}</span>
                  <span className="ml-auto hidden text-[11px] text-muted sm:inline">{lane.hint}</span>
                </div>
                <div className="space-y-1.5">
                  {items.map((a) => (
                    <div key={a.id}>
                      {over?.lane === lane.id && over.before === a.id && <div className="mb-1.5 h-1 rounded bg-accent" />}
                      <Block
                        a={a}
                        d={d}
                        selected={selectedId === a.id}
                        replacing={replaceId === a.id}
                        onSelect={() => {
                          setSelectedId(a.id);
                          setRightTab("inspect");
                        }}
                        onReplace={() => {
                          setReplaceId(a.id);
                          setPalTab(palTab === "tpl" ? "tpl" : "donor");
                        }}
                        onRemove={() => removeAbility(a.id)}
                        onDropBefore={(e) => handleDrop(e, lane.id, a.id)}
                        setOver={setOver}
                      />
                    </div>
                  ))}
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted">Перетащите блок сюда</div>}
                  <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-border py-1 text-xs text-muted hover:border-accent hover:text-accent"
                    onClick={() => insert({ id: rid(), kind: "text", section: lane.id, name: "Новый блок", desc: "" }, lane.id)}
                  >
                    ＋ пустой блок
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        <Spellbook
          a={spellbook}
          onChange={patchAbility}
          onDropSpell={(e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              const p = JSON.parse(e.dataTransfer.getData("application/x-forge")) as Payload;
              if (p.t === "spell") addSpell(p.hit);
            } catch {}
          }}
        />
      </div>

      {/* ================= Слева: каталог ================= */}
      <aside className="card min-w-0 space-y-3 p-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:col-start-1 xl:row-start-1 xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:self-start xl:overflow-y-auto">
        <h2 className="font-display text-lg text-accent">Каталог блоков</h2>
        <div className="grid grid-cols-5 gap-1">
          {(
            [
              ["base", "🧬", "Основа"],
              ["tip", "💡", "Советы"],
              ["donor", "🐲", "Способн."],
              ["spell", "✨", "Заклин."],
              ["tpl", "📦", "Шаблоны"],
            ] as const
          ).map(([k, icon, text]) => (
            <button key={k} type="button" onClick={() => setPalTab(k)} className={`rounded-lg px-1 py-1.5 text-center text-[11px] ${palTab === k ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
              <span className="block text-base">{icon}</span>
              {text}
            </button>
          ))}
        </div>
        {replaceTarget && (
          <p className="rounded-lg border border-accent/60 bg-accent/10 px-2 py-1 text-xs">
            ⇄ Замена «{replaceTarget.name}» — нажмите нужный блок.
          </p>
        )}
        {palTab === "base" && (
          <div className="space-y-2">
            <p className="text-xs text-muted">Основа задаёт характеристики и набор блоков. Дальше блоки можно менять, убирать и добавлять.</p>
            <BasePicker onPick={pickBase} busy={baseBusy} />
          </div>
        )}
        {palTab === "donor" && (
          <div>
            <p className="mb-2 text-xs text-muted">Нажмите или перетащите способность в нужную дорожку.</p>
            <DonorSearch onAdd={pickDonor} added={NO_ADDED} replacing={!!replaceId} />
          </div>
        )}
        {palTab === "tip" && (
          <div>
            <p className="mb-2 text-xs text-muted">Подбираю по теме существа: что уже есть в способностях, сопротивлениях и заклинаниях. Нажмите или перетащите в схему.</p>
            <SuggestPanel d={d} profile={profile} replacing={!!replaceId} onAddAbility={pickDonor} onAddTemplate={(t) => pickTemplate(t)} onAddSpell={addSpell} />
          </div>
        )}
        {palTab === "spell" && <SpellPalette onAdd={addSpell} />}
        {palTab === "tpl" && <TemplatePalette onPick={(t) => pickTemplate(t)} replacing={!!replaceId} />}
      </aside>

      {/* ================= Справа: инспектор и статблок ================= */}
      <aside className="min-w-0 space-y-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        <div className="card space-y-1.5 p-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg text-accent">Оценка CR</h2>
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
            защита {crText(est.defCr)} · атака {crText(est.offCr)} · урон за раунд ≈ {est.dpr}
            {est.offBy === "attack" ? ` · попадание ${signed(est.offValue)}` : est.offBy === "save" ? ` · Сл ${est.offValue}` : ""}
          </p>
          {est.notes.map((n) => (
            <p key={n} className="text-xs text-muted">
              ⚠ {n}
            </p>
          ))}
        </div>

        <div className="flex gap-1">
          {(
            [
              ["inspect", "🔧 Инспектор"],
              ["stat", "📜 Статблок"],
            ] as const
          ).map(([k, text]) => (
            <button key={k} type="button" onClick={() => setRightTab(k)} className={`rounded-md px-3 py-1 text-sm ${rightTab === k ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
              {text}
            </button>
          ))}
          {untranslated > 0 && (
            <button type="button" className="btn ml-auto px-2 py-0.5 text-xs" disabled={translating} onClick={() => void translateAbilities(d.abilities)}>
              {translating ? "Перевожу…" : `🌐 Перевести (${untranslated})`}
            </button>
          )}
        </div>
        {note && <p className="text-xs text-amber-300">{note}</p>}

        {rightTab === "inspect" ? (
          selected ? (
            <div className="card space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate font-display text-lg">
                  {kindIcon(selected)} {selected.name}
                </h3>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => { setReplaceId(selected.id); setPalTab("donor"); }}>
                  ⇄ Заменить
                </button>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => duplicate(selected)}>
                  ⧉
                </button>
                <button type="button" className="btn btn-danger px-2 py-0.5 text-xs" onClick={() => removeAbility(selected.id)}>
                  ✕
                </button>
              </div>
              <p className="text-[11px] text-muted">Раздел: {SECTION_LABEL[selected.section]}. Блок можно перетащить в другую дорожку.</p>
              <AbilityBody a={selected} d={d} onChange={patchAbility} lanes={allowedLanes(selected)} />
              <div className="border-t border-border pt-3">
                <h4 className="mb-2 font-display text-base text-accent">💡 Похожие на «{selected.name}»</h4>
                <SuggestPanel
                  compact
                  d={d}
                  profile={profileOfAbility(selected)}
                  onAddAbility={(h) => insert(fromDonor(h), selected.section)}
                  onAddTemplate={(t) => insert(t.make(), selected.section)}
                  onAddSpell={addSpell}
                />
              </div>
            </div>
          ) : (
            <div className="card p-4 text-sm text-muted">
              <p>Нажмите на блок в схеме — здесь появятся его настройки.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>Перетаскивайте блоки между дорожками и меняйте порядок.</li>
                <li>
                  <b>⇄</b> на блоке — заменить его другой способностью, не теряя места.
                </li>
                <li>Заклинания из каталога перетаскиваются в «Книгу заклинаний»; нажатие на метку меняет «ячейка / по желанию / N в день».</li>
                <li>Числа в атаках, областях и заклинаниях пересчитываются от CR и характеристик.</li>
              </ul>
            </div>
          )
        ) : (
          <StatBlock m={monster} lang="ru" />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1 py-2.5 text-base" disabled={pending} onClick={submit}>
            {pending ? "Сохраняю…" : editId ? "💾 Сохранить изменения" : "🎭 Создать NPC"}
          </button>
          <button type="button" className="btn px-3 py-2.5 text-base" disabled={pdfBusy} onClick={() => void exportPdf()} title="Скачать лист NPC в PDF (из текущего состояния сборщика)">
            {pdfBusy ? "…" : "📄 PDF"}
          </button>
        </div>
        <p className="text-xs text-muted">
          {editId
            ? "Пересчитаются характеристики, атаки, особенности и заклинания листа; снаряжение, монеты и заметки останутся."
            : "Черновик хранится в браузере до создания."}
        </p>
      </aside>
    </div>
  );
}
