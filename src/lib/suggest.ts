import type { ForgeAbility, ForgeDraft } from "@/lib/forge";

/**
 * «Темы» способностей для подсказок сборщика: урон определённого типа, магия, телепорт, страх и т. п.
 * Тема определяется по тексту (английскому и русскому). Короткие русские основы — с проверкой,
 * что перед ними не буква (иначе «яд» нашёлся бы в слове «рядом»).
 */
export type TagId =
  | "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison" | "necrotic" | "radiant" | "psychic" | "force"
  | "spellcasting" | "teleport" | "flight" | "grapple" | "fear" | "charm" | "regeneration" | "summon" | "breath"
  | "aura" | "magicres" | "shapechange" | "invisibility" | "stealth" | "frenzy";

const ru = (stem: string) => `(?<![а-яё])${stem}`;

/**
 * re — по названию способности (сильный признак), desc — по описанию (слабый, строже: чтобы упоминание
 * «fire bolt» в списке заклинаний не делало способность «огненной»); desc: null — тему видно только по названию.
 */
export const TAGS: { id: TagId; icon: string; label: string; re: RegExp; desc: RegExp | null }[] = [
  { id: "fire", icon: "🔥", label: "огонь", re: new RegExp(`\\bfire|flame|burn|\\bheat|blaze|ember|inferno|${ru("ог(?:он|н)")}|пламен|${ru("жар")}|горящ|сжига|поджиг`, "i"), desc: /fire damage|\bflames?\b|\bburn(s|ing)?\b|\bignite|огн[её]м|огненн|пламен|загора|поджиг/i },
  { id: "cold", icon: "❄️", label: "холод", re: new RegExp(`\\bcold\\b|frost|\\bice\\b|\\bicy\\b|freez|холод|мороз|${ru("л[её]д")}|ледян|${ru("льд")}`, "i"), desc: /cold damage|\bfrost|\bfreez|холод|мороз|ледян|замерз/i },
  { id: "lightning", icon: "⚡", label: "молния", re: /lightning|electri|молни|электр/i, desc: /lightning|electri|молни|электр/i },
  { id: "thunder", icon: "🌩️", label: "звук", re: new RegExp(`thunder|${ru("гром")}|звуков`, "i"), desc: /thunder damage|thunderous|звуком|звуков|громов/i },
  { id: "acid", icon: "🧪", label: "кислота", re: /\bacid|кислот/i, desc: /\bacid|кислот/i },
  { id: "poison", icon: "☠️", label: "яд", re: new RegExp(`poison|venom|toxi|${ru("яд")}|отрав`, "i"), desc: /poison damage|poisoned condition|venom|(?<![а-яё])ядом|(?<![а-яё])ядовит|отравлен/i },
  { id: "necrotic", icon: "💀", label: "некротика", re: /necrotic|life drain|drain|некрот|высасыва|иссуша/i, desc: /necrotic|некрот/i },
  { id: "radiant", icon: "🌟", label: "свет", re: /radiant|holy|divine|sacred|лучист|излучени|свящ|божеств/i, desc: /radiant|излучени|лучист/i },
  { id: "psychic", icon: "🧠", label: "разум", re: /psychic|telepath|mind blast|психич|телепат|разум/i, desc: /psychic|психич/i },
  { id: "force", icon: "💠", label: "силовое поле", re: /\bforce\b|силов/i, desc: /force damage|силов\S* пол/i },
  { id: "spellcasting", icon: "✨", label: "магия", re: /spellcasting|innate|\bspells?\b|cantrip|заклинани|колдовств|заговор/i, desc: null },
  { id: "teleport", icon: "🌀", label: "телепорт", re: /teleport|misty step|blink|dimension door|телепорт/i, desc: /teleport|телепорт/i },
  { id: "flight", icon: "🪽", label: "полёт", re: /\bfly|flying|wings?\b|\bflight|полёт|полет|крыл/i, desc: null },
  { id: "grapple", icon: "🪢", label: "захват", re: /grappl|restrain|constrict|engulf|swallow|схват|опута|обвива|проглат|захват/i, desc: /is grappled|restrained|swallowed|engulf|схвачен|опутан|проглоч/i },
  { id: "fear", icon: "😱", label: "страх", re: /frighten|fear|terrif|horrif|напуган|испуг|страх|ужас/i, desc: /frightened|напуган/i },
  { id: "charm", icon: "💞", label: "очарование", re: /charm|beguil|domina|очаров|подчин/i, desc: /charmed|очарован/i },
  { id: "regeneration", icon: "💚", label: "лечение", re: /regenerat|heal|регенер|исцел|лечени/i, desc: /regains? \d+ hit points|regenerat|восстанавливает \d+ хит|регенер/i },
  { id: "summon", icon: "🫂", label: "призыв", re: /summon|conjur|call of|призыв|вызов/i, desc: /\bsummons?\b|conjur|призыва|вызывает/i },
  { id: "breath", icon: "🐉", label: "дыхание", re: /breath|дыхани/i, desc: /exhales|выдыха/i },
  { id: "aura", icon: "🌐", label: "аура", re: /\baura\b|аура|ауры/i, desc: /\baura\b|ауры|аура/i },
  { id: "magicres", icon: "🛡️", label: "против магии", re: /magic resistance|counterspell|antimagic|сопротивление маги|контрзаклин/i, desc: null },
  { id: "shapechange", icon: "🎭", label: "смена облика", re: /shapechang|change shape|polymorph|alter self|облик|превращ/i, desc: /polymorphs? into|transforms? into|превращается/i },
  { id: "invisibility", icon: "👻", label: "невидимость", re: /invisib|невидим/i, desc: /turns? invisible|becomes? invisible|становится невидим/i },
  { id: "stealth", icon: "🗡️", label: "скрытность", re: /sneak attack|ambush|surprise|shadow stealth|скрыт|засад|подлая атака/i, desc: /sneak attack|застигнут/i },
  { id: "frenzy", icon: "💢", label: "ярость", re: /rampage|frenzy|reckless|\brage\b|berserk|ярост|безрассуд|бешен/i, desc: /reckless|frenzy|rampage|ярост/i },
];
export const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t])) as Record<TagId, (typeof TAGS)[number]>;
const DAMAGE_TAGS = new Set<string>(["fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"]);

/** Темы произвольного текста (названия): любые совпадения считаются. */
export function tagsOf(text: string): TagId[] {
  return TAGS.filter((t) => t.re.test(text)).map((t) => t.id);
}

/** Темы способности с весами: по названию — 1, только по описанию — 0.6. */
export function abilityHits(name: string, desc: string): Partial<Record<TagId, number>> {
  const out: Partial<Record<TagId, number>> = {};
  for (const t of TAGS) {
    if (t.re.test(name)) out[t.id] = 1;
    else if (t.desc && t.desc.test(desc)) out[t.id] = 0.6;
  }
  return out;
}

export type Profile = Partial<Record<TagId, number>>;

/** Теги одной способности черновика (у своих атак и областей — по типу урона, у текста — по тексту). */
export function abilityTags(a: ForgeAbility): TagId[] {
  const out = new Set<TagId>();
  if (a.kind === "attack" || a.kind === "save") {
    for (const k of [a.dmgType, a.kind === "attack" && a.extraDice ? a.extraType : ""]) if (DAMAGE_TAGS.has(k)) out.add(k as TagId);
    for (const t of tagsOf(`${a.name} ${a.kind === "save" ? `${a.shape} ${a.effect}` : ""}`)) out.add(t);
    if (a.kind === "save" && /конус|cone|линия|line/i.test(a.shape) && /дыхан|breath/i.test(a.name)) out.add("breath");
  } else if (a.kind === "spells") {
    out.add("spellcasting");
    for (const s of a.spells) for (const t of tagsOf(s.name)) out.add(t);
  } else {
    for (const t of Object.keys(abilityHits(a.name, a.desc)) as TagId[]) out.add(t);
  }
  return [...out];
}

/** «Тема» существа: сколько раз встречается каждый тег в способностях, сопротивлениях и иммунитетах. */
export function profileOf(d: ForgeDraft): Profile {
  const p: Profile = {};
  const add = (t: TagId, w = 1) => (p[t] = (p[t] ?? 0) + w);
  for (const a of d.abilities) for (const t of abilityTags(a)) add(t, a.kind === "spells" ? 1 : 1);
  const spells = d.abilities.find((a) => a.kind === "spells");
  if (spells && spells.kind === "spells" && spells.spells.length) add("spellcasting", 1);
  for (const t of tagsOf(`${d.resistances} ${d.immunities}`)) if (DAMAGE_TAGS.has(t)) add(t, 1);
  if (d.speed.fly > 0) add("flight", 1);
  return p;
}

/** Профиль из одной способности — для «похожих на выбранный блок». */
export function profileOfAbility(a: ForgeAbility): Profile {
  return Object.fromEntries(abilityTags(a).map((t) => [t, 1])) as Profile;
}

export const topTags = (p: Profile, n = 8) =>
  (Object.entries(p) as [TagId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);

/** Насколько текст попадает в профиль (0 — никак). Нормировано на самый частый тег профиля. */
export function scoreTags(tags: TagId[] | Partial<Record<TagId, number>>, p: Profile): { score: number; hit: TagId[] } {
  const weights = Array.isArray(tags) ? Object.fromEntries(tags.map((t) => [t, 1])) : tags;
  const max = Math.max(1, ...Object.values(p).map((v) => v ?? 0));
  let score = 0;
  const hit: TagId[] = [];
  for (const [t, k] of Object.entries(weights) as [TagId, number][]) {
    const w = p[t] ?? 0;
    if (w > 0) {
      score += k * (0.4 + w / max);
      hit.push(t);
    }
  }
  return { score, hit };
}
