import Link from "next/link";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld, worldEntries } from "@/lib/world";
import { UploadBook } from "@/components/UploadBook";
import { BookActions } from "@/components/BookActions";

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`;
}

export default async function BooksPage() {
  await connection();
  const world = await requireWorld();
  const books = getDb().select().from(schema.books).orderBy(desc(schema.books.createdAt)).all();
  // Книги общие для всех миров, а закладки считаем только текущего.
  const counts = new Map<number, number>();
  for (const e of worldEntries(world.id, "page")) if (e.bookId) counts.set(e.bookId, (counts.get(e.bookId) ?? 0) + 1);

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <h1 className="font-display text-2xl text-accent">Книги</h1>
      <p className="text-sm text-muted">Библиотека общая для всех миров. Закладки на страницы — у каждого мира свои.</p>
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
                  {formatSize(b.sizeBytes)} · закладок в «{world.name}»: {counts.get(b.id) ?? 0}
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
