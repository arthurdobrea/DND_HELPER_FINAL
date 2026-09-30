"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { AUTH_COOKIE, getAccessKey } from "@/lib/auth";
import { PDF_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import type { EntryKind } from "@/lib/db/schema";
import { getMonster } from "@/lib/open5e";
import { getItems, getMonsterRaw, getSpells } from "@/lib/catalog";
import { resync, type CatalogKind } from "@/lib/catalog/store";
import { WORLD_COOKIE, findEntry, requireWorld } from "@/lib/world";
import { applyDamage, applyHeal, emptySheet, normalizeSheet, type CharacterSheet } from "@/lib/character";

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
      .values({ worldId: world.id, kind, ref, title, data: JSON.stringify(data), createdAt: new Date() })
      .run();
  }
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

// ---------- Закладки мира: страницы книг ----------

export async function addPageEntry(bookId: number, page: number, title: string, tags = "") {
  const world = await requireWorld();
  const row = getDb()
    .insert(schema.worldEntries)
    .values({
      worldId: world.id,
      kind: "page",
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
  getDb().delete(schema.characters).where(characterWhere(id, world.id)).run();
  revalidatePath("/characters");
  redirect("/characters");
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
