"use client";

import { useTransition } from "react";

/** Кнопка в списке каталога: ＋ добавить в магазин / ✓ уже там (повторный клик убирает). */
export function ShopToggle({ inShop, toggle }: { inShop: boolean; toggle: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(toggle)}
      title={inShop ? "В магазине — убрать" : "Добавить в магазин"}
      className={`h-7 w-7 shrink-0 rounded-md border text-sm ${inShop ? "border-accent bg-accent text-bg" : "border-border hover:border-accent hover:text-accent"}`}
    >
      {pending ? "…" : inShop ? "✓" : "＋"}
    </button>
  );
}

/** Большая кнопка под карточкой вещи. */
export function ShopDetailButton({ inShop, toggle }: { inShop: boolean; toggle: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn w-full ${inShop ? "" : "btn-primary"}`} disabled={pending} onClick={() => start(toggle)}>
      {pending ? "…" : inShop ? "✓ В магазине — убрать" : "🏺 Добавить в магазин"}
    </button>
  );
}

export function AddAllButton({ count, add }: { count: number; add: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn w-full"
      disabled={pending}
      onClick={() => confirm(`Добавить в магазин все найденные вещи (${count})?`) && start(add)}
    >
      {pending ? "Добавляю…" : `＋ Добавить все найденные (${count})`}
    </button>
  );
}

export function ClearShopButton({ clear }: { clear: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-danger"
      disabled={pending}
      onClick={() => confirm("Убрать из магазина все вещи?") && start(clear)}
    >
      Очистить
    </button>
  );
}
