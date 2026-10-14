import { connection } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { StoryTabs } from "@/components/story/StoryTabs";
import { LocationWorkspace } from "@/components/locations/LocationWorkspace";
import type { CharacterOption, LocationDto } from "@/lib/locations";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Сюжет · Локации", "🗺️");

export default async function LocationsPage({ searchParams }: PageProps<"/story/locations">) {
  await connection();
  const world = await requireWorld();
  const { loc } = await searchParams;
  const db = getDb();

  const characters: CharacterOption[] = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.worldId, world.id))
    .orderBy(asc(schema.characters.name))
    .all()
    .map((r) => {
      const sheet = normalizeSheet(JSON.parse(r.data));
      return { id: r.id, kind: r.kind, name: r.name || sheet.name || "Без имени", sub: [sheet.race, sheet.className].filter(Boolean).join(" · ") };
    });

  const rows = db.select().from(schema.storyLocations).where(eq(schema.storyLocations.worldId, world.id)).orderBy(asc(schema.storyLocations.createdAt)).all();
  const ids = rows.map((l) => l.id);
  const events = ids.length ? db.select().from(schema.storyEvents).where(inArray(schema.storyEvents.locationId, ids)).orderBy(asc(schema.storyEvents.id)).all() : [];
  const locChars = ids.length ? db.select().from(schema.storyLocationCharacters).where(inArray(schema.storyLocationCharacters.locationId, ids)).all() : [];
  const evIds = events.map((e) => e.id);
  const evChars = evIds.length ? db.select().from(schema.storyEventCharacters).where(inArray(schema.storyEventCharacters.eventId, evIds)).all() : [];

  const locations: LocationDto[] = rows.map((l) => ({
    id: l.id,
    name: l.name,
    summary: l.summary,
    status: l.status,
    characterIds: locChars.filter((c) => c.locationId === l.id).map((c) => c.characterId),
    events: events
      .filter((e) => e.locationId === l.id)
      .map((e) => ({ id: e.id, title: e.title, body: e.body, session: e.session, happened: e.happened, characterIds: evChars.filter((c) => c.eventId === e.id).map((c) => c.characterId) })),
  }));

  const wanted = typeof loc === "string" && /^\d+$/.test(loc) ? Number(loc) : null;
  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <div className="max-w-xs">
        <StoryTabs active="locations" />
      </div>
      <LocationWorkspace initialLocations={locations} characters={characters} initialSelectedId={locations.some((l) => l.id === wanted) ? wanted : (locations.find((l) => l.status === "current") ?? locations[0])?.id ?? null} />
    </div>
  );
}
