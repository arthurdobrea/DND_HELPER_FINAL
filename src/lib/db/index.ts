import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DATA_DIR, DB_PATH, PDF_DIR } from "@/lib/config";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

// Схема создаётся при старте — отдельный шаг миграций не нужен.
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'open5e',
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cr REAL,
  type TEXT,
  data TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  title TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_book_idx ON bookmarks(book_id, page);
CREATE TABLE IF NOT EXISTS catalog (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (kind, key)
);
CREATE TABLE IF NOT EXISTS catalog_meta (
  kind TEXT PRIMARY KEY,
  synced_at INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (kind, key)
);
`;

function createDb(): Db {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(INIT_SQL);
  return drizzle(sqlite, { schema });
}

// Один экземпляр на процесс (и переживает HMR в dev).
const globalForDb = globalThis as unknown as { __dndDb?: Db };

export function getDb(): Db {
  globalForDb.__dndDb ??= createDb();
  return globalForDb.__dndDb;
}

export { schema };
