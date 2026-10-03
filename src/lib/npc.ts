import { ABILITY_KEYS, SKILLS, emptySheet, mod, type AbilityKey, type CharacterSheet, type Proficiency, type SkillKey } from "@/lib/character";
import { DAMAGE_TYPES, MONSTER_TYPES, SIZES, label } from "@/lib/catalog/labels";
import { xpForCr } from "@/lib/encounter";
import type { Monster, NamedDesc } from "@/lib/open5e";
import type { Spellcasting } from "@/lib/npc-spells";

/** Что вводит мастер при создании NPC; всё остальное берётся из существа бестиария. */
export type NpcInput = { name: string; backstory: string; motivation: string };

/** Действие монстра с полями атаки (Open5e v1). */
type Action = NamedDesc & { attack_bonus?: number | null; damage_dice?: string | null; damage_bonus?: number | null };

const FULL: Record<AbilityKey, keyof Monster> = {
  str: "strength_save",
  dex: "dexterity_save",
  con: "constitution_save",
  int: "intelligence_save",
  wis: "wisdom_save",
  cha: "charisma_save",
};
const SCORE: Record<AbilityKey, keyof Monster> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

const SKILL_ALIASES: Record<string, SkillKey> = {
  "animal handling": "animal",
  "sleight of hand": "sleight",
};
const skillKey = (name: string): SkillKey | null => {
  const n = name.trim().toLowerCase();
  return SKILL_ALIASES[n] ?? (SKILLS.find((s) => s.key === n)?.key ?? null);
};

const LAW: Record<string, string> = { lawful: "законно", neutral: "нейтрально", chaotic: "хаотично" };
const MORAL: Record<string, string> = { good: "добрый", evil: "злой", neutral: "нейтральный", unaligned: "без мировоззрения" };

/** «chaotic evil» → «хаотично-злой». Незнакомую запись оставляем как есть. */
export function alignmentRu(a: string | undefined): string {
  const t = (a ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t === "neutral") return "нейтральное";
  if (t === "unaligned") return "без мировоззрения";
  if (t.startsWith("any")) return "любое";
  const [law, moral] = t.split(/\s+/);
  if (LAW[law] && MORAL[moral]) return `${LAW[law]}-${MORAL[moral]}`;
  return a ?? "";
}

const cr = (m: Monster) => (typeof m.cr === "number" ? m.cr : parseFloat(m.challenge_rating) || 0);
const crLabel = (m: Monster) => m.challenge_rating || String(cr(m));
const signedNum = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Бонус мастерства существа по CR: CR 0–4 → +2, 5–8 → +3 и так далее. */
export function profByCr(c: number): number {
  return c < 1 ? 2 : 2 + Math.floor((c - 1) / 4);
}

const section = (title: string, list: NamedDesc[] | null | undefined) =>
  list?.length ? [`— ${title} —`, ...list.map((a) => `${a.name}. ${a.desc}`.trim())].join("\n") : "";

const parseBonus = (desc: string) => {
  const m = /([+-]\d+)\s*(?:to hit|к попаданию|к броску атаки)/i.exec(desc);
  return m ? Number(m[1]) : null;
};

function attackOf(a: Action): { name: string; bonus: string; damage: string } | null {
  const bonus = a.attack_bonus ?? parseBonus(a.desc);
  if (bonus === null || bonus === undefined || Number.isNaN(bonus)) return null;
  let damage = "";
  if (a.damage_dice) damage = `${a.damage_dice}${a.damage_bonus ? signedNum(a.damage_bonus) : ""}`;
  else {
    // «Hit: 7 (1d8 + 3) piercing damage» → «1d8+3 piercing»
    const m = /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-zа-я]+)/i.exec(a.desc);
    if (m) {
      const type = m[2].toLowerCase();
      damage = `${m[1].replace(/\s+/g, "")} ${DAMAGE_TYPES[type] ? DAMAGE_TYPES[type].toLowerCase() : type}`;
    }
  }
  return { name: a.name, bonus: signedNum(bonus), damage };
}

/**
 * Собирает лист персонажа (тот же A4-лист, что у героев) из существа бестиария.
 * Характеристики, КД, хиты, скорость, спасброски, навыки, атаки, особенности и действия берутся из статблока;
 * имя, предыстория и мотивация — от мастера. m — уже локализованная (русская, если перевод есть) запись.
 */
export function monsterToSheet(m: Monster, input: NpcInput, spellcasting?: Spellcasting | null): CharacterSheet {
  const s = emptySheet(input.name.trim() || m.name);
  const c = cr(m);
  const pb = profByCr(c);

  for (const a of ABILITY_KEYS) {
    s.abilities[a] = Number(m[SCORE[a]]) || 10;
    s.saves[a] = m[FULL[a]] !== null && m[FULL[a]] !== undefined;
  }
  for (const [name, value] of Object.entries(m.skills ?? {})) {
    const key = skillKey(name);
    if (!key) continue;
    const ability = SKILLS.find((x) => x.key === key)!.ability;
    const extra = value - mod(s.abilities[ability]);
    s.skills[key] = (extra >= pb * 2 ? 2 : extra > 0 ? 1 : 0) as Proficiency;
  }

  const type = label(MONSTER_TYPES, (m.type ?? "").toLowerCase());
  s.race = [label(SIZES, (m.size ?? "").toLowerCase()), type, m.subtype ? `(${m.subtype})` : ""].filter(Boolean).join(" ");
  s.className = `${m.name} · CR ${crLabel(m)}`;
  s.background = "Существо из бестиария";
  s.playerName = "NPC";
  s.alignment = alignmentRu(m.alignment);
  s.level = Math.min(20, Math.max(1, Math.round(c)));
  s.xp = xpForCr(c);
  s.profBonusOverride = pb;

  s.ac = m.armor_class || 10;
  s.hpMax = m.hit_points || 1;
  s.hpCurrent = s.hpMax;
  s.hitDice = m.hit_dice ?? "";
  const speed = m.speed ?? {};
  s.speed = Number(speed.walk) || 0;

  const actions = (m.actions ?? []) as Action[];
  const attacks = actions.map(attackOf).filter((a): a is NonNullable<ReturnType<typeof attackOf>> => !!a);
  s.attacks = attacks.length ? attacks.slice(0, 8) : s.attacks;

  s.features = [
    section("Особенности", m.special_abilities),
    section("Действия", m.actions),
    section("Бонусные действия", m.bonus_actions),
    section("Реакции", m.reactions),
    m.legendary_actions?.length ? [`— Легендарные действия —`, m.legendary_desc ?? "", ...m.legendary_actions.map((a) => `${a.name}. ${a.desc}`)].filter(Boolean).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const extraSpeed = Object.entries(speed)
    .filter(([k, v]) => k !== "walk" && k !== "notes" && typeof v === "number" && v > 0)
    .map(([k, v]) => `${k} ${v} фт.`);
  s.proficiencies = [
    extraSpeed.length ? `Скорость: ${extraSpeed.join(", ")}` : "",
    m.senses ? `Чувства: ${m.senses}` : "",
    m.languages ? `Языки: ${m.languages}` : "",
    m.damage_vulnerabilities ? `Уязвимость: ${m.damage_vulnerabilities}` : "",
    m.damage_resistances ? `Сопротивление: ${m.damage_resistances}` : "",
    m.damage_immunities ? `Иммунитет к урону: ${m.damage_immunities}` : "",
    m.condition_immunities ? `Иммунитет к состояниям: ${m.condition_immunities}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Базовая характеристика заклинаний — по тексту умения «Spellcasting» / «Использование заклинаний».
  const caster = (m.special_abilities ?? []).find((a) => /spellcasting|заклинани/i.test(a.name));
  if (caster) {
    const found = /(intelligence|wisdom|charisma|интеллект|мудрост|харизм)/i.exec(caster.desc)?.[1].toLowerCase();
    if (found) s.spellAbility = found.startsWith("int") || found.startsWith("инт") ? "int" : found.startsWith("wis") || found.startsWith("мудр") ? "wis" : "cha";
    s.spellClass = "Существо";
  }

  // Заклинания из статблока раскладываются по кругам листа (ячейки и списки).
  if (spellcasting) applySpellcasting(s, spellcasting);

  s.appearance = (m.desc ?? "").trim();
  s.backstory = input.backstory.trim();
  s.motivation = input.motivation.trim();
  return s;
}

/** Переносит разобранные заклинания в лист: ячейки по кругам, списки по блокам, класс и базовая характеристика. */
export function applySpellcasting(s: CharacterSheet, sc: Spellcasting, onlyEmpty = false): void {
  sc.slots.forEach((n, i) => {
    if (n > 0 && (!onlyEmpty || s.slots[i].max === 0)) s.slots[i] = { max: n, used: 0 };
  });
  sc.lists.forEach((list, lvl) => {
    if (list.length && (!onlyEmpty || !s.spells[lvl].trim())) s.spells[lvl] = list.join(", ");
  });
  if (sc.ability && (!onlyEmpty || !s.spellAbility)) s.spellAbility = sc.ability;
  if (!onlyEmpty || !s.spellClass.trim() || s.spellClass === "Существо") s.spellClass = sc.spellClass || s.spellClass || "Существо";
}
