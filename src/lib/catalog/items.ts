import type { RawEntry } from "./store";

type NameKey = { name: string; key: string };
type RawWeapon = {
  damage_type: NameKey | null;
  damage_dice: string;
  properties: { property: { name: string; type: string | null; desc: string }; detail: string | null }[];
  is_simple: boolean;
  is_martial: boolean;
  range?: number | null;
  long_range?: number | null;
};
type RawArmor = {
  category: string;
  ac_display: string;
  grants_stealth_disadvantage: boolean;
  strength_score_required: number | null;
};
type RawItem = RawEntry & {
  desc: string;
  category: NameKey;
  rarity?: (NameKey & { rank: number }) | null;
  weapon: RawWeapon | null;
  armor: RawArmor | null;
  weight: string | null;
  weight_unit: string;
  cost: string | null;
  requires_attunement?: boolean;
  attunement_detail?: string | null;
  document: { key: string; display_name: string; gamesystem: NameKey };
};

export type Item = {
  key: string;
  name: string;
  magic: boolean;
  category: string;
  rarity: string | null;
  rarityRank: number;
  attunement: boolean;
  attunementDetail: string | null;
  /** Цена в золотых. У магических предметов в API её нет — берём оценку по редкости. */
  price: number | null;
  priceEstimated: boolean;
  weight: number | null;
  weapon: {
    damage: string;
    damageType: string;
    kind: "simple" | "martial" | null;
    properties: { name: string; detail: string | null; desc: string }[];
  } | null;
  armor: { ac: string; category: string; stealthDisadvantage: boolean; strength: number | null } | null;
  desc: string;
  source: string;
  sourceKey: string;
  system: string;
  haystack: string;
};

/**
 * Рекомендованная цена по редкости (Xanathar's Guide to Everything).
 * Расходники (зелья, свитки, боеприпасы) — вдвое дешевле.
 */
const PRICE_BY_RARITY: Record<string, number> = {
  common: 100,
  uncommon: 400,
  rare: 4000,
  "very-rare": 40000,
  legendary: 200000,
};
const CONSUMABLES = new Set(["potion", "scroll", "ammunition"]);

function normalizeItem(r: RawItem): Item {
  const magic = r._source === "magic";
  const cost = r.cost ? Number(r.cost) : 0;
  let price: number | null = cost > 0 ? cost : null;
  let priceEstimated = false;
  if (price === null && magic && r.rarity && PRICE_BY_RARITY[r.rarity.key]) {
    price = PRICE_BY_RARITY[r.rarity.key] / (CONSUMABLES.has(r.category.key) ? 2 : 1);
    priceEstimated = true;
  }
  const weight = r.weight ? Number(r.weight) : null;

  return {
    key: r.key,
    name: r.name,
    magic,
    category: r.category?.key ?? "",
    rarity: r.rarity?.key ?? null,
    rarityRank: r.rarity?.rank ?? 0,
    attunement: !!r.requires_attunement,
    attunementDetail: r.attunement_detail ?? null,
    price,
    priceEstimated,
    weight: weight && weight > 0 ? weight : null,
    weapon: r.weapon
      ? {
          damage: r.weapon.damage_dice,
          damageType: r.weapon.damage_type?.key ?? "",
          kind: r.weapon.is_martial ? "martial" : r.weapon.is_simple ? "simple" : null,
          properties: (r.weapon.properties ?? []).map((p) => ({
            name: p.property.name,
            detail: p.detail,
            desc: p.property.desc,
          })),
        }
      : null,
    armor: r.armor
      ? {
          ac: r.armor.ac_display,
          category: r.armor.category,
          stealthDisadvantage: r.armor.grants_stealth_disadvantage,
          strength: r.armor.strength_score_required,
        }
      : null,
    desc: r.desc ?? "",
    source: r.document.display_name,
    sourceKey: r.document.key,
    system: r.document.gamesystem.key,
    haystack: `${r.name}\n${r.desc ?? ""}`.toLowerCase(),
  };
}

export function buildItems(raw: RawEntry[]): Item[] {
  return raw
    .map((r) => normalizeItem(r as RawItem))
    .sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

// ---------- Фильтр ----------

export type ItemFilter = {
  q: string;
  inDesc: boolean;
  kind: "" | "magic" | "mundane";
  category: string;
  rarity: string;
  priceMin: number | null;
  priceMax: number | null;
  weightMax: number | null;
  attunement: "" | "yes" | "no";
  damage: string;
  source: string;
  sort: "name" | "price" | "rarity";
};

type SP = Record<string, string | string[] | undefined>;
const one = (v: SP[string]) => (Array.isArray(v) ? v[0] : v) ?? "";
const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));

export function parseItemFilter(sp: SP): ItemFilter {
  const kind = one(sp.kind);
  const att = one(sp.attunement);
  const sort = one(sp.sort);
  return {
    q: one(sp.q).trim(),
    inDesc: one(sp.inDesc) === "1",
    kind: kind === "magic" || kind === "mundane" ? kind : "",
    category: one(sp.category),
    rarity: one(sp.rarity),
    priceMin: num(one(sp.priceMin)),
    priceMax: num(one(sp.priceMax)),
    weightMax: num(one(sp.weightMax)),
    attunement: att === "yes" || att === "no" ? att : "",
    damage: one(sp.damage),
    source: one(sp.source),
    sort: sort === "price" || sort === "rarity" ? sort : "name",
  };
}

export function filterItems(items: Item[], f: ItemFilter): Item[] {
  const q = f.q.toLowerCase();
  const out = items.filter(
    (i) =>
      (!q || (f.inDesc ? i.haystack.includes(q) : i.name.toLowerCase().includes(q))) &&
      (!f.kind || (f.kind === "magic") === i.magic) &&
      (!f.category || i.category === f.category) &&
      (!f.rarity || i.rarity === f.rarity) &&
      (f.priceMin === null || (i.price !== null && i.price >= f.priceMin)) &&
      (f.priceMax === null || (i.price !== null && i.price <= f.priceMax)) &&
      (f.weightMax === null || (i.weight ?? 0) <= f.weightMax) &&
      (!f.attunement || (f.attunement === "yes") === i.attunement) &&
      (!f.damage || i.weapon?.damageType === f.damage) &&
      (!f.source || i.sourceKey === f.source || i.system === f.source),
  );
  if (f.sort === "price") out.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name));
  if (f.sort === "rarity") out.sort((a, b) => a.rarityRank - b.rarityRank || a.name.localeCompare(b.name));
  return out;
}

export function formatPrice(gp: number): string {
  if (gp >= 1) return `${gp.toLocaleString("ru-RU")} зм`;
  if (gp >= 0.1) return `${Math.round(gp * 10)} см`;
  return `${Math.round(gp * 100)} мм`;
}
