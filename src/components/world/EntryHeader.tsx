"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEntry, setEntryGroup, updateEntry } from "@/app/actions";
import { GroupTile } from "@/components/CategoryIcon";
import type { EntryGroup, EntryKind } from "@/lib/db/schema";
import type { Category } from "@/lib/groups";
import { KIND_META } from "./WorldSidebar";

/** Заголовок открытой закладки: название, теги, категория (значки), переименование, удаление. */
export function EntryHeader({
  entry,
  categories,
}: {
  categories: Category[];
  entry: { id: number; kind: EntryKind; group: EntryGroup; title: string; tags: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [tags, setTags] = useState(entry.tags);
  const [group, setGroup] = useState(entry.group);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 border-b border-border bg-panel px-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            await updateEntry(entry.id, title, tags);
            setEditing(false);
          });
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="input flex-1 py-1 text-sm" />
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="теги через запятую" className="input w-56 py-1 text-sm" />
        <button className="btn btn-primary" disabled={pending}>
          Сохранить
        </button>
        <button type="button" className="btn" onClick={() => setEditing(false)}>
          Отмена
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-panel px-4 py-2">
      <span className="text-lg">{KIND_META[entry.kind].icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-lg">{entry.title}</div>
        {entry.tags && (
          <div className="flex flex-wrap gap-1">
            {entry.tags.split(",").map((t) => (
              <span key={t} className="tag">
                {t.trim()}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex max-w-[45%] flex-wrap items-center justify-end gap-1.5" role="radiogroup" aria-label="Категория закладки">
        {categories.map((g) => (
          <button
            key={g.key || "none"}
            type="button"
            role="radio"
            aria-checked={group === g.key}
            disabled={pending}
            title={`${g.label} — ${g.hint}`}
            onClick={() => {
              setGroup(g.key);
              start(() => setEntryGroup(entry.id, g.key));
            }}
            className={`rounded-lg p-0.5 transition ${group === g.key ? "" : "opacity-45 hover:opacity-100"}`}
          >
            <GroupTile cat={g} size={34} active={group === g.key} />
          </button>
        ))}
      </div>

      <button className="btn" onClick={() => setEditing(true)} title="Название и теги">
        ✏️
      </button>
      <button
        className="btn btn-danger"
        disabled={pending}
        title="Убрать из мира"
        onClick={() =>
          confirm(`Убрать «${entry.title}» из закладок мира?`) &&
          start(async () => {
            await deleteEntry(entry.id);
            router.push("/world", { scroll: false });
          })
        }
      >
        🗑
      </button>
    </div>
  );
}
