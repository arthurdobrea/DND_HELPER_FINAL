"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { AiBlockedError, AiError, generateJson, geminiEnabled } from "@/lib/ai/gemini";
import { PARSER_SYSTEM_PROMPT, buildParserPrompt } from "@/lib/ai/parser-prompt";
import { getDb, schema } from "@/lib/db";
import { entityKey, mergeCharacter, mergeItem, parseExtraction, type EntityKind, type ParsedCharacter, type ParsedItem } from "@/lib/parser";
import { requireWorld } from "@/lib/world";

export type ParseChunkResult =
  | {
      ok: true;
      characters: number;
      items: number;
      /** Страницы, которые Gemini отказался читать даже по одной (фильтр безопасности): пропущены, окно считается разобранным. */
      skipped: number[];
      /** Сколько всего персонажей и предметов найдено в книге на данный момент. */
      totals: { characters: number; items: number };
    }
  | { ok: false; error: string; /** Лимит запросов Gemini — клиенту стоит подождать и повторить. */ rateLimited: boolean };

const MAX_PAGE_CHARS = 12000;

/** Добавляет найденное в книгу, склеивая с уже имеющимся по имени. */
function save(bookId: number, kind: EntityKind, entity: ParsedCharacter | ParsedItem, page: number, fallbackPages: number[]) {
  const db = getDb();
  const key = entityKey(entity.name);
  const pages = page ? [page] : fallbackPages;
  const existing = db
    .select()
    .from(schema.bookEntities)
    .where(and(eq(schema.bookEntities.bookId, bookId), eq(schema.bookEntities.kind, kind), eq(schema.bookEntities.key, key)))
    .get();
  if (!existing) {
    db.insert(schema.bookEntities)
      .values({ bookId, kind, key, name: entity.name, data: JSON.stringify(entity), pages: JSON.stringify(pages), createdAt: new Date() })
      .run();
    return;
  }
  const old = JSON.parse(existing.data);
  const merged = kind === "character" ? mergeCharacter(old, entity as ParsedCharacter) : mergeItem(old, entity as ParsedItem);
  const allPages = [...new Set([...(JSON.parse(existing.pages) as number[]), ...pages])].sort((a, b) => a - b);
  db.update(schema.bookEntities)
    .set({ name: merged.name, data: JSON.stringify(merged), pages: JSON.stringify(allPages) })
    .where(eq(schema.bookEntities.id, existing.id))
    .run();
}

type Page = { page: number; text: string };

/** Отправляет страницы в Gemini и сохраняет найденное. Бросает AiBlockedError, если сработал фильтр безопасности. */
async function extract(bookId: number, pages: Page[]): Promise<{ characters: number; items: number }> {
  const lo = Math.min(...pages.map((p) => p.page));
  const hi = Math.max(...pages.map((p) => p.page));
  const raw = await generateJson({ system: PARSER_SYSTEM_PROMPT, prompt: buildParserPrompt(pages), maxTokens: 8192, temperature: 0.2 });
  const res = parseExtraction(raw, lo, hi);
  getDb().transaction(() => {
    for (const c of res.characters) save(bookId, "character", c.entity, c.page ?? 0, [lo]);
    for (const i of res.items) save(bookId, "item", i.entity, i.page ?? 0, [lo]);
  });
  return { characters: res.characters.length, items: res.items.length };
}

function totalsOf(bookId: number) {
  const rows = getDb()
    .select({ kind: schema.bookEntities.kind, n: sql<number>`count(*)` })
    .from(schema.bookEntities)
    .where(eq(schema.bookEntities.bookId, bookId))
    .groupBy(schema.bookEntities.kind)
    .all();
  return { characters: rows.find((r) => r.kind === "character")?.n ?? 0, items: rows.find((r) => r.kind === "item")?.n ?? 0 };
}

/**
 * Разбирает одно окно страниц книги: отправляет текст в Gemini, сохраняет найденных персонажей и предметы
 * и помечает окно разобранным. Вызывается из браузера по очереди для всей книги (см. ParserRunner).
 * Если Gemini отказывается читать окно целиком (фильтр безопасности), окно разбирается по одной странице;
 * страницы, которые он не читает и по отдельности, пропускаются и возвращаются в skipped.
 */
export async function parseChunk(bookId: number, pages: Page[]): Promise<ParseChunkResult> {
  await requireWorld();
  if (!geminiEnabled()) {
    return { ok: false, rateLimited: false, error: "Не задан GEMINI_API_KEY: добавьте ключ в файл .env и перезапустите приложение." };
  }
  const db = getDb();
  if (!db.select().from(schema.books).where(eq(schema.books.id, bookId)).get()) return { ok: false, rateLimited: false, error: "Книга не найдена" };
  const clean = pages
    .filter((p) => Number.isInteger(p.page) && p.page > 0)
    .map((p) => ({ page: p.page, text: String(p.text ?? "").slice(0, MAX_PAGE_CHARS) }));
  if (clean.length === 0) return { ok: true, characters: 0, items: 0, skipped: [], totals: totalsOf(bookId) };
  const lo = Math.min(...clean.map((p) => p.page));
  const hi = Math.max(...clean.map((p) => p.page));

  const found = { characters: 0, items: 0 };
  const skipped: number[] = [];
  const fail = (e: unknown): ParseChunkResult => {
    if (e instanceof AiError) return { ok: false, error: e.message, rateLimited: e.message.includes("лимит") };
    return { ok: false, rateLimited: false, error: e instanceof Error ? e.message : "Не удалось разобрать страницы" };
  };

  // Почти пустые окна (картинки, пустые страницы) модели не отправляем.
  if (clean.reduce((n, p) => n + p.text.trim().length, 0) >= 200) {
    try {
      Object.assign(found, await extract(bookId, clean));
    } catch (e) {
      if (!(e instanceof AiBlockedError)) return fail(e);
      // Фильтр сработал на окне: читаем страницы по одной, чтобы потерять только действительно «запретную».
      for (const p of clean) {
        if (p.text.trim().length < 80) continue;
        try {
          const r = await extract(bookId, [p]);
          found.characters += r.characters;
          found.items += r.items;
        } catch (e2) {
          if (e2 instanceof AiBlockedError) skipped.push(p.page);
          else return fail(e2);
        }
      }
    }
  }

  db.insert(schema.bookParseChunks)
    .values({ bookId, startPage: lo, endPage: hi, found: found.characters + found.items, createdAt: new Date() })
    .onConflictDoUpdate({ target: [schema.bookParseChunks.bookId, schema.bookParseChunks.startPage], set: { endPage: hi, found: found.characters + found.items, createdAt: new Date() } })
    .run();
  return { ok: true, ...found, skipped, totals: totalsOf(bookId) };
}

/** Стереть результаты разбора книги и начать заново. */
export async function resetBookParse(bookId: number) {
  await requireWorld();
  const db = getDb();
  db.delete(schema.bookEntities).where(eq(schema.bookEntities.bookId, bookId)).run();
  db.delete(schema.bookParseChunks).where(eq(schema.bookParseChunks.bookId, bookId)).run();
  revalidatePath("/parser");
}

/** Удалить сразу несколько найденных записей (персонажей и/или предметов). Возвращает, сколько удалено. */
export async function deleteBookEntities(ids: number[]): Promise<number> {
  await requireWorld();
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5000);
  if (clean.length === 0) return 0;
  const db = getDb();
  let deleted = 0;
  // Порциями: в SQLite ограничено число параметров в одном запросе.
  for (let i = 0; i < clean.length; i += 500) {
    deleted += db.delete(schema.bookEntities).where(inArray(schema.bookEntities.id, clean.slice(i, i + 500))).run().changes;
  }
  revalidatePath("/parser");
  return deleted;
}

export async function deleteBookEntity(id: number) {
  await requireWorld();
  getDb().delete(schema.bookEntities).where(eq(schema.bookEntities.id, id)).run();
  revalidatePath("/parser");
}
