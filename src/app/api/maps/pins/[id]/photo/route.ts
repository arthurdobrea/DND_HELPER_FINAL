import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { MAP_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";
import { WORLD_COOKIE } from "@/lib/world";

const PHOTO_DIR = path.join(MAP_DIR, "pins");
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

function sniff(h: Buffer): string | null {
  if (h[0] === 0x89 && h.subarray(1, 4).toString("latin1") === "PNG") return "png";
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "jpg";
  if (h.subarray(0, 4).toString("latin1") === "RIFF" && h.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/** Фото пина (ключ проверяется в proxy.ts). Версия в ?v= нужна только для сброса кэша браузера. */
export async function GET(_request: Request, ctx: RouteContext<"/api/maps/pins/[id]/photo">) {
  const { id } = await ctx.params;
  const pin = getDb().select().from(schema.mapPins).where(eq(schema.mapPins.id, Number(id))).get();
  if (!pin?.photo) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.promises.readFile(path.join(PHOTO_DIR, path.basename(pin.photo)));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": MIME_BY_EXT[pin.photo.split(".").pop() ?? ""] ?? "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("File missing", { status: 404 });
  }
}

/** Загрузка фото пина: тело — само изображение (браузер заранее уменьшает его до небольшого квадрата). */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/maps/pins/[id]/photo">) {
  const { id } = await ctx.params;
  const db = getDb();
  const pin = db.select().from(schema.mapPins).where(eq(schema.mapPins.id, Number(id))).get();
  const map = pin && db.select().from(schema.maps).where(eq(schema.maps.id, pin.mapId)).get();
  if (!pin || !map || String(map.worldId) !== request.cookies.get(WORLD_COOKIE)?.value) {
    return Response.json({ error: "Пин не найден" }, { status: 404 });
  }
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!(mime in TYPES)) {
    return Response.json({ error: "Нужен файл JPG, PNG или WebP" }, { status: 400 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return Response.json({ error: "Файл пустой или больше 2 МБ" }, { status: 400 });
  const ext = sniff(buf);
  if (!ext) return Response.json({ error: "Нужен файл JPG, PNG или WebP" }, { status: 400 });

  await fs.promises.mkdir(PHOTO_DIR, { recursive: true });
  const photo = `pin-${pin.id}-${Date.now()}.${ext}`;
  await fs.promises.writeFile(path.join(PHOTO_DIR, photo), buf);
  db.update(schema.mapPins).set({ photo }).where(eq(schema.mapPins.id, pin.id)).run();
  if (pin.photo) await fs.promises.rm(path.join(PHOTO_DIR, path.basename(pin.photo)), { force: true });
  return Response.json({ photo });
}
