import { notFound } from "next/navigation";
import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { CharacterSheet } from "@/components/character/CharacterSheet";

export default async function CharacterPage({ params }: PageProps<"/characters/[id]">) {
  await connection();
  const world = await requireWorld();
  const { id } = await params;
  const row = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.id, Number(id)), eq(schema.characters.worldId, world.id)))
    .get();
  if (!row) notFound();

  return <CharacterSheet key={row.id} id={row.id} initial={normalizeSheet(JSON.parse(row.data))} />;
}
