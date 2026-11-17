import Link from "next/link";
import { AutoTranslate } from "./AutoTranslate";
import type { Lang } from "@/lib/translate/view";

/**
 * Строка над карточкой: переключатель RU/EN и состояние перевода
 * (идёт перевод / ошибка / автоперевод выключен).
 */
export function TranslationBar({
  lang,
  hrefRu,
  hrefEn,
  missing,
  enabled,
}: {
  lang: Lang;
  hrefRu: string;
  hrefEn: string;
  missing: string[];
  enabled: boolean;
}) {
  const pill = (active: boolean) =>
    `rounded px-2 py-0.5 text-xs ${active ? "bg-accent text-bg" : "bg-panel-2 text-muted hover:text-text"}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <span className="mr-1 text-xs text-muted">🌐 Язык описания</span>
        <Link href={hrefRu} scroll={false} className={pill(lang === "ru")}>
          RU
        </Link>
        <Link href={hrefEn} scroll={false} className={pill(lang === "en")}>
          EN
        </Link>
      </div>
      {lang === "ru" && missing.length > 0 && enabled && <AutoTranslate texts={missing} />}
      {lang === "ru" && missing.length > 0 && !enabled && (
        <p className="rounded-md border border-border bg-panel-2 px-3 py-2 text-xs text-muted">
          Автоперевод сейчас недоступен — тексты на английском. Сервис перевода не запущен: выполните{" "}
          <code>docker compose up -d</code> (см. README). Через минуту страница попробует снова.
        </p>
      )}
    </div>
  );
}
