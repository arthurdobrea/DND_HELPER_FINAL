import { and, eq } from "drizzle-orm";
import type { RawMonster } from "@/lib/catalog";
import { normalizeSheet } from "@/lib/character";
import { resolveMonster } from "@/lib/custom-monsters";
import { getDb, schema } from "@/lib/db";
import { buildNpcPdf, pdfResponse, sheetExtras } from "@/lib/npc-pdf";
import { localize } from "@/lib/translate/view";
import { getCurrentWorld } from "@/lib/world";

/** PDF-лист сохранённого NPC: статблок его существа (по-русски, если перевод есть) + поля листа. */
export async function GET(_request: Request, ctx: RouteContext<"/api/npcs/[id]/pdf">) {
  const world = await getCurrentWorld();
  if (!world) return Response.json({ error: "Сначала выберите мир" }, { status: 400 });
  const { id } = await ctx.params;
  const row = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "npc")))
    .get();
  if (!row) return Response.json({ error: "NPC не найден" }, { status: 404 });
  if (!row.monsterKey) return Response.json({ error: "У этого NPC нет статблока" }, { status: 400 });

  const raw = await resolveMonster(row.monsterKey, world.id);
  if (!raw) return Response.json({ error: "Существо этого NPC не найдено" }, { status: 404 });
  const m = localize("monster", raw as RawMonster, "ru").entry as unknown as typeof raw;

  let extras: ReturnType<typeof sheetExtras> = [];
  let name = row.name;
  try {
    const sheet = normalizeSheet(JSON.parse(row.data));
    extras = sheetExtras(sheet);
    name = sheet.name || row.name;
  } catch {
    /* битый лист — печатаем только статблок */
  }

  const bytes = await buildNpcPdf({ m: { ...m, name: name || m.name }, extras });
  return pdfResponse(bytes, name || m.name);
}
