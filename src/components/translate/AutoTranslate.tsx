"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { translateSegments, type TranslateResult } from "@/app/actions";

const CHUNK_ITEMS = 25;
const CHUNK_CHARS = 30_000;
/** Одна порция не должна висеть дольше: дальше показываем ошибку и кнопку «Повторить». */
const CHUNK_TIMEOUT_MS = 4 * 60_000;
/** После последней порции страница должна обновиться и убрать баннер; если нет — не крутимся вечно. */
const REFRESH_GRACE_MS = 10_000;

function chunk(texts: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= CHUNK_ITEMS || chars + t.length > CHUNK_CHARS)) {
      out.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(t);
    chars += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Переводит недостающие строки в фоне и обновляет страницу: английский текст сам сменяется русским.
 * Каждая порция сразу попадает в кэш и показывается, не дожидаясь остальных.
 * Бесконечно не крутится: есть таймаут порции, счётчик секунд и проверка, что баннер исчез после обновления.
 */
export function AutoTranslate({ texts, label = "Перевожу на русский…" }: { texts: string[]; label?: string }) {
  const router = useRouter();
  const key = JSON.stringify(texts);
  const startedFor = useRef<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: texts.length });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Секундомер: видно, что процесс жив.
  useEffect(() => {
    if (error) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [error, attempt]);

  useEffect(() => {
    // В dev React запускает эффект дважды — не запускаем один и тот же перевод повторно.
    const run = `${key}#${attempt}`;
    if (startedFor.current === run) return;
    startedFor.current = run;
    setFinished(false);
    const parts = chunk(texts);
    let done = 0;
    (async () => {
      for (const part of parts) {
        // Строки отправляем одной JSON-строкой (см. translateSegments).
        const res: TranslateResult = await withTimeout(translateSegments(JSON.stringify(part)), CHUNK_TIMEOUT_MS).catch((e) => ({
          ok: false as const,
          error: e instanceof Error && e.message === "timeout" ? "Перевод идёт слишком долго (больше 4 минут)" : "Нет связи с сервером",
        }));
        if (!res.ok) {
          setError(res.error);
          return;
        }
        done += part.length;
        setProgress({ done, total: texts.length });
        router.refresh();
      }
      setFinished(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  // Всё переведено и обновлено, а баннер на месте — значит, страница не увидела перевод.
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(
      () => setError("Перевод готов, но страница не обновилась. Обновите страницу (F5)"),
      REFRESH_GRACE_MS,
    );
    return () => clearTimeout(id);
  }, [finished]);

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
        <span className="flex-1">⚠ Не удалось перевести: {error}</span>
        <button className="btn px-2 py-1 text-xs" onClick={() => window.location.reload()}>
          Обновить
        </button>
        <button
          className="btn px-2 py-1 text-xs"
          onClick={() => {
            setError(null);
            setFinished(false);
            setAttempt((a) => a + 1);
          }}
        >
          Повторить
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-panel-2 px-3 py-2 text-sm text-muted">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {label}
      {progress.total > 0 && (
        <span className="text-xs">
          ({progress.done}/{progress.total}) · {elapsed} с
        </span>
      )}
    </div>
  );
}
