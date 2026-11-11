"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { crText } from "@/lib/cr";
import { SECTION_LABEL, type ForgeDraft, type Section } from "@/lib/forge";
import { TEMPLATES, type Template } from "@/lib/forge-templates";
import { TAG_BY_ID, abilityTags, scoreTags, topTags, type Profile, type TagId } from "@/lib/suggest";
import type { AbilityHit, SpellHit } from "@/components/npc/NpcParts";

type SuggestAbility = AbilityHit & { tags: TagId[]; count: number; sameType: boolean };
type SuggestSpell = SpellHit & { tags: TagId[] };

const drag = (e: DragEvent, payload: unknown) => {
  e.dataTransfer.setData("application/x-forge", JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copyMove";
};

function TagChips({ tags }: { tags: TagId[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-full bg-bg/50 px-1.5 text-[10px] text-muted" title={TAG_BY_ID[t].label}>
          {TAG_BY_ID[t].icon} {TAG_BY_ID[t].label}
        </span>
      ))}
    </span>
  );
}

/**
 * Подсказки «что ещё добавить»: по теме существа (огонь, магия, полёт…) ищет похожие способности в бестиарии,
 * подходящие шаблоны и заклинания. compact — короткий список «похожих» для инспектора выбранного блока.
 */
export function SuggestPanel({
  d,
  profile,
  compact = false,
  replacing = false,
  onAddAbility,
  onAddTemplate,
  onAddSpell,
}: {
  d: ForgeDraft;
  profile: Profile;
  compact?: boolean;
  replacing?: boolean;
  onAddAbility: (h: AbilityHit) => void;
  onAddTemplate: (t: Template) => void;
  onAddSpell: (h: SpellHit) => void;
}) {
  const [muted, setMuted] = useState<Set<TagId>>(new Set());
  const [res, setRes] = useState<{ sig: string; abilities: SuggestAbility[]; spells: SuggestSpell[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const effective = useMemo(() => Object.fromEntries(Object.entries(profile).filter(([k]) => !muted.has(k as TagId))) as Profile, [profile, muted]);
  const names = useMemo(() => d.abilities.filter((a) => a.kind !== "spells").map((a) => a.name.replace(/\s*\(.*\)$/, "")), [d.abilities]);
  const book = useMemo(() => d.abilities.flatMap((a) => (a.kind === "spells" ? a.spells.map((s) => s.name) : [])), [d.abilities]);
  const body = useMemo(
    () => JSON.stringify({ profile: effective, type: d.type, cr: d.cr, exclude: [...names].sort(), spells: [...book].sort(), limit: compact ? 6 : 24, withSpells: !compact }),
    [effective, d.type, d.cr, names, book, compact],
  );
  const empty = Object.keys(effective).length === 0;

  useEffect(() => {
    if (empty) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/monsters/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ abilities: SuggestAbility[]; spells: SuggestSpell[] }>) : Promise.reject(new Error("fail"))))
        .then((x) => {
          setFailed(false);
          setRes({ sig: body, ...x });
        })
        .catch((e) => {
          if (!ctl.signal.aborted && e) setFailed(true);
        });
    }, 600);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [body, empty]);

  const templates = useMemo(() => {
    if (empty) return [];
    const have = new Set(names.map((n) => n.toLowerCase()));
    return TEMPLATES.map((t) => ({ t, ...scoreTags(abilityTags(t.make()), effective) }))
      .filter((x) => x.score > 0 && !have.has(x.t.make().name.toLowerCase()))
      .sort((a, b) => b.score - a.score)
      .slice(0, compact ? 3 : 6);
  }, [effective, names, empty, compact]);

  const themes = topTags(profile, 10);
  const loading = !empty && res?.sig !== body;

  if (themes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
        {compact
          ? "У этого блока не видно темы (огонь, магия, полёт…) — похожие не подобрать."
          : "Пока не видно «темы» существа. Выберите основу или добавьте пару способностей — например, с огнём или магией, — и здесь появятся похожие."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div>
          <p className="mb-1 text-xs text-muted">Тема существа (нажмите, чтобы не учитывать):</p>
          <div className="flex flex-wrap gap-1">
            {themes.map(([t, n]) => {
              const off = muted.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMuted((m) => {
                    const next = new Set(m);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  })}
                  className={`rounded-full border px-2 py-0.5 text-xs ${off ? "border-border text-muted line-through opacity-60" : "border-accent/60 bg-accent/10 text-accent"}`}
                >
                  {TAG_BY_ID[t].icon} {TAG_BY_ID[t].label} ×{n}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-muted">Готовые блоки в тему</h4>
          <div className="flex flex-wrap gap-1.5">
            {templates.map(({ t }) => (
              <button
                key={t.id}
                type="button"
                draggable
                onDragStart={(e) => drag(e, { t: "tpl", id: t.id })}
                onClick={() => onAddTemplate(t)}
                title={t.hint}
                className="cursor-grab rounded-lg border border-border bg-panel-2/50 px-2 py-1 text-xs hover:border-accent"
              >
                {t.icon} {t.title} <span className="text-accent">{replacing ? "⇄" : "＋"}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          {compact ? "Похожие способности из бестиария" : "Способности из бестиария"}
          {loading && <span className="normal-case tracking-normal">подбираю…</span>}
        </h4>
        {failed && <p className="text-xs text-red-400">Не удалось получить подсказки.</p>}
        <ul className={`divide-y divide-border overflow-y-auto rounded-lg border border-border ${compact ? "max-h-72" : "max-h-[50vh]"}`}>
          {(res?.abilities ?? []).map((h, i) => (
            <li key={`${h.monsterKey}|${h.name}|${i}`} draggable onDragStart={(e) => drag(e, { t: "donor", hit: h })} className="cursor-grab px-2.5 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{h.name}</span>
                <span className="tag shrink-0 text-[10px]">{SECTION_LABEL[h.section as Section]}</span>
                <button type="button" className="btn px-2 py-0.5 text-xs" onClick={() => onAddAbility(h)}>
                  {replacing ? "⇄" : "＋"}
                </button>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span>
                  {h.monster} · CR {crText(h.cr)}
                  {h.count > 1 ? ` · ещё у ${h.count - 1}` : ""}
                  {h.sameType ? " · тот же тип" : ""}
                </span>
                <TagChips tags={h.tags} />
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer truncate text-muted">{h.desc.replace(/\\n/g, " ").slice(0, 100)}…</summary>
                <p className="mt-1 whitespace-pre-line">{h.desc.replace(/\\n/g, "\n")}</p>
              </details>
            </li>
          ))}
          {res && res.sig === body && res.abilities.length === 0 && <li className="p-3 text-center text-xs text-muted">Ничего похожего не нашлось</li>}
        </ul>
      </div>

      {!compact && (res?.spells.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-1 text-xs uppercase tracking-wide text-muted">Заклинания в тему (по силе существа)</h4>
          <div className="flex flex-wrap gap-1.5">
            {res!.spells.map((s) => (
              <button
                key={s.key}
                type="button"
                draggable
                onDragStart={(e) => drag(e, { t: "spell", hit: s })}
                onClick={() => onAddSpell(s)}
                className="cursor-grab rounded-full border border-violet-400/40 bg-violet-500/10 px-2.5 py-0.5 text-xs hover:border-accent"
                title={s.tags.map((t) => TAG_BY_ID[t].label).join(", ")}
              >
                <span className="text-muted">{s.level === 0 ? "з" : s.level}</span> {s.name} <span className="text-accent">＋</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
