"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { addBookmark, deleteBookmark, updateBookmark } from "@/app/actions";
import type { Bookmark } from "@/lib/db/schema";

// Воркер должен настраиваться в том же модуле, где рендерятся <Document>/<Page>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = {
  book: { id: number; title: string };
  initialBookmarks: Bookmark[];
  initialPage: number;
};

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export default function BookViewer({ book, initialBookmarks, initialPage }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [zoomIdx, setZoomIdx] = useState(2);
  const [containerWidth, setContainerWidth] = useState(800);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [filter, setFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const viewerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const file = useMemo(() => ({ url: `/api/books/${book.id}/file` }), [book.id]);

  const goTo = useCallback(
    (p: number) => {
      const clamped = Math.min(Math.max(1, p), numPages || p);
      setPage(clamped);
      setPageInput(String(clamped));
      viewerRef.current?.scrollTo({ top: 0 });
    },
    [numPages],
  );

  // Страница в URL: F5 / ссылка открывает ту же страницу.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    window.history.replaceState(null, "", url);
  }, [page]);

  // Ширина страницы подстраивается под контейнер.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width - 32));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Горячие клавиши: ←/→ листать, B — закладка, +/- зум.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
      else if (e.key === "Home") goTo(1);
      else if (e.key === "End") goTo(numPages);
      else if (e.key === "+" || e.key === "=") setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1));
      else if (e.key === "-") setZoomIdx((z) => Math.max(z - 1, 0));
      else if (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "и") {
        e.preventDefault();
        titleInputRef.current?.focus();
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, page, numPages]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const row = await addBookmark(book.id, page, newTitle, newTags);
      setBookmarks((bs) => [...bs, row].sort((a, b) => a.page - b.page));
      setNewTitle("");
      setNewTags("");
      titleInputRef.current?.blur();
    });
  }

  function handleDelete(id: number) {
    start(async () => {
      await deleteBookmark(id);
      setBookmarks((bs) => bs.filter((b) => b.id !== id));
    });
  }

  function handleUpdate(id: number, title: string, tags: string) {
    start(async () => {
      const row = await updateBookmark(id, title, tags);
      setBookmarks((bs) => bs.map((b) => (b.id === id ? row : b)));
      setEditingId(null);
    });
  }

  const visible = bookmarks.filter((b) => {
    const q = filter.trim().toLowerCase();
    return !q || b.title.toLowerCase().includes(q) || b.tags.toLowerCase().includes(q) || String(b.page) === q;
  });
  const pageBookmarks = bookmarks.filter((b) => b.page === page);

  return (
    <div className="flex h-[calc(100vh-49px)] overflow-hidden">
      {/* ---------- Панель закладок ---------- */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border p-3">
          <h1 className="truncate font-display text-lg text-accent" title={book.title}>
            {book.title}
          </h1>
          <form onSubmit={handleAdd} className="mt-2 space-y-1.5">
            <input
              ref={titleInputRef}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={`Закладка на стр. ${page} (B)`}
              className="input w-full text-sm"
            />
            <div className="flex gap-1.5">
              <input
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="теги через запятую"
                className="input min-w-0 flex-1 text-sm"
              />
              <button className="btn btn-primary" disabled={pending}>
                +
              </button>
            </div>
          </form>
        </div>

        <div className="p-3 pb-1">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔎 Фильтр закладок"
            className="input w-full text-sm"
          />
        </div>

        <ul className="flex-1 overflow-y-auto p-2">
          {visible.length === 0 && <li className="p-2 text-sm text-muted">Закладок нет</li>}
          {visible.map((b) =>
            editingId === b.id ? (
              <EditRow key={b.id} bookmark={b} onSave={handleUpdate} onCancel={() => setEditingId(null)} />
            ) : (
              <li
                key={b.id}
                className={`group flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-panel-2 ${b.page === page ? "bg-panel-2 ring-1 ring-accent" : ""}`}
                onClick={() => goTo(b.page)}
              >
                <span className="w-10 shrink-0 text-right font-mono text-muted">{b.page}</span>
                <span className="flex-1">
                  <span className="block">{b.title}</span>
                  {b.tags && (
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {b.tags.split(",").map((t) => (
                        <span key={t} className="tag">
                          {t.trim()}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="hidden gap-1 group-hover:flex">
                  <button
                    className="text-muted hover:text-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(b.id);
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className="text-muted hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(b.id);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      </aside>

      {/* ---------- PDF ---------- */}
      <section className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-sm">
          <button className="btn" onClick={() => goTo(page - 1)} disabled={page <= 1}>
            ←
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              goTo(Number(pageInput) || 1);
            }}
          >
            <input
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              className="input w-16 py-1 text-center"
            />
          </form>
          <span className="text-muted">/ {numPages || "…"}</span>
          <button className="btn" onClick={() => goTo(page + 1)} disabled={!!numPages && page >= numPages}>
            →
          </button>
          <span className="mx-2 h-5 w-px bg-border" />
          <button className="btn" onClick={() => setZoomIdx((z) => Math.max(z - 1, 0))}>
            −
          </button>
          <span className="w-12 text-center">{Math.round(ZOOM_STEPS[zoomIdx] * 100)}%</span>
          <button className="btn" onClick={() => setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1))}>
            +
          </button>
          {pageBookmarks.length > 0 && (
            <span className="ml-3 truncate text-accent">🔖 {pageBookmarks.map((b) => b.title).join(", ")}</span>
          )}
          <span className="ml-auto hidden text-xs text-muted xl:block">← → листать · B закладка · +/− зум</span>
        </div>

        <div ref={viewerRef} className="flex-1 overflow-auto bg-[#0e0c0a] p-4">
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              if (page > numPages) goTo(numPages);
            }}
            loading={<p className="text-center text-muted">Открываю PDF…</p>}
            error={<p className="text-center text-red-400">Не удалось открыть PDF</p>}
            className="flex justify-center"
          >
            <Page
              pageNumber={page}
              width={Math.max(200, containerWidth) * ZOOM_STEPS[zoomIdx]}
              loading={<div className="h-[80vh]" />}
              className="shadow-2xl"
            />
          </Document>
        </div>
      </section>
    </div>
  );
}

function EditRow({
  bookmark,
  onSave,
  onCancel,
}: {
  bookmark: Bookmark;
  onSave: (id: number, title: string, tags: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(bookmark.title);
  const [tags, setTags] = useState(bookmark.tags);
  return (
    <li className="space-y-1 rounded-md bg-panel-2 p-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="input w-full text-sm" autoFocus />
      <input value={tags} onChange={(e) => setTags(e.target.value)} className="input w-full text-sm" placeholder="теги" />
      <div className="flex gap-1">
        <button className="btn flex-1" onClick={() => onSave(bookmark.id, title, tags)}>
          Сохранить
        </button>
        <button className="btn" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </li>
  );
}
