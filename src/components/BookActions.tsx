"use client";

import { useTransition } from "react";
import { deleteBook, renameBook } from "@/app/actions";

export function BookActions({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <button
        className="btn"
        disabled={pending}
        onClick={() => {
          const t = prompt("Новое название", title);
          if (t) start(() => renameBook(id, t));
        }}
      >
        ✏️
      </button>
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={() => confirm(`Удалить «${title}» вместе с закладками?`) && start(() => deleteBook(id))}
      >
        🗑
      </button>
    </div>
  );
}
