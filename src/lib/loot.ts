import type { Item } from "@/lib/catalog";

/**
 * Рандомайзер лута для магазина. Без серверных зависимостей: конфигурацию собирает клиентская форма,
 * выбор вещей делает server action rollShop (actions.ts).
 */

/** Одна строка настройки: «столько-то вещей такого типа и такой редкости». */
export type LootRow = {
  /** Ключ категории каталога (potion, weapon…); пусто — любой тип. */
  category: string;
  count: number;
  /** Допустимые редкости; "none" — вещи без редкости (обычное снаряжение). Пусто — любая. */
  rarities: string[];
};

export type StockMode = "auto" | "one" | "unlimited";

export type LootConfig = {
  rows: LootRow[];
  /** Сначала очистить магазин (иначе новые вещи добавляются к имеющимся). */
  replace: boolean;
  stock: StockMode;
  /** Верхняя граница цены в золотых (вещи без цены при ограничении не берутся). */
  maxPrice: number | null;
  /** Только вещи из SRD (основные правила). */
  srdOnly: boolean;
};

export const NO_RARITY = "none";

export type LootPick = { item: Item; qty: number | null };
export type LootReport = { category: string; rarities: string[]; wanted: number; got: number; kept: number };

export const MAX_ROWS = 20;
export const MAX_COUNT = 50;

/** Приводит присланную клиентом конфигурацию к безопасному виду. */
export function sanitizeConfig(raw: unknown): LootConfig {
  const c = (raw ?? {}) as Partial<LootConfig>;
  const rows = Array.isArray(c.rows) ? c.rows : [];
  return {
    rows: rows.slice(0, MAX_ROWS).map((r) => ({
      category: typeof r?.category === "string" ? r.category : "",
      count: Math.min(MAX_COUNT, Math.max(0, Math.floor(Number(r?.count) || 0))),
      rarities: Array.isArray(r?.rarities) ? r.rarities.filter((x): x is string => typeof x === "string").slice(0, 10) : [],
    })),
    replace: c.replace !== false,
    stock: c.stock === "one" || c.stock === "unlimited" ? c.stock : "auto",
    maxPrice: typeof c.maxPrice === "number" && c.maxPrice >= 0 ? c.maxPrice : null,
    srdOnly: !!c.srdOnly,
  };
}

/** Случайные n элементов без повторов (частичный Fisher–Yates). */
function sample<T>(list: T[], n: number, rand: () => number): T[] {
  const a = [...list];
  const take = Math.min(n, a.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, take);
}

/** Подходит ли вещь под тип и редкость строки (цена и источник не проверяются). */
export function matchesRow(item: Item, row: LootRow): boolean {
  return (!row.category || item.category === row.category) && (row.rarities.length === 0 || row.rarities.includes(item.rarity ?? NO_RARITY));
}

const randInt = (min: number, max: number, rand: () => number) => min + Math.floor(rand() * (max - min + 1));

/** Запас вещи: магические — по одной, обычные — несколько штук, боеприпасы — пачками. */
function stockFor(item: Item, mode: StockMode, rand: () => number): number | null {
  if (mode === "unlimited") return null;
  if (mode === "one") return 1;
  if (item.rarity) return 1;
  if (item.category === "ammunition") return randInt(10, 40, rand);
  if (item.category === "weapon" || item.category === "armor" || item.category === "shield") return randInt(1, 3, rand);
  return randInt(2, 6, rand);
}

/** Одно название — одна вещь (в каталоге они дублируются по книгам); приоритет у SRD. */
function dedupe(items: Item[]): Item[] {
  const best = new Map<string, Item>();
  for (const i of items) {
    const k = i.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || (i.key.startsWith("srd") && !cur.key.startsWith("srd"))) best.set(k, i);
  }
  return [...best.values()];
}

/**
 * Случайно набирает вещи под строки настройки. Вещи не повторяются ни внутри строки, ни между строками;
 * exclude — ключи, которые уже есть в магазине (если он не очищается).
 */
export function rollLoot(
  catalog: Item[],
  cfg: LootConfig,
  exclude: Set<string> = new Set(),
  kept: Item[] = [],
  avoid: Set<string> = new Set(),
  rand: () => number = Math.random,
): { picks: LootPick[]; report: LootReport[] } {
  const used = new Set([...exclude, ...kept.map((k) => k.key)]);
  // Закреплённые вещи (🔒) остаются и засчитываются в первую подходящую строку: новых добирается ровно на недостающее.
  const keptIn = cfg.rows.map(() => 0);
  for (const item of kept) {
    const i = cfg.rows.findIndex((r, n) => r.count - keptIn[n] > 0 && matchesRow(item, r));
    if (i >= 0) keptIn[i]++;
  }
  const base = dedupe(catalog.filter((i) => !cfg.srdOnly || i.key.startsWith("srd")));
  const picks: LootPick[] = [];
  const report: LootReport[] = [];

  for (const [rowIndex, row] of cfg.rows.entries()) {
    if (row.count <= 0) continue;
    const need = row.count - keptIn[rowIndex];
    const pool = base.filter(
      (i) =>
        !used.has(i.key) &&
        (!row.category || i.category === row.category) &&
        (row.rarities.length === 0 || row.rarities.includes(i.rarity ?? NO_RARITY)) &&
        (cfg.maxPrice === null || (i.price !== null && i.price <= cfg.maxPrice)),
    );
    // Вещи, что только что лежали на полке (avoid), берём в последнюю очередь — чтобы новый бросок заменял их новыми.
    const take = Math.max(0, Math.min(need, pool.length));
    const chosen = [...sample(pool.filter((i) => !avoid.has(i.key)), take, rand)];
    if (chosen.length < take) chosen.push(...sample(pool.filter((i) => avoid.has(i.key)), take - chosen.length, rand));
    for (const item of chosen) {
      used.add(item.key);
      picks.push({ item, qty: stockFor(item, cfg.stock, rand) });
    }
    report.push({ category: row.category, rarities: row.rarities, wanted: row.count, got: take + keptIn[rowIndex], kept: keptIn[rowIndex] });
  }
  return { picks, report };
}

/** Готовые наборы настроек для быстрого старта. */
export const LOOT_PRESETS: { key: string; icon: string; label: string; rows: LootRow[] }[] = [
  {
    key: "market",
    icon: "🏘️",
    label: "Рынок",
    rows: [
      { category: "adventuring-gear", count: 8, rarities: [NO_RARITY] },
      { category: "tools", count: 3, rarities: [NO_RARITY] },
      { category: "trade-good", count: 3, rarities: [NO_RARITY] },
      { category: "potion", count: 2, rarities: ["common"] },
    ],
  },
  {
    key: "smith",
    icon: "⚔️",
    label: "Кузница",
    rows: [
      { category: "weapon", count: 6, rarities: [NO_RARITY] },
      { category: "armor", count: 3, rarities: [NO_RARITY] },
      { category: "shield", count: 1, rarities: [NO_RARITY] },
      { category: "ammunition", count: 2, rarities: [NO_RARITY] },
      { category: "weapon", count: 1, rarities: ["uncommon", "rare"] },
    ],
  },
  {
    key: "alchemist",
    icon: "🧪",
    label: "Лавка зелий",
    rows: [
      { category: "potion", count: 6, rarities: ["common", "uncommon"] },
      { category: "potion", count: 1, rarities: ["rare"] },
      { category: "scroll", count: 3, rarities: ["common", "uncommon"] },
      { category: "poison", count: 2, rarities: [] },
    ],
  },
  {
    key: "magic",
    icon: "🔮",
    label: "Магическая лавка",
    rows: [
      { category: "wondrous-item", count: 4, rarities: ["uncommon", "rare"] },
      { category: "ring", count: 2, rarities: ["uncommon", "rare"] },
      { category: "wand", count: 2, rarities: ["uncommon", "rare"] },
      { category: "staff", count: 1, rarities: ["rare"] },
      { category: "scroll", count: 3, rarities: ["uncommon", "rare"] },
    ],
  },
  {
    key: "treasure",
    icon: "💎",
    label: "Сокровищница",
    rows: [{ category: "", count: 8, rarities: ["rare", "very-rare", "legendary"] }],
  },
];
