/**
 * Короткие поля статблока переводятся по словарю: это точнее и быстрее машинного перевода
 * (который, например, переводит «Scimitar» как «Гимитар», а «Nimble Escape» как «Побег из нимбла»).
 */

/** Применяет словарь к списку через запятую/«and»/«or»; null — если встретилось незнакомое слово. */
function dictList(text: string, dict: Record<string, string>, phrases: [string, string][] = []): string | null {
  let t = ` ${text.toLowerCase()} `;
  for (const [en, ru] of phrases) t = t.split(en).join(ru);
  t = t.replace(/, and /g, ", и ").replace(/ and /g, " и ").replace(/ or /g, " или ");
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const k of keys) t = t.replace(new RegExp(`(?<![a-z])${k}(?![a-z])`, "g"), dict[k]);
  return /[a-z]/.test(t) ? null : t.trim();
}

const DAMAGE_RU: Record<string, string> = {
  acid: "кислота",
  bludgeoning: "дробящий",
  cold: "холод",
  fire: "огонь",
  force: "силовое поле",
  lightning: "электричество",
  necrotic: "некротический",
  piercing: "колющий",
  poison: "яд",
  psychic: "психический",
  radiant: "излучение",
  slashing: "рубящий",
  thunder: "звук",
};

const DAMAGE_PHRASES: [string, string][] = [
  ["from nonmagical attacks that aren't adamantine", "от немагических атак, кроме адамантиновых"],
  ["from nonmagical attacks that aren't silvered", "от немагических атак, кроме посеребрённых"],
  ["from nonmagical attacks", "от немагических атак"],
  ["from nonmagical weapons", "от немагического оружия"],
  ["nonmagical attacks", "немагические атаки"],
];

export const damageListRu = (s: string) => dictList(s, DAMAGE_RU, DAMAGE_PHRASES);

const CONDITION_RU: Record<string, string> = {
  blinded: "ослеплён",
  charmed: "очарован",
  deafened: "оглох",
  exhaustion: "истощение",
  frightened: "напуган",
  grappled: "схвачен",
  incapacitated: "недееспособен",
  invisible: "невидим",
  paralyzed: "парализован",
  petrified: "окаменел",
  poisoned: "отравлен",
  prone: "сбит с ног",
  restrained: "опутан",
  stunned: "ошеломлён",
  unconscious: "без сознания",
};
export const conditionListRu = (s: string) => dictList(s, CONDITION_RU);

const SENSE_RU: Record<string, string> = {
  darkvision: "тёмное зрение",
  blindsight: "слепое зрение",
  truesight: "истинное зрение",
  tremorsense: "чувство вибрации",
};

/** «darkvision 60 ft., passive Perception 9» → «тёмное зрение 60 фт., пассивная Внимательность 9». */
export function sensesRu(s: string): string | null {
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    let m = /^(darkvision|blindsight|truesight|tremorsense) (\d+) ft\.?(?: \(blind beyond this radius\))?$/i.exec(p);
    if (m) {
      out.push(`${SENSE_RU[m[1].toLowerCase()]} ${m[2]} фт.${/blind beyond/i.test(p) ? " (слепой за этим радиусом)" : ""}`);
      continue;
    }
    m = /^passive Perception (\d+)$/i.exec(p);
    if (m) {
      out.push(`пассивная Внимательность ${m[1]}`);
      continue;
    }
    return null;
  }
  return out.join(", ");
}

const LANGUAGE_RU: Record<string, string> = {
  common: "Общий",
  abyssal: "Бездны",
  aquan: "Акван",
  auran: "Ауран",
  celestial: "Небесный",
  draconic: "Драконий",
  "deep speech": "Глубинная речь",
  dwarvish: "Дварфийский",
  elvish: "Эльфийский",
  giant: "Великаний",
  gnomish: "Гномий",
  goblin: "Гоблинский",
  gnoll: "Гнолльский",
  halfling: "Полуросличий",
  ignan: "Игнан",
  infernal: "Инфернальный",
  orc: "Орочий",
  primordial: "Первичный",
  sylvan: "Сильван",
  terran: "Терран",
  undercommon: "Подземный",
  "thieves' cant": "воровской жаргон",
  "void speech": "Язык Пустоты",
  all: "все",
};

/** Языки: известные переводим, незнакомые оставляем как есть (машинный перевод названий языков только портит). */
export function languagesRu(s: string): string {
  return s
    .split(/(, |; )/)
    .map((tok) => {
      if (tok === ", " || tok === "; ") return tok;
      const t = tok.trim();
      const tele = /^telepathy (\d+) ft\.?$/i.exec(t);
      if (tele) return `телепатия ${tele[1]} фт.`;
      return LANGUAGE_RU[t.toLowerCase()] ?? t;
    })
    .join("");
}

const SUBTYPE_RU: Record<string, string> = {
  goblinoid: "гоблиноид",
  shapechanger: "перевёртыш",
  demon: "демон",
  devil: "дьявол",
  elf: "эльф",
  human: "человек",
  dwarf: "дварф",
  gnome: "гном",
  halfling: "полурослик",
  orc: "орк",
  titan: "титан",
  swarm: "рой",
  "any race": "любая раса",
  "any lineage": "любое происхождение",
  kobold: "кобольд",
  gnoll: "гнолл",
  lizardfolk: "ящеролюд",
  merfolk: "русал",
  sahuagin: "сахуагин",
  yugoloth: "югнолот",
};
export const subtypeRu = (s: string) => SUBTYPE_RU[s.toLowerCase()] ?? s;

const ARMOR_RU: Record<string, string> = {
  "natural armor": "природный доспех",
  "leather armor": "кожаный доспех",
  "studded leather": "проклёпанный кожаный доспех",
  "studded leather armor": "проклёпанный кожаный доспех",
  "hide armor": "шкурный доспех",
  "chain shirt": "кольчужная рубаха",
  "chain mail": "кольчуга",
  "scale mail": "чешуйчатый доспех",
  breastplate: "нагрудник",
  "half plate": "полулаты",
  "half plate armor": "полулаты",
  plate: "латы",
  "plate armor": "латы",
  "splint armor": "наборный доспех",
  splint: "наборный доспех",
  "ring mail": "кольчужный доспех",
  "padded armor": "стёганый доспех",
  shield: "щит",
  "mage armor": "магический доспех",
};
export function armorDescRu(s: string): string | null {
  const parts = s.split(/,\s*/).map((p) => ARMOR_RU[p.trim().toLowerCase()]);
  return parts.every(Boolean) ? parts.join(", ") : null;
}

const ABILITY_NAME_RU: Record<string, string> = {
  multiattack: "Мультиатака",
  beak: "Клюв",
  "keen sight and smell": "Острое зрение и обоняние",
  talons: "Когти",
  horns: "Рога",
  fist: "Кулак",
  fists: "Кулаки",
  "slam attack": "Удар",
  hoof: "Копыто",
  trample: "Растаптывание",
  "poison spray": "Ядовитый плевок",
  "acid spray": "Кислотный плевок",
  "frost breath": "Ледяное дыхание",
  "lightning breath": "Дыхание молний",
  "poison breath": "Ядовитое дыхание",
  "acid breath": "Кислотное дыхание",
  "life drain": "Похищение жизни",
  "etherealness": "Эфирность",
  incorporeal: "Бестелесность",
  "incorporeal movement": "Бестелесное движение",
  "rejuvenation": "Омоложение",
  "read thoughts": "Чтение мыслей",
  telepathy: "Телепатия",
  "devil's sight": "Взгляд дьявола",
  bite: "Укус",
  claw: "Коготь",
  claws: "Когти",
  tail: "Хвост",
  "tail attack": "Удар хвостом",
  "wing attack": "Удар крыльями",
  slam: "Удар",
  gore: "Бодание",
  hooves: "Копыта",
  sting: "Жало",
  stinger: "Жало",
  rock: "Камень",
  club: "Дубинка",
  dagger: "Кинжал",
  javelin: "Метательное копьё",
  spear: "Копьё",
  scimitar: "Скимитар",
  shortsword: "Короткий меч",
  longsword: "Длинный меч",
  greatsword: "Двуручный меч",
  greataxe: "Секира",
  shortbow: "Короткий лук",
  longbow: "Длинный лук",
  "light crossbow": "Лёгкий арбалет",
  "heavy crossbow": "Тяжёлый арбалет",
  "breath weapon": "Оружие дыхания",
  "fire breath": "Огненное дыхание",
  "frightful presence": "Ужасающее присутствие",
  "legendary resistance": "Легендарное сопротивление",
  "magic resistance": "Сопротивление магии",
  "magic weapons": "Магическое оружие",
  "pack tactics": "Тактика стаи",
  "keen senses": "Острые чувства",
  "keen smell": "Острое обоняние",
  "keen hearing and smell": "Острый слух и обоняние",
  "keen sight": "Острое зрение",
  "nimble escape": "Проворный побег",
  amphibious: "Амфибия",
  regeneration: "Регенерация",
  spellcasting: "Использование заклинаний",
  "innate spellcasting": "Врождённое колдовство",
  flyby: "Пролёт",
  charge: "Рывок",
  rampage: "Буйство",
  reckless: "Безрассудство",
  parry: "Парирование",
  "shield bash": "Удар щитом",
  swallow: "Проглатывание",
  engulf: "Поглощение",
  constrict: "Сдавливание",
  "web sense": "Чувство паутины",
  "web walker": "Хождение по паутине",
  "spider climb": "Лазание как паук",
  "change shape": "Смена облика",
  shapechanger: "Перевёртыш",
  "false appearance": "Ложная внешность",
  "undead fortitude": "Стойкость нежити",
  "sunlight sensitivity": "Чувствительность к солнечному свету",
  "sunlight hypersensitivity": "Повышенная чувствительность к солнцу",
  "turn immunity": "Иммунитет к изгнанию",
  "siege monster": "Монстр осады",
  "hold breath": "Задержка дыхания",
  "water breathing": "Подводное дыхание",
  "standing leap": "Прыжок с места",
  "running leap": "Прыжок с разбега",
  detect: "Обнаружение",
  teleport: "Телепортация",
  "tail swipe": "Взмах хвостом",
  "wing buffet": "Удар крылом",
  "lair actions": "Действия логова",
};

const PAREN_RU: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^recharge (\d)(?:-(\d))?$/i, (m) => `Перезарядка ${m[1]}${m[2] ? `-${m[2]}` : ""}`],
  [/^costs (\d+) actions?$/i, (m) => `Стоит ${m[1]} ${Number(m[1]) < 5 ? "действия" : "действий"}`],
  [/^(\d+)\/day$/i, (m) => `${m[1]}/день`],
  [/^(\d+)\/day each$/i, (m) => `${m[1]}/день каждое`],
  [/^recharges after a short or long rest$/i, () => "Перезаряжается после короткого или продолжительного отдыха"],
  [/^recharges after a short rest$/i, () => "Перезаряжается после короткого отдыха"],
  [/^recharges after a long rest$/i, () => "Перезаряжается после продолжительного отдыха"],
];

/** Русское название способности/действия (с оригиналом в скобках) или null, если названия нет в словаре. */
export function abilityNameRu(name: string): string | null {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name);
  const base = (m ? m[1] : name).trim().toLowerCase();
  const ru = ABILITY_NAME_RU[base];
  if (!ru) return null;
  let paren = "";
  if (m) {
    const inner = PAREN_RU.map(([re, fn]) => {
      const r = re.exec(m[2].trim());
      return r ? fn(r) : null;
    }).find(Boolean);
    paren = ` (${inner ?? m[2]})`;
  }
  return `${ru}${paren} (${name.replace(/\s*\([^)]*\)\s*$/, "").trim()})`;
}

/** Фразы, которые переводятся только по словарю (ячейки таблиц, заголовки): машинный перевод их путает. */
const EXACT_RU: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  "very rare": "Очень редкий",
  legendary: "Легендарный",
  artifact: "Артефакт",
  rarity: "Редкость",
  "hp regained": "Восстанавливает хитов",
  "hit points regained": "Восстанавливает хитов",
  "dice roll": "Бросок",
  result: "Результат",
  effect: "Эффект",
  cost: "Цена",
  item: "Предмет",
  weight: "Вес",
  level: "Уровень",
  name: "Название",
  duration: "Длительность",
};
export const exactRu = (s: string): string | null => EXACT_RU[s.trim().toLowerCase().replace(/[.:]$/, "")] ?? null;
