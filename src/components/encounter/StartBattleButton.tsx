"use client";

import { useTransition } from "react";
import { startBattleFromMonsters } from "@/app/actions";

/** Переносит сгенерированное столкновение в трекер боя: враги по количеству и вся партия мира. */
export function StartBattleButton({ picks }: { picks: { key: string; count: number }[] }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-primary"
      disabled={pending}
      title="Открыть трекер боя с этими врагами и героями партии (текущий бой в трекере будет заменён)"
      onClick={() => confirm("Начать бой с этим столкновением? Текущий бой в трекере будет заменён.") && start(() => startBattleFromMonsters(picks))}
    >
      {pending ? "Готовлю бой…" : "🛡️ В трекер боя"}
    </button>
  );
}
