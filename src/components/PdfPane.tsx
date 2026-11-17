"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { SpellPopover } from "./SpellPopover";
import { findSpellRefs, loadSpellNames, paintSpellRefs, refAtPoint, type SpellRef } from "@/lib/pdf-spell-refs";

// Воркер должен настраиваться в том же модуле, где рендерятся <Document>/<Page>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/** Пауза перед показом окна при наведении и перед его закрытием, когда курсор ушёл. */
const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 350;

type Popup = { key: string; anchor: { left: number; top: number; bottom: number }; pinned: boolean };

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

type Props = {
  bookId: number;
  page: number;
  onPageChange: (page: number) => void;
  /** Дополнительные элементы в тулбаре (справа от зума). */
  toolbar?: ReactNode;
};

/**
 * Просмотр одной страницы PDF: ←/→ листать, +/− зум, Home/End.
 * Страница управляется снаружи (page/onPageChange).
 */
export default function PdfPane({ bookId, page, onPageChange, toolbar }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageInput, setPageInput] = useState(String(page));
  const [zoomIdx, setZoomIdx] = useState(2);
  const [containerWidth, setContainerWidth] = useState(800);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Заклинания в [скобках] на видимой странице: ищем только на ней, по готовому текстовому слою.
  const [spellNames, setSpellNames] = useState<Record<string, string> | null>(null);
  const refsRef = useRef<SpellRef[]>([]);
  const [popup, setPopup] = useState<Popup | null>(null);
  const popupRef = useRef<Popup | null>(null);
  useEffect(() => {
    popupRef.current = popup;
  }, [popup]);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const file = useMemo(() => ({ url: `/api/books/${bookId}/file` }), [bookId]);

  // Поле номера страницы следует за page, пришедшим снаружи.
  const [shownPage, setShownPage] = useState(page);
  if (page !== shownPage) {
    setShownPage(page);
    setPageInput(String(page));
    setPopup(null);
  }

  useEffect(() => {
    let alive = true;
    loadSpellNames().then((n) => alive && setSpellNames(n));
    return () => {
      alive = false;
      paintSpellRefs([]);
    };
  }, []);

  const scanSpells = useCallback(() => {
    const layer = viewerRef.current?.querySelector<HTMLElement>(".react-pdf__Page__textContent");
    refsRef.current = layer && spellNames ? findSpellRefs(layer, spellNames) : [];
    paintSpellRefs(refsRef.current);
  }, [spellNames]);

  // Названия подгрузились уже после отрисовки страницы — пересканируем её.
  useEffect(() => {
    scanSpells();
  }, [scanSpells]);

  // Новая страница — старые диапазоны больше не актуальны (окно закрывается ниже, при смене страницы).
  useEffect(() => {
    refsRef.current = [];
    paintSpellRefs([]);
  }, [page, bookId]);

  const cancelTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPopup((p) => (p?.pinned ? p : null)), HOVER_CLOSE_MS);
  };

  function onViewerMove(e: React.MouseEvent) {
    const hit = refsRef.current.length ? refAtPoint(refsRef.current, e.clientX, e.clientY) : null;
    e.currentTarget.classList.toggle("cursor-help", !!hit);
    if (!hit) {
      clearTimeout(openTimer.current);
      if (popupRef.current && !popupRef.current.pinned) scheduleClose();
      return;
    }
    clearTimeout(closeTimer.current);
    const cur = popupRef.current;
    if (cur?.key === hit.ref.key || cur?.pinned) return;
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(
      () => setPopup({ key: hit.ref.key, anchor: { left: hit.rect.left, top: hit.rect.top, bottom: hit.rect.bottom }, pinned: false }),
      HOVER_OPEN_MS,
    );
  }

  // Клик по названию закрепляет окно (нужно и на сенсорных экранах); клик мимо — закрывает закреплённое.
  function onViewerClick(e: React.MouseEvent) {
    const hit = refsRef.current.length ? refAtPoint(refsRef.current, e.clientX, e.clientY) : null;
    cancelTimers();
    if (hit) {
      e.preventDefault();
      setPopup({ key: hit.ref.key, anchor: { left: hit.rect.left, top: hit.rect.top, bottom: hit.rect.bottom }, pinned: true });
    } else if (popupRef.current?.pinned) setPopup(null);
  }

  useEffect(() => {
    if (!popup) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setPopup(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [popup]);

  useEffect(() => cancelTimers, []);

  const goTo = useCallback(
    (p: number) => {
      const clamped = Math.min(Math.max(1, p), numPages || p);
      onPageChange(clamped);
      viewerRef.current?.scrollTo({ top: 0 });
    },
    [numPages, onPageChange],
  );

  // Ширина страницы подстраивается под контейнер.
  useEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width - 32));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1);
      else if (e.key === "Home") goTo(1);
      else if (e.key === "End") goTo(numPages);
      else if (e.key === "+" || e.key === "=") setZoomIdx((z) => Math.min(z + 1, ZOOM_STEPS.length - 1));
      else if (e.key === "-") setZoomIdx((z) => Math.max(z - 1, 0));
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, page, numPages]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
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
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value)} className="input w-16 py-1 text-center" />
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
        {toolbar}
      </div>

      <div
        ref={viewerRef}
        className="flex-1 overflow-auto bg-[#0e0c0a] p-4"
        onMouseMove={onViewerMove}
        onMouseLeave={() => {
          clearTimeout(openTimer.current);
          if (popupRef.current && !popupRef.current.pinned) scheduleClose();
        }}
        onClick={onViewerClick}
        onScroll={() => popupRef.current && !popupRef.current.pinned && setPopup(null)}
      >
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            if (page > numPages) goTo(numPages);
          }}
          // Файла книги нет (удалён/не скопирован) — показываем сообщение из error=, а не роняем страницу необработанной ошибкой.
          onLoadError={(e) => console.warn("PDF не открылся:", e.message)}
          onSourceError={(e) => console.warn("PDF не найден:", e.message)}
          loading={<p className="text-center text-muted">Открываю PDF…</p>}
          error={<p className="text-center text-red-400">Не удалось открыть PDF</p>}
          className="flex justify-center"
        >
          <Page
            pageNumber={page}
            width={Math.max(200, containerWidth) * ZOOM_STEPS[zoomIdx]}
            onRenderTextLayerSuccess={scanSpells}
            loading={<div className="h-[80vh]" />}
            className="shadow-2xl"
          />
        </Document>
      </div>
      {popup && (
        <SpellPopover
          key={popup.key}
          spellKey={popup.key}
          anchor={popup.anchor}
          pinned={popup.pinned}
          onClose={() => setPopup(null)}
          onEnter={() => clearTimeout(closeTimer.current)}
          onLeave={() => !popup.pinned && scheduleClose()}
        />
      )}
    </section>
  );
}
