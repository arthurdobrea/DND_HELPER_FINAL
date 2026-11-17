import { findPc, notFound, readTrackerFile } from "@/lib/sync";
import { CORS_HEADERS } from "@/lib/sync-cors";

/** Полный файл персонажа DnD Tracker, как его прислал игрок; 404 — файла ещё нет. */
export async function GET(_request: Request, ctx: RouteContext<"/api/sync/characters/[id]/file">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  const text = row && readTrackerFile(row.id);
  if (!text) return notFound();
  return new Response(text, { headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
