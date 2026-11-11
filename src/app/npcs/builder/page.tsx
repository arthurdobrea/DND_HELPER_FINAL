import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireWorld } from "@/lib/world";
import { pageMeta } from "@/lib/meta";
import { loadForgeDraft } from "@/lib/custom-monsters";
import { NpcBuilder } from "@/components/npc/NpcBuilder";

export const metadata: Metadata = pageMeta("Сборщик NPC", "🧩");

export default async function BuilderPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await connection();
  const world = await requireWorld();
  const { edit } = await searchParams;
  const loaded = edit ? await loadForgeDraft(Number(edit), world.id) : null;
  if (edit && !loaded) notFound();

  return (
    <div className="mx-auto w-full max-w-[1900px] p-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={loaded ? `/npcs/${loaded.editId}` : "/npcs"} className="btn">
          ← {loaded ? "К листу NPC" : "NPC"}
        </Link>
        <h1 className="font-display text-2xl text-accent">🧩 {loaded ? `Сборка: ${loaded.draft.name || "NPC"}` : "Сборщик NPC"}</h1>
        <span className="hidden text-sm text-muted md:inline">каталог слева → перетащите блоки в схему существа</span>
      </div>
      <NpcBuilder key={loaded?.editId ?? "new"} initial={loaded?.draft} editId={loaded?.editId} />
    </div>
  );
}
