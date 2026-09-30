"use client";

import { useTransition } from "react";
import { deleteWorld, renameWorld } from "@/app/actions";

export function WorldActions({ id, name, description }: { id: number; name: string; description: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <button
        className="btn"
        disabled={pending}
        title="Переименовать"
        onClick={() => {
          const n = prompt("Название мира", name);
          if (!n) return;
          const d = prompt("Описание", description) ?? description;
          start(() => renameWorld(id, n, d));
        }}
      >
        ✏️
      </button>
      <button
        className="btn btn-danger"
        disabled={pending}
        title="Удалить"
        onClick={() =>
          confirm(`Удалить мир «${name}» со всеми его закладками? PDF-книги останутся.`) && start(() => deleteWorld(id))
        }
      >
        🗑
      </button>
    </div>
  );
}
