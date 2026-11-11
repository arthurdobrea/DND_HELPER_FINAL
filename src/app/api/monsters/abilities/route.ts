import { getMonsters } from "@/lib/catalog";
import { getRaw } from "@/lib/catalog/store";
import type { RawMonster } from "@/lib/catalog/monsters";
import { dedupeByName } from "@/lib/encounter";
import { localize } from "@/lib/translate/view";

const LIMIT = 40;
type Section = "special" | "action" | "bonus" | "reaction" | "legendary";
type Out = { monster: string; monsterKey: string; cr: number; section: Section; name: string; desc: string };

const SECTIONS: [Section, keyof RawMonster][] = [
  ["action", "actions"],
  ["special", "special_abilities"],
  ["bonus", "bonus_actions"],
  ["reaction", "reactions"],
  ["legendary", "legendary_actions"],
];

/**
 * Поиск способностей по всему бестиарию для конструктора NPC:
 * GET /api/monsters/abilities?q=&section=&inDesc=1
 * Совпадение по названию способности, по названию монстра (тогда выдаются все его способности) и, если inDesc, по тексту.
 * Тексты отдаются по-русски, если перевод уже есть в кэше.
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const section = sp.get("section") ?? "";
  const inDesc = sp.get("inDesc") === "1";
  if (q.length < 2) return Response.json({ total: 0, items: [] });

  const keys = new Set(dedupeByName(await getMonsters().catch(() => [])).map((m) => m.key));
  const raws = ((await getRaw("monsters").catch(() => [])) as unknown as RawMonster[]).filter((r) => keys.has(r.key));

  type Hit = { rank: number; item: Out; raw: RawMonster };
  const hits: Hit[] = [];
  for (const raw of raws) {
    const monsterMatch = raw.name.toLowerCase().includes(q);
    for (const [sec, field] of SECTIONS) {
      if (section && section !== sec) continue;
      const list = raw[field] as { name: string; desc: string }[] | null | undefined;
      for (const a of list ?? []) {
        const nameMatch = a.name.toLowerCase().includes(q);
        const descMatch = inDesc && String(a.desc ?? "").toLowerCase().includes(q);
        if (!nameMatch && !monsterMatch && !descMatch) continue;
        hits.push({
          rank: nameMatch ? 0 : monsterMatch ? 1 : 2,
          raw,
          item: { monster: raw.name, monsterKey: raw.key, cr: Number(raw.cr) || 0, section: sec, name: a.name, desc: String(a.desc ?? "") },
        });
      }
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.item.cr - b.item.cr || a.item.monster.localeCompare(b.item.monster) || a.item.name.localeCompare(b.item.name));
  const top = hits.slice(0, LIMIT);

  // Русский текст из кэша переводов (если есть) — по одному монстру на запись.
  const cache = new Map<string, Record<string, unknown>>();
  const items = top.map(({ item, raw }) => {
    let loc = cache.get(raw.key);
    if (!loc) {
      loc = localize("monster", raw, "ru").entry as unknown as Record<string, unknown>;
      cache.set(raw.key, loc);
    }
    const field = SECTIONS.find(([s]) => s === item.section)![1];
    const list = (loc[field] as { name: string; desc: string }[] | null | undefined) ?? [];
    const i = ((raw[field] as unknown[] | undefined) ?? []).findIndex((a) => (a as { name: string }).name === item.name);
    const t = i >= 0 ? list[i] : undefined;
    return { ...item, name: t?.name ?? item.name, desc: t?.desc ?? item.desc };
  });
  return Response.json({ total: hits.length, items });
}
