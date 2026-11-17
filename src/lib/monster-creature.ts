/**
 * Монстр мастера (формат Open5e) → существо приложения игрока (JSON схемы Creature, shared/…/core/Creatures.kt).
 * Механику (бонус, кости, дальность, мультиатака) разбираем из английского статблока, названия и тексты берём из перевода
 * (loc, те же массивы в том же порядке). Чистый модуль без обращений к диску: проверяется tests/monster-creature.test.mjs.
 */
import type { Monster, NamedDesc } from "@/lib/open5e";

export type CreatureAction = {
  name: string;
  text: string;
  attackBonus?: number;
  dice?: string;
  damageType?: string;
  reach?: string;
  cost?: "BONUS" | "REACTION" | "NONE";
  onHit?: object[];
  after?: string;
  /** Мультиатака: какие действия и сколько раз; приложение берёт это вместо разбора текста. */
  parts?: { name: string; count: number }[];
};

export type CreatureJson = {
  id: string;
  name: string;
  size: string;
  ac: number;
  maxHp: number;
  hp: number;
  speeds: Record<string, number>;
  abilities: Record<string, number>;
  skills: Record<string, number>;
  senses: Record<string, number>;
  traits: { name: string; text: string }[];
  actions: CreatureAction[];
};

const SIZES = ["TINY", "SMALL", "MEDIUM", "LARGE", "HUGE", "GARGANTUAN"];
const SKILLS = new Set([
  "ACROBATICS", "ANIMAL_HANDLING", "ARCANA", "ATHLETICS", "DECEPTION", "HISTORY", "INSIGHT", "INTIMIDATION", "INVESTIGATION",
  "MEDICINE", "NATURE", "PERCEPTION", "PERFORMANCE", "PERSUASION", "RELIGION", "SLEIGHT_OF_HAND", "STEALTH", "SURVIVAL",
]);
const MOVES = ["walk", "fly", "swim", "climb", "burrow"];
const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"];
const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const clean = (s: string | undefined | null) => (s ?? "").replace(/\\n/g, "\n").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Src = { en: NamedDesc & { attack_bonus?: number | null; damage_dice?: string | null; damage_bonus?: number | null }; name: string; text: string; cost?: "BONUS" | "REACTION" | "NONE" };

function sources(m: Monster, loc: Monster): Src[] {
  const pick = (key: "actions" | "bonus_actions" | "reactions" | "legendary_actions", cost?: Src["cost"]) =>
    (m[key] ?? []).map((en, i) => {
      const l = loc[key]?.[i] ?? en;
      return { en, name: l.name, text: clean(l.desc), cost };
    });
  return [...pick("actions"), ...pick("bonus_actions", "BONUS"), ...pick("reactions", "REACTION"), ...pick("legendary_actions", "NONE")];
}

function actionOf(s: Src): CreatureAction {
  const desc = clean(s.en.desc);
  const a: CreatureAction = { name: s.name, text: s.text };
  const bonus = s.en.attack_bonus ?? (/([+-]\d+)\s*to hit/i.exec(desc)?.[1] !== undefined ? Number(/([+-]\d+)\s*to hit/i.exec(desc)![1]) : undefined);
  if (bonus !== undefined && !Number.isNaN(bonus)) a.attackBonus = bonus;
  const dmg = /\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z-]+)\s+damage/i.exec(desc);
  if (s.en.damage_dice) a.dice = s.en.damage_dice.replace(/\s+/g, "") + (s.en.damage_bonus ? (s.en.damage_bonus > 0 ? `+${s.en.damage_bonus}` : `${s.en.damage_bonus}`) : "");
  else if (dmg) a.dice = dmg[1].replace(/\s+/g, "");
  if (dmg) a.damageType = dmg[2][0].toUpperCase() + dmg[2].slice(1).toLowerCase();
  const reach = /(?:reach|range)\s+(\d+(?:\/\d+)?)\s*ft/i.exec(desc);
  if (reach && a.attackBonus !== undefined) a.reach = `${reach[1]} фт`;
  if (s.cost) a.cost = s.cost;
  return a;
}

/** «The lion makes two Rend attacks» → части мультиатаки; имена — из перевода, число слов — из английского текста. */
function multiParts(all: Src[], i: number): CreatureAction["parts"] {
  const self = all[i];
  if (!/multiattack|мультиатак/i.test(self.en.name)) return undefined;
  const text = clean(self.en.desc);
  const parts = all
    .filter((o, j) => j !== i && text.toLowerCase().includes(o.en.name.toLowerCase()))
    .map((o) => {
      const word = new RegExp(`(\\w+)\\s+${esc(o.en.name)}`, "i").exec(text)?.[1].toLowerCase();
      return { name: o.name, count: Number(word) || COUNTS[word ?? ""] || 1 };
    });
  return parts.length ? parts : undefined;
}

/** Напрыгивание (лев, тигр, пантера): когти со спасброском Силы, затем бонусный укус. Остальные цепочки статблок не описывает — они остаются текстом. */
function pounce(m: Monster, acts: CreatureAction[], srcs: Src[]) {
  const trait = (m.special_abilities ?? []).find((t) => /^pounce$/i.test(t.name));
  const find = (re: RegExp) => srcs.findIndex((s) => re.test(s.en.name) && s.en.desc);
  const claw = find(/^claws?$/i), bite = find(/^bite$/i);
  if (!trait || claw < 0 || bite < 0) return;
  const dc = Number(/DC\s*(\d+)/i.exec(trait.desc)?.[1]);
  const name = "Напрыгивание + Когти";
  acts.push(
    {
      ...acts[claw], name, text: "Переместитесь не менее чем на 20 футов по прямой к цели, затем атакуйте когтями.",
      onHit: [{ moment: "HIT", text: "Напрыгивание: цель совершает спасбросок.", save: { ability: "STR", ...(dc ? { dc } : {}), onFail: "Цель сбита с ног." } }],
    },
    { ...acts[bite], name: "Укус (напрыгивание)", text: "Только если цель сбита с ног напрыгиванием в этом ходу.", cost: "BONUS", after: name },
  );
}

export function monsterToCreature(m: Monster, loc: Monster = m): CreatureJson {
  const srcs = sources(m, loc);
  const actions = srcs.map(actionOf);
  srcs.forEach((_, i) => { const p = multiParts(srcs, i); if (p) actions[i].parts = p; });
  pounce(m, actions, srcs);

  const senses: Record<string, number> = {};
  for (const s of SENSES) {
    const v = new RegExp(`${s}\\s+(\\d+)`, "i").exec(m.senses ?? "")?.[1];
    if (v) senses[s.toUpperCase()] = Number(v);
  }
  const skills: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.skills ?? {})) {
    const key = k.trim().replace(/[\s-]+/g, "_").toUpperCase();
    if (SKILLS.has(key) && typeof v === "number") skills[key] = v;
  }
  const speeds: Record<string, number> = {};
  for (const k of MOVES) if (typeof m.speed?.[k] === "number") speeds[k.toUpperCase()] = m.speed[k] as number;
  const size = (m.size ?? "").split(/[\s/]/)[0].toUpperCase();

  return {
    id: m.slug ?? m.name,
    name: loc.name,
    size: SIZES.includes(size) ? size : "MEDIUM",
    ac: m.armor_class,
    maxHp: m.hit_points,
    hp: m.hit_points,
    speeds: Object.keys(speeds).length ? speeds : { WALK: 30 },
    abilities: { STR: m.strength, DEX: m.dexterity, CON: m.constitution, INT: m.intelligence, WIS: m.wisdom, CHA: m.charisma },
    skills,
    senses,
    traits: (m.special_abilities ?? []).map((t, i) => ({ name: loc.special_abilities?.[i]?.name ?? t.name, text: clean(loc.special_abilities?.[i]?.desc ?? t.desc) })),
    actions,
  };
}
