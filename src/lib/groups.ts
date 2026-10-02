import type { BuiltinGroup, EntryGroup, EntryKind } from "@/lib/db/schema";

/**
 * Категории закладок мира. Любую закладку (страницу книги, заклинание, предмет, монстра) можно положить в любую.
 * Встроенные: Монстры, NPC, Артефакты, Локации, Карты; пустой ключ — «Без категории» (видна, только пока в ней что-то есть).
 * Свои категории (название + цвет + значок) лежат в таблице world_categories, ключ у них `c<id>`.
 * Файл без серверных зависимостей: его используют и клиентские компоненты. Рисунки значков — components/CategoryIcon.tsx.
 */
export type Category = {
  key: EntryGroup;
  label: string;
  hint: string;
  /** Цвет значка и плитки (hex). */
  color: string;
  /** Ключ рисунка (см. ICON_KEYS). */
  icon: string;
  /** Эмодзи для выпадающих списков. */
  emoji: string;
  builtin: boolean;
};

/** Цвета на выбор для своих категорий. */
export const COLORS: { hex: string; label: string }[] = [
  { hex: "#f87171", label: "Красный" },
  { hex: "#fb923c", label: "Оранжевый" },
  { hex: "#fbbf24", label: "Янтарный" },
  { hex: "#a3e635", label: "Лаймовый" },
  { hex: "#34d399", label: "Изумрудный" },
  { hex: "#2dd4bf", label: "Бирюзовый" },
  { hex: "#38bdf8", label: "Голубой" },
  { hex: "#60a5fa", label: "Синий" },
  { hex: "#a78bfa", label: "Фиолетовый" },
  { hex: "#f472b6", label: "Розовый" },
  { hex: "#fb7185", label: "Алый" },
  { hex: "#9ca3af", label: "Серый" },
];

/** Значки на выбор: пять встроенных рисунков + набор для своих категорий (рисует CategoryIcon). */
export const ICON_KEYS = [
  "monster", "npc", "artifact", "location", "map",
  "sword", "shield", "book", "scroll", "star", "heart", "crown",
  "castle", "tree", "flask", "key", "flame", "paw", "coin", "eye", "moon",
] as const;

export const ICON_LABELS: Record<string, string> = {
  monster: "Череп", npc: "Человечек", artifact: "Кристалл", location: "Метка", map: "Карта",
  sword: "Меч", shield: "Щит", book: "Книга", scroll: "Свиток", star: "Звезда", heart: "Сердце", crown: "Корона",
  castle: "Замок", tree: "Дерево", flask: "Зелье", key: "Ключ", flame: "Огонь", paw: "Лапа", coin: "Монета", eye: "Глаз", moon: "Луна",
};

export const MAX_CATEGORY_NAME = 40;

export const BUILTIN_GROUPS: (Category & { key: BuiltinGroup })[] = [
  { key: "monster", emoji: "💀", label: "Монстры", hint: "Чудовища и противники", color: "#f87171", icon: "monster", builtin: true },
  { key: "npc", emoji: "🧍", label: "NPC", hint: "Персонажи мира", color: "#38bdf8", icon: "npc", builtin: true },
  { key: "artifact", emoji: "💎", label: "Артефакты", hint: "Предметы и сокровища", color: "#fbbf24", icon: "artifact", builtin: true },
  { key: "location", emoji: "📍", label: "Локации", hint: "Места и подземелья", color: "#34d399", icon: "location", builtin: true },
  { key: "map", emoji: "🗺️", label: "Карты", hint: "Карты и планы", color: "#a78bfa", icon: "map", builtin: true },
];

export const UNCATEGORIZED: Category = {
  key: "", emoji: "📌", label: "Без категории", hint: "Ещё не разложено", color: "#9ca3af", icon: "bookmark", builtin: true,
};

export const customKey = (id: number): EntryGroup => `c${id}`;

/** Порядок на экране: встроенные, затем свои (по времени создания), «Без категории» — последней. */
export function buildCategories(custom: { id: number; name: string; color: string; icon: string }[]): Category[] {
  return [
    ...BUILTIN_GROUPS,
    ...custom.map(
      (c): Category => ({
        key: customKey(c.id),
        label: c.name,
        hint: "Своя категория",
        color: c.color,
        icon: c.icon,
        emoji: "◆",
        builtin: false,
      }),
    ),
    UNCATEGORIZED,
  ];
}

/** Категория по ключу; неизвестный ключ (удалённая категория) считается «Без категории». */
export function categoryOf(categories: Category[], key: EntryGroup): Category {
  return categories.find((c) => c.key === key) ?? UNCATEGORIZED;
}

/**
 * Категория по умолчанию при добавлении: монстры — «Монстры», предметы — «Артефакты».
 * Страницы книг и заклинания по типу не определить (на странице может быть и город, и злодей), поэтому
 * они попадают в «Без категории» — разложить их можно перетаскиванием.
 */
export function defaultGroup(kind: EntryKind): EntryGroup {
  return kind === "monster" ? "monster" : kind === "item" ? "artifact" : "";
}
