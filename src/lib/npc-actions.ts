import type { Monster, NamedDesc } from "@/lib/open5e";

/** Разделы статблока, из которых строятся карточки сбоку от листа NPC. */
export type CardSection = "action" | "bonus" | "reaction" | "legendary" | "special";

export type DamagePart = { avg: number; dice: string; type: string };

export type AbilityCard = {
  section: CardSection;
  name: string;
  desc: string;
  multiattack: boolean;
  /** Атака: вид («Рукопашная атака оружием»), бонус к попаданию и досягаемость/дистанция. */
  attack: { kind: string; bonus: number; range: string } | null;
  damage: DamagePart[];
  /** Спасбросок цели: «Сл 13». */
  saveDc: number | null;
  /** Использование: «3/день», «Перезарядка 5–6». */
  usage: string;
};

type Action = NamedDesc & { attack_bonus?: number | null; damage_dice?: string | null; damage_bonus?: number | null };

const KIND_RE =
  /(Melee or Ranged|Melee|Ranged)\s+(Weapon|Spell)\s+Attack|(Рукопашная или дальнобойная|Рукопашная|Дальнобойная)\s+атака\s+(оружием|заклинанием)/i;
const RANGE_RE = /(reach\s+\d+\s*ft\.?(?:\s*or\s*range\s+[\d/]+\s*ft\.?)?|range\s+[\d/]+\s*ft\.?|досягаемость\s+\d+\s*фт\.?|дистанция\s+[\d/]+\s*фт\.?)/i;
const BONUS_RE = /([+-]\d+)\s*(?:to hit|к попаданию|к броску атаки)/i;
const DAMAGE_RE = /(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([\p{L}-]+(?:\s+и\s+[\p{L}-]+)?)\s+(?:damage|урон)/giu;
const SAVE_RE = /(?:DC|Сл)\s*(\d+)/i;
const USAGE_RE = /\((Recharge[^)]*|Перезарядка[^)]*|\d+\/(?:Day|день)[^)]*|Costs \d+ Actions|Стоит \d+ действ[^)]*)\)/i;

const KIND_RU: Record<string, string> = {
  "melee weapon": "Рукопашная атака оружием",
  "ranged weapon": "Дальнобойная атака оружием",
  "melee or ranged weapon": "Рукопашная или дальнобойная атака оружием",
  "melee spell": "Рукопашная атака заклинанием",
  "ranged spell": "Дальнобойная атака заклинанием",
};
const DAMAGE_RU: Record<string, string> = {
  acid: "кислотой", bludgeoning: "дробящий", cold: "холодом", fire: "огнём", force: "силовым полем", lightning: "электричеством",
  necrotic: "некротический", piercing: "колющий", poison: "ядом", psychic: "психический", radiant: "излучением", slashing: "рубящий", thunder: "звуком",
};

function cardOf(section: CardSection, a: Action): AbilityCard {
  const desc = (a.desc ?? "").replace(/\\n/g, "\n").trim();
  const kindMatch = KIND_RE.exec(desc);
  const kind = kindMatch
    ? kindMatch[1]
      ? (KIND_RU[`${kindMatch[1].toLowerCase()} ${kindMatch[2].toLowerCase()}`] ?? kindMatch[0])
      : kindMatch[0].replace(/^./, (c) => c.toUpperCase())
    : "";
  const bonusText = BONUS_RE.exec(desc)?.[1];
  const bonus = a.attack_bonus ?? (bonusText !== undefined ? Number(bonusText) : null);

  const damage: DamagePart[] = [];
  for (const m of desc.matchAll(DAMAGE_RE)) {
    const type = m[3].trim().toLowerCase();
    damage.push({ avg: Number(m[1]), dice: m[2].replace(/\s+/g, ""), type: DAMAGE_RU[type] ?? type });
  }
  // Поля Open5e надёжнее текста, если разбор по тексту ничего не нашёл.
  if (damage.length === 0 && a.damage_dice) {
    damage.push({ avg: 0, dice: `${a.damage_dice}${a.damage_bonus ? (a.damage_bonus >= 0 ? `+${a.damage_bonus}` : a.damage_bonus) : ""}`, type: "" });
  }

  return {
    section,
    name: a.name,
    desc,
    multiattack: /multiattack|мультиатак/i.test(a.name),
    attack: bonus !== null && !Number.isNaN(bonus) ? { kind, bonus, range: RANGE_RE.exec(desc)?.[1] ?? "" } : null,
    damage,
    saveDc: SAVE_RE.exec(desc) ? Number(SAVE_RE.exec(desc)![1]) : null,
    usage: USAGE_RE.exec(a.name)?.[1] ?? "",
  };
}

/** Карточки действий и особенностей существа, в порядке: мультиатака, атаки, прочие действия, бонусные, реакции, легендарные, особенности. */
export function buildCards(m: Monster): AbilityCard[] {
  const list = (section: CardSection, items: NamedDesc[] | null | undefined) => (items ?? []).map((a) => cardOf(section, a as Action));
  const actions = list("action", m.actions);
  const ordered = [
    ...actions.filter((c) => c.multiattack),
    ...actions.filter((c) => !c.multiattack && c.attack),
    ...actions.filter((c) => !c.multiattack && !c.attack),
    ...list("bonus", m.bonus_actions),
    ...list("reaction", m.reactions),
    ...list("legendary", m.legendary_actions),
    ...list("special", m.special_abilities),
  ];
  return ordered;
}

/** Бросок «NdM±K»: возвращает отдельные кубы, модификатор и сумму. */
export function rollDice(expr: string, rand: () => number = Math.random): { rolls: number[]; mod: number; total: number } | null {
  const m = /^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$/.exec(expr.replace(/\s+/g, ""));
  if (!m) return null;
  const n = Math.min(100, Number(m[1]));
  const sides = Number(m[2]);
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(rand() * sides));
  const mod = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  return { rolls, mod, total: rolls.reduce((a, b) => a + b, 0) + mod };
}
