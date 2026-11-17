import { exactRu } from "./dictionary";
import { protect } from "./glossary";
import { plan } from "./markup";

/**
 * Бесплатный офлайн-переводчик: LibreTranslate (Argos) в соседнем Docker-контейнере.
 * Адрес — LIBRETRANSLATE_URL (в docker-compose это http://libretranslate:5000, для `npm run dev` — localhost:5000).
 */
export const ENGINE_ID = "libretranslate";
const BASE_URL = (process.env.LIBRETRANSLATE_URL?.trim() || "http://localhost:5000").replace(/\/+$/, "");
const API_KEY = process.env.LIBRETRANSLATE_API_KEY?.trim() || "";

/** Понятная пользователю причина сбоя (без технических деталей). */
export class TranslationError extends Error {}
/** Ответ сервиса не совпал по длине — вызывающий разобьёт пачку и повторит. */
export class TranslationShapeError extends Error {}

// Если сервис не отвечает, не заваливаем страницы спиннерами: на минуту считаем перевод недоступным.
let downUntil = 0;
const DOWN_MS = 60_000;

/** Включён ли автоперевод (выключается TRANSLATE_DISABLED=1 или пока сервис не отвечает). */
export function translationEnabled(): boolean {
  if (process.env.TRANSLATE_DISABLED === "1") return false;
  return Date.now() >= downUntil;
}

const MAX_UNITS_PER_REQUEST = 40;
const MAX_CHARS_PER_REQUEST = 6000;

async function post(units: string[]): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: units, source: "en", target: "ru", format: "text", ...(API_KEY ? { api_key: API_KEY } : {}) }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") throw new TranslationError("Сервис перевода отвечает слишком долго");
    downUntil = Date.now() + DOWN_MS;
    throw new TranslationError("Сервис перевода не запущен (docker compose up -d)");
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 400 && /not supported|language/i.test(detail)) {
      throw new TranslationError("В LibreTranslate нет модели en→ru (проверьте LT_LOAD_ONLY=en,ru)");
    }
    if (res.status === 403) throw new TranslationError("LibreTranslate требует ключ (LIBRETRANSLATE_API_KEY)");
    if (res.status === 429) throw new TranslationError("Сервис перевода перегружен — повторите чуть позже");
    throw new TranslationError(`Ошибка сервиса перевода (${res.status})`);
  }
  const json = (await res.json()) as { translatedText?: string | string[] };
  const out = Array.isArray(json.translatedText) ? json.translatedText : json.translatedText !== undefined ? [json.translatedText] : [];
  if (out.length !== units.length || out.some((x) => typeof x !== "string")) throw new TranslationShapeError(`ожидалось ${units.length} переводов`);
  return out;
}

/** Отправляет фразы пачками (ограничение по числу и объёму) и возвращает переводы в том же порядке. */
async function postAll(phrases: string[]): Promise<string[]> {
  const result: string[] = [];
  for (let i = 0; i < phrases.length; ) {
    const chunk: string[] = [];
    let chars = 0;
    while (i < phrases.length && chunk.length < MAX_UNITS_PER_REQUEST && (chunk.length === 0 || chars + phrases[i].length <= MAX_CHARS_PER_REQUEST)) {
      chars += phrases[i].length;
      chunk.push(phrases[i++]);
    }
    result.push(...(await post(chunk)));
  }
  return result;
}

/** Переводит пачку текстов. Порядок и количество сохраняются, разметка (жирный, таблицы, абзацы) — тоже. */
export async function translateBatch(texts: string[]): Promise<string[]> {
  const plans = texts.map(plan);
  const unique = [...new Set(plans.flatMap((p) => p.units))];

  // Термины D&D заменяем метками (см. glossary.ts), чтобы переводчик их не искажал.
  const translated = new Map<string, string>();
  // Ячейки таблиц и заголовки из словаря переводятся без переводчика.
  const needMt = unique.filter((u) => {
    const ru = exactRu(u);
    if (ru !== null) translated.set(u, ru);
    return ru === null;
  });
  const protectedUnits = needMt.map((u) => protect(u));
  const first = await postAll(protectedUnits.map((p) => p.text));

  const retry: string[] = [];
  needMt.forEach((u, i) => {
    const restored = protectedUnits[i].restore(first[i]);
    if (restored === null) retry.push(u);
    else translated.set(u, restored);
  });
  // Если переводчик потерял метку — переводим эту фразу целиком, без глоссария.
  if (retry.length) {
    const plain = await postAll(retry);
    retry.forEach((u, i) => translated.set(u, plain[i]));
  }
  return plans.map((p) => p.build(p.units.map((u) => translated.get(u) ?? u)));
}
