"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importNpcSpells } from "@/app/actions";

/** Заполняет пустые круги листа заклинаниями из статблока существа-основы (для NPC, созданных раньше). */
export function ImportSpellsButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn px-2.5 py-1 text-xs"
        disabled={pending}
        title="Раскладывает заклинания из статблока по кругам листа; то, что вы уже вписали, не затирается"
        onClick={() =>
          start(async () => {
            const r = await importNpcSpells(id);
            setNote(r.found > 0 ? `В статблоке заклинаний: ${r.found}; пустые круги заполнены` : "В статблоке нет заклинаний");
            router.refresh();
          })
        }
      >
        {pending ? "…" : "🔄 Заклинания из статблока"}
      </button>
      {note && <span className="text-xs text-muted">{note}</span>}
    </span>
  );
}
