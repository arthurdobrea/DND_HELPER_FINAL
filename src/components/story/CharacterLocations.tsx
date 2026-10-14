import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Где упоминается персонаж: локации, в которых он находится, и события с его участием.
 * Показывается на листах героев и NPC — ссылки ведут в «Сюжет → Локации».
 */
export function CharacterLocations({ characterId }: { characterId: number }) {
  const db = getDb();
  const inLocations = db
    .select({ id: schema.storyLocations.id, name: schema.storyLocations.name, status: schema.storyLocations.status })
    .from(schema.storyLocationCharacters)
    .innerJoin(schema.storyLocations, eq(schema.storyLocations.id, schema.storyLocationCharacters.locationId))
    .where(eq(schema.storyLocationCharacters.characterId, characterId))
    .orderBy(asc(schema.storyLocations.name))
    .all();
  const eventIds = db
    .select({ id: schema.storyEventCharacters.eventId })
    .from(schema.storyEventCharacters)
    .where(eq(schema.storyEventCharacters.characterId, characterId))
    .all()
    .map((r) => r.id);
  const events = eventIds.length
    ? db
        .select({ id: schema.storyEvents.id, title: schema.storyEvents.title, happened: schema.storyEvents.happened, locationId: schema.storyEvents.locationId, locationName: schema.storyLocations.name })
        .from(schema.storyEvents)
        .innerJoin(schema.storyLocations, eq(schema.storyLocations.id, schema.storyEvents.locationId))
        .where(inArray(schema.storyEvents.id, eventIds))
        .orderBy(asc(schema.storyEvents.id))
        .all()
    : [];

  if (inLocations.length === 0 && events.length === 0) return null;

  return (
    <details className="mx-auto mt-3 w-full max-w-3xl px-4" open>
      <summary className="cursor-pointer text-sm text-muted hover:text-accent">
        🗺️ В сюжете: локаций {inLocations.length}, событий {events.length}
      </summary>
      <div className="card mt-2 space-y-2 p-3 text-sm">
        {inLocations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Находится в</span>
            {inLocations.map((l) => (
              <Link key={l.id} href={`/story/locations?loc=${l.id}`} className="rounded-full border border-border px-2.5 py-0.5 hover:border-accent hover:text-accent">
                📍 {l.name}
              </Link>
            ))}
          </div>
        )}
        {events.length > 0 && (
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/story/locations?loc=${e.locationId}#event-${e.id}`} className="hover:text-accent">
                  {e.happened ? "✅" : "🕓"} {e.title || "Без названия"} <span className="text-xs text-muted">· {e.locationName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
