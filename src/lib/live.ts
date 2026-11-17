/**
 * Живая связь по WebSocket (отдельный порт, WS_PORT, по умолчанию 3001). Сокет — звонок в дверь, не канал данных:
 * сервер шлёт {type:"changed", hero?} или {type:"battle"}, получатель сразу идёт за данными тем же HTTP, что и раньше.
 * Без сокета всё работает как прежде (опрос раз в ~4 с).
 *  - игрок: /?hero=<id>&key=<ключ>&client=<id приложения> — слышит правки мастера своего героя и бой;
 *    пока сокет жив, герой на связи (пинг раз в 5 с обновляет presence);
 *  - мастер (страница в браузере): /?key=… или cookie dnd_key — слышит всё.
 */
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { busyFor, markSeen } from "@/lib/presence";

export const WS_PORT = Number(process.env.WS_PORT) || 3001;

type Peer = { ws: WebSocket; hero: number | null; alive: boolean };
const g = globalThis as unknown as { __dndLive?: { peers: Set<Peer> } };

function send(p: Peer, msg: object) {
  if (p.ws.readyState === p.ws.OPEN) p.ws.send(JSON.stringify(msg));
}

/** Правка героя (мастером или игроком): слышат сам игрок этого героя и все страницы мастера. */
export function notifyHero(hero: number) {
  for (const p of g.__dndLive?.peers ?? []) if (p.hero === null || p.hero === hero) send(p, { type: "changed", hero });
}

/** Реакция игрока (эмодзи или короткая фраза): слышат только страницы мастера. */
export function notifyReaction(name: string, text: string) {
  for (const p of g.__dndLive?.peers ?? []) if (p.hero === null) send(p, { type: "reaction", name, text });
}

/** Бой поменялся: слышат все. */
export function notifyBattle() {
  for (const p of g.__dndLive?.peers ?? []) send(p, { type: "battle" });
}

const cookie = (req: IncomingMessage, name: string) =>
  req.headers.cookie?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];

export function startLive() {
  if (g.__dndLive) return; // dev-сервер перезапускает register: второй раз порт не открываем
  const peers = new Set<Peer>();
  g.__dndLive = { peers };
  const wss = new WebSocketServer({ port: WS_PORT });
  wss.on("error", (e) => console.error("[live] WebSocket:", e.message));

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://x");
    const key = url.searchParams.get("key") ?? (cookie(req, AUTH_COOKIE) ? decodeURIComponent(cookie(req, AUTH_COOKIE)!) : undefined);
    if (!isAuthorized(key ?? undefined)) return ws.close(4401, "unauthorized");
    const heroParam = url.searchParams.get("hero");
    const hero = heroParam === null ? null : Number(heroParam);
    const client = url.searchParams.get("client");
    if (hero !== null && (!Number.isInteger(hero) || busyFor(hero, client))) return ws.close(4409, "busy");
    const peer: Peer = { ws, hero, alive: true };
    peers.add(peer);
    if (hero !== null) markSeen(hero, client);
    ws.on("pong", () => {
      peer.alive = true;
      if (hero !== null) markSeen(hero, client);
    });
    ws.on("close", () => peers.delete(peer));
    ws.on("error", () => peers.delete(peer));
    send(peer, { type: "hello" });
  });

  // Раз в 5 с пинг: молчащий сокет (телефон ушёл из сети) закрываем, а живой держит героя «онлайн».
  setInterval(() => {
    for (const p of peers) {
      if (!p.alive) { p.ws.terminate(); peers.delete(p); continue; }
      p.alive = false;
      p.ws.ping();
    }
  }, 5000).unref();
}
