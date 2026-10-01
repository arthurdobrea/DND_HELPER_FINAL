"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/characters", label: "🧙 Персонажи" },
  { href: "/monsters", label: "🐲 Монстры" },
  { href: "/spells", label: "✨ Заклинания" },
  { href: "/items", label: "🗡️ Предметы" },
  { href: "/shop", label: "🏺 Магазин" },
  { href: "/books", label: "📚 Книги" },
];

export function NavBar({ worldName }: { worldName?: string }) {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  const tab = (href: string, text: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
      >
        {text}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <nav className="flex items-center gap-1 px-4 py-2">
        <Link href="/worlds" className="mr-2 font-display text-lg text-accent" title="Выбор мира">
          🐉
        </Link>
        {worldName && pathname !== "/worlds" && (
          <>
            <Link
              href="/world"
              className={`mr-2 max-w-60 truncate rounded-md border px-3 py-1 font-display text-sm ${pathname === "/world" ? "border-accent bg-panel-2 text-accent" : "border-border text-text hover:border-accent"}`}
              title="Закладки мира"
            >
              🌍 {worldName}
            </Link>
            {LINKS.map((l) => tab(l.href, l.label))}
          </>
        )}
        <form action={logout} className="ml-auto">
          <button className="text-xs text-muted hover:text-text">Выйти</button>
        </form>
      </nav>
    </header>
  );
}
