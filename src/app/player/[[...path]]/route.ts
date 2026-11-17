/** Веб-сборка приложения игрока (DnD Tracker): статика из DATA_DIR/player, отдаётся без входа по ключу. */
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/config";

const ROOT = path.join(DATA_DIR, "player");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".css": "text/css", ".map": "application/json",
};

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path: parts = [] } = await params;
  const file = path.resolve(ROOT, parts.join("/") || "index.html");
  // Не выходим за папку player (../ в пути).
  if (!file.startsWith(ROOT + path.sep)) return new Response("not found", { status: 404 });
  try {
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    const st = await fs.promises.stat(file);
    // Файлы сборки меняются только при выкладке новой: ETag по времени и размеру, браузер перепроверяет и получает 304.
    const etag = `"${st.mtimeMs.toString(36)}-${st.size.toString(36)}"`;
    const headers = { "Content-Type": type, ETag: etag, "Cache-Control": "no-cache" };
    if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const body = await fs.promises.readFile(file);
    // Next убирает «/» в конце адреса, а сборка ищет файлы относительно страницы — подсказываем, где они лежат.
    if (path.basename(file) === "index.html") {
      return new Response(body.toString("utf8").replace("<head>", '<head><base href="/player/">'), { headers });
    }
    return new Response(body, { headers });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
