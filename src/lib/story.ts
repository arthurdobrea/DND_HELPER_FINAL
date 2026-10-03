import type { StoryKind } from "@/lib/db/schema";

/** Виды сюжетных заметок и подписи полей под каждый вид. Без серверных зависимостей. */
export const STORY_META: Record<
  StoryKind,
  { icon: string; label: string; color: string; hint: string; body: string; subject: string | null; trigger: string; boon: string }
> = {
  hook: {
    icon: "🪝",
    label: "Зацепка",
    color: "#fbbf24",
    hint: "Что подкинуть герою из его предыстории",
    body: "Что рассказать и как подать",
    subject: "Связано с (NPC, место, организация)",
    trigger: "Когда подать",
    boon: "Награда или баф (если есть)",
  },
  backstory: {
    icon: "📖",
    label: "Факт предыстории",
    color: "#38bdf8",
    hint: "Что известно о прошлом героя",
    body: "Что известно",
    subject: "Связано с",
    trigger: "Когда раскрыть",
    boon: "Влияние на игру (если есть)",
  },
  deity: {
    icon: "🪶",
    label: "Божество / покровитель",
    color: "#a78bfa",
    hint: "Послания, видения и дары божества",
    body: "Что сказать (от лица божества или о нём)",
    subject: "Божество",
    trigger: "Когда (молитва, сон, храм, уровень…)",
    boon: "Баф / дар (механика)",
  },
  boon: {
    icon: "✨",
    label: "Награда / баф",
    color: "#34d399",
    hint: "Что выдать герою: бафы, дары, титулы",
    body: "Как вручить, как описать",
    subject: null,
    trigger: "Когда выдать",
    boon: "Механика (что даёт, как долго)",
  },
};

export const STORY_ORDER: StoryKind[] = ["hook", "deity", "backstory", "boon"];

export type StoryInput = {
  characterId: number | null;
  kind: StoryKind;
  title: string;
  body: string;
  subject: string;
  trigger: string;
  boon: string;
};

export const STORY_LIMITS = { title: 120, short: 200, long: 8000 };
