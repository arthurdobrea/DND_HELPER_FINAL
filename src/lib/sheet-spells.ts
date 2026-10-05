import type { Spell } from "@/lib/catalog";
import { normalizeSpellName } from "@/lib/spell-names";

/** «Fire Bolt (3/день), Shield*» → чистые названия заклинаний из текста блока листа (по запятым, точкам с запятой и строкам). */
export function parseSpellNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const name = part.replace(/\([^)]*\)/g, "").replace(/[*_]/g, "").trim();
    const norm = normalizeSpellName(name);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(name);
    }
  }
  return out;
}

export type SheetSpellEntry = { level: number; name: string; spell: Spell | null };

/**
 * Заклинания листа с описаниями из каталога: по блокам кругов (индекс 0 — заговоры). Заклинание ищется по названию;
 * при дубликатах из разных книг берётся SRD. Не найденные в каталоге возвращаются с spell = null.
 */
export function resolveSheetSpells(spells: string[], catalog: Spell[]): SheetSpellEntry[] {
  const byName = new Map<string, Spell>();
  for (const s of catalog) {
    const k = normalizeSpellName(s.name);
    const cur = byName.get(k);
    if (!cur || (s.key.startsWith("srd") && !cur.key.startsWith("srd"))) byName.set(k, s);
  }
  const out: SheetSpellEntry[] = [];
  spells.forEach((text, level) => {
    for (const name of parseSpellNames(text ?? "")) out.push({ level, name, spell: byName.get(normalizeSpellName(name)) ?? null });
  });
  return out;
}
