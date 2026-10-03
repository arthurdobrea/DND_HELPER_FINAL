import type { CharacterSheet } from "@/lib/character";
import type { StoryKind } from "@/lib/db/schema";

/** Что просит форма заметки: подсказать основной текст или вариант бафа. */
export type StoryAiRequest = {
  characterId: number | null;
  kind: StoryKind;
  target: "body" | "boon";
  title: string;
  subject: string;
  trigger: string;
  /** Уже написанный текст (черновик) — его нужно доработать, а не писать с нуля. */
  draft: string;
  /** Пожелания мастера: тон, детали. */
  wishes: string;
};

export const SYSTEM_PROMPT =
  "Ты помощник мастера настольной игры Dungeons & Dragons 5e. Пиши по-русски, живо и атмосферно, без вступлений, " +
  "без пояснений и без markdown-разметки: только готовый текст, который мастер может зачитать или использовать. " +
  "Не противоречь тому, что известно о герое, и не придумывай то, что ломает баланс игры.";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Собирает запрос по виду заметки и листу героя. Лишнего не отправляем: только нужные поля, с ограничением длины. */
export function buildStoryPrompt(req: StoryAiRequest, hero: CharacterSheet | null, others: string[]): string {
  const lines: string[] = [];

  if (hero) {
    const who = [hero.race, hero.className, hero.level ? `${hero.level} уровень` : "", hero.alignment].filter(Boolean).join(", ");
    lines.push(`Герой: ${hero.name || "без имени"}${who ? ` (${who})` : ""}.`);
    if (hero.background) lines.push(`Происхождение: ${clip(hero.background, 200)}`);
    if (hero.backstory.trim()) lines.push(`Предыстория: ${clip(hero.backstory.trim(), 1500)}`);
    if (hero.personality.trim()) lines.push(`Черты характера: ${clip(hero.personality.trim(), 400)}`);
    if (hero.ideals.trim()) lines.push(`Идеалы: ${clip(hero.ideals.trim(), 400)}`);
    if (hero.bonds.trim()) lines.push(`Привязанности: ${clip(hero.bonds.trim(), 400)}`);
  } else {
    lines.push("Заметка для всей партии героев.");
  }
  if (others.length) lines.push(`Уже есть заметки (не повторяйся): ${others.slice(0, 12).join("; ")}.`);
  lines.push("");

  const subject = req.subject.trim();
  if (req.target === "boon") {
    lines.push(
      `Предложи 3 разных варианта небольшого бафа или дара для героя по правилам D&D 5e (механика одним-двумя предложениями, ` +
        `длительность или условие использования, без чрезмерной силы)${subject ? ` — дар от божества ${subject}` : ""}. ` +
        `Оформи списком: «1. Название — механика».`,
    );
    if (req.title.trim()) lines.push(`Контекст: ${clip(req.title.trim(), 200)}.`);
    if (req.draft.trim()) lines.push(`Что уже придумано: ${clip(req.draft.trim(), 1000)}`);
  } else if (req.kind === "deity") {
    lines.push(
      `Напиши послание или видение от божества${subject ? ` ${subject}` : ""} для этого героя, 3–6 предложений, ` +
        `которое мастер зачитает игроку. Подразумевай характер божества и прошлое героя.`,
    );
    if (req.title.trim()) lines.push(`Тема: ${clip(req.title.trim(), 200)}.`);
  } else if (req.kind === "hook") {
    lines.push(
      `Придумай, как подать герою зацепку из его предыстории: короткая сцена или реплика NPC, которую мастер расскажет игроку ` +
        `(3–6 предложений) и которая подталкивает к действию.`,
    );
    if (req.title.trim()) lines.push(`Зацепка: ${clip(req.title.trim(), 200)}.`);
    if (subject) lines.push(`Связано с: ${subject}.`);
  } else if (req.kind === "backstory") {
    lines.push("Напиши 3–5 предложений о прошлом героя — факт, который можно раскрыть по ходу игры.");
    if (req.title.trim()) lines.push(`Тема: ${clip(req.title.trim(), 200)}.`);
  } else {
    lines.push("Опиши, как мастер вручает герою награду или дар, 3–5 предложений.");
    if (req.title.trim()) lines.push(`Награда: ${clip(req.title.trim(), 200)}.`);
  }

  if (req.trigger.trim()) lines.push(`Момент: ${clip(req.trigger.trim(), 200)}.`);
  if (req.target === "body" && req.draft.trim()) lines.push(`Черновик мастера (доработай и улучши, сохрани смысл):\n${clip(req.draft.trim(), 1500)}`);
  if (req.wishes.trim()) lines.push(`Пожелания мастера: ${clip(req.wishes.trim(), 300)}.`);
  return lines.join("\n");
}

// ---------- «Заполнить всё» для божества ----------

export type DeityAiRequest = {
  characterId: number | null;
  /** Название божества (обязательно) — по нему ИИ ищет сведения. */
  subject: string;
  /** Уже введённый заголовок (если есть). */
  title: string;
  wishes: string;
  /** Искать в интернете (Google Search). */
  search: boolean;
  /** Что мастер уже написал: черновик текста, момент, баф — ИИ дорабатывает это, а не пишет с нуля. */
  draft?: string;
  trigger?: string;
  boon?: string;
};

export type DeityFields = { title: string; subject: string; body: string; trigger: string; boon: string };

export const DEITY_SYSTEM_PROMPT =
  SYSTEM_PROMPT +
  " Если божество есть в официальных материалах D&D (книги правил, сеттинги, приключения), опирайся на эти сведения и укажи, откуда они. " +
  "Если надёжных сведений нет — придумай сам и честно напиши, что это выдумка. Никогда не выдавай придуманное за канон и не называй книги и страницы, в которых не уверен.";

const SECTIONS = ["ЗАГОЛОВОК", "БОЖЕСТВО", "ТЕКСТ", "КОГДА", "БАФ", "ИСТОЧНИК"] as const;

/** Просит заполнить все поля заметки о божестве и вернуть их в строго заданном формате с метками. */
export function buildDeityPrompt(req: DeityAiRequest, hero: CharacterSheet | null, others: string[]): string {
  const lines = [buildStoryPrompt({ characterId: req.characterId, kind: "deity", target: "body", title: "", subject: req.subject, trigger: "", draft: "", wishes: "" }, hero, others).split("\n\n")[0]];
  lines.push("");
  lines.push(
    `Задача: подготовь для мастера заметку о божестве «${req.subject.trim()}» и его связи с этим героем. Заполни все поля:`,
    "[ЗАГОЛОВОК] — короткое название сцены или послания (до 8 слов).",
    "[БОЖЕСТВО] — каноническое название божества (и, если уместно, титул/сфера в скобках).",
    "[ТЕКСТ] — послание или видение от лица божества, 3–6 предложений, которое мастер зачитает игроку; учти характер божества и прошлое героя.",
    "[КОГДА] — в какой момент это лучше подать (одна строка).",
    "[БАФ] — один небольшой дар или баф по правилам D&D 5e: название и механика одним-двумя предложениями, с условием или длительностью.",
    "[ИСТОЧНИК] — одна строка: либо «Канон: <где описано божество — книга, сеттинг>», либо «Придумано ИИ: официальных сведений о божестве не найдено». Если часть данных канон, а часть выдумка — так и напиши.",
    "",
    "Формат ответа — строго: каждая метка в квадратных скобках на отдельной строке, ниже её текст. Без markdown, без лишних слов до и после.",
  );
  if (req.title.trim()) lines.push(`Тема, которую задал мастер: ${clip(req.title.trim(), 200)}.`);
  if (req.draft?.trim())
    lines.push(
      `Черновик мастера для [ТЕКСТ] (это набросок или указание, что должно произойти): «${clip(req.draft.trim(), 1500)}». ` +
        "Сохрани все его события и смысл, но превратись в готовый художественный текст для зачитывания.",
    );
  if (req.trigger?.trim()) lines.push(`Момент уже выбран мастером: ${clip(req.trigger.trim(), 200)} (в [КОГДА] повтори его).`);
  if (req.boon?.trim()) lines.push(`Баф уже задуман мастером: ${clip(req.boon.trim(), 400)} (в [БАФ] уточни механику, не меняя идею).`);
  if (req.wishes.trim()) lines.push(`Пожелания мастера: ${clip(req.wishes.trim(), 300)}.`);
  return lines.join("\n");
}

/** Разбирает ответ с метками [ЗАГОЛОВОК] … [ИСТОЧНИК]; неполный ответ не считается ошибкой, пустые поля остаются пустыми. */
export function parseDeity(text: string): { fields: DeityFields; source: string } {
  const found: Record<string, string> = {};
  const marks = [...text.matchAll(new RegExp("\\[(" + SECTIONS.join("|") + ")\\]", "gi"))];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = marks[i + 1]?.index ?? text.length;
    found[m[1].toUpperCase()] = text.slice(start, end).replace(/^[\s:—-]+/, "").trim();
  });
  return {
    fields: {
      title: found["ЗАГОЛОВОК"] ?? "",
      subject: found["БОЖЕСТВО"] ?? "",
      body: found["ТЕКСТ"] ?? "",
      trigger: found["КОГДА"] ?? "",
      boon: found["БАФ"] ?? "",
    },
    source: found["ИСТОЧНИК"] ?? "",
  };
}
