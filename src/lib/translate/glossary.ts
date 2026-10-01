import { skillRu } from "./static";

/**
 * Глоссарий D&D 5e для машинного перевода. Бесплатный переводчик плохо знает игровые термины
 * («saving throw» → «спасительный бросок», «hit points» → «точки удара»), поэтому термины перед
 * переводом заменяются латинскими метками Q1Z, Q2Z… (переводчик их не трогает), а после — подставляются
 * правильные русские формулировки. Грамматика подстраивается эвристиками (хитов/хиты, урон/урона).
 */

const ABIL = "strength|dexterity|constitution|intelligence|wisdom|charisma";
const ABIL_GEN: Record<string, string> = {
  strength: "Силы",
  dexterity: "Ловкости",
  constitution: "Телосложения",
  intelligence: "Интеллекта",
  wisdom: "Мудрости",
  charisma: "Харизмы",
};
const SKILLS_EN =
  "athletics|acrobatics|animal handling|arcana|deception|history|insight|intimidation|investigation|medicine|nature|perception|performance|persuasion|religion|sleight of hand|stealth|survival";

const DMG_ADJ: Record<string, string> = {
  acid: "кислотного",
  bludgeoning: "дробящего",
  cold: "холодного",
  fire: "огненного",
  force: "силового",
  lightning: "электрического",
  necrotic: "некротического",
  piercing: "колющего",
  poison: "ядовитого",
  psychic: "психического",
  radiant: "лучистого",
  slashing: "рубящего",
  thunder: "звукового",
};
const DMG = Object.keys(DMG_ADJ).join("|");
const DMG_NOM: Record<string, string> = {
  acid: "кислотный",
  bludgeoning: "дробящий",
  cold: "холодный",
  fire: "огненный",
  force: "силовой",
  lightning: "электрический",
  necrotic: "некротический",
  piercing: "колющий",
  poison: "ядовитый",
  psychic: "психический",
  radiant: "лучистый",
  slashing: "рубящий",
  thunder: "звуковой",
};

const CONDITIONS: Record<string, string> = {
  prone: "сбит с ног",
  restrained: "опутан",
  grappled: "схвачен",
  incapacitated: "недееспособен",
  paralyzed: "парализован",
  petrified: "окаменел",
  unconscious: "без сознания",
  blinded: "ослеплён",
  deafened: "оглох",
};

type Rule = [RegExp, (m: string[]) => string | [string, string]];
const plural = (s: string) => /s$/i.test(s);

// Порядок важен: сначала длинные и специфичные конструкции.
const RULES: Rule[] = [
  // Разметка внутри предложения (курсив — обычно названия заклинаний/предметов) остаётся как есть.
  [/(\*\*[^*\n]+\*\*|(?<![\w])_[^_\n]+_(?![\w])|(?<![\w*])\*[^*\n]+\*(?![\w*]))/g, (m) => m[0]],

  // Типовые фразы заклинаний: переводчик их ломает, поэтому берём готовые формулировки
  [/\bWhen you cast this spell using a spell slot of (\d+)(?:st|nd|rd|th) level or higher,/g, (m) => `Если вы накладываете это заклинание, используя ячейку заклинания ${m[1]}-го круга или выше,`],
  [/\bfor each slot level above (\d+)(?:st|nd|rd|th)\b/g, (m) => `за каждый круг ячейки выше ${m[1]}-го`],
  [/\bspellcasting ability modifier\b/gi, () => "модификатор базовой характеристики заклинателя"],
  [/\bspellcasting ability\b/gi, () => "базовая характеристика заклинателя"],
  [/\bon a failed save\b/gi, () => "при проваленном спасброске"],
  [/\bon a successful save\b/gi, () => "при успешном спасброске"],
  [/\bsucceed on a DC (\d+) (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw\b/gi, (m) => ["pass ", `спасбросок ${ABIL_GEN[m[2].toLowerCase()]} Сл ${m[1]}`]],
  [/\bsucceeds on a DC (\d+) (strength|dexterity|constitution|intelligence|wisdom|charisma) saving throw\b/gi, (m) => ["passes ", `спасбросок ${ABIL_GEN[m[2].toLowerCase()]} Сл ${m[1]}`]],
  [/\bsucceed on a saving throw\b/gi, () => ["pass ", "спасбросок"]],
  [/\bsucceeds on a saving throw\b/gi, () => ["passes ", "спасбросок"]],
  [/\bfails (?:a|its|the) (?:(strength|dexterity|constitution|intelligence|wisdom|charisma) )?saving throw\b/gi, (m) => (m[1] ? `проваливает спасбросок ${ABIL_GEN[m[1].toLowerCase()]}` : "проваливает спасбросок")],
  [/\bfail (?:a|their|the) (?:(strength|dexterity|constitution|intelligence|wisdom|charisma) )?saving throw\b/gi, (m) => (m[1] ? `проваливают спасбросок ${ABIL_GEN[m[1].toLowerCase()]}` : "проваливают спасбросок")],
  // Глагол оставляем переводчику (метка на месте «голого» глагола теряется), а меткой делаем существительное «ход».
  [/\b((?:starts?|ends?) (?:its|their|your)) turn\b/gi, (m) => [`${m[1]} `, "ход"]],
  // Преимущество/помеха: «имеет помеху» (винительный падеж), «с помехой»
  [/\b(has|have) disadvantage\b/gi, (m) => (m[1].toLowerCase() === "has" ? "имеет помеху" : "имеют помеху")],
  [/\b(has|have) advantage\b/gi, (m) => (m[1].toLowerCase() === "has" ? "имеет преимущество" : "имеют преимущество")],
  [/\bwith disadvantage\b/gi, () => "с помехой"],
  [/\bwith advantage\b/gi, () => "с преимуществом"],
  // Стандартные действия
  [/\b(?:the )?(Dash|Disengage|Dodge|Help|Hide|Ready|Search|Attack|Use an Object) action\b/g, (m) => `действие ${{ Dash: "Рывок", Disengage: "Отход", Dodge: "Уклонение", Help: "Помощь", Hide: "Засада", Ready: "Подготовка", Search: "Поиск", Attack: "Атака", "Use an Object": "Использование предмета" }[m[1]]}`],
  // «Ход» (turn): переводчик говорит «поворот»
  [/\b(at the start of|at the end of|until the start of|until the end of|at the beginning of) (its|their|your|each of its|that creature's|the creature's|the target's) (next )?turns?\b/gi, (m) => {
    const own = /^your/i.test(m[2]) ? "вашего" : "своего";
    const what = m[3] ? "следующего" : own;
    const pre = { "at the start of": "в начале", "at the end of": "в конце", "until the start of": "до начала", "until the end of": "до конца", "at the beginning of": "в начале" }[m[1].toLowerCase()];
    return `${pre} ${what} хода`;
  }],
  [/\bon (its|their|your) turns?\b/gi, (m) => (/^your/i.test(m[1]) ? "в ваш ход" : "в свой ход")],
  [/\bon each of its turns\b/gi, () => "в каждый из своих ходов"],
  [/\beach turn\b/gi, () => "каждый ход"],
  [/\btakes\b(?=\s+(?:Q\d+Z|\d))/g, () => "получает"],

  // Типовые строки атак
  [/\bMelee or Ranged Weapon Attack:/g, () => "Рукопашная или дальнобойная атака оружием:"],
  [/\bMelee Weapon Attack:/g, () => "Рукопашная атака оружием:"],
  [/\bRanged Weapon Attack:/g, () => "Дальнобойная атака оружием:"],
  [/\bMelee Spell Attack:/g, () => "Рукопашная атака заклинанием:"],
  [/\bRanged Spell Attack:/g, () => "Дальнобойная атака заклинанием:"],
  [/\b(?:Melee|Ranged) Attack Roll:/g, (m) => (/Melee/.test(m[0]) ? "Рукопашная атака:" : "Дальнобойная атака:")],
  [/\bHit or Miss:/g, () => "Попадание или промах:"],
  [/\bHit:/g, () => "Попадание:"],
  [/([+-]\d+) to hit\b/g, (m) => `${m[1]} к попаданию`],
  [/\breach (\d+) ft\./g, (m) => `досягаемость ${m[1]} фт.`],
  [/\brange (\d+(?:\/\d+)?) ft\./g, (m) => `дистанция ${m[1]} фт.`],
  [/\bone target\b/gi, () => "одна цель"],
  [/\bone creature\b/gi, () => "одно существо"],

  // Урон с числом/костью: «7 (2d6) piercing damage» → «7 (2d6) колющего урона»
  [
    new RegExp(`(\\d+(?: \\([^)]+\\))?|\\d+d\\d+(?: ?[+-] ?\\d+)?) (${DMG}) damage`, "gi"),
    (m) => (m[2].toLowerCase() === "radiant" ? `${m[1]} урона излучением` : `${m[1]} ${DMG_ADJ[m[2].toLowerCase()]} урона`),
  ],
  [new RegExp(`\\b(${DMG}) damage\\b`, "gi"), (m) => `${DMG_NOM[m[1].toLowerCase()]} урон`],
  [/(?<=\b(?:half as much|much|more|less|any|no|the amount of|of|extra|additional|bonus)\s)damage\b/gi, () => "урона"],
  [/\bdamage\b/g, () => "урон"],

  // Проверки и спасброски
  [new RegExp(`\\b(${ABIL}) \\((${SKILLS_EN})\\) (checks?)\\b`, "gi"), (m) => `${plural(m[3]) ? "проверки" : "проверка"} ${ABIL_GEN[m[1].toLowerCase()]} (${skillRu(m[2].toLowerCase())})`],
  [new RegExp(`\\b(${ABIL}) saving throws?\\b`, "gi"), (m) => `${plural(m[0]) ? "спасброски" : "спасбросок"} ${ABIL_GEN[m[1].toLowerCase()]}`],
  [new RegExp(`\\b(${ABIL}) (checks?)\\b`, "gi"), (m) => `${plural(m[2]) ? "проверки" : "проверка"} ${ABIL_GEN[m[1].toLowerCase()]}`],
  [/\bsaving throws?\b/gi, (m) => (plural(m[0]) ? "спасброски" : "спасбросок")],
  [/\bability checks?\b/gi, (m) => (plural(m[0]) ? "проверки характеристик" : "проверка характеристики")],
  [/\battack rolls?\b/gi, (m) => (plural(m[0]) ? "броски атаки" : "бросок атаки")],
  [/\bdamage rolls?\b/gi, (m) => (plural(m[0]) ? "броски урона" : "бросок урона")],
  [/\bspell save DC\b/gi, () => "Сл спасброска заклинаний"],
  [/\bDC\b/g, () => "Сл"],
  [/\bArmor Class\b/gi, () => "Класс Доспеха"],
  [/\bproficiency bonus\b/gi, () => "бонус мастерства"],
  [/\bspell attack\b/gi, () => "атака заклинанием"],

  // Хиты: после числа и «of» — родительный падеж
  [/(?<=\d\s)temporary hit points\b/gi, () => "временных хитов"],
  [/(?<=\d\s)hit points\b/gi, () => "хитов"],
  [/(?<=\b(?:of|maximum|its|their|your)\s)hit points\b/gi, () => "хитов"],
  [/\btemporary hit points\b/gi, () => "временные хиты"],
  [/\bhit points\b/gi, () => "хиты"],
  [/\bhit point\b/gi, () => "хит"],
  [/\bHit Dice\b/g, () => "Кости Хитов"],

  // Действия
  [/\blegendary actions?\b/gi, (m) => (plural(m[0]) ? "легендарные действия" : "легендарное действие")],
  [/\bbonus actions?\b/gi, (m) => (plural(m[0]) ? "бонусные действия" : "бонусное действие")],
  [/\breactions?\b/gi, (m) => (plural(m[0]) ? "реакции" : "реакция")],
  [/\binitiative\b/gi, () => "инициатива"],
  [/\bspell slots?\b/gi, (m) => (plural(m[0]) ? "ячейки заклинаний" : "ячейка заклинания")],
  [/\bshort rest\b/gi, () => "короткий отдых"],
  [/\blong rest\b/gi, () => "продолжительный отдых"],
  [/\bconcentration\b/gi, () => "концентрация"],
  [/\bdisadvantage\b/gi, () => "помеха"],
  [/\badvantage\b/gi, () => "преимущество"],
  [/\bmagic missile\b/gi, () => "магическая стрела"],

  // Состояния, которые переводчик путает
  [new RegExp(`\\b(${Object.keys(CONDITIONS).join("|")})\\b`, "gi"), (m) => CONDITIONS[m[1].toLowerCase()]],
];

const capitalizeFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Заменяет термины метками Q1Z… Возвращает текст для перевода и функцию обратной подстановки. */
export function protect(text: string): { text: string; restore: (ru: string) => string | null } {
  const values: string[] = [];
  let out = text;
  for (const [re, fn] of RULES) {
    out = out.replace(re, (...args: unknown[]) => {
      const firstNum = args.findIndex((a) => typeof a === "number");
      const m = args.slice(0, firstNum) as string[];
      const r = fn(m);
      // [«pass », «спасбросок …»]: английский глагол остаётся переводчику (он согласует его с подлежащим), метка — существительное.
      if (Array.isArray(r)) {
        values.push(r[1]);
        return `${r[0]}Q${values.length}Z`;
      }
      values.push(r);
      return `Q${values.length}Z`;
    });
  }
  return {
    text: out,
    restore(ru) {
      // Каждая метка обязана дожить до результата, иначе перевод ненадёжен и вызывающий повторит без глоссария.
      const seen = new Set<number>();
      const res = ru.replace(/Q\s?(\d+)\s?Z/g, (full, n: string, offset: number) => {
        const i = Number(n) - 1;
        if (!(i in values)) return full;
        seen.add(i);
        const before = ru.slice(0, offset);
        const atSentenceStart = /(^|[.!?:]\s+)$/.test(before) || before.trim() === "";
        return atSentenceStart ? capitalizeFirst(values[i]) : values[i];
      });
      return seen.size === values.length ? res : null;
    },
  };
}
