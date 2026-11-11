"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { fishByRoll, fishByTier, noteStash, removeStash, stashCatch, type FishCatch, type StashEntry } from "@/app/fishing-actions";
import { ITEM_CATEGORIES, RARITIES, RARITY_COLORS, label } from "@/lib/catalog/labels";
import { TIERS, TIER_BY_ID, rangeText, tierFor, type TierId } from "@/lib/fishing";

const LOG_KEY = "dnd-helper:fishing-log:v1";
type LogEntry = { at: number; value: number | null; tier: TierId; name: string; rarity: string | null };

const d20 = () => 1 + Math.floor(Math.random() * 20);
const catchName = (c: FishCatch) => c.item?.name ?? c.junk ?? "—";
const price = (c: FishCatch) => (c.item?.price ? `${c.item.priceEstimated ? "≈" : ""}${c.item.price.toLocaleString("ru")} зм` : "");

function CatchCard({ c, children }: { c: FishCatch; children?: React.ReactNode }) {
  const t = TIER_BY_ID[c.tier];
  const it = c.item;
  return (
    <div className={`card border-2 p-4 ${t.color.split(" ")[0]}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full border px-2 py-0.5 ${t.color}`}>
          {t.icon} {t.title}
        </span>
        {c.value !== null && <span className="text-muted">бросок {c.value}</span>}
      </div>
      {it ? (
        <>
          <Link href={`/items?open=${encodeURIComponent(it.key)}`} target="_blank" className={`mt-2 block font-display text-3xl hover:underline ${it.rarity ? (RARITY_COLORS[it.rarity] ?? "") : ""}`}>
            {it.name}
          </Link>
          {it.nameEn !== it.name && <div className="text-xs text-muted">{it.nameEn}</div>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            <span>{label(ITEM_CATEGORIES, it.category)}</span>
            {it.rarity && <span>{label(RARITIES, it.rarity)}</span>}
            {it.attunement && <span>требует настройки</span>}
            {price(c) && <span>{price(c)}</span>}
          </div>
          {it.desc && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted">Описание</summary>
              <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-line">{it.desc.replace(/\\n/g, "\n")}</p>
            </details>
          )}
        </>
      ) : (
        <p className="mt-2 font-display text-2xl">{c.junk}</p>
      )}
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function FishingTable({ initialStash }: { initialStash: StashEntry[] }) {
  const [value, setValue] = useState("");
  const [bonus, setBonus] = useState("0");
  const [current, setCurrent] = useState<FishCatch | null>(null);
  const [stash, setStash] = useState(initialStash);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Улов сессии — в браузере, чтобы не терять при перезагрузке.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage доступен только на клиенте
      if (raw) setLog(JSON.parse(raw) as LogEntry[]);
    } catch {}
  }, []);
  const saveLog = (next: LogEntry[]) => {
    setLog(next);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(next.slice(0, 60)));
    } catch {}
  };

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не получилось");
      }
    });

  const total = (v: number) => v + (Math.round(Number(bonus)) || 0);
  const cast = (raw: number) => run(async () => setCurrent(await fishByRoll(total(raw))));
  const reroll = () =>
    current &&
    run(async () => setCurrent(current.value !== null ? await fishByRoll(current.value, current.item?.key) : await fishByTier(current.tier, current.item?.key)));
  const preview = (tier: TierId) => run(async () => setCurrent(await fishByTier(tier)));
  const give = (c: FishCatch) => saveLog([{ at: Date.now(), value: c.value, tier: c.tier, name: catchName(c), rarity: c.item?.rarity ?? null }, ...log]);

  const shownValue = current?.value ?? null;
  const matching = current ? stash.filter((s) => s.tier === current.tier) : [];
  const rolledTier = value.trim() ? tierFor(total(Number(value) || 0)) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]">
      {/* ---------- Бросок и таблица уровней ---------- */}
      <aside className="space-y-4">
        <section className="card space-y-3 p-4">
          <h1 className="font-display text-2xl text-accent">🎣 Рыбалка</h1>
          <p className="text-xs text-muted">Чем выше бросок (d20 + бонус), тем круче вещь. Выпало у игрока — впишите число; или бросьте здесь.</p>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Выпало на d20</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && value.trim() && cast(Number(value))}
                inputMode="numeric"
                placeholder="1–20"
                className="input w-full text-center font-display text-3xl"
              />
            </label>
            <label className="block w-20">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted">Бонус</span>
              <input value={bonus} onChange={(e) => setBonus(e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric" className="input w-full text-center text-xl" title="Например, бонус Выживания или удочка получше" />
            </label>
          </div>
          {rolledTier && (
            <p className="text-xs text-muted">
              итого {total(Number(value) || 0)} → <span className={rolledTier.color.split(" ")[1]}>{rolledTier.icon} {rolledTier.title}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn btn-primary py-2" disabled={pending || !value.trim()} onClick={() => cast(Number(value))}>
              🪝 Тянуть
            </button>
            <button
              type="button"
              className="btn py-2"
              disabled={pending}
              onClick={() => {
                const r = d20();
                setValue(String(r));
                cast(r);
              }}
            >
              🎲 Бросить d20
            </button>
          </div>
        </section>

        <section className="card p-3">
          <h2 className="mb-2 font-display text-lg text-accent">Что можно выловить</h2>
          <ul className="space-y-1.5">
            {TIERS.map((t) => {
              const active = current?.tier === t.id;
              const saved = stash.filter((s) => s.tier === t.id).length;
              return (
                <li key={t.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${active ? t.color.split(" ")[0] + " bg-panel-2" : "border-border"}`}>
                  <span className="w-12 shrink-0 text-center font-mono text-xs text-muted">{rangeText(t)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${t.color.split(" ")[1]}`}>
                      {t.icon} {t.title} {saved > 0 && <span className="text-xs text-muted">· ⭐{saved}</span>}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{t.hint}</span>
                  </span>
                  <button type="button" className="btn px-2 py-0.5 text-xs" disabled={pending} onClick={() => preview(t.id)} title="Сгенерировать вариант этого уровня — например, чтобы заранее отложить в заготовки">
                    🎲
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>

      {/* ---------- Улов ---------- */}
      <section className="min-w-0 space-y-3">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {pending && !current && <div className="card p-8 text-center text-muted">Тянем…</div>}
        {!current && !pending && (
          <div className="card p-10 text-center text-muted">
            <p className="text-5xl">🎣</p>
            <p className="mt-3 font-display text-xl text-accent">Леска натянута…</p>
            <p className="mt-1 text-sm">Впишите бросок игрока или бросьте d20 слева.</p>
          </div>
        )}
        {current && (
          <div className={pending ? "opacity-60 transition" : "transition"}>
            <CatchCard c={current}>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => give(current)}>
                ✓ Выдать игрокам
              </button>
              <button type="button" className="btn" disabled={pending} onClick={reroll} title="Другая вещь того же уровня">
                🔄 Другая вещь
              </button>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="заметка: для кого, где спрятано…" className="input min-w-0 flex-1 py-1 text-sm" />
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    setStash(await stashCatch(current, note));
                    setNote("");
                  })
                }
                title="Отложить на будущее"
              >
                ⭐ В заготовки
              </button>
            </CatchCard>
            {shownValue === null && <p className="mt-1 text-xs text-muted">Это пример для уровня «{TIER_BY_ID[current.tier].title}» — без броска.</p>}
          </div>
        )}

        {current && matching.length > 0 && (
          <div className="card p-3">
            <h3 className="mb-2 text-sm text-muted">⭐ Есть заготовки для этого уровня — можно выдать вместо случайной вещи:</h3>
            <ul className="space-y-1.5">
              {matching.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`min-w-0 flex-1 truncate ${s.catch.item?.rarity ? (RARITY_COLORS[s.catch.item.rarity] ?? "") : ""}`}>
                    {catchName(s.catch)}
                    {s.note && <span className="text-xs text-muted"> · {s.note}</span>}
                  </span>
                  <button
                    type="button"
                    className="btn px-2 py-0.5 text-xs"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        setCurrent({ ...s.catch, value: current.value });
                        give({ ...s.catch, value: current.value });
                        setStash(await removeStash(s.id));
                      })
                    }
                  >
                    ✓ Выдать её
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {log.length > 0 && (
          <div className="card p-3">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-display text-lg text-accent">🐟 Улов сессии</h3>
              <span className="text-xs text-muted">{log.length}</span>
              <button type="button" className="ml-auto text-xs text-muted hover:text-red-400" onClick={() => confirm("Очистить улов сессии?") && saveLog([])}>
                очистить
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {log.map((l) => (
                <li key={l.at} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-center font-mono text-xs text-muted">{l.value ?? "—"}</span>
                  <span>{TIER_BY_ID[l.tier]?.icon}</span>
                  <span className={`min-w-0 flex-1 truncate ${l.rarity ? (RARITY_COLORS[l.rarity] ?? "") : ""}`}>{l.name}</span>
                  <span className="text-[11px] text-muted">{new Date(l.at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Заготовки ---------- */}
      <aside className="card min-w-0 space-y-3 p-3 xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)] xl:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] xl:self-start xl:overflow-y-auto">
        <div>
          <h2 className="font-display text-lg text-accent">⭐ Заготовки</h2>
          <p className="text-xs text-muted">Понравившийся улов, отложенный наперёд. Когда бросок попадёт в тот же уровень, заготовка предложится сама.</p>
        </div>
        {stash.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">Пока пусто. Нажмите «⭐ В заготовки» у улова или 🎲 у уровня, чтобы набрать варианты заранее.</p>}
        {TIERS.filter((t) => stash.some((s) => s.tier === t.id)).map((t) => (
          <div key={t.id}>
            <h3 className={`mb-1 text-xs uppercase tracking-wide ${t.color.split(" ")[1]}`}>
              {t.icon} {t.title} · {rangeText(t)}
            </h3>
            <ul className="space-y-1.5">
              {stash
                .filter((s) => s.tier === t.id)
                .map((s) => (
                  <li key={s.id} className="rounded-lg border border-border bg-panel-2/40 p-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline ${s.catch.item?.rarity ? (RARITY_COLORS[s.catch.item.rarity] ?? "") : ""}`}
                        onClick={() => setCurrent(s.catch)}
                        title="Показать"
                      >
                        {catchName(s.catch)}
                      </button>
                      <button
                        type="button"
                        className="btn px-2 py-0.5 text-xs"
                        disabled={pending}
                        title="Выдать игрокам и убрать из заготовок"
                        onClick={() =>
                          run(async () => {
                            give(s.catch);
                            setStash(await removeStash(s.id));
                          })
                        }
                      >
                        ✓
                      </button>
                      <button type="button" className="px-1 text-muted hover:text-red-400" disabled={pending} onClick={() => confirm(`Удалить «${catchName(s.catch)}» из заготовок?`) && run(async () => setStash(await removeStash(s.id)))} aria-label="Удалить">
                        ✕
                      </button>
                    </div>
                    {price(s.catch) && <div className="text-[11px] text-muted">{price(s.catch)}</div>}
                    <input
                      defaultValue={s.note}
                      onBlur={(e) => e.target.value !== s.note && noteStash(s.id, e.target.value)}
                      maxLength={300}
                      placeholder="заметка…"
                      className="mt-1 w-full rounded border border-border bg-bg/40 px-2 py-0.5 text-xs"
                    />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
