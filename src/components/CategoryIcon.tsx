import type { CSSProperties, ReactNode } from "react";
import type { Category } from "@/lib/groups";

// Рисунки на сетке 24×24 (контур, толщина задаётся в <svg>). Ключи — см. ICON_KEYS в lib/groups.ts.
const SHAPES: Record<string, ReactNode> = {
  // Череп
  monster: (
    <>
      <path d="M12 3C7.6 3 4 6.1 4 10.2c0 2.5 1.2 4.5 3 5.8V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3c1.8-1.3 3-3.3 3-5.8C20 6.1 16.4 3 12 3Z" />
      <circle cx="8.8" cy="11" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="15.2" cy="11" r="1.9" fill="currentColor" stroke="none" />
      <path d="M12 13.4l-1.1 2.3h2.2L12 13.4Z" fill="currentColor" />
      <path d="M10 20v-2.4M14 20v-2.4" />
    </>
  ),
  // Человечек
  npc: (
    <>
      <circle cx="12" cy="4.8" r="2.6" fill="currentColor" />
      <path d="M12 8.6V15M6.5 11.2h11M12 15l-3.2 6M12 15l3.2 6" />
    </>
  ),
  // Кристалл
  artifact: (
    <>
      <path d="M7 4h10l4 5-9 11L3 9l4-5Z" />
      <path d="M3 9h18M10 4 8.2 9 12 20l3.8-11L14 4" />
    </>
  ),
  // Метка на карте
  location: (
    <>
      <path d="M12 21s-7-6.3-7-11.2A7 7 0 0 1 19 9.8C19 14.7 12 21 12 21Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  // Сложенная карта
  map: (
    <>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  // Закладка («Без категории»)
  bookmark: <path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-3.5L6 21V4.5a1 1 0 0 1 1-1Z" />,
  sword: (
    <>
      <path d="M20.5 3.5h-5l-9 9 5 5 9-9v-5Z" />
      <path d="M3.5 16.5l4 4M3 21l3-3" />
    </>
  ),
  shield: <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6L12 3Z" />,
  book: (
    <>
      <path d="M12 6c-1.8-1.5-4.3-2-8-2v14c3.7 0 6.2.5 8 2 1.8-1.5 4.3-2 8-2V4c-3.7 0-6.2.5-8 2Z" />
      <path d="M12 6v14" />
    </>
  ),
  scroll: (
    <>
      <path d="M8 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7" />
      <path d="M8 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2 2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
      <path d="M13 9h4M13 13h4" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />,
  heart: <path d="M12 20.5S3.5 15 3.5 8.9A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 8.5 1.7c0 6.1-8.5 11.6-8.5 11.6Z" />,
  crown: <path d="M4.5 18.5h15M4.5 18.5l-1-11 5 4.5L12 5l3.5 7 5-4.5-1 11" />,
  castle: (
    <>
      <path d="M4 20.5V6h3v2.5h2V6h2.5v2.5h1V6H15v2.5h2V6h3v14.5H4Z" />
      <path d="M10 20.5v-5a2 2 0 0 1 4 0v5" />
    </>
  ),
  tree: (
    <>
      <path d="M12 3l6 8h-3l4 6H5l4-6H6l6-8Z" />
      <path d="M12 17v4" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v6L4.8 18.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L13.5 9.5v-6" />
      <path d="M7.5 15h9" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
    </>
  ),
  flame: <path d="M12 3c1 3.5 5.5 5.5 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5.3 1.5 1 2.3 2 2.5C10 8.5 11 6 12 3Z" />,
  paw: (
    <>
      <circle cx="7" cy="10" r="1.8" />
      <circle cx="12" cy="6.5" r="1.8" />
      <circle cx="17" cy="10" r="1.8" />
      <path d="M12 12c-3 0-5 3-5 5 0 1.8 1.7 2.5 3 2 1.2-.5 1.8-.5 4 0 1.3.5 3-.2 3-2 0-2-2-5-5-5Z" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M9.5 10c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.8-2.5.8-2.5 1.8 1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
};

/** Значок по ключу рисунка. Цвет — из CSS color (currentColor); неизвестный ключ рисуется как закладка. */
export function Icon({ name, size = 24, className = "", style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {SHAPES[name] ?? SHAPES.bookmark}
    </svg>
  );
}

/** Значок категории в её цвете. */
export function GroupIcon({ cat, size = 24 }: { cat: Pick<Category, "color" | "icon">; size?: number }) {
  return <Icon name={cat.icon} size={size} style={{ color: cat.color }} />;
}

/** Значок на цветной плитке — для заголовков категорий и кнопок выбора. */
export function GroupTile({ cat, size = 36, active = false }: { cat: Pick<Category, "color" | "icon">; size?: number; active?: boolean }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        color: cat.color,
        backgroundColor: `${cat.color}26`,
        boxShadow: active ? `0 0 0 2px ${cat.color}99` : undefined,
      }}
    >
      <Icon name={cat.icon} size={Math.round(size * 0.64)} />
    </span>
  );
}
