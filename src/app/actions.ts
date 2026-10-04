"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { AUTH_COOKIE, getAccessKey } from "@/lib/auth";
import { PDF_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { STORY_KINDS, type EntryGroup, type EntryKind } from "@/lib/db/schema";
import { STORY_LIMITS, type StoryInput } from "@/lib/story";
import { AiError, generateGrounded, generateText, geminiEnabled } from "@/lib/ai/gemini";
import { DEITY_SYSTEM_PROMPT, SYSTEM_PROMPT, buildDeityPrompt, buildStoryPrompt, parseDeity, type DeityAiRequest, type DeityFields, type StoryAiRequest } from "@/lib/ai/story-prompt";
import { groupAllowed } from "@/lib/categories";
import type { Item } from "@/lib/catalog";
import { rollLoot, sanitizeConfig, type LootConfig, type LootReport } from "@/lib/loot";
import { COLORS, ICON_KEYS, MAX_CATEGORY_NAME, customKey, defaultGroup } from "@/lib/groups";
import { TranslationError, translationEnabled } from "@/lib/translate/engine";
import { ensureTranslated, lookupCached, translatable } from "@/lib/translate/store";
import { getMonster, type Monster } from "@/lib/open5e";
import { applySpellcasting, monsterToSheet } from "@/lib/npc";
import { parseSpellcasting, type SpellLookup } from "@/lib/npc-spells";
import { normalizeSpellName } from "@/lib/spell-names";
import { localize } from "@/lib/translate/view";
import { getItems, getMonsterRaw, getMonsters, getSpells } from "@/lib/catalog";
import { resync, type CatalogKind } from "@/lib/catalog/store";
import { WORLD_COOKIE, findEntry, requireWorld } from "@/lib/world";
import { applyDamage, applyHeal, emptySheet, initiative, normalizeSheet, type CharacterSheet } from "@/lib/character";
import { emptyBattle, sanitizeBattle, uid, type Battle, type Combatant, type Loot } from "@/lib/battle";
import { rollLoot as rollMonsterLoot } from "@/lib/battle-loot";

// ---------- Авторизация ----------

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const key = String(formData.get("key") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (key !== getAccessKey()) return "Неверный ключ";

  (await cookies()).set(AUTH_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

// ---------- Миры ----------

async function openWorld(id: number) {
  getDb().update(schema.worlds).set({ openedAt: new Date() }).where(eq(schema.worlds.id, id)).run();
  (await cookies()).set(WORLD_COOKIE, String(id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/world");
}

export async function createWorld(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const now = new Date();
  const world = getDb()
    .insert(schema.worlds)
    .values({ name, description: String(formData.get("description") ?? "").trim(), createdAt: now, openedAt: now })
    .returning()
    .get();
  await openWorld(world.id);
}

export async function selectWorld(id: number) {
  await openWorld(id);
}

export async function renameWorld(id: number, name: string, description: string) {
  if (!name.trim()) return;
  getDb()
    .update(schema.worlds)
    .set({ name: name.trim(), description: description.trim() })
    .where(eq(schema.worlds.id, id))
    .run();
  revalidatePath("/", "layout");
}

export async function deleteWorld(id: number) {
  getDb().delete(schema.worlds).where(eq(schema.worlds.id, id)).run();
  const jar = await cookies();
  if (jar.get(WORLD_COOKIE)?.value === String(id)) jar.delete(WORLD_COOKIE);
  revalidatePath("/", "layout");
}

// ---------- Закладки мира: заклинания, предметы, монстры ----------

type RefKind = Exclude<EntryKind, "page">;

async function loadSnapshot(kind: RefKind, ref: string): Promise<{ title: string; data: unknown }> {
  if (kind === "monster") {
    // Каталог — в первую очередь (работает офлайн); прямой запрос к API — запасной вариант.
    const m = (await getMonsterRaw(ref).catch(() => undefined)) ?? (await getMonster(ref));
    if (!m) throw new Error("Монстр не найден");
    return { title: m.name, data: m };
  }
  const list = kind === "spell" ? await getSpells() : await getItems();
  const e = list.find((x) => x.key === ref);
  if (!e) throw new Error("Запись не найдена в каталоге");
  return { title: e.name, data: e };
}

function revalidateEntries() {
  revalidatePath("/", "layout");
}

/** Добавить в мир / убрать из мира. Копия записи сохраняется, чтобы работать офлайн. */
export async function toggleEntry(kind: RefKind, ref: string) {
  const world = await requireWorld();
  const db = getDb();
  const existing = findEntry(world.id, kind, ref);
  if (existing) {
    db.delete(schema.worldEntries).where(eq(schema.worldEntries.id, existing.id)).run();
  } else {
    const { title, data } = await loadSnapshot(kind, ref);
    db.insert(schema.worldEntries)
      .values({ worldId: world.id, kind, grp: defaultGroup(kind), ref, title, data: JSON.stringify(data), createdAt: new Date() })
      .run();
  }
  revalidateEntries();
}

/** Перенести закладку в другую категорию (встроенную или свою). */
export async function setEntryGroup(id: number, group: EntryGroup) {
  const world = await requireWorld();
  if (!groupAllowed(world.id, group)) return;
  getDb()
    .update(schema.worldEntries)
    .set({ grp: group })
    .where(and(eq(schema.worldEntries.id, id), eq(schema.worldEntries.worldId, world.id)))
    .run();
  revalidateEntries();
}

export async function saveEntryNotes(id: number, notes: string) {
  const world = await requireWorld();
  getDb()
    .update(schema.worldEntries)
    .set({ notes })
    .where(and(eq(schema.worldEntries.id, id), eq(schema.worldEntries.worldId, world.id)))
    .run();
  revalidateEntries();
}

export async function updateEntry(id: number, title: string, tags: string) {
  const world = await requireWorld();
  const row = getDb()
    .update(schema.worldEntries)
    .set({ title: title.trim(), tags: tags.trim() })
    .where(and(eq(schema.worldEntries.id, id), eq(schema.worldEntries.worldId, world.id)))
    .returning()
    .get();
  revalidateEntries();
  return row;
}

export async function deleteEntry(id: number) {
  const world = await requireWorld();
  getDb()
    .delete(schema.worldEntries)
    .where(and(eq(schema.worldEntries.id, id), eq(schema.worldEntries.worldId, world.id)))
    .run();
  revalidateEntries();
}

// ---------- Сюжетные заметки героев ----------

function cleanStory(raw: StoryInput): StoryInput | null {
  const kind = (STORY_KINDS as readonly string[]).includes(raw.kind) ? raw.kind : null;
  const title = String(raw.title ?? "").trim().slice(0, STORY_LIMITS.title);
  if (!kind || !title) return null;
  const long = (v: unknown) => String(v ?? "").slice(0, STORY_LIMITS.long);
  const short = (v: unknown) => String(v ?? "").trim().slice(0, STORY_LIMITS.short);
  return {
    characterId: raw.characterId === null ? null : Number(raw.characterId),
    kind,
    title,
    body: long(raw.body),
    subject: short(raw.subject),
    trigger: short(raw.trigger),
    boon: long(raw.boon),
  };
}

/** Герой должен быть из текущего мира (null — вся партия). */
function heroInWorld(worldId: number, characterId: number | null): boolean {
  if (characterId === null) return true;
  return !!getDb().select({ id: schema.characters.id }).from(schema.characters).where(characterWhere(characterId, worldId)).get();
}

export type StoryAiResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * ИИ-подсказка текста для заметки (Gemini). Вызывается только кнопкой в форме. Лист героя берётся на сервере,
 * в запрос уходят лишь нужные поля. Ошибки возвращаются понятным текстом, без технических деталей.
 */
export async function generateStoryText(req: StoryAiRequest): Promise<StoryAiResult> {
  const world = await requireWorld();
  if (!geminiEnabled()) return { ok: false, error: "Подсказки выключены: добавьте GEMINI_API_KEY в файл .env и перезапустите приложение." };
  const db = getDb();
  const heroId = req.characterId === null ? null : Number(req.characterId);
  const row = heroId === null ? undefined : db.select().from(schema.characters).where(characterWhere(heroId, world.id)).get();
  const hero = row ? normalizeSheet(JSON.parse(row.data)) : null;
  const others = db
    .select({ title: schema.storyNotes.title })
    .from(schema.storyNotes)
    .where(and(eq(schema.storyNotes.worldId, world.id), heroId === null ? isNull(schema.storyNotes.characterId) : eq(schema.storyNotes.characterId, heroId)))
    .all()
    .map((n) => n.title);
  try {
    const text = await generateText({ system: SYSTEM_PROMPT, prompt: buildStoryPrompt({ ...req, target: req.target === "boon" ? "boon" : "body" }, hero, others) });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "Не удалось получить подсказку. Попробуйте ещё раз." };
  }
}

export type DeityAiResult =
  | { ok: true; fields: DeityFields; source: string; links: { title: string; uri: string }[]; searched: boolean }
  | { ok: false; error: string };

/**
 * «Заполнить всё» для божества: ИИ (Gemini, при желании с поиском в интернете) возвращает заголовок, название, текст, момент
 * и баф вместе со строкой «откуда сведения: канон или придумано» и ссылками на найденные страницы.
 */
export async function generateDeityNote(req: DeityAiRequest): Promise<DeityAiResult> {
  const world = await requireWorld();
  if (!geminiEnabled()) return { ok: false, error: "Подсказки выключены: добавьте GEMINI_API_KEY в файл .env и перезапустите приложение." };
  const subject = String(req.subject ?? "").trim().slice(0, STORY_LIMITS.short);
  if (!subject) return { ok: false, error: "Укажите божество (например, Raven Queen): по нему ИИ ищет сведения." };
  const db = getDb();
  const heroId = req.characterId === null ? null : Number(req.characterId);
  const row = heroId === null ? undefined : db.select().from(schema.characters).where(characterWhere(heroId, world.id)).get();
  const hero = row ? normalizeSheet(JSON.parse(row.data)) : null;
  const others = db
    .select({ title: schema.storyNotes.title })
    .from(schema.storyNotes)
    .where(and(eq(schema.storyNotes.worldId, world.id), heroId === null ? isNull(schema.storyNotes.characterId) : eq(schema.storyNotes.characterId, heroId)))
    .all()
    .map((n) => n.title);
  const prompt = buildDeityPrompt({ ...req, subject, search: !!req.search }, hero, others);
  try {
    const out = await generateGrounded({ system: DEITY_SYSTEM_PROMPT, prompt, maxTokens: 2000 });
    const { fields, source } = parseDeity(out.text);
    if (!fields.body && !fields.boon) return { ok: false, error: "ИИ ответил не в том формате. Нажмите кнопку ещё раз." };
    return {
      ok: true,
      fields: { ...fields, subject: fields.subject || subject },
      source,
      links: out.sources.map((s) => ({ title: s.title, uri: s.uri })),
      searched: out.searched,
    };
  } catch (e) {
    return { ok: false, error: e instanceof AiError ? e.message : "Не удалось получить подсказку. Попробуйте ещё раз." };
  }
}

export async function createStoryNote(input: StoryInput): Promise<number | null> {
  const world = await requireWorld();
  const v = cleanStory(input);
  if (!v || !heroInWorld(world.id, v.characterId)) return null;
  const row = getDb()
    .insert(schema.storyNotes)
    .values({ worldId: world.id, ...v, createdAt: new Date() })
    .returning({ id: schema.storyNotes.id })
    .get();
  revalidatePath("/story");
  return row.id;
}

export async function updateStoryNote(id: number, input: StoryInput) {
  const world = await requireWorld();
  const v = cleanStory(input);
  if (!v || !heroInWorld(world.id, v.characterId)) return;
  getDb()
    .update(schema.storyNotes)
    .set(v)
    .where(and(eq(schema.storyNotes.id, id), eq(schema.storyNotes.worldId, world.id)))
    .run();
  revalidatePath("/story");
}

/** Отметки мастера: рассказано, баф выдан, закреплено. Для «рассказано» запоминается дата. */
export async function setStoryFlag(id: number, flag: "told" | "boonGiven" | "pinned", value: boolean) {
  const world = await requireWorld();
  const patch =
    flag === "told" ? { told: value, toldAt: value ? new Date() : null } : flag === "boonGiven" ? { boonGiven: value } : { pinned: value };
  getDb()
    .update(schema.storyNotes)
    .set(patch)
    .where(and(eq(schema.storyNotes.id, id), eq(schema.storyNotes.worldId, world.id)))
    .run();
  revalidatePath("/story");
}

/** Как отреагировал игрок — записывается после рассказа. */
export async function saveStoryReaction(id: number, reaction: string) {
  const world = await requireWorld();
  getDb()
    .update(schema.storyNotes)
    .set({ reaction: reaction.slice(0, STORY_LIMITS.long) })
    .where(and(eq(schema.storyNotes.id, id), eq(schema.storyNotes.worldId, world.id)))
    .run();
  revalidatePath("/story");
}

export async function deleteStoryNote(id: number) {
  const world = await requireWorld();
  getDb()
    .delete(schema.storyNotes)
    .where(and(eq(schema.storyNotes.id, id), eq(schema.storyNotes.worldId, world.id)))
    .run();
  revalidatePath("/story");
}

// ---------- Свои категории закладок ----------

function cleanCategory(name: string, color: string, icon: string) {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, MAX_CATEGORY_NAME);
  if (!clean || !COLORS.some((c) => c.hex === color) || !(ICON_KEYS as readonly string[]).includes(icon)) return null;
  return { name: clean, color, icon };
}

/** Новая категория мира. Возвращает её ключ (чтобы сразу положить туда закладку) или null, если данные некорректны. */
export async function createCategory(name: string, color: string, icon: string): Promise<EntryGroup | null> {
  const world = await requireWorld();
  const v = cleanCategory(name, color, icon);
  if (!v) return null;
  const row = getDb()
    .insert(schema.worldCategories)
    .values({ worldId: world.id, ...v, createdAt: new Date() })
    .returning({ id: schema.worldCategories.id })
    .get();
  revalidateEntries();
  return customKey(row.id);
}

export async function updateCategory(id: number, name: string, color: string, icon: string) {
  const world = await requireWorld();
  const v = cleanCategory(name, color, icon);
  if (!v) return;
  getDb()
    .update(schema.worldCategories)
    .set(v)
    .where(and(eq(schema.worldCategories.id, id), eq(schema.worldCategories.worldId, world.id)))
    .run();
  revalidateEntries();
}

/** Удалить свою категорию: её закладки не пропадают, а переходят в «Без категории». */
export async function deleteCategory(id: number) {
  const world = await requireWorld();
  const db = getDb();
  db.transaction((tx) => {
    const owned = tx
      .select({ id: schema.worldCategories.id })
      .from(schema.worldCategories)
      .where(and(eq(schema.worldCategories.id, id), eq(schema.worldCategories.worldId, world.id)))
      .get();
    if (!owned) return;
    tx.update(schema.worldEntries)
      .set({ grp: "" })
      .where(and(eq(schema.worldEntries.worldId, world.id), eq(schema.worldEntries.grp, customKey(id))))
      .run();
    tx.delete(schema.worldCategories).where(eq(schema.worldCategories.id, id)).run();
  });
  revalidateEntries();
}

// ---------- Закладки мира: страницы книг ----------

export async function addPageEntry(bookId: number, page: number, title: string, tags = "", group: EntryGroup = "") {
  const world = await requireWorld();
  const row = getDb()
    .insert(schema.worldEntries)
    .values({
      worldId: world.id,
      kind: "page",
      grp: groupAllowed(world.id, group) ? group : "",
      bookId,
      page,
      title: title.trim() || `Стр. ${page}`,
      tags: tags.trim(),
      createdAt: new Date(),
    })
    .returning()
    .get();
  revalidateEntries();
  return row;
}

// ---------- Персонажи ----------

const characterWhere = (id: number, worldId: number) =>
  and(eq(schema.characters.id, id), eq(schema.characters.worldId, worldId));

export async function createCharacter(formData: FormData) {
  const world = await requireWorld();
  const name = String(formData.get("name") ?? "").trim() || "Новый персонаж";
  const sheet = emptySheet(name);
  sheet.playerName = String(formData.get("playerName") ?? "").trim();
  const now = new Date();
  const row = getDb()
    .insert(schema.characters)
    .values({ worldId: world.id, name, data: JSON.stringify(sheet), createdAt: now, updatedAt: now })
    .returning({ id: schema.characters.id })
    .get();
  redirect(`/characters/${row.id}`);
}

/** Автосохранение листа (вызывается с задержкой после правок). */
export async function saveCharacter(id: number, sheet: CharacterSheet) {
  const world = await requireWorld();
  const clean = normalizeSheet(sheet);
  getDb()
    .update(schema.characters)
    .set({ name: clean.name.trim() || "Без имени", data: JSON.stringify(clean), updatedAt: new Date() })
    .where(characterWhere(id, world.id))
    .run();
  revalidatePath("/characters");
}

/** Быстрое изменение хитов с карточки партии: delta < 0 — урон, > 0 — лечение. */
export async function adjustCharacterHp(id: number, delta: number) {
  const world = await requireWorld();
  const db = getDb();
  const row = db.select().from(schema.characters).where(characterWhere(id, world.id)).get();
  if (!row) return;
  const sheet = normalizeSheet(JSON.parse(row.data));
  const next = delta < 0 ? applyDamage(sheet, -delta) : applyHeal(sheet, delta);
  db.update(schema.characters)
    .set({ data: JSON.stringify(next), updatedAt: new Date() })
    .where(characterWhere(id, world.id))
    .run();
  revalidatePath("/characters");
}

export async function deleteCharacter(id: number) {
  const world = await requireWorld();
  const db = getDb();
  const kind = db.select({ kind: schema.characters.kind }).from(schema.characters).where(characterWhere(id, world.id)).get()?.kind;
  db.delete(schema.characters).where(characterWhere(id, world.id)).run();
  revalidatePath("/characters");
  revalidatePath("/npcs");
  redirect(kind === "npc" ? "/npcs" : "/characters");
}

// ---------- NPC из существ бестиария ----------

export type NpcCreateInput = { name: string; backstory: string; motivation: string; monsterKey: string };

/**
 * Создаёт NPC: берёт статблок существа из бестиария (по возможности на русском), переносит его в лист персонажа
 * (характеристики, КД, хиты, атаки, особенности) и добавляет имя, предысторию и мотивацию мастера.
 */
export async function createNpc(input: NpcCreateInput) {
  const world = await requireWorld();
  const raw = (await getMonsterRaw(input.monsterKey).catch(() => undefined)) ?? (await getMonster(input.monsterKey).catch(() => null));
  if (!raw) throw new Error("Существо не найдено в бестиарии");

  // Статблок переводится на русский: уже переведённое берётся из кэша, недостающее переводим, но не дольше 40 секунд.
  let loc = localize("monster", raw as Monster, "ru");
  if (loc.enabled && loc.missing.length) {
    await Promise.race([ensureTranslated(loc.missing).catch(() => undefined), new Promise((r) => setTimeout(r, 40_000))]);
    loc = localize("monster", raw as Monster, "ru");
  }

  const clean = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  // Заклинания разбираем по английскому оригиналу (названия нужны английские, чтобы найти их в каталоге).
  const spellcasting = parseSpellcasting(raw as Monster, await spellLookup());
  const sheet = monsterToSheet(
    loc.entry,
    {
      name: clean(input.name, 100),
      backstory: clean(input.backstory, STORY_LIMITS.long),
      motivation: clean(input.motivation, STORY_LIMITS.long),
    },
    spellcasting,
  );
  const now = new Date();
  const row = getDb()
    .insert(schema.characters)
    .values({ worldId: world.id, name: sheet.name, kind: "npc", monsterKey: input.monsterKey, data: JSON.stringify(sheet), createdAt: now, updatedAt: now })
    .returning({ id: schema.characters.id })
    .get();
  revalidatePath("/npcs");
  redirect(`/npcs/${row.id}`);
}

/** Поиск заклинания в каталоге по нормализованному названию (для разбора заклинаний NPC). */
async function spellLookup(): Promise<SpellLookup> {
  const map = new Map<string, { name: string; level: number }>();
  for (const sp of await getSpells().catch(() => [])) {
    const k = normalizeSpellName(sp.name);
    // При дубликатах из разных книг берём первое (SRD обычно раньше по ключу не гарантирован — достаточно названия и круга).
    if (!map.has(k) || sp.key.startsWith("srd")) map.set(k, { name: sp.name, level: sp.level });
  }
  return (n) => map.get(n);
}

/**
 * Заполняет блоки заклинаний уже созданного NPC из статблока его существа: ячейки и списки по кругам.
 * Не затирает то, что мастер уже вписал: заполняются только пустые круги.
 */
export async function importNpcSpells(id: number): Promise<{ found: number }> {
  const world = await requireWorld();
  const db = getDb();
  const row = db.select().from(schema.characters).where(and(characterWhere(id, world.id), eq(schema.characters.kind, "npc"))).get();
  if (!row?.monsterKey) return { found: 0 };
  const raw = (await getMonsterRaw(row.monsterKey).catch(() => undefined)) ?? (await getMonster(row.monsterKey).catch(() => null));
  if (!raw) return { found: 0 };
  const sc = parseSpellcasting(raw as Monster, await spellLookup());
  if (!sc) return { found: 0 };
  const sheet = normalizeSheet(JSON.parse(row.data));
  applySpellcasting(sheet, sc, true);
  db.update(schema.characters).set({ data: JSON.stringify(sheet), updatedAt: new Date() }).where(characterWhere(id, world.id)).run();
  revalidatePath("/npcs");
  return { found: sc.lists.reduce((n, l) => n + l.length, 0) };
}

// ---------- Трекер боя ----------

/** Сохраняет текущий бой мира (автосохранение из трекера). */
export async function saveBattle(state: Battle) {
  const world = await requireWorld();
  const clean = sanitizeBattle(state);
  getDb()
    .insert(schema.battles)
    .values({ worldId: world.id, state: JSON.stringify(clean), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.battles.worldId, set: { state: JSON.stringify(clean), updatedAt: new Date() } })
    .run();
}

export async function clearBattle() {
  const world = await requireWorld();
  getDb().delete(schema.battles).where(eq(schema.battles.worldId, world.id)).run();
  revalidatePath("/battle");
}

/** Добыча с поверженного монстра: монеты по таблицам DMG, вещь из каталога по CR и трофеи по типу существа. */
export async function rollBattleLoot(cr: number, type: string): Promise<Loot> {
  await requireWorld();
  const items = await getItems().catch(() => []);
  return rollMonsterLoot(Number(cr) || 0, String(type ?? ""), items);
}

const heroCombatant = (id: number, kind: "hero" | "npc", s: CharacterSheet, monsterKey = ""): Combatant => ({
  id: uid(),
  kind,
  name: s.name || "Без имени",
  refKey: monsterKey,
  sheetId: id,
  init: null,
  dex: initiative(s),
  ac: s.ac,
  hp: s.hpCurrent,
  hpMax: Math.max(1, s.hpMax),
  conditions: [],
  note: "",
  cr: 0,
  type: "",
  loot: null,
});

/**
 * Начинает бой из набора монстров (например, из генератора столкновений): монстры по количеству
 * плюс все герои партии мира. Прежний бой заменяется. Затем переходит на страницу трекера.
 */
export async function startBattleFromMonsters(picks: { key: string; count: number }[]) {
  const world = await requireWorld();
  const db = getDb();
  const catalog = new Map((await getMonsters().catch(() => [])).map((m) => [m.key, m]));
  const combatants: Combatant[] = [];
  for (const p of picks.slice(0, 12)) {
    const m = catalog.get(p.key);
    if (!m) continue;
    const count = Math.min(20, Math.max(1, Math.floor(Number(p.count) || 1)));
    for (let i = 0; i < count; i++) {
      combatants.push({
        id: uid(),
        kind: "monster",
        name: count > 1 ? `${m.name} ${i + 1}` : m.name,
        refKey: m.key,
        sheetId: 0,
        init: null,
        dex: Math.floor((m.abilities.dex - 10) / 2),
        ac: m.ac,
        hp: m.hp,
        hpMax: m.hp,
        conditions: [],
        note: "",
        cr: m.cr,
        type: m.type,
        loot: null,
      });
    }
  }
  const heroes = db
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .all()
    .map((r) => heroCombatant(r.id, "hero", normalizeSheet(JSON.parse(r.data))));
  const state: Battle = { ...emptyBattle(), combatants: [...combatants, ...heroes] };
  db.insert(schema.battles)
    .values({ worldId: world.id, state: JSON.stringify(state), updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.battles.worldId, set: { state: JSON.stringify(state), updatedAt: new Date() } })
    .run();
  redirect("/battle");
}

/** Переносит текущие хиты героев и NPC из боя в их листы (после боя). */
export async function syncBattleHp(entries: { sheetId: number; hp: number }[]) {
  const world = await requireWorld();
  const db = getDb();
  for (const e of entries.slice(0, 60)) {
    const row = db.select().from(schema.characters).where(characterWhere(Number(e.sheetId), world.id)).get();
    if (!row) continue;
    const sheet = normalizeSheet(JSON.parse(row.data));
    sheet.hpCurrent = Math.max(0, Math.min(sheet.hpMax, Math.round(Number(e.hp) || 0)));
    db.update(schema.characters).set({ data: JSON.stringify(sheet), updatedAt: new Date() }).where(characterWhere(row.id, world.id)).run();
  }
  revalidatePath("/characters");
  revalidatePath("/npcs");
}

// ---------- Магазин артефактов ----------

const shopWhere = (worldId: number, key: string) =>
  and(eq(schema.shopItems.worldId, worldId), eq(schema.shopItems.itemKey, key));

/** Добавить вещь из каталога в магазин мира / убрать из него. */
export async function toggleShopItem(key: string) {
  const world = await requireWorld();
  const db = getDb();
  const existing = db.select({ id: schema.shopItems.id }).from(schema.shopItems).where(shopWhere(world.id, key)).get();
  if (existing) {
    db.delete(schema.shopItems).where(eq(schema.shopItems.id, existing.id)).run();
  } else {
    const item = (await getItems()).find((i) => i.key === key);
    if (!item) throw new Error("Вещь не найдена в каталоге");
    db.insert(schema.shopItems)
      .values({ worldId: world.id, itemKey: key, name: item.name, data: JSON.stringify(item), price: item.price, qty: 1, createdAt: new Date() })
      .run();
  }
  revalidatePath("/shop");
}

/** Добавить пачку найденных вещей (уже имеющиеся пропускаются). */
export async function addShopItems(keys: string[]) {
  const world = await requireWorld();
  const db = getDb();
  const wanted = new Set(keys.slice(0, 200));
  const items = (await getItems()).filter((i) => wanted.has(i.key));
  db.transaction((tx) => {
    for (const item of items) {
      tx.insert(schema.shopItems)
        .values({ worldId: world.id, itemKey: item.key, name: item.name, data: JSON.stringify(item), price: item.price, qty: 1, createdAt: new Date() })
        .onConflictDoNothing()
        .run();
    }
  });
  revalidatePath("/shop");
}

export type RollShopResult = { added: number; report: LootReport[] };

/**
 * Рандомайзер лута: по настройкам (типы вещей, редкости, сколько штук) случайно наполняет магазин одним нажатием.
 * При replace магазин сначала очищается — всё в одной транзакции, так что неудачный бросок ничего не ломает.
 */
export async function rollShop(raw: LootConfig): Promise<RollShopResult> {
  const world = await requireWorld();
  const cfg = sanitizeConfig(raw);
  const db = getDb();
  const current = db.select().from(schema.shopItems).where(eq(schema.shopItems.worldId, world.id)).all();
  // Без очистки всё имеющееся остаётся (и не повторяется); с очисткой остаются только закреплённые 🔒.
  const exclude = cfg.replace ? new Set<string>() : new Set(current.map((r) => r.itemKey));
  const kept = cfg.replace ? current.filter((r) => r.locked).map((r) => JSON.parse(r.data) as Item) : [];
  const { picks, report } = rollLoot(await getItems(), cfg, exclude, kept, new Set(current.map((r) => r.itemKey)));
  db.transaction((tx) => {
    if (cfg.replace) tx.delete(schema.shopItems).where(and(eq(schema.shopItems.worldId, world.id), eq(schema.shopItems.locked, false))).run();
    for (const { item, qty } of picks) {
      tx.insert(schema.shopItems)
        .values({ worldId: world.id, itemKey: item.key, name: item.name, data: JSON.stringify(item), price: item.price, qty, createdAt: new Date() })
        .onConflictDoNothing()
        .run();
    }
  });
  revalidatePath("/shop");
  return { added: picks.length, report };
}

/** 🔒 Закрепить / открепить вещь: закреплённые рандомайзер лута не заменяет. */
export async function toggleShopLock(id: number) {
  const world = await requireWorld();
  const db = getDb();
  const row = db.select().from(schema.shopItems).where(and(eq(schema.shopItems.id, id), eq(schema.shopItems.worldId, world.id))).get();
  if (!row) return;
  db.update(schema.shopItems).set({ locked: !row.locked }).where(eq(schema.shopItems.id, id)).run();
  revalidatePath("/shop");
}

/** Снять 🔒 со всех вещей мира. */
export async function unlockShop() {
  const world = await requireWorld();
  getDb().update(schema.shopItems).set({ locked: false }).where(eq(schema.shopItems.worldId, world.id)).run();
  revalidatePath("/shop");
}

/** Цена (зм) и количество; qty = null — без ограничений. */
export async function updateShopItem(id: number, price: number | null, qty: number | null) {
  const world = await requireWorld();
  getDb()
    .update(schema.shopItems)
    .set({
      price: price === null ? null : Math.max(0, Math.round(price * 100) / 100),
      qty: qty === null ? null : Math.max(0, Math.floor(qty)),
    })
    .where(and(eq(schema.shopItems.id, id), eq(schema.shopItems.worldId, world.id)))
    .run();
  revalidatePath("/shop");
}

export async function clearShop() {
  const world = await requireWorld();
  getDb().delete(schema.shopItems).where(eq(schema.shopItems.worldId, world.id)).run();
  revalidatePath("/shop");
}

// ---------- Автоперевод ----------

export type TranslateResult = { ok: true } | { ok: false; error: string };

/**
 * Переводит пачку строк и кладёт в кэш. Вызывается из AutoTranslate порциями.
 * texts приходит ОДНОЙ строкой — JSON-массивом. Так надёжнее: длинные строки Next отправляет как FormData,
 * а при такой отправке браузер может заменить «
» на «

» — текст изменился бы, и перевод лёг бы в кэш
 * под другим ключом (страница его потом не находит). В JSON переводы строк экранированы и не искажаются.
 */
export async function translateSegments(payload: string): Promise<TranslateResult> {
  if (!translationEnabled()) return { ok: false, error: "Автоперевод недоступен: сервис перевода не запущен (docker compose up -d)" };
  let texts: unknown;
  try {
    texts = JSON.parse(payload);
  } catch {
    return { ok: false, error: "Некорректный запрос на перевод" };
  }
  // Защита от случайных гигантских запросов (каждый платный).
  if (!Array.isArray(texts) || texts.length > 40 || texts.some((t) => typeof t !== "string") || texts.reduce((n: number, t: string) => n + t.length, 0) > 60_000) {
    return { ok: false, error: "Слишком большой запрос на перевод" };
  }
  const list = texts as string[];
  try {
    await ensureTranslated(list);
    // Ответ «ок» только если перевод реально лежит в кэше — иначе страница никогда не увидит результат.
    const wanted = translatable(list);
    const stored = lookupCached(wanted).size;
    if (stored < wanted.length) {
      console.error(`[translate] сохранено ${stored} из ${wanted.length} строк`);
      return { ok: false, error: `Часть переводов не сохранилась (${stored} из ${wanted.length}) — повторите` };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof TranslationError) return { ok: false, error: e.message };
    console.error("[translate]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Не удалось перевести (ответ модели не распознан) — повторите" };
  }
}

// ---------- Каталоги ----------

export async function resyncCatalog(kind: CatalogKind) {
  await resync(kind);
  revalidatePath(`/${kind}`);
}

// ---------- Книги ----------

export async function renameBook(id: number, title: string) {
  if (!title.trim()) return;
  getDb().update(schema.books).set({ title: title.trim() }).where(eq(schema.books.id, id)).run();
  revalidateEntries();
}

export async function deleteBook(id: number) {
  const db = getDb();
  const book = db.select().from(schema.books).where(eq(schema.books.id, id)).get();
  if (!book) return;
  // Закладки на страницы этой книги во всех мирах удаляются каскадно.
  db.delete(schema.books).where(eq(schema.books.id, id)).run();
  await fs.rm(path.join(PDF_DIR, book.fileName), { force: true });
  revalidateEntries();
}
