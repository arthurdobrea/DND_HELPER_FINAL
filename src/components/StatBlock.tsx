import { abilityMod, formatSpeed, type Monster, type NamedDesc } from "@/lib/open5e";
import { RichText } from "./RichText";

const ABILITIES = [
  ["STR", "strength"],
  ["DEX", "dexterity"],
  ["CON", "constitution"],
  ["INT", "intelligence"],
  ["WIS", "wisdom"],
  ["CHA", "charisma"],
] as const;

function Rule() {
  return <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />;
}

function Line({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <p>
      <span className="font-bold text-[var(--sb-rule)]">{label}</span> {value}
    </p>
  );
}

function Section({ title, items, intro }: { title: string; items?: NamedDesc[] | null; intro?: string }) {
  if (!items?.length) return null;
  return (
    <section className="mt-3">
      <h3 className="border-b border-[var(--sb-rule)] font-display text-xl text-[var(--sb-rule)]">{title}</h3>
      {intro && <RichText text={intro} className="mt-1" />}
      <div className="mt-1 space-y-1.5">
        {items.map((a, i) => (
          <div key={i}>
            <span className="font-bold italic">{a.name}.</span> <RichText text={a.desc} className="inline [&>p]:inline" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function StatBlock({ m }: { m: Monster }) {
  const saves = ABILITIES.map(([label, key]) => {
    const v = m[`${key}_save` as keyof Monster] as number | null | undefined;
    return v != null ? `${label} ${v >= 0 ? "+" : ""}${v}` : null;
  })
    .filter(Boolean)
    .join(", ");
  const skills = Object.entries(m.skills ?? {})
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v >= 0 ? "+" : ""}${v}`)
    .join(", ");

  return (
    <article className="rounded-md bg-[var(--sb-bg)] p-5 text-[15px] leading-snug text-[var(--sb-text)] shadow-xl">
      <h2 className="font-display text-3xl font-bold text-[var(--sb-rule)]">{m.name}</h2>
      <p className="italic">
        {m.size} {m.type.toLowerCase()}
        {m.subtype ? ` (${m.subtype})` : ""}
        {m.alignment ? `, ${m.alignment}` : ""}
      </p>
      <Rule />
      <Line label="Armor Class" value={`${m.armor_class}${m.armor_desc ? ` (${m.armor_desc})` : ""}`} />
      <Line label="Hit Points" value={`${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ""}`} />
      <Line label="Speed" value={formatSpeed(m.speed)} />
      <Rule />
      <div className="grid grid-cols-6 text-center">
        {ABILITIES.map(([label, key]) => (
          <div key={key}>
            <div className="font-bold text-[var(--sb-rule)]">{label}</div>
            <div>
              {m[key]} ({abilityMod(m[key])})
            </div>
          </div>
        ))}
      </div>
      <Rule />
      <Line label="Saving Throws" value={saves} />
      <Line label="Skills" value={skills} />
      <Line label="Damage Vulnerabilities" value={m.damage_vulnerabilities} />
      <Line label="Damage Resistances" value={m.damage_resistances} />
      <Line label="Damage Immunities" value={m.damage_immunities} />
      <Line label="Condition Immunities" value={m.condition_immunities} />
      <Line label="Senses" value={m.senses} />
      <Line label="Languages" value={m.languages || "—"} />
      <Line label="Challenge" value={m.challenge_rating} />
      <Rule />

      {m.special_abilities?.length ? (
        <div className="space-y-1.5">
          {m.special_abilities.map((a, i) => (
            <div key={i}>
              <span className="font-bold italic">{a.name}.</span>{" "}
              <RichText text={a.desc} className="inline [&>p]:inline" />
            </div>
          ))}
        </div>
      ) : null}

      <Section title="Actions" items={m.actions} />
      <Section title="Bonus Actions" items={m.bonus_actions} />
      <Section title="Reactions" items={m.reactions} />
      <Section title="Legendary Actions" items={m.legendary_actions} intro={m.legendary_desc} />

      {m.document__title && <p className="mt-4 text-xs italic opacity-60">Источник: {m.document__title}</p>}
    </article>
  );
}
