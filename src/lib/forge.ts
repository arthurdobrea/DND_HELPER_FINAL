import { ABILITY_KEYS, SKILLS, mod, type AbilityKey, type SkillKey } from "@/lib/character";
import { DAMAGE_TYPES, MONSTER_TYPES, SIZES } from "@/lib/catalog/labels";
import { crText, profBonus, CR_LIST } from "@/lib/cr";
import { skillKey } from "@/lib/npc";
import type { Spellcasting } from "@/lib/npc-spells";
import type { Monster, NamedDesc } from "@/lib/open5e";

/**
 * Конструктор NPC: черновик (ForgeDraft) → статблок (Monster) → лист персонажа.
 * Свои способности хранятся структурно (атака, область со спасброском, заклинания), а текст и числа
 * (бонус атаки, Сл, урон) пересчитываются из характеристик и CR при сборке статблока.
 */

export type Section = "special" | "action" | "bonus" | "reaction" | "legendary";
export const SECTION_LABEL: Record<Section, string> = {
  special: "Особенность",
  action: "Действие",
  bonus: "Бонусное действие",
  reaction: "Реакция",
  legendary: "Легендарное действие",
};

export const ABIL_FULL: Record<AbilityKey, string> = { str: "Сила", dex: "Ловкость", con: "Телосложение", int: "Интеллект", wis: "Мудрость", cha: "Харизма" };
/** Родительный падеж — «спасбросок Ловкости». */
const ABIL_GEN: Record<AbilityKey, string> = { str: "Силы", dex: "Ловкости", con: "Телосложения", int: "Интеллекта", wis: "Мудрости", cha: "Харизмы" };

/** Тип урона в форме прилагательного: «14 (2d8+5) огненный урон». */
export const DMG_ADJ: Record<string, string> = {
  acid: "кислотный",
  bludgeoning: "дробящий",
  cold: "холодный",
  fire: "огненный",
  force: "силовой",
  lightning: "электрический",
  necrotic: "некротический",
  piercing: "колющий",
  poison: "ядовитый",
  psychic: "психический",
  radiant: "лучистый",
  slashing: "рубящий",
  thunder: "звуковой",
};
export const DMG_KEYS = Object.keys(DMG_ADJ);

export const USAGES = ["", "Перезарядка 5–6", "Перезарядка 6", "1/день", "2/день", "3/день"] as const;

type Base = { id: string; section: Section; name: string; /** Из какого монстра взято. */ from?: string };
export type TextAbility = Base & { kind: "text"; desc: string };
export type AttackAbility = Base & {
  kind: "attack";
  ranged: boolean;
  spell: boolean;
  abil: AbilityKey;
  reach: string;
  dice: string;
  dmgType: string;
  extraDice: string;
  extraType: string;
  usage: string;
};
export type SaveAbility = Base & {
  kind: "save";
  dcAbil: AbilityKey;
  saveAbil: AbilityKey;
  shape: string;
  dice: string;
  dmgType: string;
  half: boolean;
  effect: string;
  usage: string;
};
export type SpellEntry = { name: string; level: number; usage: "slot" | "will" | "1" | "2" | "3" };
export type SpellAbility = Base & { kind: "spells"; abil: "int" | "wis" | "cha"; slots: number[]; spells: SpellEntry[] };
export type ForgeAbility = TextAbility | AttackAbility | SaveAbility | SpellAbility;

export type ForgeDraft = {
  name: string;
  backstory: string;
  motivation: string;
  /** Откуда взята основа (для подписи в интерфейсе). */
  baseName: string;
  size: string;
  type: string;
  law: string;
  moral: string;
  ac: number;
  armorDesc: string;
  hp: number;
  speed: { walk: number; fly: number; swim: number; climb: number; burrow: number };
  scores: Record<AbilityKey, number>;
  saves: AbilityKey[];
  skills: SkillKey[];
  vulnerabilities: string;
  resistances: string;
  immunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  /** Целевой CR: от него зависит бонус мастерства и числа в своих способностях. */
  cr: number;
  /** Сколько атак за действие даёт мультиатака. */
  multiattack: number;
  legendaryDesc: string;
  abilities: ForgeAbility[];
};

export const rid = () => Math.random().toString(36).slice(2, 10);

export const blankDraft = (): ForgeDraft => ({
  name: "",
  backstory: "",
  motivation: "",
  baseName: "",
  size: "medium",
  type: "humanoid",
  law: "neutral",
  moral: "neutral",
  ac: 14,
  armorDesc: "",
  hp: 60,
  speed: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
  scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  saves: [],
  skills: [],
  vulnerabilities: "",
  resistances: "",
  immunities: "",
  conditionImmunities: "",
  senses: "",
  languages: "",
  cr: 3,
  multiattack: 1,
  legendaryDesc: "",
  abilities: [],
});

// ---------- Кубики ----------

export const DICE_RE = /^\d{1,2}d\d{1,3}$/;
const cleanDice = (s: string, fallback: string) => (DICE_RE.test(String(s ?? "").trim().toLowerCase()) ? String(s).trim().toLowerCase() : fallback);
export const diceAvg = (dice: string, bonus = 0) => {
  const m = /^(\d+)d(\d+)$/.exec(dice);
  return m ? Math.floor((Number(m[1]) * (Number(m[2]) + 1)) / 2) + bonus : bonus;
};
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const withBonus = (dice: string, bonus: number) => (bonus ? `${dice}${signed(bonus)}` : dice);

/** Пересчитываемые числа своих способностей — их же показывает редактор. */
export function attackNumbers(d: ForgeDraft, a: AttackAbility) {
  const pb = profBonus(d.cr);
  const m = mod(d.scores[a.abil]);
  const dmgBonus = a.spell ? 0 : m;
  return { toHit: pb + m, dmgBonus, dmg: diceAvg(a.dice, dmgBonus) + (a.extraDice ? diceAvg(a.extraDice) : 0) };
}
export const saveDc = (d: ForgeDraft, a: SaveAbility) => 8 + profBonus(d.cr) + mod(d.scores[a.dcAbil]);

const nameWithUsage = (name: string, usage: string) => (usage ? `${name} (${usage})` : name);

// ---------- Текст способностей ----------

function attackText(d: ForgeDraft, a: AttackAbility): string {
  const { toHit, dmgBonus } = attackNumbers(d, a);
  const kind = `${a.ranged ? "Дальнобойная" : "Рукопашная"} атака ${a.spell ? "заклинанием" : "оружием"}`;
  const range = a.ranged ? `дистанция ${a.reach || "60 фт."}` : `досягаемость ${a.reach || "5 фт."}`;
  const adj = DMG_ADJ[a.dmgType] ?? "колющий";
  const main = `${diceAvg(a.dice, dmgBonus)} (${withBonus(a.dice, dmgBonus)}) ${adj} урон`;
  const extra = a.extraDice ? ` плюс ${diceAvg(a.extraDice)} (${a.extraDice}) ${DMG_ADJ[a.extraType] ?? adj} урон` : "";
  return `${kind}: ${signed(toHit)} к попаданию, ${range}, одна цель. Попадание: ${main}${extra}.`;
}

function saveText(d: ForgeDraft, a: SaveAbility): string {
  const adj = DMG_ADJ[a.dmgType] ?? "огненный";
  const half = a.half ? ", при успехе — половину этого урона" : ", при успехе урона нет";
  return [
    `Область: ${(a.shape || "конус 15 фт.").replace(/[.\s]+$/, "")}. Каждое существо в области совершает спасбросок ${ABIL_GEN[a.saveAbil]} Сл ${saveDc(d, a)}.`,
    `При провале: ${diceAvg(a.dice)} (${a.dice}) ${adj} урон${half}.`,
    a.effect.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

function spellText(d: ForgeDraft, a: SpellAbility): string {
  const pb = profBonus(d.cr);
  const m = mod(d.scores[a.abil]);
  const lines = [`Базовая характеристика — ${ABIL_FULL[a.abil]} (Сл спасброска ${8 + pb + m}, ${signed(pb + m)} к атакам заклинаниями).`];
  const names = (f: (s: SpellEntry) => boolean) => a.spells.filter(f).map((s) => s.name).join(", ");
  const cantrips = names((s) => s.level === 0);
  if (cantrips) lines.push(`Заговоры (по желанию): ${cantrips}`);
  for (let l = 1; l <= 9; l++) {
    const list = names((s) => s.level === l && s.usage === "slot");
    if (list) lines.push(`${l} круг (ячеек: ${a.slots[l - 1] ?? 0}): ${list}`);
  }
  const will = names((s) => s.level > 0 && s.usage === "will");
  if (will) lines.push(`По желанию: ${will}`);
  for (const n of ["1", "2", "3"] as const) {
    const list = names((s) => s.level > 0 && s.usage === n);
    if (list) lines.push(`${n}/день каждое: ${list}`);
  }
  return lines.join("\n");
}

const NUM_WORDS: [string, number][] = [
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6],
  ["одну", 1], ["один", 1], ["две", 2], ["два", 2], ["три", 3], ["четыре", 4], ["пять", 5], ["шесть", 6],
];
/** Сколько атак даёт мультиатака, судя по тексту («makes two attacks», «совершает три атаки»). */
export function multiattackCount(desc: string): number {
  const t = desc.toLowerCase();
  const digit = /(\d)\s*(?:attacks|атак)/.exec(t);
  if (digit) return Number(digit[1]);
  let best: [number, number] | null = null;
  for (const [w, n] of NUM_WORDS) {
    const i = t.search(new RegExp(`(?:^|[^a-zа-я])${w}(?:[^a-zа-я]|$)`));
    if (i !== -1 && (!best || i < best[0])) best = [i, n];
  }
  return best?.[1] ?? 1;
}

// ---------- Сборка статблока ----------

const SKILL_EN: Record<SkillKey, string> = {
  acrobatics: "acrobatics", animal: "animal handling", arcana: "arcana", athletics: "athletics", deception: "deception", history: "history",
  insight: "insight", intimidation: "intimidation", investigation: "investigation", medicine: "medicine", nature: "nature", perception: "perception",
  performance: "performance", persuasion: "persuasion", religion: "religion", sleight: "sleight of hand", stealth: "stealth", survival: "survival",
};
const HIT_DIE: Record<string, number> = { tiny: 4, small: 6, medium: 8, large: 10, huge: 12, gargantuan: 20, titanic: 20 };

export function hitDice(d: Pick<ForgeDraft, "size" | "hp" | "scores">): string {
  const die = HIT_DIE[d.size] ?? 8;
  const con = mod(d.scores.con);
  const n = Math.max(1, Math.round(d.hp / ((die + 1) / 2 + con)));
  const bonus = n * con;
  return `${n}d${die}${bonus ? signed(bonus) : ""}`;
}

export function alignmentOf(d: Pick<ForgeDraft, "law" | "moral">): string {
  if (d.moral === "unaligned") return "unaligned";
  if (!d.law || !d.moral) return "any alignment";
  if (d.law === "neutral" && d.moral === "neutral") return "neutral";
  return `${d.law} ${d.moral}`;
}

type Entry = NamedDesc & { attack_bonus?: number; damage_dice?: string; damage_bonus?: number };

export function buildMonster(d: ForgeDraft): Monster {
  const pb = profBonus(d.cr);
  const out: Record<Section, Entry[]> = { special: [], action: [], bonus: [], reaction: [], legendary: [] };

  for (const a of d.abilities) {
    if (a.kind === "text") out[a.section].push({ name: a.name, desc: a.desc });
    else if (a.kind === "attack") {
      const n = attackNumbers(d, a);
      out[a.section].push({ name: nameWithUsage(a.name, a.usage), desc: attackText(d, a), attack_bonus: n.toHit });
    } else if (a.kind === "save") out[a.section].push({ name: nameWithUsage(a.name, a.usage), desc: saveText(d, a) });
    else out.special.push({ name: "Использование заклинаний", desc: spellText(d, a) });
  }

  const hasMulti = out.action.some((x) => /multiattack|мультиатак/i.test(x.name));
  if (d.multiattack > 1 && !hasMulti) {
    out.action.unshift({ name: "Мультиатака", desc: `Существо совершает ${d.multiattack} атаки${d.multiattack >= 5 ? "" : ""}.`.replace("атаки", d.multiattack >= 5 ? "атак" : "атаки") });
  }

  const skills: Record<string, number> = {};
  for (const k of d.skills) {
    const sk = SKILLS.find((s) => s.key === k);
    if (sk) skills[SKILL_EN[k]] = mod(d.scores[sk.ability]) + pb;
  }
  const speed: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.speed)) if (v > 0 || k === "walk") speed[k] = v;

  const m: Monster = {
    slug: "custom",
    name: d.name.trim() || "Без имени",
    size: d.size,
    type: d.type,
    alignment: alignmentOf(d),
    armor_class: d.ac,
    armor_desc: d.armorDesc || null,
    hit_points: d.hp,
    hit_dice: hitDice(d),
    speed,
    strength: d.scores.str,
    dexterity: d.scores.dex,
    constitution: d.scores.con,
    intelligence: d.scores.int,
    wisdom: d.scores.wis,
    charisma: d.scores.cha,
    skills,
    damage_vulnerabilities: d.vulnerabilities,
    damage_resistances: d.resistances,
    damage_immunities: d.immunities,
    condition_immunities: d.conditionImmunities,
    senses: d.senses,
    languages: d.languages,
    challenge_rating: crText(d.cr),
    cr: d.cr,
    special_abilities: out.special,
    actions: out.action,
    bonus_actions: out.bonus,
    reactions: out.reaction,
    legendary_actions: out.legendary,
    legendary_desc: out.legendary.length ? d.legendaryDesc.trim() || "Существо может совершить 3 легендарных действия, выбирая их из списка ниже. Только одно за раз и только в конце хода другого существа. В начале своего хода существо восстанавливает все потраченные легендарные действия." : "",
    document__title: "Конструктор NPC",
  };
  for (const k of ABILITY_KEYS) {
    const full = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }[k] as "strength";
    if (d.saves.includes(k)) (m as unknown as Record<string, number>)[`${full}_save`] = mod(d.scores[k]) + pb;
  }
  return m;
}

/** Заклинания черновика в форме, понятной листу персонажа (ячейки и списки по кругам). */
export function spellcastingOf(d: ForgeDraft): Spellcasting | null {
  const a = d.abilities.find((x): x is SpellAbility => x.kind === "spells");
  if (!a || a.spells.length === 0) return null;
  const lists: string[][] = Array.from({ length: 10 }, () => []);
  for (const s of a.spells) {
    const label = s.level === 0 || s.usage === "slot" ? s.name : `${s.name} (${s.usage === "will" ? "по желанию" : `${s.usage}/день`})`;
    if (!lists[s.level].includes(label)) lists[s.level].push(label);
  }
  return { slots: a.slots.slice(0, 9).map((n) => Math.max(0, n)), lists, spellClass: "", ability: a.abil };
}

// ---------- Из монстра в черновик ----------

const NUMS = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function draftFromMonster(m: Monster, prev: ForgeDraft = blankDraft()): ForgeDraft {
  const align = (m.alignment ?? "").toLowerCase();
  const any = align.startsWith("any");
  const law = any ? "" : align.includes("lawful") ? "lawful" : align.includes("chaotic") ? "chaotic" : "neutral";
  const moral = any ? "" : align.includes("unaligned") ? "unaligned" : align.includes("good") ? "good" : align.includes("evil") ? "evil" : "neutral";
  const mapSection = (section: Section, list: NamedDesc[] | null | undefined): ForgeAbility[] =>
    (list ?? []).map((a) => ({ id: rid(), kind: "text", section, name: a.name, desc: String(a.desc ?? "").replace(/\\n/g, "\n"), from: m.name }));
  const abilities: ForgeAbility[] = [
    ...mapSection("special", m.special_abilities),
    ...mapSection("action", m.actions),
    ...mapSection("bonus", m.bonus_actions),
    ...mapSection("reaction", m.reactions),
    ...mapSection("legendary", m.legendary_actions),
  ];
  const multi = (m.actions ?? []).find((a) => /multiattack|мультиатак/i.test(a.name));
  const sp = m.speed ?? {};
  const skills = Object.keys(m.skills ?? {})
    .map((k) => skillKey(k))
    .filter((k): k is SkillKey => !!k);
  const size = (m.size ?? "medium").toLowerCase();
  const type = (m.type ?? "humanoid").toLowerCase();
  return {
    ...prev,
    baseName: m.name,
    size: SIZES[size] ? size : "medium",
    type: MONSTER_TYPES[type] ? type : "humanoid",
    law,
    moral,
    ac: m.armor_class || 10,
    armorDesc: m.armor_desc ?? "",
    hp: m.hit_points || 1,
    speed: { walk: NUMS(sp.walk), fly: NUMS(sp.fly), swim: NUMS(sp.swim), climb: NUMS(sp.climb), burrow: NUMS(sp.burrow) },
    scores: { str: m.strength || 10, dex: m.dexterity || 10, con: m.constitution || 10, int: m.intelligence || 10, wis: m.wisdom || 10, cha: m.charisma || 10 },
    saves: ABILITY_KEYS.filter((k) => {
      const key = { str: "strength_save", dex: "dexterity_save", con: "constitution_save", int: "intelligence_save", wis: "wisdom_save", cha: "charisma_save" }[k] as keyof Monster;
      return m[key] !== null && m[key] !== undefined;
    }),
    skills,
    vulnerabilities: m.damage_vulnerabilities ?? "",
    resistances: m.damage_resistances ?? "",
    immunities: m.damage_immunities ?? "",
    conditionImmunities: m.condition_immunities ?? "",
    senses: m.senses ?? "",
    languages: m.languages ?? "",
    cr: CR_LIST.includes(m.cr) ? m.cr : (CR_LIST.find((c) => c >= m.cr) ?? 30),
    multiattack: multi ? multiattackCount(multi.desc) : 1,
    legendaryDesc: m.legendary_desc ?? "",
    abilities,
  };
}

/** Способность из чужого монстра как текстовая карточка. */
export function textAbility(section: Section, name: string, desc: string, from?: string): TextAbility {
  return { id: rid(), kind: "text", section, name, desc: desc.replace(/\\n/g, "\n"), from };
}

// ---------- Проверка входа (сервер получает данные от клиента) ----------

const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
};
const abil = (v: unknown, d: AbilityKey = "str"): AbilityKey => (ABILITY_KEYS.includes(v as AbilityKey) ? (v as AbilityKey) : d);
const dmgKey = (v: unknown, d: string) => (DMG_KEYS.includes(String(v)) ? String(v) : d);
const section = (v: unknown): Section => (["special", "action", "bonus", "reaction", "legendary"].includes(String(v)) ? (v as Section) : "action");
const usage = (v: unknown) => ((USAGES as readonly string[]).includes(String(v)) ? String(v) : "");

export function sanitizeDraft(raw: unknown): ForgeDraft {
  const r = (raw ?? {}) as Partial<ForgeDraft> & Record<string, unknown>;
  const base = blankDraft();
  const sp = (r.speed ?? {}) as Record<string, unknown>;
  const sc = (r.scores ?? {}) as Record<string, unknown>;
  const abilities: ForgeAbility[] = [];
  for (const a of (Array.isArray(r.abilities) ? r.abilities : []).slice(0, 40) as Record<string, unknown>[]) {
    const common = { id: str(a.id, 20) || rid(), name: str(a.name, 80) || "Способность", from: a.from ? str(a.from, 80) : undefined };
    if (a.kind === "attack") {
      abilities.push({
        ...common, kind: "attack", section: a.section === "bonus" ? "bonus" : a.section === "reaction" ? "reaction" : a.section === "legendary" ? "legendary" : "action",
        ranged: !!a.ranged, spell: !!a.spell, abil: abil(a.abil), reach: str(a.reach, 30), dice: cleanDice(String(a.dice), "1d8"), dmgType: dmgKey(a.dmgType, "piercing"),
        extraDice: a.extraDice ? cleanDice(String(a.extraDice), "") : "", extraType: dmgKey(a.extraType, "fire"), usage: usage(a.usage),
      });
    } else if (a.kind === "save") {
      abilities.push({
        ...common, kind: "save", section: a.section === "bonus" ? "bonus" : a.section === "reaction" ? "reaction" : a.section === "legendary" ? "legendary" : "action",
        dcAbil: abil(a.dcAbil, "con"), saveAbil: abil(a.saveAbil, "dex"), shape: str(a.shape, 60), dice: cleanDice(String(a.dice), "6d6"), dmgType: dmgKey(a.dmgType, "fire"),
        half: a.half !== false, effect: str(a.effect, 600), usage: usage(a.usage),
      });
    } else if (a.kind === "spells") {
      const slots = Array.from({ length: 9 }, (_, i) => int((a.slots as unknown[] | undefined)?.[i], 0, 9, 0));
      const spells = (Array.isArray(a.spells) ? a.spells : []).slice(0, 60).map((s: Record<string, unknown>): SpellEntry => ({
        name: str(s.name, 80), level: int(s.level, 0, 9, 0), usage: (["slot", "will", "1", "2", "3"].includes(String(s.usage)) ? s.usage : "slot") as SpellEntry["usage"],
      })).filter((s) => s.name.trim());
      if (!abilities.some((x) => x.kind === "spells")) abilities.push({ ...common, kind: "spells", section: "special", abil: (["int", "wis", "cha"].includes(String(a.abil)) ? a.abil : "int") as "int", slots, spells });
    } else {
      abilities.push({ ...common, kind: "text", section: section(a.section), desc: str(a.desc, 4000) });
    }
  }
  return {
    name: str(r.name, 100),
    backstory: str(r.backstory, 4000),
    motivation: str(r.motivation, 4000),
    baseName: str(r.baseName, 100),
    // Пустое значение — «Любой» (не задано).
    size: r.size === "" ? "" : SIZES[String(r.size)] ? String(r.size) : base.size,
    type: r.type === "" ? "" : MONSTER_TYPES[String(r.type)] ? String(r.type) : base.type,
    law: r.law === "" ? "" : ["lawful", "neutral", "chaotic"].includes(String(r.law)) ? String(r.law) : "neutral",
    moral: r.moral === "" ? "" : ["good", "neutral", "evil", "unaligned"].includes(String(r.moral)) ? String(r.moral) : "neutral",
    ac: int(r.ac, 1, 40, base.ac),
    armorDesc: str(r.armorDesc, 80),
    hp: int(r.hp, 1, 9999, base.hp),
    speed: { walk: int(sp.walk, 0, 400, 30), fly: int(sp.fly, 0, 400, 0), swim: int(sp.swim, 0, 400, 0), climb: int(sp.climb, 0, 400, 0), burrow: int(sp.burrow, 0, 400, 0) },
    scores: { str: int(sc.str, 1, 30, 10), dex: int(sc.dex, 1, 30, 10), con: int(sc.con, 1, 30, 10), int: int(sc.int, 1, 30, 10), wis: int(sc.wis, 1, 30, 10), cha: int(sc.cha, 1, 30, 10) },
    saves: (Array.isArray(r.saves) ? r.saves : []).filter((k): k is AbilityKey => ABILITY_KEYS.includes(k as AbilityKey)),
    skills: (Array.isArray(r.skills) ? r.skills : []).filter((k): k is SkillKey => SKILLS.some((s) => s.key === k)),
    vulnerabilities: str(r.vulnerabilities, 200),
    resistances: str(r.resistances, 200),
    immunities: str(r.immunities, 200),
    conditionImmunities: str(r.conditionImmunities, 200),
    senses: str(r.senses, 200),
    languages: str(r.languages, 200),
    cr: CR_LIST.includes(Number(r.cr)) ? Number(r.cr) : base.cr,
    multiattack: int(r.multiattack, 1, 8, 1),
    legendaryDesc: str(r.legendaryDesc, 1000),
    abilities,
  };
}

export { DAMAGE_TYPES };
