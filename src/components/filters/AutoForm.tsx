"use client";

import Form from "next/form";
import { useRef, type ReactNode } from "react";

/**
 * GET-форма фильтров: применяется сама при изменении любого поля
 * (текст и числа — с задержкой, чтобы не дёргать сервер на каждую букву).
 * Состояние фильтров живёт в URL — ссылку можно сохранить в закладки браузера.
 */
export function AutoForm({ action, children }: { action: string; children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function submitSoon(delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => formRef.current?.requestSubmit(), delay);
  }

  return (
    <Form
      ref={formRef}
      action={action}
      replace
      scroll={false}
      className="space-y-3"
      onChange={(e) => {
        const t = e.target as unknown as HTMLInputElement;
        submitSoon(t.type === "text" || t.type === "search" || t.type === "number" ? 400 : 0);
      }}
    >
      {children}
    </Form>
  );
}
