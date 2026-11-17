"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createStoryNote, generateDeityNote, generateStoryText, updateStoryNote } from "@/app/actions";
import type { StoryKind } from "@/lib/db/schema";
import { STORY_LIMITS, STORY_META, STORY_ORDER, type StoryInput } from "@/lib/story";

/** Герой для выбора в форме; backstory — предыстория из листа (для подсказок ИИ). */
export type HeroOption = { id: number; name: string; backstory?: string };

/** Форма заметки: создание (без id) или правка (с id). Подписи полей зависят от вида заметки. */
export function StoryForm({
  heroes,
  suggestions,
  initial,
  id,
  aiEnabled,
  autoFill = false,
  onDone,
}: {
  heroes: HeroOption[];
  /** Ранее использованные божества — подсказки в поле «Божество». */
  suggestions: string[];
  initial: StoryInput;
  id?: number;
  /** Задан ли GEMINI_API_KEY: без него кнопки подсказок не показываются. */
  aiEnabled: boolean;
  /** Открыто кнопкой «Дополнить ИИ» с карточки: сразу запросить подсказку. */
  autoFill?: boolean;
  onDone: () => void;
}) {
  const [v, setV] = useState<StoryInput>(initial);
  const [pending, start] = useTransition();
  // ИИ-подсказка: результат показывается отдельным блоком, в поле он попадает только по кнопке.
  const [wishes, setWishes] = useState("");
  const [ai, setAi] = useState<{ target: "body" | "boon"; text: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusy, startAi] = useTransition();
  // «Заполнить всё» для божества: искать ли в интернете и откуда пришли сведения (канон или выдумка).
  const [searchWeb, setSearchWeb] = useState(true);
  const [deityBusy, startDeity] = useTransition();
  const [deityInfo, setDeityInfo] = useState<{ source: string; links: { title: string; uri: string }[]; searched: boolean } | null>(null);
  const meta = STORY_META[v.kind];
  const set = <K extends keyof StoryInput>(k: K, val: StoryInput[K]) => setV((s) => ({ ...s, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) return;
    start(async () => {
      if (id !== undefined) await updateStoryNote(id, v);
      else await createStoryNote(v);
      onDone();
    });
  }

  function ask(target: "body" | "boon") {
    setAiError(null);
    startAi(async () => {
      const r = await generateStoryText({
        characterId: v.characterId,
        kind: v.kind,
        target,
        title: v.title,
        subject: v.subject,
        trigger: v.trigger,
        draft: target === "body" ? v.body : v.boon,
        wishes,
        useBackstory: withStory,
      });
      if (r.ok) setAi({ target, text: r.text });
      else setAiError(r.error);
    });
  }

  // Исходный текст до правки ИИ — чтобы его можно было вернуть.
  const [prevBody, setPrevBody] = useState<string | null>(null);

  // Галочка «использовать предысторию героя»: включена — ИИ опирается на лист героя, выключена — только на поля заметки.
  const [useStory, setUseStory] = useState(true);
  const heroStory = heroes.find((h) => h.id === v.characterId)?.backstory?.trim() ?? "";
  const withStory = useStory && heroStory !== "";

  /**
   * Заполняет и дополняет заметку о божестве. Уже написанное учитывается: черновик текста ИИ превращает в готовый текст
   * (исходный можно вернуть кнопкой), а заголовок, момент и баф, которые уже есть, остаются как есть.
   */
  function fillDeity(subjectOverride?: string) {
    const subject = (subjectOverride ?? v.subject).trim();
    if (!subject) {
      setAiError("Сначала укажите божество (например, Raven Queen).");
      return;
    }
    setAiError(null);
    setDeityInfo(null);
    const before = v;
    startDeity(async () => {
      const r = await generateDeityNote({
        characterId: before.characterId,
        subject,
        title: before.title,
        wishes,
        search: searchWeb,
        draft: before.body,
        trigger: before.trigger,
        boon: before.boon,
        useBackstory: withStory,
      });
      if (!r.ok) {
        setAiError(r.error);
        return;
      }
      setPrevBody(before.body.trim() ? before.body : null);
      setV((s) => ({
        ...s,
        title: s.title.trim() ? s.title : r.fields.title || s.title,
        subject: s.subject.trim() ? s.subject : r.fields.subject || s.subject,
        body: r.fields.body || s.body,
        trigger: s.trigger.trim() ? s.trigger : r.fields.trigger || s.trigger,
        boon: s.boon.trim() ? s.boon : r.fields.boon || s.boon,
      }));
      setDeityInfo({ source: r.source, links: r.links, searched: r.searched });
    });
  }

  // Открыто кнопкой «Дополнить ИИ»: для божества сразу дописываем всё недостающее, для остальных видов — подсказка к тексту.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoFill || !aiEnabled || autoStarted.current) return;
    autoStarted.current = true;
    // Без отмены таймера в cleanup: в dev React монтирует эффект дважды, и отмена убила бы единственный запуск.
    setTimeout(() => (initial.kind === "deity" ? fillDeity(initial.subject) : ask("body")), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyAi(mode: "replace" | "append") {
    if (!ai) return;
    const field = ai.target === "body" ? "body" : "boon";
    set(field, mode === "replace" || !v[field].trim() ? ai.text : `${v[field].trimEnd()}

${ai.text}`);
    setAi(null);
  }

  const label = "mb-1 block text-xs uppercase tracking-wide text-muted";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-accent/50 bg-panel p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Вид заметки">
        {STORY_ORDER.map((k) => {
          const m = STORY_META[k];
          const on = v.kind === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              title={m.hint}
              onClick={() => set("kind", k as StoryKind)}
              className="rounded-md border border-border px-2.5 py-1 text-sm transition"
              style={on ? { borderColor: m.color, color: m.color, backgroundColor: `${m.color}1f` } : undefined}
            >
              {m.icon} {m.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>Герой</span>
          <select
            value={v.characterId ?? ""}
            onChange={(e) => set("characterId", e.target.value === "" ? null : Number(e.target.value))}
            className="input w-full py-1.5 text-sm"
          >
            <option value="">Вся партия</option>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Заголовок</span>
          <input
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={STORY_LIMITS.title}
            placeholder={v.kind === "deity" ? "Например: Первое видение Королевы воронов" : "Коротко, чтобы узнать в списке"}
            className="input w-full py-1.5 text-sm"
            autoFocus
          />
        </label>
      </div>

      {meta.subject && (
        <label className="block">
          <span className={label}>{meta.subject}</span>
          <input
            value={v.subject}
            onChange={(e) => set("subject", e.target.value)}
            maxLength={STORY_LIMITS.short}
            list="story-subjects"
            placeholder={v.kind === "deity" ? "Raven Queen" : ""}
            className="input w-full py-1.5 text-sm"
          />
          {v.kind === "deity" && (
            <datalist id="story-subjects">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </label>
      )}

      <label className="block">
        <span className={label}>{meta.body}</span>
        <textarea
          value={v.body}
          onChange={(e) => set("body", e.target.value)}
          rows={5}
          maxLength={STORY_LIMITS.long}
          placeholder="Можно писать прямой речью — как будете зачитывать"
          className="input w-full resize-y text-sm"
        />
      </label>

      {aiEnabled && v.characterId !== null && (
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/5 p-2 text-sm">
          <label className={`flex items-start gap-2 ${heroStory ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="checkbox"
              checked={withStory}
              disabled={!heroStory}
              onChange={(e) => setUseStory(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              📖 <b>Использовать предысторию героя как основу</b>
              <span className="block text-xs text-muted">
                {!heroStory
                  ? "В листе этого героя нет предыстории — заполните её во вкладке «Персонажи»."
                  : withStory
                    ? "ИИ возьмёт предысторию, черты, идеалы и привязанности из листа и построит заметку на них."
                    : "Выключено: ИИ опирается только на заголовок, черновик и пожелания из полей заметки."}
              </span>
            </span>
          </label>
          {heroStory && (
            <details className="mt-1 text-xs text-muted">
              <summary className="cursor-pointer hover:text-accent">Показать предысторию героя</summary>
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-bg/50 p-2 text-text/80">{heroStory}</p>
            </details>
          )}
        </div>
      )}

      {aiEnabled && v.kind === "deity" && (
        <div className="space-y-2 rounded-lg border border-violet-400/50 bg-violet-500/10 p-2">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary px-3 py-1.5 text-sm" disabled={deityBusy || aiBusy} onClick={() => fillDeity()}>
              {deityBusy ? "Ищу и пишу… (до минуты)" : "✨ Заполнить / дополнить по божеству"}
            </button>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={searchWeb} onChange={(e) => setSearchWeb(e.target.checked)} className="accent-[var(--accent)]" />
              Искать каноничные сведения в интернете
            </label>
          </div>
          <p className="text-xs text-muted">
            Заполнит недостающие поля (заголовок, момент, баф), а ваш черновик текста превратит в готовый текст — его можно вернуть. Если божество есть в материалах D&D, ИИ опирается на них, иначе придумывает сам — и пишет, что именно.
          </p>
          {deityInfo && (
            <div className="rounded-md border border-border bg-bg/60 p-2 text-sm">
              <p>
                <span className="text-muted">📚 Откуда сведения:</span> {deityInfo.source || "ИИ не указал источник — считайте это черновиком и проверьте."}
              </p>
              {!deityInfo.searched && searchWeb && <p className="mt-1 text-xs text-amber-300">Поиск в интернете недоступен для этой модели — текст написан по знаниям модели.</p>}
              {deityInfo.links.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {deityInfo.links.map((l) => (
                    <li key={l.uri}>
                      <a href={l.uri} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        🔗 {l.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted">ИИ может ошибаться: сверьте канон по ссылкам, если это важно для сюжета.</p>
              {prevBody !== null && (
                <button
                  type="button"
                  className="btn mt-2 px-2.5 py-1 text-xs"
                  onClick={() => {
                    set("body", prevBody);
                    setPrevBody(null);
                  }}
                >
                  ↩ Вернуть мой исходный текст
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {aiEnabled ? (
        <div className="space-y-2 rounded-lg border border-violet-400/30 bg-violet-500/5 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={wishes}
              onChange={(e) => setWishes(e.target.value)}
              maxLength={300}
              placeholder="Пожелания для ИИ: тон, детали (необязательно)"
              className="input min-w-0 flex-1 py-1 text-sm"
            />
            <button type="button" className="btn px-3 py-1 text-sm" disabled={aiBusy || (!v.title.trim() && !(withStory && v.kind === "hook"))} onClick={() => ask("body")} title={v.title.trim() || (withStory && v.kind === "hook") ? "Написать или доработать текст по заголовку, герою и божеству" : "Сначала введите заголовок"}>
              {aiBusy && ai?.target !== "boon" ? "Думаю…" : v.body.trim() ? "🪄 Доработать текст" : "🪄 Подсказать текст"}
            </button>
            <button type="button" className="btn px-3 py-1 text-sm" disabled={aiBusy || !v.title.trim()} onClick={() => ask("boon")} title="Три варианта небольшого бафа или дара">
              🪄 Варианты бафа
            </button>
          </div>
          {aiError && <p className="text-sm text-red-400">{aiError}</p>}
          {ai && (
            <div className="space-y-2 rounded-md border border-border bg-bg/60 p-2">
              <p className="text-xs uppercase tracking-wide text-muted">Подсказка для поля «{ai.target === "body" ? meta.body : meta.boon}»</p>
              <p className="whitespace-pre-wrap text-sm">{ai.text}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn btn-primary px-2.5 py-1 text-xs" onClick={() => applyAi("replace")}>
                  Заменить текст в поле
                </button>
                <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => applyAi("append")}>
                  Добавить в конец
                </button>
                <button type="button" className="btn px-2.5 py-1 text-xs" disabled={aiBusy} onClick={() => ask(ai.target)}>
                  Ещё вариант
                </button>
                <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => setAi(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          🪄 Подсказки текста выключены. Чтобы включить, вставьте ключ <code>GEMINI_API_KEY</code> в файл <code>.env</code> и выполните <code>docker compose up -d</code>.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>⏱ {meta.trigger}</span>
          <input value={v.trigger} onChange={(e) => set("trigger", e.target.value)} maxLength={STORY_LIMITS.short} className="input w-full py-1.5 text-sm" />
        </label>
        <label>
          <span className={label}>✨ {meta.boon}</span>
          <textarea value={v.boon} onChange={(e) => set("boon", e.target.value)} rows={2} maxLength={STORY_LIMITS.long} className="input w-full resize-y text-sm" />
        </label>
      </div>

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending || !v.title.trim()}>
          {pending ? "Сохраняю…" : id !== undefined ? "Сохранить" : "Добавить"}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  );
}
