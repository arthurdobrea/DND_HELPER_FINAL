/** Инструкции для Gemini в ИИ-кузнице и разбор ответа (только сервер; вынесено из server actions ради проверок). */
import { AiError } from "@/lib/ai/gemini";
import type { AiKind, AiOptions } from "@/lib/ai-forge";
import { CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, ITEM_CATEGORIES, MONSTER_TYPES, RARITIES, SCHOOLS, SIZES } from "@/lib/catalog/labels";
import { crText } from "@/lib/cr";

const list = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k} (${v})`).join(", ");

// ---------- Инструкции для Gemini ----------

const COMMON = `Ты — опытный автор материалов для D&D 5e (редакция 2014) и помогаешь мастеру.
Пиши по-русски, в стиле официальных русских переводов D&D: «Сл», «к попаданию», «фт.», «спасбросок Ловкости».
Баланс — по правилам Руководства мастера. Каждый вариант должен заметно отличаться от остальных.
Отвечай ТОЛЬКО JSON вида {"variants": [ ... ]} без пояснений.`;

const MONSTER_SYSTEM = `${COMMON}

Каждый вариант — объект существа:
{
 "name": "имя",
 "size": один из ключей: ${Object.keys(SIZES).join(", ")},
 "type": один из ключей: ${Object.keys(MONSTER_TYPES).join(", ")},
 "law": "lawful" | "neutral" | "chaotic", "moral": "good" | "neutral" | "evil" | "unaligned",
 "cr": число из 0, 0.125, 0.25, 0.5, 1…30,
 "ac": число, "armorDesc": "природный доспех" или "",
 "hp": число (среднее по костям хитов размера и Телосложению),
 "speed": {"walk": 30, "fly": 0, "swim": 0, "climb": 0, "burrow": 0},
 "scores": {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10},
 "saves": ["con", "wis"] — спасброски с владением,
 "skills": навыки с владением, ключи: acrobatics, animal, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleight, stealth, survival,
 "vulnerabilities": "", "resistances": "", "immunities": "", "conditionImmunities": "" — по-русски, через запятую,
 "senses": "тёмное зрение 60 фт., пассивная Внимательность 12",
 "languages": "Общий",
 "multiattack": сколько атак за действие «Мультиатака» (1 — нет мультиатаки; саму мультиатаку в abilities НЕ пиши),
 "legendaryDesc": "" (программа подставит стандартный текст, если есть легендарные действия),
 "motivation": "чего хочет существо, 1 предложение",
 "backstory": "кто это и откуда, 1–3 предложения",
 "abilities": [ способности ]
}

Способности бывают четырёх видов. Для атак и областей числа (бонус попадания, Сл, бонус урона) программа сама считает из характеристик и CR — НЕ пиши их.
1) Атака: {"kind": "attack", "section": "action" | "bonus" | "reaction" | "legendary", "name": "Коготь", "ranged": false, "spell": false, "abil": "str" | "dex" | "int" | "wis" | "cha", "reach": "5 фт." (для дальнобойной — "80/320 фт."), "dice": "2d6", "dmgType": ключ урона, "extraDice": "" или "2d6" (доп. урон), "extraType": ключ урона, "usage": ""}
2) Область со спасброском: {"kind": "save", "section": "action" | "bonus" | "reaction" | "legendary", "name": "Огненное дыхание", "dcAbil": "con", "saveAbil": "dex", "shape": "конус 30 фт.", "dice": "8d6", "dmgType": ключ урона, "half": true, "effect": "доп. эффект по-русски или пусто", "usage": "Перезарядка 5–6"}
3) Колдовство (не больше одной): {"kind": "spells", "abil": "int" | "wis" | "cha", "slots": [4,3,2,0,0,0,0,0,0], "spells": [{"name": "Огненный снаряд", "level": 0, "usage": "slot" | "will" | "1" | "2" | "3"}]} — названия заклинаний по-русски, как в PHB.
4) Текст: {"kind": "text", "section": "special" | "action" | "bonus" | "reaction" | "legendary", "name": "Амфибия", "desc": "описание"} — для особенностей и сложных действий. Если в тексте есть атака или спасбросок, пиши числа в формате: «+7 к попаданию», «Сл 15», «13 (2d8+4) дробящий урон».
Ключи урона: ${Object.keys(DAMAGE_TYPES).join(", ")}.
usage: "", "Перезарядка 5–6", "Перезарядка 6", "1/день", "2/день", "3/день".
Урон за раунд, хиты и КД должны соответствовать CR по таблице Руководства мастера. Обычно 3–7 способностей; у легендарного существа — 2–3 легендарных действия.`;

const SPELL_SYSTEM = `${COMMON}

Каждый вариант — объект заклинания:
{
 "name": "название",
 "level": 0–9 (0 — заговор),
 "school": один из ключей: ${list(SCHOOLS)},
 "classes": ключи классов: ${Object.keys(CLASSES).join(", ")},
 "castingTime": один из ключей: ${Object.keys(CASTING_TIMES).join(", ")},
 "reactionCondition": null или условие реакции по-русски,
 "range": "60 фт." / "На себя" / "Касание",
 "area": null или "сфера радиусом 20 фт.",
 "duration": "Мгновенная" / "1 минута" / ...,
 "concentration": false, "ritual": false,
 "components": {"v": true, "s": true, "m": false}, "material": "",
 "save": "" или ключ: strength, dexterity, constitution, intelligence, wisdom, charisma,
 "attack": false — нужен ли бросок атаки заклинанием,
 "damageRoll": "8d6" или "",
 "damageTypes": ключи урона: ${Object.keys(DAMAGE_TYPES).join(", ")},
 "conditions": ключи состояний: ${Object.keys(CONDITIONS).join(", ")},
 "desc": "полное описание по правилам, можно в несколько абзацев",
 "higherLevel": "что даёт ячейка выше круга, или пусто"
}
Урон сверяй с таблицей урона заклинаний по кругам из Руководства мастера.`;

const ITEM_SYSTEM = `${COMMON}

Каждый вариант — объект предмета:
{
 "name": "название",
 "magic": true,
 "category": один из ключей: ${list(ITEM_CATEGORIES)},
 "rarity": null для немагических или ключ: ${Object.keys(RARITIES).join(", ")},
 "attunement": false, "attunementDetail": null или "волшебником",
 "price": цена в золотых (для магических — по редкости из Руководства Занатара),
 "weight": вес в фунтах или null,
 "weapon": null или {"damage": "1d8", "damageType": ключ урона (${Object.keys(DAMAGE_TYPES).join(", ")}), "kind": "simple" | "martial", "properties": [{"name": "Универсальное", "detail": "1d10", "desc": ""}]},
 "armor": null или {"ac": "14 + модификатор Ловкости (макс. 2)", "category": "light" | "medium" | "heavy" | "shield", "stealthDisadvantage": false, "strength": null},
 "desc": "описание: как выглядит и что делает, свойства и заряды по правилам"
}
Сила предмета должна соответствовать редкости.`;

export const SYSTEM: Record<AiKind, string> = { monster: MONSTER_SYSTEM, spell: SPELL_SYSTEM, item: ITEM_SYSTEM };
/** Ответ на вариант: монстр длинный, предметы и заклинания — короче. С запасом на «размышления» модели. */
export const TOKENS: Record<AiKind, number> = { monster: 6000, spell: 3500, item: 3000 };

export function constraints(kind: AiKind, o: Partial<AiOptions>): string[] {
  const out: string[] = [];
  if (kind === "monster") {
    if (o.cr) out.push(`CR ровно ${crText(Number(o.cr))}`);
    if (o.type && MONSTER_TYPES[o.type]) out.push(`тип: ${o.type}`);
    if (o.size && SIZES[o.size]) out.push(`размер: ${o.size}`);
    if (o.casting) out.push("существо колдует: добавь способность вида spells");
    if (o.legendary) out.push("легендарное существо: 2–3 легендарных действия");
  } else if (kind === "spell") {
    if (o.level !== undefined && o.level !== "") out.push(o.level === "0" ? "это заговор (level 0)" : `круг ${o.level}`);
    if (o.school && SCHOOLS[o.school]) out.push(`школа: ${o.school}`);
    if (o.cls && CLASSES[o.cls]) out.push(`доступно классу: ${o.cls}`);
  } else {
    if (o.rarity && RARITIES[o.rarity]) out.push(`редкость: ${o.rarity}`);
    if (o.category && ITEM_CATEGORIES[o.category]) out.push(`категория: ${o.category}`);
    if (o.attune) out.push("требует настройки");
  }
  return out;
}

export function parseVariants(text: string): unknown[] {
  const cleaned = text.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    try {
      json = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : null;
    } catch {
      json = null;
    }
  }
  if (!json) throw new AiError("Gemini вернул неполный ответ (возможно, оборвался). Попробуйте ещё раз или уменьшите число вариантов.");
  const v = (json as { variants?: unknown }).variants;
  if (Array.isArray(v)) return v;
  if (Array.isArray(json)) return json;
  return [json];
}

