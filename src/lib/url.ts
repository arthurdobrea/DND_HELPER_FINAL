type SP = Record<string, string | string[] | undefined>;

/** Ссылка на ту же страницу с изменёнными параметрами (null — удалить параметр). */
export function hrefWith(path: string, sp: SP, patch: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in patch || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) if (one !== "") params.append(k, one);
  }
  for (const [k, v] of Object.entries(patch)) if (v !== null) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
