"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { aiSaveNew, aiUpdate } from "@/app/ai-forge-actions";
import type { AiEntity } from "@/lib/ai-forge";
import { rid } from "@/lib/forge";
import type { Template, TextBlock } from "@/lib/ai-blocks";

/** Блоки описания: название (необязательно) и текст; порядок меняется стрелками. */
export function BlockList({ blocks, onChange, selected, onSelect }: { blocks: TextBlock[]; onChange: (b: TextBlock[]) => void; selected?: string | null; onSelect?: (id: string) => void }) {
  const set = (id: string, p: Partial<TextBlock>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {blocks.length === 0 && <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted">Добавьте блоки слева — или пустой блок кнопкой ниже.</p>}
      {blocks.map((b, i) => (
        <div
          key={b.id}
          onClick={() => onSelect?.(b.id)}
          className={`rounded-md border bg-panel p-2 ${selected === b.id ? "border-accent" : "border-border"}`}
          style={{ borderLeft: "4px solid var(--color-accent, #d4a95a)" }}
        >
          <div className="mb-1 flex items-center gap-1">
            <input value={b.title} onChange={(e) => set(b.id, { title: e.target.value })} placeholder="Название блока (необязательно)" className="input min-w-0 flex-1 py-1 text-sm font-semibold" />
            <button type="button" className="px-1 text-muted hover:text-text disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="Выше">
              ↑
            </button>
            <button type="button" className="px-1 text-muted hover:text-text disabled:opacity-30" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} title="Ниже">
              ↓
            </button>
            <button type="button" className="px-1 text-muted hover:text-text" onClick={() => onChange([...blocks.slice(0, i + 1), { ...b, id: rid() }, ...blocks.slice(i + 1)])} title="Дублировать">
              ⧉
            </button>
            <button type="button" className="px-1 text-muted hover:text-red-400" onClick={() => onChange(blocks.filter((x) => x.id !== b.id))} title="Удалить блок">
              ✕
            </button>
          </div>
          <textarea
            value={b.text}
            onChange={(e) => set(b.id, { text: e.target.value })}
            rows={Math.min(12, Math.max(2, Math.ceil(b.text.length / 85)))}
            className="input w-full resize-y text-sm leading-relaxed"
          />
        </div>
      ))}
      <button type="button" className="btn w-full text-sm" onClick={() => onChange([...blocks, { id: rid(), title: "", text: "" }])}>
        ＋ Пустой блок
      </button>
    </div>
  );
}

/** Палитра шаблонов: клик добавляет блок. */
export function TemplatePalette({ templates, onAdd, title }: { templates: Template[]; onAdd: (t: Template) => void; title: string }) {
  return (
    <div className="space-y-1">
      <div className="mb-1 text-xs uppercase tracking-wide text-muted">{title}</div>
      {templates.map((t) => (
        <button key={t.id} type="button" onClick={() => onAdd(t)} className="block w-full rounded-md border border-border bg-panel px-2 py-1.5 text-left text-sm hover:border-accent" title="Добавить блок">
          <span className="mr-1">{t.icon}</span>
          {t.title || t.hint}
          {t.title && <span className="block text-[11px] text-muted">{t.hint}</span>}
        </button>
      ))}
    </div>
  );
}

/** Сохранение в Кузницу: поверх записи (id) или новой записью. */
export function SaveBar({ id, entity }: { id?: number; entity: AiEntity }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(asNew: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      if (id && !asNew) {
        const r = await aiUpdate(id, entity);
        setMsg(r.ok ? { ok: true, text: "Сохранено" } : { ok: false, text: r.error });
      } else {
        const r = await aiSaveNew(entity);
        if (!r.ok) setMsg({ ok: false, text: r.error });
        else {
          setMsg({ ok: true, text: asNew ? "Сохранено копией" : "Сохранено" });
          router.replace(`/ai-forge/build/${r.item.id}`);
        }
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Не удалось сохранить" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-primary w-full py-2.5 text-base" disabled={busy} onClick={() => void save(false)}>
        {busy ? "Сохраняю…" : "💾 Сохранить в Кузницу"}
      </button>
      {id && (
        <button type="button" className="btn w-full text-sm" disabled={busy} onClick={() => void save(true)}>
          ⧉ Сохранить как копию
        </button>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-red-400"}`}>{msg.text}</p>}
      <Link href={id ? `/ai-forge?open=${id}` : "/ai-forge"} className="block text-center text-xs text-muted hover:text-accent">
        ← в Кузницу
      </Link>
    </div>
  );
}
