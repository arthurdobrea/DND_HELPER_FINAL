import Link from "next/link";
import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { UploadBook } from "@/components/UploadBook";
import { BookActions } from "@/components/BookActions";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`;
}

export default async function BooksPage() {
  await connection();
  const db = getDb();
  const books = db.select().from(schema.books).orderBy(desc(schema.books.createdAt)).all();
  const counts = new Map(
    db
      .select({ bookId: schema.bookmarks.bookId, n: sql<number>`count(*)` })
      .from(schema.bookmarks)
      .groupBy(schema.bookmarks.bookId)
      .all()
      .map((r) => [r.bookId, r.n]),
  );

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <h1 className="font-display text-2xl text-accent">Книги</h1>
      <UploadBook />

      {books.length === 0 ? (
        <p className="mt-6 text-muted">Загрузите PDF книги, чтобы делать по ней закладки.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {books.map((b) => (
            <div key={b.id} className="card flex items-center gap-3 p-3">
              <Link href={`/books/${b.id}`} className="flex-1">
                <div className="font-display text-lg text-accent hover:underline">📖 {b.title}</div>
                <div className="text-xs text-muted">
                  {formatSize(b.sizeBytes)} · закладок: {counts.get(b.id) ?? 0}
                </div>
              </Link>
              <BookActions id={b.id} title={b.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
