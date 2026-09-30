/** Лист персонажа D&D 5e: модель, значения по умолчанию и расчёты. */

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, { short: string; full: string }> = {
  str: { short: "СИЛ", full: "Сила" },
  dex: { short: "ЛОВ", full: "Ловкость" },
  con: { short: "ТЕЛ", full: "Телосложение" },
  int: { short: "ИНТ", full: "Интеллект" },
  wis: { short: "МДР", full: "Мудрость" },
  cha: { short: "ХАР", full: "Харизма" },
};

export const SKILLS = [
  { key: "acrobatics", label: "Акробатика", ability: "dex" },
  { key: "animal", label: "Уход за животными", ability: "wis" },
  { key: "arcana", label: "Магия", ability: "int" },
  { key: "athletics", label: "Атлетика", ability: "str" },
  { key: "deception", label: "Обман", ability: "cha" },
  { key: "history", label: "История", ability: "int" },
  { key: "insight", label: "Проницательность", ability: "wis" },
  { key: "intimidation", label: "Запугивание", ability: "cha" },
  { key: "investigation", label: "Анализ", ability: "int" },
  { key: "medicine", label: "Медицина", ability: "wis" },
  { key: "nature", label: "Природа", ability: "int" },
  { key: "perception", label: "Внимательность", ability: "wis" },
  { key: "performance", label: "Выступление", ability: "cha" },
  { key: "persuasion", label: "Убеждение", ability: "cha" },
  { key: "religion", label: "Религия", ability: "int" },
  { key: "sleight", label: "Ловкость рук", ability: "dex" },
  { key: "stealth", label: "Скрытность", ability: "dex" },
  { key: "survival", label: "Выживание", ability: "wis" },
] as const satisfies readonly { key: string; label: string; ability: AbilityKey }[];
export type SkillKey = (typeof SKILLS)[number]["key"];

/** 0 — нет владения, 1 — владение, 2 — компетентность (двойной бонус). */
export type Proficiency = 0 | 1 | 2;

export type Attack = { name: string; bonus: string; damage: string };
export type SpellSlot = { max: number; used: number };

export type CharacterSheet = {
  name: string;
  className: string;
  level: number;
  background: string;
  playerName: string;
  race: string;
  alignment: string;
  xp: number;

  abilities: Record<AbilityKey, number>;
  saves: Record<AbilityKey, boolean>;
  skills: Record<SkillKey, Proficiency>;
  inspiration: boolean;
  /** null — считать по уровню */
  profBonusOverride: number | null;

  ac: number;
  initiativeBonus: number;
  speed: number;

  hpMax: number;
  hpCurrent: number;
  hpTemp: number;
  hitDice: string;
  hitDiceUsed: number;
  deathSuccess: number;
  deathFail: number;

  attacks: Attack[];
  coins: { cp: number; sp: number; ep: number; gp: number; pp: number };
  equipment: string;

  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  features: string;
  proficiencies: string;

  spellAbility: AbilityKey | "";
  spellClass: string;
  slots: SpellSlot[]; // 9 кругов
  spells: string[]; // 0 — заговоры, 1..9 — круги

  appearance: string;
  backstory: string;
  allies: string;
  treasure: string;
};

const fill = <K extends string, V>(keys: readonly K[], v: V) =>
  Object.fromEntries(keys.map((k) => [k, v])) as Record<K, V>;

export function emptySheet(name = ""): CharacterSheet {
  return {
    name,
    className: "",
    level: 1,
    background: "",
    playerName: "",
    race: "",
    alignment: "",
    xp: 0,
    abilities: fill(ABILITY_KEYS, 10),
    saves: fill(ABILITY_KEYS, false),
    skills: fill(
      SKILLS.map((s) => s.key),
      0 as Proficiency,
    ),
    inspiration: false,
    profBonusOverride: null,
    ac: 10,
    initiativeBonus: 0,
    speed: 30,
    hpMax: 10,
    hpCurrent: 10,
    hpTemp: 0,
    hitDice: "1d8",
    hitDiceUsed: 0,
    deathSuccess: 0,
    deathFail: 0,
    attacks: [{ name: "", bonus: "", damage: "" }],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    equipment: "",
    personality: "",
    ideals: "",
    bonds: "",
    flaws: "",
    features: "",
    proficiencies: "",
    spellAbility: "",
    spellClass: "",
    slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })),
    spells: Array.from({ length: 10 }, () => ""),
    appearance: "",
    backstory: "",
    allies: "",
    treasure: "",
  };
}

/** Дополняет сохранённый JSON недостающими полями (если модель листа расширится). */
export function normalizeSheet(raw: unknown): CharacterSheet {
  const base = emptySheet();
  const s = (raw ?? {}) as Partial<CharacterSheet>;
  return {
    ...base,
    ...s,
    abilities: { ...base.abilities, ...s.abilities },
    saves: { ...base.saves, ...s.saves },
    skills: { ...base.skills, ...s.skills },
    coins: { ...base.coins, ...s.coins },
    slots: base.slots.map((d, i) => ({ ...d, ...s.slots?.[i] })),
    spells: base.spells.map((d, i) => s.spells?.[i] ?? d),
    attacks: s.attacks?.length ? s.attacks : base.attacks,
  };
}

// ---------- Расчёты ----------

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const profBonus = (s: CharacterSheet) =>
  s.profBonusOverride ?? 2 + Math.floor((Math.max(1, Math.min(20, s.level)) - 1) / 4);

export const saveBonus = (s: CharacterSheet, a: AbilityKey) =>
  mod(s.abilities[a]) + (s.saves[a] ? profBonus(s) : 0);

export function skillBonus(s: CharacterSheet, key: SkillKey): number {
  const skill = SKILLS.find((x) => x.key === key)!;
  return mod(s.abilities[skill.ability]) + s.skills[key] * profBonus(s);
}

export const initiative = (s: CharacterSheet) => mod(s.abilities.dex) + s.initiativeBonus;
export const passivePerception = (s: CharacterSheet) => 10 + skillBonus(s, "perception");

export function spellStats(s: CharacterSheet) {
  if (!s.spellAbility) return null;
  const m = mod(s.abilities[s.spellAbility]) + profBonus(s);
  return { dc: 8 + m, attack: m };
}

/** Урон сначала снимает временные хиты. */
export function applyDamage(s: CharacterSheet, amount: number): CharacterSheet {
  const fromTemp = Math.min(s.hpTemp, amount);
  return { ...s, hpTemp: s.hpTemp - fromTemp, hpCurrent: Math.max(0, s.hpCurrent - (amount - fromTemp)) };
}

export function applyHeal(s: CharacterSheet, amount: number): CharacterSheet {
  const hpCurrent = Math.min(s.hpMax, s.hpCurrent + amount);
  // Лечение с 0 хитов сбрасывает спасброски от смерти.
  return hpCurrent > 0 && s.hpCurrent === 0 ? { ...s, hpCurrent, deathSuccess: 0, deathFail: 0 } : { ...s, hpCurrent };
}
