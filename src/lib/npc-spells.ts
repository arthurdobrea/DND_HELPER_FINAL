import type { AbilityKey } from "@/lib/character";
import { CLASSES } from "@/lib/catalog/labels";
import { normalizeSpellName } from "@/lib/spell-names";
import type { Monster } from "@/lib/open5e";

/** Как найти заклинание в каталоге по нормализованному названию: каноническое имя и круг. */
export type SpellLookup = (normalizedName: string) => { name: string; level: number } | undefined;

export type Spellcasting = {
  /** Ячейки по кругам 1…9. */
  slots: number[];
  /** Списки заклинаний: индекс 0 — заговоры, 1…9 — круги. */
  lists: string[][];
  /** Класс заклинателя по-русски (если указан в тексте) — иначе пусто. */
  spellClass: string;
  ability: AbilityKey | null;
};

const ABILITY_BY_NAME: Record<string, AbilityKey> = { intelligence: "int", wisdom: "wis", charisma: "cha" };

/** Делит «a, b (c, d), e» по запятым верхнего уровня. */
function splitList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

const USAGE_RU = (u: string) => {
  const t = u.trim().toLowerCase();
  if (t.startsWith("at will")) return "по желанию";
  const m = /(\d+)\s*\/\s*day/.exec(t);
  return m ? `${m[1]}/день` : t;
};

/**
 * Разбирает умение «Spellcasting» / «Innate Spellcasting» английского статблока на круги и ячейки.
 * Понимает оба формата:
 *  — «Cantrips (at will): …», «1st level (4 slots): …» (заклинатель с ячейками);
 *  — «At will: …», «3/day each: …» (врождённое: круг берётся из каталога заклинаний).
 * Работает по ОРИГИНАЛУ (английскому) тексту — названия заклинаний нужны английские, чтобы найти их в каталоге.
 */
export function parseSpellcasting(m: Monster, lookup: SpellLookup): Spellcasting | null {
  const abilities = (m.special_abilities ?? []).filter((a) => /spellcasting/i.test(a.name));
  if (abilities.length === 0) return null;

  const slots = Array<number>(9).fill(0);
  const lists: string[][] = Array.from({ length: 10 }, () => []);
  let spellClass = "";
  let ability: AbilityKey | null = null;
  let any = false;

  for (const a of abilities) {
    const text = a.desc.replace(/\\n/g, "\n").replace(/\*\*/g, "").replace(/_/g, "");
    const ab = /spellcasting ability is (intelligence|wisdom|charisma)/i.exec(text)?.[1].toLowerCase();
    if (ab && !ability) ability = ABILITY_BY_NAME[ab];
    const cls = /following (\w+) spells/i.exec(text)?.[1].toLowerCase();
    if (cls && CLASSES[cls] && !spellClass) spellClass = CLASSES[cls];

    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/^[\s*•\-–]+/, "").trim();
      if (!line) continue;

      const std = /^(cantrips?|(\d+)(?:st|nd|rd|th)[\s-]*level)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/i.exec(line);
      const innate = std ? null : /^(at will|\d+\s*\/\s*day(?:\s*each)?)\s*:\s*(.+)$/i.exec(line);
      if (!std && !innate) continue;

      const usage = innate ? USAGE_RU(innate[1]) : "";
      const level = std ? (std[2] ? Number(std[2]) : 0) : -1;
      if (std?.[3]) {
        const sl = /(\d+)\s*slots?/i.exec(std[3]);
        if (sl && level >= 1 && level <= 9) slots[level - 1] = Math.max(slots[level - 1], Number(sl[1]));
      }

      for (const item of splitList((std ?? innate)![innate ? 2 : 4])) {
        // «mage armor*» / «detect thoughts (self only)» → название без звёздочек и пояснений
        const name = item.replace(/\([^)]*\)/g, "").replace(/[*_]/g, "").trim();
        if (!name) continue;
        const found = lookup(normalizeSpellName(name));
        const lvl = level >= 0 ? level : (found?.level ?? 0);
        const label = found?.name ?? titleCase(name);
        const shown = usage ? `${label} (${usage})` : label;
        if (!lists[lvl].includes(shown)) lists[lvl].push(shown);
        any = true;
      }
    }
  }
  if (!any) return null;
  return { slots, lists, spellClass, ability };
}
