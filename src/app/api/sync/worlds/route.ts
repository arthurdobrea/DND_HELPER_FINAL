import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { SYNC_CLIENT_HEADER, json, trackerFileId } from "@/lib/sync";
import { busyFor } from "@/lib/presence";

/** Миры и герои (PC) в них — для выбора, к кому привязать персонажа игрока. fileId — id персонажа игрока в сохранённом файле; busy — героя уже ведёт другое устройство. */
export async function GET(request: Request) {
  const client = request.headers.get(SYNC_CLIENT_HEADER);
  const db = getDb();
  const worlds = db.select().from(schema.worlds).orderBy(asc(schema.worlds.name)).all();
  return json({
    worlds: worlds.map((w) => ({
      id: w.id,
      name: w.name,
      characters: db
        .select({ id: schema.characters.id, name: schema.characters.name })
        .from(schema.characters)
        .where(and(eq(schema.characters.worldId, w.id), eq(schema.characters.kind, "pc")))
        .orderBy(asc(schema.characters.name))
        .all()
        .map((c) => ({ ...c, fileId: trackerFileId(c.id), busy: busyFor(c.id, client) })),
    })),
  });
}
