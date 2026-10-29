import { getMonsterRaw } from "@/lib/catalog";
import type { RawMonster } from "@/lib/catalog/monsters";
import { getMonster } from "@/lib/open5e";
import { localize } from "@/lib/translate/view";

/** Статблок монстра для панели боя: GET /api/monsters/detail?key=…&lang=ru|en (переводы — из кэша). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const key = sp.get("key") ?? "";
  const lang = sp.get("lang") === "en" ? "en" : "ru";
  if (!key) return Response.json({ error: "no key" }, { status: 400 });

  const raw = (await getMonsterRaw(key).catch(() => undefined)) ?? ((await getMonster(key).catch(() => null)) as RawMonster | null);
  if (!raw) return Response.json({ error: "not found" }, { status: 404 });

  const loc = localize("monster", raw, lang);
  return Response.json({ key, lang, entry: loc.entry });
}
