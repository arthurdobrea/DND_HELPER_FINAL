import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb, schema } from "@/lib/db";
import { emptyBattle, sanitizeBattle } from "@/lib/battle";
import { badRequest, battleView, json } from "@/lib/sync";

/** Текущий бой мира: GET /api/sync/battle?world=<id>. Нет боя — пустой, started: false. */
export async function GET(request: NextRequest) {
  const worldId = Number(request.nextUrl.searchParams.get("world"));
  if (!Number.isInteger(worldId) || worldId <= 0) return badRequest("world required");
  const row = getDb().select().from(schema.battles).where(eq(schema.battles.worldId, worldId)).get();
  const battle = row ? sanitizeBattle(JSON.parse(row.state)) : emptyBattle();
  return json(battleView(battle, row?.updatedAt ?? null));
}
