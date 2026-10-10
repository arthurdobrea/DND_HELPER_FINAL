"use client";

import { useTransition } from "react";
import { deleteMap, renameMap } from "@/app/map-actions";

export function MapActions({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <button
        className="btn"
        disabled={pending}
        onClick={() => {
          const t = prompt("Новое название", title);
          if (t) start(() => renameMap(id, t));
        }}
      >
        ✏️
      </button>
      <button
        className="btn btn-danger"
        disabled={pending}
        onClick={() => confirm(`Удалить карту «${title}» вместе со всеми пинами и записями?`) && start(() => deleteMap(id))}
      >
        🗑
      </button>
    </div>
  );
}
