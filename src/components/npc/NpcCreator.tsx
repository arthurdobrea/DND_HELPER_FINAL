"use client";

import { useEffect, useState, useTransition } from "react";
import { createNpc } from "@/app/actions";
import { MONSTER_TYPES } from "@/lib/catalog/labels";

type Hit = { key: string; name: string; type: string; typeLabel: string; cr: number; crLabel: string; hp: number; ac: number; source: string };

/**
 * Создание NPC: слева имя, предыстория и мотивация, справа поиск по бестиарию.
 * Выбранное существо становится основой листа (характеристики, КД, хиты, атаки, особенности).
 */
export function NpcCreator() {
  const [name, setName] = useState("");
  const [backstory, setBackstory] = useState("");
  const [motivation, setMotivation] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [crMin, setCrMin] = useState("");
  const [crMax, setCrMax] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<Hit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Поиск с небольшой задержкой, чтобы не слать запрос на каждую букву.
  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ q, type, crMin, crMax });
      fetch(`/api/monsters/search?${params}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<{ total: number; items: Hit[] }>)
        .then((d) => {
          setHits(d.items);
          setTotal(d.total);
          setLoading(false);
        })
        .catch((e) => e.name !== "AbortError" && setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [q, type, crMin, crMax]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setError(null);
    start(async () => {
      try {
        await createNpc({ name, backstory, motivation, monsterKey: chosen.key });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось создать NPC");
      }
    });
  }

  const label = "mb-1 block text-xs uppercase tracking-wide text-muted";

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ---------- Что знает мастер ---------- */}
      <section className="card space-y-3 p-4">
        <h2 className="font-display text-lg text-accent">1. Кто это</h2>
        <label className="block">
          <span className={label}>Имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={chosen ? `Например: ${chosen.name}` : "Например: Старый Грегор"} className="input w-full" autoFocus />
        </label>
        <label className="block">
          <span className={label}>Предыстория</span>
          <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} rows={6} className="input w-full resize-y text-sm" placeholder="Откуда он, чем занимался, что с ним случилось" />
        </label>
        <label className="block">
          <span className={label}>Мотивация</span>
          <textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} rows={4} className="input w-full resize-y text-sm" placeholder="Чего он хочет, чего боится, что готов ради этого сделать" />
        </label>

        <div className="rounded-lg border border-border bg-bg/40 p-3 text-sm">
          <p className={label}>Основа из бестиария</p>
          {chosen ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <b className="font-display text-lg">{chosen.name}</b>
              <span className="text-muted">
                {chosen.typeLabel} · CR {chosen.crLabel} · КД {chosen.ac} · хиты {chosen.hp}
              </span>
              <a href={`/monsters?open=${encodeURIComponent(chosen.key)}`} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                статблок ↗
              </a>
            </div>
          ) : (
            <p className="text-muted">Выберите существо в списке справа →</p>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="btn btn-primary w-full py-2.5 text-base" disabled={!chosen || pending}>
          {pending ? "Собираю лист… (перевод статблока может занять до минуты)" : "🎭 Создать NPC"}
        </button>
        <p className="text-xs text-muted">
          Лист собирается из статблока: характеристики, КД, хиты, спасброски, навыки, атаки, особенности и действия. Потом всё можно править как в обычном листе.
        </p>
      </section>

      {/* ---------- Поиск по бестиарию ---------- */}
      <section className="card flex min-h-0 flex-col gap-3 p-4">
        <h2 className="font-display text-lg text-accent">2. Выберите существо</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="🔎 Поиск по названию: bandit, priest, wolf…" className="input w-full" />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={type} onChange={(e) => setType(e.target.value)} className="input py-1" aria-label="Тип существа">
            <option value="">Любой тип</option>
            {Object.entries(MONSTER_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <span className="text-muted">CR от</span>
          <input value={crMin} onChange={(e) => setCrMin(e.target.value)} inputMode="decimal" className="input w-16 py-1 text-center" placeholder="0" aria-label="CR от" />
          <span className="text-muted">до</span>
          <input value={crMax} onChange={(e) => setCrMax(e.target.value)} inputMode="decimal" className="input w-16 py-1 text-center" placeholder="30" aria-label="CR до" />
          <span className="ml-auto text-xs text-muted">{loading ? "ищу…" : `найдено ${total}${total > hits.length ? `, показаны первые ${hits.length}` : ""}`}</span>
        </div>

        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {hits.map((h) => {
            const on = chosen?.key === h.key;
            return (
              <li key={h.key}>
                <button
                  type="button"
                  onClick={() => setChosen(h)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition ${on ? "bg-accent/15 text-accent" : "hover:bg-panel-2"}`}
                >
                  <span className="w-12 shrink-0 text-center font-mono text-xs text-muted">CR {h.crLabel}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {h.typeLabel} · КД {h.ac} · хиты {h.hp} · {h.source}
                    </span>
                  </span>
                  {on && <span>✓</span>}
                </button>
              </li>
            );
          })}
          {!loading && hits.length === 0 && <li className="p-4 text-center text-sm text-muted">Ничего не найдено — измените запрос или фильтры</li>}
        </ul>
      </section>
    </form>
  );
}
