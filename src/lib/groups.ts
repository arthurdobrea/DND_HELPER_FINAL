import type { EntryGroup, EntryKind } from "@/lib/db/schema";

/** Группы закладок мира. Пустая строка — «Прочее» (без группы). */
export const GROUPS: { key: EntryGroup; icon: string; label: string }[] = [
  { key: "location", icon: "📍", label: "Локации" },
  { key: "npc", icon: "👤", label: "NPC" },
  { key: "artifact", icon: "🏺", label: "Артефакты" },
  { key: "", icon: "📌", label: "Прочее" },
];

export const GROUP_META = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<EntryGroup, (typeof GROUPS)[number]>;

export const groupOrder = (g: EntryGroup) => GROUPS.findIndex((x) => x.key === g);

export function isGroup(v: unknown): v is EntryGroup {
  return GROUPS.some((g) => g.key === v);
}

/**
 * Группа по умолчанию при добавлении: монстры — NPC, предметы — артефакты.
 * Страницы книг и заклинания по типу не определить (на странице может быть и город, и злодей), поэтому — «Прочее».
 */
export function defaultGroup(kind: EntryKind): EntryGroup {
  return kind === "monster" ? "npc" : kind === "item" ? "artifact" : "";
}
