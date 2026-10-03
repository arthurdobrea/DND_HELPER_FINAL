"use client";

import { useState, useTransition } from "react";
import { deleteStoryNote, saveStoryReaction, setStoryFlag } from "@/app/actions";
import type { StoryKind } from "@/lib/db/schema";
import { STORY_META } from "@/lib/story";
import { StoryForm, type HeroOption } from "./StoryForm";

export type StoryCardData = {
  id: number;
  characterId: number | null;
  heroName: string | null;
  kind: StoryKind;
  title: string;
  body: string;
  subject: string;
  trigger: string;
  boon: string;
  boonGiven: boolean;
  told: boolean;
  toldAt: string | null;
  reaction: string;
  pinned: boolean;
};

/** Карточка заметки: текст для зачитывания, условие, баф, отметки «рассказано» / «баф выдан» и реакция игрока. */
export function StoryCard({
  note,
  heroes,
  suggestions,
  showHero,
  aiEnabled,
}: {
  note: StoryCardData;
  heroes: HeroOption[];
  suggestions: string[];
  showHero: boolean;
  aiEnabled: boolean;
}) {
  const meta = STORY_META[note.kind];
  // false — просмотр; "edit" — обычная правка; "ai" — правка, которая сразу просит ИИ дополнить заметку.
  const [editing, setEditing] = useState<false | "edit" | "ai">(false);
  const [copied, setCopied] = useState(false);
  const [reaction, setReaction] = useState(note.reaction);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <StoryForm
        id={note.id}
        heroes={heroes}
        suggestions={suggestions}
        aiEnabled={aiEnabled}
        autoFill={editing === "ai"}
        initial={{
          characterId: note.characterId,
          kind: note.kind,
          title: note.title,
          body: note.body,
          subject: note.subject,
          trigger: note.trigger,
          boon: note.boon,
        }}
        onDone={() => setEditing(false)}
      />
    );
  }

  const flag = (f: "told" | "boonGiven" | "pinned", value: boolean) => start(() => setStoryFlag(note.id, f, value));

  return (
    <article
      className={`rounded-xl border border-border bg-panel p-3 transition ${note.told ? "opacity-75" : ""}`}
      style={{ borderLeft: `4px solid ${meta.color}` }}
    >
      <header className="flex flex-wrap items-start gap-2">
        <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${meta.color}26`, color: meta.color }}>
          {meta.icon} {meta.label}
        </span>
        {note.subject && <span className="tag">{note.subject}</span>}
        {showHero && <span className="tag">{note.heroName ?? "Вся партия"}</span>}
        <h3 className="min-w-0 basis-full font-display text-lg leading-tight sm:basis-auto sm:flex-1">{note.title}</h3>
        <button
          type="button"
          disabled={pending}
          onClick={() => flag("pinned", !note.pinned)}
          title={note.pinned ? "Открепить" : "Закрепить наверху списка"}
          className={`text-base ${note.pinned ? "" : "opacity-30 hover:opacity-100"}`}
        >
          📌
        </button>
      </header>

      {note.body && (
        <blockquote className="mt-2 whitespace-pre-wrap border-l-2 pl-3 text-[15px] leading-relaxed" style={{ borderColor: `${meta.color}99` }}>
          {note.body}
        </blockquote>
      )}

      {(note.trigger || note.boon) && (
        <div className="mt-2 space-y-1.5 text-sm">
          {note.trigger && (
            <p>
              <span className="text-muted">⏱ Когда:</span> {note.trigger}
            </p>
          )}
          {note.boon && (
            <div className="rounded-md bg-emerald-500/10 p-2">
              <p className="whitespace-pre-wrap">
                <span className="font-medium text-emerald-300">✨ Баф / награда:</span> {note.boon}
              </p>
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={note.boonGiven}
                  disabled={pending}
                  onChange={(e) => flag("boonGiven", e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                {note.boonGiven ? "Выдан" : "Ещё не выдан"}
              </label>
            </div>
          )}
        </div>
      )}

      {note.told && (
        <label className="mt-2 block text-xs text-muted">
          Как отреагировал игрок / что вышло:
          <textarea
            value={reaction}
            onChange={(e) => setReaction(e.target.value)}
            onBlur={() => reaction !== note.reaction && start(() => saveStoryReaction(note.id, reaction))}
            rows={2}
            className="input mt-1 w-full resize-y text-sm text-text"
            placeholder="Запишите, пока свежо"
          />
        </label>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={() => flag("told", !note.told)} className={`btn px-3 py-1.5 text-sm ${note.told ? "" : "btn-primary"}`}>
          {note.told ? `✓ Рассказано${note.toldAt ? ` · ${note.toldAt}` : ""} — вернуть` : "✓ Рассказал"}
        </button>
        {note.body && (
          <button
            type="button"
            className="btn px-2.5 py-1.5 text-sm"
            title="Скопировать текст"
            onClick={() =>
              navigator.clipboard?.writeText(note.body).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? "Скопировано" : "⧉ Копировать"}
          </button>
        )}
        <button
          type="button"
          className="btn px-2.5 py-1.5 text-sm"
          onClick={() => setEditing("ai")}
          title={
            aiEnabled
              ? note.kind === "deity"
                ? "ИИ дополнит заметку: превратит черновик в текст, допишет момент и баф, укажет источник"
                : "ИИ предложит доработку текста"
              : "Нужен ключ Gemini в файле .env"
          }
        >
          🪄 Дополнить ИИ
        </button>
        <span className="flex-1" />
        <button type="button" className="btn px-2.5 py-1.5 text-sm" onClick={() => setEditing("edit")} title="Править">
          ✏️
        </button>
        <button
          type="button"
          className="btn btn-danger px-2.5 py-1.5 text-sm"
          disabled={pending}
          title="Удалить"
          onClick={() => confirm(`Удалить заметку «${note.title}»?`) && start(() => deleteStoryNote(note.id))}
        >
          🗑
        </button>
      </footer>
    </article>
  );
}
