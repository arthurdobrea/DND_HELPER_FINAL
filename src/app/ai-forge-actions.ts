"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { AiError, generateJson, geminiEnabled } from "@/lib/ai/gemini";
import {
  entityName,
  sanitizeItem,
  sanitizeMonster,
  sanitizeSpell,
  type AiCreation,
  type AiEntity,
  type AiKind,
  type AiOptions,
  type AiQuality,
} from "@/lib/ai-forge";
import type { Item } from "@/lib/catalog";
import { SYSTEM, TOKENS, constraints, parseVariants } from "@/lib/ai-forge-prompts";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";

/** Сколько обычных (не ⭐) записей истории хранить в мире. */
const HISTORY_LIMIT = 60;

function toEntity(kind: AiKind, raw: unknown, id: string): AiEntity {
  if (kind === "monster") return { kind, draft: sanitizeMonster(raw) };
  if (kind === "spell") return { kind, spell: sanitizeSpell(raw, id) };
  return { kind, item: sanitizeItem(raw, id) };
}

/** Убираем из JSON для уточнения служебные поля — модели они не нужны. */
function forModel(e: AiEntity): unknown {
  if (e.kind === "monster") {
    const { baseName: _b, ...rest } = e.draft;
    void _b;
    return { ...rest, abilities: rest.abilities.map(({ id: _i, from: _f, ...a }) => (void _i, void _f, a)) };
  }
  if (e.kind === "spell") {
    const { key: _k, haystack: _h, source: _s, sourceKey: _sk, system: _sy, effects: _e, ...rest } = e.spell;
    void [_k, _h, _s, _sk, _sy, _e];
    return rest;
  }
  const { key: _k, haystack: _h, source: _s, sourceKey: _sk, system: _sy, rarityRank: _r, priceEstimated: _p, ...rest } = e.item;
  void [_k, _h, _s, _sk, _sy, _r, _p];
  return rest;
}

const modelFor = (q: AiQuality | undefined) => (q === "quality" ? (process.env.GEMINI_MODEL_QUALITY ?? "").trim() || "gemini-3.5-flash" : undefined);

// ---------- История ----------

type Row = typeof schema.aiCreations.$inferSelect;
function toCreation(r: Row): AiCreation | null {
  try {
    return { id: r.id, kind: r.kind, name: r.name, prompt: r.prompt, starred: r.starred, createdAt: r.createdAt.getTime(), entity: JSON.parse(r.data) as AiEntity };
  } catch {
    return null;
  }
}

function store(worldId: number, kind: AiKind, prompt: string, raws: unknown[]): AiCreation[] {
  const db = getDb();
  const out: AiCreation[] = [];
  for (const raw of raws) {
    // Ключ сущности зависит от id записи — сначала вставляем заготовку, потом пишем данные.
    const row = db
      .insert(schema.aiCreations)
      .values({ worldId, kind, name: "…", prompt: prompt.slice(0, 2000), data: "{}", createdAt: new Date() })
      .returning()
      .get();
    const entity = toEntity(kind, raw, `ai:${row.id}`);
    const name = entityName(entity).slice(0, 100);
    db.update(schema.aiCreations).set({ name, data: JSON.stringify(entity) }).where(eq(schema.aiCreations.id, row.id)).run();
    out.push({ id: row.id, kind, name, prompt: row.prompt, starred: false, createdAt: row.createdAt.getTime(), entity });
  }
  // Чистка: обычных записей не больше HISTORY_LIMIT, ⭐ остаются всегда
  const keep = db
    .select({ id: schema.aiCreations.id })
    .from(schema.aiCreations)
    .where(and(eq(schema.aiCreations.worldId, worldId), eq(schema.aiCreations.starred, false)))
    .orderBy(desc(schema.aiCreations.id))
    .limit(HISTORY_LIMIT)
    .all()
    .map((r) => r.id);
  if (keep.length >= HISTORY_LIMIT) {
    db.delete(schema.aiCreations)
      .where(and(eq(schema.aiCreations.worldId, worldId), eq(schema.aiCreations.starred, false), notInArray(schema.aiCreations.id, keep)))
      .run();
  }
  return out;
}

export type AiResult = { ok: true; items: AiCreation[] } | { ok: false; error: string };

const fail = (e: unknown): AiResult => {
  if (e instanceof AiError) return { ok: false, error: e.message };
  console.error("[ai-forge]", e);
  return { ok: false, error: "Не удалось сгенерировать. Попробуйте ещё раз." };
};

/** Сгенерировать 1–3 варианта по описанию. Все варианты сразу попадают в историю. */
export async function aiGenerate(input: { kind: AiKind; prompt: string; options?: Partial<AiOptions>; count?: number; quality?: AiQuality }): Promise<AiResult> {
  const world = await requireWorld();
  if (!geminiEnabled()) return { ok: false, error: "ИИ выключен: добавьте GEMINI_API_KEY в файл .env и перезапустите приложение." };
  const kind: AiKind = ["monster", "spell", "item"].includes(input.kind) ? input.kind : "monster";
  const prompt = String(input.prompt ?? "").trim().slice(0, 2000);
  const extra = constraints(kind, input.options ?? {});
  if (!prompt && !extra.length) return { ok: false, error: "Опишите, что нужно создать." };
  const count = Math.max(1, Math.min(3, Math.round(Number(input.count) || 1)));
  const what = { monster: "существо", spell: "заклинание", item: "предмет" }[kind];
  const userPrompt = [
    `Придумай ${what}. Вариантов: ${count}.`,
    prompt && `Пожелания мастера: ${prompt}`,
    extra.length && `Обязательные условия: ${extra.join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const text = await generateJson({ system: SYSTEM[kind], prompt: userPrompt, model: modelFor(input.quality), maxTokens: TOKENS[kind] * count + 2000 });
    const raws = parseVariants(text).slice(0, count);
    if (!raws.length) return { ok: false, error: "Gemini не вернул ни одного варианта. Попробуйте ещё раз." };
    const items = store(world.id, kind, prompt || extra.join("; "), raws);
    return { ok: true, items };
  } catch (e) {
    return fail(e);
  }
}

/** Доработать вариант по просьбе («сделай слабее», «добавь атаку хвостом»). Результат — новая запись истории. */
export async function aiRefine(input: { id: number; instruction: string; quality?: AiQuality }): Promise<AiResult> {
  const world = await requireWorld();
  if (!geminiEnabled()) return { ok: false, error: "ИИ выключен: добавьте GEMINI_API_KEY в файл .env и перезапустите приложение." };
  const instruction = String(input.instruction ?? "").trim().slice(0, 1000);
  if (!instruction) return { ok: false, error: "Напишите, что изменить." };
  const row = getDb()
    .select()
    .from(schema.aiCreations)
    .where(and(eq(schema.aiCreations.id, Number(input.id)), eq(schema.aiCreations.worldId, world.id)))
    .get();
  const base = row && toCreation(row);
  if (!base) return { ok: false, error: "Исходный вариант не найден." };
  const userPrompt = `Вот текущий вариант (JSON):\n${JSON.stringify(forModel(base.entity))}\n\nИзмени его по просьбе мастера: ${instruction}\nОстальное сохрани как есть. Верни {"variants": [один изменённый вариант]} в том же формате.`;
  try {
    const text = await generateJson({ system: SYSTEM[base.kind], prompt: userPrompt, model: modelFor(input.quality), maxTokens: TOKENS[base.kind] + 2000 });
    const raws = parseVariants(text).slice(0, 1);
    if (!raws.length) return { ok: false, error: "Gemini не вернул результат. Попробуйте ещё раз." };
    return { ok: true, items: store(world.id, base.kind, `${base.prompt}\n→ ${instruction}`.slice(0, 2000), raws) };
  } catch (e) {
    return fail(e);
  }
}

export async function aiHistory(): Promise<AiCreation[]> {
  const world = await requireWorld();
  return getDb()
    .select()
    .from(schema.aiCreations)
    .where(eq(schema.aiCreations.worldId, world.id))
    .orderBy(desc(schema.aiCreations.id))
    .limit(HISTORY_LIMIT + 200)
    .all()
    .map(toCreation)
    .filter((c): c is AiCreation => !!c && c.name !== "…");
}

export async function aiStar(id: number, starred: boolean): Promise<void> {
  const world = await requireWorld();
  getDb()
    .update(schema.aiCreations)
    .set({ starred: !!starred })
    .where(and(eq(schema.aiCreations.id, Number(id)), eq(schema.aiCreations.worldId, world.id)))
    .run();
}

export async function aiDelete(id: number): Promise<void> {
  const world = await requireWorld();
  getDb()
    .delete(schema.aiCreations)
    .where(and(eq(schema.aiCreations.id, Number(id)), eq(schema.aiCreations.worldId, world.id)))
    .run();
}

/** Положить сгенерированный предмет в магазин мира (один экземпляр). */
export async function aiItemToShop(id: number): Promise<{ ok: boolean; error?: string }> {
  const world = await requireWorld();
  const row = getDb()
    .select()
    .from(schema.aiCreations)
    .where(and(eq(schema.aiCreations.id, Number(id)), eq(schema.aiCreations.worldId, world.id)))
    .get();
  const c = row && toCreation(row);
  if (!c || c.entity.kind !== "item") return { ok: false, error: "Предмет не найден" };
  const item: Item = c.entity.item;
  const db = getDb();
  const exists = db
    .select({ id: schema.shopItems.id })
    .from(schema.shopItems)
    .where(and(eq(schema.shopItems.worldId, world.id), eq(schema.shopItems.itemKey, item.key)))
    .get();
  if (exists) return { ok: false, error: "Этот предмет уже в магазине" };
  db.insert(schema.shopItems)
    .values({ worldId: world.id, itemKey: item.key, name: item.name, data: JSON.stringify(item), price: item.price, qty: 1, createdAt: new Date() })
    .run();
  revalidatePath("/shop");
  return { ok: true };
}
