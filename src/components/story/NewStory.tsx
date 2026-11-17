"use client";

import { useState } from "react";
import type { StoryKind } from "@/lib/db/schema";
import { StoryForm, type HeroOption } from "./StoryForm";

/** Кнопка «＋ Новая заметка», раскрывающая форму; герой и вид подставляются из текущего фильтра. */
export function NewStory({
  heroes,
  suggestions,
  characterId,
  kind,
  aiEnabled,
}: {
  heroes: HeroOption[];
  suggestions: string[];
  characterId: number | null;
  kind: StoryKind;
  aiEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        ＋ Новая заметка
      </button>
    );
  }
  return (
    <div className="w-full">
      <StoryForm
        // Форма пересоздаётся при смене героя или вида в фильтре, чтобы подставились новые значения по умолчанию.
        key={`${characterId}-${kind}`}
        heroes={heroes}
        suggestions={suggestions}
        aiEnabled={aiEnabled}
        initial={{ characterId, kind, title: "", body: "", subject: "", trigger: "", boon: "" }}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
