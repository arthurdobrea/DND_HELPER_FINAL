import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { worldCategories } from "@/lib/categories";
import { requireWorld, worldEntries } from "@/lib/world";
import { BookViewerLoader } from "@/components/BookViewerLoader";

export default async function BookPage({ params, searchParams }: PageProps<"/books/[id]">) {
  await connection();
  const world = await requireWorld();
  const { id } = await params;
  const { page } = await searchParams;

  const book = getDb().select().from(schema.books).where(eq(schema.books.id, Number(id))).get();
  if (!book) notFound();

  const bookmarks = worldEntries(world.id, "page")
    .filter((e) => e.bookId === book.id)
    .map((e) => ({ id: e.id, page: e.page ?? 1, title: e.title, tags: e.tags, group: e.grp }))
    .sort((a, b) => a.page - b.page);

  return (
    <BookViewerLoader
      key={book.id}
      book={{ id: book.id, title: book.title }}
      worldName={world.name}
      categories={worldCategories(world.id)}
      initialBookmarks={bookmarks}
      initialPage={Math.max(1, Number(page) || 1)}
    />
  );
}
