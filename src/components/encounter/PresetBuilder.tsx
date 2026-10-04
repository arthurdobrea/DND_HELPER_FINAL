"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { savePreset } from "@/app/actions";
import { MONSTER_TYPES, label } from "@/lib/catalog/labels";
import { xpForCr } from "@/lib/encounter";

type Entry = { key: string; name: string; type: string; cr: number; crLabel: string; ac: number; hp: number; count: number };
type Hit = { key: string; name: string; type: string; typeLabel: string; cr: number; crLabel: string; hp: number; ac: number; source: string };

/**
 * Ручная сборка пресета: ищем монстров в бестиарии, добавляем кликом, задаём количество, называем и сохраняем.
 * С id редактирует существующий пресет.
 */
export function PresetBuilder({ id, initialName, initial }: { id?: number; initialName: string; initial: Entry[] }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<Entry[]>(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/monsters/search?${new URLSearchParams({ q })}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<{ items: Hit[] }>)
        .then((d) => {
          setHits(d.items);
          setLoading(false);
        })
        .catch((e) => e.name !== "AbortError" && setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const add = (h: Hit) =>
    setItems((list) =>
      list.some((x) => x.key === h.key)
        ? list.map((x) => (x.key === h.key ? { ...x, count: Math.min(30, x.count + 1) } : x))
        : [...list, { key: h.key, name: h.name, type: h.type, cr: h.cr, crLabel: h.crLabel, ac: h.ac, hp: h.hp, count: 1 }],
    );
  const setCount = (key: string, count: number) =>
    setItems((list) => (count <= 0 ? list.filter((x) => x.key !== key) : list.map((x) => (x.key === key ? { ...x, count: Math.min(30, count) } : x))));

  const total = items.reduce((n, x) => n + x.count, 0);
  const xp = items.reduce((n, x) => n + xpForCr(x.cr) * x.count, 0);

  function save() {
    setError(null);
    start(async () => {
      const saved = await savePreset({ id, name, groups: items.map((x) => ({ key: x.key, count: x.count })) });
      if (saved) router.push(`/encounters?preset=${saved}`);
      else setError("Не удалось сохранить: нужны название и хотя бы один монстр.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="font-display text-2xl text-accent">{id ? "✏️ Правка пресета" : "＋ Новый пресет"}</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Название, например «Засада в лесу»" className="input w-full" autoFocus={!id} />

        <h3 className="text-xs uppercase tracking-wide text-muted">Состав · {total} монстров · опыт без множителя {xp}</h3>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">Пока пусто — найдите монстров ниже и нажмите на них.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((x) => (
              <li key={x.key} className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-1">
                  <button type="button" className="btn h-7 w-7 !p-0" onClick={() => setCount(x.key, x.count - 1)} aria-label="Меньше">
                    −
                  </button>
                  <span className="w-8 text-center font-display text-xl text-accent">{x.count}</span>
                  <button type="button" className="btn h-7 w-7 !p-0" onClick={() => setCount(x.key, x.count + 1)} aria-label="Больше">
                    +
                  </button>
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg">{x.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {label(MONSTER_TYPES, x.type)} · CR {x.crLabel} · КД {x.ac} · хиты {x.hp}
                  </span>
                </span>
                <button type="button" className="text-muted hover:text-red-400" onClick={() => setCount(x.key, 0)} title="Убрать">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={pending || !name.trim() || items.length === 0} onClick={save}>
            {pending ? "Сохраняю…" : "💾 Сохранить пресет"}
          </button>
          <button type="button" className="btn" onClick={() => router.push(id ? `/encounters?preset=${id}` : "/encounters")}>
            Отмена
          </button>
        </div>
      </div>

      <div className="card space-y-2 p-4">
        <h3 className="text-xs uppercase tracking-wide text-muted">Бестиарий — нажмите, чтобы добавить</h3>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Поиск: bandit, wolf, skeleton…" className="input w-full py-1.5 text-sm" />
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {hits.map((h) => {
            const inList = items.find((x) => x.key === h.key);
            return (
              <li key={h.key}>
                <button type="button" onClick={() => add(h)} className="flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm hover:bg-panel-2">
                  <span className="w-12 shrink-0 text-center font-mono text-xs text-muted">CR {h.crLabel}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {h.name} <span className="text-xs text-muted">· {h.typeLabel} · КД {h.ac} · хиты {h.hp} · {h.source}</span>
                  </span>
                  <span className="text-accent">{inList ? `×${inList.count} ＋` : "＋"}</span>
                </button>
              </li>
            );
          })}
          {!loading && hits.length === 0 && <li className="p-3 text-center text-sm text-muted">Ничего не найдено</li>}
        </ul>
      </div>
    </div>
  );
}
