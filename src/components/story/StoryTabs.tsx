import Link from "next/link";

/** Переключатель разделов вкладки «Сюжет»: заметки героев и повествование по локациям. */
export function StoryTabs({ active }: { active: "notes" | "locations" }) {
  const tab = (key: "notes" | "locations", href: string, text: string) => (
    <Link
      href={href}
      className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm ${active === key ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}
    >
      {text}
    </Link>
  );
  return (
    <div className="mb-3 flex gap-1 rounded-lg border border-border bg-panel p-1">
      {tab("notes", "/story", "📜 Герои")}
      {tab("locations", "/story/locations", "🗺️ Локации")}
    </div>
  );
}
