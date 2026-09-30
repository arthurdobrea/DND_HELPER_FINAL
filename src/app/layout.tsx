import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { getCurrentWorld } from "@/lib/world";
import "./globals.css";

export const metadata: Metadata = {
  title: "DnD Helper",
  description: "Помощник мастера: миры, закладки по книгам, заклинания, предметы, монстры",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const world = await getCurrentWorld();
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <NavBar worldName={world?.name} />
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
