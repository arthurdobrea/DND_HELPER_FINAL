import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { normalizeSheet } from "@/lib/character";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("NPC", "🎭");

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export default async function NpcsPage() {
  await connection();
  const world = await requireWorld();
  const rows = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "npc")))
    .orderBy(asc(schema.characters.name))
    .all()
    .map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) }));

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-2xl text-accent">🎭 NPC мира «{world.name}»</h1>
        <Link href="/npcs/new" className="btn btn-primary">
          ＋ Создать NPC
        </Link>
      </div>

      {rows.length === 0 && (
        <div className="card mt-4 p-6 text-center text-muted">
          <p className="font-display text-xl text-accent">Пока нет NPC</p>
          <p className="mt-2 text-sm">Задайте имя, предысторию и мотивацию, выберите существо из бестиария — лист соберётся сам.</p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ id, s }) => {
          const hpPct = s.hpMax > 0 ? Math.max(0, Math.min(100, (s.hpCurrent / s.hpMax) * 100)) : 0;
          return (
            <Link key={id} href={`/npcs/${id}`} className="card block p-3 transition hover:border-accent">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-xl text-accent">{s.name || "Без имени"}</span>
                <span className="tag shrink-0">{s.className.split("·").pop()?.trim()}</span>
              </div>
              <div className="truncate text-sm text-muted">{[s.race, s.alignment].filter(Boolean).join(" · ") || "—"}</div>
              {s.motivation && (
                <p className="mt-2 text-sm">
                  <span className="text-muted">Мотивация:</span> {clip(s.motivation, 110)}
                </p>
              )}
              <div className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span>
                  КД <b className="text-text">{s.ac}</b>
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-panel-2">
                  <div className="h-full bg-red-500/80" style={{ width: `${hpPct}%` }} />
                </div>
                <span>
                  <b className="text-text">{s.hpCurrent}</b> / {s.hpMax}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
