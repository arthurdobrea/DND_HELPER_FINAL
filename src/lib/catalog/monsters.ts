import { DAMAGE_TYPES, MONSTER_CONDITIONS } from "./labels";
import type { RawEntry } from "./store";
import type { Monster } from "@/lib/open5e";

/** Запись из каталога в формате Open5e v1 — ровно то, что принимает StatBlock. */
export type RawMonster = RawEntry & Monster & { environments?: string[]; group?: string | null };

/** Облегчённая запись для списка и фильтров (полный статблок берётся из RawMonster). */
export type MonsterEntry = {
  key: string;
  name: string;
  size: string;
  type: string;
  subtype: string;
  cr: number;
  crLabel: string;
  hp: number;
  ac: number;
  moral: "good" | "neutral" | "evil" | "unaligned";
  law: "lawful" | "neutral" | "chaotic";
  abilities: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>;
  movement: string[];
  senses: string[];
  environments: string[];
  languages: string[];
  telepathy: boolean;
  vulnerable: string[];
  resistant: string[];
  immune: string[];
  conditionImmune: string[];
  legendary: boolean;
  spellcaster: boolean;
  source: string;
  sourceKey: string;
  /** Название + весь текст статблока в нижнем регистре — для поиска по описанию. */
  haystack: string;
};

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();
const DAMAGE_KEYS = Object.keys(DAMAGE_TYPES);
const CONDITION_KEYS = Object.keys(MONSTER_CONDITIONS);

/** Какие из ключей упомянуты в строке вида «bludgeoning, piercing, and slashing from nonmagical attacks». */
const mentioned = (text: string, keys: string[]) => keys.filter((k) => new RegExp(`\\b${k}\\b`).test(text));

function alignment(a: string): Pick<MonsterEntry, "moral" | "law"> {
  const t = lower(a);
  const moral = t.includes("evil") ? "evil" : t.includes("good") ? "good" : t.includes("unaligned") || !t ? "unaligned" : "neutral";
  const law = t.includes("lawful") ? "lawful" : t.includes("chaotic") ? "chaotic" : "neutral";
  return { moral, law };
}

const CR_LABELS: Record<number, string> = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
type Named = { name: string; desc: string }[] | null | undefined;

function normalizeMonster(r: RawMonster, envAlias: Map<string, string>): MonsterEntry {
  const speed = (r.speed ?? {}) as Record<string, unknown>;
  const movement = ["fly", "swim", "climb", "burrow"].filter((k) => {
    const v = speed[k];
    return typeof v === "number" ? v > 0 : typeof v === "string" && parseInt(v, 10) > 0;
  });

  const senses = lower(r.senses);
  const languages = lower(r.languages)
    .split(/[,;]/)
    .map((x) => x.replace(/\(.*?\)/g, "").trim())
    .filter((x) => x && x !== "—" && x !== "-" && !/\d|telepathy|understands|cannot|can't|plus/.test(x));

  const specials = (r.special_abilities ?? []) as NonNullable<Named>;
  const named = (list: Named) => (list ?? []).map((a) => `${a.name}. ${a.desc}`);
  const text = [r.name, r.desc, ...named(specials), ...named(r.actions), ...named(r.bonus_actions), ...named(r.reactions), ...named(r.legendary_actions)];

  return {
    key: r.key,
    name: r.name,
    size: lower(r.size),
    type: lower(r.type),
    subtype: lower(r.subtype),
    cr: r.cr,
    crLabel: CR_LABELS[r.cr] ?? String(r.cr),
    hp: r.hit_points,
    ac: r.armor_class,
    ...alignment(r.alignment ?? ""),
    abilities: { str: r.strength, dex: r.dexterity, con: r.constitution, int: r.intelligence, wis: r.wisdom, cha: r.charisma },
    movement,
    senses: ["darkvision", "blindsight", "truesight", "tremorsense"].filter((s) => senses.includes(s)),
    environments: [...new Set((r.environments ?? []).map((e) => envAlias.get(lower(e)) ?? lower(e)))],
    languages,
    telepathy: lower(r.languages).includes("telepathy"),
    vulnerable: mentioned(lower(r.damage_vulnerabilities), DAMAGE_KEYS),
    resistant: mentioned(lower(r.damage_resistances), DAMAGE_KEYS),
    immune: mentioned(lower(r.damage_immunities), DAMAGE_KEYS),
    conditionImmune: mentioned(lower(r.condition_immunities), CONDITION_KEYS),
    legendary: !!r.legendary_actions?.length || !!r.legendary_desc,
    spellcaster: !!r.spell_list?.length || specials.some((a) => /spellcasting/i.test(a.name)),
    source: r.document__title ?? "",
    sourceKey: r.document__slug ?? "",
    haystack: text.join("\n").toLowerCase(),
  };
}

export function buildMonsters(raw: RawEntry[]): MonsterEntry[] {
  const list = raw as RawMonster[];
  // «hills» и «hill» — одна среда: множественное склеиваем с единственным, если единственное тоже есть.
  const names = new Set(list.flatMap((r) => (r.environments ?? []).map(lower)));
  const envAlias = new Map<string, string>();
  for (const n of names) if (n.endsWith("s") && names.has(n.slice(0, -1))) envAlias.set(n, n.slice(0, -1));

  return list
    .map((r) => normalizeMonster(r, envAlias))
    .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

// ---------- Опции фильтров, зависящие от данных ----------

export type MonsterFacets = {
  environments: { value: string; count: number }[];
  languages: { value: string; count: number }[];
  sources: { value: string; label: string; count: number }[];
};

export function buildMonsterFacets(list: MonsterEntry[]): MonsterFacets {
  const count = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  };
  const sources = new Map<string, { value: string; label: string; count: number }>();
  for (const m of list) {
    const s = sources.get(m.sourceKey) ?? { value: m.sourceKey, label: m.source, count: 0 };
    s.count++;
    sources.set(m.sourceKey, s);
  }
  return {
    environments: count(list.flatMap((m) => m.environments)),
    languages: count(list.flatMap((m) => m.languages)).slice(0, 24),
    sources: [...sources.values()].sort((a, b) => b.count - a.count),
  };
}

// ---------- Фильтр ----------

export type MonsterFilter = {
  q: string;
  inDesc: boolean;
  crMin: number | null;
  crMax: number | null;
  types: string[];
  sizes: string[];
  env: string;
  hpMin: number | null;
  hpMax: number | null;
  acMin: number | null;
  acMax: number | null;
  moral: string;
  law: string;
  movement: string[];
  sense: string;
  legendary: "" | "yes" | "no";
  spellcaster: "" | "yes" | "no";
  vulnerable: string;
  resistant: string;
  immune: string;
  conditionImmune: string;
  language: string;
  telepathy: "" | "yes" | "no";
  abilityKey: string;
  abilityMin: number | null;
  source: string;
  sort: "name" | "cr" | "cr-desc" | "hp-desc" | "ac-desc";
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: SP[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const many = (v: SP[string]) => (Array.isArray(v) ? v : v ? [v] : []);
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));
const tri = (v: string) => (v === "yes" || v === "no" ? v : "");
const SORTS = ["cr", "cr-desc", "hp-desc", "ac-desc"];

export function parseMonsterFilter(sp: SP): MonsterFilter {
  const sort = one(sp.sort);
  return {
    q: one(sp.q).trim(),
    inDesc: one(sp.inDesc) === "1",
    crMin: num(one(sp.crMin)),
    crMax: num(one(sp.crMax)),
    types: many(sp.type),
    sizes: many(sp.size),
    env: one(sp.env),
    hpMin: num(one(sp.hpMin)),
    hpMax: num(one(sp.hpMax)),
    acMin: num(one(sp.acMin)),
    acMax: num(one(sp.acMax)),
    moral: one(sp.moral),
    law: one(sp.law),
    movement: many(sp.movement),
    sense: one(sp.sense),
    legendary: tri(one(sp.legendary)),
    spellcaster: tri(one(sp.spellcaster)),
    vulnerable: one(sp.vulnerable),
    resistant: one(sp.resistant),
    immune: one(sp.immune),
    conditionImmune: one(sp.conditionImmune),
    language: one(sp.language),
    telepathy: tri(one(sp.telepathy)),
    abilityKey: one(sp.abilityKey),
    abilityMin: num(one(sp.abilityMin)),
    source: one(sp.source),
    sort: SORTS.includes(sort) ? (sort as MonsterFilter["sort"]) : "name",
  };
}

const triMatch = (f: "" | "yes" | "no", v: boolean) => f === "" || (f === "yes") === v;

export function filterMonsters(list: MonsterEntry[], f: MonsterFilter): MonsterEntry[] {
  const q = f.q.toLowerCase();
  const abilityKey = f.abilityKey as keyof MonsterEntry["abilities"] | "";
  const out = list.filter(
    (m) =>
      (!q || (f.inDesc ? m.haystack.includes(q) : m.name.toLowerCase().includes(q))) &&
      (f.crMin === null || m.cr >= f.crMin) &&
      (f.crMax === null || m.cr <= f.crMax) &&
      (f.types.length === 0 || f.types.includes(m.type)) &&
      (f.sizes.length === 0 || f.sizes.includes(m.size)) &&
      (!f.env || m.environments.includes(f.env)) &&
      (f.hpMin === null || m.hp >= f.hpMin) &&
      (f.hpMax === null || m.hp <= f.hpMax) &&
      (f.acMin === null || m.ac >= f.acMin) &&
      (f.acMax === null || m.ac <= f.acMax) &&
      (!f.moral || m.moral === f.moral) &&
      (!f.law || m.law === f.law) &&
      f.movement.every((k) => m.movement.includes(k)) &&
      (!f.sense || m.senses.includes(f.sense)) &&
      triMatch(f.legendary, m.legendary) &&
      triMatch(f.spellcaster, m.spellcaster) &&
      (!f.vulnerable || m.vulnerable.includes(f.vulnerable)) &&
      (!f.resistant || m.resistant.includes(f.resistant)) &&
      (!f.immune || m.immune.includes(f.immune)) &&
      (!f.conditionImmune || m.conditionImmune.includes(f.conditionImmune)) &&
      (!f.language || (f.language === "none" ? m.languages.length === 0 : m.languages.includes(f.language))) &&
      triMatch(f.telepathy, m.telepathy) &&
      (!abilityKey || f.abilityMin === null || (m.abilities[abilityKey] ?? 0) >= f.abilityMin) &&
      (!f.source || m.sourceKey === f.source),
  );
  switch (f.sort) {
    case "cr":
      out.sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
      break;
    case "cr-desc":
      out.sort((a, b) => b.cr - a.cr || a.name.localeCompare(b.name));
      break;
    case "hp-desc":
      out.sort((a, b) => b.hp - a.hp || a.name.localeCompare(b.name));
      break;
    case "ac-desc":
      out.sort((a, b) => b.ac - a.ac || a.name.localeCompare(b.name));
      break;
  }
  return out;
}
