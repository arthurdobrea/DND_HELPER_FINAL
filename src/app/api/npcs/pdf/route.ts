import { and, eq } from "drizzle-orm";
import { normalizeSheet } from "@/lib/character";
import { getDb, schema } from "@/lib/db";
import { buildMonster, sanitizeDraft } from "@/lib/forge";
import { buildNpcPdf, pdfResponse, sheetExtras, type NpcPdfExtra } from "@/lib/npc-pdf";
import { getCurrentWorld } from "@/lib/world";

/**
 * PDF-лист NPC прямо из сборщика: собирается из текущего черновика (сохранять не обязательно).
 * Если NPC уже существует (characterId), к листу добавляются его характер, снаряжение и прочие поля.
 */
export async function POST(request: Request) {
  const world = await getCurrentWorld();
  if (!world) return Response.json({ error: "Сначала выберите мир" }, { status: 400 });
  let body: { draft?: unknown; characterId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const draft = sanitizeDraft(body.draft);
  const monster = buildMonster(draft);

  const extras: NpcPdfExtra[] = [];
  if (draft.motivation.trim()) extras.push({ title: "Мотивация", text: draft.motivation.trim() });
  if (draft.backstory.trim()) extras.push({ title: "Предыстория", text: draft.backstory.trim() });
  const id = Number(body.characterId);
  if (Number.isInteger(id) && id > 0) {
    const row = getDb()
      .select()
      .from(schema.characters)
      .where(and(eq(schema.characters.id, id), eq(schema.characters.worldId, world.id)))
      .get();
    if (row) {
      try {
        extras.push(...sheetExtras(normalizeSheet(JSON.parse(row.data)), { backstory: true, motivation: true }));
      } catch {
        /* битый лист — печатаем без доп. полей */
      }
    }
  }

  const bytes = await buildNpcPdf({ m: monster, extras });
  return pdfResponse(bytes, monster.name);
}
