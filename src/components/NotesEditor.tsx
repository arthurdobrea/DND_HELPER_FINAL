"use client";

import { useState, useTransition } from "react";

/** save — привязанный server action, принимающий текст заметки. */
export function NotesEditor({ initial, save }: { initial: string; save: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = notes !== initial;

  return (
    <div className="card p-3">
      <label className="text-sm text-muted">Заметки мастера</label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={8}
        className="input mt-1 w-full resize-y text-sm"
        placeholder="Тактика, где встречается, изменения статов…"
      />
      <button
        className="btn mt-2 w-full"
        disabled={!dirty || pending}
        onClick={() => start(() => save(notes))}
      >
        {pending ? "Сохраняю…" : dirty ? "Сохранить" : "Сохранено"}
      </button>
    </div>
  );
}
