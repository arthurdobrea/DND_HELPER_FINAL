/**
 * ИИ-кузница: общие типы и проверка того, что вернул Gemini (без серверных зависимостей — нужен и клиенту).
 * Монстр приходит черновиком сборщика (ForgeDraft): числа атак и Сл программа пересчитывает сама.
 */
import type { Item, Spell } from "@/lib/catalog";
import { CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES, SCHOOLS } from "@/lib/catalog/labels";
import { crText } from "@/lib/cr";
import { sanitizeDraft, type ForgeDraft } from "@/lib/forge";
import { MONSTER_TYPES, SIZES } from "@/lib/catalog/labels";
import type { TierId } from "@/lib/fishing";

export type AiKind = "monster" | "spell" | "item";
export const AI_KINDS: { id: AiKind; label: string; icon: string }[] = [
  { id: "monster", label: "Монстр", icon: "🐲" },
  { id: "spell", label: "Заклинание", icon: "✨" },
  { id: "item", label: "Предмет", icon: "🗡️" },
];

export type AiEntity = { kind: "monster"; draft: ForgeDraft } | { kind: "spell"; spell: Spell } | { kind: "item"; item: Item };

/** Запись истории кузницы. */
export type AiCreation = { id: number; kind: AiKind; name: string; prompt: string; starred: boolean; createdAt: number; entity: AiEntity };

/** Быстрые параметры под полем описания. Пустая строка — «на усмотрение ИИ». */
export type AiOptions = {
  cr: string;
  type: string;
  size: string;
  casting: boolean;
  legendary: boolean;
  level: string;
  school: string;
  cls: string;
  rarity: string;
  category: string;
  attune: boolean;
};
export const defaultOptions = (): AiOptions => ({ cr: "", type: "", size: "", casting: false, legendary: false, level: "", school: "", cls: "", rarity: "", category: "", attune: false });

export type AiQuality = "fast" | "quality";

// ---------- Проверка ответа ----------

const str = (v: unknown, n: number) => (v === null || v === undefined ? "" : String(v)).replace(/\\n/g, "\n").trim().slice(0, n);
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d;
};
const key = (v: unknown, map: Record<string, string>, d = "") => {
  const s = String(v ?? "").trim().toLowerCase();
  if (map[s]) return s;
  // Модель иногда пишет подпись по-русски вместо ключа
  const found = Object.entries(map).find(([, ru]) => ru.toLowerCase() === s);
  return found ? found[0] : d;
};
const keys = (v: unknown, map: Record<string, string>) => [...new Set((Array.isArray(v) ? v : []).map((x) => key(x, map)).filter(Boolean))];
const SAVE_ABILITIES: Record<string, string> = { strength: "Сила", dexterity: "Ловкость", constitution: "Телосложение", intelligence: "Интеллект", wisdom: "Мудрость", charisma: "Харизма" };
const SHORT_SAVE: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

export function sanitizeMonster(raw: unknown): ForgeDraft {
  const r = { ...((raw ?? {}) as Record<string, unknown>) };
  // Модель иногда пишет «Нежить» / «Large» вместо ключей — приводим к ключам до общей проверки
  r.type = key(r.type, MONSTER_TYPES, "humanoid");
  r.size = key(r.size, SIZES, "medium");
  r.law = String(r.law ?? "").toLowerCase();
  r.moral = String(r.moral ?? "").toLowerCase();
  const d = sanitizeDraft(r);
  d.baseName = "ИИ-кузница";
  if (!d.name.trim()) d.name = "Безымянное существо";
  return d;
}

export function sanitizeSpell(raw: unknown, id: string): Spell {
  const r = (raw ?? {}) as Record<string, unknown>;
  const comps = (r.components ?? {}) as Record<string, unknown>;
  const save = String(r.save ?? "").trim().toLowerCase();
  const name = str(r.name, 100) || "Безымянное заклинание";
  const desc = str(r.desc, 6000);
  return {
    key: id,
    name,
    level: Math.round(num(r.level, 0, 9, 1)),
    school: key(r.school, SCHOOLS, "evocation"),
    classes: keys(r.classes, CLASSES),
    castingTime: key(r.castingTime, CASTING_TIMES, "action"),
    reactionCondition: str(r.reactionCondition, 200) || null,
    range: str(r.range, 80) || "На себя",
    duration: str(r.duration, 80) || "Мгновенная",
    concentration: !!r.concentration,
    ritual: !!r.ritual,
    components: { v: comps.v !== false, s: comps.s !== false, m: !!comps.m },
    material: str(r.material, 300),
    save: SAVE_ABILITIES[save] ? save : SHORT_SAVE[save] ?? key(save, SAVE_ABILITIES),
    attack: !!r.attack,
    damageRoll: str(r.damageRoll, 40),
    damageTypes: keys(r.damageTypes, DAMAGE_TYPES),
    conditions: keys(r.conditions, CONDITIONS),
    effects: [],
    area: str(r.area, 120) || null,
    desc,
    higherLevel: str(r.higherLevel, 1500),
    source: "ИИ-кузница",
    sourceKey: "ai",
    system: "5e",
    haystack: `${name} ${desc}`.toLowerCase(),
  };
}

/** Рекомендованная цена по редкости (XGtE) — если модель цену не дала. */
const PRICE_BY_RARITY: Record<string, number> = { common: 100, uncommon: 400, rare: 4000, "very-rare": 40000, legendary: 200000 };
const RARITY_RANK: Record<string, number> = { common: 1, uncommon: 2, rare: 3, "very-rare": 4, legendary: 5, artifact: 6 };

export function sanitizeItem(raw: unknown, id: string): Item {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rarity = key(r.rarity, RARITIES) || null;
  const magic = r.magic === undefined ? !!rarity : !!r.magic;
  const w = r.weapon as Record<string, unknown> | null | undefined;
  const a = r.armor as Record<string, unknown> | null | undefined;
  const given = Number(r.price);
  const price = Number.isFinite(given) && given > 0 ? Math.round(given * 100) / 100 : rarity ? (PRICE_BY_RARITY[rarity] ?? null) : null;
  const name = str(r.name, 100) || "Безымянная вещь";
  const desc = str(r.desc, 6000);
  return {
    key: id,
    name,
    magic,
    category: key(r.category, ITEM_CATEGORIES, magic ? "wondrous-item" : "adventuring-gear"),
    rarity,
    rarityRank: rarity ? (RARITY_RANK[rarity] ?? 0) : 0,
    attunement: !!r.attunement,
    attunementDetail: str(r.attunementDetail, 120) || null,
    price,
    priceEstimated: !(Number.isFinite(given) && given > 0) && price !== null,
    weight: Number.isFinite(Number(r.weight)) && r.weight !== null && r.weight !== "" ? num(r.weight, 0, 10000, 0) : null,
    weapon:
      w && typeof w === "object" && w.damage
        ? {
            damage: str(w.damage, 30),
            damageType: key(w.damageType, DAMAGE_TYPES, "slashing"),
            kind: w.kind === "simple" || w.kind === "martial" ? w.kind : null,
            properties: (Array.isArray(w.properties) ? w.properties : []).slice(0, 10).map((p: Record<string, unknown>) => ({
              name: str(p?.name, 60),
              detail: str(p?.detail, 60) || null,
              desc: str(p?.desc, 400),
            })).filter((p) => p.name),
          }
        : null,
    armor:
      a && typeof a === "object" && a.ac
        ? { ac: str(a.ac, 80), category: str(a.category, 30) || "medium", stealthDisadvantage: !!a.stealthDisadvantage, strength: Number.isFinite(Number(a.strength)) && a.strength !== null ? num(a.strength, 0, 30, 0) : null }
        : null,
    desc,
    source: "ИИ-кузница",
    sourceKey: "ai",
    system: "5e",
    haystack: `${name} ${desc}`.toLowerCase(),
  };
}

// ---------- Подписи ----------

export function entityName(e: AiEntity): string {
  return e.kind === "monster" ? e.draft.name : e.kind === "spell" ? e.spell.name : e.item.name;
}

export function entitySubtitle(e: AiEntity): string {
  if (e.kind === "monster") return [`CR ${crText(e.draft.cr)}`, MONSTER_TYPES[e.draft.type]?.toLowerCase()].filter(Boolean).join(" · ");
  if (e.kind === "spell") return e.spell.level === 0 ? "заговор" : `${e.spell.level} круг`;
  return e.item.rarity ? (RARITIES[e.item.rarity] ?? e.item.rarity).toLowerCase() : (ITEM_CATEGORIES[e.item.category] ?? "предмет").toLowerCase();
}

/** Уровень рыбалки, куда положить предмет как заготовку. */
export function fishingTierOf(it: Item): TierId {
  switch (it.rarity) {
    case "common":
      return "good";
    case "uncommon":
      return "uncommon";
    case "rare":
      return "rare";
    case "very-rare":
      return "very-rare";
    case "legendary":
    case "artifact":
      return "legendary";
  }
  if (it.price !== null && it.price <= 5) return "trinket";
  if (it.price !== null && it.price <= 50) return "gear";
  return "good";
}
