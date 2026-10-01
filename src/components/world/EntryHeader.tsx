"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEntry, setEntryGroup, updateEntry } from "@/app/actions";
import type { EntryGroup, EntryKind } from "@/lib/db/schema";
import { GROUPS } from "@/lib/groups";
import { KIND_META } from "./WorldSidebar";

/** Заголовок открытой закладки: название, теги, группа, переименование, удаление. */
export function EntryHeader({
  entry,
}: {
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

      <label className="flex items-center gap-1.5 text-xs text-muted" title="Группа закладки">
        Группа
        <select
          value={group}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value as EntryGroup;
            setGroup(next);
            start(() => setEntryGroup(entry.id, next));
          }}
          className="input py-1 text-sm text-text"
        >
          {GROUPS.map((g) => (
            <option key={g.key || "other"} value={g.key}>
              {g.icon} {g.label}
            </option>
          ))}
        </select>
      </label>

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
