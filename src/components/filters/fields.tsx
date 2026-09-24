import type { ReactNode } from "react";

/** Поля фильтров — обычные неуправляемые input/select, значения берутся из URL. */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

export type Option = { value: string; label: string };

export function Select({
  name,
  value,
  options,
  empty = "Любое",
  groups,
}: {
  name: string;
  value: string;
  options?: Option[];
  empty?: string;
  groups?: { label: string; options: Option[] }[];
}) {
  return (
    <select name={name} defaultValue={value} className="input w-full py-1.5 text-sm">
      <option value="">{empty}</option>
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {groups?.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Да / Нет / Любое */
export function TriState({ name, value, yes = "Да", no = "Нет" }: { name: string; value: string; yes?: string; no?: string }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border text-xs">
      {[
        ["", "Любое"],
        ["yes", yes],
        ["no", no],
      ].map(([v, l]) => (
        <label
          key={v}
          className="flex-1 cursor-pointer px-2 py-1.5 text-center has-[:checked]:bg-accent has-[:checked]:text-bg"
        >
          <input type="radio" name={name} value={v} defaultChecked={value === v} className="sr-only" />
          {l}
        </label>
      ))}
    </div>
  );
}

export function Check({ name, checked, label, value = "1" }: { name: string; checked: boolean; label: string; value?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}

/** Набор «чипсов» с множественным выбором (одно имя параметра, несколько значений). */
export function Chips({ name, values, options }: { name: string; values: string[]; options: Option[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label
          key={o.value}
          className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-bg"
        >
          <input type="checkbox" name={name} value={o.value} defaultChecked={values.includes(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export const toOptions = (map: Record<string, string>, keys?: string[]): Option[] =>
  (keys ?? Object.keys(map)).map((k) => ({ value: k, label: map[k] ?? k }));
