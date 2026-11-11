import type { Item } from "@/lib/catalog/items";

/**
 * Рыбалка: результат броска (d20 + бонус) определяет «уровень» улова — от мусора до легендарной вещи.
 * Здесь только таблица уровней и списки мусора; выбор вещи из каталога — на сервере (app/fishing-actions.ts).
 */

export type TierId = "junk" | "trinket" | "gear" | "good" | "uncommon" | "rare" | "very-rare" | "legendary";

export type Tier = {
  id: TierId;
  min: number;
  max: number;
  icon: string;
  title: string;
  hint: string;
  /** Классы цвета (рамка/текст). */
  color: string;
  /** Доля «мусора» вместо вещи из каталога (0…1). */
  junk: number;
};

export const TIERS: Tier[] = [
  { id: "junk", min: -99, max: 3, icon: "🥾", title: "Мусор", hint: "сапог, водоросли, рыбка", color: "border-stone-500/50 text-stone-300", junk: 1 },
  { id: "trinket", min: 4, max: 7, icon: "🪝", title: "Мелочь", hint: "дешёвые мелочи и безделушки", color: "border-amber-700/50 text-amber-200", junk: 0.4 },
  { id: "gear", min: 8, max: 11, icon: "🎒", title: "Снаряжение", hint: "обычные вещи и оружие до 50 зм", color: "border-amber-500/50 text-amber-300", junk: 0 },
  { id: "good", min: 12, max: 14, icon: "⚔️", title: "Хорошая находка", hint: "дорогое снаряжение или обычный магический предмет", color: "border-emerald-500/50 text-emerald-300", junk: 0 },
  { id: "uncommon", min: 15, max: 17, icon: "🟢", title: "Необычный предмет", hint: "магия: необычная редкость", color: "border-green-500/60 text-green-400", junk: 0 },
  { id: "rare", min: 18, max: 19, icon: "🔷", title: "Редкий предмет", hint: "магия: редкая", color: "border-sky-500/60 text-sky-400", junk: 0 },
  { id: "very-rare", min: 20, max: 22, icon: "💜", title: "Очень редкий предмет", hint: "магия: очень редкая", color: "border-violet-500/60 text-violet-400", junk: 0 },
  { id: "legendary", min: 23, max: 999, icon: "🌟", title: "Легендарный предмет", hint: "только с большим бонусом", color: "border-orange-500/60 text-orange-400", junk: 0 },
];
export const TIER_BY_ID = Object.fromEntries(TIERS.map((t) => [t.id, t])) as Record<TierId, Tier>;

export const tierFor = (value: number): Tier => TIERS.find((t) => value >= t.min && value <= t.max) ?? TIERS[0];
export const rangeText = (t: Tier) => (t.min <= -99 ? `≤ ${t.max}` : t.max >= 999 ? `${t.min}+` : t.min === t.max ? `${t.min}` : `${t.min}–${t.max}`);

const EXCLUDED_CATEGORIES = new Set(["land-vehicle", "mount", "waterborne-vehicle"]);
const MUNDANE_GEAR = new Set(["adventuring-gear", "weapon", "armor", "shield", "tools", "ammunition", "equipment-pack", "spellcasting-focus", "potion", "poison", "trade-good"]);

/** Подходит ли вещь каталога для уровня улова. */
export function fitsTier(it: Item, tier: TierId): boolean {
  if (EXCLUDED_CATEGORIES.has(it.category) || it.rarity === "artifact") return false;
  const price = it.price ?? 0;
  const mundane = !it.magic && !it.rarity;
  switch (tier) {
    case "junk":
      return false;
    case "trinket":
      return mundane && price > 0 && price <= 5 && ["adventuring-gear", "ammunition", "trade-good", "tools", "weapon"].includes(it.category);
    case "gear":
      return mundane && price > 0 && price <= 50 && MUNDANE_GEAR.has(it.category);
    case "good":
      return (mundane && price > 50 && MUNDANE_GEAR.has(it.category)) || it.rarity === "common";
    default:
      return it.rarity === tier;
  }
}

/** Что можно выловить вместо вещи: мусор и живность (с небольшой пользой — чтобы было смешно, но не обидно). */
export const JUNK: string[] = [
  "Старый дырявый сапог (внутри сидит лягушка)",
  "Охапка скользких водорослей",
  "Ржавая подкова",
  "Карась на полфунта — хватит на один рацион",
  "Щука с зубами-иголками — 1 рацион и обиженный взгляд",
  "Бутылка с запиской на неизвестном языке",
  "Обломок вёсла с вырезанными инициалами «Б. Т.»",
  "Мокрая перчатка без пальцев",
  "Глиняный горшок, полный ила (и одна медная монета)",
  "Ржавый шлем с гнездом раков",
  "Сломанная удочка — кто-то здесь уже пытался",
  "Детская деревянная лошадка",
  "Мешочек с 1d6 медными монетами, слипшимися в комок",
  "Рак, который вцепился в крючок и не отпускает",
  "Ракушка, в которой слышно шёпот (просто ветер… наверное)",
  "Обрывок карты — половина реки и крестик",
  "Кость. Надеемся, звериная",
  "Мокрая книга: страницы слиплись, на обложке руна",
  "Старый ключ без замка",
  "Угорь, который тут же уполз обратно",
  "Ведро без дна",
  "Кольцо из ракушек — красивое, но не магическое",
  "Деревянная кружка с выжженным гербом таверны",
  "Обрывок сети с застрявшей серебряной монетой (1 см)",
  "Большой сом — 3 рациона, если кто-то его донесёт",
  "Ничего. Только наживку съели",
];
