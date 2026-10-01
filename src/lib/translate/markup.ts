/**
 * Разбор текста Open5e на «единицы перевода». Переводчик получает по одной фразе, а разметка
 * (абзацы, маркеры списков, жирный заголовок в начале строки, ячейки таблиц) собирается обратно без потерь.
 */
export type Plan = {
  /** Английские фразы, которые нужно перевести. */
  units: string[];
  /** Собирает итоговый текст из переводов units (в том же порядке). */
  build: (translated: string[]) => string;
};

const HAS_WORDS = /[A-Za-z]{2,}/;
const TABLE_LINE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^[\s|:-]+$/;
const LIST_PREFIX = /^(\s*(?:[-*•+]\s+|\d+[.)]\s+|#{1,6}\s+))/;
// Жирный заголовок в начале строки: «**Nimble Escape.** Остальной текст»
const LEADING_BOLD = /^(\*\*)([^*\n]+?)(\*\*)(\s*)/;

type Part = string | { u: number; lead: string; trail: string };

export function plan(text: string): Plan {
  const units: string[] = [];
  const parts: Part[] = [];

  const unit = (raw: string) => {
    const core = raw.trim();
    if (!HAS_WORDS.test(core)) {
      parts.push(raw);
      return;
    }
    units.push(core);
    parts.push({ u: units.length - 1, lead: raw.slice(0, raw.length - raw.trimStart().length), trail: raw.slice(raw.trimEnd().length) });
  };

  // В данных Open5e переводы строк часто записаны буквальным текстом «\n» — превращаем в настоящие, чтобы
  // абзацы и строки таблиц разбирались отдельно.
  const lines = text.replace(/\\n/g, "\n").replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, li) => {
    if (li > 0) parts.push("\n");

    if (TABLE_LINE.test(line)) {
      if (TABLE_SEPARATOR.test(line)) {
        parts.push(line);
        return;
      }
      line.split("|").forEach((cell, ci) => {
        if (ci > 0) parts.push("|");
        unit(cell);
      });
      return;
    }

    let rest = line;
    const prefix = LIST_PREFIX.exec(rest);
    if (prefix) {
      parts.push(prefix[1]);
      rest = rest.slice(prefix[1].length);
    }
    const bold = LEADING_BOLD.exec(rest);
    if (bold && rest.length > bold[0].length) {
      // Заголовок абзаца переводим отдельно и оборачиваем в ** заново.
      parts.push(bold[1]);
      unit(bold[2]);
      parts.push(bold[3] + bold[4]);
      rest = rest.slice(bold[0].length);
    }
    unit(rest);
  });

  return {
    units,
    build: (tr) => parts.map((p) => (typeof p === "string" ? p : p.lead + (tr[p.u] ?? "") + p.trail)).join(""),
  };
}
