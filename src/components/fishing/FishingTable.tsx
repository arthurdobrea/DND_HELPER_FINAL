"use client";

import { useEffect, useState, useTransition } from "react";
import { aiCatch, aiHook } from "@/app/ai-forge-actions";
import { creatureToBattle, fishCatch, giveCatch, noteStash, removeStash, stashCatch, type PartyMember, type StashEntry } from "@/app/fishing-actions";
import {
  BAITS,
  CATCH_KINDS,
  DEFAULT_WEIGHTS,
  SCROLL_LEVELS,
  TIERS,
  TIER_BY_ID,
  TIER_ORDER,
  bite,
  catchTitle,
  fight,
  fightDc,
  kindIcon,
  pickKind,
  rangeText,
  scrollStats,
  tierFor,
  type BaitId,
  type Catch,
  type CatchKind,
  type CatchWeights,
  type TierId,
} from "@/lib/fishing";
import { ItemCard } from "@/components/ItemCard";
import { SpellCard } from "@/components/SpellCard";
import { StatBlock } from "@/components/StatBlock";

const LOG_KEY = "dnd-helper:fishing-log:v2";
const SETTINGS_KEY = "dnd-helper:fishing-settings:v2";
type LogEntry = { at: number; title: string; kind: CatchKind; tier: TierId; who: string };
type Settings = { mode: "steps" | "quick"; dc: number; bait: BaitId; source: "catalog" | "ai"; heroId: number; weights: CatchWeights };
const DEFAULTS: Settings = { mode: "steps", dc: 12, bait: "plain", source: "catalog", heroId: 0, weights: DEFAULT_WEIGHTS };

const d20 = () => 1 + Math.floor(Math.random() * 20);
const num = (s: string) => (s.trim() === "" || s === "-" ? NaN : Number(s));
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
/** Ключ текущего улова — чтобы «Другое» не выдало то же самое. */
const keyOf = (c: Catch) => c.item?.key ?? c.spell?.key ?? c.monsterKey ?? c.hook ?? undefined;

function TierBadge({ tier }: { tier: TierId }) {
  const t = TIER_BY_ID[tier];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-sm ${t.color}`}>
      {t.icon} {t.title}
    </span>
  );
}

/** Полная карточка улова. */
function CatchView({ c, onBattle, battleBusy }: { c: Catch; onBattle?: () => void; battleBusy?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={c.tier} />
        <span className="text-sm text-muted">
          {kindIcon(c.kind)} {c.kind === "junk" ? "Мусор" : CATCH_KINDS.find((k) => k.id === c.kind)?.label}
        </span>
        {c.aiId && <span className="rounded border border-violet-500/50 px-1.5 text-xs text-violet-300" title="Сгенерировано Gemini; править можно в ИИ-кузнице">🔮 ИИ</span>}
        {c.value !== null && <span className="text-xs text-muted">бросок {c.value}</span>}
      </div>
      {c.kind === "item" && c.item && <ItemCard i={c.item} />}
      {c.kind === "scroll" && c.spell && (
        <>
          <div className="card border-amber-500/40 p-3 text-sm">
            📜 <b>Свиток заклинания</b> · {c.spell.level ? `${c.spell.level} круг` : "заговор"} · Сл спасброска <b>{c.scroll?.dc}</b>, бонус атаки <b>+{c.scroll?.attack}</b>. Если заклинания нет в списке
            класса читающего — проверка базовой характеристики Сл {10 + (c.spell.level || 0)}.
          </div>
          <SpellCard s={c.spell} />
        </>
      )}
      {c.kind === "treasure" && c.treasure && (
        <div className="card space-y-1 p-4">
          <div className="font-display text-2xl text-accent">💰 Сокровище · ≈ {c.treasure.gp.toLocaleString("ru")} зм</div>
          {c.treasure.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
      {c.kind === "hook" && c.hook && (
        <div className="card border-l-4 border-l-accent p-4 font-display text-xl leading-relaxed" style={{ borderRadius: 0 }}>
          🍾 {c.hook}
        </div>
      )}
      {c.kind === "creature" && c.monster && (
        <>
          <div className="card flex flex-wrap items-center gap-2 border-red-500/40 p-3 text-sm">
            🐙 Из воды показывается <b>{c.monster.name}</b> — и оно не намерено отпускать леску!
            {onBattle && (
              <button type="button" className="btn btn-danger ml-auto" disabled={battleBusy} onClick={onBattle}>
                {battleBusy ? "…" : "⚔️ В бой"}
              </button>
            )}
          </div>
          <StatBlock m={c.monster} lang="ru" />
        </>
      )}
      {c.kind === "junk" && <div className="card p-4 font-display text-2xl">🥾 {c.junk}</div>}
    </div>
  );
}

export function FishingTable({ initialStash, party, aiEnabled }: { initialStash: StashEntry[]; party: PartyMember[]; aiEnabled: boolean }) {
  const [cfg, setCfg] = useState<Settings>(DEFAULTS);
  const [showWeights, setShowWeights] = useState(false);
  // Сцена
  const [stage, setStage] = useState<"idle" | "fight" | "done">("idle");
  const [nat, setNat] = useState("");
  const [bonus, setBonus] = useState("0");
  const [hookTier, setHookTier] = useState<TierId>("trinket");
  const [round, setRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [events, setEvents] = useState<string[]>([]);
  const [quickTotal, setQuickTotal] = useState("");
  // Улов
  const [current, setCurrent] = useState<Catch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stash, setStash] = useState(initialStash);
  const [note, setNote] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [prepTier, setPrepTier] = useState<TierId>("uncommon");
  const [prepKind, setPrepKind] = useState<"" | Exclude<CatchKind, "junk">>("");
  const [battlePending, startBattle] = useTransition();

  // Настройки и журнал — в браузере
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- однократная загрузка из localStorage
      if (s) setCfg({ ...DEFAULTS, ...s, weights: { ...DEFAULT_WEIGHTS, ...(s.weights ?? {}) } });
      setLog(JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[]);
    } catch {
      /* нет доступа к localStorage */
    }
  }, []);
  const save = (p: Partial<Settings>) =>
    setCfg((c) => {
      const next = { ...c, ...p };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const pushLog = (e: LogEntry) =>
    setLog((l) => {
      const next = [e, ...l].slice(0, 100);
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const say = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice((n) => (n === m ? null : n)), 4000);
  };

  const ai = cfg.source === "ai" && aiEnabled;
  const hero = party.find((p) => p.id === cfg.heroId);

  /** Собрать улов уровня tier (вид — по весам, если не задан). С ИИ предметы, свитки и зацепки придумывает Gemini. */
  async function produce(tier: TierId, kind?: CatchKind, exclude?: string, value: number | null = null): Promise<Catch> {
    const k: CatchKind = tier === "junk" ? "junk" : (kind ?? pickKind(cfg.weights));
    if (ai && (k === "item" || k === "scroll")) {
      const level = pickOne(SCROLL_LEVELS[tier] ?? [1]);
      const r = await aiCatch({ kind: k === "item" ? "item" : "spell", tier, level });
      if (r.ok) {
        const e = r.item.entity;
        if (e.kind === "item") return { tier, kind: "item", value, item: e.item, aiId: r.item.id };
        if (e.kind === "spell") return { tier, kind: "scroll", value, spell: e.spell, scroll: { level: e.spell.level, ...scrollStats(e.spell.level) }, aiId: r.item.id };
      } else setError(`${r.error} Взял вещь из каталога.`);
    }
    if (ai && k === "hook") {
      const r = await aiHook(tier);
      if (r.ok) return { tier, kind: "hook", value, hook: r.text };
      setError(`${r.error} Взял зацепку из списка.`);
    }
    return fishCatch({ tier, kind: k, weights: cfg.weights, value, excludeKey: exclude });
  }

  async function reveal(tier: TierId, kind?: CatchKind, value: number | null = null) {
    setBusy(true);
    try {
      const c = await produce(tier, kind, undefined, value);
      setCurrent(c);
      setStage("done");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось достать улов");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("idle");
    setCurrent(null);
    setEvents([]);
    setNat("");
    setError(null);
  }

  // ---------- Шаги ----------
  function doBite() {
    setError(null);
    const n = num(nat);
    const b = num(bonus) || 0;
    if (!Number.isFinite(n) || n < 1 || n > 20) return setError("Впишите, что выпало на d20 (1–20), или нажмите 🎲.");
    const total = n + b;
    const r = bite(n, total, cfg.dc, cfg.bait);
    const head = `Поклёвка: ${n}${b ? ` ${b > 0 ? "+" : "−"} ${Math.abs(b)} = ${total}` : ""} против Сл ${cfg.dc}.`;
    if (r.outcome === "creature") {
      setEvents([head, n === 1 ? "Натуральная 1! Что-то огромное хватает наживку и тянет рыбака к воде…" : "Магическая приманка привлекла что-то голодное…"]);
      void reveal("good", "creature");
    } else if (r.outcome === "miss") {
      setEvents([head, "Не клюёт… На крючке только мусор."]);
      void reveal("junk", "junk");
    } else {
      setEvents([head, r.legendary ? "Натуральная 20 — ЛЕГЕНДАРНАЯ поклёвка! Удочка гнётся дугой." : "Клюёт! Леска натянулась."]);
      setHookTier(r.tier);
      setRound(1);
      setMaxRounds(r.rounds);
      setStage("fight");
      setNat("");
    }
  }

  function doFight() {
    setError(null);
    const n = num(nat);
    const b = num(bonus) || 0;
    if (!Number.isFinite(n) || n < 1 || n > 20) return setError("Впишите, что выпало на d20 (1–20), или нажмите 🎲.");
    const dc = fightDc(cfg.dc, round);
    const r = fight(hookTier, n, n + b, dc);
    setEvents((e) => [...e, `Рывок ${round}: ${n + b} против Сл ${dc}. ${r.note}`]);
    setHookTier(r.tier);
    setNat("");
    if (r.snapped || round >= maxRounds) {
      if (!r.snapped) setEvents((e) => [...e, "Улов на берегу!"]);
      void reveal(r.tier);
    } else setRound(round + 1);
  }

  function doQuick() {
    setError(null);
    const v = num(quickTotal);
    if (!Number.isFinite(v)) return setError("Впишите итог броска (d20 + бонус).");
    setEvents([`Быстрый улов: ${v} → ${TIER_BY_ID[tierFor(v).id].title}`]);
    void reveal(tierFor(v).id, undefined, v);
  }

  // ---------- Действия с уловом ----------
  async function reroll(sameKind: boolean) {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      setCurrent(await produce(current.tier, sameKind ? current.kind : undefined, sameKind ? keyOf(current) : undefined, current.value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setBusy(false);
    }
  }

  async function give() {
    if (!current) return;
    if (hero && current.kind !== "creature") {
      const r = await giveCatch(hero.id, current);
      if (!r.ok) return setError(r.error ?? "Не удалось выдать");
      say(`Записано в лист: ${hero.name}`);
    }
    pushLog({ at: Date.now(), title: catchTitle(current), kind: current.kind, tier: current.tier, who: hero?.name ?? "" });
    reset();
  }

  async function toStash() {
    if (!current) return;
    setStash(await stashCatch(current, note));
    say("Отложено в заготовки");
  }

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const c = await produce(prepTier, prepKind || undefined);
      setStash(await stashCatch(c, ""));
      say(`Заготовка: ${catchTitle(c)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось");
    } finally {
      setBusy(false);
    }
  }

  const matching = current ? stash.filter((s) => s.tier === current.tier && current.tier !== "junk") : [];
  const fightDcNow = fightDc(cfg.dc, round);
  const inputCls = "input w-full text-center text-xl";

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
      {/* ================= Слева: заброс ================= */}
      <div className="space-y-4">
        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl text-accent">🎣 Заброс</h2>
            <div className="ml-auto flex overflow-hidden rounded-md border border-border text-xs">
              {(
                [
                  ["steps", "Сцена"],
                  ["quick", "Быстро"],
                ] as const
              ).map(([m, l]) => (
                <button key={m} type="button" onClick={() => (save({ mode: m }), reset())} className={`px-2.5 py-1 ${cfg.mode === m ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Кто ловит</span>
              <select value={cfg.heroId} onChange={(e) => save({ heroId: Number(e.target.value) })} className="input w-full py-1 text-sm">
                <option value={0}>— никто —</option>
                {party.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {cfg.mode === "steps" && (
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Сл ловли</span>
                <input type="number" value={cfg.dc} min={5} max={30} onChange={(e) => save({ dc: Math.max(5, Math.min(30, Number(e.target.value) || 12)) })} className="input w-full py-1 text-center" />
              </label>
            )}
          </div>

          {cfg.mode === "steps" && (
            <div className="space-y-1">
              <span className="block text-xs uppercase tracking-wide text-muted">Наживка</span>
              <div className="grid grid-cols-3 gap-1">
                {BAITS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    title={b.hint}
                    onClick={() => save({ bait: b.id })}
                    className={`rounded-md border px-1 py-1.5 text-xs ${cfg.bait === b.id ? "border-accent bg-panel-2 text-accent" : "border-border text-muted hover:text-text"}`}
                  >
                    {b.icon} {b.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted">{BAITS.find((b) => b.id === cfg.bait)?.hint}</p>
            </div>
          )}

          <div className="space-y-1">
            <span className="block text-xs uppercase tracking-wide text-muted">Откуда вещи и свитки</span>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <button type="button" onClick={() => save({ source: "catalog" })} className={`rounded-md border px-2 py-1.5 ${cfg.source === "catalog" ? "border-accent bg-panel-2 text-accent" : "border-border text-muted"}`}>
                📚 Каталог
              </button>
              <button
                type="button"
                disabled={!aiEnabled}
                title={aiEnabled ? "Gemini придумывает вещь со статблоком и историей (≈0,1–0,2 цента)" : "Нужен GEMINI_API_KEY в .env"}
                onClick={() => save({ source: "ai" })}
                className={`rounded-md border px-2 py-1.5 ${cfg.source === "ai" ? "border-violet-500 bg-panel-2 text-violet-300" : "border-border text-muted"} disabled:opacity-40`}
              >
                🔮 ИИ (Gemini)
              </button>
            </div>
          </div>

          <button type="button" className="text-xs text-muted hover:text-accent" onClick={() => setShowWeights((v) => !v)}>
            {showWeights ? "▾" : "▸"} Шансы видов улова
          </button>
          {showWeights && (
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {CATCH_KINDS.map((k) => (
                <label key={k.id} className="block" title={k.label}>
                  <span className="block">{k.icon}</span>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={cfg.weights[k.id]}
                    onChange={(e) => save({ weights: { ...cfg.weights, [k.id]: Math.max(0, Number(e.target.value) || 0) } })}
                    className="input w-full px-1 py-0.5 text-center text-xs"
                  />
                </label>
              ))}
              <button type="button" className="col-span-5 text-[11px] text-muted hover:text-text" onClick={() => save({ weights: DEFAULT_WEIGHTS })}>
                сбросить (45 / 20 / 20 / 10 / 5)
              </button>
            </div>
          )}
        </section>

        {/* Шаги сцены */}
        {cfg.mode === "steps" ? (
          <section className="card space-y-3 p-4">
            {stage === "idle" && (
              <>
                <h3 className="font-display text-lg">1. Поклёвка</h3>
                <p className="text-xs text-muted">
                  Проверка Мудрости (Выживание) против Сл {cfg.dc}. Чем больше запас — тем лучше то, что клюнуло. 20 — легендарная поклёвка, 1 — {cfg.bait === "magic" ? "1–3 — " : ""}из воды тянут рыбака.
                </p>
              </>
            )}
            {stage === "fight" && (
              <>
                <h3 className="font-display text-lg">
                  2. Борьба — рывок {round} из {maxRounds}
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  На крючке: <TierBadge tier={hookTier} />
                </div>
                <p className="text-xs text-muted">Проверка Силы (Атлетика) против Сл {fightDcNow}. Успех — улов на ступень лучше, провал — леска рвётся (остаётся то, что есть).</p>
              </>
            )}
            {stage !== "done" && (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">d20</span>
                    <input value={nat} onChange={(e) => setNat(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className={inputCls} placeholder="—" />
                  </label>
                  <span className="pb-2 text-xl text-muted">+</span>
                  <label className="block">
                    <span className="mb-1 block text-xs text-muted">бонус</span>
                    <input value={bonus} onChange={(e) => setBonus(e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric" className={inputCls} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => setNat(String(d20()))} title="Бросить d20 здесь">
                    🎲
                  </button>
                  <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={stage === "fight" ? doFight : doBite}>
                    {stage === "fight" ? "💪 Тянуть" : "🪝 Подсечь"}
                  </button>
                  {stage === "fight" && (
                    <button type="button" className="btn" disabled={busy} onClick={() => void reveal(hookTier)} title="Не рисковать: вытащить то, что уже на крючке">
                      Вытащить
                    </button>
                  )}
                </div>
              </>
            )}
            {stage === "done" && (
              <button type="button" className="btn btn-primary w-full" onClick={reset}>
                🎣 Новый заброс
              </button>
            )}
            {events.length > 0 && (
              <ol className="space-y-1 border-t border-border pt-2 text-xs text-muted">
                {events.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ol>
            )}
          </section>
        ) : (
          <section className="card space-y-3 p-4">
            <p className="text-xs text-muted">Один бросок (d20 + бонус): чем выше, тем круче улов.</p>
            <div className="flex gap-2">
              <input value={quickTotal} onChange={(e) => setQuickTotal(e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric" className={inputCls} placeholder="итог" />
              <button type="button" className="btn" onClick={() => setQuickTotal(String(d20()))}>
                🎲
              </button>
            </div>
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={doQuick}>
              🪝 Тянуть
            </button>
            <table className="w-full text-xs">
              <tbody>
                {TIERS.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-1 font-mono">{rangeText(t)}</td>
                    <td className={t.color.split(" ").slice(1).join(" ")}>
                      {t.icon} {t.title}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {/* ================= Центр: улов ================= */}
      <div className="min-w-0 space-y-3">
        {error && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-200">{error}</p>}
        {notice && <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-300">{notice}</p>}
        {busy && <div className="card animate-pulse p-4 text-center text-muted">{ai ? "Gemini придумывает находку… 5–20 секунд" : "Тянем…"}</div>}
        {current ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void give()} title={hero ? `Записать в лист: ${hero.name}` : "Отметить в журнале сессии"}>
                ✓ Выдать{hero && current.kind !== "creature" ? ` → ${hero.name}` : ""}
              </button>
              {current.kind !== "junk" && (
                <button type="button" className="btn" disabled={busy} onClick={() => void reroll(true)}>
                  🔄 Другое такое же
                </button>
              )}
              {current.tier !== "junk" && (
                <button type="button" className="btn" disabled={busy} onClick={() => void reroll(false)}>
                  🎲 Другой вид
                </button>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="заметка к заготовке" className="input min-w-0 flex-1 py-1 text-sm" />
              <button type="button" className="btn" onClick={() => void toStash()}>
                ⭐ В заготовки
              </button>
            </div>
            {matching.length > 0 && (
              <div className="card space-y-1 border-amber-500/40 p-3 text-sm">
                <div className="text-amber-200">⭐ Есть заготовки этого уровня — можно выдать их вместо случайного улова:</div>
                {matching.map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {kindIcon(s.catch.kind)} {catchTitle(s.catch)}
                      {s.note && <span className="text-muted"> — {s.note}</span>}
                    </span>
                    <button
                      type="button"
                      className="btn px-2 py-0.5 text-xs"
                      onClick={async () => {
                        setCurrent({ ...s.catch, value: current.value });
                        setStash(await removeStash(s.id));
                      }}
                    >
                      Взять
                    </button>
                  </div>
                ))}
              </div>
            )}
            <CatchView c={current} battleBusy={battlePending} onBattle={current.monsterKey ? () => startBattle(() => creatureToBattle(current.monsterKey!)) : undefined} />
          </>
        ) : (
          !busy && (
            <div className="card p-8 text-center text-sm text-muted">
              {cfg.mode === "steps" ? (
                <>
                  Сцена рыбалки: <b>поклёвка</b> (Мудрость/Выживание) решает, что клюнуло, затем до {3} рывков <b>борьбы</b> (Сила/Атлетика) — каждый успех делает улов лучше, провал рвёт леску. На
                  крючке может оказаться предмет, свиток, сокровище, зацепка для сюжета или водное существо.
                </>
              ) : (
                "Впишите итог броска и нажмите «Тянуть»."
              )}
            </div>
          )
        )}

        {log.length > 0 && (
          <section className="card p-3">
            <div className="mb-2 flex items-center">
              <h3 className="font-display text-lg text-accent">Улов сессии</h3>
              <button
                type="button"
                className="ml-auto text-xs text-muted hover:text-red-400"
                onClick={() => {
                  if (!confirm("Очистить журнал улова?")) return;
                  setLog([]);
                  try {
                    localStorage.removeItem(LOG_KEY);
                  } catch {}
                }}
              >
                очистить
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {log.map((e) => (
                <li key={e.at} className="flex gap-2">
                  <span>{kindIcon(e.kind)}</span>
                  <span className={`min-w-0 flex-1 truncate ${TIER_BY_ID[e.tier]?.color.split(" ").slice(1).join(" ")}`}>{e.title}</span>
                  {e.who && <span className="text-muted">→ {e.who}</span>}
                  <span className="text-xs text-muted">{new Date(e.at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ================= Справа: заготовки ================= */}
      <aside className="card flex max-h-[calc(100dvh-var(--header-h,49px)-2rem)] flex-col overflow-hidden xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)]">
        <div className="space-y-2 border-b border-border p-3">
          <h3 className="font-display text-lg text-accent">⭐ Заготовки</h3>
          <div className="flex gap-1">
            <select value={prepTier} onChange={(e) => setPrepTier(e.target.value as TierId)} className="input min-w-0 flex-1 py-1 text-xs" aria-label="Уровень">
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {TIER_BY_ID[t].icon} {TIER_BY_ID[t].title}
                </option>
              ))}
            </select>
            <select value={prepKind} onChange={(e) => setPrepKind(e.target.value as typeof prepKind)} className="input py-1 text-xs" aria-label="Вид">
              <option value="">любой</option>
              {CATCH_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn px-2 py-1 text-xs" disabled={busy} onClick={() => void prepare()} title="Сгенерировать и отложить заранее">
              🎲
            </button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {stash.length === 0 && <li className="p-4 text-center text-sm text-muted">Пока пусто: откладывайте понравившийся улов или заготовьте кнопкой 🎲</li>}
          {TIER_ORDER.filter((t) => stash.some((s) => s.tier === t)).map((t) => (
            <li key={t}>
              <div className={`border-b border-border bg-panel-2/40 px-3 py-1 text-xs ${TIER_BY_ID[t].color.split(" ").slice(1).join(" ")}`}>
                {TIER_BY_ID[t].icon} {TIER_BY_ID[t].title}
              </div>
              <ul>
                {stash
                  .filter((s) => s.tier === t)
                  .map((s) => (
                    <li key={s.id} className="group border-b border-border px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <button type="button" className="min-w-0 flex-1 truncate text-left hover:text-accent" onClick={() => (setCurrent(s.catch), setStage("done"))} title="Показать карточку">
                          {kindIcon(s.catch.kind)} {catchTitle(s.catch)}
                        </button>
                        <button type="button" className="text-muted opacity-0 hover:text-red-400 group-hover:opacity-100" onClick={async () => setStash(await removeStash(s.id))} title="Убрать">
                          ✕
                        </button>
                      </div>
                      <input
                        defaultValue={s.note}
                        onBlur={(e) => e.target.value !== s.note && void noteStash(s.id, e.target.value)}
                        placeholder="заметка…"
                        className="mt-1 w-full bg-transparent text-xs text-muted outline-none focus:text-text"
                      />
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
