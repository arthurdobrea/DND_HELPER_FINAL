import Link from "next/link";
import { initiative, passivePerception, signed, spellStats, type CharacterSheet } from "@/lib/character";
import { QuickHp } from "@/components/character/QuickHp";
import { PresenceCard } from "@/components/character/PresenceCard";
import { ageMs } from "@/lib/presence";
import { PinButton } from "@/components/PinButton";
import { toggleEntry } from "@/app/actions";
import { GiveToHero } from "@/components/character/GiveItem";

/** Карточка героя игрока: имя, хиты, КД и прочее; бабл связи и тема игрока (PresenceCard). */
export function HeroCard({ id, s, pinned }: { id: number; s: CharacterSheet; pinned: boolean }) {
  const spell = spellStats(s);
  const hpPct = s.hpMax > 0 ? Math.max(0, Math.min(100, (s.hpCurrent / s.hpMax) * 100)) : 0;
  return (
    <PresenceCard
      id={id}
      ageMs={ageMs(id)}
      theme={s.theme ?? null}
      foot={
        <div className="mt-3 space-y-2">
          <GiveToHero heroId={id} heroName={s.name || "герою"} />
          <PinButton pinned={pinned} toggle={toggleEntry.bind(null, "hero", String(id))} />
        </div>
      }
      head={
        <>
          <Link href={`/characters/${id}`} className="block">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-display text-xl text-accent hover:underline">{s.name || "Без имени"}</span>
              <span className="tag shrink-0">ур. {s.level}</span>
            </div>
            <div className="truncate text-sm text-muted">
              {[s.race, s.className].filter(Boolean).join(" · ") || "—"}
              {s.playerName && ` · игрок: ${s.playerName}`}
            </div>
          </Link>
          <Link href={`/story?h=${id}`} className="mt-1 inline-block text-xs text-muted hover:text-accent">
            📜 Сюжет и зацепки героя
          </Link>
        </>
      }
    >
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <div className="flex justify-between text-xs text-muted">
            <span>Хиты</span>
            <span>
              <b className="text-text">{s.hpCurrent}</b> / {s.hpMax}
              {s.hpTemp > 0 && <span className="text-sky-400"> +{s.hpTemp}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel-2">
            <div className={`h-full ${hpPct > 50 ? "bg-green-600" : hpPct > 25 ? "bg-amber-500" : "bg-red-600"}`} style={{ width: `${hpPct}%` }} />
          </div>
        </div>
        <QuickHp id={id} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {[
          ["КД", s.ac],
          ["Иниц.", signed(initiative(s))],
          ["Пасс. вним.", passivePerception(s)],
          ["Сл закл.", spell ? spell.dc : "—"],
        ].map(([l, v]) => (
          <div key={l} className="rounded bg-panel-2 py-1" style={{ backgroundImage: "var(--tile-img, none)" }}>
            <div className="font-display text-lg leading-tight">{v}</div>
            <div className="text-[10px] text-muted">{l}</div>
          </div>
        ))}
      </div>
    </PresenceCard>
  );
}
