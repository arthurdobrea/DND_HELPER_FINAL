import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { MAP_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";

/** Отдаёт файл карты (изображение или PDF); для PDF поддерживается Range. Доступ закрыт ключом через proxy.ts. */
export async function GET(request: Request, ctx: RouteContext<"/api/maps/[id]/file">) {
  const { id } = await ctx.params;
  const map = getDb().select().from(schema.maps).where(eq(schema.maps.id, Number(id))).get();
  if (!map) return new Response("Not found", { status: 404 });

  const filePath = path.join(MAP_DIR, path.basename(map.fileName));
  let size: number;
  try {
    size = (await fs.promises.stat(filePath)).size;
  } catch {
    return new Response("File missing", { status: 404 });
  }

  const baseHeaders = {
    "Content-Type": map.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
  };

  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (match && (match[1] || match[2])) {
    let start = match[1] ? Number(match[1]) : size - Number(match[2]);
    let end = match[1] && match[2] ? Number(match[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
  return new Response(stream, { headers: { ...baseHeaders, "Content-Length": String(size) } });
}
