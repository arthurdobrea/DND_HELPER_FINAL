"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { getItems, getMonsterRaw, getMonsters, getSpells, type RawMonster } from "@/lib/catalog";
import type { Item } from "@/lib/catalog/items";
import type { Spell } from "@/lib/catalog/spells";
import { normalizeSheet } from "@/lib/character";
import { emptyBattle, sanitizeBattle, uid, type Battle } from "@/lib/battle";
import { getDb, schema } from "@/lib/db";
import {
  DEFAULT_WEIGHTS,
  HOOKS,
  JUNK,
  SCROLL_LEVELS,
  TIER_BY_ID,
  fitsTier,
  pickKind,
  rollTreasure,
  scrollStats,
  tierFor,
  type Catch,
  type CatchKind,
  type CatchWeights,
  type TierId,
} from "@/lib/fishing";
import type { Monster } from "@/lib/open5e";
import { ensureTranslated } from "@/lib/translate/store";
import { localize } from "@/lib/translate/view";
import { requireWorld } from "@/lib/world";

export type StashEntry = { id: number; tier: TierId; note: string; catch: Catch };
export type PartyMember = { id: number; name: string; level: number };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Одинаковые названия из разных книг склеиваются (приоритет SRD). */
function dedupe<T extends { key: string; name: string }>(list: T[]): T[] {
  const best = new Map<string, T>();
  for (const it of list) {
    const k = it.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || (it.key.startsWith("srd") && !cur.key.startsWith("srd"))) best.set(k, it);
  }
  return [...best.values()];
}

/** Перевод записи каталога: что есть в кэше — сразу, недостающее дозаказываем, но ждём не дольше 12 секунд. */
async function ru<K extends "item" | "spell" | "monster">(kind: K, entry: K extends "item" ? Item : K extends "spell" ? Spell : Monster) {
  type E = typeof entry;
  let loc = localize(kind, entry as never, "ru");
  if (loc.enabled && loc.missing.length) {
    await Promise.race([ensureTranslated(loc.missing).catch(() => undefined), new Promise((r) => setTimeout(r, 12_000))]);
    loc = localize(kind, entry as never, "ru");
  }
  return loc.entry as E;
}

/** Предмет каталога для уровня: сначала категория, потом вещь — чтобы «+1 оружие» не вытесняло остальное. */
async function catalogItem(tier: TierId, excludeKey?: string): Promise<Item | null> {
  const pool = dedupe((await getItems().catch(() => [])).filter((it) => fitsTier(it, tier) && it.key !== excludeKey));
  if (!pool.length) return null;
  const byCat = new Map<string, Item[]>();
  for (const it of pool) byCat.set(it.category, [...(byCat.get(it.category) ?? []), it]);
  return ru("item", pick(pick([...byCat.values()])));
}

/** Заклинание каталога подходящего круга для свитка. */
async function catalogSpell(tier: TierId, excludeKey?: string): Promise<Spell | null> {
  const levels = SCROLL_LEVELS[tier] ?? [1];
  const pool = dedupe((await getSpells().catch(() => [])).filter((s) => levels.includes(s.level) && s.key !== excludeKey));
  if (!pool.length) return null;
  return ru("spell", pick(pool));
}

/** Средний уровень партии мира (для CR водного существа). */
function partyLevel(worldId: number): number {
  const rows = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, worldId), eq(schema.characters.kind, "pc")))
    .all();
  const levels = rows.map((r) => {
    try {
      return normalizeSheet(JSON.parse(r.data)).level || 1;
    } catch {
      return 1;
    }
  });
  return levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 3;
}

/** Водное существо по силам партии (плавающее, CR примерно от трети до половины уровня + 1). */
async function waterCreature(worldId: number, excludeKey?: string): Promise<{ monster: Monster; key: string } | null> {
  const lvl = partyLevel(worldId);
  const lo = Math.max(0.25, Math.floor(lvl / 3));
  const hi = Math.max(1, Math.ceil(lvl / 2) + 1);
  const all = (await getMonsters().catch(() => [])).filter((m) => m.movement.includes("swim") && m.key !== excludeKey);
  let pool = dedupe(all.filter((m) => m.cr >= lo && m.cr <= hi));
  if (!pool.length) pool = dedupe(all.filter((m) => m.cr <= hi));
  if (!pool.length) return null;
  const entry = pick(pool);
  const raw = (await getMonsterRaw(entry.key).catch(() => undefined)) as RawMonster | undefined;
  if (!raw) return null;
  return { monster: await ru("monster", raw as unknown as Monster), key: entry.key };
}

const cleanWeights = (w?: Partial<CatchWeights>): CatchWeights => {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(out) as (keyof CatchWeights)[]) {
    const v = Number(w?.[k]);
    if (Number.isFinite(v) && v >= 0) out[k] = Math.min(1000, v);
  }
  return out;
};

/**
 * Собрать улов уровня tier. kind — какой вид (иначе случайно по весам). Предметы и свитки — из каталога
 * (с ИИ их подменяет клиент через Кузницу). excludeKey — не повторять текущую вещь при перебросе.
 */
export async function fishCatch(input: { tier: TierId; kind?: CatchKind; weights?: Partial<CatchWeights>; value?: number | null; excludeKey?: string }): Promise<Catch> {
  const world = await requireWorld();
  const tier: TierId = TIER_BY_ID[input.tier] ? input.tier : "gear";
  const value = typeof input.value === "number" ? Math.round(input.value) : null;
  const junk = (): Catch => ({ tier: "junk", kind: "junk", value, junk: pick(JUNK) });
  if (tier === "junk" || input.kind === "junk") return junk();
  const kind = input.kind ?? pickKind(cleanWeights(input.weights));

  if (kind === "item") {
    const item = await catalogItem(tier, input.excludeKey);
    return item ? { tier, kind, value, item } : junk();
  }
  if (kind === "scroll") {
    const spell = await catalogSpell(tier, input.excludeKey);
    if (!spell) return junk();
    return { tier, kind, value, spell, scroll: { level: spell.level, ...scrollStats(spell.level) } };
  }
  if (kind === "treasure") return { tier, kind, value, treasure: rollTreasure(tier) };
  if (kind === "hook") return { tier, kind, value, hook: pick(HOOKS.filter((h) => h !== input.excludeKey)) };
  const c = await waterCreature(world.id, input.excludeKey);
  return c ? { tier, kind: "creature", value, monster: c.monster, monsterKey: c.key } : junk();
}

/** Быстрый режим: один бросок (d20 + бонус) → уровень → улов. */
export async function fishQuick(value: number, weights?: Partial<CatchWeights>): Promise<Catch> {
  const v = Math.max(-20, Math.min(60, Math.round(Number(value) || 0)));
  return fishCatch({ tier: tierFor(v).id, weights, value: v });
}

/** Существо на крючке (натуральная 1 при поклёвке). */
export async function fishCreature(): Promise<Catch> {
  return fishCatch({ tier: "good", kind: "creature" });
}

// ---------- Партия ----------

export async function listParty(): Promise<PartyMember[]> {
  const world = await requireWorld();
  return getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .all()
    .map((r) => {
      try {
        const s = normalizeSheet(JSON.parse(r.data));
        return { id: r.id, name: s.name || r.name, level: s.level || 1 };
      } catch {
        return { id: r.id, name: r.name, level: 1 };
      }
    });
}

/** Выдать улов герою: строка в снаряжение, монеты — в кошелёк. */
export async function giveCatch(characterId: number, input: Catch): Promise<{ ok: boolean; error?: string }> {
  const world = await requireWorld();
  const db = getDb();
  const row = db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, Number(characterId)), eq(schema.characters.worldId, world.id)))
    .get();
  if (!row) return { ok: false, error: "Герой не найден" };
  const sheet = normalizeSheet(JSON.parse(row.data));
  const c = input ?? ({} as Catch);
  const lines: string[] = [];
  if (c.kind === "item" && c.item) lines.push(`${c.item.name} (выловлено)`);
  else if (c.kind === "scroll" && c.spell) lines.push(`Свиток заклинания «${c.spell.name}» (${c.spell.level ? `${c.spell.level} круг` : "заговор"}, Сл ${c.scroll?.dc}, +${c.scroll?.attack} к атаке)`);
  else if (c.kind === "treasure" && c.treasure) {
    for (const l of c.treasure.lines) {
      const m = /^Монеты: (.+)$/.exec(l);
      if (m) {
        for (const part of m[1].split(", ")) {
          const [n, unit] = part.split(" ");
          const key = ({ пм: "pp", зм: "gp", см: "sp", мм: "cp" } as const)[unit as "пм"];
          if (key) sheet.coins[key] += Number(n) || 0;
        }
      } else lines.push(l);
    }
  } else if (c.kind === "hook" && c.hook) lines.push(`Находка: ${c.hook}`);
  else if (c.kind === "junk" && c.junk) lines.push(c.junk);
  else return { ok: false, error: "Это нельзя положить в снаряжение" };
  if (lines.length) sheet.equipment = [sheet.equipment.trim(), ...lines.map((l) => `• ${String(l).slice(0, 400)}`)].filter(Boolean).join("\n");
  db.update(schema.characters).set({ data: JSON.stringify(sheet), updatedAt: new Date() }).where(eq(schema.characters.id, row.id)).run();
  revalidatePath(`/characters/${row.id}`);
  return { ok: true };
}

/** Существо с крючка — в текущий бой (добавляется к уже идущему). */
export async function creatureToBattle(monsterKey: string) {
  const world = await requireWorld();
  const db = getDb();
  const m = (await getMonsters().catch(() => [])).find((x) => x.key === monsterKey);
  if (!m) throw new Error("Существо не найдено в бестиарии");
  const row = db.select().from(schema.battles).where(eq(schema.battles.worldId, world.id)).get();
  let state: Battle = emptyBattle();
  try {
    if (row) state = sanitizeBattle(JSON.parse(row.state));
  } catch {
    /* битый бой — начинаем новый */
  }
  state.combatants.push({
    id: uid(),
    kind: "monster",
    name: m.name,
    refKey: m.key,
    sheetId: 0,
    init: null,
    dex: Math.floor((m.abilities.dex - 10) / 2),
    ac: m.ac,
    hp: m.hp,
    hpMax: m.hp,
    conditions: [],
    note: "Вытащен на рыбалке",
    cr: m.cr,
    type: m.type,
    loot: null,
    side: "enemy",
  });
  db.insert(schema.battles)
    .values({ worldId: world.id, state: JSON.stringify(state), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.battles.worldId, set: { state: JSON.stringify(state), updatedAt: new Date() } })
    .run();
  redirect("/battle");
}

// ---------- Заготовки ----------

/** Старый формат заготовки (до переделки рыбалки): вещь без полного статблока. */
type LegacyCatch = { tier: TierId; value: number | null; junk: string | null; item: { key: string; name: string; rarity: string | null; category: string; price: number | null; priceEstimated: boolean; attunement: boolean; desc: string } | null };

function upgrade(raw: unknown): Catch {
  const c = raw as Partial<Catch> & Partial<LegacyCatch>;
  if (c.kind) return c as Catch;
  const tier: TierId = TIER_BY_ID[c.tier as TierId] ? (c.tier as TierId) : "junk";
  if (c.item) {
    const it = c.item as LegacyCatch["item"] & Partial<Item>;
    const item: Item = {
      key: it!.key,
      name: it!.name,
      magic: !!it!.rarity,
      category: it!.category,
      rarity: it!.rarity,
      rarityRank: 0,
      attunement: it!.attunement,
      attunementDetail: null,
      price: it!.price,
      priceEstimated: it!.priceEstimated,
      weight: null,
      weapon: null,
      armor: null,
      desc: it!.desc,
      source: "",
      sourceKey: "",
      system: "",
      haystack: "",
    };
    return { tier, kind: "item", value: c.value ?? null, item };
  }
  return { tier: "junk", kind: "junk", value: c.value ?? null, junk: c.junk ?? "Мусор" };
}

function rowsToStash(rows: (typeof schema.fishingStash.$inferSelect)[]): StashEntry[] {
  const out: StashEntry[] = [];
  for (const r of rows) {
    try {
      const c = upgrade(JSON.parse(r.data));
      out.push({ id: r.id, tier: (TIER_BY_ID[r.tier as TierId] ? r.tier : c.tier) as TierId, note: r.note, catch: c });
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

/** Отложить улов в заготовки. Данные — копия улова (ограничиваем размер). */
export async function stashCatch(input: Catch, note = ""): Promise<StashEntry[]> {
  const world = await requireWorld();
  const c = upgrade(input);
  const tier: TierId = TIER_BY_ID[c.tier] ? c.tier : "junk";
  const data = JSON.stringify({ ...c, tier });
  if (data.length > 200_000) throw new Error("Слишком большой улов для заготовки");
  getDb()
    .insert(schema.fishingStash)
    .values({ worldId: world.id, tier, name: c.kind === "item" ? (c.item?.name ?? "") : (c.junk ?? c.spell?.name ?? c.monster?.name ?? c.hook ?? "Улов").slice(0, 200), data, note: String(note ?? "").slice(0, 300), createdAt: new Date() })
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
