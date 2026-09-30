"use client";

import { useState } from "react";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Классы для поля с числом (размер шрифта, ширина). */
  inputClass?: string;
  className?: string;
  title?: string;
};

/**
 * Число с кнопками − / +. Shift+клик — шаг ×5. Число можно ввести руками.
 */
export function Stepper({ value, onChange, min = -999, max = 99999, step = 1, inputClass = "w-9 text-sm", className = "", title }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const bump = (dir: 1 | -1, e: React.MouseEvent) => onChange(clamp(value + dir * step * (e.shiftKey ? 5 : 1)));

  return (
    <div className={`flex items-center justify-center gap-1 ${className}`} title={title}>
      <button type="button" className="sheet-step" onClick={(e) => bump(-1, e)} aria-label="Уменьшить">
        −
      </button>
      <input
        inputMode="numeric"
        value={draft ?? String(value)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(clamp(n));
        }}
        onBlur={() => setDraft(null)}
        className={`bg-transparent text-center font-bold outline-none focus:bg-white/60 ${inputClass}`}
      />
      <button type="button" className="sheet-step" onClick={(e) => bump(1, e)} aria-label="Увеличить">
        +
      </button>
    </div>
  );
}
