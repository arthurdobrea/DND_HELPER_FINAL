"use client";

import { useTransition } from "react";

/** Кнопка «в закладки мира». toggle — привязанный server action (action.bind(null, …)). */
export function PinButton({ pinned, toggle }: { pinned: boolean; toggle: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button className={`btn w-full ${pinned ? "" : "btn-primary"}`} disabled={pending} onClick={() => start(toggle)}>
      {pending ? "…" : pinned ? "✓ В закладках мира — убрать" : "🔖 В закладки мира"}
    </button>
  );
}
