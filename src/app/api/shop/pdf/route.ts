import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentWorld } from "@/lib/world";
import type { Item } from "@/lib/catalog";
import { DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES, label } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/catalog/items";
import { buildShopPdf, type ShopPdfItem } from "@/lib/shop-pdf";
import { translationEnabled } from "@/lib/translate/engine";
import { collectTexts } from "@/lib/translate/segments";
import { ensureTranslated } from "@/lib/translate/store";
import { localizeMany, parseLang } from "@/lib/translate/view";

/** PDF-прайс магазина текущего мира: список «название — цена — описание». Вещи «нет в наличии» не попадают. */
export async function GET(request: Request) {
  const world = await getCurrentWorld();
  if (!world) return Response.json({ error: "Сначала выберите мир" }, { status: 400 });

  const rows = getDb()
    .select()
    .from(schema.shopItems)
    .where(eq(schema.shopItems.worldId, world.id))
    .orderBy(asc(schema.shopItems.name))
    .all()
    .filter((r) => r.qty !== 0);
  if (rows.length === 0) return Response.json({ error: "В магазине нет вещей в наличии" }, { status: 400 });

  // Язык PDF: по умолчанию русский. Недостающий перевод дозаказываем здесь же — к моменту сборки он уже в кэше.
  const lang = parseLang(new URL(request.url).searchParams.get("lang") ?? undefined);
  const sources = rows.map((r) => JSON.parse(r.data) as Item);
  let translationNote: string | null = null;
  if (lang === "ru" && translationEnabled()) {
    try {
      await ensureTranslated(sources.flatMap((i) => collectTexts("item", i)));
    } catch (e) {
      // Часть текстов не перевелась — отдаём PDF с тем, что есть (остальное на английском).
      translationNote = e instanceof Error ? e.message : "ошибка перевода";
      console.error("[shop-pdf] перевод не завершён:", translationNote);
    }
  }
  const localized = localizeMany("item", sources, lang).entries;

  const items: ShopPdfItem[] = rows.map((r, idx) => {
    const item = localized[idx];
    const meta = [
      item.rarity && label(RARITIES, item.rarity),
      item.attunement && "требует настройки",
      r.qty !== null && `в наличии: ${r.qty}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const stats = [
      item.weapon && `Урон: ${item.weapon.damage} ${label(DAMAGE_TYPES, item.weapon.damageType).toLowerCase()}`,
      item.weapon?.properties.length && `Свойства: ${item.weapon.properties.map((p) => (p.detail ? `${p.name} (${p.detail})` : p.name)).join(", ")}`,
      item.armor && `КД: ${item.armor.ac}`,
      item.weight !== null && `Вес: ${item.weight} фнт.`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      name: item.name,
      category: label(ITEM_CATEGORIES, item.category),
      meta,
      stats,
      price: r.price,
      priceText: r.price === null ? "цена не указана" : formatPrice(r.price),
      desc: item.desc || "Описания нет.",
    };
  });
  items.sort((a, b) => a.category.localeCompare(b.category, "ru") || a.name.localeCompare(b.name));

  const bytes = await buildShopPdf({ worldName: world.name, items, date: new Date() });

  const fileName = `Магазин - ${world.name}`.replace(/[\\/:*?"<>|]+/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="shop.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}.pdf`,
      "Cache-Control": "no-store",
      ...(translationNote ? { "X-Translation-Warning": "incomplete" } : {}),
    },
  });
}
