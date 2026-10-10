"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { addPin, addPinNote, deletePin, deletePinNote, movePin, setMapPage, updatePin, updatePinNote } from "@/app/map-actions";
import { MAP_LIMITS, PIN_COLORS, type PinDto, type PinNoteDto } from "@/lib/maps";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** Сдвиг курсора (px), после которого нажатие на пин считается перетаскиванием, а не кликом. */
const DRAG_THRESHOLD = 4;

type Props = {
  map: { id: number; title: string; kind: "image" | "pdf"; page: number };
  initialPins: PinDto[];
};

export default function MapViewer({ map, initialPins }: Props) {
  const [pins, setPins] = useState<PinDto[]>(initialPins);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placing, setPlacing] = useState(true);
  const [zoomIdx, setZoomIdx] = useState(2);
  const [page, setPage] = useState(map.page);
  const [numPages, setNumPages] = useState(0);
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
    setPins((ps) => [...ps, { id, x, y, title: "", color: PIN_COLORS[0], notes: [] }]);
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

            {pins.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => onPinDown(e, p)}
                onPointerMove={(e) => onPinMove(e, p)}
                onPointerUp={(e) => onPinUp(e, p)}
                title={pinLabel(p, i)}
                className="absolute z-10 flex -translate-x-1/2 -translate-y-full touch-none cursor-grab flex-col items-center active:cursor-grabbing"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full rounded-br-none border-2 text-xs font-bold text-white shadow-lg ${p.id === selectedId ? "scale-125 border-white" : "border-black/40"}`}
                  style={{ background: p.color, transform: `rotate(45deg) ${p.id === selectedId ? "scale(1.25)" : ""}` }}
                >
                  <span style={{ transform: "rotate(-45deg)" }}>{i + 1}</span>
                </span>
                {p.title.trim() && (
                  <span className="mt-1 max-w-40 truncate rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{p.title}</span>
                )}
              </button>
            ))}
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
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: p.color }}>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{pinLabel(p, i)}</span>
                      <span className="text-xs text-muted">{p.notes.length} зап.</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </aside>
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
}: {
  pin: PinDto;
  index: number;
  onBack: () => void;
  onPatch: (patch: Partial<PinDto>) => void;
  onDelete: () => void;
  onNewNote: () => void;
}) {
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
