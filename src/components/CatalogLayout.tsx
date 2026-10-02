import type { ReactNode } from "react";

/**
 * Три колонки: фильтры | результаты | карточка.
 * Широкий экран (lg+): колонки прокручиваются независимо, высота = экран минус шапка (--header-h из NavBar),
 * поэтому карточка всегда на виду.
 * Узкий экран: колонки друг под другом, но карточка стоит первой и закреплена под шапкой (не выше 45% экрана) —
 * листаешь длинный список, а описание выбранной записи остаётся перед глазами.
 */
export function CatalogLayout({ filters, list, detail }: { filters: ReactNode; list: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid flex-1 lg:h-[calc(100dvh-var(--header-h,49px))] lg:flex-none lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,480px)] lg:overflow-hidden">
      <aside className="relative order-2 border-border bg-panel p-3 lg:order-none lg:overflow-y-auto lg:border-r">{filters}</aside>
      <section className="relative order-3 p-3 lg:order-none lg:overflow-y-auto">{list}</section>
      <section className="sticky top-[var(--header-h,49px)] z-10 order-1 max-h-[45dvh] overflow-y-auto border-b border-border bg-bg p-3 lg:static lg:order-none lg:max-h-none lg:border-b-0 lg:border-l">
        {detail}
      </section>
    </div>
  );
}
