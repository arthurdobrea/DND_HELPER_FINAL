"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toggleShopItem, toggleShopLock, updateShopItem } from "@/app/actions";

type Props = {
  id: number;
  itemKey: string;
  name: string;
  nameClass: string;
  subtitle: string;
  href: string;
  selected: boolean;
  price: number | null;
  qty: number | null;
  locked: boolean;
};

type Vals = { price: number | null; qty: number | null };

/** Шаг цены зависит от величины: у зелья за 50 зм и у кольца за 4000 зм он разный. */
const priceStep = (p: number) => (p < 1 ? 0.1 : p < 10 ? 1 : p < 100 ? 5 : p < 1000 ? 50 : 500);
const round2 = (n: number) => Math.round(n * 100) / 100;

function Step({ onClick, children, label }: { onClick: () => void; children: string; label: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="btn h-6 w-6 !p-0 text-xs leading-none">
      {children}
    </button>
  );
}

const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? null : Math.max(0, n);
};

/** Строка товара: название, цена (зм) и остаток с кнопками −/+; сохраняется сама. */
export function ShopRow({ id, itemKey, name, nameClass, subtitle, href, selected, price: p0, qty: q0, locked }: Props) {
  const [vals, setVals] = useState<Vals>({ price: p0, qty: q0 });
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<Vals>({ price: p0, qty: q0 });
  const dirty = useRef(false);

  // Правки считаются от последнего значения (а не от отрисованного), поэтому быстрые клики не теряются.
  // На сервер уходят через полсекунды после последней правки, а при уходе со страницы — сразу.
  function change(fn: (cur: Vals) => Vals) {
    const next = fn(latest.current);
    latest.current = next;
    dirty.current = true;
    setVals(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  }
  function flush() {
    if (!dirty.current) return;
    dirty.current = false;
    const { price, qty } = latest.current;
    start(() => updateShopItem(id, price, qty));
  }
  useEffect(() => {
    return () => {
      clearTimeout(timer.current);
      if (dirty.current) updateShopItem(id, latest.current.price, latest.current.qty);
    };
  }, [id]);

  // Замок меняется сразу, не дожидаясь сервера.
  const [lock, setLock] = useState({ base: locked, value: locked });
  if (lock.base !== locked) setLock({ base: locked, value: locked });

  const { price, qty } = vals;
  const soldOut = qty === 0;

  return (
    <li className={`flex items-center gap-3 px-3 py-2 text-sm ${selected ? "bg-panel-2" : "hover:bg-panel-2/60"} ${soldOut ? "opacity-60" : ""} ${lock.value ? "border-l-2 border-accent bg-accent/5" : ""}`}>
      <button
        type="button"
        aria-pressed={lock.value}
        onClick={() => {
          setLock((l) => ({ ...l, value: !l.value }));
          start(() => toggleShopLock(id));
        }}
        title={lock.value ? "Закреплено: рандомайзер оставит эту вещь. Нажмите, чтобы открепить" : "Закрепить: при броске рандомайзера эта вещь останется"}
        className={`h-7 w-7 shrink-0 rounded-md border text-sm transition ${lock.value ? "border-accent bg-accent/20" : "border-border opacity-40 hover:opacity-100"}`}
      >
        {lock.value ? "🔒" : "🔓"}
      </button>
      <Link href={href} scroll={false} className="min-w-0 flex-1">
        <span className={`block truncate ${nameClass}`}>{name}</span>
        <span className="block truncate text-xs text-muted">
          {subtitle}
          {soldOut && <span className="ml-1 text-red-400">· нет в наличии</span>}
        </span>
      </Link>

      <div className="flex items-center gap-1" title="Цена, золотых">
        <Step
          label="Дешевле"
          onClick={() => change((c) => ({ ...c, price: Math.max(0, round2((c.price ?? 0) - priceStep(c.price ?? 0))) }))}
        >
          −
        </Step>
        <input
          inputMode="decimal"
          value={price ?? ""}
          placeholder="—"
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const v = num(e.target.value);
            change((c) => ({ ...c, price: v }));
          }}
          className="input w-16 px-1 py-0.5 text-center text-xs"
        />
        <Step label="Дороже" onClick={() => change((c) => ({ ...c, price: round2((c.price ?? 0) + priceStep(c.price ?? 0)) }))}>
          +
        </Step>
        <span className="w-5 text-xs text-muted">зм</span>
      </div>

      <div className="flex items-center gap-1" title="Количество на складе">
        {qty === null ? (
          <button type="button" className="btn h-6 px-2 py-0 text-xs" onClick={() => change((c) => ({ ...c, qty: 1 }))} title="Ограничить количество">
            ∞
          </button>
        ) : (
          <>
            <Step label="Меньше" onClick={() => change((c) => ({ ...c, qty: Math.max(0, (c.qty ?? 0) - 1) }))}>
              −
            </Step>
            <input
              inputMode="numeric"
              value={qty}
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                const v = Math.floor(num(e.target.value) ?? 0);
                change((c) => ({ ...c, qty: v }));
              }}
              className="input w-11 px-1 py-0.5 text-center text-xs"
            />
            <Step label="Больше" onClick={() => change((c) => ({ ...c, qty: (c.qty ?? 0) + 1 }))}>
              +
            </Step>
            <button type="button" className="text-xs text-muted hover:text-text" onClick={() => change((c) => ({ ...c, qty: null }))} title="Без ограничений">
              ∞
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => toggleShopItem(itemKey))}
        className="text-muted hover:text-red-400"
        title="Убрать из магазина"
      >
        ✕
      </button>
    </li>
  );
}
