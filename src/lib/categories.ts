import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { EntryGroup } from "@/lib/db/schema";
import { BUILTIN_GROUPS, buildCategories, customKey, type Category } from "@/lib/groups";

/** Все категории мира: встроенные + свои. */
export function worldCategories(worldId: number): Category[] {
  const custom = getDb()
    .select()
    .from(schema.worldCategories)
    .where(eq(schema.worldCategories.worldId, worldId))
    .orderBy(asc(schema.worldCategories.id))
    .all();
  return buildCategories(custom);
}

/** Можно ли положить закладку этого мира в такую категорию (встроенная или своя из этого же мира). */
export function groupAllowed(worldId: number, group: unknown): group is EntryGroup {
  if (group === "") return true;
  if (BUILTIN_GROUPS.some((g) => g.key === group)) return true;
  return typeof group === "string" && worldCategories(worldId).some((c) => c.key === group);
}

export { customKey };
