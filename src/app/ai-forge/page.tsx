import type { Metadata } from "next";
import { connection } from "next/server";
import { pageMeta } from "@/lib/meta";
import { geminiEnabled } from "@/lib/ai/gemini";
import { requireWorld } from "@/lib/world";
import { aiHistory } from "@/app/ai-forge-actions";
import { AiForge } from "@/components/ai/AiForge";

export const metadata: Metadata = pageMeta("ИИ-кузница", "🔮");

export default async function AiForgePage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  await connection();
  await requireWorld();
  const history = await aiHistory();
  const { open } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-[1600px] p-4">
      <AiForge initialHistory={history} enabled={geminiEnabled()} openId={open ? Number(open) : undefined} />
    </div>
  );
}
