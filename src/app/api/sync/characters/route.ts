import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest, isTrackerFile, json, mergeSheet, notFound, pcView, saveTrackerFile } from "@/lib/sync";

/** Создать героя у мастера из листа игрока: {worldId, sheet, file?} → {id, ...}. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { worldId?: unknown; sheet?: unknown; file?: unknown } | null;
  const worldId = Number(body?.worldId);
  if (!body || !Number.isInteger(worldId)) return badRequest("worldId required");
  const db = getDb();
  if (!db.select().from(schema.worlds).where(eq(schema.worlds.id, worldId)).get()) return notFound();
  const sheet = mergeSheet({}, body.sheet);
  if (body.file !== undefined && !isTrackerFile(body.file)) return badRequest("bad file");
  const now = new Date();
  const row = db
    .insert(schema.characters)
    .values({ worldId, kind: "pc", name: sheet.name.trim() || "Без имени", data: JSON.stringify(sheet), createdAt: now, updatedAt: now })
    .returning()
    .get();
  if (body.file !== undefined) saveTrackerFile(row.id, body.file);
  return json(pcView(row), 201);
}
