"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Воркер должен настраиваться в том же модуле, где рендерятся <Document>/<Page>.
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

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

  const file = useMemo(() => ({ url: `/api/books/${bookId}/file` }), [bookId]);

  // Поле номера страницы следует за page, пришедшим снаружи.
  const [shownPage, setShownPage] = useState(page);
  if (page !== shownPage) {
    setShownPage(page);
    setPageInput(String(page));
  }

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
  );
}
