import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentWorld } from "@/lib/world";
import { createWorld, selectWorld } from "@/app/actions";
import { WorldActions } from "@/components/WorldActions";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

const KIND_LABELS = { page: "📖", spell: "✨", item: "🗡️", monster: "🐲" } as const;

export const metadata: Metadata = pageMeta("Миры", "🐉");

export default async function WorldsPage() {
  await connection();
  const db = getDb();
  const current = await getCurrentWorld();
  const worlds = db.select().from(schema.worlds).orderBy(desc(schema.worlds.openedAt)).all();
  const counts = db
    .select({ worldId: schema.worldEntries.worldId, kind: schema.worldEntries.kind, n: sql<number>`count(*)` })
    .from(schema.worldEntries)
    .groupBy(schema.worldEntries.worldId, schema.worldEntries.kind)
    .all();

  return (
    <div className="mx-auto w-full max-w-3xl p-4 pt-10">
      <h1 className="text-center font-display text-4xl text-accent">🐉 Выберите мир</h1>
      <p className="mt-2 text-center text-muted">У каждого мира свои закладки: страницы книг, заклинания, предметы, монстры.</p>

      {worlds.length > 0 && (
        <div className="mt-8 space-y-2">
          {worlds.map((w, idx) => {
            const c = counts.filter((x) => x.worldId === w.id);
            return (
              <div
                key={w.id}
                className={`card flex items-center gap-3 p-4 ${idx === 0 ? "border-accent" : ""}`}
              >
                <form action={selectWorld.bind(null, w.id)} className="flex-1">
                  <button className="w-full cursor-pointer text-left">
                    <div className="font-display text-xl text-accent">
                      🌍 {w.name}
                      {current?.id === w.id && <span className="ml-2 text-xs text-muted">(текущий)</span>}
                    </div>
                    {w.description && <div className="text-sm text-muted">{w.description}</div>}
                    <div className="mt-1 flex gap-3 text-xs text-muted">
                      {c.length === 0
                        ? "пока без закладок"
                        : c.map((x) => (
                            <span key={x.kind}>
                              {KIND_LABELS[x.kind]} {x.n}
                            </span>
                          ))}
                      <span>· открыт {w.openedAt.toLocaleDateString("ru-RU")}</span>
                    </div>
                  </button>
                </form>
                <form action={selectWorld.bind(null, w.id)}>
                  <button className={`btn ${idx === 0 ? "btn-primary" : ""}`}>{idx === 0 ? "Продолжить" : "Открыть"}</button>
                </form>
                <WorldActions id={w.id} name={w.name} description={w.description} />
              </div>
            );
          })}
        </div>
      )}

      <form action={createWorld} className="card mt-8 space-y-2 p-4">
        <h2 className="font-display text-lg">＋ Новый мир</h2>
        <input name="name" required placeholder="Название (Проклятие Страда, Забытые королевства…)" className="input w-full" />
        <input name="description" placeholder="Описание (необязательно)" className="input w-full" />
        <button className="btn btn-primary">Создать и открыть</button>
      </form>
    </div>
  );
}
