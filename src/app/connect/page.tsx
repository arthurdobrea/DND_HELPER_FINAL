import { headers } from "next/headers";
import { connection } from "next/server";
import QRCode from "qrcode";
import type { Metadata } from "next";
import { getAccessKey } from "@/lib/auth";
import { pageMeta } from "@/lib/meta";

export const metadata: Metadata = pageMeta("Подключение игроков", "📱");

const isLocal = (host: string) => /^(localhost|127\.|\[::1\])/.test(host);

/** QR со ссылкой на веб-версию приложения игрока: навёл камеру — открылось и подключилось. */
export default async function ConnectPage({ searchParams }: PageProps<"/connect">) {
  await connection();
  const { ip } = await searchParams;
  const host = (await headers()).get("host") ?? "localhost:3000";
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host);
  const name = m?.[1] ?? "localhost";
  const port = m?.[2] ?? "3000";
  // ?ip= попадает в QR вместе с ключом доступа: пускаем только адрес сети (буквы, цифры, точки), не любой сайт из чужой ссылки.
  const typed = typeof ip === "string" && /^[\w.-]{1,64}$/.test(ip.trim()) ? ip.trim() : "";
  // IP компа в сети: из LAN_IP (его ставит start.ps1), из ?ip=, иначе из адреса, по которому открыта страница.
  const lan = process.env.LAN_IP?.trim() || typed || (isLocal(name) ? "" : name);
  const key = getAccessKey();
  const url = lan ? `http://${lan}:${port}/player${key ? `?key=${encodeURIComponent(key)}` : ""}` : "";
  const svg = url ? await QRCode.toString(url, { type: "svg", margin: 2 }) : "";

  return (
    <div className="mx-auto w-full max-w-md p-4 pt-10 text-center">
      <h1 className="font-display text-3xl text-accent">📱 Подключение игроков</h1>
      {svg ? (
        <>
          <p className="mt-2 text-muted">Навести камеру телефона или планшета. Откроется приложение игрока и подключится само.</p>
          <div className="mx-auto mt-6 w-64 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-4 break-all text-sm text-muted">{url}</p>
          <p className="mt-4 text-xs text-muted">В ссылке лежит ключ доступа: показывай QR только своим.</p>
        </>
      ) : (
        <form className="mt-6 space-y-3">
          <p className="text-muted">Страница открыта как localhost, а с телефона так не достучаться. Впиши IP этого компа в сети (команда <code>ipconfig</code>, строка IPv4).</p>
          <input name="ip" placeholder="192.168.1.20" className="w-full rounded-md border border-border bg-panel px-3 py-2" />
          <button className="rounded-md border border-accent px-4 py-2 text-accent">Показать QR</button>
        </form>
      )}
    </div>
  );
}
