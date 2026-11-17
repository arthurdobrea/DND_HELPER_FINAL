/** Кто из игроков на связи: приложение игрока опрашивает сервер раз в ~4 с, помним время последнего запроса (в памяти). */
const g = globalThis as unknown as { __dndSeen?: Map<number, number> };
const seen = (g.__dndSeen ??= new Map<number, number>());
/** Какое устройство игрока сейчас держит героя (id приложения из заголовка x-dnd-client). */
const holders = ((g as { __dndHolder?: Map<number, string> }).__dndHolder ??= new Map<number, string>());

/** Дольше этого без запросов — игрок офлайн (три пропущенных опроса). */
export const ONLINE_MS = 12_000;

export const markSeen = (id: number, client?: string | null) => {
  seen.set(id, Date.now());
  if (client) holders.set(id, client);
};

/** Сколько мс назад игрок опрашивал сервер; null — с запуска сервера не появлялся. */
export const ageMs = (id: number) => {
  const t = seen.get(id);
  return t === undefined ? null : Date.now() - t;
};

/**
 * Герой занят, если другое устройство опрашивало сервер в последние ONLINE_MS, а запрос пришёл с этого. Без id устройства
 * (старые клиенты) не блокируем. Освободилось, когда держатель замолчал на ONLINE_MS.
 */
export const busyFor = (id: number, client?: string | null) => {
  const holder = holders.get(id);
  const age = ageMs(id);
  return !!client && !!holder && holder !== client && age !== null && age < ONLINE_MS;
};
