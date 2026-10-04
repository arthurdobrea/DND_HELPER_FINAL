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
CREATE TABLE IF NOT EXISTS world_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS world_categories_world_idx ON world_categories(world_id);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'pc',
  monster_key TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS characters_world_idx ON characters(world_id);
CREATE TABLE IF NOT EXISTS story_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  trigger TEXT NOT NULL DEFAULT '',
  boon TEXT NOT NULL DEFAULT '',
  boon_given INTEGER NOT NULL DEFAULT 0,
  told INTEGER NOT NULL DEFAULT 0,
  told_at INTEGER,
  reaction TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS story_notes_world_idx ON story_notes(world_id, character_id);
CREATE TABLE IF NOT EXISTS battles (
  world_id INTEGER PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shop_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  price REAL,
  qty INTEGER,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (world_id, item_key)
);
CREATE TABLE IF NOT EXISTS translations_ru (
  hash TEXT PRIMARY KEY,
  src TEXT NOT NULL,
  ru TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL
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
  if (version < 3) migrateToV3(sqlite);
  if (version < 4) migrateToV4(sqlite);
  if (version < 5) migrateToV5(sqlite);
}

/** v4 → v5: у персонажей появился вид (pc / npc) и ключ монстра-основы — только добавление столбцов. */
function migrateToV5(sqlite: Database.Database) {
  const columns = sqlite.prepare("PRAGMA table_info(characters)").all() as { name: string }[];
  sqlite.transaction(() => {
    if (!columns.some((c) => c.name === "kind")) sqlite.exec("ALTER TABLE characters ADD COLUMN kind TEXT NOT NULL DEFAULT 'pc'");
    if (!columns.some((c) => c.name === "monster_key")) sqlite.exec("ALTER TABLE characters ADD COLUMN monster_key TEXT");
    sqlite.pragma("user_version = 5");
  })();
}

/** v3 → v4: у вещей магазина появился замок (locked) — только добавление столбца, данные не меняются. */
function migrateToV4(sqlite: Database.Database) {
  const columns = sqlite.prepare("PRAGMA table_info(shop_items)").all() as { name: string }[];
  sqlite.transaction(() => {
    if (!columns.some((c) => c.name === "locked")) sqlite.exec("ALTER TABLE shop_items ADD COLUMN locked INTEGER NOT NULL DEFAULT 0");
    sqlite.pragma("user_version = 4");
  })();
}

/**
 * v2 → v3: появились категории «Монстры» и «Карты». Монстры, которые в v2 автоматически попали в NPC,
 * переезжают в «Монстры» (положить закладку в любую категорию можно в один клик).
 * Перед миграцией (если есть что менять) делается копия базы: app.db.backup-v2.
 */
function migrateToV3(sqlite: Database.Database) {
  const toMove = (sqlite.prepare("SELECT count(*) AS c FROM world_entries WHERE kind = 'monster' AND grp = 'npc'").get() as { c: number }).c;
  if (toMove > 0) backupDb(sqlite, "v2");
  sqlite.transaction(() => {
    sqlite.exec("UPDATE world_entries SET grp = 'monster' WHERE kind = 'monster' AND grp = 'npc'");
    sqlite.pragma("user_version = 3");
  })();
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
