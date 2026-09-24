import { CONDITIONS, DAMAGE_TYPES, SCHOOLS } from "./labels";
import type { RawEntry } from "./store";

type NameKey = { name: string; key: string };
type RawSpell = RawEntry & {
  desc: string;
  higher_level: string;
  level: number;
  school: NameKey;
  classes: NameKey[];
  casting_time: string;
  reaction_condition: string | null;
  range_text: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified: string;
  material_cost: string | null;
  saving_throw_ability: string;
  attack_roll: boolean;
  damage_roll: string;
  damage_types: string[];
  target_type: string | null;
  target_count: number | null;
  shape_type: string | null;
  shape_size: number | null;
  document: { key: string; display_name: string; gamesystem: NameKey };
};

export type Spell = {
  key: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  reactionCondition: string | null;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: { v: boolean; s: boolean; m: boolean };
  material: string;
  save: string;
  attack: boolean;
  damageRoll: string;
  damageTypes: string[];
  conditions: string[];
  effects: SpellEffect[];
  area: string | null;
  desc: string;
  higherLevel: string;
  source: string;
  sourceKey: string;
  system: string;
  /** name + desc в нижнем регистре — для полнотекстового поиска */
  haystack: string;
};

// ---------- Назначение заклинания (по тексту описания) ----------

export const SPELL_EFFECTS = {
  heal: "Лечение",
  revive: "Воскрешение",
  damage: "Урон",
  control: "Контроль (состояния)",
  buff: "Защита и усиление",
  cleanse: "Снятие эффектов",
  summon: "Призыв",
  movement: "Перемещение и телепорт",
  info: "Обнаружение и разведка",
  stealth: "Скрытность и иллюзии",
} as const;
export type SpellEffect = keyof typeof SPELL_EFFECTS;

const EFFECT_RULES: Record<SpellEffect, (s: Omit<Spell, "effects">, text: string) => boolean> = {
  heal: (_, t) =>
    /\bregains? (?:\S+ ){0,8}hit points\b|\brestores? (?:\S+ ){0,6}hit points\b|\bheals? (?:\S+ ){0,3}(?:hit points|wounds|damage)\b/.test(
      t.replace(/\b(?:can't|cannot|can not|doesn't|don't) regain hit points\b/g, ""),
    ),
  revive: (_, t) =>
    /\b(?:returns?|restores?|brings?|bring back|raises?)\b[^.]{0,60}\bto life\b|\bback to life\b|\braise dead\b|\bresurrect|\brevivif|\breincarnat|\bcreature that has died\b|\bdied within the last\b/.test(
      t.replace(/\b(?:restored|returned|brought back) to life only by\b[^.]*/g, "").replace(/\bextends the time limit\b[^.]*/g, ""),
    ),
  damage: (s, t) => s.damageTypes.length > 0 || /\d+d\d+(?: \+ \d+)? \w+ damage\b/.test(t),
  // «Невидим» — состояние, но не контроль врага.
  control: (s) => s.conditions.some((c) => c !== "invisible"),
  buff: (_, t) =>
    /\bbonus to (?:its |their |your |the target's )?(?:ac|armor class|saving throws?|attack rolls?|ability checks|damage rolls)|\badvantage on\b|\bresistance to\b|\btemporary hit points\b|\bac can't be less\b|\bimmun(?:e|ity) to\b/.test(
      t,
    ),
  cleanse: (_, t) =>
    /\b(?:end|ends|remove|removes|cure|cures|neutralize|neutralizes|suppress|suppresses|free|frees)\b (?:\S+ ){0,6}?(?:diseases?|curses?|poison|conditions?|charmed|frightened|paralyzed|petrified|blinded|deafened|stunned)\b|\bremove curse\b|\bdispel magic\b|\bends? (?:one|any|all|each) spells?\b/.test(
      t,
    ),
  summon: (s, t) => /^(?:summon|conjure)/.test(s.name.toLowerCase()) || /\b(?:you summon|you conjure|summons? (?:a|an|one|two|three|\w+ )?(?:spirit|creature|beast|elemental|fey|fiend|celestial|undead|construct))/.test(t),
  movement: (_, t) =>
    /\bteleport|\bfly(?:ing)? speed\b|\b(?:walking )?speed increases\b|\bclimb(?:ing)? speed\b|\bswim(?:ming)? speed\b|\bbreathe underwater\b|\bjump distance\b|\bplane of existence\b|\bwalk on (?:water|liquid)/.test(
      t,
    ),
  info: (s, t) =>
    s.school === "divination" || /\bdetect|\byou learn\b|\byou sense\b|\bscry|\btruesight\b|\bsee invisible\b|\blocate\b/.test(t),
  stealth: (s, t) =>
    s.school === "illusion" || /\b(?:becomes?|turns?) invisible\b|\binvisibility\b|\bdisguise\b|\bsilence\b|\bcan't be (?:seen|heard|tracked)\b/.test(t),
};

const DAMAGE_RE = new RegExp(`\\b(${Object.keys(DAMAGE_TYPES).join("|")}) damage\\b`, "g");
const CONDITION_RE = new RegExp(
  `\\b(?:is|are|be|becomes?|falls?|knocked|knock(?:s)?)\\s+(?:\\S+\\s+){0,2}?(${Object.keys(CONDITIONS).join("|")})\\b|\\bthe (${Object.keys(CONDITIONS).join("|")}) condition\\b`,
  "g",
);

function normalizeSpell(r: RawSpell): Spell {
  const text = `${r.desc}\n${r.higher_level ?? ""}`.toLowerCase();
  const damageTypes = new Set((r.damage_types ?? []).map((d) => d.toLowerCase()));
  for (const m of text.matchAll(DAMAGE_RE)) damageTypes.add(m[1]);
  const conditions = new Set<string>();
  for (const m of text.matchAll(CONDITION_RE)) {
    // «can't be charmed», «immune to being frightened» — защита, а не наложение состояния.
    const before = text.slice(Math.max(0, m.index - 24), m.index + m[0].length);
    if (/(?:can't|cannot|can not|immune|n't|not|no longer|advantage on saving throws against being)[^.]*$/.test(before)) continue;
    conditions.add(m[1] ?? m[2]);
  }

  const base: Omit<Spell, "effects"> = {
    key: r.key,
    name: r.name,
    level: r.level,
    school: r.school?.key ?? "",
    classes: [...new Set((r.classes ?? []).map((c) => c.name.toLowerCase()))],
    castingTime: r.casting_time,
    reactionCondition: r.reaction_condition,
    range: r.range_text,
    duration: r.duration,
    concentration: r.concentration,
    ritual: r.ritual,
    components: { v: r.verbal, s: r.somatic, m: r.material },
    material: r.material_specified,
    save: r.saving_throw_ability ?? "",
    attack: r.attack_roll,
    damageRoll: r.damage_roll ?? "",
    damageTypes: [...damageTypes].sort(),
    conditions: [...conditions].sort(),
    area: r.shape_type ? `${r.shape_size ?? ""} ft. ${r.shape_type}`.trim() : null,
    desc: r.desc,
    higherLevel: r.higher_level ?? "",
    source: r.document.display_name,
    sourceKey: r.document.key,
    system: r.document.gamesystem.key,
    haystack: `${r.name}\n${text}`.toLowerCase(),
  };
  const effects = (Object.keys(EFFECT_RULES) as SpellEffect[]).filter((e) => EFFECT_RULES[e](base, text));
  return { ...base, effects };
}

export function buildSpells(raw: RawEntry[]): Spell[] {
  return raw
    .map((r) => normalizeSpell(r as RawSpell))
    .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

// ---------- Фильтр ----------

export type SpellFilter = {
  q: string;
  inDesc: boolean;
  levelMin: number;
  levelMax: number;
  school: string;
  cls: string;
  castingTime: string;
  concentration: "" | "yes" | "no";
  ritual: "" | "yes" | "no";
  noMaterial: boolean;
  save: string;
  attack: "" | "yes" | "no";
  damage: string;
  condition: string;
  effects: SpellEffect[];
  source: string;
  sort: "name" | "level";
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: SP[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: SP[string]) => (Array.isArray(v) ? v : v ? [v] : []);
const tri = (v: string) => (v === "yes" || v === "no" ? v : "");

export function parseSpellFilter(sp: SP): SpellFilter {
  const lvl = (v: string, d: number) => (v === "" || isNaN(Number(v)) ? d : Math.min(9, Math.max(0, Number(v))));
  return {
    q: one(sp.q).trim(),
    inDesc: one(sp.inDesc) === "1",
    levelMin: lvl(one(sp.levelMin), 0),
    levelMax: lvl(one(sp.levelMax), 9),
    school: one(sp.school),
    cls: one(sp.cls),
    castingTime: one(sp.castingTime),
    concentration: tri(one(sp.concentration)),
    ritual: tri(one(sp.ritual)),
    noMaterial: one(sp.noMaterial) === "1",
    save: one(sp.save),
    attack: tri(one(sp.attack)),
    damage: one(sp.damage),
    condition: one(sp.condition),
    effects: many(sp.effect).filter((e): e is SpellEffect => e in SPELL_EFFECTS),
    source: one(sp.source),
    sort: one(sp.sort) === "level" ? "level" : "name",
  };
}

const triMatch = (f: "" | "yes" | "no", v: boolean) => f === "" || (f === "yes") === v;

export function filterSpells(spells: Spell[], f: SpellFilter): Spell[] {
  const q = f.q.toLowerCase();
  const out = spells.filter(
    (s) =>
      (!q || (f.inDesc ? s.haystack.includes(q) : s.name.toLowerCase().includes(q))) &&
      s.level >= f.levelMin &&
      s.level <= f.levelMax &&
      (!f.school || s.school === f.school) &&
      (!f.cls || s.classes.includes(f.cls)) &&
      (!f.castingTime || s.castingTime === f.castingTime) &&
      triMatch(f.concentration, s.concentration) &&
      triMatch(f.ritual, s.ritual) &&
      (!f.noMaterial || !s.components.m) &&
      (!f.save || (f.save === "any" ? s.save !== "" : s.save === f.save)) &&
      triMatch(f.attack, s.attack) &&
      (!f.damage || s.damageTypes.includes(f.damage)) &&
      (!f.condition || s.conditions.includes(f.condition)) &&
      (f.effects.length === 0 || f.effects.some((e) => s.effects.includes(e))) &&
      (!f.source || s.sourceKey === f.source || s.system === f.source),
  );
  if (f.sort === "level") out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return out;
}

export function spellLevelLabel(level: number) {
  return level === 0 ? "Заговор" : `${level} круг`;
}

export { SCHOOLS };
