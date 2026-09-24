import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getMonster, type Monster } from "@/lib/open5e";
import { StatBlock } from "@/components/StatBlock";
import { PinButton } from "@/components/PinButton";
import { saveFavoriteNotes, toggleFavorite } from "@/app/actions";
import { NotesEditor } from "@/components/NotesEditor";

export default async function MonsterPage({ params }: PageProps<"/monsters/[slug]">) {
  await connection();
  const { slug } = await params;

  // Сначала из избранного (работает офлайн), иначе — из API.
  const fav = getDb().select().from(schema.favorites).where(eq(schema.favorites.slug, slug)).get();
  const monster: Monster | null = fav ? (JSON.parse(fav.data) as Monster) : await getMonster(slug);
  if (!monster) notFound();

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <div>
        <StatBlock m={monster} />
        {monster.desc && (
          <details className="card mt-4 p-4 text-sm">
            <summary className="cursor-pointer text-muted">Описание / лор</summary>
            <div className="mt-2 whitespace-pre-line">{monster.desc}</div>
          </details>
        )}
      </div>
      <aside className="space-y-3">
        <PinButton pinned={!!fav} toggle={toggleFavorite.bind(null, slug)} />
        {fav && <NotesEditor key={fav.notes} initial={fav.notes} save={saveFavoriteNotes.bind(null, slug)} />}
        <Link href="/monsters" className="btn w-full">
          ← К поиску
        </Link>
      </aside>
    </div>
  );
}
