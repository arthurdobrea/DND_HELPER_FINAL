import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { notifyHero } from "@/lib/live";
import { busyFor, markSeen } from "@/lib/presence";
import { SYNC_CLIENT_HEADER, badRequest, findPc, json, mergeSheet, notFound, pcView, saveTrackerFile } from "@/lib/sync";

const busy = () => json({ error: "busy" }, 409);

export async function GET(request: Request, ctx: RouteContext<"/api/sync/characters/[id]">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  if (!row) return notFound();
  const client = request.headers.get(SYNC_CLIENT_HEADER);
  if (busyFor(row.id, client)) return busy(); // героя уже ведёт другое устройство
  markSeen(row.id, client); // игрок опрашивает этот адрес раз в ~4 с: так мастер видит, что он онлайн
  return json(pcView(row));
}

/**
 * Лист от игрока: присланные поля поверх сохранённых, остальное (поля мастера) не трогается.
 * Тело: {sheet, file?}; file — полный файл персонажа DnD Tracker, перезаписывается целиком.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/sync/characters/[id]">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  if (!row) return notFound();
  const client = request.headers.get(SYNC_CLIENT_HEADER);
  if (busyFor(row.id, client)) return busy();
  markSeen(row.id, client);
  const body = (await request.json().catch(() => null)) as { sheet?: unknown; file?: unknown } | null;
  if (!body || typeof body.sheet !== "object" || body.sheet === null) return badRequest("sheet required");
  if (body.file !== undefined && !saveTrackerFile(row.id, body.file)) return badRequest("bad file");
  const sheet = mergeSheet(JSON.parse(row.data), body.sheet);
  const updated = getDb()
    .update(schema.characters)
    .set({ name: sheet.name.trim() || "Без имени", data: JSON.stringify(sheet), updatedAt: new Date() })
    .where(eq(schema.characters.id, row.id))
    .returning()
    .get();
  notifyHero(row.id); // мастеру — сразу обновить карточку
  return json(pcView(updated));
}
