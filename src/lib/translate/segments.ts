import type { Monster, NamedDesc } from "@/lib/open5e";
import type { Spell } from "@/lib/catalog/spells";
import type { Item } from "@/lib/catalog/items";
import { abilityNameRu, armorDescRu, conditionListRu, damageListRu, languagesRu, sensesRu, subtypeRu } from "./dictionary";

/**
 * Одна функция обхода на тип записи: все переводимые машиной строки пропускаются через f.
 * Для сбора строк f просто запоминает их, для подстановки — возвращает перевод из кэша.
 * Короткие поля (урон, состояния, чувства, языки, названия способностей) переводятся по словарю
 * (dictionary.ts) и в f не попадают; названия существ, заклинаний и предметов остаются оригинальными.
 */
export type TextFn = (s: string) => string;

/** Сначала словарь, если он не справился — машинный перевод. */
const viaDict = (f: TextFn, s: string | null | undefined, dict: (x: string) => string | null) => (s ? (dict(s) ?? f(s)) : s);
const text = (f: TextFn, s: string | null | undefined) => (s ? f(s) : s);

const list = (f: TextFn, l: NamedDesc[] | null | undefined) =>
  l ? l.map((a) => ({ ...a, name: abilityNameRu(a.name) ?? a.name, desc: f(a.desc) })) : l;

/**
 * Имя существа внутри его же текстов («The owlbear makes two attacks») переводчик понимает как обычное слово
 * («owl» → «Сова»). Поэтому в источнике оно заменяется меткой Q0Z (одинаковой для всех существ, так что кэш
 * общий), а после перевода метка возвращается как имя в заголовке карточки.
 */
function shieldName(name: string, f: TextFn): TextFn {
  if (!/^[A-Za-z][A-Za-z' -]{2,}$/.test(name)) return f;
  // Имя уже проверено выше (только буквы, пробел, дефис, апостроф), поэтому в регулярку его можно вставлять как есть.
  const re = new RegExp(`\\b(?:the |an? )?${name}s?\\b`, "gi");
  return (s) => f(s.replace(re, "Q0Z")).replace(/Q0Z/g, name);
}

export function mapMonster(m: Monster, f0: TextFn): Monster {
  const f = shieldName(m.name, f0);
  return {
    ...m,
    desc: text(f, m.desc) ?? m.desc,
    subtype: m.subtype ? subtypeRu(m.subtype) : m.subtype,
    armor_desc: viaDict(f, m.armor_desc, armorDescRu),
    damage_vulnerabilities: viaDict(f, m.damage_vulnerabilities, damageListRu) ?? m.damage_vulnerabilities,
    damage_resistances: viaDict(f, m.damage_resistances, damageListRu) ?? m.damage_resistances,
    damage_immunities: viaDict(f, m.damage_immunities, damageListRu) ?? m.damage_immunities,
    condition_immunities: viaDict(f, m.condition_immunities, conditionListRu) ?? m.condition_immunities,
    senses: viaDict(f, m.senses, sensesRu) ?? m.senses,
    languages: m.languages ? languagesRu(m.languages) : m.languages,
    legendary_desc: text(f, m.legendary_desc) ?? m.legendary_desc,
    special_abilities: list(f, m.special_abilities),
    actions: list(f, m.actions),
    bonus_actions: list(f, m.bonus_actions),
    reactions: list(f, m.reactions),
    legendary_actions: list(f, m.legendary_actions),
  };
}

export function mapSpell(s: Spell, f: TextFn): Spell {
  return {
    ...s,
    desc: s.desc ? f(s.desc) : s.desc,
    higherLevel: s.higherLevel ? f(s.higherLevel) : s.higherLevel,
    material: s.material ? f(s.material) : s.material,
    range: s.range ? f(s.range) : s.range,
    duration: s.duration ? f(s.duration) : s.duration,
    reactionCondition: text(f, s.reactionCondition) ?? null,
  };
}

export function mapItem(i: Item, f: TextFn): Item {
  return {
    ...i,
    desc: i.desc ? f(i.desc) : i.desc,
    attunementDetail: text(f, i.attunementDetail) ?? null,
  };
}

export type EntryKindMap = { monster: Monster; spell: Spell; item: Item };

export function mapEntry<K extends keyof EntryKindMap>(kind: K, entry: EntryKindMap[K], f: TextFn): EntryKindMap[K] {
  switch (kind) {
    case "monster":
      return mapMonster(entry as Monster, f) as EntryKindMap[K];
    case "spell":
      return mapSpell(entry as Spell, f) as EntryKindMap[K];
    default:
      return mapItem(entry as Item, f) as EntryKindMap[K];
  }
}

/** Все строки записи, которые нужно переводить машиной (без повторов). */
export function collectTexts<K extends keyof EntryKindMap>(kind: K, entry: EntryKindMap[K]): string[] {
  const out: string[] = [];
  mapEntry(kind, entry, (s) => {
    out.push(s);
    return s;
  });
  return out;
}
