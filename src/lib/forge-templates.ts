import { rid, type ForgeAbility, type Section } from "@/lib/forge";

/** Заготовки блоков для сборщика: готовая атака, дыхание, пассивка и т. п. — числа пересчитываются от CR и характеристик. */
export type Template = {
  id: string;
  icon: string;
  title: string;
  hint: string;
  group: "Атаки" | "Области" | "Мультиатака" | "Особенности и реакции";
  section: Section;
  /** Если задано — шаблон ещё и выставляет число атак за ход. */
  multiattack?: number;
  make: () => ForgeAbility;
};

const attack = (name: string, p: Partial<Extract<ForgeAbility, { kind: "attack" }>> = {}, section: Section = "action"): ForgeAbility => ({
  id: rid(), kind: "attack", section, name, ranged: false, spell: false, abil: "str", reach: "5 фт.", dice: "1d8", dmgType: "slashing", extraDice: "", extraType: "fire", usage: "", ...p,
});
const area = (name: string, p: Partial<Extract<ForgeAbility, { kind: "save" }>> = {}, section: Section = "action"): ForgeAbility => ({
  id: rid(), kind: "save", section, name, dcAbil: "con", saveAbil: "dex", shape: "конус 30 фт.", dice: "8d6", dmgType: "fire", half: true, effect: "", usage: "Перезарядка 5–6", ...p,
});
const text = (name: string, desc: string, section: Section): ForgeAbility => ({ id: rid(), kind: "text", section, name, desc });

export const TEMPLATES: Template[] = [
  { id: "melee", icon: "🗡️", title: "Рукопашная атака", hint: "1d8 рубящий, 5 фт.", group: "Атаки", section: "action", make: () => attack("Удар оружием") },
  { id: "heavy", icon: "🔨", title: "Тяжёлый удар", hint: "2d10 дробящий, 10 фт.", group: "Атаки", section: "action", make: () => attack("Тяжёлый удар", { dice: "2d10", dmgType: "bludgeoning", reach: "10 фт." }) },
  { id: "ranged", icon: "🏹", title: "Дальнобойная атака", hint: "1d8 колющий, 80/320 фт.", group: "Атаки", section: "action", make: () => attack("Выстрел", { ranged: true, abil: "dex", reach: "80/320 фт.", dice: "1d8", dmgType: "piercing" }) },
  { id: "firespear", icon: "🔥", title: "Огненное копьё", hint: "2d8 колющий + 2d6 огонь", group: "Атаки", section: "action", make: () => attack("Огненное копьё", { reach: "10 фт.", dice: "2d8", dmgType: "piercing", extraDice: "2d6", extraType: "fire" }) },
  { id: "firebolt", icon: "☄️", title: "Огненный снаряд", hint: "заклинательная, 4d6 огонь, 120 фт.", group: "Атаки", section: "action", make: () => attack("Огненный снаряд", { ranged: true, spell: true, abil: "cha", reach: "120 фт.", dice: "4d6", dmgType: "fire" }) },
  { id: "frostray", icon: "❄️", title: "Ледяной луч", hint: "заклинательная, 4d6 холод", group: "Атаки", section: "action", make: () => attack("Ледяной луч", { ranged: true, spell: true, abil: "int", reach: "120 фт.", dice: "4d6", dmgType: "cold" }) },
  { id: "firebreath", icon: "🐉", title: "Дыхание огнём", hint: "конус 30 фт., 8d6 огонь, перезарядка 5–6", group: "Области", section: "action", make: () => area("Огненное дыхание") },
  { id: "frostbreath", icon: "🧊", title: "Ледяное дыхание", hint: "конус 30 фт., 8d8 холод", group: "Области", section: "action", make: () => area("Ледяное дыхание", { dice: "8d8", dmgType: "cold" }) },
  { id: "poison", icon: "☠️", title: "Ядовитое облако", hint: "сфера 20 фт., 6d6 яд, спасбросок Телосложения", group: "Области", section: "action", make: () => area("Ядовитое облако", { shape: "сфера 20 фт. радиусом", dice: "6d6", dmgType: "poison", saveAbil: "con" }) },
  { id: "firewall", icon: "🧱", title: "Огненная стена", hint: "бонусное действие, 4d8 огонь, 1/день", group: "Области", section: "bonus", make: () => area("Огненная стена", { shape: "стена 60×20 фт.", dice: "4d8", usage: "1/день" }, "bonus") },
  { id: "lightning", icon: "⚡", title: "Раскат молнии", hint: "линия 60 фт., 8d6 электричество", group: "Области", section: "action", make: () => area("Раскат молнии", { shape: "линия 60 фт. шириной 5 фт.", dice: "8d6", dmgType: "lightning", dcAbil: "int" }) },
  { id: "multi2", icon: "✌️", title: "Мультиатака ×2", hint: "две атаки за действие", group: "Мультиатака", section: "action", multiattack: 2, make: () => text("Мультиатака", "Существо совершает две атаки.", "action") },
  { id: "multi3", icon: "🤟", title: "Мультиатака ×3", hint: "три атаки за действие", group: "Мультиатака", section: "action", multiattack: 3, make: () => text("Мультиатака", "Существо совершает три атаки.", "action") },
  { id: "aura", icon: "🌟", title: "Огненная аура", hint: "урон тем, кто рядом", group: "Особенности и реакции", section: "special", make: () => text("Огненная аура", "Любое существо, начинающее ход в пределах 5 футов от этого существа, получает 5 (1d10) огненного урона.", "special") },
  { id: "regen", icon: "💚", title: "Регенерация", hint: "лечится каждый ход", group: "Особенности и реакции", section: "special", make: () => text("Регенерация", "В начале своего хода существо восстанавливает 10 хитов, если у него есть хотя бы 1 хит. Урон некротической энергией или излучением отключает регенерацию до начала его следующего хода.", "special") },
  { id: "magres", icon: "🛡️", title: "Сопротивление магии", hint: "преимущество на спасброски от магии", group: "Особенности и реакции", section: "special", make: () => text("Сопротивление магии", "Существо совершает с преимуществом спасброски от заклинаний и других магических эффектов.", "special") },
  { id: "parry", icon: "🤺", title: "Парирование", hint: "реакция: +3 к КД", group: "Особенности и реакции", section: "reaction", make: () => text("Парирование", "Существо добавляет 3 к своему КД против одной рукопашной атаки, которая должна попасть по нему. Для этого оно должно видеть атакующего и держать оружие.", "reaction") },
  { id: "teleport", icon: "🌀", title: "Телепорт", hint: "бонусное: 30 фт.", group: "Особенности и реакции", section: "bonus", make: () => text("Телепорт", "Существо магическим образом телепортируется на расстояние до 30 футов в свободное пространство, которое оно видит.", "bonus") },
  { id: "legatk", icon: "👑", title: "Легендарная атака", hint: "стоит 1 легендарное действие", group: "Атаки", section: "legendary", make: () => attack("Атака", { dice: "1d10", dmgType: "slashing" }, "legendary") },
];
