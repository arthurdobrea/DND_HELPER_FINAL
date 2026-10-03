import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { requireWorld } from "@/lib/world";
import { pageMeta } from "@/lib/meta";
import { NpcCreator } from "@/components/npc/NpcCreator";

export const metadata: Metadata = pageMeta("Новый NPC", "🎭");

export default async function NewNpcPage() {
  await connection();
  await requireWorld();
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/npcs" className="btn">
          ← NPC
        </Link>
        <h1 className="font-display text-2xl text-accent">🎭 Новый NPC</h1>
      </div>
      <NpcCreator />
    </div>
  );
}
