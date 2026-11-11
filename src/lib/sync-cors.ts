/** CORS и заголовок ключа для /api/sync/* — отдельно от sync.ts, чтобы proxy не тянул базу. */

/** Веб-клиент игрока живёт на другом адресе — ему нужен CORS. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-dnd-key",
  "Access-Control-Max-Age": "600",
};

export const SYNC_KEY_HEADER = "x-dnd-key";
