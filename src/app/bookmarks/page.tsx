import Link from "next/link";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** Все закладки по всем книгам — быстрый переход во время игры. */
export default async function BookmarksPage({ searchParams }: PageProps<"/bookmarks">) {
  await connection();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().toLowerCase() : "";

  const rows = getDb()
    .select({
      id: schema.bookmarks.id,
      page: schema.bookmarks.page,
      title: schema.bookmarks.title,
      tags: schema.bookmarks.tags,
      bookId: schema.books.id,
      bookTitle: schema.books.title,
    })
    .from(schema.bookmarks)
    .innerJoin(schema.books, eq(schema.bookmarks.bookId, schema.books.id))
    .orderBy(asc(schema.books.title), asc(schema.bookmarks.page))
    .all()
    .filter(
      (r) => !query || r.title.toLowerCase().includes(query) || r.tags.toLowerCase().includes(query),
    );

  const byBook = Map.groupBy(rows, (r) => r.bookId);

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <form action="/bookmarks" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Поиск по названию или тегу (правила, бой, таверна…)"
          className="input flex-1"
        />
        <button className="btn btn-primary">Найти</button>
      </form>

      {rows.length === 0 && <p className="mt-6 text-muted">Закладок не найдено.</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[...byBook.values()].map((items) => (
          <section key={items[0].bookId} className="card p-3">
            <h2 className="mb-2 font-display text-lg text-accent">📖 {items[0].bookTitle}</h2>
            <ul>
              {items.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/books/${b.bookId}?page=${b.page}`}
                    className="flex items-baseline gap-2 rounded px-2 py-1 text-sm hover:bg-panel-2"
                  >
                    <span className="w-10 shrink-0 text-right font-mono text-muted">{b.page}</span>
                    <span className="flex-1">{b.title}</span>
                    {b.tags && <span className="tag">{b.tags}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
