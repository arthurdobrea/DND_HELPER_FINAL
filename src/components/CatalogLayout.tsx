import type { ReactNode } from "react";

/** Три колонки: фильтры | результаты | карточка. На узком экране — друг под другом. */
export function CatalogLayout({ filters, list, detail }: { filters: ReactNode; list: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid flex-1 lg:h-[calc(100vh-49px)] lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,480px)] lg:overflow-hidden">
      <aside className="border-border bg-panel p-3 lg:overflow-y-auto lg:border-r">{filters}</aside>
      <section className="p-3 lg:overflow-y-auto">{list}</section>
      <section className="border-border p-3 lg:overflow-y-auto lg:border-l">{detail}</section>
    </div>
  );
}
