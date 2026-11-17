import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ENGINE_ID, TranslationShapeError, translateBatch, translationEnabled } from "./engine";

export const hashText = (s: string) => createHash("sha256").update(s).digest("hex");

const MAX_TEXT = 20_000;
const MAX_BATCH_ITEMS = 20;
const MAX_BATCH_CHARS = 12_000;
// Переводчик работает на процессоре — параллельных запросов много не нужно.
const MAX_PARALLEL = 2;

/** Стоит ли переводить строку: в ней есть латинские буквы (иначе — числа, кости, уже русский текст). */
export const worthTranslating = (s: string) => s.length <= MAX_TEXT && /[A-Za-z]/.test(s);

/** Уникальные переводимые строки, порядок сохраняется. */
export function translatable(texts: Iterable<string>): string[] {
  return [...new Set([...texts].filter(worthTranslating))];
}

/** Что уже переведено и лежит в кэше. Ключ результата — исходный текст. */
export function lookupCached(texts: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const byHash = new Map(translatable(texts).map((t) => [hashText(t), t]));
  const hashes = [...byHash.keys()];
  const db = getDb();
  for (let i = 0; i < hashes.length; i += 500) {
    const rows = db
      .select({ hash: schema.translationsRu.hash, ru: schema.translationsRu.ru })
      .from(schema.translationsRu)
      .where(inArray(schema.translationsRu.hash, hashes.slice(i, i + 500)))
      .all();
    for (const r of rows) out.set(byHash.get(r.hash)!, r.ru);
  }
  return out;
}

function save(pairs: [string, string][]) {
  const db = getDb();
  const now = new Date();
  db.transaction((tx) => {
    for (const [src, ru] of pairs) {
      tx.insert(schema.translationsRu)
        .values({ hash: hashText(src), src, ru, model: ENGINE_ID, createdAt: now })
        .onConflictDoUpdate({ target: schema.translationsRu.hash, set: { ru, model: ENGINE_ID, createdAt: now } })
        .run();
    }
  });
}

function makeBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= MAX_BATCH_ITEMS || chars + t.length > MAX_BATCH_CHARS)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// ---------- Параллелизм и защита от дублей ----------

let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// Строки, которые прямо сейчас переводятся: второй запрос на тот же текст ждёт первый, а не платит дважды.
const pending = new Map<string, Promise<void>>();

/** Переводит пачку; если ответ не сошёлся по длине — делит пополам и повторяет. */
async function translateAndSave(batch: string[]): Promise<void> {
  try {
    const ru = await translateBatch(batch);
    save(batch.map((src, i) => [src, ru[i]]));
  } catch (e) {
    if (e instanceof TranslationShapeError && batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      await translateAndSave(batch.slice(0, mid));
      await translateAndSave(batch.slice(mid));
      return;
    }
    throw e;
  }
}

/**
 * Гарантирует, что все переводимые тексты есть в кэше (при включённом переводе).
 * Бросает TranslationError, если перевести не удалось. Возвращает карту «исходный → русский».
 */
export async function ensureTranslated(texts: string[]): Promise<Map<string, string>> {
  const wanted = translatable(texts);
  let cached = lookupCached(wanted);
  const missing = wanted.filter((t) => !cached.has(t));
  if (missing.length && translationEnabled()) {
    const waits: Promise<void>[] = [];
    const fresh: string[] = [];
    for (const t of missing) {
      const p = pending.get(hashText(t));
      if (p) waits.push(p);
      else fresh.push(t);
    }
    for (const batch of makeBatches(fresh)) {
      const p = withSlot(() => translateAndSave(batch)).finally(() => {
        for (const t of batch) pending.delete(hashText(t));
      });
      for (const t of batch) pending.set(hashText(t), p);
      waits.push(p);
    }
    // Ждём все; первая ошибка пробрасывается, остальные пачки при этом всё равно дойдут до кэша.
    const results = await Promise.allSettled(waits);
    const failed = results.find((r) => r.status === "rejected");
    cached = lookupCached(wanted);
    if (failed && cached.size < wanted.length) throw (failed as PromiseRejectedResult).reason;
  }
  return cached;
}
