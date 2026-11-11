import type { Metadata } from "next";
import { connection } from "next/server";
import { pageMeta } from "@/lib/meta";
import { geminiEnabled } from "@/lib/ai/gemini";
import { listParty, listStash } from "@/app/fishing-actions";
import { FishingTable } from "@/components/fishing/FishingTable";

export const metadata: Metadata = pageMeta("Рыбалка", "🎣");

export default async function FishingPage() {
  await connection();
  const [stash, party] = await Promise.all([listStash(), listParty()]);
  return (
    <div className="mx-auto w-full max-w-[1700px] p-4">
      <FishingTable initialStash={stash} party={party} aiEnabled={geminiEnabled()} />
    </div>
  );
}
