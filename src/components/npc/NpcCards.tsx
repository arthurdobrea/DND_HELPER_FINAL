"use client";

import { useState } from "react";
import { rollDice, type AbilityCard, type CardSection } from "@/lib/npc-actions";

const SECTIONS: Record<CardSection, { title: string; color: string }> = {
  action: { title: "Действие", color: "#f87171" },
  bonus: { title: "Бонусное действие", color: "#fbbf24" },
  reaction: { title: "Реакция", color: "#38bdf8" },
  legendary: { title: "Легендарное действие", color: "#a78bfa" },
  special: { title: "Особенность", color: "#34d399" },
};

type Roll = { text: string; tone: "normal" | "crit" | "fumble" };

/** Выражение «NdM±K» с удвоенным числом кубов — для критического попадания. */
const critExpr = (dice: string) => dice.replace(/^(\d+)d/, (_, n) => `${Number(n) * 2}d`);

function Card({ card }: { card: AbilityCard }) {
  const meta = SECTIONS[card.section];
  const [roll, setRoll] = useState<Roll | null>(null);
  const [open, setOpen] = useState(false);
  const long = card.desc.length > 420;

  function rollAttack(bonus: number) {
    const d = 1 + Math.floor(Math.random() * 20);
    const total = d + bonus;
    setRoll({
      text: `🎲 Атака: d20 (${d}) ${bonus >= 0 ? "+" : "−"} ${Math.abs(bonus)} = ${total}${d === 20 ? " — КРИТ!" : d === 1 ? " — промах" : ""}`,
      tone: d === 20 ? "crit" : d === 1 ? "fumble" : "normal",
    });
  }
  function rollDamage(dice: string, crit: boolean) {
    const r = rollDice(crit ? critExpr(dice) : dice);
    if (!r) return;
    setRoll({
      text: `🎲 Урон${crit ? " (крит)" : ""} ${crit ? critExpr(dice) : dice}: [${r.rolls.join(", ")}]${r.mod ? ` ${r.mod > 0 ? "+" : "−"} ${Math.abs(r.mod)}` : ""} = ${r.total}`,
      tone: crit ? "crit" : "normal",
    });
  }

  return (
    <article
      className={`rounded-2xl border border-border bg-panel p-3 shadow-md ${card.multiattack ? "ring-1 ring-accent/50" : ""}`}
      style={{ borderLeft: `4px solid ${meta.color}` }}
    >
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="min-w-0 flex-1 font-display text-lg leading-tight">{card.name}</h3>
        <span className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${meta.color}26`, color: meta.color }}>
          {card.multiattack ? "Мультиатака" : meta.title}
        </span>
      </header>

      {(card.attack || card.saveDc !== null || card.damage.length > 0) && (
        <div className="mt-2 space-y-1.5 text-sm">
          {card.attack && (
            <div className="flex flex-wrap items-center gap-2">
              {card.attack.kind && <span className="text-xs text-muted">{card.attack.kind}</span>}
              <button
                type="button"
                onClick={() => rollAttack(card.attack!.bonus)}
                className="rounded-md border border-border bg-bg/60 px-2 py-0.5 font-mono text-xs hover:border-accent"
                title="Бросить атаку: d20 + бонус"
              >
                {card.attack.bonus >= 0 ? "+" : "−"}
                {Math.abs(card.attack.bonus)} к попаданию 🎲
              </button>
              {card.attack.range && <span className="text-xs text-muted">{card.attack.range}</span>}
            </div>
          )}
          {card.saveDc !== null && <span className="inline-block rounded-md border border-border bg-bg/60 px-2 py-0.5 text-xs">Спасбросок цели: Сл {card.saveDc}</span>}
          {card.damage.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {card.damage.map((d, i) => (
                <span key={i} className="inline-flex items-center overflow-hidden rounded-md border border-red-400/40 bg-red-500/10 text-xs">
                  <button type="button" onClick={() => rollDamage(d.dice, false)} className="px-2 py-0.5 hover:bg-red-500/20" title="Бросить урон">
                    {d.dice}
                    {d.type ? ` ${d.type}` : ""}
                    {d.avg ? ` (≈${d.avg})` : ""} 🎲
                  </button>
                  <button type="button" onClick={() => rollDamage(d.dice, true)} className="border-l border-red-400/40 px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/20" title="Критическое попадание: кубы урона удваиваются">
                    крит
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {roll && (
        <p
          className={`mt-2 rounded-md px-2 py-1 text-sm ${roll.tone === "crit" ? "bg-amber-500/20 text-amber-200" : roll.tone === "fumble" ? "bg-red-500/15 text-red-300" : "bg-bg/70"}`}
          aria-live="polite"
        >
          {roll.text}
        </p>
      )}

      {card.desc && (
        <div className="mt-2">
          <p className={`whitespace-pre-wrap text-sm leading-relaxed text-text/90 ${long && !open ? "line-clamp-6" : ""}`}>{card.desc}</p>
          {long && (
            <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => setOpen((v) => !v)}>
              {open ? "Свернуть" : "Показать полностью"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Прокручиваемая колонка карточек: у каждого действия, оружия или особенности — своя карточка. */
export function NpcCards({ title, cards, className = "" }: { title: string; cards: AbilityCard[]; className?: string }) {
  if (cards.length === 0) return null;
  return (
    <aside className={className}>
      <h2 className="mb-2 px-1 font-display text-lg text-accent">
        {title} <span className="text-sm text-muted">· {cards.length}</span>
      </h2>
      <div className="flex flex-col gap-3">
        {cards.map((c, i) => (
          <Card key={`${c.section}-${i}-${c.name}`} card={c} />
        ))}
      </div>
    </aside>
  );
}
