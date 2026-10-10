import Link from "next/link";
import { connection } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { geminiEnabled } from "@/lib/ai/gemini";
import { ParserRunnerLoader } from "@/components/parser/ParserRunnerLoader";
import { EntityBrowser, type EntityDto } from "@/components/parser/EntityBrowser";
import type { ParsedCharacter, ParsedItem } from "@/lib/parser";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Парсер книг", "🔍");

export default async function ParserPage({ searchParams }: PageProps<"/parser">) {
  await connection();
  await requireWorld();
  const db = getDb();
  const { book } = await searchParams;

  const books = db.select().from(schema.books).orderBy(asc(schema.books.title)).all();
  const counts = new Map<number, number>(
    db
      .select({ bookId: schema.bookEntities.bookId, n: sql<number>`count(*)` })
      .from(schema.bookEntities)
      .groupBy(schema.bookEntities.bookId)
      .all()
      .map((r) => [r.bookId, r.n]),
  );
  const current = books.find((b) => b.id === Number(book)) ?? books.find((b) => counts.has(b.id)) ?? books[0];

  let content: React.ReactNode = null;
  if (current) {
    const rows = db.select().from(schema.bookEntities).where(eq(schema.bookEntities.bookId, current.id)).all();
    const toDto = <T,>(kind: "character" | "item"): EntityDto<T>[] =>
      rows
        .filter((r) => r.kind === kind)
        .map((r) => ({ id: r.id, name: r.name, pages: JSON.parse(r.pages) as number[], data: JSON.parse(r.data) as T }));
    const characters = toDto<ParsedCharacter>("character");
    const items = toDto<ParsedItem>("item");
    const doneStarts = db.select({ s: schema.bookParseChunks.startPage }).from(schema.bookParseChunks).where(eq(schema.bookParseChunks.bookId, current.id)).all().map((r) => r.s);

    content = (
      <>
        <ParserRunnerLoader
          key={current.id}
          bookId={current.id}
          bookTitle={current.title}
          doneStarts={doneStarts}
          aiEnabled={geminiEnabled()}
          found={{ characters: characters.length, items: items.length }}
        />
        <EntityBrowser key={current.id} bookId={current.id} characters={characters} items={items} />
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <h1 className="font-display text-2xl text-accent">Парсер книг</h1>
      <p className="text-sm text-muted">
        Проходит по всей книге и выписывает персонажей (с блоками характеристик, если они есть) и предметы. Разбор делает Gemini, результаты хранятся в базе и общие для всех миров.
      </p>

      {books.length === 0 ? (
        <p className="mt-6 text-muted">
          Сначала загрузите PDF в разделе <Link href="/books" className="text-accent underline">«Книги»</Link>.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1">
            {books.map((b) => (
              <Link
                key={b.id}
                href={`/parser?book=${b.id}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${b.id === current?.id ? "border-accent bg-panel-2 text-accent" : "border-border text-muted hover:text-text"}`}
              >
                📖 {b.title}
                {counts.get(b.id) ? ` · ${counts.get(b.id)}` : ""}
              </Link>
            ))}
          </div>
          <div className="mt-3">{content}</div>
        </>
      )}
    </div>
  );
}
