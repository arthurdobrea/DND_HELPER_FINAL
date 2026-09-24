import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { PDF_DIR } from "@/lib/config";
import { getDb, schema } from "@/lib/db";

/**
 * Загрузка PDF: тело запроса — сам файл (не multipart), пишется на диск потоком,
 * поэтому размер книги не ограничен памятью. Этот путь исключён из proxy.ts,
 * так что ключ проверяем здесь.
 */
export async function PUT(request: NextRequest) {
  if (!isAuthorized(request.cookies.get(AUTH_COOKIE)?.value)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!request.body) return Response.json({ error: "empty body" }, { status: 400 });

  const originalName = decodeURIComponent(request.headers.get("x-file-name") ?? "book.pdf");
  const title = decodeURIComponent(request.headers.get("x-title") ?? "").trim() || originalName.replace(/\.pdf$/i, "");

  const safeBase = path.basename(originalName).replace(/[^\w.\-]+/g, "_").replace(/\.pdf$/i, "");
  const fileName = `${Date.now()}-${safeBase || "book"}.pdf`;
  const target = path.join(PDF_DIR, fileName);

  const db = getDb(); // создаёт папки data/ и data/pdfs/
  try {
    await pipeline(Readable.fromWeb(request.body as unknown as NodeWebStream), fs.createWriteStream(target));
  } catch (e) {
    await fs.promises.rm(target, { force: true });
    return Response.json({ error: `upload failed: ${String(e)}` }, { status: 500 });
  }

  const head = Buffer.alloc(5);
  const fd = await fs.promises.open(target, "r");
  await fd.read(head, 0, 5, 0);
  await fd.close();
  if (head.toString("latin1") !== "%PDF-") {
    await fs.promises.rm(target, { force: true });
    return Response.json({ error: "Это не PDF-файл" }, { status: 400 });
  }

  const { size } = await fs.promises.stat(target);
  const book = db
    .insert(schema.books)
    .values({ title, fileName, sizeBytes: size, createdAt: new Date() })
    .returning()
    .get();

  return Response.json(book, { status: 201 });
}
