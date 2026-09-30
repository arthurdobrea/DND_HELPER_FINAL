import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { EntryKind, World, WorldEntry } from "@/lib/db/schema";

export const WORLD_COOKIE = "dnd_world";

/** Текущий мир из cookie (или undefined, если не выбран / удалён). */
export async function getCurrentWorld(): Promise<World | undefined> {
  const id = Number((await cookies()).get(WORLD_COOKIE)?.value);
  if (!id) return undefined;
  return getDb().select().from(schema.worlds).where(eq(schema.worlds.id, id)).get();
}

/** Для страниц и действий, которым нужен мир: без него — на экран выбора. */
export async function requireWorld(): Promise<World> {
  const world = await getCurrentWorld();
  if (!world) redirect("/worlds");
  return world;
}

export function worldEntries(worldId: number, kind?: EntryKind): WorldEntry[] {
  const db = getDb();
  const where = kind
    ? and(eq(schema.worldEntries.worldId, worldId), eq(schema.worldEntries.kind, kind))
    : eq(schema.worldEntries.worldId, worldId);
  return db.select().from(schema.worldEntries).where(where).orderBy(asc(schema.worldEntries.createdAt)).all();
}

/** Закладка на заклинание/предмет/монстра по ключу. */
export function findEntry(worldId: number, kind: Exclude<EntryKind, "page">, ref: string): WorldEntry | undefined {
  return getDb()
    .select()
    .from(schema.worldEntries)
    .where(
      and(
        eq(schema.worldEntries.worldId, worldId),
        eq(schema.worldEntries.kind, kind),
        eq(schema.worldEntries.ref, ref),
      ),
    )
    .get();
}

/** Множество ключей, уже добавленных в мир — для звёздочек в списках. */
export function entryRefs(worldId: number, kind: Exclude<EntryKind, "page">): Set<string> {
  return new Set(worldEntries(worldId, kind).map((e) => e.ref));
}
