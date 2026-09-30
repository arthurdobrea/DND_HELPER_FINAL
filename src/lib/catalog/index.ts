import { buildItems, type Item } from "./items";
import { buildMonsterFacets, buildMonsters, type MonsterEntry, type RawMonster } from "./monsters";
import { buildSpells, type Spell } from "./spells";
import { getDerived, getMeta, getRaw, type CatalogKind } from "./store";

export const getSpells = () => getDerived("spells", buildSpells);
export const getItems = () => getDerived("items", buildItems);
export const getMonsters = () => getDerived("monsters", buildMonsters);
export const getMonsterFacets = async () => buildMonsterFacets(await getMonsters());

/** Полная запись монстра в формате статблока. */
export async function getMonsterRaw(key: string): Promise<RawMonster | undefined> {
  return (await getRaw("monsters")).find((r) => r.key === key) as RawMonster | undefined;
}

export type SourceOption = { value: string; label: string; count: number };

const SYSTEMS: Record<string, string> = {
  "5e-2014": "Все 5e (2014)",
  "5e-2024": "Все 5e (2024)",
  a5e: "Все Advanced 5e",
};

/** Опции фильтра «Источник»: сначала редакции целиком, потом отдельные книги. */
export function sourceOptions(entries: (Spell | Item)[]): { systems: SourceOption[]; books: SourceOption[] } {
  const books = new Map<string, SourceOption>();
  const systems = new Map<string, SourceOption>();
  for (const e of entries) {
    const b = books.get(e.sourceKey) ?? { value: e.sourceKey, label: e.source, count: 0 };
    b.count++;
    books.set(e.sourceKey, b);
    const s = systems.get(e.system) ?? { value: e.system, label: SYSTEMS[e.system] ?? e.system, count: 0 };
    s.count++;
    systems.set(e.system, s);
  }
  const byCount = (a: SourceOption, b: SourceOption) => b.count - a.count;
  return { systems: [...systems.values()].sort(byCount), books: [...books.values()].sort(byCount) };
}

export function catalogInfo(kind: CatalogKind) {
  return getMeta(kind);
}

export type { Spell, Item, MonsterEntry, RawMonster, CatalogKind };
