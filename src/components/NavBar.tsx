"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/monsters", label: "🐲 Монстры" },
  { href: "/spells", label: "✨ Заклинания" },
  { href: "/items", label: "🗡️ Предметы" },
  { href: "/favorites", label: "⭐ Избранное" },
  { href: "/books", label: "📚 Книги" },
  { href: "/bookmarks", label: "🔖 Закладки" },
];

export function NavBar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2">
        <Link href="/" className="mr-4 font-display text-lg text-accent">
          🐉 DnD Helper
        </Link>
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
            >
              {l.label}
            </Link>
          );
        })}
        <form action={logout} className="ml-auto">
          <button className="text-xs text-muted hover:text-text">Выйти</button>
        </form>
      </nav>
    </header>
  );
}
