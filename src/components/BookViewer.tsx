"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addPageEntry, deleteEntry, updateEntry } from "@/app/actions";
import PdfPane from "./PdfPane";

export type PageMark = { id: number; page: number; title: string; tags: string };

type Props = {
  book: { id: number; title: string };
  worldName: string;
  initialBookmarks: PageMark[];
  initialPage: number;
};

const toMark = (r: { id: number; page: number | null; title: string; tags: string }): PageMark => ({
  id: r.id,
  page: r.page ?? 1,
  title: r.title,
  tags: r.tags,
});

export default function BookViewer({ book, worldName, initialBookmarks, initialPage }: Props) {
  const [page, setPage] = useState(initialPage);
  const [bookmarks, setBookmarks] = useState(initialBookmarks);
  const [filter, setFilter] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newTags, setNewTags] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const onPageChange = useCallback((p: number) => setPage(p), []);

  // Страница в URL: F5 / ссылка открывает ту же страницу.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", String(page));
    window.history.replaceState(null, "", url);
  }, [page]);

  // B — быстро добавить закладку на текущую страницу.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "и") {
        e.preventDefault();
        titleInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const row = await addPageEntry(book.id, page, newTitle, newTags);
      setBookmarks((bs) => [...bs, toMark(row)].sort((a, b) => a.page - b.page));
      setNewTitle("");
      setNewTags("");
      titleInputRef.current?.blur();
    });
  }

  function handleDelete(id: number) {
    start(async () => {
      await deleteEntry(id);
      setBookmarks((bs) => bs.filter((b) => b.id !== id));
    });
  }

  function handleUpdate(id: number, title: string, tags: string) {
    start(async () => {
      const row = await updateEntry(id, title, tags);
      if (row) setBookmarks((bs) => bs.map((b) => (b.id === id ? toMark(row) : b)));
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
          <p className="text-xs text-muted">Закладки мира «{worldName}»</p>
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
                onClick={() => setPage(b.page)}
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

      <PdfPane
        bookId={book.id}
        page={page}
        onPageChange={onPageChange}
        toolbar={
          <>
            {pageBookmarks.length > 0 && (
              <span className="ml-3 truncate text-accent">🔖 {pageBookmarks.map((b) => b.title).join(", ")}</span>
            )}
            <span className="ml-auto hidden text-xs text-muted xl:block">← → листать · B закладка · +/− зум</span>
          </>
        }
      />
    </div>
  );
}

function EditRow({
  bookmark,
  onSave,
  onCancel,
}: {
  bookmark: PageMark;
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
