import { getMonsters, getSpells } from "@/lib/catalog";
import { getRaw, type RawEntry } from "@/lib/catalog/store";
import type { RawMonster } from "@/lib/catalog/monsters";
import { dedupeByName } from "@/lib/encounter";
import { normalizeSpellName } from "@/lib/spell-names";
import { TAGS, abilityHits, scoreTags, tagsOf, type Profile, type TagId } from "@/lib/suggest";
import { localize } from "@/lib/translate/view";

type Section = "special" | "action" | "bonus" | "reaction" | "legendary";
const SECTIONS: [Section, keyof RawMonster][] = [
  ["action", "actions"],
  ["special", "special_abilities"],
  ["bonus", "bonus_actions"],
  ["reaction", "reactions"],
  ["legendary", "legendary_actions"],
];
const TAG_IDS = new Set<string>(TAGS.map((t) => t.id));
// Мультиатака и прочая «обвязка» — не то, что стоит советовать.
const SKIP = /^(multiattack|мультиатака|legendary resistance)|spellcasting/i;

// Обычные атаки («Укус», «Коготь», «Копьё») — в подсказках ниже, чем особые способности.
const GENERIC = /^(bite|claws?|slam|tail|gore|hooves|fists?|unarmed strike|scimitar|longsword|greatsword|shortsword|spear|dagger|mace|club|greataxe|battleaxe|morningstar|javelin|longbow|shortbow|light crossbow|heavy crossbow|tentacles?|sting|talons?|beak|horns?)(\s*\(.*\))?$/i;

type Indexed = { raw: RawMonster; type: string; cr: number; section: Section; field: keyof RawMonster; idx: number; name: string; desc: string; tags: Partial<Record<TagId, number>> };

// Индекс тегов всех способностей бестиария — строится один раз на загруженный каталог.
const indexCache = new WeakMap<RawEntry[], Indexed[]>();
async function abilityIndex(): Promise<Indexed[]> {
  const raws = await getRaw("monsters");
  const hit = indexCache.get(raws);
  if (hit) return hit;
  const keys = new Set(dedupeByName(await getMonsters().catch(() => [])).map((m) => m.key));
  const out: Indexed[] = [];
  for (const r of raws as unknown as RawMonster[]) {
    if (!keys.has(r.key)) continue;
    for (const [section, field] of SECTIONS) {
      const list = (r[field] as { name: string; desc: string }[] | null | undefined) ?? [];
      list.forEach((a, idx) => {
        if (!a?.name || SKIP.test(a.name)) return;
        const desc = String(a.desc ?? "");
        const tags = abilityHits(a.name, desc);
        if (Object.keys(tags).length) out.push({ raw: r, type: String(r.type ?? "").toLowerCase(), cr: Number(r.cr) || 0, section, field, idx, name: a.name, desc, tags });
      });
    }
  }
  indexCache.set(raws, out);
  return out;
}

/**
 * Подсказки для сборщика NPC: POST /api/monsters/suggest
 * { profile: {fire: 3, spellcasting: 1, …}, type, cr, exclude: [названия уже добавленного], spells: [заклинания в книге], limit, withSpells }
 * Ответ: способности бестиария «в тему» (одинаковые названия склеены, с числом монстров, у которых она есть) и заклинания в тему.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    profile?: Record<string, number>;
    type?: string;
    cr?: number;
    exclude?: string[];
    spells?: string[];
    limit?: number;
    withSpells?: boolean;
  };
  const profile: Profile = {};
  for (const [k, v] of Object.entries(body.profile ?? {})) if (TAG_IDS.has(k) && Number(v) > 0) profile[k as TagId] = Math.min(50, Number(v));
  if (Object.keys(profile).length === 0) return Response.json({ abilities: [], spells: [] });

  const type = String(body.type ?? "").toLowerCase();
  const cr = Number(body.cr) || 0;
  const limit = Math.max(3, Math.min(40, Number(body.limit) || 24));
  const exclude = new Set((body.exclude ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
  const book = new Set((body.spells ?? []).map((s) => normalizeSpellName(String(s))));

  // ----- Способности -----
  type Agg = { best: Indexed; score: number; hit: TagId[]; count: number; monsters: Set<string> };
  const byName = new Map<string, Agg>();
  for (const it of await abilityIndex()) {
    const { score: tagScore, hit } = scoreTags(it.tags, profile);
    if (tagScore <= 0) continue;
    const dcr = Math.abs(it.cr - cr);
    const score = tagScore * (GENERIC.test(it.name.trim()) ? 0.6 : 1) + (type && it.type === type ? 0.6 : 0) + (dcr <= 3 ? 0.4 : dcr > 10 ? -0.6 : 0);
    const key = it.name.trim().toLowerCase().replace(/\s*\(.*\)$/, "");
    const cur = byName.get(key);
    if (!cur) byName.set(key, { best: it, score, hit, count: 1, monsters: new Set([it.raw.name]) });
    else {
      cur.count++;
      cur.monsters.add(it.raw.name);
      if (score > cur.score) Object.assign(cur, { best: it, score, hit });
    }
  }
  const ranked = [...byName.values()]
    .map((a) => ({ ...a, total: a.score + Math.min(0.4, a.count * 0.04) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit * 3);

  const locCache = new Map<string, Record<string, unknown>>();
  const abilities = [];
  for (const a of ranked) {
    if (abilities.length >= limit) break;
    const it = a.best;
    let loc = locCache.get(it.raw.key);
    if (!loc) {
      loc = localize("monster", it.raw, "ru").entry as unknown as Record<string, unknown>;
      locCache.set(it.raw.key, loc);
    }
    const t = ((loc[it.field] as { name: string; desc: string }[] | null | undefined) ?? [])[it.idx];
    const name = t?.name ?? it.name;
    if (exclude.has(it.name.toLowerCase()) || exclude.has(name.toLowerCase())) continue;
    abilities.push({
      monster: it.raw.name,
      monsterKey: it.raw.key,
      cr: it.cr,
      section: it.section,
      name,
      desc: t?.desc ?? it.desc,
      tags: a.hit,
      count: a.monsters.size,
      sameType: !!type && it.type === type,
    });
  }

  // ----- Заклинания в тему (круг — по силе существа) -----
  const spells: { key: string; name: string; level: number; school: string; tags: TagId[] }[] = [];
  if (body.withSpells !== false) {
    const maxLevel = Math.min(9, Math.max(1, Math.ceil(cr / 2) + 1));
    const best = new Map<string, { key: string; name: string; level: number; school: string; tags: TagId[]; score: number }>();
    for (const s of await getSpells().catch(() => [])) {
      if (s.level > maxLevel) continue;
      const k = normalizeSpellName(s.name);
      if (book.has(k)) continue;
      const tags = new Set<TagId>(s.damageTypes.filter((x) => TAG_IDS.has(x)) as TagId[]);
      for (const t of tagsOf(`${s.name} ${s.desc.slice(0, 300)}`)) if (!["fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"].includes(t)) tags.add(t);
      tags.delete("spellcasting");
      const { score, hit } = scoreTags([...tags], profile);
      if (score <= 0) continue;
      // Тема в самом названии («Fire Shield») и базовые правила (SRD) — выше; круг почти не влияет.
      const named = tagsOf(s.name).some((t) => hit.includes(t));
      const total = score + (named ? 0.4 : 0) + (s.key.startsWith("srd") ? 0.3 : 0) + s.level * 0.02;
      const cur = best.get(k);
      if (!cur || total > cur.score || (total === cur.score && s.key.startsWith("srd"))) best.set(k, { key: s.key, name: s.name, level: s.level, school: s.school, tags: hit, score: total });
    }
    spells.push(...[...best.values()].sort((a, b) => b.score - a.score).slice(0, 14).map(({ score: _s, ...rest }) => (void _s, rest)));
  }

  return Response.json({ abilities, spells });
}
