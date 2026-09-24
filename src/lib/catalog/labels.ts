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

export const label = (map: Record<string, string>, key: string | null | undefined) =>
  key ? (map[key] ?? key) : "";
