import type { Metadata } from "next";
import { connection } from "next/server";
import { pageMeta } from "@/lib/meta";
import { listStash } from "@/app/fishing-actions";
import { FishingTable } from "@/components/fishing/FishingTable";

export const metadata: Metadata = pageMeta("Рыбалка", "🎣");

export default async function FishingPage() {
  await connection();
  const stash = await listStash();
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4">
      <FishingTable initialStash={stash} />
    </div>
  );
}
