/** Русские подписи для значений из API (сами тексты заклинаний/предметов остаются на английском). */

export const SCHOOLS: Record<string, string> = {
  abjuration: "Ограждение",
  conjuration: "Вызов",
  divination: "Прорицание",
  enchantment: "Очарование",
  evocation: "Воплощение",
  illusion: "Иллюзия",
  necromancy: "Некромантия",
  transmutation: "Преобразование",
};

export const DAMAGE_TYPES: Record<string, string> = {
  acid: "Кислота",
  bludgeoning: "Дробящий",
  cold: "Холод",
  fire: "Огонь",
  force: "Силовое поле",
  lightning: "Электричество",
  necrotic: "Некротический",
  piercing: "Колющий",
  poison: "Яд",
  psychic: "Психический",
  radiant: "Излучение",
  slashing: "Рубящий",
  thunder: "Звук",
};

export const CONDITIONS: Record<string, string> = {
  blinded: "Ослеплён",
  charmed: "Очарован",
  deafened: "Оглохший",
  frightened: "Испуган",
  grappled: "Схвачен",
  incapacitated: "Недееспособен",
  invisible: "Невидим",
  paralyzed: "Парализован",
  petrified: "Окаменел",
  poisoned: "Отравлен",
  prone: "Сбит с ног",
  restrained: "Опутан",
  stunned: "Ошеломлён",
  unconscious: "Без сознания",
};

export const ABILITIES: Record<string, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
};

export const CLASSES: Record<string, string> = {
  bard: "Бард",
  cleric: "Жрец",
  druid: "Друид",
  paladin: "Паладин",
  ranger: "Следопыт",
  sorcerer: "Чародей",
  warlock: "Колдун",
  wizard: "Волшебник",
};

export const CASTING_TIMES: Record<string, string> = {
  action: "Действие",
  "bonus-action": "Бонусное действие",
  reaction: "Реакция",
  "1minute": "1 минута",
  "10minutes": "10 минут",
  "1hour": "1 час",
  "8hours": "8 часов",
  "12hours": "12 часов",
  "24hours": "24 часа",
};

export const RARITIES: Record<string, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  "very-rare": "Очень редкий",
  legendary: "Легендарный",
  artifact: "Артефакт",
};

export const ITEM_CATEGORIES: Record<string, string> = {
  "adventuring-gear": "Снаряжение",
  ammunition: "Боеприпасы",
  armor: "Доспехи",
  "equipment-pack": "Наборы снаряжения",
  "land-vehicle": "Наземный транспорт",
  mount: "Ездовые животные",
  poison: "Яды",
  potion: "Зелья",
  ring: "Кольца",
  rod: "Жезлы",
  scroll: "Свитки",
  shield: "Щиты",
  "spellcasting-focus": "Магическая фокусировка",
  staff: "Посохи",
  tools: "Инструменты",
  "trade-good": "Товары",
  wand: "Волшебные палочки",
  "waterborne-vehicle": "Водный транспорт",
  weapon: "Оружие",
  "wondrous-item": "Чудесные предметы",
};

export const MONSTER_TYPES: Record<string, string> = {
  aberration: "Аберрация",
  beast: "Зверь",
  celestial: "Небожитель",
  construct: "Конструкт",
  dragon: "Дракон",
  elemental: "Элементаль",
  fey: "Фея",
  fiend: "Исчадие",
  giant: "Великан",
  humanoid: "Гуманоид",
  monstrosity: "Монстр",
  ooze: "Слизь",
  plant: "Растение",
  swarm: "Рой",
  undead: "Нежить",
};

export const SIZES: Record<string, string> = {
  tiny: "Крошечный",
  small: "Маленький",
  medium: "Средний",
  large: "Большой",
  huge: "Огромный",
  gargantuan: "Громадный",
  titanic: "Титанический",
};

export const MONSTER_CONDITIONS: Record<string, string> = { ...CONDITIONS, exhaustion: "Истощение" };

export const MOVEMENTS: Record<string, string> = {
  fly: "Летает",
  swim: "Плавает",
  climb: "Лазает",
  burrow: "Копает",
};

export const SENSES: Record<string, string> = {
  darkvision: "Тёмное зрение",
  blindsight: "Слепое зрение",
  truesight: "Истинное зрение",
  tremorsense: "Чувство вибрации",
};

export const ENVIRONMENTS: Record<string, string> = {
  forest: "Лес",
  desert: "Пустыня",
  grassland: "Равнины",
  mountain: "Горы",
  mountains: "Горы",
  jungle: "Джунгли",
  underdark: "Подземье",
  hill: "Холмы",
  hills: "Холмы",
  ruin: "Руины",
  ruins: "Руины",
  swamp: "Болото",
  urban: "Город",
  cavern: "Пещеры",
  caverns: "Пещеры",
  settlement: "Поселение",
  water: "Вода",
  coastal: "Побережье",
  feywild: "Страна фей",
  shadowfell: "Царство теней",
  sewer: "Канализация",
  arctic: "Арктика",
  tundra: "Тундра",
  laboratory: "Лаборатория",
  temple: "Храм",
  tomb: "Гробница",
  underwater: "Под водой",
  abyss: "Бездна",
  hell: "Ад",
  planar: "Иные планы",
  "astral plane": "Астральный план",
  "plane of earth": "План земли",
  "plane of water": "План воды",
  "plane of fire": "План огня",
  "plane of air": "План воздуха",
};

export const ALIGN_MORAL: Record<string, string> = {
  good: "Добрые",
  neutral: "Нейтральные",
  evil: "Злые",
  unaligned: "Без мировоззрения",
};
export const ALIGN_LAW: Record<string, string> = {
  lawful: "Законные",
  neutral: "Нейтральные",
  chaotic: "Хаотичные",
};

export const label = (map: Record<string, string>, key: string | null | undefined) =>
  key ? (map[key] ?? key) : "";
