"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="card w-full max-w-sm space-y-4 p-6">
      <h1 className="font-display text-2xl text-accent">🐉 DnD Helper</h1>
      <input type="hidden" name="next" value={next} />
      <input name="key" type="password" autoFocus placeholder="Ключ доступа" className="input w-full" />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        Войти
      </button>
    </form>
  );
}
