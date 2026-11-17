/** Один раз при старте сервера: поднять WebSocket для приложения игрока и страниц мастера. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") (await import("@/lib/live")).startLive();
}
