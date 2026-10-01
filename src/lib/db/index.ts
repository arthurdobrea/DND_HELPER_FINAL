import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { DATA_DIR, DB_PATH, PDF_DIR } from "@/lib/config";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

// Схема создаётся при старте — отдельный шаг миграций не нужен.
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  opened_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS world_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  grp TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  page INTEGER,
  title TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS world_entries_world_idx ON world_entries(world_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS world_entries_ref_uq ON world_entries(world_id, kind, ref) WHERE kind != 'page';
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS characters_world_idx ON characters(world_id);
CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  price REAL,
  qty INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (world_id, item_key)
);
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
`;

/** Копия базы рядом с ней перед миграцией, которая меняет существующие данные. */
function backupDb(sqlite: Database.Database, suffix: string) {
  sqlite.pragma("wal_checkpoint(TRUNCATE)");
  fs.copyFileSync(DB_PATH, `${DB_PATH}.backup-${suffix}`);
}

function migrate(sqlite: Database.Database) {
  const version = sqlite.pragma("user_version", { simple: true }) as number;
  if (version < 1) migrateToV1(sqlite);
  if (version < 2) migrateToV2(sqlite);
}

/**
 * v1 → v2: у закладок мира появилась группа (локация / NPC / артефакт).
 * Существующим закладкам: монстры → NPC, предметы → артефакты, остальные — «Прочее».
 * Перед миграцией (если закладки есть) делается копия базы: app.db.backup-v1.
 */
function migrateToV2(sqlite: Database.Database) {
  const columns = sqlite.prepare("PRAGMA table_info(world_entries)").all() as { name: string }[];
  const hasGroup = columns.some((c) => c.name === "grp");
  const entries = (sqlite.prepare("SELECT count(*) AS c FROM world_entries").get() as { c: number }).c;
  if (!hasGroup && entries > 0) backupDb(sqlite, "v1");

  sqlite.transaction(() => {
    if (!hasGroup) sqlite.exec("ALTER TABLE world_entries ADD COLUMN grp TEXT NOT NULL DEFAULT ''");
    // Выполняется один раз (по user_version), поэтому позже выбранные вручную группы не затрутся.
    sqlite.exec("UPDATE world_entries SET grp = 'npc' WHERE kind = 'monster' AND grp = ''");
    sqlite.exec("UPDATE world_entries SET grp = 'artifact' WHERE kind = 'item' AND grp = ''");
    sqlite.pragma("user_version = 2");
  })();
}

/**
 * v0 → v1: избранные монстры (favorites), закреплённые заклинания/предметы (pins)
 * и закладки книг (bookmarks) переезжают в world_entries мира «Мой мир».
 * Перед миграцией делается копия базы рядом: app.db.backup-v0.
 */
function migrateToV1(sqlite: Database.Database) {
  const hasTable = (name: string) =>
    !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  const legacy = ["favorites", "pins", "bookmarks"].filter(hasTable);
  const legacyRows = legacy.reduce(
    (n, t) => n + (sqlite.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c,
    0,
  );

  if (legacyRows > 0) backupDb(sqlite, "v0");

  sqlite.transaction(() => {
    if (legacyRows > 0) {
      const now = Math.floor(Date.now() / 1000);
      const worldId = sqlite
        .prepare("INSERT INTO worlds (name, description, created_at, opened_at) VALUES (?, ?, ?, ?)")
        .run("Мой мир", "Закладки, созданные до появления миров", now, now).lastInsertRowid;

      if (legacy.includes("favorites")) {
        sqlite
          .prepare(
            `INSERT INTO world_entries (world_id, kind, ref, title, notes, data, created_at)
             SELECT ?, 'monster', slug, name, notes, data, created_at FROM favorites`,
          )
          .run(worldId);
      }
      if (legacy.includes("pins")) {
        sqlite
          .prepare(
            `INSERT INTO world_entries (world_id, kind, ref, title, notes, data, created_at)
             SELECT ?, CASE kind WHEN 'spells' THEN 'spell' ELSE 'item' END, key, name, notes, data, created_at FROM pins`,
          )
          .run(worldId);
      }
      if (legacy.includes("bookmarks")) {
        sqlite
          .prepare(
            `INSERT INTO world_entries (world_id, kind, book_id, page, title, tags, created_at)
             SELECT ?, 'page', book_id, page, title, tags, created_at FROM bookmarks`,
          )
          .run(worldId);
      }
    }
    for (const t of legacy) sqlite.exec(`DROP TABLE ${t}`);
    sqlite.pragma("user_version = 1");
  })();
}

function openSqlite(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

// Один экземпляр на процесс (и переживает HMR в dev).
const globalForDb = globalThis as unknown as { __dndDb?: Db; __dndSqlite?: Database.Database; __dndSchema?: string };

export function getDb(): Db {
  if (!globalForDb.__dndSqlite || !globalForDb.__dndDb) {
    globalForDb.__dndSqlite = openSqlite();
    globalForDb.__dndDb = drizzle(globalForDb.__dndSqlite, { schema });
  }
  // Схема применяется при первом подключении и заново, если её SQL поменялся
  // (в dev код обновляется без перезапуска процесса).
  if (globalForDb.__dndSchema !== INIT_SQL) {
    globalForDb.__dndSqlite.exec(INIT_SQL);
    migrate(globalForDb.__dndSqlite);
    globalForDb.__dndSchema = INIT_SQL;
  }
  return globalForDb.__dndDb;
}

export { schema };
