/** Общие константы карт (без серверных зависимостей — используются и в клиентских компонентах). */

export const PIN_COLORS = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];
/** Цвета пинов из парсера: персонажи — синий, предметы — жёлтый. */
export const ENTITY_COLORS = { character: "#3b82f6", item: "#eab308" } as const;

export const MAP_LIMITS = { title: 120, pinTitle: 120, noteTitle: 160, noteBody: 20000 };

export type PinNoteDto = { id: number; title: string; body: string };
/** Закладка книги мира (страница PDF), которую можно прикрепить к пину. */
export type BookmarkDto = { id: number; bookId: number; bookTitle: string; page: number; title: string; tags: string };
/** bookmarkIds — id закладок (world_entries), прикреплённых к пину. */
/** Найденный парсером персонаж или предмет, который можно поставить на карту как пин. data — ParsedCharacter или ParsedItem. */
export type EntityOption = { id: number; kind: "character" | "item"; name: string; bookId: number; bookTitle: string; pages: number[]; sub: string; hasStats: boolean; data: unknown };
export type PinDto = { id: number; entityId: number | null; x: number; y: number; title: string; color: string; notes: PinNoteDto[]; bookmarkIds: number[]; photo: string | null };

/** Цвет текста на пине: тёмный на светлых цветах, белый на тёмных — чтобы название читалось. */
export function pinTextColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1a1209" : "#ffffff";
}
