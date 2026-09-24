import { notFound } from "next/navigation";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { BookViewerLoader } from "@/components/BookViewerLoader";

export default async function BookPage({ params, searchParams }: PageProps<"/books/[id]">) {
  await connection();
  const { id } = await params;
  const { page } = await searchParams;
  const db = getDb();

  const book = db.select().from(schema.books).where(eq(schema.books.id, Number(id))).get();
  if (!book) notFound();

  const bookmarks = db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.bookId, book.id))
    .orderBy(asc(schema.bookmarks.page))
    .all();

  return (
    <BookViewerLoader
      key={book.id}
      book={{ id: book.id, title: book.title }}
      initialBookmarks={bookmarks}
      initialPage={Math.max(1, Number(page) || 1)}
    />
  );
}
