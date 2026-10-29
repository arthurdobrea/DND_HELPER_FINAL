"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { clearBattle, rollBattleLoot, saveBattle, syncBattleHp } from "@/app/actions";
import { MONSTER_TYPES, RARITIES, RARITY_COLORS, label } from "@/lib/catalog/labels";
import {
  CONDITIONS,
  addCoins,
  coinsText,
  coinsToGp,
  isDown,
  nextTurn,
  noCoins,
  numberedName,
  ordered,
  rollInitiative,
  startBattle,
  uid,
  type Battle,
  type Combatant,
} from "@/lib/battle";
import { xpForCr } from "@/lib/encounter";
import type { RawMonster } from "@/lib/catalog/monsters";
import { StatBlock } from "@/components/StatBlock";

export type PartyEntry = { id: number; name: string; sub: string; ac: number; hp: number; hpMax: number; initBonus: number; monsterKey: string; cr: number; type: string };

type Hit = { key: string; name: string; type: string; typeLabel: string; cr: number; crLabel: string; hp: number; ac: number; dex: number; source: string };

const SIZES_KEY = "dnd-helper:battle-card-widths:v1";

const d20 = () => 1 + Math.floor(Math.random() * 20);

// ---------- Строка боя ----------

function HpControl({ c, onHp }: { c: Combatant; onHp: (hp: number) => void }) {
  const [amount, setAmount] = useState("");
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  const pct = Math.max(0, Math.min(100, (Math.max(0, c.hp) / c.hpMax) * 100));
  const color = pct > 50 ? "#34d399" : pct > 25 ? "#fbbf24" : "#f87171";
  const apply = (sign: -1 | 1) => {
    if (n === 0) return;
    onHp(Math.max(0, Math.min(c.hpMax, c.hp + sign * n)));
    setAmount("");
  };
  return (
    <div className="w-full">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-3xl leading-none" style={{ color }}>
          {Math.max(0, c.hp)}
        </span>
        <span className="text-sm text-muted">/ {c.hpMax}</span>
        <button type="button" className="ml-auto text-xs text-muted hover:text-text" onClick={() => onHp(c.hpMax)} title="Восстановить все хиты">
          макс
        </button>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded bg-panel-2">
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="mt-1.5 flex gap-1">
        <button type="button" className="btn h-8 w-9 !p-0 text-lg text-red-300" onClick={() => apply(-1)} aria-label="Нанести урон" title="Нанести урон">
          −
        </button>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && apply(-1)}
          inputMode="numeric"
          placeholder="урон"
          className="input h-8 min-w-0 flex-1 px-2 py-0 text-center"
          aria-label="Величина урона или лечения"
        />
        <button type="button" className="btn h-8 w-9 !p-0 text-lg text-emerald-300" onClick={() => apply(1)} aria-label="Лечить" title="Вылечить">
          +
        </button>
      </div>
    </div>
  );
}

function Row({
  c,
  active,
  onChange,
  onRemove,
  onDuplicate,
  width,
  onWidth,
  selected,
  onOpen,
}: {
  c: Combatant;
  active: boolean;
  width?: number;
  onWidth: (w: number) => void;
  selected: boolean;
  onOpen: () => void;
  onChange: (patch: Partial<Combatant>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const down = isDown(c);
  const link = c.kind === "monster" ? `/monsters?open=${encodeURIComponent(c.refKey)}` : c.kind === "npc" ? `/npcs/${c.sheetId}` : `/characters/${c.sheetId}`;
  const icon = c.kind === "hero" ? "🧙" : c.kind === "npc" ? "🎭" : "👹";
  const startW = useRef(0);

  // Ширину меняют нативным ресайзом (уголок карточки); сохраняем только то, что изменил пользователь, а не адаптивную подгонку.
  function onPointerDown(e: React.PointerEvent<HTMLLIElement>) {
    const el = e.currentTarget;
    startW.current = el.offsetWidth;
    window.addEventListener(
      "pointerup",
      () => {
        const w = el.offsetWidth;
        if (Math.abs(w - startW.current) >= 3) onWidth(w);
      },
      { once: true },
    );
  }
  return (
    <li
      onPointerDown={onPointerDown}
      style={width ? { width, maxWidth: "100%" } : undefined}
      className={`min-w-[15rem] resize-x overflow-hidden rounded-2xl border p-3 transition ${
        width ? "" : "w-full sm:w-[calc(50%-0.375rem)] lg:w-[calc(33.333%-0.5rem)] min-[1400px]:w-[calc(25%-0.5625rem)]"
      } ${active ? "border-accent bg-accent/10 shadow-lg shadow-accent/10" : selected ? "border-accent/60 bg-panel" : "border-border bg-panel"} ${down ? "opacity-70" : ""}`}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="flex w-14 shrink-0 flex-col items-center">
          <input
            value={c.init ?? ""}
            onChange={(e) => onChange({ init: e.target.value.trim() === "" || isNaN(Number(e.target.value)) ? null : Math.round(Number(e.target.value)) })}
            inputMode="numeric"
            placeholder="—"
            className="input h-11 w-14 px-1 py-0 text-center font-display text-2xl"
            aria-label={`Инициатива: ${c.name}`}
          />
          <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">иниц.</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {active && <span className="text-accent">▶</span>}
              <span>{icon}</span>
              {c.kind === "monster" ? (
                <button type="button" onClick={onOpen} title="Показать описание монстра" className={`text-left font-display text-lg leading-tight hover:text-accent ${down ? "line-through" : ""}`}>
                  {c.name}
                </button>
              ) : (
                <Link href={link} target="_blank" className={`font-display text-lg leading-tight hover:text-accent ${down ? "line-through" : ""}`}>
                  {c.name}
                </Link>
              )}
            </div>
            {down && <span className="mt-0.5 inline-block rounded bg-red-500/20 px-1.5 py-0.5 text-xs text-red-300">{c.kind === "monster" ? "☠ повержен" : "без сознания"}</span>}
            <div className="mt-0.5 text-xs text-muted">
              КД <b className="text-text">{c.ac}</b>
              {c.kind !== "hero" && c.type && ` · ${label(MONSTER_TYPES, c.type)}`}
              {c.kind === "monster" && ` · CR ${c.cr < 1 && c.cr > 0 ? `1/${Math.round(1 / c.cr)}` : c.cr}`}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-1 self-start">
            <button type="button" className="text-muted hover:text-text" onClick={onDuplicate} title="Добавить ещё одного такого же">
              ⧉
            </button>
            <button type="button" className="text-muted hover:text-red-400" onClick={onRemove} title="Убрать из боя">
              ✕
            </button>
          </div>
        </div>

        <HpControl c={c} onHp={(hp) => onChange({ hp })} />

        <div>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {c.conditions.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => onChange({ conditions: c.conditions.filter((y) => y !== x) })}
                title="Снять состояние"
                className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-amber-500/25"
              >
                {x} ✕
              </button>
            ))}
            <select
              value=""
              onChange={(e) => e.target.value && onChange({ conditions: [...c.conditions, e.target.value] })}
              className="rounded border border-border bg-panel-2 px-1 py-0.5 text-[11px] text-muted"
              aria-label="Добавить состояние"
            >
              <option value="">＋ состояние</option>
              {CONDITIONS.filter((x) => !c.conditions.includes(x)).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <input
            value={c.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="заметка (позиция, эффект…)"
            maxLength={300}
            className="mt-2 w-full rounded border border-border bg-bg/40 px-2 py-1 text-xs"
          />
        </div>
      </div>
    </li>
  );
}

// ---------- Описание монстра ----------

type Detail = { key: string; entry?: RawMonster; error?: boolean };

function MonsterDetail({ monsterKey, onClose }: { monsterKey: string; onClose: () => void }) {
  const [res, setRes] = useState<Detail | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/monsters/detail?${new URLSearchParams({ key: monsterKey })}`, { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ entry: RawMonster }>) : Promise.reject(new Error("fail"))))
      .then((d) => setRes({ key: monsterKey, entry: d.entry }))
      .catch((e) => {
        if (!ctl.signal.aborted) setRes({ key: monsterKey, error: !!e });
      });
    return () => ctl.abort();
  }, [monsterKey]);

  const cur = res?.key === monsterKey ? res : null;
  return (
    <div className="card min-w-0 flex-1 basis-[28rem] p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-display text-lg text-accent">📖 Описание монстра</h2>
        <Link href={`/monsters?open=${encodeURIComponent(monsterKey)}`} target="_blank" className="ml-auto text-xs text-muted hover:text-text">
          открыть в каталоге ↗
        </Link>
        <button type="button" className="text-muted hover:text-text" onClick={onClose} aria-label="Закрыть описание" title="Закрыть">
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        {!cur ? (
          <p className="p-4 text-center text-sm text-muted">Загружаю…</p>
        ) : cur.error || !cur.entry ? (
          <p className="p-4 text-center text-sm text-red-400">Не удалось загрузить описание.</p>
        ) : (
          <div className="space-y-3">
            <StatBlock m={cur.entry} />
            {cur.entry.desc && (
              <details className="card p-3 text-sm">
                <summary className="cursor-pointer text-muted">Описание / лор</summary>
                <div className="mt-2 whitespace-pre-line">{cur.entry.desc.replace(/\\n/g, "\n")}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Панель добавления ----------

function AddPanel({
  heroes,
  npcs,
  onAdd,
}: {
  heroes: PartyEntry[];
  npcs: PartyEntry[];
  onAdd: (items: Omit<Combatant, "id">[]) => void;
}) {
  const [tab, setTab] = useState<"bestiary" | "heroes" | "npcs">("bestiary");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [count, setCount] = useState(1);

  useEffect(() => {
    if (tab !== "bestiary") return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/monsters/search?${new URLSearchParams({ q })}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<{ items: Hit[] }>)
        .then((d) => setHits(d.items))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, tab]);

  const base = { conditions: [] as string[], note: "", loot: null };
  const monsterFrom = (h: Hit): Omit<Combatant, "id"> => ({
    ...base, kind: "monster", name: h.name, refKey: h.key, sheetId: 0, init: null, dex: Math.floor((h.dex - 10) / 2), ac: h.ac, hp: h.hp, hpMax: h.hp, cr: h.cr, type: h.type,
  });
  const partyFrom = (p: PartyEntry, kind: "hero" | "npc"): Omit<Combatant, "id"> => ({
    ...base, kind, name: p.name, refKey: p.monsterKey, sheetId: p.id, init: null, dex: p.initBonus, ac: p.ac, hp: p.hp, hpMax: Math.max(1, p.hpMax), cr: p.cr, type: p.type,
  });

  const tabBtn = (key: typeof tab, text: string) => (
    <button type="button" onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-sm ${tab === key ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
      {text}
    </button>
  );

  return (
    <div className="card space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-1">
        {tabBtn("bestiary", "👹 Бестиарий")}
        {tabBtn("heroes", `🧙 Герои мира (${heroes.length})`)}
        {tabBtn("npcs", `🎭 NPC (${npcs.length})`)}
      </div>

      {tab === "bestiary" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Найти монстра: goblin, wolf, mage…" className="input min-w-0 flex-1 py-1.5 text-sm" />
            <label className="flex items-center gap-1.5 text-sm text-muted">
              Сколько:
              <input value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Math.floor(Number(e.target.value) || 1))))} inputMode="numeric" className="input w-14 py-1 text-center" />
            </label>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {hits.map((h) => (
              <li key={h.key}>
                <button type="button" onClick={() => onAdd(Array.from({ length: count }, () => monsterFrom(h)))} className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-panel-2">
                  <span className="w-12 shrink-0 text-center font-mono text-xs text-muted">CR {h.crLabel}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {h.name} <span className="text-xs text-muted">· {h.typeLabel} · КД {h.ac} · хиты {h.hp}</span>
                  </span>
                  <span className="text-accent">＋{count > 1 ? ` ×${count}` : ""}</span>
                </button>
              </li>
            ))}
            {hits.length === 0 && <li className="p-3 text-center text-sm text-muted">Ничего не найдено</li>}
          </ul>
        </>
      )}

      {tab === "heroes" && (
        <div className="space-y-2">
          {heroes.length === 0 && <p className="text-sm text-muted">В мире нет героев — создайте их во вкладке «Персонажи».</p>}
          {heroes.length > 0 && (
            <button type="button" className="btn btn-primary w-full" onClick={() => onAdd(heroes.map((h) => partyFrom(h, "hero")))}>
              ＋ Добавить всю партию ({heroes.length})
            </button>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {heroes.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => onAdd([partyFrom(h, "hero")])} className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-panel-2">
                  <span className="flex-1 truncate">{h.name} <span className="text-xs text-muted">· {h.sub}</span></span>
                  <span className="text-xs text-muted">КД {h.ac} · {h.hp}/{h.hpMax}</span>
                  <span className="text-accent">＋</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "npcs" && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {npcs.length === 0 && <li className="p-3 text-sm text-muted">Пока нет NPC — создайте во вкладке «NPC».</li>}
          {npcs.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onAdd([partyFrom(n, "npc")])} className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-panel-2">
                <span className="flex-1 truncate">{n.name} <span className="text-xs text-muted">· {n.sub}</span></span>
                <span className="text-xs text-muted">КД {n.ac} · {n.hp}/{n.hpMax}</span>
                <span className="text-accent">＋</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Трекер ----------

export function BattleTracker({ initial, heroes, npcs }: { initial: Battle; heroes: PartyEntry[]; npcs: PartyEntry[] }) {
  const [battle, setBattle] = useState(initial);
  const [saved, setSaved] = useState(true);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(initial);
  const dirty = useRef(false);
  const [open, setOpen] = useState<{ id: string; key: string } | null>(null);
  const [addOpen, setAddOpen] = useState<boolean | null>(null);
  const [sizes, setSizes] = useState<Record<string, number>>({});

  // Ширины карточек хранятся в браузере и переживают перезагрузку и редеплой.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIZES_KEY);
      if (raw) {
        const v = JSON.parse(raw) as Record<string, number>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только на клиенте
        if (v && typeof v === "object") setSizes(v);
      }
    } catch {}
  }, []);

  function setWidth(id: string, w: number) {
    setSizes((s) => {
      const alive = new Set(latest.current.combatants.map((c) => c.id));
      const next = Object.fromEntries(Object.entries({ ...s, [id]: w }).filter(([k]) => alive.has(k)));
      try {
        localStorage.setItem(SIZES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function flush() {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    saveBattle(latest.current).then(() => setSaved(!dirty.current));
  }

  function update(fn: (b: Battle) => Battle) {
    const next = fn(latest.current);
    latest.current = next;
    setBattle(next);
    dirty.current = true;
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current) saveBattle(latest.current);
    },
    [],
  );

  const patch = (id: string, p: Partial<Combatant>) => update((b) => ({ ...b, combatants: b.combatants.map((c) => (c.id === id ? { ...c, ...p } : c)) }));

  /** Хиты монстра: при падении до 0 выпадает добыча, при воскрешении — сбрасывается. */
  function setHp(c: Combatant, hp: number) {
    const dies = c.kind === "monster" && hp <= 0 && !c.loot;
    patch(c.id, { hp, ...(hp > 0 && c.loot ? { loot: null } : {}) });
    if (dies) {
      rollBattleLoot(c.cr, c.type).then((loot) => update((b) => ({ ...b, combatants: b.combatants.map((x) => (x.id === c.id && isDown(x) && !x.loot ? { ...x, loot } : x)) })));
    }
  }

  function add(items: Omit<Combatant, "id">[]) {
    update((b) => {
      let list = b.combatants;
      const many = items.length > 1 && items.every((i) => i.kind === "monster" && i.refKey === items[0].refKey);
      for (const it of items) {
        const name = it.kind === "monster" ? numberedName(it.name, list, many) : it.name;
        // В идущем бою новый монстр сразу получает инициативу.
        const init = it.init ?? (b.started && it.kind !== "hero" ? d20() + it.dex : null);
        list = [...list, { ...it, name, init, id: uid() }];
      }
      return { ...b, combatants: list };
    });
  }

  const showAdd = addOpen ?? battle.combatants.length === 0;
  const list = ordered(battle.combatants);
  const active = list.find((c) => c.id === battle.activeId);
  const fallen = battle.combatants.filter((c) => c.kind === "monster" && isDown(c));
  const heroCount = battle.combatants.filter((c) => c.kind === "hero").length;
  const xp = fallen.reduce((n, c) => n + xpForCr(c.cr), 0);
  const totalCoins = fallen.reduce((acc, c) => (c.loot ? addCoins(acc, c.loot.coins) : acc), noCoins());
  const allItems = fallen.flatMap((c) => c.loot?.items ?? []);
  const allTrophies = fallen.flatMap((c) => c.loot?.trophies ?? []);
  const monstersAlive = battle.combatants.filter((c) => c.kind === "monster" && !isDown(c)).length;

  function copySummary() {
    const lines = [
      `Добыча (${fallen.length} повержено): ${coinsText(totalCoins)}`,
      ...allItems.map((i) => `• ${i.name}${i.rarity ? ` (${label(RARITIES, i.rarity).toLowerCase()})` : ""}`),
      ...allTrophies.map((t) => `• ${t}`),
      xp ? `Опыт: ${xp}${heroCount ? ` (по ${Math.floor(xp / heroCount)} каждому из ${heroCount})` : ""}` : "",
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-[2000px] gap-4 p-4 min-[1900px]:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-4">
        {/* ---------- Управление ---------- */}
        <div className="card sticky top-[var(--header-h,49px)] z-10 flex flex-wrap items-center gap-2 p-3">
          <h1 className="mr-2 font-display text-2xl text-accent">🛡️ Бой</h1>
          {battle.started ? (
            <>
              <span className="rounded-md bg-panel-2 px-3 py-1 font-display text-lg">Раунд {battle.round}</span>
              {active && <span className="text-sm text-muted">ходит: <b className="text-accent">{active.name}</b></span>}
              <button type="button" className="btn btn-primary px-4 py-2" onClick={() => update(nextTurn)}>
                Следующий ход ▶
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary px-4 py-2" disabled={battle.combatants.length === 0} onClick={() => update((b) => startBattle(rollInitiative(b, "monsters")))}>
              ▶ Начать бой
            </button>
          )}
          <button type="button" className="btn" onClick={() => update((b) => rollInitiative(b, "monsters"))} title="Бросить d20 + ловкость тем монстрам и NPC, у кого инициативы ещё нет">
            🎲 Монстрам
          </button>
          <button type="button" className="btn" onClick={() => update((b) => rollInitiative(b, "all"))} title="Перебросить инициативу всем, включая героев">
            🎲 Всем
          </button>
          <span className="ml-auto text-xs text-muted">{saved ? "✓ сохранено" : "сохраняю…"}</span>
          <button
            type="button"
            className="btn btn-danger"
            disabled={pending}
            onClick={() =>
              confirm("Закончить бой и очистить трекер?") &&
              start(async () => {
                await clearBattle();
                latest.current = { started: false, round: 1, activeId: null, combatants: [] };
                setBattle(latest.current);
                dirty.current = false;
              })
            }
          >
            Закончить бой
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full max-w-[24rem] space-y-2">
            <button type="button" className="btn" onClick={() => setAddOpen(!showAdd)}>
              {showAdd ? "▾" : "▸"} Добавить в бой (монстры, герои, NPC)
            </button>
            {showAdd && <AddPanel heroes={heroes} npcs={npcs} onAdd={add} />}
          </div>
          {open && <MonsterDetail monsterKey={open.key} onClose={() => setOpen(null)} />}
        </div>

        {/* ---------- Порядок ходов ---------- */}
        {list.length === 0 ? (
          <div className="card p-8 text-center text-muted">
            <p className="font-display text-xl text-accent">Бой пуст</p>
            <p className="mt-2 text-sm">Добавьте монстров из бестиария и героев выше или начните бой из страницы «Столкновения».</p>
          </div>
        ) : (
          <ul className="flex flex-wrap items-start gap-3">
            {list.map((c) => (
              <Row
                key={c.id}
                c={c}
                active={battle.started && c.id === battle.activeId}
                width={sizes[c.id]}
                onWidth={(w) => setWidth(c.id, w)}
                selected={open?.id === c.id}
                onOpen={() => setOpen({ id: c.id, key: c.refKey })}
                onChange={(p) => ("hp" in p && typeof p.hp === "number" ? setHp(c, p.hp) : patch(c.id, p))}
                onRemove={() => confirm(`Убрать «${c.name}» из боя?`) && update((b) => ({ ...b, combatants: b.combatants.filter((x) => x.id !== c.id), activeId: b.activeId === c.id ? null : b.activeId }))}
                onDuplicate={() => add([{ ...c, init: null, loot: null, hp: c.hpMax, conditions: [], note: "" }])}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Добыча и опыт ---------- */}
      <aside className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1400px]:grid-cols-4 min-[1900px]:block min-[1900px]:space-y-3 min-[1900px]:sticky min-[1900px]:top-[calc(var(--header-h,49px)+1rem)] min-[1900px]:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] min-[1900px]:self-start min-[1900px]:overflow-y-auto">
        <div className="card p-3">
          <h2 className="font-display text-lg text-accent">💰 Добыча и опыт</h2>
          <p className="mt-1 text-xs text-muted">Когда хиты монстра падают до 0, с него выпадает добыча: монеты, вещь из каталога и трофеи.</p>
          {fallen.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Пока никто не повержен{monstersAlive > 0 ? ` (врагов в бою: ${monstersAlive})` : ""}.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                Повержено: <b>{fallen.length}</b> · опыт: <b>{xp}</b>
                {heroCount > 0 && <span className="text-muted"> (по {Math.floor(xp / heroCount)} на героя из {heroCount})</span>}
              </p>
              <p>
                Монеты: <b>{coinsText(totalCoins)}</b>
                <span className="text-muted"> ≈ {Math.round(coinsToGp(totalCoins))} зм{heroCount > 0 ? `, по ${Math.floor(coinsToGp(totalCoins) / heroCount)} на героя` : ""}</span>
              </p>
              <button type="button" className="btn w-full py-1.5 text-xs" onClick={copySummary}>
                {copied ? "Скопировано" : "⧉ Скопировать итог"}
              </button>
            </div>
          )}
        </div>

        {fallen.map((c) => (
          <div key={c.id} className="card p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-display text-base">☠ {c.name}</span>
              <button
                type="button"
                className="btn px-2 py-0.5 text-xs"
                title="Выбросить добычу заново"
                onClick={() => rollBattleLoot(c.cr, c.type).then((loot) => update((b) => ({ ...b, combatants: b.combatants.map((x) => (x.id === c.id ? { ...x, loot } : x)) })))}
              >
                🎲
              </button>
            </div>
            {c.loot ? (
              <ul className="mt-2 space-y-1 text-sm">
                <li>🪙 {coinsText(c.loot.coins)}</li>
                {c.loot.items.map((i) => (
                  <li key={i.key}>
                    <Link href={`/items?open=${encodeURIComponent(i.key)}`} target="_blank" className={`hover:underline ${i.rarity ? RARITY_COLORS[i.rarity] : ""}`}>
                      🎁 {i.name}
                    </Link>
                    <span className="text-xs text-muted">
                      {i.rarity ? ` · ${label(RARITIES, i.rarity).toLowerCase()}` : ""}
                      {i.price ? ` · ≈${i.price} зм` : ""}
                    </span>
                  </li>
                ))}
                {c.loot.trophies.map((t) => (
                  <li key={t} className="text-muted">
                    🦴 {t}
                  </li>
                ))}
                {c.loot.items.length === 0 && c.loot.trophies.length === 0 && <li className="text-xs text-muted">Только монеты.</li>}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">Добыча выпадает…</p>
            )}
          </div>
        ))}

        {battle.combatants.some((c) => c.kind !== "monster") && (
          <button
            type="button"
            className="btn w-full text-sm"
            disabled={pending}
            title="Записать текущие хиты героев и NPC из боя в их листы"
            onClick={() =>
              start(async () => {
                await syncBattleHp(battle.combatants.filter((c) => c.kind !== "monster" && c.sheetId > 0).map((c) => ({ sheetId: c.sheetId, hp: c.hp })));
              })
            }
          >
            💾 Хиты героев — в листы
          </button>
        )}
      </aside>
    </div>
  );
}
