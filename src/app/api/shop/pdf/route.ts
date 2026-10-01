import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentWorld } from "@/lib/world";
import type { Item } from "@/lib/catalog";
import { DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES, label } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/catalog/items";
import { buildShopPdf, type ShopPdfItem } from "@/lib/shop-pdf";

/** PDF-прайс магазина текущего мира: список «название — цена — описание». Вещи «нет в наличии» не попадают. */
export async function GET() {
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

  const items: ShopPdfItem[] = rows.map((r) => {
    const item = JSON.parse(r.data) as Item;
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
      name: r.name,
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
    },
  });
}
