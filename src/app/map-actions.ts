"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { MAP_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { ENTITY_COLORS, MAP_LIMITS, PIN_COLORS, type PinDto } from "@/lib/maps";
import { entityNotes, type ParsedCharacter, type ParsedItem } from "@/lib/parser";

/** Удаляет файл фото пина (если был). */
async function rmPhoto(photo: string | null) {
  if (photo) await fs.rm(path.join(MAP_DIR, "pins", path.basename(photo)), { force: true });
}

/** Карта должна принадлежать текущему миру — иначе действие молча игнорируется. */
async function ownMap(mapId: number) {
  const world = await requireWorld();
  return getDb().select().from(schema.maps).where(and(eq(schema.maps.id, mapId), eq(schema.maps.worldId, world.id))).get();
}

async function ownPin(pinId: number) {
  const pin = getDb().select().from(schema.mapPins).where(eq(schema.mapPins.id, pinId)).get();
  if (!pin || !(await ownMap(pin.mapId))) return undefined;
  return pin;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const refresh = () => revalidatePath("/maps", "layout");

export async function renameMap(id: number, title: string) {
  const t = title.trim().slice(0, MAP_LIMITS.title);
  if (!t || !(await ownMap(id))) return;
  getDb().update(schema.maps).set({ title: t }).where(eq(schema.maps.id, id)).run();
  refresh();
}

export async function deleteMap(id: number) {
  const map = await ownMap(id);
  if (!map) return;
  const photos = getDb().select({ photo: schema.mapPins.photo }).from(schema.mapPins).where(eq(schema.mapPins.mapId, id)).all();
  getDb().delete(schema.maps).where(eq(schema.maps.id, id)).run();
  for (const { photo } of photos) await rmPhoto(photo);
  await fs.rm(path.join(MAP_DIR, path.basename(map.fileName)), { force: true });
  refresh();
}

export async function setMapPage(id: number, page: number) {
  if (!(await ownMap(id))) return;
  getDb().update(schema.maps).set({ page: Math.max(1, Math.floor(page) || 1) }).where(eq(schema.maps.id, id)).run();
}

/** Новый пин в точке (x, y — доли размера карты). Возвращает его id. */
export async function addPin(mapId: number, x: number, y: number): Promise<number | null> {
  if (!(await ownMap(mapId))) return null;
  const pin = getDb()
    .insert(schema.mapPins)
    .values({ mapId, x: clamp01(x), y: clamp01(y), createdAt: new Date() })
    .returning()
    .get();
  return pin.id;
}

/** Пин из найденного парсером персонажа/предмета: название, цвет и заметки (описание, характер, статблок…) заполняются сами. */
export async function addPinFromEntity(mapId: number, entityId: number, x: number, y: number): Promise<PinDto | null> {
  if (!(await ownMap(mapId))) return null;
  const db = getDb();
  const entity = db.select().from(schema.bookEntities).where(eq(schema.bookEntities.id, entityId)).get();
  if (!entity) return null;
  const book = db.select().from(schema.books).where(eq(schema.books.id, entity.bookId)).get();
  const data = JSON.parse(entity.data) as ParsedCharacter | ParsedItem;
  const pages = JSON.parse(entity.pages) as number[];

  return db.transaction((tx) => {
    const pin = tx
      .insert(schema.mapPins)
      .values({
        mapId,
        x: clamp01(x),
        y: clamp01(y),
        title: entity.name.slice(0, MAP_LIMITS.pinTitle),
        color: ENTITY_COLORS[entity.kind],
        entityId: entity.id,
        createdAt: new Date(),
      })
      .returning()
      .get();
    const notes = entityNotes(entity.kind, data, pages, book?.title ?? "Книга").map((n) =>
      tx
        .insert(schema.mapPinNotes)
        .values({ pinId: pin.id, title: n.title.slice(0, MAP_LIMITS.noteTitle), body: n.body.slice(0, MAP_LIMITS.noteBody), createdAt: new Date() })
        .returning()
        .get(),
    );
    return {
      id: pin.id,
      entityId: entity.id,
      x: pin.x,
      y: pin.y,
      title: pin.title,
      color: pin.color,
      photo: null,
      bookmarkIds: [],
      notes: notes.map((n) => ({ id: n.id, title: n.title, body: n.body })),
    };
  });
}

export async function movePin(pinId: number, x: number, y: number) {
  if (!(await ownPin(pinId))) return;
  getDb().update(schema.mapPins).set({ x: clamp01(x), y: clamp01(y) }).where(eq(schema.mapPins.id, pinId)).run();
}

export async function updatePin(pinId: number, title: string, color: string) {
  if (!(await ownPin(pinId))) return;
  getDb()
    .update(schema.mapPins)
    .set({ title: title.trim().slice(0, MAP_LIMITS.pinTitle), color: PIN_COLORS.includes(color) ? color : PIN_COLORS[0] })
    .where(eq(schema.mapPins.id, pinId))
    .run();
}

export async function deletePin(pinId: number) {
  const pin = await ownPin(pinId);
  if (!pin) return;
  getDb().delete(schema.mapPins).where(eq(schema.mapPins.id, pinId)).run();
  await rmPhoto(pin.photo);
}

export async function removePinPhoto(pinId: number) {
  const pin = await ownPin(pinId);
  if (!pin) return;
  getDb().update(schema.mapPins).set({ photo: null }).where(eq(schema.mapPins.id, pinId)).run();
  await rmPhoto(pin.photo);
}

/** Прикрепить закладку книги к пину / открепить (повторный вызов). Закладка должна быть из текущего мира. */
export async function togglePinBookmark(pinId: number, entryId: number): Promise<boolean | null> {
  const pin = await ownPin(pinId);
  if (!pin) return null;
  const world = await requireWorld();
  const db = getDb();
  const entry = db
    .select()
    .from(schema.worldEntries)
    .where(and(eq(schema.worldEntries.id, entryId), eq(schema.worldEntries.worldId, world.id), eq(schema.worldEntries.kind, "page")))
    .get();
  if (!entry) return null;
  const link = and(eq(schema.mapPinBookmarks.pinId, pinId), eq(schema.mapPinBookmarks.entryId, entryId));
  if (db.select().from(schema.mapPinBookmarks).where(link).get()) {
    db.delete(schema.mapPinBookmarks).where(link).run();
    return false;
  }
  db.insert(schema.mapPinBookmarks).values({ pinId, entryId, createdAt: new Date() }).run();
  return true;
}

export async function addPinNote(pinId: number): Promise<number | null> {
  if (!(await ownPin(pinId))) return null;
  return getDb().insert(schema.mapPinNotes).values({ pinId, createdAt: new Date() }).returning().get().id;
}

export async function updatePinNote(noteId: number, title: string, body: string) {
  const note = getDb().select().from(schema.mapPinNotes).where(eq(schema.mapPinNotes.id, noteId)).get();
  if (!note || !(await ownPin(note.pinId))) return;
  getDb()
    .update(schema.mapPinNotes)
    .set({ title: title.slice(0, MAP_LIMITS.noteTitle), body: body.slice(0, MAP_LIMITS.noteBody) })
    .where(eq(schema.mapPinNotes.id, noteId))
    .run();
}

export async function deletePinNote(noteId: number) {
  const note = getDb().select().from(schema.mapPinNotes).where(eq(schema.mapPinNotes.id, noteId)).get();
  if (!note || !(await ownPin(note.pinId))) return;
  getDb().delete(schema.mapPinNotes).where(eq(schema.mapPinNotes.id, noteId)).run();
}
