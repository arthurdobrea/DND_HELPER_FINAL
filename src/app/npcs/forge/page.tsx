import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireWorld } from "@/lib/world";
import { pageMeta } from "@/lib/meta";
import { loadForgeDraft } from "@/lib/custom-monsters";
import { NpcForge } from "@/components/npc/NpcForge";

export const metadata: Metadata = pageMeta("Конструктор NPC", "🛠️");

export default async function ForgePage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await connection();
  const world = await requireWorld();
  const { edit } = await searchParams;

  // Режим правки: ?edit=<id NPC> — берём сохранённый черновик из базы.
  const loaded = edit ? await loadForgeDraft(Number(edit), world.id) : null;
  if (edit && !loaded) notFound();
  const editId = loaded?.editId;
  const initial = loaded?.draft;

  return (
    <div className="mx-auto w-full max-w-[1800px] p-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href={editId ? `/npcs/${editId}` : "/npcs"} className="btn">
          ← {editId ? "К листу NPC" : "NPC"}
        </Link>
        <h1 className="font-display text-2xl text-accent">🛠️ {editId ? `Правка: ${initial?.name || "NPC"}` : "Конструктор NPC"}</h1>
        <Link href={editId ? `/npcs/builder?edit=${editId}` : "/npcs/builder"} className="btn ml-auto text-sm" title="Тот же NPC, но собираемый блоками: перетаскивание, замена, шаблоны">
          🧩 Сборщик блоками
        </Link>
      </div>
      <NpcForge key={editId ?? "new"} initial={initial} editId={editId} />
    </div>
  );
}
