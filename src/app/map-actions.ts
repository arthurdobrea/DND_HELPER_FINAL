"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { MAP_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { MAP_LIMITS, PIN_COLORS } from "@/lib/maps";

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
  getDb().delete(schema.maps).where(eq(schema.maps.id, id)).run();
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
  if (!(await ownPin(pinId))) return;
  getDb().delete(schema.mapPins).where(eq(schema.mapPins.id, pinId)).run();
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
