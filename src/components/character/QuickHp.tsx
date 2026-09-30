"use client";

import { useState, useTransition } from "react";
import { adjustCharacterHp } from "@/app/actions";

/** Урон / лечение прямо с карточки партии — без открытия листа. */
export function QuickHp({ id }: { id: number }) {
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const n = parseInt(amount, 10) || 1;
  const apply = (delta: number) =>
    start(async () => {
      await adjustCharacterHp(id, delta);
      setAmount("");
    });

  return (
    <div className="flex items-center gap-1">
      <button className="btn px-2 py-1 text-red-400" disabled={pending} onClick={() => apply(-n)} title="Урон">
        −
      </button>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
        placeholder="1"
        className="input w-10 px-1 py-1 text-center text-sm"
      />
      <button className="btn px-2 py-1 text-green-400" disabled={pending} onClick={() => apply(n)} title="Лечение">
        +
      </button>
    </div>
  );
}
