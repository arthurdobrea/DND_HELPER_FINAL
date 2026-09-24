import Link from "next/link";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Item, Spell } from "@/lib/catalog";
import { ITEM_CATEGORIES, RARITIES, SCHOOLS, label } from "@/lib/catalog/labels";
import { spellLevelLabel } from "@/lib/catalog/spells";

function Section({ title, count, empty, children }: { title: string; count: number; empty: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-xl text-accent">
        {title} <span className="text-sm text-muted">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

function Card({ href, title, badge, sub, notes }: { href: string; title: string; badge?: string; sub: string; notes: string }) {
  return (
    <Link href={href} className="card block p-3 hover:border-accent">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg text-accent">{title}</span>
        {badge && <span className="tag shrink-0">{badge}</span>}
      </div>
      <div className="text-sm text-muted">{sub}</div>
      {notes && <p className="mt-2 line-clamp-2 text-sm">{notes}</p>}
    </Link>
  );
}

export default async function FavoritesPage() {
  await connection();
  const db = getDb();
  const monsters = db.select().from(schema.favorites).orderBy(asc(schema.favorites.name)).all();
  const pins = db.select().from(schema.pins).orderBy(asc(schema.pins.name)).all();
  const spells = pins.filter((p) => p.kind === "spells");
  const items = pins.filter((p) => p.kind === "items");

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <h1 className="font-display text-2xl text-accent">Избранное</h1>

      <Section title="🐲 Монстры" count={monsters.length} empty={<Link href="/monsters" className="underline">Найти монстра</Link>}>
        {monsters.map((f) => (
          <Card key={f.id} href={`/monsters/${f.slug}`} title={f.name} badge={`CR ${f.cr}`} sub={f.type ?? ""} notes={f.notes} />
        ))}
      </Section>

      <Section title="✨ Заклинания" count={spells.length} empty={<Link href="/spells" className="underline">Открыть заклинания</Link>}>
        {spells.map((p) => {
          const s = JSON.parse(p.data) as Spell;
          return (
            <Card
              key={p.id}
              href={`/spells?open=${encodeURIComponent(p.key)}`}
              title={p.name}
              badge={spellLevelLabel(s.level)}
              sub={`${label(SCHOOLS, s.school)} · ${s.source}`}
              notes={p.notes}
            />
          );
        })}
      </Section>

      <Section title="🗡️ Предметы" count={items.length} empty={<Link href="/items" className="underline">Открыть предметы</Link>}>
        {items.map((p) => {
          const i = JSON.parse(p.data) as Item;
          return (
            <Card
              key={p.id}
              href={`/items?open=${encodeURIComponent(p.key)}`}
              title={p.name}
              badge={i.rarity ? label(RARITIES, i.rarity) : undefined}
              sub={`${label(ITEM_CATEGORIES, i.category)} · ${i.source}`}
              notes={p.notes}
            />
          );
        })}
      </Section>
    </div>
  );
}
