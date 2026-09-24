import Link from "next/link";
import { connection } from "next/server";
import { getDb, schema } from "@/lib/db";
import { searchMonsters, type SearchResult } from "@/lib/open5e";

export default async function MonstersPage({ searchParams }: PageProps<"/monsters">) {
  await connection();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const srd = sp.srd === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  let result: SearchResult | null = null;
  let error: string | null = null;
  if (q) {
    try {
      result = await searchMonsters({ query: q, srdOnly: srd, page });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const favSlugs = new Set(
    getDb().select({ slug: schema.favorites.slug }).from(schema.favorites).all().map((f) => f.slug),
  );
  const pageHref = (p: number) =>
    `/monsters?${new URLSearchParams({ q, ...(srd ? { srd: "1" } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <form className="flex flex-wrap items-center gap-2" action="/monsters">
        <input
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Название монстра (goblin, dragon…)"
          className="input flex-1"
        />
        <label className="flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" name="srd" value="1" defaultChecked={srd} /> только 5e SRD
        </label>
        <button className="btn btn-primary">Искать</button>
      </form>

      {error && <p className="mt-4 text-red-400">Ошибка API: {error}</p>}

      {result && (
        <>
          <p className="mt-4 text-sm text-muted">Найдено: {result.count}</p>
          <div className="card mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-panel-2 text-left text-muted">
                <tr>
                  <th className="p-2">Имя</th>
                  <th className="p-2">CR</th>
                  <th className="p-2">Тип</th>
                  <th className="p-2">HP</th>
                  <th className="p-2">AC</th>
                  <th className="p-2">Источник</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((m) => (
                  <tr key={m.slug} className="border-t border-border hover:bg-panel-2">
                    <td className="p-2">
                      <Link href={`/monsters/${m.slug}`} className="font-medium text-accent hover:underline">
                        {favSlugs.has(m.slug) && "⭐ "}
                        {m.name}
                      </Link>
                    </td>
                    <td className="p-2">{m.challenge_rating}</td>
                    <td className="p-2">
                      {m.size} {m.type}
                    </td>
                    <td className="p-2">{m.hit_points}</td>
                    <td className="p-2">{m.armor_class}</td>
                    <td className="p-2 text-muted">{m.document__title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="btn">
                ← Назад
              </Link>
            )}
            {result.hasMore && (
              <Link href={pageHref(page + 1)} className="btn">
                Ещё →
              </Link>
            )}
          </div>
        </>
      )}

      {!q && (
        <p className="mt-8 text-center text-muted">
          Введите имя монстра. Данные — Open5e (SRD + сторонние книги).
        </p>
      )}
    </div>
  );
}
