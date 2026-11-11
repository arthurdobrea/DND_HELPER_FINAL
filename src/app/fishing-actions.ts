"use server";

import { and, desc, eq } from "drizzle-orm";
import { getItems } from "@/lib/catalog";
import type { Item } from "@/lib/catalog/items";
import { getDb, schema } from "@/lib/db";
import { JUNK, TIER_BY_ID, fitsTier, tierFor, type TierId } from "@/lib/fishing";
import { ensureTranslated } from "@/lib/translate/store";
import { localize } from "@/lib/translate/view";
import { requireWorld } from "@/lib/world";

/** Вещь улова — то, что нужно показать и сохранить (копия, чтобы заготовки пережили обновление каталога). */
export type FishItem = {
  key: string;
  name: string;
  nameEn: string;
  rarity: string | null;
  category: string;
  price: number | null;
  priceEstimated: boolean;
  attunement: boolean;
  desc: string;
};
export type FishCatch = { tier: TierId; value: number | null; item: FishItem | null; junk: string | null };
export type StashEntry = { id: number; tier: TierId; note: string; catch: FishCatch };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Одинаковые названия из разных книг склеиваются (приоритет SRD). */
function dedupe(items: Item[]): Item[] {
  const best = new Map<string, Item>();
  for (const it of items) {
    const k = it.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || (it.key.startsWith("srd") && !cur.key.startsWith("srd"))) best.set(k, it);
  }
  return [...best.values()];
}

async function toFishItem(it: Item): Promise<FishItem> {
  let loc = localize("item", it, "ru");
  // Название и описание переводим сразу, но не ждём дольше 12 секунд.
  if (loc.enabled && loc.missing.length) {
    await Promise.race([ensureTranslated(loc.missing).catch(() => undefined), new Promise((r) => setTimeout(r, 12_000))]);
    loc = localize("item", it, "ru");
  }
  return {
    key: it.key,
    name: loc.entry.name,
    nameEn: it.name,
    rarity: it.rarity,
    category: it.category,
    price: it.price,
    priceEstimated: it.priceEstimated,
    attunement: it.attunement,
    desc: loc.entry.desc.slice(0, 3000),
  };
}

/**
 * Улов для уровня: с вероятностью «мусора» уровня — мусор, иначе случайная вещь каталога этого уровня.
 * Сначала выбирается категория (оружие, зелье, чудесный предмет…), потом вещь — чтобы «+1 оружие» не вытесняло остальное.
 */
async function catchFor(tier: TierId, value: number | null, excludeKey?: string): Promise<FishCatch> {
  const t = TIER_BY_ID[tier];
  if (Math.random() < t.junk) return { tier, value, item: null, junk: pick(JUNK) };
  const pool = dedupe((await getItems().catch(() => [])).filter((it) => fitsTier(it, tier) && it.key !== excludeKey));
  if (pool.length === 0) return { tier, value, item: null, junk: pick(JUNK) };
  const byCat = new Map<string, Item[]>();
  for (const it of pool) byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
  const item = pick(pick([...byCat.values()]));
  return { tier, value, item: await toFishItem(item), junk: null };
}

/** Тянем по результату броска (d20 + бонус). excludeKey — не повторять текущую вещь при перебросе. */
export async function fishByRoll(value: number, excludeKey?: string): Promise<FishCatch> {
  await requireWorld();
  const v = Math.max(-20, Math.min(60, Math.round(Number(value) || 0)));
  return catchFor(tierFor(v).id, v, excludeKey);
}

/** Вариант для конкретного уровня — чтобы заранее набрать заготовок. */
export async function fishByTier(tier: TierId, excludeKey?: string): Promise<FishCatch> {
  await requireWorld();
  if (!TIER_BY_ID[tier]) throw new Error("Неизвестный уровень улова");
  return catchFor(tier, null, excludeKey);
}

function rowsToStash(rows: (typeof schema.fishingStash.$inferSelect)[]): StashEntry[] {
  const out: StashEntry[] = [];
  for (const r of rows) {
    try {
      out.push({ id: r.id, tier: r.tier as TierId, note: r.note, catch: JSON.parse(r.data) as FishCatch });
    } catch {
      /* битая запись пропускается */
    }
  }
  return out;
}

export async function listStash(): Promise<StashEntry[]> {
  const world = await requireWorld();
  return rowsToStash(getDb().select().from(schema.fishingStash).where(eq(schema.fishingStash.worldId, world.id)).orderBy(desc(schema.fishingStash.createdAt)).all());
}

const clean = (c: FishCatch): FishCatch => {
  const tier: TierId = TIER_BY_ID[c?.tier] ? c.tier : "junk";
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const it = c?.item;
  return {
    tier,
    value: typeof c?.value === "number" ? Math.round(c.value) : null,
    junk: c?.junk ? s(c.junk, 300) : null,
    item: it
      ? {
          key: s(it.key, 120),
          name: s(it.name, 200),
          nameEn: s(it.nameEn, 200),
          rarity: it.rarity ? s(it.rarity, 20) : null,
          category: s(it.category, 40),
          price: typeof it.price === "number" ? it.price : null,
          priceEstimated: !!it.priceEstimated,
          attunement: !!it.attunement,
          desc: s(it.desc, 3000),
        }
      : null,
  };
};

/** Отложить улов в заготовки. */
export async function stashCatch(input: FishCatch, note = ""): Promise<StashEntry[]> {
  const world = await requireWorld();
  const c = clean(input);
  if (!c.item && !c.junk) throw new Error("Пустой улов");
  getDb()
    .insert(schema.fishingStash)
    .values({ worldId: world.id, tier: c.tier, name: c.item?.name ?? c.junk ?? "", data: JSON.stringify(c), note: String(note ?? "").slice(0, 300), createdAt: new Date() })
    .run();
  return listStash();
}

/** Убрать заготовку (выдана игрокам или больше не нужна). */
export async function removeStash(id: number): Promise<StashEntry[]> {
  const world = await requireWorld();
  getDb().delete(schema.fishingStash).where(and(eq(schema.fishingStash.id, id), eq(schema.fishingStash.worldId, world.id))).run();
  return listStash();
}

export async function noteStash(id: number, note: string): Promise<void> {
  const world = await requireWorld();
  getDb()
    .update(schema.fishingStash)
    .set({ note: String(note ?? "").slice(0, 300) })
    .where(and(eq(schema.fishingStash.id, id), eq(schema.fishingStash.worldId, world.id)))
    .run();
}
