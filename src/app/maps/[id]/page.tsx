import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { MapViewerLoader } from "@/components/maps/MapViewerLoader";
import type { PinDto } from "@/lib/maps";
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
  const initialPins: PinDto[] = pins.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    title: p.title,
    color: p.color,
    notes: notes.filter((n) => n.pinId === p.id).map((n) => ({ id: n.id, title: n.title, body: n.body })),
  }));

  return <MapViewerLoader key={map.id} map={{ id: map.id, title: map.title, kind: map.kind, page: map.page }} initialPins={initialPins} />;
}
