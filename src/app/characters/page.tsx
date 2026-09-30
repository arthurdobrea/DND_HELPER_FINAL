import Link from "next/link";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { initiative, normalizeSheet, passivePerception, signed, spellStats } from "@/lib/character";
import { createCharacter } from "@/app/actions";
import { QuickHp } from "@/components/character/QuickHp";

export default async function CharactersPage() {
  await connection();
  const world = await requireWorld();
  const rows = getDb()
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.worldId, world.id))
    .orderBy(asc(schema.characters.name))
    .all();
  const party = rows.map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) }));

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <h1 className="font-display text-2xl text-accent">🧙 Персонажи мира «{world.name}»</h1>

      {party.length === 0 && <p className="mt-4 text-muted">Пока нет персонажей — создайте первого ниже.</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {party.map(({ id, s }) => {
          const spell = spellStats(s);
          const hpPct = s.hpMax > 0 ? Math.max(0, Math.min(100, (s.hpCurrent / s.hpMax) * 100)) : 0;
          return (
            <div key={id} className="card p-3">
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
                    <div
                      className={`h-full ${hpPct > 50 ? "bg-green-600" : hpPct > 25 ? "bg-amber-500" : "bg-red-600"}`}
                      style={{ width: `${hpPct}%` }}
                    />
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
                  <div key={l} className="rounded bg-panel-2 py-1">
                    <div className="font-display text-lg leading-tight">{v}</div>
                    <div className="text-[10px] text-muted">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <form action={createCharacter} className="card mt-6 flex flex-wrap items-center gap-2 p-3">
        <span className="font-display">＋ Новый персонаж</span>
        <input name="name" required placeholder="Имя персонажа" className="input flex-1" />
        <input name="playerName" placeholder="Игрок" className="input w-48" />
        <button className="btn btn-primary">Создать лист</button>
      </form>
    </div>
  );
}
