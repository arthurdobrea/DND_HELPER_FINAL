import type { Spell } from "@/lib/catalog";
import { ABILITIES, CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, SCHOOLS, label } from "@/lib/catalog/labels";
import { SPELL_EFFECTS, spellLevelLabel } from "@/lib/catalog/spells";
import { RichText } from "./RichText";

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <p>
      <span className="font-bold text-[var(--sb-rule)]">{k}:</span> {v}
    </p>
  );
}

export function SpellCard({ s }: { s: Spell }) {
  const comps = [s.components.v && "V", s.components.s && "S", s.components.m && "M"].filter(Boolean).join(", ");
  return (
    <article className="rounded-md bg-[var(--sb-bg)] p-5 text-[15px] leading-snug text-[var(--sb-text)] shadow-xl">
      <h2 className="font-display text-3xl font-bold text-[var(--sb-rule)]">{s.name}</h2>
      <p className="italic">
        {spellLevelLabel(s.level)} · {label(SCHOOLS, s.school)}
        {s.ritual && " · ритуал"}
      </p>
      <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />
      <Row
        k="Время"
        v={`${label(CASTING_TIMES, s.castingTime)}${s.reactionCondition ? ` (${s.reactionCondition})` : ""}`}
      />
      <Row k="Дистанция" v={s.range + (s.area ? ` · ${s.area}` : "")} />
      <Row k="Компоненты" v={comps + (s.material ? ` (${s.material})` : "")} />
      <Row k="Длительность" v={(s.concentration ? "Концентрация, " : "") + s.duration} />
      <Row k="Спасбросок" v={label(ABILITIES, s.save)} />
      {s.attack && <Row k="Атака" v="бросок атаки заклинанием" />}
      <Row
        k="Урон"
        v={[s.damageRoll, s.damageTypes.map((d) => label(DAMAGE_TYPES, d)).join(", ")].filter(Boolean).join(" ")}
      />
      <Row k="Состояния" v={s.conditions.map((c) => label(CONDITIONS, c)).join(", ")} />
      <Row k="Классы" v={s.classes.map((c) => label(CLASSES, c)).join(", ")} />
      <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />
      <RichText text={s.desc} />
      {s.higherLevel && (
        <div className="mt-2">
          <span className="font-bold italic">На более высоких кругах. </span>
          <RichText text={s.higherLevel} className="inline [&>p]:inline" />
        </div>
      )}
      {s.effects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {s.effects.map((e) => (
            <span key={e} className="rounded bg-[var(--sb-rule)]/10 px-1.5 py-0.5 text-xs text-[var(--sb-rule)]">
              {SPELL_EFFECTS[e]}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs italic opacity-60">Источник: {s.source}</p>
    </article>
  );
}
