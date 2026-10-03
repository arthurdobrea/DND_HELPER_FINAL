/**
 * Генерация текста через Gemini API (Google AI Studio). Ключ — GEMINI_API_KEY (в .env), модель — GEMINI_MODEL.
 * Подписка Gemini Pro для API не нужна и не действует: ключ заводится отдельно в AI Studio (есть бесплатный уровень).
 * Вызывается только по нажатию кнопки пользователем — никаких фоновых запросов.
 */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Понятная пользователю причина сбоя (без технических деталей и без ключа). */
export class AiError extends Error {}

export function geminiEnabled(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").trim() !== "";
}

type Request = { system: string; prompt: string; maxTokens?: number; temperature?: number };
export type Source = { title: string; uri: string };
export type Generated = { text: string; sources: Source[]; searched: boolean };

type ApiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
};

async function call({ system, prompt, maxTokens = 1200, temperature = 0.9 }: Request, search: boolean): Promise<Response> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new AiError("Не задан GEMINI_API_KEY: добавьте ключ в файл .env и перезапустите приложение.");
  const model = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_MODEL;
  try {
    return await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      // Ключ — в заголовке, а не в адресе: так он не попадёт в логи и сообщения об ошибках.
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
        // Поиск Google: модель сама ищет в интернете сведения (например, о божестве в официальных материалах D&D).
        ...(search ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(search ? 90_000 : 60_000),
    });
  } catch {
    throw new AiError("Не удалось связаться с Gemini: проверьте интернет и попробуйте ещё раз.");
  }
}

function failure(res: Response): AiError {
  const model = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_MODEL;
  if (res.status === 400 || res.status === 403) return new AiError("Gemini отклонил запрос: проверьте, что GEMINI_API_KEY верный и активен в AI Studio.");
  if (res.status === 402) return new AiError("У проекта Gemini закончились предоплаченные кредиты. Пополните баланс на ai.studio/projects или создайте ключ в проекте на бесплатном уровне и вставьте его в .env.");
  if (res.status === 404) return new AiError(`Модель «${model}» не найдена: поправьте GEMINI_MODEL в .env.`);
  if (res.status === 429) return new AiError("Достигнут лимит запросов Gemini (бесплатный уровень). Подождите минуту и повторите.");
  return new AiError(`Gemini временно недоступен (код ${res.status}). Повторите позже.`);
}

function read(json: ApiResponse | null, searched: boolean): Generated {
  if (json?.promptFeedback?.blockReason) throw new AiError("Gemini отказался отвечать на этот запрос (фильтр безопасности). Переформулируйте пожелания.");
  const cand = json?.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new AiError("Gemini вернул пустой ответ. Попробуйте ещё раз.");
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    const uri = c.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: c.web?.title || uri, uri });
    }
  }
  return { text, sources: sources.slice(0, 6), searched };
}

export async function generateText(req: Request): Promise<string> {
  const res = await call(req, false);
  if (!res.ok) throw failure(res);
  return read((await res.json().catch(() => null)) as ApiResponse | null, false).text;
}

/**
 * Текст с поиском в интернете (Google Search): возвращает и ссылки на найденные источники.
 * Если поиск недоступен (модель или тариф его не поддерживает) — один раз повторяет без поиска, searched = false.
 */
export async function generateGrounded(req: Request): Promise<Generated> {
  const res = await call(req, true);
  if (res.ok) return read((await res.json().catch(() => null)) as ApiResponse | null, true);
  if (res.status === 400) {
    const plain = await call(req, false);
    if (plain.ok) return read((await plain.json().catch(() => null)) as ApiResponse | null, false);
    throw failure(plain);
  }
  throw failure(res);
}
