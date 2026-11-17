import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { json } from "@/lib/sync";
import { ageMs } from "@/lib/presence";
import { normalizeSheet } from "@/lib/character";

/** Для страницы мастера: у каждого героя — сколько мс назад игрок был на связи и какая у него тема. */
export async function GET() {
  const rows = getDb().select().from(schema.characters).where(eq(schema.characters.kind, "pc")).all();
  return json(Object.fromEntries(rows.map((r) => [r.id, { ageMs: ageMs(r.id), theme: normalizeSheet(JSON.parse(r.data)).theme ?? null }])));
}
