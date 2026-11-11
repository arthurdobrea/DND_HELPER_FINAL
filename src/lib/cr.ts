import type { Monster } from "@/lib/open5e";
import { buildCards } from "@/lib/npc-actions";

/** Последовательность CR; индекс в ней — «шаг» опасности. */
export const CR_LIST = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export const crText = (v: number) => (v === 0.125 ? "1/8" : v === 0.25 ? "1/4" : v === 0.5 ? "1/2" : String(v));

/** Бонус мастерства по CR. */
export const profBonus = (cr: number) => (cr < 1 ? 2 : 2 + Math.floor((cr - 1) / 4));

/**
 * Таблица DMG (2014) «Monster Statistics by Challenge Rating»:
 * cr, КД, диапазон хитов [от, до], бонус атаки, диапазон урона за раунд [от, до], Сл спасброска.
 */
type Row = { cr: number; ac: number; hp: [number, number]; atk: number; dpr: [number, number]; dc: number };
const ROWS: Row[] = [
  { cr: 0, ac: 13, hp: [1, 6], atk: 3, dpr: [0, 1], dc: 13 },
  { cr: 0.125, ac: 13, hp: [7, 35], atk: 3, dpr: [2, 3], dc: 13 },
  { cr: 0.25, ac: 13, hp: [36, 49], atk: 3, dpr: [4, 5], dc: 13 },
  { cr: 0.5, ac: 13, hp: [50, 70], atk: 3, dpr: [6, 8], dc: 13 },
  { cr: 1, ac: 13, hp: [71, 85], atk: 3, dpr: [9, 14], dc: 13 },
  { cr: 2, ac: 13, hp: [86, 100], atk: 3, dpr: [15, 20], dc: 13 },
  { cr: 3, ac: 13, hp: [101, 115], atk: 4, dpr: [21, 26], dc: 13 },
  { cr: 4, ac: 14, hp: [116, 130], atk: 5, dpr: [27, 32], dc: 14 },
  { cr: 5, ac: 15, hp: [131, 145], atk: 6, dpr: [33, 38], dc: 15 },
  { cr: 6, ac: 15, hp: [146, 160], atk: 6, dpr: [39, 44], dc: 15 },
  { cr: 7, ac: 15, hp: [161, 175], atk: 6, dpr: [45, 50], dc: 15 },
  { cr: 8, ac: 16, hp: [176, 190], atk: 7, dpr: [51, 56], dc: 16 },
  { cr: 9, ac: 16, hp: [191, 205], atk: 7, dpr: [57, 62], dc: 16 },
  { cr: 10, ac: 17, hp: [206, 220], atk: 7, dpr: [63, 68], dc: 16 },
  { cr: 11, ac: 17, hp: [221, 235], atk: 8, dpr: [69, 74], dc: 17 },
  { cr: 12, ac: 17, hp: [236, 250], atk: 8, dpr: [75, 80], dc: 17 },
  { cr: 13, ac: 18, hp: [251, 265], atk: 8, dpr: [81, 86], dc: 18 },
  { cr: 14, ac: 18, hp: [266, 280], atk: 8, dpr: [87, 92], dc: 18 },
  { cr: 15, ac: 18, hp: [281, 295], atk: 8, dpr: [93, 98], dc: 18 },
  { cr: 16, ac: 18, hp: [296, 310], atk: 9, dpr: [99, 104], dc: 18 },
  { cr: 17, ac: 19, hp: [311, 325], atk: 10, dpr: [105, 110], dc: 19 },
  { cr: 18, ac: 19, hp: [326, 340], atk: 10, dpr: [111, 116], dc: 19 },
  { cr: 19, ac: 19, hp: [341, 355], atk: 10, dpr: [117, 122], dc: 19 },
  { cr: 20, ac: 19, hp: [356, 400], atk: 10, dpr: [123, 140], dc: 19 },
  { cr: 21, ac: 19, hp: [401, 445], atk: 11, dpr: [141, 158], dc: 20 },
  { cr: 22, ac: 19, hp: [446, 490], atk: 11, dpr: [159, 176], dc: 20 },
  { cr: 23, ac: 19, hp: [491, 535], atk: 11, dpr: [177, 194], dc: 20 },
  { cr: 24, ac: 19, hp: [536, 580], atk: 12, dpr: [195, 212], dc: 21 },
  { cr: 25, ac: 19, hp: [581, 625], atk: 12, dpr: [213, 230], dc: 21 },
  { cr: 26, ac: 19, hp: [626, 670], atk: 12, dpr: [231, 248], dc: 21 },
  { cr: 27, ac: 19, hp: [671, 715], atk: 13, dpr: [249, 266], dc: 22 },
  { cr: 28, ac: 19, hp: [716, 760], atk: 13, dpr: [267, 284], dc: 22 },
  { cr: 29, ac: 19, hp: [761, 805], atk: 13, dpr: [285, 302], dc: 22 },
  { cr: 30, ac: 19, hp: [806, 850], atk: 14, dpr: [303, 320], dc: 23 },
];

const last = ROWS.length - 1;

/** Индекс строки по значению: первая строка, чей верхний предел не меньше значения (больше максимума — последняя). */
function rowByRange(value: number, pick: (r: Row) => [number, number]): number {
  const i = ROWS.findIndex((r) => value <= pick(r)[1]);
  return i === -1 ? last : i;
}

const clampIdx = (i: number) => Math.max(0, Math.min(last, i));

export type CrEstimate = {
  /** Итоговый CR (среднее защитного и атакующего). */
  cr: number;
  defCr: number;
  offCr: number;
  dpr: number;
  /** Чем меряли атаку: бонус попадания или Сл спасброска. */
  offBy: "attack" | "save" | "none";
  offValue: number;
  notes: string[];
};

/**
 * Оценка CR по методике DMG 2014: защитный CR — по хитам, ±1 за каждые 2 пункта КД относительно таблицы;
 * атакующий — по урону за раунд, ±1 за каждые 2 пункта бонуса атаки (или Сл) относительно таблицы; итог — среднее.
 * Урон за раунд — лучшее действие (атаки умножаются на число атак мультиатаки). Заклинания в оценку не входят.
 */
export function estimateCr(m: Monster, attacksPerRound = 1): CrEstimate {
  const notes: string[] = [];

  // Защита
  const defBase = rowByRange(m.hit_points, (r) => r.hp);
  const defAdj = Math.trunc((m.armor_class - ROWS[defBase].ac) / 2);
  const defIdx = clampIdx(defBase + defAdj);

  // Атака: лучшее действие
  const cards = buildCards(m).filter((c) => c.section === "action" && !c.multiattack);
  let dpr = 0;
  let offBy: CrEstimate["offBy"] = "none";
  let offValue = 0;
  for (const c of cards) {
    const sum = c.damage.reduce((n, d) => n + d.avg, 0);
    if (sum <= 0) continue;
    const isAttack = !!c.attack;
    const total = isAttack ? sum * Math.max(1, attacksPerRound) : sum;
    if (total > dpr) {
      dpr = total;
      offBy = isAttack ? "attack" : c.saveDc !== null ? "save" : "none";
      offValue = isAttack ? c.attack!.bonus : (c.saveDc ?? 0);
    }
  }
  if (dpr === 0) notes.push("Нет атакующих действий с уроном — атакующая часть CR считается нулевой.");
  const offBase = dpr === 0 ? 0 : rowByRange(dpr, (r) => r.dpr);
  let offAdj = 0;
  if (offBy === "attack") offAdj = Math.trunc((offValue - ROWS[offBase].atk) / 2);
  if (offBy === "save" && offValue) offAdj = Math.trunc((offValue - ROWS[offBase].dc) / 2);
  const offIdx = dpr === 0 ? 0 : clampIdx(offBase + offAdj);

  if (/spellcasting|заклинани/i.test((m.special_abilities ?? []).map((a) => a.name).join(" "))) {
    notes.push("Урон заклинаний не учитывается — если он основной, добавьте его как «область» или «атаку».");
  }
  if ((m.damage_resistances || m.damage_immunities) && /(nonmagical|немагическ)/i.test(`${m.damage_resistances} ${m.damage_immunities}`)) {
    notes.push("Есть сопротивление немагическому урону — реальная живучесть выше оценки.");
  }

  const idx = Math.round((defIdx + offIdx) / 2);
  return { cr: ROWS[clampIdx(idx)].cr, defCr: ROWS[defIdx].cr, offCr: ROWS[offIdx].cr, dpr: Math.round(dpr), offBy, offValue, notes };
}
