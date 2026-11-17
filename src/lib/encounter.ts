import type { MonsterEntry } from "@/lib/catalog";

/**
 * Генератор столкновений по правилам DMG 5e (глава 13): бюджет опыта по уровням героев,
 * множитель за число монстров, четыре уровня сложности. Без серверных зависимостей.
 */

export const DIFFICULTIES = [
  { key: "easy", label: "Лёгкий", hint: "Герои почти не рискуют", color: "#34d399" },
  { key: "medium", label: "Средний", hint: "Потратят часть ресурсов", color: "#fbbf24" },
  { key: "hard", label: "Тяжёлый", hint: "Возможны потери и тяжёлые ранения", color: "#fb923c" },
  { key: "deadly", label: "Смертельный", hint: "Кто-то может погибнуть", color: "#f87171" },
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]["key"];

// Пороги опыта на одного героя уровня 1…20: лёгкий / средний / тяжёлый / смертельный.
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500],
  [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];

const XP_BY_CR: Record<string, number> = {
  "0": 10, "0.125": 25, "0.25": 50, "0.5": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300,
  "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000,
  "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};
export const xpForCr = (cr: number) => XP_BY_CR[String(cr)] ?? 0;

const DIFF_INDEX: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, deadly: 3 };
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4];

/** Множитель опыта за число монстров; для малой (<3) партии на ступень выше, для большой (≥6) — ниже. */
export function multiplier(monsters: number, partySize: number): number {
  let i = monsters <= 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6;
  if (partySize < 3) i = Math.min(i + 1, MULTIPLIERS.length - 1);
  else if (partySize >= 6) i = Math.max(i - 1, 0);
  return MULTIPLIERS[i];
}

const clampLevel = (l: number) => Math.min(20, Math.max(1, Math.round(l) || 1));

/** Суммарные пороги партии: [лёгкий, средний, тяжёлый, смертельный]. */
export function partyThresholds(levels: number[]): [number, number, number, number] {
  const sum: [number, number, number, number] = [0, 0, 0, 0];
  for (const l of levels) THRESHOLDS[clampLevel(l) - 1].forEach((v, i) => (sum[i] += v));
  return sum;
}

/** Какой сложности соответствует скорректированный опыт. */
export function difficultyOf(adjusted: number, thresholds: number[]): Difficulty | "trivial" {
  for (let i = 3; i >= 0; i--) if (adjusted >= thresholds[i]) return DIFFICULTIES[i].key;
  return "trivial";
}

// ---------- Типы врагов ----------

const BANDIT_RE =
  /bandit|thug|brigand|highwayman|cutthroat|raider|marauder|pirate|mercenary|gladiator|berserker|assassin|spy\b|scout|veteran|guard|knight|warrior|captain|commander|tribal|gang|outlaw|rogue|swashbuckler|duelist|archer|soldier|enforcer/i;
const CULT_RE = /cult|acolyte|fanatic|priest|necromancer|warlock|occultist|devotee|zealot|ritualist|shaman|druid/i;

export const ENCOUNTER_TYPES: { key: string; label: string; icon: string; match: (m: MonsterEntry) => boolean }[] = [
  { key: "undead", label: "Нежить", icon: "💀", match: (m) => m.type === "undead" },
  { key: "bandits", label: "Бандиты", icon: "🗡️", match: (m) => m.type === "humanoid" && BANDIT_RE.test(m.name) },
  { key: "cultists", label: "Культисты", icon: "🕯️", match: (m) => m.type === "humanoid" && CULT_RE.test(m.name) },
  { key: "beast", label: "Звери", icon: "🐺", match: (m) => m.type === "beast" },
  { key: "swarm", label: "Рои", icon: "🐝", match: (m) => m.type === "swarm" },
  { key: "goblinoid", label: "Гоблиноиды", icon: "👺", match: (m) => m.subtype.includes("goblinoid") || /goblin|hobgoblin|bugbear/i.test(m.name) },
  { key: "humanoid", label: "Гуманоиды", icon: "🧑", match: (m) => m.type === "humanoid" },
  { key: "monstrosity", label: "Монстры", icon: "🦂", match: (m) => m.type === "monstrosity" },
  { key: "dragon", label: "Драконы", icon: "🐉", match: (m) => m.type === "dragon" },
  { key: "fiend", label: "Исчадия (демоны, дьяволы)", icon: "😈", match: (m) => m.type === "fiend" },
  { key: "giant", label: "Великаны", icon: "🗿", match: (m) => m.type === "giant" },
  { key: "fey", label: "Феи", icon: "🧚", match: (m) => m.type === "fey" },
  { key: "elemental", label: "Элементали", icon: "🔥", match: (m) => m.type === "elemental" },
  { key: "construct", label: "Конструкты", icon: "⚙️", match: (m) => m.type === "construct" },
  { key: "ooze", label: "Слизи", icon: "🟢", match: (m) => m.type === "ooze" },
  { key: "plant", label: "Растения", icon: "🌿", match: (m) => m.type === "plant" },
  { key: "aberration", label: "Аберрации", icon: "👁️", match: (m) => m.type === "aberration" },
  { key: "celestial", label: "Небожители", icon: "😇", match: (m) => m.type === "celestial" },
];

// ---------- Генерация ----------

export type EncounterGroup = { monster: MonsterEntry; count: number; xp: number };
export type Encounter = {
  groups: EncounterGroup[];
  totalXp: number;
  adjustedXp: number;
  difficulty: Difficulty | "trivial";
  /** Сколько в итоге получилось монстров. */
  monsters: number;
  /** Пояснения к результату: например, что точного по CR монстра для выбранных типов не нашлось. */
  notes: string[];
};

/** Детерминированный генератор случайных чисел: одно и то же seed даёт то же столкновение (F5 ничего не меняет). */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Одно название — одна запись (в каталоге одни и те же монстры из разных книг); приоритет у SRD. */
export function dedupeByName(list: MonsterEntry[]): MonsterEntry[] {
  const best = new Map<string, MonsterEntry>();
  for (const m of list) {
    const k = m.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || (m.key.startsWith("srd") && !cur.key.startsWith("srd"))) best.set(k, m);
  }
  return [...best.values()];
}

export type GenerateOptions = {
  levels: number[];
  difficulty: Difficulty;
  boss: boolean;
  pool: MonsterEntry[];
  seed: number;
};

/**
 * Желаемый CR главного врага относительно среднего уровня героев:
 * лёгкий — на 2 ниже, средний — равный уровню, тяжёлый и смертельный — на 2 выше.
 * Это предпочтение: врагов должно быть не меньше, чем героев (до двух на героя), а бюджет опыта ограничен,
 * поэтому при большой партии главный враг может получиться слабее (это отмечается в notes).
 */
export const CR_OFFSET: Record<Difficulty, number> = { easy: -2, medium: 0, hard: 2, deadly: 2 };

/** Сколько врагов должно быть: от одного до двух на героя (минимум два врага при партии из одного). */
export function enemyRange(partySize: number): [number, number] {
  const min = Math.max(1, partySize);
  return [min, Math.min(16, Math.max(min + 1, partySize * 2))];
}

export function generateEncounter({ levels, difficulty, boss, pool, seed }: GenerateOptions): Encounter | null {
  const rand = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const size = levels.length;
  const avg = levels.reduce((s, l) => s + clampLevel(l), 0) / Math.max(1, size);
  const th = partyThresholds(levels);
  const d = DIFF_INDEX[difficulty];
  const lo = th[d];
  const hi = d < 3 ? th[d + 1] : lo * 1.35;
  const mid = lo + (hi - lo) * 0.4;
  const center = avg + CR_OFFSET[difficulty];
  const [nMin, nMax] = enemyRange(size);
  const notes: string[] = [];

  type Cand = { m: MonsterEntry; xp: number };
  const sorted: Cand[] = dedupeByName(pool)
    .map((m) => ({ m, xp: xpForCr(m.cr) }))
    .filter((x) => x.xp > 0)
    .sort((a, b) => a.m.cr - b.m.cr);
  if (sorted.length === 0) return null;

  // Свита и «массовка»: не слабее CR avg/16 (на 2 уровне — от 1/8, на 12 — от 1), чтобы не плодить безобидных крыс.
  const minCr = avg / 16;
  const lowStart = sorted.findIndex((x) => x.m.cr >= minCr);
  const fodderFrom = lowStart < 0 ? 0 : lowStart;

  // Кто может быть главным врагом. Босс — строго выше среднего уровня героев.
  const upper = center + 1;
  let aPool: Cand[];
  if (boss) {
    const above = sorted.filter((x) => x.m.cr > avg);
    const near = above.filter((x) => x.m.cr <= Math.max(avg + 1, upper));
    aPool = near.length ? near : above;
    if (aPool.length === 0) {
      aPool = sorted.filter((x) => x.m.cr === sorted[sorted.length - 1].m.cr);
      notes.push("Среди выбранных типов нет монстров с CR выше уровня героев — взяты самые сильные из доступных.");
    }
  } else {
    aPool = sorted.filter((x) => x.m.cr <= upper && x.m.cr >= minCr);
    if (aPool.length === 0) aPool = sorted.filter((x) => x.m.cr <= upper);
    if (aPool.length === 0) aPool = sorted.slice(0, 12);
  }
  // Босс-легенда встречается втрое чаще.
  const aWeighted = aPool.flatMap((x) => (boss && x.m.legendary ? [x, x, x] : [x]));

  const build = (parts: [Cand, number][]): Encounter => {
    const count = parts.reduce((n, [, k]) => n + k, 0);
    const total = parts.reduce((n, [x, k]) => n + x.xp * k, 0);
    const adjusted = Math.round(total * multiplier(count, size));
    return {
      groups: parts.map(([x, k]) => ({ monster: x.m, count: k, xp: x.xp })),
      totalXp: total,
      adjustedXp: adjusted,
      difficulty: difficultyOf(adjusted, th),
      monsters: count,
      notes: [],
    };
  };

  // Подходят: опыт в полосе выбранной сложности и число врагов в нужных пределах.
  const good: { e: Encounter; score: number }[] = [];
  let best: { e: Encounter; penalty: number } | null = null;
  const bossTarget = Math.max(avg + 1, center);
  const mainTarget = boss ? bossTarget : center;

  for (let i = 0; i < 4000; i++) {
    const a = pick(aWeighted);
    // Свита — не сильнее главного врага, другие названия.
    let end = sorted.length;
    while (end > fodderFrom && sorted[end - 1].m.cr > a.m.cr) end--;
    const supportPool = sorted.slice(fodderFrom, end).filter((x) => x.m.name !== a.m.name && (!boss || x.m.cr < a.m.cr));
    const total = nMin + Math.floor(rand() * (nMax - nMin + 1));
    const aCount = boss ? 1 : 1 + Math.floor(rand() * Math.max(1, Math.min(3, Math.floor(total / 3))));
    const parts: [Cand, number][] = [[a, aCount]];

    if (supportPool.length && total > aCount) {
      // 1–3 вида свиты (чем разнообразнее, тем лучше), численность делится случайно.
      const kinds = Math.min(supportPool.length, total - aCount, 1 + Math.floor(rand() * 3));
      const chosen: Cand[] = [];
      for (let t = 0; t < 8 && chosen.length < kinds; t++) {
        const c = pick(supportPool);
        if (!chosen.some((x) => x.m.name === c.m.name)) chosen.push(c);
      }
      const counts = chosen.map(() => 1);
      for (let r = total - aCount - chosen.length; r > 0; r--) counts[Math.floor(rand() * counts.length)]++;
      chosen.forEach((c, k) => parts.push([c, counts[k]]));
    } else if (!boss && total > aCount) {
      parts[0][1] = total; // свиты нет — только главный враг
    }

    const e = build(parts);
    const inRange = e.monsters >= nMin && e.monsters <= nMax;
    const inBand = e.adjustedXp >= lo && e.adjustedXp < hi;
    const penalty = Math.abs(e.adjustedXp - mid) / Math.max(1, mid) + (inRange ? 0 : 5);
    if (!best || penalty < best.penalty) best = { e, penalty };
    if (inBand && inRange) {
      const kinds = parts.length;
      good.push({ e, score: -Math.abs(a.m.cr - mainTarget) + 0.45 * kinds + rand() * 1.2 });
    }
  }

  let result: Encounter;
  if (good.length) {
    result = good.reduce((m, g) => (g.score > m.score ? g : m)).e;
  } else if (best) {
    result = (best as { e: Encounter }).e;
    result.notes.push(
      result.adjustedXp > hi
        ? "Сложность получилась выше выбранной: меньше врагов или слабее по CR при этом уже не набрать."
        : "Точно попасть в выбранную сложность не удалось — взят ближайший вариант.",
    );
  } else return null;

  result.groups.sort((x, y) => y.monster.cr - x.monster.cr || y.xp - x.xp);
  const topCr = result.groups[0].monster.cr;
  if (topCr < mainTarget - 1) {
    result.notes.push(
      `Главный враг слабее желаемого (CR ${result.groups[0].monster.crLabel} вместо ≈ ${Math.max(0, Math.round(mainTarget))}): при ${size} героях врагов должно быть от ${nMin} до ${nMax}, а бюджет опыта выбранной сложности ограничен.`,
    );
  }
  return result;
}
