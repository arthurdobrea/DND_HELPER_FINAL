/** Локации сюжета: общие типы и константы (без серверных зависимостей — используются и в браузере). */

export const LOCATION_STATUS = [
  { key: "planned", label: "Планируется", icon: "🧭", color: "#94a3b8" },
  { key: "current", label: "Партия здесь", icon: "📍", color: "#f59e0b" },
  { key: "visited", label: "Посещена", icon: "✅", color: "#22c55e" },
] as const;
export type LocationStatus = (typeof LOCATION_STATUS)[number]["key"];

export const LOCATION_LIMITS = { name: 120, summary: 10000, eventTitle: 160, eventBody: 20000, session: 40 };

export type EventDto = { id: number; title: string; body: string; session: string; happened: boolean; characterIds: number[] };
export type LocationDto = { id: number; name: string; summary: string; status: LocationStatus; characterIds: number[]; events: EventDto[] };
/** Герой или NPC мира, которого можно привязать к локации или событию. */
export type CharacterOption = { id: number; name: string; kind: "pc" | "npc"; sub: string };

export const characterHref = (c: Pick<CharacterOption, "id" | "kind">) => (c.kind === "npc" ? `/npcs/${c.id}` : `/characters/${c.id}`);
