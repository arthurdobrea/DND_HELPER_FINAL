import { normalizeSpellName } from "./spell-names";

/** Найденное на странице PDF упоминание заклинания: диапазон текста в текстовом слое + ключ каталога. */
export type SpellRef = { range: Range; key: string; name: string };

let namesPromise: Promise<Record<string, string>> | null = null;

/** Карта «название → ключ заклинания» (один запрос на всё время работы страницы). */
export function loadSpellNames(): Promise<Record<string, string>> {
  namesPromise ??= fetch("/api/spells/names")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => {
      namesPromise = null;
      return {};
    });
  return namesPromise;
}

const BRACKET_RE = /\[([^[\]]{2,60})\]/g;

/**
 * Ищет в текстовом слое ОДНОЙ страницы упоминания вида «волшебная рука [mage hand]»
 * и оставляет только те, название в скобках которых есть в каталоге заклинаний.
 * Диапазон охватывает скобки вместе с названием (в т.ч. если оно разбито на несколько фрагментов текста).
 */
export function findSpellRefs(layer: HTMLElement, names: Record<string, string>): SpellRef[] {
  const nodes: { node: Text; start: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      nodes.push({ node: n as Text, start: text.length });
      text += (n as Text).data;
    } else if ((n as Element).tagName === "BR") {
      text += " "; // перенос строки внутри скобок
    }
  }

  const locate = (offset: number, end: boolean) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const { node, start } = nodes[i];
      if (offset > start || (offset === start && !end)) return { node, offset: Math.min(offset - start, node.data.length) };
    }
    return null;
  };

  const refs: SpellRef[] = [];
  for (const m of text.matchAll(BRACKET_RE)) {
    // В SRD у «Tasha's Hideous Laughter» нет имени автора — пробуем и без него.
    const owner = m[1].trim().match(/^\S+['’]s\s+(.+)$/);
    const key = names[normalizeSpellName(m[1])] ?? (owner && names[normalizeSpellName(owner[1])]);
    if (!key) continue;
    const from = locate(m.index, false);
    const to = locate(m.index + m[0].length, true);
    if (!from || !to) continue;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    refs.push({ range, key, name: m[1].trim() });
  }
  return refs;
}

/** Подсветка найденных упоминаний. Без поддержки Custom Highlight API просто ничего не рисуем (всплывающее окно работает и так). */
export function paintSpellRefs(refs: SpellRef[]) {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
  if (refs.length === 0) CSS.highlights.delete("spell-ref");
  else CSS.highlights.set("spell-ref", new Highlight(...refs.map((r) => r.range)));
}

/** Ссылка под курсором: попадание по прямоугольникам диапазона (с небольшим запасом). */
export function refAtPoint(refs: SpellRef[], x: number, y: number): { ref: SpellRef; rect: DOMRect } | null {
  const pad = 2;
  for (const ref of refs) {
    for (const r of ref.range.getClientRects()) {
      if (x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return { ref, rect: r };
    }
  }
  return null;
}
