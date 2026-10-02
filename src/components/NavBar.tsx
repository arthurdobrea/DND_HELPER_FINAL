"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { logout } from "@/app/actions";

const LINKS = [
  { href: "/characters", label: "🧙 Персонажи" },
  { href: "/monsters", label: "🐲 Монстры" },
  { href: "/encounters", label: "⚔️ Столкновения" },
  { href: "/spells", label: "✨ Заклинания" },
  { href: "/items", label: "🗡️ Предметы" },
  { href: "/shop", label: "🏺 Магазин" },
  { href: "/books", label: "📚 Книги" },
];

export function NavBar({ worldName }: { worldName?: string }) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);

  // Фактическая высота шапки → CSS-переменная --header-h: раскладка (колонки каталога, вьюер) считает от неё,
  // а не от зашитых 49px. Иначе при масштабе браузера 125–150% страница начинает прокручиваться целиком.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pathname]);

  if (pathname === "/login") return null;

  const tab = (href: string, text: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${active ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
      >
        {text}
      </Link>
    );
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <nav className="flex items-center gap-1 overflow-x-auto px-4 py-2">
        <Link href="/worlds" className="mr-2 font-display text-lg text-accent" title="Выбор мира">
          🐉
        </Link>
        {worldName && pathname !== "/worlds" && (
          <>
            <Link
              href="/world"
              className={`mr-2 max-w-60 shrink-0 truncate rounded-md border px-3 py-1 font-display text-sm ${pathname === "/world" ? "border-accent bg-panel-2 text-accent" : "border-border text-text hover:border-accent"}`}
              title="Закладки мира"
            >
              🌍 {worldName}
            </Link>
            {LINKS.map((l) => tab(l.href, l.label))}
          </>
        )}
        <form action={logout} className="ml-auto shrink-0 pl-2">
          <button className="text-xs text-muted hover:text-text">Выйти</button>
        </form>
      </nav>
    </header>
  );
}
