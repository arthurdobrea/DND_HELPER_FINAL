import { dropCreatureGifts } from "@/lib/creature-gifts";
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
  const body = (await request.json().catch(() => null)) as { taken?: unknown; takenCreatures?: unknown } | null;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const taken = ids(body?.taken);
  const takenCreatures = ids(body?.takenCreatures);
  if (!taken && !takenCreatures) return badRequest("taken required");
  if (taken) dropGifts(row.id, taken);
  if (takenCreatures) dropCreatureGifts(row.id, takenCreatures);
  notifyHero(row.id);
  return json({ ok: true });
}
