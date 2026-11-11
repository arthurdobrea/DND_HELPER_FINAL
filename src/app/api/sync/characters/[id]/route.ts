import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { badRequest, findPc, json, mergeSheet, notFound, pcView, saveTrackerFile } from "@/lib/sync";

export async function GET(_request: Request, ctx: RouteContext<"/api/sync/characters/[id]">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  return row ? json(pcView(row)) : notFound();
}

/**
 * Лист от игрока: присланные поля поверх сохранённых, остальное (поля мастера) не трогается.
 * Тело: {sheet, file?}; file — полный файл персонажа DnD Tracker, перезаписывается целиком.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/sync/characters/[id]">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  if (!row) return notFound();
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
  return json(pcView(updated));
}
