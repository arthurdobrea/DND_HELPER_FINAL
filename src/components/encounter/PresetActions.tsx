"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePreset, savePreset, startBattleFromMonsters } from "@/app/actions";

type Pick = { key: string; count: number };

/** Кнопки в списке пресетов: сразу начать бой и удалить пресет. */
export function PresetRowActions({ id, name, picks, active }: { id: number; name: string; picks: Pick[]; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={pending}
        className="rounded px-1.5 py-0.5 text-sm text-muted hover:bg-panel-2 hover:text-accent"
        title="Начать бой с этим пресетом (текущий бой в трекере будет заменён)"
        onClick={() => confirm(`Начать бой с пресетом «${name}»? Текущий бой в трекере будет заменён.`) && start(() => startBattleFromMonsters(picks))}
      >
        🛡️
      </button>
      <button
        type="button"
        disabled={pending}
        className="rounded px-1.5 py-0.5 text-sm text-muted hover:bg-panel-2 hover:text-red-400"
        title="Удалить пресет"
        onClick={() =>
          confirm(`Удалить пресет «${name}»?`) &&
          start(async () => {
            await deletePreset(id);
            if (active) router.push("/encounters");
          })
        }
      >
        ✕
      </button>
    </span>
  );
}

/** Под результатом генератора: «💾 Сохранить как пресет» — запрашивает название и сохраняет набор монстров. */
export function SavePresetButton({ picks, defaultName }: { picks: Pick[]; defaultName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)} title="Запомнить этот набор монстров, чтобы использовать в будущих столкновениях">
        💾 Сохранить как пресет
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const id = await savePreset({ name, groups: picks });
          if (id) router.push(`/encounters?preset=${id}`);
          else setError("Не удалось сохранить: введите название.");
        });
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="Название пресета" className="input w-64 py-1.5 text-sm" />
      <button className="btn btn-primary" disabled={pending || !name.trim()}>
        {pending ? "Сохраняю…" : "Сохранить"}
      </button>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Отмена
      </button>
      {error && <span className="text-sm text-red-400">{error}</span>}
    </form>
  );
}
