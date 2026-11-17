"use client";

import { useEffect, useState, useTransition } from "react";
import { findCatalogItems, findCatalogMonsters, giveCreature, giveItem } from "@/app/actions";
import type { HeroPick } from "@/lib/heroes";

/** «🎁 Дать вещь» на карточке героя: вещь из каталога мастера или своя. Приложение игрока положит её в рюкзак. */
export function GiveToHero({ heroId, heroName }: { heroId: number; heroName: string }) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ key: string; name: string; rarity: string | null }[]>([]);
  const [pick, setPick] = useState<{ key: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [weight, setWeight] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (own) return;
    let stale = false;
    const t = setTimeout(() => findCatalogItems(q).then((r) => { if (!stale) setFound(r); }), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, own]);

  if (!open) return <button className="btn btn-primary w-full" onClick={() => setOpen(true)}>🎁 Дать вещь</button>;

  const what = own ? name.trim() : pick?.name;
  const give = () =>
    start(async () => {
      const err = await giveItem(heroId, own ? { name, desc, qty: Number(qty), weight: Number(weight), price: Number(price) } : { key: pick?.key, qty: Number(qty) });
      setMsg(err ?? `Отдано: ${what}${Number(qty) > 1 ? ` ×${qty}` : ""}. Появится у игрока при следующей связи.`);
      if (!err) { setPick(null); setName(""); setDesc(""); setWeight(""); setPrice(""); setQty("1"); }
    });

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex gap-1">
        <button className={`btn flex-1 text-xs ${own ? "" : "btn-primary"}`} onClick={() => setOwn(false)}>Из каталога</button>
        <button className={`btn flex-1 text-xs ${own ? "btn-primary" : ""}`} onClick={() => setOwn(true)}>Своя вещь</button>
        <button className="btn text-xs" onClick={() => setOpen(false)} title="Закрыть">✕</button>
      </div>
      {own ? (
        <>
          <input className="input w-full" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input w-full" rows={2} placeholder="Описание" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input className="input w-full" type="number" min={0} step={0.1} placeholder="Вес, фнт" value={weight} onChange={(e) => setWeight(e.target.value)} />
          <input className="input w-full" type="number" min={0} step={0.01} placeholder="Цена, зм" value={price} onChange={(e) => setPrice(e.target.value)} />
        </>
      ) : (
        <>
          <input className="input w-full" type="search" placeholder="🔍 зелье, меч…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {found.map((i) => (
              <button
                key={i.key}
                className={`block w-full truncate rounded border px-2 py-1 text-left text-sm ${pick?.key === i.key ? "border-accent text-accent" : "border-border"}`}
                onClick={() => setPick(i)}
              >
                {i.name}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-sm text-muted">
        Количество
        <input className="input w-20" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
      </label>
      <button className="btn btn-primary w-full" disabled={pending || !what} onClick={give}>
        {pending ? "…" : `Дать ${heroName}`}
      </button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}

/** «🎁 Дать герою ▾» у вещи каталога или добычи: выбрать героя из приложения. onGiven — вещь ушла этому герою. */
export function GiveItemMenu({ itemKey, heroes, onGiven, label = "🎁 Дать герою" }: {
  itemKey: string; heroes: HeroPick[]; onGiven?: (hero: HeroPick) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (heroes.length === 0) return null;
  const give = (h: HeroPick) =>
    start(async () => {
      const err = await giveItem(h.id, { key: itemKey, qty: 1 });
      setMsg(err ?? `Отдано: ${h.name}`);
      if (!err) { setOpen(false); onGiven?.(h); }
    });
  return (
    <span className="relative inline-block">
      <button className="btn btn-primary text-xs" disabled={pending} onClick={() => setOpen(!open)}>{pending ? "…" : `${label} ▾`}</button>
      {open && (
        <span className="absolute right-0 z-30 mt-1 block w-56 space-y-1 rounded-md border border-border bg-panel p-1 shadow-lg">
          {heroes.map((h) => (
            <button key={h.id} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-panel-2" onClick={() => give(h)}>
              {h.online ? "🟢" : "🔴"} {h.name}
              {!h.online && <span className="block text-xs text-muted">не в сети — получит при подключении</span>}
            </button>
          ))}
        </span>
      )}
      {msg && !open && <span className="ml-2 text-xs text-muted">{msg}</span>}
    </span>
  );
}

/** «🐾 Дать зверя» на карточке героя: монстр из каталога уходит в «Мои существа» игрока, с атаками и мультиатакой. */
export function GiveCreature({ heroId, heroName }: { heroId: number; heroName: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ key: string; name: string; cr: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    let stale = false;
    const t = setTimeout(() => findCatalogMonsters(q).then((r) => { if (!stale) setFound(r); }), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, open]);

  if (!open) return <button className="btn w-full" onClick={() => setOpen(true)}>🐾 Дать зверя</button>;

  const give = (m: { key: string; name: string }) =>
    start(async () => {
      const err = await giveCreature(heroId, m.key);
      setMsg(err ?? `Отдано: ${m.name}. Появится у ${heroName} в «Мои существа» при следующей связи.`);
    });

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <div className="flex gap-1">
        <input className="input w-full" type="search" placeholder="🔍 лев, волк…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn text-xs" onClick={() => setOpen(false)} title="Закрыть">✕</button>
      </div>
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {found.map((m) => (
          <button key={m.key} className="block w-full truncate rounded border border-border px-2 py-1 text-left text-sm" disabled={pending} onClick={() => give(m)}>
            {m.name} <span className="text-muted">ПО {m.cr}</span>
          </button>
        ))}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
