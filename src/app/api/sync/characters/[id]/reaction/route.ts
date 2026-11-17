import { notifyReaction } from "@/lib/live";
import { busyFor } from "@/lib/presence";
import { SYNC_CLIENT_HEADER, badRequest, findPc, json, notFound } from "@/lib/sync";

/** Реакция игрока: {text} — эмодзи или короткая фраза (до 40 символов); страницы мастера покажут её плашкой. */
export async function POST(request: Request, ctx: RouteContext<"/api/sync/characters/[id]/reaction">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  if (!row) return notFound();
  if (busyFor(row.id, request.headers.get(SYNC_CLIENT_HEADER))) return json({ error: "busy" }, 409);
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 40) return badRequest("text required, up to 40 characters");
  notifyReaction(row.name, text);
  return json({ ok: true });
}
