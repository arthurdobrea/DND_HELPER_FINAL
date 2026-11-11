"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { normalizeSheet } from "@/lib/character";
import { requireWorld } from "@/lib/world";
import { CUSTOM_PREFIX, customKey } from "@/lib/custom-monsters";
import { buildMonster, sanitizeDraft, spellcastingOf, type ForgeDraft } from "@/lib/forge";
import { monsterToSheet } from "@/lib/npc";
import { ensureTranslated, lookupCached, translatable } from "@/lib/translate/store";

/**
 * Создаёт NPC из черновика конструктора: сохраняет собранный статблок как «своего монстра» мира
 * (ключ custom:<id>), собирает из него лист персонажа и открывает его.
 */
export async function createForgedNpc(input: ForgeDraft): Promise<void> {
  const world = await requireWorld();
  const draft = sanitizeDraft(input);
  if (!draft.name.trim()) throw new Error("Укажите имя NPC");

  const monster = buildMonster(draft);
  const sheet = monsterToSheet(monster, { name: draft.name, backstory: draft.backstory, motivation: draft.motivation }, spellcastingOf(draft));
  sheet.background = "Создан в конструкторе";
  const now = new Date();
  const db = getDb();
  const mon = db
    .insert(schema.customMonsters)
    .values({ worldId: world.id, name: monster.name, data: JSON.stringify(monster), draft: JSON.stringify(draft), createdAt: now })
    .returning({ id: schema.customMonsters.id })
    .get();
  const row = db
    .insert(schema.characters)
    .values({ worldId: world.id, name: sheet.name, kind: "npc", monsterKey: customKey(mon.id), data: JSON.stringify(sheet), createdAt: now, updatedAt: now })
    .returning({ id: schema.characters.id })
    .get();
  revalidatePath("/npcs");
  redirect(`/npcs/${row.id}`);
}

/**
 * Сохраняет правки NPC из конструктора: обновляет статблок и пересобирает производные поля листа
 * (характеристики, КД, хиты, атаки, особенности, заклинания). Снаряжение, монеты, личность и прочее, что мастер вписал в лист, сохраняется.
 */
export async function updateForgedNpc(characterId: number, input: ForgeDraft): Promise<void> {
  const world = await requireWorld();
  const draft = sanitizeDraft(input);
  if (!draft.name.trim()) throw new Error("Укажите имя NPC");

  const db = getDb();
  const row = db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, characterId), eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "npc")))
    .get();
  if (!row) throw new Error("NPC не найден");
  // NPC на основе монстра бестиария при первом сохранении становится «своим монстром» мира.
  let monId = row.monsterKey?.startsWith(CUSTOM_PREFIX) ? Number(row.monsterKey.slice(CUSTOM_PREFIX.length)) : NaN;

  const monster = buildMonster(draft);
  const fresh = monsterToSheet(monster, { name: draft.name, backstory: draft.backstory, motivation: draft.motivation }, spellcastingOf(draft));
  const old = normalizeSheet(JSON.parse(row.data));
  const sheet = {
    ...fresh,
    background: old.background || "Создан в конструкторе",
    inspiration: old.inspiration,
    initiativeBonus: old.initiativeBonus,
    hpCurrent: Math.max(0, Math.min(old.hpCurrent, fresh.hpMax)),
    hpTemp: old.hpTemp,
    hitDiceUsed: Math.min(old.hitDiceUsed, 99),
    deathSuccess: old.deathSuccess,
    deathFail: old.deathFail,
    coins: old.coins,
    equipment: old.equipment,
    personality: old.personality,
    ideals: old.ideals,
    bonds: old.bonds,
    flaws: old.flaws,
    allies: old.allies,
    treasure: old.treasure,
    appearance: old.appearance || fresh.appearance,
    slots: fresh.slots.map((s, i) => ({ max: s.max, used: Math.min(old.slots[i]?.used ?? 0, s.max) })),
  };

  const now = new Date();
  const existing = Number.isInteger(monId)
    ? db
        .select({ id: schema.customMonsters.id })
        .from(schema.customMonsters)
        .where(and(eq(schema.customMonsters.id, monId), eq(schema.customMonsters.worldId, world.id)))
        .get()
    : undefined;
  if (existing) {
    db.update(schema.customMonsters)
      .set({ name: monster.name, data: JSON.stringify(monster), draft: JSON.stringify(draft) })
      .where(eq(schema.customMonsters.id, existing.id))
      .run();
  } else {
    monId = db
      .insert(schema.customMonsters)
      .values({ worldId: world.id, name: monster.name, data: JSON.stringify(monster), draft: JSON.stringify(draft), createdAt: now })
      .returning({ id: schema.customMonsters.id })
      .get().id;
  }
  db.update(schema.characters)
    .set({ name: sheet.name, monsterKey: customKey(monId), data: JSON.stringify(sheet), updatedAt: now })
    .where(and(eq(schema.characters.id, characterId), eq(schema.characters.worldId, world.id)))
    .run();
  revalidatePath("/npcs");
  revalidatePath(`/npcs/${characterId}`);
  redirect(`/npcs/${characterId}`);
}

/**
 * Переводит на русский названия и тексты способностей, добавленных из бестиария (если их ещё нет в кэше переводов).
 * Ждёт не дольше 40 секунд; что успело перевестись — возвращает, остальное остаётся как есть.
 * Ответ: «исходный текст → русский».
 */
export async function translateTexts(texts: string[]): Promise<Record<string, string>> {
  await requireWorld();
  const wanted = translatable((Array.isArray(texts) ? texts : []).slice(0, 120).map((t) => String(t ?? "").slice(0, 8000)));
  if (wanted.length === 0) return {};
  await Promise.race([ensureTranslated(wanted).catch(() => undefined), new Promise((r) => setTimeout(r, 40_000))]);
  return Object.fromEntries(lookupCached(wanted));
}
