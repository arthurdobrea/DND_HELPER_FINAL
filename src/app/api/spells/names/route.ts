import { getSpells } from "@/lib/catalog";
import { normalizeSpellName } from "@/lib/spell-names";

/**
 * Карта «нормализованное английское название → ключ заклинания» для подсветки [названий] на странице PDF.
 * Если одно имя есть в нескольких источниках, берётся редакция 2014 года (самая частая в книгах), иначе первая.
 */
export async function GET() {
  const spells = await getSpells().catch(() => []);
  const map: Record<string, string> = {};
  const is2014 = new Set<string>();
  for (const s of spells) {
    const n = normalizeSpellName(s.name);
    if (!n) continue;
    const preferred = s.system.includes("2014");
    if (!(n in map) || (preferred && !is2014.has(n))) {
      map[n] = s.key;
      if (preferred) is2014.add(n);
    }
  }
  return Response.json(map, { headers: { "Cache-Control": "private, max-age=600" } });
}
