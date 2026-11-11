import type { Item } from "@/lib/catalog/items";
import type { Spell } from "@/lib/catalog/spells";
import type { Monster } from "@/lib/open5e";

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

// =====================================================================
// Рыбалка как сцена: поклёвка → борьба → улов разных видов
// =====================================================================

/** Уровни улова по возрастанию (без мусора). */
export const TIER_ORDER: TierId[] = ["trinket", "gear", "good", "uncommon", "rare", "very-rare", "legendary"];
export const stepTier = (t: TierId, n: number): TierId => {
  if (t === "junk") return t;
  const i = TIER_ORDER.indexOf(t);
  return TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i + n))];
};

/** Что может оказаться на крючке. */
export type CatchKind = "item" | "scroll" | "treasure" | "hook" | "creature" | "junk";
export const CATCH_KINDS: { id: Exclude<CatchKind, "junk">; icon: string; label: string }[] = [
  { id: "item", icon: "🗡️", label: "Предмет" },
  { id: "scroll", icon: "📜", label: "Свиток" },
  { id: "treasure", icon: "💰", label: "Сокровище" },
  { id: "hook", icon: "🍾", label: "Зацепка" },
  { id: "creature", icon: "🐙", label: "Существо" },
];
export type CatchWeights = Record<Exclude<CatchKind, "junk">, number>;
export const DEFAULT_WEIGHTS: CatchWeights = { item: 45, scroll: 20, treasure: 20, hook: 10, creature: 5 };

export function pickKind(w: CatchWeights): Exclude<CatchKind, "junk"> {
  const entries = CATCH_KINDS.map((k) => [k.id, Math.max(0, Number(w[k.id]) || 0)] as const);
  const total = entries.reduce((n, [, v]) => n + v, 0);
  if (total <= 0) return "item";
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    r -= v;
    if (r < 0) return k;
  }
  return "item";
}

/** Наживка: сдвиг стартового уровня и риск вытащить чудовище. */
export type BaitId = "plain" | "shiny" | "magic";
export const BAITS: { id: BaitId; icon: string; label: string; hint: string; steps: number; creatureOn: number }[] = [
  { id: "plain", icon: "🪱", label: "Червяк", hint: "без бонусов", steps: 0, creatureOn: 1 },
  { id: "shiny", icon: "✨", label: "Блесна", hint: "улов на ступень лучше", steps: 1, creatureOn: 1 },
  { id: "magic", icon: "🔮", label: "Магическая приманка", hint: "на 2 ступени лучше, но на 1–3 клюёт чудовище", steps: 2, creatureOn: 3 },
];

export type BiteResult =
  | { outcome: "miss" }
  | { outcome: "creature" }
  | { outcome: "hooked"; tier: TierId; rounds: number; legendary: boolean };

/**
 * Поклёвка: проверка Мудрости (Выживание) против Сл. natural — то, что выпало на кубике (для 1 и 20).
 * Чем больше запас над Сл, тем лучше то, что село на крючок; натуральная 20 — «легендарная поклёвка» (+1 раунд борьбы).
 */
export function bite(natural: number, total: number, dc: number, bait: BaitId): BiteResult {
  const b = BAITS.find((x) => x.id === bait) ?? BAITS[0];
  if (natural >= 1 && natural <= b.creatureOn) return { outcome: "creature" };
  if (natural !== 20 && total < dc) return { outcome: "miss" };
  const margin = total - dc;
  let tier: TierId = natural === 20 ? "uncommon" : margin >= 8 ? "good" : margin >= 4 ? "gear" : "trinket";
  tier = stepTier(tier, b.steps);
  return { outcome: "hooked", tier, rounds: natural === 20 ? 4 : 3, legendary: natural === 20 };
}

/** Сл раунда борьбы: каждый следующий рывок тяжелее. */
export const fightDc = (dc: number, round: number) => dc + 2 * (round - 1);

export type FightResult = { tier: TierId; snapped: boolean; note: string };

/** Раунд борьбы: проверка Силы (Атлетика). Успех — улов на ступень лучше (на 20 — на две); провал — леска рвётся. */
export function fight(tier: TierId, natural: number, total: number, dc: number): FightResult {
  if (natural === 20) return { tier: stepTier(tier, 2), snapped: false, note: "Мощный рывок! Улов на две ступени лучше." };
  if (natural === 1) return { tier: stepTier(tier, -1), snapped: true, note: "Леска лопнула, и часть улова сорвалась." };
  if (total >= dc) return { tier: stepTier(tier, 1), snapped: false, note: "Тянете! Что-то тяжёлое поднимается со дна." };
  return { tier, snapped: true, note: "Леска рвётся — вытаскиваете то, что успели подтянуть." };
}

// ---------- Свитки ----------

/** Круги заклинаний для свитка по уровню улова (по редкости свитков из DMG). */
export const SCROLL_LEVELS: Record<TierId, number[]> = {
  junk: [0],
  trinket: [0],
  gear: [0, 1],
  good: [1],
  uncommon: [2, 3],
  rare: [4, 5],
  "very-rare": [6, 7, 8],
  legendary: [9],
};
/** Сл спасброска и бонус атаки свитка по кругу (DMG). */
export function scrollStats(level: number): { dc: number; attack: number } {
  if (level <= 2) return { dc: 13, attack: 5 };
  if (level <= 4) return { dc: 15, attack: 7 };
  if (level <= 6) return { dc: 17, attack: 9 };
  if (level <= 8) return { dc: 18, attack: 10 };
  return { dc: 19, attack: 11 };
}

// ---------- Сокровища ----------

const d = (n: number, sides: number) => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides)).reduce((a, b) => a + b, 0);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const GEMS: Record<number, string[]> = {
  10: ["голубой кварц", "агат с полосами", "гематит", "лазурит", "бирюза", "обсидиан"],
  50: ["кровавик", "сердолик", "халцедон", "хризопраз", "лунный камень", "оникс", "циркон"],
  100: ["янтарь", "аметист", "гранат", "нефрит", "жемчужина", "турмалин", "коралл"],
  500: ["александрит", "аквамарин", "чёрный жемчуг", "голубая шпинель", "топаз"],
  1000: ["чёрный опал", "голубой сапфир", "изумруд", "огненный опал", "звёздчатый рубин"],
  5000: ["чёрный сапфир", "алмаз", "жакинт", "рубин"],
};
const ART: Record<number, string[]> = {
  25: ["серебряный кувшин", "статуэтка из резной кости", "бронзовая корона", "медная чаша с серебряной филигранью"],
  250: ["золотое кольцо с кровавиком", "резная статуэтка из слоновой кости", "золотой браслет", "серебряное ожерелье с жемчужиной"],
  750: ["серебряная чаша с лунными камнями", "кинжал с золотой рукоятью и рубином", "золотая птичья клетка с изумрудами"],
  2500: ["кольцо с огненным опалом", "золотая музыкальная шкатулка", "платиновый браслет со звёздчатым сапфиром"],
};

export type Treasure = { lines: string[]; gp: number };

/** Монеты, камни и украшения по уровню улова (по мотивам таблиц сокровищ DMG). */
export function rollTreasure(tier: TierId): Treasure {
  const lines: string[] = [];
  let gp = 0;
  const coins = (cp: number, sp: number, g: number, pp = 0) => {
    const parts = [pp && `${pp} пм`, g && `${g} зм`, sp && `${sp} см`, cp && `${cp} мм`].filter(Boolean);
    if (parts.length) lines.push(`Монеты: ${parts.join(", ")}`);
    gp += pp * 10 + g + sp / 10 + cp / 100;
  };
  const gems = (value: number, n: number) => {
    const list = Array.from({ length: n }, () => pick(GEMS[value]));
    lines.push(`Драгоценные камни по ${value} зм: ${list.join(", ")}`);
    gp += value * n;
  };
  const art = (value: number, n: number) => {
    const list = Array.from({ length: n }, () => pick(ART[value]));
    lines.push(`Украшения по ${value} зм: ${list.join(", ")}`);
    gp += value * n;
  };
  switch (tier) {
    case "junk":
    case "trinket":
      coins(d(3, 10), d(1, 6), 0);
      break;
    case "gear":
      coins(0, d(4, 10), d(1, 6));
      break;
    case "good":
      coins(0, d(2, 10), d(2, 6) * 10);
      if (Math.random() < 0.5) gems(10, d(1, 4));
      break;
    case "uncommon":
      coins(0, 0, d(2, 6) * 10);
      gems(50, d(1, 4));
      break;
    case "rare":
      coins(0, 0, d(4, 6) * 10);
      if (Math.random() < 0.5) gems(100, d(1, 6));
      else art(250, d(1, 4));
      break;
    case "very-rare":
      coins(0, 0, d(2, 6) * 100, d(1, 6) * 10);
      if (Math.random() < 0.5) gems(500, d(1, 4));
      else art(750, d(1, 4));
      break;
    case "legendary":
      coins(0, 0, d(4, 6) * 100, d(2, 6) * 10);
      if (Math.random() < 0.5) gems(1000, d(1, 6));
      else art(2500, d(1, 4));
      if (Math.random() < 0.3) gems(5000, 1);
      break;
  }
  return { lines, gp: Math.round(gp * 100) / 100 };
}

// ---------- Зацепки ----------

/** Находки-крючки для сюжета (без ИИ). */
export const HOOKS: string[] = [
  "Запечатанная бутылка: внутри карта острова с кровавым крестиком и подписью «Не верь капитану».",
  "Кольцо с гербом пропавшего дома — местный лорд щедро заплатит, но спросит, где вы его нашли.",
  "Размокшее письмо: «Если ты читаешь это, значит, меня утопили. Найди мою сестру в Серой Гавани».",
  "Железный ключ с выгравированным номером 13 и символом храма, которого нет ни на одной карте.",
  "Детская кукла, мокрая, но тёплая на ощупь. Ночью она шепчет одно и то же имя.",
  "Обломок корабельной доски с названием судна, которое, по слухам, утонуло сто лет назад.",
  "Медальон с портретом одного из героев — хотя этот портрет никто никогда не заказывал.",
  "Мешочек с семенами, светящимися под водой. Посаженные, они вырастают за ночь.",
  "Кандалы со сломанным замком — и свежие следы, ведущие из воды в лес.",
  "Свиток с половиной ритуала призыва. Вторая половина, судя по обрыву, осталась на дне.",
  "Деревянная маска морского культа: изнутри выцарапано «Они придут в полнолуние».",
  "Компас, стрелка которого указывает не на север, а на одного и того же человека в отряде.",
  "Сундучок с двойным дном, пустой — но на дне выжжен знак гильдии воров.",
  "Отрубленная рука скелета, сжимающая жетон наёмника с номером отряда.",
  "Колокольчик: каждый его звон слышен кому-то под водой — и тот отвечает.",
  "Стеклянный шар с запертой внутри живой рыбкой и надписью «Не разбивать».",
  "Карта сокровищ, но все ориентиры на ней — места, где отряд уже бывал.",
  "Печать городского совета и письмо о подкупе стражи, датированное прошлой неделей.",
  "Чешуйка размером с щит. Чья бы она ни была, её хозяин где-то рядом.",
  "Перстень-печатка мага с гравировкой: «Вернуть владельцу — награда 500 зм».",
];

// ---------- Улов ----------

/** То, что вытащили. Всё хранится копией, чтобы заготовки пережили обновление каталога. */
export type Catch = {
  tier: TierId;
  kind: CatchKind;
  /** Итог броска (быстрый режим) или null. */
  value: number | null;
  junk?: string;
  item?: Item;
  spell?: Spell;
  scroll?: { level: number; dc: number; attack: number };
  treasure?: Treasure;
  hook?: string;
  monster?: Monster;
  monsterKey?: string;
  /** Вещь сгенерирована Gemini: id записи ИИ-кузницы (там её можно править). */
  aiId?: number;
};

export const catchTitle = (c: Catch): string => {
  switch (c.kind) {
    case "item":
      return c.item?.name ?? "Предмет";
    case "scroll":
      return `Свиток: ${c.spell?.name ?? "заклинание"}`;
    case "treasure":
      return `Сокровище (${c.treasure?.gp ?? 0} зм)`;
    case "hook":
      return c.hook ? (c.hook.length > 70 ? `${c.hook.slice(0, 70)}…` : c.hook) : "Зацепка";
    case "creature":
      return c.monster?.name ?? "Существо";
    default:
      return c.junk ?? "Мусор";
  }
};
export const kindIcon = (k: CatchKind) => (k === "junk" ? "🥾" : (CATCH_KINDS.find((x) => x.id === k)?.icon ?? "❔"));
