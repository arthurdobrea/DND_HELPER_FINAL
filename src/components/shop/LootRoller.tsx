"use client";

import { useEffect, useState, useTransition } from "react";
import { rollShop, unlockShop, type RollShopResult } from "@/app/actions";
import { ITEM_CATEGORIES, RARITIES, RARITY_COLORS, label } from "@/lib/catalog/labels";
import { LOOT_PRESETS, MAX_COUNT, NO_RARITY, type LootConfig, type LootRow, type StockMode } from "@/lib/loot";

const STORAGE_KEY = "dnd-loot-config-v1";

type Row = LootRow & { id: number };
let nextId = 1;
const withId = (r: LootRow): Row => ({ ...r, id: nextId++ });

const RARITY_CHIPS: { key: string; label: string; cls: string }[] = [
  { key: NO_RARITY, label: "Без редкости", cls: "text-text" },
  ...Object.entries(RARITIES).map(([key, text]) => ({ key, label: text, cls: RARITY_COLORS[key] ?? "" })),
];

const DEFAULT_ROWS: LootRow[] = LOOT_PRESETS[0].rows;

/**
 * Рандомайзер лута: строки «тип вещи · сколько · какие редкости», пресеты и одна кнопка «Бросить».
 * Настройки запоминаются в браузере (localStorage), чтобы не собирать их заново.
 */
export function LootRoller({ categories, lockedCount }: { categories: { value: string; count: number }[]; lockedCount: number }) {
  const [rows, setRows] = useState<Row[]>(() => DEFAULT_ROWS.map(withId));
  const [replace, setReplace] = useState(true);
  const [stock, setStock] = useState<StockMode>("auto");
  const [maxPrice, setMaxPrice] = useState("");
  const [srdOnly, setSrdOnly] = useState(false);
  const [result, setResult] = useState<RollShopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [loaded, setLoaded] = useState(false);

  // Восстанавливаем прошлые настройки после гидратации (на сервере localStorage нет).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved && Array.isArray(saved.rows)) {
        /* eslint-disable react-hooks/set-state-in-effect */
        setRows((saved.rows as LootRow[]).map(withId));
        setReplace(saved.replace !== false);
        setStock(saved.stock === "one" || saved.stock === "unlimited" ? saved.stock : "auto");
        setMaxPrice(saved.maxPrice == null ? "" : String(saved.maxPrice));
        setSrdOnly(!!saved.srdOnly);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {}
    setLoaded(true);
  }, []);

  const config = (): LootConfig => ({
    rows: rows.map(({ category, count, rarities }) => ({ category, count, rarities })),
    replace,
    stock,
    maxPrice: maxPrice.trim() === "" ? null : Math.max(0, Number(maxPrice) || 0),
    srdOnly,
  });

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config()));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rows, replace, stock, maxPrice, srdOnly]);

  const total = rows.reduce((n, r) => n + (r.count || 0), 0);
  const patch = (id: number, p: Partial<LootRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const toggleRarity = (r: Row, key: string) =>
    patch(r.id, { rarities: r.rarities.includes(key) ? r.rarities.filter((x) => x !== key) : [...r.rarities, key] });

  function roll() {
    const keep = lockedCount > 0 ? ` Закреплённые 🔒 (${lockedCount}) останутся, остальное заменится.` : "";
    if (replace && !confirm(`Магазин будет заполнен заново (цены и запасы, которые вы правили, пропадут).${keep} Продолжить?`)) return;
    setError(null);
    start(async () => {
      try {
        setResult(await rollShop(config()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось наполнить магазин");
      }
    });
  }

  const rowName = (category: string) => (category ? label(ITEM_CATEGORIES, category) : "Любой тип");

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Быстрый старт</p>
        <div className="flex flex-wrap gap-1.5">
          {LOOT_PRESETS.map((p) => (
            <button key={p.key} type="button" className="btn px-2 py-1 text-xs" onClick={() => setRows(p.rows.map(withId))}>
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-bg/40 p-2">
            <div className="flex items-center gap-1.5">
              <select
                value={r.category}
                onChange={(e) => patch(r.id, { category: e.target.value })}
                className="input min-w-0 flex-1 py-1 text-sm"
                aria-label="Тип вещей"
              >
                <option value="">Любой тип</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {label(ITEM_CATEGORIES, c.value)} ({c.count})
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">×</span>
              <input
                type="number"
                min={0}
                max={MAX_COUNT}
                value={r.count}
                onChange={(e) => patch(r.id, { count: Math.min(MAX_COUNT, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                className="input w-16 py-1 text-center text-sm"
                aria-label={`Сколько вещей: ${rowName(r.category)}`}
              />
              <button
                type="button"
                className="px-1.5 text-muted hover:text-red-400"
                title="Убрать строку"
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              >
                ✕
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {RARITY_CHIPS.map((c) => {
                const on = r.rarities.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleRarity(r, c.key)}
                    className={`rounded border px-1.5 py-0.5 text-[11px] transition ${on ? `border-accent bg-accent/15 ${c.cls}` : "border-border text-muted hover:text-text"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
            {r.rarities.length === 0 && <p className="mt-1 text-[11px] text-muted">Редкость не выбрана — подойдёт любая</p>}
          </div>
        ))}
        <button
          type="button"
          className="btn w-full py-1.5 text-xs"
          onClick={() => setRows((rs) => [...rs, withId({ category: "", count: 3, rarities: [] })])}
          disabled={rows.length >= 20}
        >
          ＋ Ещё тип вещей
        </button>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-bg/40 p-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-muted">Запас вещи</span>
          <select value={stock} onChange={(e) => setStock(e.target.value as StockMode)} className="input min-w-0 flex-1 py-1 text-sm">
            <option value="auto">Авто: магия 1 шт, обычные 2–6</option>
            <option value="one">Всегда 1 шт</option>
            <option value="unlimited">Без ограничений</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-muted">Цена до, зм</span>
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="без ограничения"
            className="input min-w-0 flex-1 py-1 text-sm"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={srdOnly} onChange={(e) => setSrdOnly(e.target.checked)} className="accent-[var(--accent)]" />
          Только основные правила (SRD)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[var(--accent)]" />
          Сначала очистить магазин (иначе добавить к имеющимся)
        </label>
      </div>

      <div className="rounded-lg border border-border bg-bg/40 p-2 text-xs text-muted">
        {replace ? (
          lockedCount > 0 ? (
            <p className="flex items-center gap-2">
              <span>
                🔒 Закреплено: <b className="text-accent">{lockedCount}</b>. При броске они останутся и засчитаются в подходящие строки, остальные вещи заменятся новыми.
              </span>
              <button type="button" className="btn shrink-0 px-2 py-1 text-xs" onClick={() => start(() => unlockShop())}>
                Снять все
              </button>
            </p>
          ) : (
            <p>💡 Нажмите на замок 🔓 у вещей на полке — при следующем броске они останутся, а остальные заменятся новыми.</p>
          )
        ) : (
          <p>Режим «добавить к имеющимся»: все текущие вещи остаются, замки не нужны.</p>
        )}
      </div>

      <button type="button" className="btn btn-primary w-full py-2.5 text-base" disabled={pending || total === 0} onClick={roll}>
        {pending ? "Бросаю кости…" : `🎲 Бросить! (${total} вещей${replace && lockedCount > 0 ? `, из них закреплено ${lockedCount}` : ""})`}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {result && (
        <div className="rounded-lg border border-accent/50 bg-accent/10 p-2 text-sm">
          <p className="font-medium text-accent">Добавлено в магазин: {result.added}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {result.report.map((r, i) => (
              <li key={i} className={r.got < r.wanted ? "text-amber-300" : "text-muted"}>
                {rowName(r.category)}
                {r.rarities.length > 0 && ` (${r.rarities.map((k) => (k === NO_RARITY ? "без редкости" : label(RARITIES, k).toLowerCase())).join(", ")})`}: {r.got} из {r.wanted}
                {r.kept > 0 && ` (🔒 оставлено ${r.kept})`}
                {r.got < r.wanted && " — больше подходящих нет"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
