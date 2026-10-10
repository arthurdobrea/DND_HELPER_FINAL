"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pdfjs } from "react-pdf";
import { parseChunk, resetBookParse } from "@/app/parser-actions";
import { planWindows } from "@/lib/parser";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;

const CONCURRENCY = 2;
const RATE_LIMIT_WAIT_MS = 30_000;
const MAX_RETRIES = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = { bookId: number; bookTitle: string; doneStarts: number[]; aiEnabled: boolean; found: { characters: number; items: number } };

/**
 * Запуск разбора всей книги: PDF читается прямо в браузере (текстовый слой), окнами по несколько страниц текст уходит
 * на сервер в Gemini, найденное сохраняется в базе. Уже разобранные окна пропускаются — разбор можно остановить и продолжить.
 */
export default function ParserRunner({ bookId, bookTitle, doneStarts, aiEnabled, found }: Props) {
  const router = useRouter();
  const docRef = useRef<Doc | null>(null);
  const stopRef = useRef(false);
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [localDone, setLocalDone] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  // Счётчики из ответов сервера: не зависят от того, успел ли обновиться серверный рендер страницы.
  const [live, setLive] = useState<{ characters: number; items: number } | null>(null);
  const [skipped, setSkipped] = useState<number[]>([]);
  const shown = live ?? found;

  // Открываем PDF сразу, чтобы знать число страниц и показать «разобрано X из Y».
  useEffect(() => {
    let alive = true;
    const task = pdfjs.getDocument({ url: `/api/books/${bookId}/file` });
    task.promise.then(
      (d) => {
        if (!alive) return;
        docRef.current = d;
        setNumPages(d.numPages);
      },
      (e) => alive && setLoadError(e instanceof Error ? e.message : "Не удалось открыть PDF"),
    );
    return () => {
      alive = false;
      stopRef.current = true;
      void task.destroy();
    };
  }, [bookId]);

  const windows = useMemo(() => planWindows(numPages), [numPages]);
  const doneSet = useMemo(() => new Set([...doneStarts, ...localDone]), [doneStarts, localDone]);
  const doneCount = windows.filter(([s]) => doneSet.has(s)).length;
  const pct = windows.length ? Math.round((doneCount / windows.length) * 100) : 0;

  async function readPages(from: number, to: number) {
    const doc = docRef.current!;
    const out: { page: number; text: string }[] = [];
    for (let n = from; n <= to; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .replace(/ ?\n ?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      out.push({ page: n, text });
    }
    return out;
  }

  async function run() {
    if (!docRef.current) return;
    stopRef.current = false;
    setRunning(true);
    setErrors([]);
    setNote("");
    const queue = windows.filter(([s]) => !doneSet.has(s));
    let next = 0;
    let sinceRefresh = 0;

    async function worker() {
      while (!stopRef.current) {
        const i = next++;
        if (i >= queue.length) return;
        const [from, to] = queue[i];
        try {
          const pages = await readPages(from, to);
          for (let attempt = 0; ; attempt++) {
            const res = await parseChunk(bookId, pages);
            if (res.ok) {
              setLocalDone((d) => [...d, from]);
              setLive(res.totals);
              if (res.skipped.length) setSkipped((s) => [...new Set([...s, ...res.skipped])].sort((a, b) => a - b));
              break;
            }
            if (res.rateLimited && attempt < MAX_RETRIES && !stopRef.current) {
              setNote(`Лимит запросов Gemini — жду ${RATE_LIMIT_WAIT_MS / 1000} с и повторяю…`);
              await sleep(RATE_LIMIT_WAIT_MS);
              setNote("");
              continue;
            }
            setErrors((e) => [...e, `Стр. ${from}–${to}: ${res.error}`]);
            break;
          }
        } catch (e) {
          setErrors((er) => [...er, `Стр. ${from}–${to}: ${e instanceof Error ? e.message : "ошибка чтения PDF"}`]);
        }
        if (++sinceRefresh >= 3) {
          sinceRefresh = 0;
          router.refresh();
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    setNote("");
    router.refresh();
  }

  async function reset() {
    if (!confirm(`Стереть всё найденное в «${bookTitle}» и разобрать заново?`)) return;
    await resetBookParse(bookId);
    setLocalDone([]);
    setLive({ characters: 0, items: 0 });
    setSkipped([]);
    router.refresh();
  }

  const allDone = windows.length > 0 && doneCount >= windows.length;

  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button className="btn" onClick={() => (stopRef.current = true)}>
            ⏹ Остановить
          </button>
        ) : (
          <button className="btn btn-primary" onClick={run} disabled={!aiEnabled || !numPages || allDone}>
            {allDone ? "✓ Книга разобрана" : doneCount > 0 ? `▶ Продолжить (${doneCount} из ${windows.length})` : "▶ Разобрать книгу"}
          </button>
        )}
        {(doneCount > 0 || shown.characters + shown.items > 0) && !running && (
          <button className="btn btn-danger" onClick={reset}>
            ↻ Заново
          </button>
        )}
        <span className="text-sm text-muted">
          {numPages ? `${numPages} стр.` : loadError ? "" : "Открываю PDF…"} · найдено: 🧙 {shown.characters}, 🗡️ {shown.items}
        </span>
      </div>

      {numPages > 0 && (
        <div className="mt-2">
          <div className="h-2 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            Разобрано окон страниц: {doneCount} из {windows.length} ({pct}%){running && " — не закрывайте вкладку, пока идёт разбор"}
          </p>
        </div>
      )}

      {!aiEnabled && (
        <p className="mt-2 text-sm text-amber-400">
          Парсеру нужен ключ Gemini: впишите <code>GEMINI_API_KEY</code> в файл <code>.env</code> и перезапустите приложение (см. README).
        </p>
      )}
      {loadError && <p className="mt-2 text-sm text-red-400">Не удалось открыть PDF: {loadError}</p>}
      {note && <p className="mt-2 text-sm text-amber-400">{note}</p>}
      {skipped.length > 0 && (
        <p className="mt-2 text-xs text-amber-400">
          Gemini не стал читать (фильтр безопасности) и эти страницы пропущены: {skipped.join(", ")}. Остальные страницы окон разобраны; эти можно добавить вручную.
        </p>
      )}
      {errors.length > 0 && (
        <div className="mt-2 text-xs text-red-400">
          <p>Не разобрано (будет повторено при «Продолжить»): {errors.length}</p>
          <ul className="mt-1 max-h-24 list-disc overflow-y-auto pl-4">
            {errors.slice(-8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
