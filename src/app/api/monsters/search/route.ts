import { getMonsters } from "@/lib/catalog";
import { MONSTER_TYPES, label } from "@/lib/catalog/labels";
import { dedupeByName } from "@/lib/encounter";

const LIMIT = 40;

/**
 * Поиск по бестиарию для создания NPC: GET /api/monsters/search?q=&type=&crMin=&crMax=
 * Сначала названия, начинающиеся с запроса, затем содержащие его; одинаковые названия из разных книг склеиваются (приоритет SRD).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const type = sp.get("type") ?? "";
  const num = (k: string) => {
    const v = sp.get(k);
    return v === null || v.trim() === "" || isNaN(Number(v)) ? null : Number(v);
  };
  const crMin = num("crMin");
  const crMax = num("crMax");

  const list = dedupeByName(await getMonsters().catch(() => []));
  const found = list
    .filter(
      (m) =>
        (!type || m.type === type) &&
        (crMin === null || m.cr >= crMin) &&
        (crMax === null || m.cr <= crMax) &&
        (!q || m.name.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      const rank = (n: string) => (!q ? 0 : n.toLowerCase().startsWith(q) ? 0 : 1);
      return rank(a.name) - rank(b.name) || a.cr - b.cr || a.name.localeCompare(b.name);
    });

  return Response.json({
    total: found.length,
    items: found.slice(0, LIMIT).map((m) => ({
      key: m.key,
      name: m.name,
      type: m.type,
      typeLabel: label(MONSTER_TYPES, m.type),
      cr: m.cr,
      crLabel: m.crLabel,
      hp: m.hp,
      ac: m.ac,
      dex: m.abilities.dex,
      source: m.source,
    })),
  });
}
