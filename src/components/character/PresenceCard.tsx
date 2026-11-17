"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PLAYER_THEMES, TEXTURE_DIR } from "@/lib/player-themes";
import { ONLINE_MS } from "@/lib/presence";
import { ThemeFx } from "@/components/character/ThemeFx";

/** Тема игрока: его цвета и фон из приложения DnD Tracker (текстуры отдаёт /player). Неизвестная тема — оформление мастера. */
function themeStyle(name: string | null): CSSProperties {
  const t = name ? PLAYER_THEMES[name] : undefined;
  if (!t) return {};
  return {
    "--bg": `#${t.bg}`, "--panel": `#${t.panel}`, "--panel-2": `#${t.panel2}`, "--border": `#${t.border}`,
    "--text": `#${t.text}`, "--muted": `#${t.muted}`, "--accent": `#${t.accent}`,
    "--tile-img": t.tile ? `url(${TEXTURE_DIR}${t.tile})` : "none",
    color: `#${t.text}`,
    // Текстура под полупрозрачным цветом карточки, чтобы текст читался.
    backgroundImage: t.tex ? `linear-gradient(#${t.panel}b3,#${t.panel}b3), url(${TEXTURE_DIR}${t.tex})` : undefined,
  } as CSSProperties;
}

const OFFLINE: CSSProperties = { borderColor: "#E5484D", boxShadow: "inset 0 0 0 9999px rgba(229,72,77,.12)" };

/**
 * Карточка героя: бабл «онлайн» (зелёный) / «офлайн» (красный), тема игрока. Офлайн — карточка свёрнута до шапки.
 * Раз в 4 с спрашивает сервер, на связи ли игрок и какая у него тема.
 */
export function PresenceCard({ id, ageMs, theme, head, foot, children }: { id: number; ageMs: number | null; theme: string | null; head: ReactNode; foot?: ReactNode; children: ReactNode }) {
  const [st, setSt] = useState({ ageMs, theme });
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const load = () =>
      fetch("/api/sync/presence", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => j?.[id] && setSt(j[id]))
        .catch(() => {});
    const t = setInterval(load, 4000);
    // WebSocket сервера (порт 3001, cookie входа уходит сама): правка героя — сразу обновить карточку, не ждать опроса.
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(`ws://${location.hostname}:${process.env.NEXT_PUBLIC_WS_PORT ?? 3001}/`);
      ws.onmessage = (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type !== "changed" || m.hero !== id) return;
        clearTimeout(wait); // пачка правок подряд — одно обновление
        wait = setTimeout(() => { load(); router.refresh(); }, 250);
      };
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; clearInterval(t); clearTimeout(retry); clearTimeout(wait); ws?.close(); };
  }, [id, router]);
  const online = st.ageMs !== null && st.ageMs < ONLINE_MS;
  const since = st.ageMs === null ? "ещё не подключался" : st.ageMs < 60_000 ? "офлайн" : `офлайн ${Math.round(st.ageMs / 60_000)} мин`;
  return (
    <div className="card relative p-3" style={{ ...themeStyle(st.theme), ...(online ? {} : OFFLINE) }}>
      <span
        title={online ? "онлайн" : since}
        className="absolute -left-1.5 -top-1.5 h-3.5 w-3.5 rounded-full ring-2 ring-bg"
        style={{ background: online ? "#3DBB6A" : "#E5484D", boxShadow: `0 0 6px ${online ? "#3DBB6A" : "#E5484D"}` }}
      />
      {/* Движение темы (частицы, мигающие звёзды) поверх карточки */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <ThemeFx decor={st.theme ? PLAYER_THEMES[st.theme]?.decor ?? null : null} seed={id} />
      </div>
      {head}
      {online ? (
        children
      ) : (
        <>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs" style={{ color: "#E5484D" }}>
            {since} · {open ? "свернуть" : "показать последние данные"}
          </button>
          {open && children}
        </>
      )}
      {foot}
    </div>
  );
}
