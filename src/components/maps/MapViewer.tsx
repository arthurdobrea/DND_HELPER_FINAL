"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { addPin, addPinNote, deletePin, deletePinNote, movePin, removePinPhoto, setMapPage, togglePinBookmark, updatePin, updatePinNote } from "@/app/map-actions";
import { MAP_LIMITS, PIN_COLORS, type BookmarkDto, type PinDto, type PinNoteDto, pinTextColor } from "@/lib/maps";
import PdfPane from "@/components/PdfPane";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** Сдвиг курсора (px), после которого нажатие на пин считается перетаскиванием, а не кликом. */
const DRAG_THRESHOLD = 4;

/** Адрес фото пина; имя файла в ?v= сбрасывает кэш при замене фото. */
const photoUrl = (p: Pick<PinDto, "id" | "photo">) => `/api/maps/pins/${p.id}/photo?v=${encodeURIComponent(p.photo ?? "")}`;

/** Центральный квадрат картинки → небольшой WebP/JPEG (256 px): пины остаются лёгкими. */
async function resizeToSquare(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!jpeg) throw new Error("Не удалось подготовить фото");
  return jpeg;
}

type Props = {
  map: { id: number; title: string; kind: "image" | "pdf"; page: number };
  initialPins: PinDto[];
  /** Закладки-страницы книг этого мира — их можно прикреплять к пинам. */
  bookmarks: BookmarkDto[];
};

export default function MapViewer({ map, initialPins, bookmarks }: Props) {
  const [pins, setPins] = useState<PinDto[]>(initialPins);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(true);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [page, setPage] = useState(map.page);
  const [numPages, setNumPages] = useState(0);
  const [reader, setReader] = useState<BookmarkDto | null>(null);
  const [width, setWidth] = useState(800);
  const scrollRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null);

  const zoom = ZOOMS[zoomIdx];
  const selected = pins.find((p) => p.id === selectedId) ?? null;
  const file = useMemo(() => ({ url: `/api/maps/${map.id}/file` }), [map.id]);

  // Ширина области просмотра: карта по умолчанию вписывается в неё, зум умножает.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const set = () => setWidth(Math.max(200, el.clientWidth - 2));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const patchPin = (id: number, patch: Partial<PinDto>) => setPins((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** Координаты указателя как доли размера карты. */
  function fraction(clientX: number, clientY: number) {
    const r = surfaceRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)) };
  }

  async function onSurfaceClick(e: React.MouseEvent) {
    if (!placing) {
      setSelectedId(null);
      return;
    }
    const { x, y } = fraction(e.clientX, e.clientY);
    const id = await addPin(map.id, x, y);
    if (id === null) return;
    setPins((ps) => [...ps, { id, x, y, title: "", color: PIN_COLORS[0], notes: [], bookmarkIds: [], photo: null }]);
    setSelectedId(id);
  }

  function onPinDown(e: React.PointerEvent, pin: PinDto) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: pin.id, startX: e.clientX, startY: e.clientY, moved: false };
  }

  function onPinMove(e: React.PointerEvent, pin: PinDto) {
    const d = drag.current;
    if (!d || d.id !== pin.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
    d.moved = true;
    patchPin(pin.id, fraction(e.clientX, e.clientY));
  }

  function onPinUp(e: React.PointerEvent, pin: PinDto) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== pin.id) return;
    if (d.moved) {
      const { x, y } = fraction(e.clientX, e.clientY);
      void movePin(pin.id, x, y);
    } else {
      setSelectedId(pin.id);
    }
  }

  async function removePin(id: number) {
    if (!confirm("Удалить пин вместе со всеми записями?")) return;
    setPins((ps) => ps.filter((p) => p.id !== id));
    setSelectedId(null);
    await deletePin(id);
  }

  function changePage(next: number) {
    const n = Math.min(Math.max(1, next), numPages || next);
    setPage(n);
    void setMapPage(map.id, n);
  }

  async function newNote(pin: PinDto) {
    const id = await addPinNote(pin.id);
    if (id !== null) patchPin(pin.id, { notes: [...pin.notes, { id, title: "", body: "" }] });
  }

  const pinLabel = (p: PinDto, i: number) => p.title.trim() || `Пин ${i + 1}`;

  return (
    <div className="flex flex-1 flex-col lg:flex-row" style={{ height: "calc(100vh - var(--header-h, 49px))" }}>
      {/* Карта */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-sm">
          <Link href="/maps" className="text-muted hover:text-text">
            ← Карты
          </Link>
          <h1 className="max-w-72 truncate font-display text-lg text-accent">{map.title}</h1>
          <button className={`btn ${placing ? "btn-primary" : ""}`} onClick={() => setPlacing((v) => !v)} title="Клик по карте ставит пин">
            📍 {placing ? "Ставлю пины" : "Только просмотр"}
          </button>
          <div className="flex items-center gap-1">
            <button className="btn" onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0}>
              −
            </button>
            <span className="w-12 text-center text-muted">{Math.round(zoom * 100)}%</span>
            <button className="btn" onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1}>
              +
            </button>
          </div>
          {map.kind === "pdf" && numPages > 0 && (
            <div className="flex items-center gap-1">
              <button className="btn" onClick={() => changePage(page - 1)} disabled={page <= 1}>
                ←
              </button>
              <span className="text-muted">
                стр. {page} / {numPages}
              </span>
              <button className="btn" onClick={() => changePage(page + 1)} disabled={page >= numPages}>
                →
              </button>
            </div>
          )}
          <span className="ml-auto text-xs text-muted">Пин можно перетащить</span>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-panel-2">
          <div
            ref={surfaceRef}
            onClick={onSurfaceClick}
            className={`relative mx-auto select-none ${placing ? "cursor-crosshair" : "cursor-default"}`}
            style={{ width: width * zoom }}
          >
            {map.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt={map.title} draggable={false} className="block w-full" />
            ) : (
              <Document file={file} onLoadSuccess={(d) => setNumPages(d.numPages)} loading={<p className="p-8 text-muted">Загрузка PDF…</p>} error={<p className="p-8 text-red-400">Не удалось открыть PDF</p>}>
                <Page pageNumber={Math.min(page, numPages || page)} width={width * zoom} renderTextLayer={false} renderAnnotationLayer={false} />
              </Document>
            )}

            {pins.map((p, i) => {
              const sel = p.id === selectedId;
              const name = p.title.trim();
              const fg = pinTextColor(p.color);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => onPinDown(e, p)}
                  onPointerMove={(e) => onPinMove(e, p)}
                  onPointerUp={(e) => onPinUp(e, p)}
                  title={pinLabel(p, i)}
                  className={`absolute flex -translate-x-1/2 -translate-y-full touch-none cursor-grab flex-col items-center active:cursor-grabbing ${sel ? "z-20" : "z-10"}`}
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  {p.photo ? (
                    <>
                      <span className="relative block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoUrl(p)}
                          alt=""
                          draggable={false}
                          className="block h-14 w-14 rounded-full object-cover shadow-xl"
                          style={{ border: `3px solid ${sel ? "#fff" : p.color}`, outline: `2px solid ${sel ? p.color : "rgba(0,0,0,.55)"}` }}
                        />
                        <span
                          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold shadow"
                          style={{ background: p.color, color: fg, border: "1.5px solid rgba(0,0,0,.5)" }}
                        >
                          {i + 1}
                        </span>
                      </span>
                      {/* Имя — сразу под фото, не перекрывая его */}
                      {name && (
                        <span
                          className="mt-1 max-w-36 truncate rounded-full px-2 py-0.5 text-[12px] font-bold leading-tight shadow-lg"
                          style={{ background: p.color, color: fg, border: "1.5px solid rgba(0,0,0,.55)" }}
                        >
                          {name}
                        </span>
                      )}
                    </>
                  ) : (
                    <span
                      className="flex max-w-44 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] font-bold leading-tight shadow-lg"
                      style={{ background: p.color, color: fg, border: `2px solid ${sel ? "#fff" : "rgba(0,0,0,.55)"}`, outline: sel ? `2px solid ${p.color}` : undefined }}
                    >
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-black/35 px-1 text-[11px] text-white">{i + 1}</span>
                      {name && <span className="truncate">{name}</span>}
                    </span>
                  )}
                  {/* Остриё: указывает точную точку на карте */}
                  <span className="-mt-px h-0 w-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: `9px solid ${p.color}`, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.6))" }} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Панель пинов */}
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-y-auto border-t border-border bg-panel lg:max-h-none lg:w-[26rem] lg:border-l lg:border-t-0">
        {selected ? (
          <PinEditor
            key={selected.id}
            pin={selected}
            index={pins.findIndex((p) => p.id === selected.id)}
            onBack={() => setSelectedId(null)}
            onPatch={(patch) => patchPin(selected.id, patch)}
            onDelete={() => removePin(selected.id)}
            onNewNote={() => newNote(selected)}
            bookmarks={bookmarks}
            onRead={setReader}
          />
        ) : (
          <div className="p-3">
            <h2 className="font-display text-lg text-accent">Пины ({pins.length})</h2>
            {pins.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Кликните по карте, чтобы поставить первый пин, и впишите в него детали сюжета.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {pins.map((p, i) => (
                  <li key={p.id}>
                    <button className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left hover:border-accent" onClick={() => setSelectedId(p.id)}>
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoUrl(p)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ border: `2px solid ${p.color}` }} />
                      ) : (
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: p.color, color: pinTextColor(p.color) }}>
                          {i + 1}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{pinLabel(p, i)}</span>
                      <span className="text-xs text-muted">
                        {p.notes.length} зап.{p.bookmarkIds.length > 0 && ` · 🔖 ${p.bookmarkIds.length}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>

      {reader && <BookmarkReader key={reader.id} bookmark={reader} onClose={() => setReader(null)} />}
    </div>
  );
}

/** Окно чтения: страница книги, на которую указывает закладка; можно листать и открыть книгу целиком. */
function BookmarkReader({ bookmark, onClose }: { bookmark: BookmarkDto; onClose: () => void }) {
  const [page, setPage] = useState(bookmark.page);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg text-accent">🔖 {bookmark.title}</div>
            <div className="truncate text-xs text-muted">
              {bookmark.bookTitle} · закладка на стр. {bookmark.page}
            </div>
          </div>
          <Link href={`/books/${bookmark.bookId}?page=${page}`} className="btn">
            Открыть книгу
          </Link>
          <button className="btn" onClick={onClose}>
            ✕ Закрыть
          </button>
        </div>
        <PdfPane
          bookId={bookmark.bookId}
          page={page}
          onPageChange={setPage}
          toolbar={
            page !== bookmark.page ? (
              <button className="btn ml-2" onClick={() => setPage(bookmark.page)}>
                ↩ к закладке (стр. {bookmark.page})
              </button>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function PinEditor({
  pin,
  index,
  onBack,
  onPatch,
  onDelete,
  onNewNote,
  bookmarks,
  onRead,
}: {
  pin: PinDto;
  index: number;
  onBack: () => void;
  onPatch: (patch: Partial<PinDto>) => void;
  onDelete: () => void;
  onNewNote: () => void;
  bookmarks: BookmarkDto[];
  onRead: (b: BookmarkDto) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const linked = pin.bookmarkIds.map((id) => bookmarks.find((b) => b.id === id)).filter((b): b is BookmarkDto => !!b);

  async function toggleBookmark(entryId: number) {
    const has = pin.bookmarkIds.includes(entryId);
    onPatch({ bookmarkIds: has ? pin.bookmarkIds.filter((x) => x !== entryId) : [...pin.bookmarkIds, entryId] });
    const res = await togglePinBookmark(pin.id, entryId);
    // Сервер ответил иначе (закладки уже нет и т. п.) — возвращаем прежнее состояние.
    if (res === null) onPatch({ bookmarkIds: pin.bookmarkIds });
  }

  const q = query.trim().toLowerCase();
  const shown = q ? bookmarks.filter((b) => `${b.title} ${b.bookTitle} ${b.tags} ${b.page}`.toLowerCase().includes(q)) : bookmarks;

  const patchNote = (id: number, patch: Partial<PinNoteDto>) => onPatch({ notes: pin.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <button className="btn" onClick={onBack}>
          ← Все пины
        </button>
        <span className="ml-auto text-sm text-muted">Пин {index + 1}</span>
        <button className="btn btn-danger" onClick={onDelete} title="Удалить пин">
          🗑
        </button>
      </div>

      <PinPhoto pin={pin} onPatch={onPatch} />

      <input
        value={pin.title}
        maxLength={MAP_LIMITS.pinTitle}
        onChange={(e) => onPatch({ title: e.target.value })}
        onBlur={() => void updatePin(pin.id, pin.title, pin.color)}
        placeholder="Название пина (таверна, руины, логово…)"
        className="input w-full"
        autoFocus={!pin.title}
      />

      <div className="flex flex-wrap gap-1.5">
        {PIN_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Цвет ${c}`}
            onClick={() => {
              onPatch({ color: c });
              void updatePin(pin.id, pin.title, c);
            }}
            className={`h-6 w-6 rounded-full border-2 ${pin.color === c ? "border-white" : "border-transparent"}`}
            style={{ background: c }}
          />
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base text-accent">Закладки из книг ({linked.length})</h3>
          <button className={`btn ${picking ? "border-accent" : ""}`} onClick={() => setPicking((v) => !v)}>
            {picking ? "Готово" : "＋ Прикрепить"}
          </button>
        </div>

        {linked.length === 0 && !picking && <p className="text-sm text-muted">Прикрепите страницы книг, чтобы читать их прямо отсюда.</p>}

        {linked.map((b) => (
          <div key={b.id} className="card flex items-center gap-2 p-2">
            <button className="min-w-0 flex-1 text-left" onClick={() => onRead(b)} title="Читать страницу">
              <div className="truncate text-sm text-accent hover:underline">📖 {b.title}</div>
              <div className="truncate text-xs text-muted">
                {b.bookTitle} · стр. {b.page}
              </div>
            </button>
            <button className="btn" onClick={() => onRead(b)}>
              Читать
            </button>
            <button className="btn btn-danger" onClick={() => void toggleBookmark(b.id)} title="Открепить">
              ✕
            </button>
          </div>
        ))}

        {picking && (
          <div className="card space-y-2 p-2">
            {bookmarks.length === 0 ? (
              <p className="text-sm text-muted">
                В этом мире ещё нет закладок на страницы книг. Откройте книгу в разделе «Книги» и нажмите <kbd>B</kbd>, чтобы сделать закладку.
              </p>
            ) : (
              <>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по закладкам и книгам…" className="input w-full text-sm" />
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {shown.map((b) => {
                    const on = pin.bookmarkIds.includes(b.id);
                    return (
                      <li key={b.id}>
                        <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${on ? "border-accent bg-panel-2" : "border-border hover:border-accent"}`}>
                          <input type="checkbox" checked={on} onChange={() => void toggleBookmark(b.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{b.title}</span>
                            <span className="block truncate text-xs text-muted">
                              {b.bookTitle} · стр. {b.page}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="p-2 text-sm text-muted">Ничего не найдено</li>}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display text-base text-accent">Записи ({pin.notes.length})</h3>
        <button className="btn btn-primary" onClick={onNewNote}>
          ＋ Запись
        </button>
      </div>

      {pin.notes.length === 0 && <p className="text-sm text-muted">Записей нет. Добавьте сколько нужно: что здесь произошло, кто живёт, какие тайны и зацепки.</p>}

      {pin.notes.map((n) => (
        <div key={n.id} className="card space-y-2 p-2">
          <div className="flex gap-1">
            <input
              value={n.title}
              maxLength={MAP_LIMITS.noteTitle}
              onChange={(e) => patchNote(n.id, { title: e.target.value })}
              onBlur={() => void updatePinNote(n.id, n.title, n.body)}
              placeholder="Заголовок записи"
              className="input min-w-0 flex-1 text-sm"
            />
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm("Удалить запись?")) return;
                onPatch({ notes: pin.notes.filter((x) => x.id !== n.id) });
                void deletePinNote(n.id);
              }}
              title="Удалить запись"
            >
              ✕
            </button>
          </div>
          <textarea
            value={n.body}
            maxLength={MAP_LIMITS.noteBody}
            onChange={(e) => patchNote(n.id, { body: e.target.value })}
            onBlur={() => void updatePinNote(n.id, n.title, n.body)}
            rows={6}
            placeholder="Детали истории, сюжета, секреты…"
            className="input w-full resize-y text-sm"
          />
        </div>
      ))}
      <p className="text-xs text-muted">Изменения сохраняются автоматически, когда вы переходите к другому полю.</p>
    </div>
  );
}

/** Фото пина: выбирается файл, браузер обрезает его до квадрата 256 px и загружает. */
function PinPhoto({ pin, onPatch }: { pin: PinDto; onPatch: (patch: Partial<PinDto>) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await resizeToSquare(file);
      const res = await fetch(`/api/maps/pins/${pin.id}/photo`, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
      const json = (await res.json().catch(() => ({}))) as { photo?: string; error?: string };
      if (!res.ok || !json.photo) throw new Error(json.error ?? `Ошибка ${res.status}`);
      onPatch({ photo: json.photo });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      {pin.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(pin)} alt="" className="h-16 w-16 rounded-full object-cover" style={{ border: `3px solid ${pin.color}` }} />
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border text-2xl text-muted">📷</span>
      )}
      <div className="flex flex-col items-start gap-1">
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Загружаю…" : pin.photo ? "Заменить фото" : "📷 Фото на пин"}
        </button>
        {pin.photo && (
          <button
            className="text-xs text-muted hover:text-text"
            onClick={() => {
              onPatch({ photo: null });
              void removePinPhoto(pin.id);
            }}
          >
            Убрать фото
          </button>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  );
}
