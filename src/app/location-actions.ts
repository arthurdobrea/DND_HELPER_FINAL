"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { LOCATION_LIMITS, LOCATION_STATUS, type EventDto, type LocationDto, type LocationStatus } from "@/lib/locations";

/** Локация должна быть из текущего мира — иначе действие молча игнорируется. */
async function ownLocation(id: number) {
  const world = await requireWorld();
  return getDb()
    .select()
    .from(schema.storyLocations)
    .where(and(eq(schema.storyLocations.id, id), eq(schema.storyLocations.worldId, world.id)))
    .get();
}

async function ownEvent(id: number) {
  const event = getDb().select().from(schema.storyEvents).where(eq(schema.storyEvents.id, id)).get();
  return event && (await ownLocation(event.locationId)) ? event : undefined;
}

/** Персонаж (герой или NPC) должен быть из текущего мира. */
async function ownCharacter(id: number) {
  const world = await requireWorld();
  return getDb()
    .select({ id: schema.characters.id })
    .from(schema.characters)
    .where(and(eq(schema.characters.id, id), eq(schema.characters.worldId, world.id)))
    .get();
}

export async function createLocation(name: string): Promise<LocationDto | null> {
  const world = await requireWorld();
  const n = name.trim().slice(0, LOCATION_LIMITS.name);
  if (!n) return null;
  const row = getDb().insert(schema.storyLocations).values({ worldId: world.id, name: n, createdAt: new Date() }).returning().get();
  return { id: row.id, name: row.name, summary: "", status: row.status, characterIds: [], events: [] };
}

export async function updateLocation(id: number, patch: { name?: string; summary?: string; status?: LocationStatus }) {
  if (!(await ownLocation(id))) return;
  const set: Partial<typeof schema.storyLocations.$inferInsert> = {};
  if (patch.name !== undefined && patch.name.trim()) set.name = patch.name.trim().slice(0, LOCATION_LIMITS.name);
  if (patch.summary !== undefined) set.summary = patch.summary.slice(0, LOCATION_LIMITS.summary);
  if (patch.status !== undefined && LOCATION_STATUS.some((s) => s.key === patch.status)) set.status = patch.status;
  if (Object.keys(set).length) getDb().update(schema.storyLocations).set(set).where(eq(schema.storyLocations.id, id)).run();
}

export async function deleteLocation(id: number) {
  if (!(await ownLocation(id))) return;
  getDb().delete(schema.storyLocations).where(eq(schema.storyLocations.id, id)).run();
}

/** Привязать / отвязать героя или NPC к локации. */
export async function setLocationCharacter(locationId: number, characterId: number, on: boolean) {
  if (!(await ownLocation(locationId)) || !(await ownCharacter(characterId))) return;
  const db = getDb();
  if (on) db.insert(schema.storyLocationCharacters).values({ locationId, characterId }).onConflictDoNothing().run();
  else db.delete(schema.storyLocationCharacters).where(and(eq(schema.storyLocationCharacters.locationId, locationId), eq(schema.storyLocationCharacters.characterId, characterId))).run();
}

export async function createEvent(locationId: number, title: string, session = ""): Promise<EventDto | null> {
  if (!(await ownLocation(locationId))) return null;
  const row = getDb()
    .insert(schema.storyEvents)
    .values({ locationId, title: title.trim().slice(0, LOCATION_LIMITS.eventTitle), session: session.trim().slice(0, LOCATION_LIMITS.session), createdAt: new Date() })
    .returning()
    .get();
  return { id: row.id, title: row.title, body: "", session: row.session, happened: false, characterIds: [] };
}

export async function updateEvent(id: number, patch: { title?: string; body?: string; session?: string; happened?: boolean }) {
  if (!(await ownEvent(id))) return;
  const set: Partial<typeof schema.storyEvents.$inferInsert> = {};
  if (patch.title !== undefined) set.title = patch.title.slice(0, LOCATION_LIMITS.eventTitle);
  if (patch.body !== undefined) set.body = patch.body.slice(0, LOCATION_LIMITS.eventBody);
  if (patch.session !== undefined) set.session = patch.session.trim().slice(0, LOCATION_LIMITS.session);
  if (patch.happened !== undefined) set.happened = !!patch.happened;
  if (Object.keys(set).length) getDb().update(schema.storyEvents).set(set).where(eq(schema.storyEvents.id, id)).run();
}

export async function deleteEvent(id: number) {
  if (!(await ownEvent(id))) return;
  getDb().delete(schema.storyEvents).where(eq(schema.storyEvents.id, id)).run();
}

/** Привязать / отвязать героя или NPC к событию. */
export async function setEventCharacter(eventId: number, characterId: number, on: boolean) {
  if (!(await ownEvent(eventId)) || !(await ownCharacter(characterId))) return;
  const db = getDb();
  if (on) db.insert(schema.storyEventCharacters).values({ eventId, characterId }).onConflictDoNothing().run();
  else db.delete(schema.storyEventCharacters).where(and(eq(schema.storyEventCharacters.eventId, eventId), eq(schema.storyEventCharacters.characterId, characterId))).run();
}
