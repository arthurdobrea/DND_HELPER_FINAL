/** Общие константы карт (без серверных зависимостей — используются и в клиентских компонентах). */

export const PIN_COLORS = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

export const MAP_LIMITS = { title: 120, pinTitle: 120, noteTitle: 160, noteBody: 20000 };

export type PinNoteDto = { id: number; title: string; body: string };
export type PinDto = { id: number; x: number; y: number; title: string; color: string; notes: PinNoteDto[] };
