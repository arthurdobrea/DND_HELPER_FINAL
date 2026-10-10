import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld, worldEntries } from "@/lib/world";
import { MapViewerLoader } from "@/components/maps/MapViewerLoader";
import type { BookmarkDto, EntityOption, PinDto } from "@/lib/maps";
import type { ParsedCharacter, ParsedItem } from "@/lib/parser";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

export async function generateMetadata({ params }: PageProps<"/maps/[id]">): Promise<Metadata> {
  const { id } = await params;
  const map = getDb().select().from(schema.maps).where(eq(schema.maps.id, Number(id))).get();
  return pageMeta(map?.title ?? "Карта", "🗺️");
}

export default async function MapPage({ params }: PageProps<"/maps/[id]">) {
  await connection();
  const world = await requireWorld();
  const { id } = await params;
  const db = getDb();
  const map = db
    .select()
    .from(schema.maps)
    .where(and(eq(schema.maps.id, Number(id)), eq(schema.maps.worldId, world.id)))
    .get();
  if (!map) notFound();

  const pins = db.select().from(schema.mapPins).where(eq(schema.mapPins.mapId, map.id)).orderBy(asc(schema.mapPins.id)).all();
  const notes = pins.length
    ? db.select().from(schema.mapPinNotes).where(inArray(schema.mapPinNotes.pinId, pins.map((p) => p.id))).orderBy(asc(schema.mapPinNotes.id)).all()
    : [];
  const links = pins.length
    ? db.select().from(schema.mapPinBookmarks).where(inArray(schema.mapPinBookmarks.pinId, pins.map((p) => p.id))).orderBy(asc(schema.mapPinBookmarks.createdAt)).all()
    : [];
  // Все закладки-страницы мира: из них выбирают, что прикрепить к пину.
  const bookTitles = new Map(db.select().from(schema.books).all().map((b) => [b.id, b.title]));
  const bookmarks: BookmarkDto[] = worldEntries(world.id, "page")
    .filter((e) => e.bookId !== null && bookTitles.has(e.bookId))
    .map((e) => ({ id: e.id, bookId: e.bookId!, bookTitle: bookTitles.get(e.bookId!)!, page: e.page ?? 1, title: e.title, tags: e.tags }))
    .sort((a, b) => a.bookTitle.localeCompare(b.bookTitle, "ru") || a.page - b.page);
  // Найденное парсером во всех книгах: из него можно ставить пины.
  const entities: EntityOption[] = db
    .select()
    .from(schema.bookEntities)
    .all()
    .filter((e) => bookTitles.has(e.bookId))
    .map((e) => {
      const d = JSON.parse(e.data) as ParsedCharacter & ParsedItem;
      return {
        id: e.id,
        kind: e.kind,
        name: e.name,
        bookId: e.bookId,
        bookTitle: bookTitles.get(e.bookId)!,
        pages: JSON.parse(e.pages) as number[],
        sub: (e.kind === "character" ? [d.race, d.role] : [d.type, d.rarity]).filter(Boolean).join(" · "),
        hasStats: e.kind === "character" && !!d.stats,
        data: d,
      };
    })
    .sort((a, b) => a.bookTitle.localeCompare(b.bookTitle, "ru") || (a.pages[0] ?? 0) - (b.pages[0] ?? 0));
  const initialPins: PinDto[] = pins.map((p) => ({
    id: p.id,
    entityId: p.entityId,
    x: p.x,
    y: p.y,
    title: p.title,
    color: p.color,
    notes: notes.filter((n) => n.pinId === p.id).map((n) => ({ id: n.id, title: n.title, body: n.body })),
    photo: p.photo,
    bookmarkIds: links.filter((l) => l.pinId === p.id).map((l) => l.entryId),
  }));

  return <MapViewerLoader key={map.id} map={{ id: map.id, title: map.title, kind: map.kind, page: map.page }} initialPins={initialPins} bookmarks={bookmarks} entities={entities} />;
}
