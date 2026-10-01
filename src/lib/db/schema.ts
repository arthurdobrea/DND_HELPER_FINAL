import { sqliteTable, integer, text, real, primaryKey, unique } from "drizzle-orm/sqlite-core";

/** Мир (кампания): у каждого свой набор закладок. */
export const worlds = sqliteTable("worlds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  openedAt: integer("opened_at", { mode: "timestamp" }).notNull(),
});

/** PDF-книги — общая библиотека для всех миров. */
export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const ENTRY_KINDS = ["page", "spell", "item", "monster"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Группа закладки: локация, NPC, артефакт; пустая строка — «Прочее». См. lib/groups.ts. */
export type EntryGroup = "location" | "npc" | "artifact" | "";

/**
 * Закладка мира: страница книги, заклинание, предмет или монстр.
 * Для заклинаний/предметов/монстров в data лежит копия записи — работает офлайн
 * и переживает обновление каталога.
 */
export const worldEntries = sqliteTable("world_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worldId: integer("world_id")
    .notNull()
    .references(() => worlds.id, { onDelete: "cascade" }),
  kind: text("kind").$type<EntryKind>().notNull(),
  grp: text("grp").$type<EntryGroup>().notNull().default(""),
  /** Ключ в каталоге (spell/item) или slug монстра; для страниц — пусто. */
  ref: text("ref").notNull().default(""),
  bookId: integer("book_id").references(() => books.id, { onDelete: "cascade" }),
  page: integer("page"),
  title: text("title").notNull(),
  tags: text("tags").notNull().default(""),
  notes: text("notes").notNull().default(""),
  data: text("data"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

/** Персонажи игроков мира. Лист целиком — JSON (см. lib/character.ts). */
export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  worldId: integer("world_id")
    .notNull()
    .references(() => worlds.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  data: text("data").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Магазин артефактов мира: вещи из общего каталога предметов.
 * price — в золотых (null — не указана), qty — остаток на складе (null — без ограничений).
 * data — копия записи каталога, чтобы магазин переживал обновление каталога.
 */
export const shopItems = sqliteTable(
  "shop_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    worldId: integer("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    itemKey: text("item_key").notNull(),
    name: text("name").notNull(),
    data: text("data").notNull(),
    price: real("price"),
    qty: integer("qty"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [unique().on(t.worldId, t.itemKey)],
);

/** Локальная копия каталогов Open5e (заклинания, предметы) — фильтрация идёт по ней. */
export const catalog = sqliteTable(
  "catalog",
  {
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    data: text("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.key] })],
);

export const catalogMeta = sqliteTable("catalog_meta", {
  kind: text("kind").primaryKey(),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
  count: integer("count").notNull(),
});

export type World = typeof worlds.$inferSelect;
export type Book = typeof books.$inferSelect;
export type WorldEntry = typeof worldEntries.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type ShopItem = typeof shopItems.$inferSelect;
