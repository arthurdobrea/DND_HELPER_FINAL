import fs from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/** Вещь для PDF: всё уже подготовлено (подписи на русском, цена в золотых). */
export type ShopPdfItem = {
  name: string;
  category: string;
  /** Строка под названием: редкость, настройка, остаток. */
  meta: string;
  /** Игровые характеристики (урон, КД) — необязательно. */
  stats: string;
  price: number | null;
  priceText: string;
  desc: string;
};

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const FOOTER = 34;
const INK = rgb(0.1, 0.09, 0.08);
const MUTED = rgb(0.4, 0.37, 0.33);
const ACCENT = rgb(0.61, 0.17, 0.14);
const RULE = rgb(0.82, 0.78, 0.72);

// Шрифты лежат в public/fonts (попадают в Docker-образ вместе с public/). DejaVu — с кириллицей.
const fontDir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts");
let fontCache: Promise<[Uint8Array, Uint8Array, Uint8Array]> | undefined;
const loadFonts = () =>
  (fontCache ??= Promise.all(
    ["DejaVuSansCondensed.ttf", "DejaVuSansCondensed-Bold.ttf", "DejaVuSansCondensed-Oblique.ttf"].map(
      async (f) => new Uint8Array(await fs.readFile(path.join(/*turbopackIgnore: true*/ fontDir(), f))),
    ),
  ) as Promise<[Uint8Array, Uint8Array, Uint8Array]>);

// Классы символов собраны из кодов, а не из литералов: невидимые символы в исходниках легко потерять.
const chars = (...codes: number[]) => codes.map((c) => String.fromCharCode(c)).join("");
const INVISIBLE = new RegExp(`[${chars(0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff, 0xad)}]`, "g");
const VARIATION_SELECTOR = new RegExp(chars(0xfe0f), "g");
const SPACES = new RegExp(`[ ${chars(0xa0)}]+`, "g");

/**
 * Markdown-таблицы («| Кубик | Результат |») в PDF превращаем в строки-пункты: «• d100 · Результат».
 * Строки-разделители («|---|---|») отбрасываем.
 */
function flattenTables(s: string): string {
  return s
    .split("\n")
    .map((line) => {
      if (!/^\s*\|.*\|\s*$/.test(line)) return line;
      if (/^[\s|:-]+$/.test(line)) return null;
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      return cells.length ? `• ${cells.join(" · ")}` : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** Убирает markdown-разметку Open5e, эмодзи и невидимые символы, которых нет в шрифте. */
export function cleanText(s: string): string {
  // В данных Open5e переводы строк часто приходят буквальным текстом «\n».
  return flattenTables(s.replace(/\r/g, "").replace(/\\n/g, "\n"))
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/(^|[\s(])_([\s\S]+?)_(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/^#+\s*/gm, "")
    .replace(INVISIBLE, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(VARIATION_SELECTOR, "")
    .replace(/\t/g, " ")
    .replace(SPACES, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Перенос по словам; слишком длинное слово режется по символам. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  const width = (t: string) => font.widthOfTextAtSize(t, size);
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ").filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (width(test) <= maxWidth) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      let rest = word;
      while (width(rest) > maxWidth) {
        let n = rest.length - 1;
        while (n > 1 && width(rest.slice(0, n)) > maxWidth) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) out.push(line);
  }
  return out;
}

export async function buildShopPdf(opts: { worldName: string; items: ShopPdfItem[]; date: Date }): Promise<Uint8Array> {
  const [regularBytes, boldBytes, italicBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const italic = await doc.embedFont(italicBytes, { subset: true });
  doc.setTitle(`Магазин артефактов — ${opts.worldName}`);
  doc.setCreator("DnD Helper");
  doc.setProducer("DnD Helper");

  const contentW = A4.w - MARGIN * 2;
  const bottom = MARGIN + FOOTER;
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - MARGIN;
  };
  const ensure = (h: number) => {
    if (y - h < bottom) newPage();
  };
  const text = (t: string, x: number, size: number, font: PDFFont, color = INK) =>
    t && page.drawText(t, { x, y: y - size, size, font, color });

  newPage();

  // ---------- Заголовок ----------
  text("Магазин артефактов", MARGIN, 24, bold, ACCENT);
  y -= 32;
  const sub = `${opts.worldName} · ${opts.date.toLocaleDateString("ru-RU")} · позиций: ${opts.items.length}`;
  for (const l of wrap(sub, regular, 10, contentW)) {
    text(l, MARGIN, 10, regular, MUTED);
    y -= 14;
  }
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 1.5, color: ACCENT });
  y -= 14;

  // ---------- Список ----------
  const NAME = 12;
  const META = 8.5;
  const BODY = 9.5;
  const LEAD = 12.5;
  let category: string | null = null;

  for (const item of opts.items) {
    const priceW = bold.widthOfTextAtSize(item.priceText, NAME);
    const nameLines = wrap(cleanText(item.name), bold, NAME, contentW - priceW - 14);
    const metaLines = item.meta ? wrap(cleanText(item.meta), italic, META, contentW) : [];
    const statLines = item.stats ? wrap(cleanText(item.stats), regular, BODY, contentW) : [];
    const descLines = wrap(cleanText(item.desc), regular, BODY, contentW);

    // Заголовок вещи не оставляем в конце страницы без текста: нужно место под него и две строки описания.
    const head = nameLines.length * 15 + metaLines.length * 11 + statLines.length * LEAD;
    const firstChunk = head + Math.min(2, descLines.length) * LEAD + 4;
    const newCategory = item.category !== category;
    ensure(firstChunk + (newCategory ? 34 : 0));

    if (newCategory) {
      category = item.category;
      y -= 6;
      text(item.category, MARGIN, 13, bold, ACCENT);
      y -= 18;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 0.6, color: ACCENT });
      y -= 8;
    }

    // Название слева, цена справа в той же строке
    text(item.priceText, A4.w - MARGIN - priceW, NAME, bold, item.price === null ? MUTED : ACCENT);
    for (const l of nameLines) {
      text(l, MARGIN, NAME, bold);
      y -= 15;
    }
    for (const l of metaLines) {
      text(l, MARGIN, META, italic, MUTED);
      y -= 11;
    }
    for (const l of statLines) {
      text(l, MARGIN, BODY, regular);
      y -= LEAD;
    }
    y -= 1;
    for (const l of descLines) {
      ensure(LEAD);
      text(l, MARGIN, BODY, regular);
      y -= LEAD;
    }

    y -= 5;
    ensure(8);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, thickness: 0.4, color: RULE });
    y -= 9;
  }

  // ---------- Нумерация страниц ----------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Магазин «${opts.worldName}» · стр. ${i + 1} из ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: (A4.w - w) / 2, y: MARGIN - 4, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
