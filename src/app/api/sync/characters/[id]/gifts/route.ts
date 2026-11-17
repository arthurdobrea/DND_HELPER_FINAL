import { dropGifts } from "@/lib/gifts";
import { notifyHero } from "@/lib/live";
import { busyFor } from "@/lib/presence";
import { SYNC_CLIENT_HEADER, badRequest, findPc, json, notFound } from "@/lib/sync";

/** Приложение забрало вещи от мастера: {taken: [id подарков]} — убрать их из очереди. */
export async function POST(request: Request, ctx: RouteContext<"/api/sync/characters/[id]/gifts">) {
  const { id } = await ctx.params;
  const row = findPc(Number(id));
  if (!row) return notFound();
  if (busyFor(row.id, request.headers.get(SYNC_CLIENT_HEADER))) return json({ error: "busy" }, 409);
  const body = (await request.json().catch(() => null)) as { taken?: unknown } | null;
  const taken = Array.isArray(body?.taken) ? body.taken.filter((x): x is string => typeof x === "string") : null;
  if (!taken) return badRequest("taken required");
  dropGifts(row.id, taken);
  notifyHero(row.id);
  return json({ ok: true });
}
