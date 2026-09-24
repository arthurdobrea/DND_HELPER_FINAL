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
import { getMonster } from "@/lib/open5e";
import { getItems, getSpells } from "@/lib/catalog";
import { resync, type CatalogKind } from "@/lib/catalog/store";

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

// ---------- Избранные монстры ----------

export async function toggleFavorite(slug: string) {
  const db = getDb();
  const existing = db.select().from(schema.favorites).where(eq(schema.favorites.slug, slug)).get();

  if (existing) {
    db.delete(schema.favorites).where(eq(schema.favorites.id, existing.id)).run();
  } else {
    const monster = await getMonster(slug);
    if (!monster) throw new Error("Монстр не найден");
    db.insert(schema.favorites)
      .values({
        slug: monster.slug,
        name: monster.name,
        cr: monster.cr,
        type: monster.type,
        data: JSON.stringify(monster),
        createdAt: new Date(),
      })
      .run();
  }
  revalidatePath("/favorites");
  revalidatePath(`/monsters/${slug}`);
}

export async function saveFavoriteNotes(slug: string, notes: string) {
  getDb().update(schema.favorites).set({ notes }).where(eq(schema.favorites.slug, slug)).run();
  revalidatePath(`/monsters/${slug}`);
  revalidatePath("/favorites");
}

// ---------- Закреплённые заклинания и предметы ----------

const pinWhere = (kind: CatalogKind, key: string) => and(eq(schema.pins.kind, kind), eq(schema.pins.key, key));

export async function togglePin(kind: CatalogKind, key: string) {
  const db = getDb();
  const existing = db.select({ id: schema.pins.id }).from(schema.pins).where(pinWhere(kind, key)).get();
  if (existing) {
    db.delete(schema.pins).where(eq(schema.pins.id, existing.id)).run();
  } else {
    const list = kind === "spells" ? await getSpells() : await getItems();
    const entry = list.find((e) => e.key === key);
    if (!entry) throw new Error("Запись не найдена в каталоге");
    // Копия записи — закреп переживёт обновление каталога.
    db.insert(schema.pins)
      .values({ kind, key, name: entry.name, data: JSON.stringify(entry), createdAt: new Date() })
      .run();
  }
  revalidatePath(`/${kind}`);
  revalidatePath("/favorites");
}

export async function savePinNotes(kind: CatalogKind, key: string, notes: string) {
  getDb().update(schema.pins).set({ notes }).where(pinWhere(kind, key)).run();
  revalidatePath(`/${kind}`);
  revalidatePath("/favorites");
}

export async function resyncCatalog(kind: CatalogKind) {
  await resync(kind);
  revalidatePath(`/${kind}`);
}

// ---------- Книги и закладки ----------

export async function renameBook(id: number, title: string) {
  if (!title.trim()) return;
  getDb().update(schema.books).set({ title: title.trim() }).where(eq(schema.books.id, id)).run();
  revalidatePath("/books");
}

export async function deleteBook(id: number) {
  const db = getDb();
  const book = db.select().from(schema.books).where(eq(schema.books.id, id)).get();
  if (!book) return;
  db.delete(schema.books).where(eq(schema.books.id, id)).run();
  await fs.rm(path.join(PDF_DIR, book.fileName), { force: true });
  revalidatePath("/books");
  revalidatePath("/bookmarks");
}

export async function addBookmark(bookId: number, page: number, title: string, tags = "") {
  const db = getDb();
  const row = db
    .insert(schema.bookmarks)
    .values({
      bookId,
      page,
      title: title.trim() || `Стр. ${page}`,
      tags: tags.trim(),
      createdAt: new Date(),
    })
    .returning()
    .get();
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/bookmarks");
  return row;
}

export async function updateBookmark(id: number, title: string, tags: string) {
  const row = getDb()
    .update(schema.bookmarks)
    .set({ title: title.trim(), tags: tags.trim() })
    .where(eq(schema.bookmarks.id, id))
    .returning()
    .get();
  revalidatePath("/bookmarks");
  return row;
}

export async function deleteBookmark(id: number) {
  getDb().delete(schema.bookmarks).where(eq(schema.bookmarks.id, id)).run();
  revalidatePath("/bookmarks");
}
