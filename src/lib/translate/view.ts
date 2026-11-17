import { collectTexts, mapEntry, type EntryKindMap } from "./segments";
import { lookupCached, translatable } from "./store";
import { translationEnabled } from "./engine";

export type Lang = "ru" | "en";
export const parseLang = (v: string | string[] | undefined): Lang => (v === "en" ? "en" : "ru");

export type Localized<T> = {
  /** Запись с подставленными русскими текстами (то, что уже есть в кэше). */
  entry: T;
  /** Строки, которых в кэше ещё нет — их нужно перевести (AutoTranslate). */
  missing: string[];
  enabled: boolean;
};

/** Для страниц: мгновенно подставляет переводы из кэша, остальное возвращает списком «осталось перевести». */
export function localize<K extends keyof EntryKindMap>(kind: K, entry: EntryKindMap[K], lang: Lang): Localized<EntryKindMap[K]> {
  const enabled = translationEnabled();
  if (lang === "en") return { entry, missing: [], enabled };
  const texts = translatable(collectTexts(kind, entry));
  const cached = lookupCached(texts);
  return {
    entry: mapEntry(kind, entry, (s) => cached.get(s) ?? s),
    missing: texts.filter((t) => !cached.has(t)),
    enabled,
  };
}

/** То же для нескольких записей сразу (магазин): общий список недостающих строк. */
export function localizeMany<K extends keyof EntryKindMap>(kind: K, entries: EntryKindMap[K][], lang: Lang) {
  const enabled = translationEnabled();
  if (lang === "en") return { entries, missing: [] as string[], enabled };
  const texts = translatable(entries.flatMap((e) => collectTexts(kind, e)));
  const cached = lookupCached(texts);
  return {
    entries: entries.map((e) => mapEntry(kind, e, (s) => cached.get(s) ?? s)),
    missing: texts.filter((t) => !cached.has(t)),
    enabled,
  };
}
