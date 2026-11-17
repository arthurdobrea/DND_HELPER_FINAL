"use client";

import { useEffect, useState } from "react";

type Pop = { id: number; name: string; text: string; x: number };
const SHOW_MS = 3000;

/** Реакции игроков: плашка всплывает снизу по центру (случайно ±30% ширины, чтобы стопка не слипалась) и пропадает. */
export function ReactionFloat() {
  const [pops, setPops] = useState<Pop[]>([]);
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;
    let n = 0;
    const connect = () => {
      ws = new WebSocket(`ws://${location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT ?? 3001}/`);
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type !== "reaction") return;
        const pop = { id: n++, name: String(m.name), text: String(m.text), x: Math.round(Math.random() * 60 - 30) };
        setPops((p) => [...p, pop]);
        setTimeout(() => setPops((p) => p.filter((q) => q.id !== pop.id)), SHOW_MS);
      };
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 h-0">
      {pops.map((p) => (
        <div
          key={p.id}
          className="reaction-pop absolute bottom-6 flex items-center gap-2 rounded-2xl border border-border bg-panel/90 px-3 py-2"
          style={{ left: `${50 + p.x}%`, animationDuration: `${SHOW_MS}ms` }}
        >
          <span className={p.text.length <= 4 ? "text-5xl leading-none" : "font-semibold"}>{p.text}</span>
          <small className="text-muted">{p.name}</small>
        </div>
      ))}
    </div>
  );
}
