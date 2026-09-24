import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Каталоги Open5e v2 целиком скачиваются в SQLite (один раз, потом по кнопке «Обновить»).
 * Фильтрация идёт локально: мгновенно, офлайн и по признакам, которых нет в API.
 */

const BASE = "https://api.open5e.com/v2";
const PAGE_SIZE = 500;

export type CatalogKind = "spells" | "items";

/** Какие эндпоинты входят в каталог. Предметы = обычное снаряжение + магические. */
const SOURCES: Record<CatalogKind, { endpoint: string; tag?: string }[]> = {
  spells: [{ endpoint: "spells" }],
  items: [
    { endpoint: "items", tag: "mundane" },
    { endpoint: "magicitems", tag: "magic" },
  ],
};

type Page = { count: number; results: Record<string, unknown>[] };

async function fetchPage(endpoint: string, page: number): Promise<Page> {
  const res = await fetch(`${BASE}/${endpoint}/?limit=${PAGE_SIZE}&page=${page}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open5e ${endpoint}: ${res.status} ${res.statusText}`);
  return (await res.json()) as Page;
}

async function fetchAll(endpoint: string): Promise<Record<string, unknown>[]> {
  const first = await fetchPage(endpoint, 1);
  const pages = Math.ceil(first.count / PAGE_SIZE);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) => fetchPage(endpoint, i + 2)));
  return [first, ...rest].flatMap((p) => p.results);
}

export type RawEntry = Record<string, unknown> & { key: string; name: string; _source?: string };

async function syncKind(kind: CatalogKind): Promise<void> {
  const lists = await Promise.all(
    SOURCES[kind].map(async (s) =>
      (await fetchAll(s.endpoint)).map((r) => ({ ...r, _source: s.tag }) as RawEntry),
    ),
  );
  const rows = lists.flat();

  const db = getDb();
  db.transaction((tx) => {
    tx.delete(schema.catalog).where(eq(schema.catalog.kind, kind)).run();
    for (const r of rows) {
      tx.insert(schema.catalog).values({ kind, key: r.key, data: JSON.stringify(r) }).onConflictDoNothing().run();
    }
    tx.insert(schema.catalogMeta)
      .values({ kind, syncedAt: new Date(), count: rows.length })
      .onConflictDoUpdate({ target: schema.catalogMeta.kind, set: { syncedAt: new Date(), count: rows.length } })
      .run();
  });
}

// ---------- Кэш в памяти процесса ----------

type Cache = {
  raw: Map<CatalogKind, RawEntry[]>;
  syncing: Map<CatalogKind, Promise<void>>;
};
const g = globalThis as unknown as { __dndCatalog?: Cache };
const cache: Cache = (g.__dndCatalog ??= { raw: new Map(), syncing: new Map() });

/** Скачать заново из API и сбросить кэш. Параллельные вызовы используют одну загрузку. */
export async function resync(kind: CatalogKind): Promise<void> {
  let p = cache.syncing.get(kind);
  if (!p) {
    p = syncKind(kind).finally(() => cache.syncing.delete(kind));
    cache.syncing.set(kind, p);
  }
  await p;
  cache.raw.delete(kind);
  derivedCache.clear();
}

/** Все записи каталога. При первом обращении (пустая БД) — скачивает из API. */
export async function getRaw(kind: CatalogKind): Promise<RawEntry[]> {
  const hit = cache.raw.get(kind);
  if (hit) return hit;

  const db = getDb();
  let rows = db.select({ data: schema.catalog.data }).from(schema.catalog).where(eq(schema.catalog.kind, kind)).all();
  if (rows.length === 0) {
    await resync(kind);
    rows = db.select({ data: schema.catalog.data }).from(schema.catalog).where(eq(schema.catalog.kind, kind)).all();
  }
  const parsed = rows.map((r) => JSON.parse(r.data) as RawEntry);
  cache.raw.set(kind, parsed);
  return parsed;
}

export function getMeta(kind: CatalogKind) {
  return getDb().select().from(schema.catalogMeta).where(eq(schema.catalogMeta.kind, kind)).get();
}

// Нормализованные данные тоже кэшируются, сбрасываются при resync.
const derivedCache = new Map<string, unknown>();

export async function getDerived<T>(kind: CatalogKind, build: (raw: RawEntry[]) => T): Promise<T> {
  const id = `${kind}:${build.name}`;
  if (!derivedCache.has(id)) derivedCache.set(id, build(await getRaw(kind)));
  return derivedCache.get(id) as T;
}
