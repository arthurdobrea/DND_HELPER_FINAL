"use client";

import { useTransition } from "react";

/** Подпись «каталог от …» + кнопка перекачать его из Open5e. */
export function CatalogSync({ count, syncedAt, resync }: { count: number; syncedAt?: Date; resync: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
      <span>
        {count} записей
        {syncedAt && <> · {syncedAt.toLocaleDateString("ru-RU")}</>}
      </span>
      <button type="button" className="hover:text-accent" disabled={pending} onClick={() => start(resync)}>
        {pending ? "Обновляю…" : "↻ Обновить из Open5e"}
      </button>
    </div>
  );
}
