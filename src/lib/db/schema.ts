import { sqliteTable, integer, text, real, primaryKey, unique } from "drizzle-orm/sqlite-core";

export const favorites = sqliteTable("favorites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull().default("open5e"),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  cr: real("cr"),
  type: text("type"),
  /** Полный JSON монстра — чтобы избранное работало без интернета. */
  data: text("data").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const bookmarks = sqliteTable("bookmarks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  title: text("title").notNull(),
  tags: text("tags").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

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

/** Закреплённые заклинания и предметы (монстры — в favorites). */
export const pins = sqliteTable(
  "pins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    data: text("data").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [unique().on(t.kind, t.key)],
);

export type Favorite = typeof favorites.$inferSelect;
export type Book = typeof books.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Pin = typeof pins.$inferSelect;
