/**
 * Парсер книг: модель данных найденных персонажей и предметов, очистка ответа модели и склейка дубликатов.
 * Без серверных зависимостей — используется и на сервере (сохранение), и в браузере (карточки).
 */

export type Feature = { name: string; desc: string };

export type CharStats = {
  ac: string;
  hp: string;
  speed: string;
  cr: string;
  str: number | null;
  dex: number | null;
  con: number | null;
  int: number | null;
  wis: number | null;
  cha: number | null;
  saves: string;
  skills: string;
  resist: string;
  senses: string;
  languages: string;
  traits: Feature[];
  actions: Feature[];
};

export type ParsedCharacter = {
  name: string;
  /** Раса / тип существа («человек», «вампир»). */
  race: string;
  /** Кто это: должность, роль в сюжете. */
  role: string;
  alignment: string;
  description: string;
  personality: string;
  /** Где находится / где встречается. */
  location: string;
  /** Блок характеристик, если он есть в книге. */
  stats: CharStats | null;
};

export type ParsedItem = {
  name: string;
  type: string;
  rarity: string;
  attunement: string;
  description: string;
  properties: string;
  /** Где лежит / у кого находится. */
  location: string;
};

export type EntityKind = "character" | "item";

export const ABILITY_FIELDS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const ABILITY_LABELS: Record<(typeof ABILITY_FIELDS)[number], string> = { str: "СИЛ", dex: "ЛОВ", con: "ТЕЛ", int: "ИНТ", wis: "МДР", cha: "ХАР" };

export const abilityMod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Размеры окна страниц, отправляемого модели за один запрос, и шаг между окнами (1 страница перекрытия — чтобы блок на стыке не потерялся). */
export const PARSE_WINDOW = 4;
export const PARSE_STRIDE = 3;

/** Окна страниц [начало, конец] для книги из numPages страниц. */
export function planWindows(numPages: number): [number, number][] {
  const out: [number, number][] = [];
  for (let start = 1; start <= numPages; start += PARSE_STRIDE) {
    out.push([start, Math.min(numPages, start + PARSE_WINDOW - 1)]);
    if (start + PARSE_WINDOW - 1 >= numPages) break;
  }
  return out;
}

/** Ключ для склейки: без регистра, «ё»=«е», только буквы и цифры. */
export function entityKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// ---------- Очистка ответа модели ----------

const str = (v: unknown, max: number): string => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+\n/g, "\n").trim().slice(0, max) : "");
const score = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 30 ? Math.round(n) : null;
};
const features = (v: unknown): Feature[] =>
  (Array.isArray(v) ? v : [])
    .slice(0, 40)
    .map((f) => {
      const o = (f ?? {}) as Record<string, unknown>;
      return { name: str(o.name, 100), desc: str(o.desc ?? o.description, 1500) };
    })
    .filter((f) => f.name || f.desc);

function cleanStats(v: unknown): CharStats | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const s: CharStats = {
    ac: str(o.ac, 80),
    hp: str(o.hp, 80),
    speed: str(o.speed, 120),
    cr: str(o.cr, 20),
    str: score(o.str),
    dex: score(o.dex),
    con: score(o.con),
    int: score(o.int),
    wis: score(o.wis),
    cha: score(o.cha),
    saves: str(o.saves, 200),
    skills: str(o.skills, 300),
    resist: str(o.resist, 300),
    senses: str(o.senses, 200),
    languages: str(o.languages, 200),
    traits: features(o.traits),
    actions: features(o.actions),
  };
  // «Блок» без единого признака статблока — это не блок.
  const filled = [s.ac, s.hp, s.speed, s.cr].filter(Boolean).length + ABILITY_FIELDS.filter((k) => s[k] !== null).length + s.actions.length;
  return filled >= 3 ? s : null;
}

export type Extracted<T> = { entity: T; page: number | null };

function pageOf(o: Record<string, unknown>, lo: number, hi: number): number | null {
  const n = typeof o.page === "number" ? o.page : parseInt(String(o.page ?? ""), 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
}

/** Разбирает текст ответа модели (допускает обёртку ```json) и приводит к безопасному виду. */
export function parseExtraction(raw: string, lo: number, hi: number): { characters: Extracted<ParsedCharacter>[]; items: Extracted<ParsedItem>[] } {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("Модель вернула ответ не в формате JSON");
    text = text.slice(a, b + 1);
    json = JSON.parse(text);
  }
  const root = (json ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 40) : []) as Record<string, unknown>[];

  const characters: Extracted<ParsedCharacter>[] = [];
  for (const o of list(root.characters)) {
    const name = str(o?.name, 80);
    if (!name || !entityKey(name)) continue;
    characters.push({
      page: pageOf(o, lo, hi),
      entity: {
        name,
        race: str(o.race, 80),
        role: str(o.role, 160),
        alignment: str(o.alignment, 60),
        description: str(o.description, 1500),
        personality: str(o.personality, 1500),
        location: str(o.location, 200),
        stats: cleanStats(o.stats),
      },
    });
  }
  const items: Extracted<ParsedItem>[] = [];
  for (const o of list(root.items)) {
    const name = str(o?.name, 100);
    if (!name || !entityKey(name)) continue;
    items.push({
      page: pageOf(o, lo, hi),
      entity: {
        name,
        type: str(o.type, 100),
        rarity: str(o.rarity, 60),
        attunement: str(o.attunement, 120),
        description: str(o.description, 2500),
        properties: str(o.properties, 1500),
        location: str(o.location, 200),
      },
    });
  }
  return { characters, items };
}

// ---------- Склейка дубликатов ----------

/** Длиннее — подробнее. Если новый текст не содержит старый и наоборот — склеиваем, пока влезает в лимит. */
function longer(a: string, b: string, max: number): string {
  if (!a) return b;
  if (!b || a.includes(b)) return a;
  if (b.includes(a)) return b;
  const joined = `${a}\n${b}`;
  return joined.length <= max ? joined : a.length >= b.length ? a : b;
}

function mergeFeatures(a: Feature[], b: Feature[]): Feature[] {
  const out = [...a];
  for (const f of b) {
    const i = out.findIndex((x) => entityKey(x.name) === entityKey(f.name));
    if (i < 0) out.push(f);
    else if (f.desc.length > out[i].desc.length) out[i] = f;
  }
  return out.slice(0, 40);
}

const statFill = (s: CharStats) => [s.ac, s.hp, s.speed, s.cr].filter(Boolean).length + ABILITY_FIELDS.filter((k) => s[k] !== null).length + s.actions.length + s.traits.length;

function mergeStats(a: CharStats | null, b: CharStats | null): CharStats | null {
  if (!a || !b) return a ?? b;
  const [main, extra] = statFill(a) >= statFill(b) ? [a, b] : [b, a];
  const out: CharStats = { ...main };
  for (const k of ["ac", "hp", "speed", "cr", "saves", "skills", "resist", "senses", "languages"] as const) out[k] = main[k] || extra[k];
  for (const k of ABILITY_FIELDS) out[k] = main[k] ?? extra[k];
  out.traits = mergeFeatures(main.traits, extra.traits);
  out.actions = mergeFeatures(main.actions, extra.actions);
  return out;
}

export function mergeCharacter(a: ParsedCharacter, b: ParsedCharacter): ParsedCharacter {
  return {
    name: a.name.length >= b.name.length ? a.name : b.name,
    race: a.race || b.race,
    role: longer(a.role, b.role, 160).split("\n")[0],
    alignment: a.alignment || b.alignment,
    description: longer(a.description, b.description, 1500),
    personality: longer(a.personality, b.personality, 1500),
    location: a.location || b.location,
    stats: mergeStats(a.stats, b.stats),
  };
}

export function mergeItem(a: ParsedItem, b: ParsedItem): ParsedItem {
  return {
    name: a.name.length >= b.name.length ? a.name : b.name,
    type: a.type || b.type,
    rarity: a.rarity || b.rarity,
    attunement: a.attunement || b.attunement,
    description: longer(a.description, b.description, 2500),
    properties: longer(a.properties, b.properties, 1500),
    location: a.location || b.location,
  };
}

// ---------- Пин карты из найденного ----------

/** Готовые заметки пина по найденному в книге объекту: пользователь потом правит их как обычные записи. */
export function entityNotes(kind: EntityKind, data: ParsedCharacter | ParsedItem, pages: number[], bookTitle: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const add = (title: string, body: string | undefined | null) => {
    if (body && body.trim()) out.push({ title, body: body.trim() });
  };
  const source = `${bookTitle}${pages.length ? `, стр. ${pages.join(", ")}` : ""}`;

  if (kind === "character") {
    const c = data as ParsedCharacter;
    add("Кто это", [[c.race, c.role, c.alignment].filter(Boolean).join(" · "), c.location && `Где: ${c.location}`, `Источник: ${source}`].filter(Boolean).join("\n"));
    add("Описание", c.description);
    add("Характер и мотивация", c.personality);
    const s = c.stats;
    if (s) {
      const lines = [
        s.ac && `КД: ${s.ac}`,
        s.hp && `Хиты: ${s.hp}`,
        s.speed && `Скорость: ${s.speed}`,
        ABILITY_FIELDS.some((k) => s[k] !== null) && ABILITY_FIELDS.map((k) => `${ABILITY_LABELS[k]} ${s[k] === null ? "—" : `${s[k]} (${signed(abilityMod(s[k]!))})`}`).join(", "),
        s.saves && `Спасброски: ${s.saves}`,
        s.skills && `Навыки: ${s.skills}`,
        s.resist && `Сопротивления и иммунитеты: ${s.resist}`,
        s.senses && `Чувства: ${s.senses}`,
        s.languages && `Языки: ${s.languages}`,
        s.cr && `Опасность: ${s.cr}`,
      ].filter(Boolean) as string[];
      add("Характеристики", lines.join("\n"));
      add("Особенности", s.traits.map((f) => `${f.name}. ${f.desc}`).join("\n"));
      add("Действия", s.actions.map((f) => `${f.name}. ${f.desc}`).join("\n"));
    }
  } else {
    const i = data as ParsedItem;
    add("Предмет", [[i.type, i.rarity, i.attunement && `настройка: ${i.attunement}`].filter(Boolean).join(", "), i.location && `Где: ${i.location}`, `Источник: ${source}`].filter(Boolean).join("\n"));
    add("Описание", i.description);
    add("Свойства", i.properties);
  }
  return out;
}
