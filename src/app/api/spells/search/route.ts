import { getSpells } from "@/lib/catalog";
import { normalizeSpellName } from "@/lib/spell-names";

const LIMIT = 30;

/** Поиск заклинаний для конструктора NPC: GET /api/spells/search?q=&level= (одинаковые названия склеиваются, SRD в приоритете). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const levelRaw = sp.get("level") ?? "";
  const level = levelRaw === "" || isNaN(Number(levelRaw)) ? null : Number(levelRaw);

  const best = new Map<string, { name: string; level: number; school: string; key: string }>();
  for (const s of await getSpells().catch(() => [])) {
    const k = normalizeSpellName(s.name);
    const cur = best.get(k);
    if (!cur || (s.key.startsWith("srd") && !cur.key.startsWith("srd"))) best.set(k, { name: s.name, level: s.level, school: s.school, key: s.key });
  }
  const found = [...best.values()]
    .filter((s) => (level === null || s.level === level) && (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => {
      const rank = (n: string) => (!q ? 0 : n.toLowerCase().startsWith(q) ? 0 : 1);
      return rank(a.name) - rank(b.name) || a.level - b.level || a.name.localeCompare(b.name);
    });
  return Response.json({ total: found.length, items: found.slice(0, LIMIT) });
}
