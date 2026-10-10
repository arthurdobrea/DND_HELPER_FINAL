import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { MAP_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { WORLD_COOKIE } from "@/lib/world";

/** Тип файла определяем по первым байтам, а не по расширению. */
function sniff(head: Buffer): { kind: "image" | "pdf"; mime: string; ext: string } | null {
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  if (head[0] === 0x89 && head.subarray(1, 4).toString("latin1") === "PNG") return { kind: "image", mime: "image/png", ext: "png" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") {
    return { kind: "image", mime: "image/webp", ext: "webp" };
  }
  return null;
}

/**
 * Загрузка карты (JPG, PNG, WebP или PDF): тело запроса — сам файл, пишется на диск потоком.
 * Путь исключён из proxy.ts (лимит буфера 10 МБ), поэтому ключ и мир проверяем здесь.
 */
export async function PUT(request: NextRequest) {
  if (!isAuthorized(request.cookies.get(AUTH_COOKIE)?.value)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!request.body) return Response.json({ error: "empty body" }, { status: 400 });

  const db = getDb();
  const worldId = Number(request.cookies.get(WORLD_COOKIE)?.value);
  if (!worldId || !db.select().from(schema.worlds).where(eq(schema.worlds.id, worldId)).get()) {
    return Response.json({ error: "Сначала выберите мир" }, { status: 400 });
  }

  const originalName = decodeURIComponent(request.headers.get("x-file-name") ?? "map");
  const title = decodeURIComponent(request.headers.get("x-title") ?? "").trim() || originalName.replace(/\.[a-z0-9]+$/i, "");

  const safeBase = path.basename(originalName).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w\-]+/g, "_");
  const tmpName = `${Date.now()}-${safeBase || "map"}.upload`;
  const tmp = path.join(MAP_DIR, tmpName);
  await fs.promises.mkdir(MAP_DIR, { recursive: true });
  try {
    await pipeline(Readable.fromWeb(request.body as unknown as NodeWebStream), fs.createWriteStream(tmp));
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    return Response.json({ error: `upload failed: ${String(e)}` }, { status: 500 });
  }

  const head = Buffer.alloc(12);
  const fd = await fs.promises.open(tmp, "r");
  await fd.read(head, 0, 12, 0);
  await fd.close();
  const type = sniff(head);
  if (!type) {
    await fs.promises.rm(tmp, { force: true });
    return Response.json({ error: "Нужен файл JPG, PNG, WebP или PDF" }, { status: 400 });
  }

  const fileName = tmpName.replace(/\.upload$/, `.${type.ext}`);
  await fs.promises.rename(tmp, path.join(MAP_DIR, fileName));
  const { size } = await fs.promises.stat(path.join(MAP_DIR, fileName));
  const map = db
    .insert(schema.maps)
    .values({ worldId, title, kind: type.kind, fileName, mime: type.mime, sizeBytes: size, createdAt: new Date() })
    .returning()
    .get();

  return Response.json(map, { status: 201 });
}
