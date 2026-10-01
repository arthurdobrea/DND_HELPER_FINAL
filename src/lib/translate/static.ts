import { MONSTER_TYPES, SIZES } from "@/lib/catalog/labels";
import type { Monster } from "@/lib/open5e";

/** Подписи статблока по-русски — это постоянные слова, их не нужно переводить нейросетью. */
export const STAT_LABELS = {
  ac: "Класс доспеха",
  hp: "Хиты",
  speed: "Скорость",
  saves: "Спасброски",
  skills: "Навыки",
  vulnerabilities: "Уязвимость к урону",
  resistances: "Сопротивление урону",
  immunities: "Иммунитет к урону",
  conditionImmunities: "Иммунитет к состояниям",
  senses: "Чувства",
  languages: "Языки",
  challenge: "Опасность",
  actions: "Действия",
  bonusActions: "Бонусные действия",
  reactions: "Реакции",
  legendaryActions: "Легендарные действия",
  source: "Источник",
} as const;

export const ABILITY_SHORT_RU = { strength: "СИЛ", dexterity: "ЛОВ", constitution: "ТЕЛ", intelligence: "ИНТ", wisdom: "МДР", charisma: "ХАР" } as const;

const SKILLS_RU: Record<string, string> = {
  acrobatics: "Акробатика",
  "animal handling": "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Анализ",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Внимательность",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  "sleight of hand": "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
};

export const skillRu = (key: string) => SKILLS_RU[key.toLowerCase()] ?? key[0].toUpperCase() + key.slice(1);

const LAW: Record<string, string> = { lawful: "законно", neutral: "нейтрально", chaotic: "хаотично" };
const MORAL: Record<string, string> = { good: "добрый", neutral: "нейтральный", evil: "злой" };

/** «lawful good» → «законно-добрый». Нестандартные записи («any evil alignment») остаются как есть. */
export function alignmentRu(a: string | undefined): string {
  const t = (a ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t === "unaligned") return "без мировоззрения";
  if (t === "any alignment") return "любое мировоззрение";
  if (t === "neutral") return "нейтральный";
  const m = /^(lawful|neutral|chaotic) (good|neutral|evil)$/.exec(t);
  return m ? `${LAW[m[1]]}-${MORAL[m[2]]}` : (a ?? "");
}

const SPEED_RU: Record<string, string> = { fly: "полёт", swim: "плавание", climb: "лазание", burrow: "копание" };

export function formatSpeedRu(speed: Monster["speed"]): string {
  return Object.entries(speed ?? {})
    .filter(([k, v]) => k !== "hover" && typeof v === "number")
    .map(([k, v]) => (k === "walk" ? `${v} фт.` : `${SPEED_RU[k] ?? k} ${v} фт.`))
    .join(", ");
}

/** «Средний · Гуманоид (гоблиноид) · нейтрально-злой» — без согласования родов. */
export function creatureLineRu(m: Monster): string {
  const size = SIZES[m.size.toLowerCase()] ?? m.size;
  const type = MONSTER_TYPES[m.type.toLowerCase()] ?? m.type;
  return [size, `${type}${m.subtype ? ` (${m.subtype})` : ""}`, alignmentRu(m.alignment)].filter(Boolean).join(" · ");
}
