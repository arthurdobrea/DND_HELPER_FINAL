"use client";

/** Кнопка отправки формы столкновения: перед отправкой подставляет новое случайное зерно — каждый клик даёт новый вариант. */
export function RerollButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="btn btn-primary w-full py-2.5 text-base"
      onClick={(e) => {
        const seed = e.currentTarget.form?.elements.namedItem("seed");
        if (seed instanceof HTMLInputElement) seed.value = String(1 + Math.floor(Math.random() * 2_000_000_000));
      }}
    >
      {label}
    </button>
  );
}
