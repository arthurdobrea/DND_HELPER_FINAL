"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";

// PDF.js работает только в браузере.
const PdfPane = dynamic(() => import("../PdfPane"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-muted">Загрузка вьюера…</p>,
});

/**
 * Страница книги внутри мира: можно листать соседние страницы (←/→),
 * «вернуться к закладке» и открыть книгу целиком.
 */
export function PageEntryViewer({
  bookId,
  page: bookmarkPage,
  notes,
  hasNotes,
}: {
  bookId: number;
  page: number;
  notes: ReactNode;
  hasNotes: boolean;
}) {
  const [page, setPage] = useState(bookmarkPage);
  const [showNotes, setShowNotes] = useState(hasNotes);
  const onPageChange = useCallback((p: number) => setPage(p), []);

  return (
    <div className="flex min-h-0 flex-1">
      <PdfPane
        bookId={bookId}
        page={page}
        onPageChange={onPageChange}
        toolbar={
          <>
            {page !== bookmarkPage && (
              <button className="btn ml-2" onClick={() => setPage(bookmarkPage)}>
                ↩ к закладке (стр. {bookmarkPage})
              </button>
            )}
            <span className="ml-auto" />
            <button className={`btn ${showNotes ? "border-accent" : ""}`} onClick={() => setShowNotes((v) => !v)}>
              📝 Заметки
            </button>
            <Link href={`/books/${bookId}?page=${page}`} className="btn">
              Открыть книгу
            </Link>
          </>
        }
      />
      {showNotes && <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-panel p-3">{notes}</aside>}
    </div>
  );
}
