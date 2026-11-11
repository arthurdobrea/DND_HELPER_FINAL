import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import { ABILITY_KEYS, ABILITY_LABELS, SKILLS, mod, type AbilityKey, type CharacterSheet, type SkillKey } from "@/lib/character";
import { xpForCr } from "@/lib/encounter";
import { profByCr, skillKey } from "@/lib/npc";
import type { Monster, NamedDesc } from "@/lib/open5e";
import { cleanText, loadFonts, wrap } from "@/lib/shop-pdf";
import { STAT_LABELS, creatureLineRu, formatSpeedRu } from "@/lib/translate/static";

/** Дополнительный раздел листа: предыстория, мотивация, характер и т. п. */
export type NpcPdfExtra = { title: string; text: string };

const A4 = { w: 595.28, h: 841.89 };
const M = 34;
const FOOTER = 22;
const INK = rgb(0.1, 0.09, 0.08);
const MUTED = rgb(0.42, 0.38, 0.34);
const ACCENT = rgb(0.55, 0.13, 0.1);
const RULE = rgb(0.72, 0.66, 0.58);
const FILL = rgb(0.975, 0.96, 0.93);
const WHITE = rgb(1, 1, 1);

const SCORE: Record<AbilityKey, "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"> = {
  str: "strength",
  dex: "dexterity",
  con: "constitution",
  int: "intelligence",
  wis: "wisdom",
  cha: "charisma",
};

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const plainNum = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Разделы листа из полей NPC (пустые пропускаются). */
export function sheetExtras(s: Partial<CharacterSheet>, skip: { backstory?: boolean; motivation?: boolean } = {}): NpcPdfExtra[] {
  const list: [string, string | undefined][] = [
    ["Мотивация", skip.motivation ? undefined : s.motivation],
    ["Предыстория", skip.backstory ? undefined : s.backstory],
    ["Внешность", s.appearance],
    ["Черты характера", s.personality],
    ["Идеалы", s.ideals],
    ["Привязанности", s.bonds],
    ["Слабости", s.flaws],
    ["Союзники и организации", s.allies],
    ["Снаряжение", s.equipment],
    ["Сокровища", s.treasure],
  ];
  return list.filter(([, t]) => t && t.trim()).map(([title, text]) => ({ title, text: text!.trim() }));
}

type Run = { text: string; font: PDFFont; color?: Color };

/** Перенос строки из нескольких кусков разными шрифтами («Название.» жирным + описание обычным). */
function wrapRuns(runs: Run[], size: number, maxW: number): Run[][] {
  const lines: Run[][] = [];
  let line: Run[] = [];
  let w = 0;
  const flush = () => {
    lines.push(line);
    line = [];
    w = 0;
  };
  for (const r of runs) {
    r.text.split("\n").forEach((para, pi) => {
      if (pi > 0) flush();
      for (const word of para.split(" ").filter(Boolean)) {
        const ww = r.font.widthOfTextAtSize(word, size);
        const sp = line.length ? r.font.widthOfTextAtSize(" ", size) : 0;
        if (line.length && w + sp + ww > maxW) flush();
        if (!line.length && ww > maxW) {
          const pieces = wrap(word, r.font, size, maxW);
          pieces.slice(0, -1).forEach((p) => lines.push([{ ...r, text: p }]));
          const last = pieces[pieces.length - 1] ?? "";
          line = [{ ...r, text: last }];
          w = r.font.widthOfTextAtSize(last, size);
          continue;
        }
        line.push({ ...r, text: (line.length ? " " : "") + word });
        w += (line.length > 1 ? sp : 0) + ww;
      }
    });
  }
  if (line.length) lines.push(line);
  return lines;
}

/**
 * PDF «лист NPC» в духе листа персонажа: шапка с опасностью, плашки КД/хитов/скорости,
 * блоки характеристик, спасброски и навыки с отметками владения, справа — особенности и действия.
 */
export async function buildNpcPdf(opts: { m: Monster; extras?: NpcPdfExtra[] }): Promise<Uint8Array> {
  const { m } = opts;
  const [regularBytes, boldBytes, italicBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const italic = await doc.embedFont(italicBytes, { subset: true });
  const name = cleanText(m.name) || "Без имени";
  doc.setTitle(`${name} — лист NPC`);
  doc.setCreator("DnD Helper");
  doc.setProducer("DnD Helper");

  const contentW = A4.w - M * 2;
  const bottom = M + FOOTER;
  let page!: PDFPage;
  let y = 0;
  const col = { x: M, w: contentW };
  const newPage = () => {
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - M;
  };
  /** Места мало — новая страница; продолжение идёт уже на всю ширину. */
  const ensure = (h: number) => {
    if (y - h < bottom) {
      newPage();
      col.x = M;
      col.w = contentW;
    }
  };
  const textAt = (p: PDFPage, t: string, x: number, top: number, size: number, font: PDFFont, color: Color = INK) => {
    if (t) p.drawText(t, { x, y: top - size, size, font, color });
  };
  const centered = (p: PDFPage, t: string, cx: number, top: number, size: number, font: PDFFont, color: Color = INK) =>
    textAt(p, t, cx - font.widthOfTextAtSize(t, size) / 2, top, size, font, color);
  /** Подпись, ужатая до ширины (длинные слова в узких плашках). */
  const fit = (t: string, font: PDFFont, size: number, maxW: number) => {
    let s = size;
    while (s > 5 && font.widthOfTextAtSize(t, s) > maxW) s -= 0.25;
    return s;
  };
  const box = (p: PDFPage, x: number, top: number, w: number, h: number, fill: Color = FILL, border: Color = RULE, thickness = 0.8) =>
    p.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: border, borderWidth: thickness });

  const score = (k: AbilityKey) => Number(m[SCORE[k]]) || 10;
  const cr = typeof m.cr === "number" ? m.cr : parseFloat(m.challenge_rating) || 0;
  const pb = profByCr(cr);

  // Навыки существа → ключи листа
  const skillVals = new Map<SkillKey, number>();
  for (const [k, v] of Object.entries(m.skills ?? {})) {
    const key = skillKey(k);
    if (key && typeof v === "number") skillVals.set(key, v);
  }
  const perception = skillVals.get("perception") ?? mod(score("wis"));
  const passiveMatch = /(?:passive perception|пассивн\S* внимательност\S*)\s*(\d+)/i.exec(m.senses ?? "");
  const passive = passiveMatch ? Number(passiveMatch[1]) : 10 + perception;

  newPage();
  const first = page;

  // ================= Шапка =================
  const badgeW = 132;
  const nameLines = wrap(name, bold, 22, contentW - badgeW - 12);
  const top0 = y;
  for (const l of nameLines) {
    textAt(page, l, M, y, 22, bold, ACCENT);
    y -= 26;
  }
  const line = cleanText(creatureLineRu(m));
  for (const l of wrap(line, italic, 10, contentW - badgeW - 12)) {
    textAt(page, l, M, y, 10, italic, MUTED);
    y -= 13;
  }
  // Плашка опасности справа
  const badgeH = 46;
  box(page, A4.w - M - badgeW, top0, badgeW, badgeH, FILL, ACCENT, 1.2);
  const bcx = A4.w - M - badgeW / 2;
  centered(page, "ОПАСНОСТЬ", bcx, top0 - 5, 6.5, bold, MUTED);
  centered(page, m.challenge_rating || String(cr), bcx, top0 - 13, 16, bold, ACCENT);
  centered(page, `${plainNum(xpForCr(cr))} опыта · БМ ${signed(pb)}`, bcx, top0 - 33, 7.5, regular, MUTED);
  y = Math.min(y, top0 - badgeH) - 6;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1.6, color: ACCENT });
  y -= 10;

  // ================= Плашки боя =================
  const stats: { label: string; value: string; sub?: string; blank?: boolean }[] = [
    { label: "КЛАСС ДОСПЕХА", value: String(m.armor_class), sub: m.armor_desc ? cleanText(m.armor_desc) : undefined },
    { label: "ИНИЦИАТИВА", value: signed(mod(score("dex"))) },
    { label: "СКОРОСТЬ", value: cleanText(formatSpeedRu(m.speed)) || "—" },
    { label: "МАКС. ХИТЫ", value: String(m.hit_points), sub: m.hit_dice || undefined },
    { label: "ТЕКУЩИЕ ХИТЫ", value: "", blank: true },
    { label: "БОНУС МАСТЕРСТВА", value: signed(pb) },
    { label: "ПАСС. ВНИМАТЕЛЬНОСТЬ", value: String(passive) },
  ];
  const sGap = 6;
  const sW = (contentW - sGap * (stats.length - 1)) / stats.length;
  const sH = 50;
  stats.forEach((s, i) => {
    const x = M + i * (sW + sGap);
    box(page, x, y, sW, sH, s.blank ? WHITE : FILL);
    const cx = x + sW / 2;
    centered(page, s.label, cx, y - 5, fit(s.label, bold, 6, sW - 6), bold, MUTED);
    if (!s.blank) {
      const vs = fit(s.value, bold, 16, sW - 8);
      centered(page, s.value, cx, y - 15 - (16 - vs) / 2, vs, bold);
    }
    if (s.sub) centered(page, s.sub, cx, y - 38, fit(s.sub, regular, 7, sW - 6), regular, MUTED);
  });
  y -= sH + 10;

  // ================= Характеристики =================
  const aGap = 8;
  const aW = (contentW - aGap * 5) / 6;
  const aH = 62;
  ABILITY_KEYS.forEach((k, i) => {
    const x = M + i * (aW + aGap);
    const cx = x + aW / 2;
    box(page, x, y, aW, aH, FILL, RULE, 1);
    const lbl = ABILITY_LABELS[k].full.toUpperCase();
    centered(page, lbl, cx, y - 5, fit(lbl, bold, 7, aW - 6), bold, MUTED);
    centered(page, signed(mod(score(k))), cx, y - 16, 20, bold);
    page.drawEllipse({ x: cx, y: y - aH + 2, xScale: 15, yScale: 9, color: WHITE, borderColor: RULE, borderWidth: 1 });
    centered(page, String(score(k)), cx, y - aH + 7, 9, bold);
  });
  y -= aH + 18;

  // ================= Левая колонка: спасброски, навыки, чувства, языки =================
  const leftW = 172;
  const colGap = 14;
  let yl = y;
  const panel = (title: string, rows: { prof: boolean; value: number; label: string; note?: string }[]) => {
    const rowH = 12.2;
    const h = 18 + rows.length * rowH + 4;
    box(first, M, yl, leftW, h, WHITE);
    textAt(first, title.toUpperCase(), M + 8, yl - 6, 7.5, bold, ACCENT);
    let ry = yl - 19;
    for (const r of rows) {
      const cy = ry - 4.2;
      first.drawCircle({ x: M + 12, y: cy, size: 3, color: r.prof ? INK : WHITE, borderColor: INK, borderWidth: 0.7 });
      const v = signed(r.value);
      textAt(first, v, M + 40 - bold.widthOfTextAtSize(v, 8.5), ry, 8.5, bold);
      first.drawLine({ start: { x: M + 20, y: ry - 9.6 }, end: { x: M + 41, y: ry - 9.6 }, thickness: 0.4, color: RULE });
      textAt(first, r.label, M + 46, ry, 8.5, regular);
      if (r.note) textAt(first, r.note, M + leftW - 8 - regular.widthOfTextAtSize(r.note, 7), ry + 0.5, 7, regular, MUTED);
      ry -= rowH;
    }
    yl -= h + 8;
  };
  panel(
    STAT_LABELS.saves,
    ABILITY_KEYS.map((k) => {
      const v = m[`${SCORE[k]}_save` as keyof Monster] as number | null | undefined;
      return { prof: v != null, value: v ?? mod(score(k)), label: ABILITY_LABELS[k].full };
    }),
  );
  panel(
    STAT_LABELS.skills,
    SKILLS.map((s) => {
      const v = skillVals.get(s.key);
      return { prof: v != null, value: v ?? mod(score(s.ability)), label: s.label, note: ABILITY_LABELS[s.ability].short };
    }),
  );
  const textPanel = (title: string, body: string) => {
    const lines = wrap(cleanText(body) || "—", regular, 8.5, leftW - 16);
    const h = 18 + lines.length * 11 + 4;
    if (yl - h < bottom) return;
    box(first, M, yl, leftW, h, WHITE);
    textAt(first, title.toUpperCase(), M + 8, yl - 6, 7.5, bold, ACCENT);
    let ly = yl - 19;
    for (const l of lines) {
      textAt(first, l, M + 8, ly, 8.5, regular);
      ly -= 11;
    }
    yl -= h + 8;
  };
  textPanel(STAT_LABELS.senses, m.senses || `пассивная Внимательность ${passive}`);
  textPanel(STAT_LABELS.languages, m.languages || "—");

  // ================= Правая колонка (дальше — на всю ширину) =================
  col.x = M + leftW + colGap;
  col.w = contentW - leftW - colGap;

  const SIZE = 9;
  const LEAD = 11.6;
  const paragraph = (runs: Run[], after = 4) => {
    const lines = wrapRuns(runs, SIZE, col.w);
    lines.forEach((ln, i) => {
      // Не оставляем одну строку внизу страницы, если абзац длиннее
      ensure(i === 0 && lines.length > 1 ? LEAD * 2 : LEAD);
      let x = col.x;
      for (const r of ln) {
        page.drawText(r.text, { x, y: y - SIZE, size: SIZE, font: r.font, color: r.color ?? INK });
        x += r.font.widthOfTextAtSize(r.text, SIZE);
      }
      y -= LEAD;
    });
    y -= after;
  };
  const heading = (title: string) => {
    ensure(20 + LEAD * 2);
    y -= 4;
    textAt(page, title.toUpperCase(), col.x, y, 10.5, bold, ACCENT);
    y -= 14;
    page.drawLine({ start: { x: col.x, y }, end: { x: col.x + col.w, y }, thickness: 0.8, color: ACCENT });
    y -= 6;
  };
  const entries = (items: NamedDesc[] | null | undefined) => {
    for (const a of items ?? []) {
      const n = cleanText(a.name);
      paragraph([
        { text: n ? `${n}. ` : "", font: bold },
        { text: cleanText(a.desc), font: regular },
      ]);
    }
  };

  // Защитные свойства
  const props: [string, string | undefined][] = [
    [STAT_LABELS.vulnerabilities, m.damage_vulnerabilities],
    [STAT_LABELS.resistances, m.damage_resistances],
    [STAT_LABELS.immunities, m.damage_immunities],
    [STAT_LABELS.conditionImmunities, m.condition_immunities],
  ];
  const shown = props.filter(([, v]) => v && v.trim());
  if (shown.length) {
    heading("Защита");
    for (const [l, v] of shown) paragraph([{ text: `${l}: `, font: bold, color: ACCENT }, { text: cleanText(v!), font: regular }], 2);
    y -= 2;
  }

  if (m.special_abilities?.length) {
    heading("Особенности");
    entries(m.special_abilities);
  }
  if (m.actions?.length) {
    heading(STAT_LABELS.actions);
    entries(m.actions);
  }
  if (m.bonus_actions?.length) {
    heading(STAT_LABELS.bonusActions);
    entries(m.bonus_actions);
  }
  if (m.reactions?.length) {
    heading(STAT_LABELS.reactions);
    entries(m.reactions);
  }
  if (m.legendary_actions?.length) {
    heading(STAT_LABELS.legendaryActions);
    if (m.legendary_desc) paragraph([{ text: cleanText(m.legendary_desc), font: italic, color: MUTED }]);
    entries(m.legendary_actions);
  }
  for (const ex of opts.extras ?? []) {
    heading(ex.title);
    paragraph([{ text: cleanText(ex.text), font: regular }]);
  }

  // Линованное поле для заметок мастера (до 10 строк, если на странице есть место)
  if (y - bottom > 70) {
    heading("Заметки");
    for (let n = 0; n < 10 && y - 16 > bottom; n++) {
      y -= 16;
      page.drawLine({ start: { x: col.x, y }, end: { x: col.x + col.w, y }, thickness: 0.4, color: RULE });
    }
  }

  // ================= Подвал =================
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${name} · лист NPC · стр. ${i + 1} из ${pages.length}`;
    const w = regular.widthOfTextAtSize(label, 7.5);
    p.drawText(label, { x: (A4.w - w) / 2, y: M - 8, size: 7.5, font: regular, color: MUTED });
  });

  return doc.save();
}

/** Имя файла без запрещённых символов. */
export const pdfFileName = (name: string) => `${(name || "NPC").replace(/[\\/:*?"<>|]+/g, "_").trim() || "NPC"}.pdf`;

export function pdfResponse(bytes: Uint8Array, name: string): Response {
  const file = pdfFileName(name);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="npc.pdf"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
}
