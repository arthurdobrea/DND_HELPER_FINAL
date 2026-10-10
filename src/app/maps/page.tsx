import Link from "next/link";
import { connection } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { UploadMap } from "@/components/maps/UploadMap";
import { MapActions } from "@/components/maps/MapActions";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Карты", "🗺️");

export default async function MapsPage() {
  await connection();
  const world = await requireWorld();
  const db = getDb();
  const maps = db.select().from(schema.maps).where(eq(schema.maps.worldId, world.id)).orderBy(desc(schema.maps.createdAt)).all();
  const counts = new Map(
    db
      .select({ mapId: schema.mapPins.mapId, n: sql<number>`count(*)` })
      .from(schema.mapPins)
      .groupBy(schema.mapPins.mapId)
      .all()
      .map((r) => [r.mapId, r.n]),
  );

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <h1 className="font-display text-2xl text-accent">Карты</h1>
      <p className="text-sm text-muted">
        Карты мира «{world.name}». Загрузите изображение (JPG, PNG, WebP) или PDF, ставьте на карту пины и записывайте в них сюжет.
      </p>
      <UploadMap />

      {maps.length === 0 ? (
        <p className="mt-6 text-muted">Карт пока нет — загрузите первую.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <div key={m.id} className="card overflow-hidden">
              <Link href={`/maps/${m.id}`} className="block">
                <div className="flex h-40 items-center justify-center overflow-hidden bg-panel-2">
                  {m.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/maps/${m.id}/file`} alt={m.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-5xl">📄</span>
                  )}
                </div>
                <div className="p-3 pb-1">
                  <div className="truncate font-display text-lg text-accent hover:underline">🗺️ {m.title}</div>
                  <div className="text-xs text-muted">
                    {m.kind === "pdf" ? "PDF" : "Изображение"} · пинов: {counts.get(m.id) ?? 0}
                  </div>
                </div>
              </Link>
              <div className="flex justify-end p-2 pt-0">
                <MapActions id={m.id} title={m.title} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
