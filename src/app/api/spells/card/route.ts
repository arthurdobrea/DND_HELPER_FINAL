import { getSpells } from "@/lib/catalog";
import { ensureTranslated } from "@/lib/translate/store";
import { localize, parseLang } from "@/lib/translate/view";
import { getCurrentWorld, findEntry } from "@/lib/world";

// Первый показ заклинания переводится «на лету»; дольше этого не ждём — отдаём то, что успело.
const TRANSLATE_WAIT_MS = 30_000;

/** Карточка заклинания для всплывающего окна над PDF: GET /api/spells/card?key=…&lang=ru|en */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? "";
  const lang = parseLang(url.searchParams.get("lang") ?? undefined);
  const spell = (await getSpells().catch(() => [])).find((s) => s.key === key);
  if (!spell) return Response.json({ error: "not found" }, { status: 404 });

  let loc = localize("spell", spell, lang);
  if (lang === "ru" && loc.enabled && loc.missing.length) {
    await Promise.race([
      ensureTranslated(loc.missing).catch(() => undefined),
      new Promise((r) => setTimeout(r, TRANSLATE_WAIT_MS)),
    ]);
    loc = localize("spell", spell, lang);
  }
  const world = await getCurrentWorld();
  return Response.json({
    spell: loc.entry,
    untranslated: loc.missing.length > 0,
    bookmarked: !!world && !!findEntry(world.id, "spell", key),
  });
}
