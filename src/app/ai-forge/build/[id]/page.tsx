import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { pageMeta } from "@/lib/meta";
import { requireWorld } from "@/lib/world";
import { aiGet } from "@/app/ai-forge-actions";
import { sanitizeItem, sanitizeSpell } from "@/lib/ai-forge";
import { ItemBuilder } from "@/components/ai/ItemBuilder";
import { SpellBuilder } from "@/components/ai/SpellBuilder";

export const metadata: Metadata = pageMeta("Сборщик", "🧩");

/** Сборщик записи Кузницы: предмет или заклинание (существо — в сборщик NPC). id = new — собрать с нуля (?kind=item|spell). */
export default async function BuildPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }) {
  await connection();
  await requireWorld();
  const { id } = await params;
  const { kind } = await searchParams;

  if (id === "new") {
    if (kind === "monster") redirect("/npcs/builder");
    const isSpell = kind === "spell";
    return (
      <div className="mx-auto w-full max-w-[1900px] p-4">
        <h1 className="mb-4 font-display text-2xl text-accent">🧩 {isSpell ? "Новое заклинание" : "Новый предмет"}</h1>
        {isSpell ? (
          <SpellBuilder initial={sanitizeSpell({ name: "Новое заклинание", level: 1, school: "evocation", castingTime: "action", range: "60 фт.", duration: "Мгновенная", desc: "" }, "ai:new")} />
        ) : (
          <ItemBuilder initial={sanitizeItem({ name: "Новый предмет", magic: true, rarity: "uncommon", category: "wondrous-item", desc: "" }, "ai:new")} />
        )}
      </div>
    );
  }

  const c = await aiGet(Number(id));
  if (!c) notFound();
  if (c.entity.kind === "monster") redirect(`/npcs/builder?ai=${c.id}`);
  return (
    <div className="mx-auto w-full max-w-[1900px] p-4">
      <h1 className="mb-4 font-display text-2xl text-accent">🧩 Сборка: {c.name}</h1>
      {c.entity.kind === "spell" ? <SpellBuilder key={c.id} initial={c.entity.spell} id={c.id} /> : <ItemBuilder key={c.id} initial={c.entity.item} id={c.id} />}
    </div>
  );
}
