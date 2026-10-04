import type { Item } from "@/lib/catalog";
import { rollDice } from "@/lib/npc-actions";
import { noCoins, type Coins, type Loot, type LootItem } from "@/lib/battle";

/**
 * Добыча с поверженного монстра: монеты по таблицам «Индивидуальные сокровища» DMG 5e (глава 7),
 * шанс вещи из каталога по CR и трофеи (части тела и мелочи) по типу существа.
 */

const roll = (n: number, sides: number, rand: () => number) => rollDice(`${n}d${sides}`, rand)?.total ?? 0;
const pick = <T,>(a: T[], rand: () => number) => a[Math.floor(rand() * a.length)];

/** Монеты по таблице DMG для CR 0–4 / 5–10 / 11–16 / 17+. */
export function rollCoins(cr: number, rand: () => number = Math.random): Coins {
  const c = noCoins();
  const d = 1 + Math.floor(rand() * 100);
  if (cr <= 4) {
    if (d <= 30) c.cp = roll(5, 6, rand);
    else if (d <= 60) c.sp = roll(4, 6, rand);
    else if (d <= 70) c.ep = roll(3, 6, rand);
    else if (d <= 95) c.gp = roll(3, 6, rand);
    else c.pp = roll(1, 6, rand);
  } else if (cr <= 10) {
    if (d <= 30) {
      c.cp = roll(2, 6, rand) * 100;
      c.ep = roll(1, 6, rand) * 10;
    } else if (d <= 60) {
      c.sp = roll(2, 6, rand) * 10;
      c.gp = roll(2, 6, rand) * 10;
    } else if (d <= 70) {
      c.ep = roll(3, 6, rand) * 10;
      c.gp = roll(2, 6, rand) * 10;
    } else if (d <= 95) c.gp = roll(4, 6, rand) * 10;
    else {
      c.gp = roll(2, 6, rand) * 10;
      c.pp = roll(3, 6, rand);
    }
  } else if (cr <= 16) {
    if (d <= 20) {
      c.sp = roll(4, 6, rand) * 100;
      c.gp = roll(1, 6, rand) * 100;
    } else if (d <= 35) {
      c.ep = roll(1, 6, rand) * 100;
      c.gp = roll(1, 6, rand) * 100;
    } else if (d <= 75) {
      c.gp = roll(2, 6, rand) * 100;
      c.pp = roll(1, 6, rand) * 10;
    } else {
      c.gp = roll(2, 6, rand) * 100;
      c.pp = roll(2, 6, rand) * 10;
    }
  } else {
    if (d <= 15) {
      c.ep = roll(2, 6, rand) * 1000;
      c.gp = roll(8, 6, rand) * 100;
    } else if (d <= 55) {
      c.gp = roll(1, 6, rand) * 1000;
      c.pp = roll(1, 6, rand) * 100;
    } else {
      c.gp = roll(1, 6, rand) * 1000;
      c.pp = roll(2, 6, rand) * 100;
    }
  }
  return c;
}

const TROPHIES: Record<string, string[]> = {
  beast: ["Шкура", "Клыки", "Когти", "Густой мех", "Рог", "Хвост"],
  monstrosity: ["Ядовитая железа", "Чешуйчатая шкура", "Коготь", "Глаз", "Крыло"],
  dragon: ["Драконья чешуя", "Клык", "Коготь", "Капля драконьей крови"],
  undead: ["Осколок кости", "Истлевший талисман", "Лоскут савана", "Потускневший перстень"],
  fiend: ["Обожжённый рог", "Серная пыль", "Клеймо с адской печатью"],
  celestial: ["Светящееся перо", "Блёстка небесного света"],
  construct: ["Шестерня", "Магический сердечник", "Пластина странного сплава"],
  elemental: ["Осколок стихии", "Комок живого пламени", "Капля бурлящей воды"],
  fey: ["Не вянущий лепесток", "Мерцающая пыльца", "Лунная нить"],
  giant: ["Огромный зуб", "Амулет из костей", "Тяжёлая золотая цепь"],
  ooze: ["Фляга живой слизи", "Растворённый самоцвет"],
  plant: ["Целебный корень", "Мешочек семян", "Смолистая шишка"],
  aberration: ["Странный глаз", "Склизкий щупалец", "Кристалл из иного мира"],
  humanoid: ["Потёртый амулет", "Письмо без подписи", "Обрывок карты", "Набор отмычек", "Печать на шнурке"],
  swarm: [],
};

/** Трофеи с примерной ценой в золотых; у животных и чудовищ их больше, у остальных — мелочи. */
export function rollTrophies(type: string, cr: number, rand: () => number = Math.random): string[] {
  const list = TROPHIES[type] ?? [];
  if (list.length === 0) return [];
  const rich = type === "beast" || type === "monstrosity" || type === "dragon";
  const count = rich ? 1 + Math.floor(rand() * 2) : rand() < 0.5 ? 1 : 0;
  const out: string[] = [];
  const pool = [...list];
  for (let i = 0; i < count && pool.length; i++) {
    const [name] = pool.splice(Math.floor(rand() * pool.length), 1);
    const price = Math.max(1, Math.round((cr + 1) * (2 + rand() * 6)));
    out.push(`${name} (≈${price} зм)`);
  }
  return out;
}

// Транспорт, скакуны, наборы и «товары» (скот, зерно) с монстров не падают.
const SKIP_CATEGORIES = new Set(["land-vehicle", "waterborne-vehicle", "mount", "equipment-pack", "trade-good"]);

/** Шанс вещи и веса редкостей по CR: «none» — обычное снаряжение без редкости. */
function itemPlan(cr: number): { chance: number; extra: number; rarities: [string, number][] } {
  if (cr <= 4) return { chance: 0.3, extra: 0, rarities: [["none", 6], ["common", 3], ["uncommon", 1]] };
  if (cr <= 10) return { chance: 0.45, extra: 0, rarities: [["none", 2], ["uncommon", 5], ["rare", 3]] };
  if (cr <= 16) return { chance: 0.6, extra: 0.2, rarities: [["uncommon", 2], ["rare", 5], ["very-rare", 3]] };
  return { chance: 0.75, extra: 0.4, rarities: [["rare", 2], ["very-rare", 5], ["legendary", 3]] };
}

const weighted = <T,>(list: [T, number][], rand: () => number): T => {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let r = rand() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1][0];
};

/** Все части добычи с одного монстра. items — каталог предметов. */
export function rollLoot(cr: number, type: string, items: Item[], rand: () => number = Math.random): Loot {
  const loot: Loot = { coins: rollCoins(cr, rand), items: [], trophies: rollTrophies(type, cr, rand) };
  const plan = itemPlan(cr);
  const drops = (rand() < plan.chance ? 1 : 0) + (rand() < plan.extra ? 1 : 0);
  const usable = items.filter((i) => !SKIP_CATEGORIES.has(i.category));
  const taken = new Set<string>();
  for (let n = 0; n < drops; n++) {
    const rarity = weighted(plan.rarities, rand);
    // Обычное снаряжение — недорогое, чтобы с крысы не падали латные доспехи.
    const maxPrice = cr <= 4 ? 100 : cr <= 10 ? 500 : 5000;
    let pool = usable.filter((i) => (i.rarity ?? "none") === rarity && !taken.has(i.name.toLowerCase()) && (rarity !== "none" || (i.price !== null && i.price <= maxPrice)));
    if (pool.length === 0) pool = usable.filter((i) => i.rarity && !taken.has(i.name.toLowerCase()));
    if (pool.length === 0) continue;
    const item = pick(pool, rand);
    taken.add(item.name.toLowerCase());
    const li: LootItem = { key: item.key, name: item.name, rarity: item.rarity, price: item.price };
    loot.items.push(li);
  }
  return loot;
}
