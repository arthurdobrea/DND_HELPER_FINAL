import path from "node:path";

/** Папка с данными: SQLite + загруженные PDF. В Docker монтируется как volume. */
export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");
export const PDF_DIR = path.join(DATA_DIR, "pdfs");
export const DB_PATH = path.join(DATA_DIR, "app.db");

/** Загруженные карты (изображения и PDF) лежат отдельно от книг. */
export const MAP_DIR = path.join(DATA_DIR, "maps");
