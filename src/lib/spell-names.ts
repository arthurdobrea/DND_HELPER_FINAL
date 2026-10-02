/** Нормализация названия заклинания для сопоставления: «Tasha's Hideous Laughter» → «tashas hideous laughter». */
export function normalizeSpellName(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
