import Link from "next/link";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireWorld } from "@/lib/world";
import { getItems, type Item } from "@/lib/catalog";
import { ITEM_CATEGORIES, RARITIES, RARITY_COLORS, label } from "@/lib/catalog/labels";
import { filterItems, formatPrice, parseItemFilter } from "@/lib/catalog/items";
import { hrefWith } from "@/lib/url";
import { addShopItems, clearShop, toggleShopItem } from "@/app/actions";
import { AutoForm } from "@/components/filters/AutoForm";
import { Check, Field, Select, toOptions } from "@/components/filters/fields";
import { ItemCard } from "@/components/ItemCard";
import { ShopRow } from "@/components/shop/ShopRow";
import { AddAllButton, ClearShopButton, ShopDetailButton, ShopToggle } from "@/components/shop/ShopButtons";

const PAGE = 60;
const BULK_MAX = 100;

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const adding = sp.add === "1";
  const openKey = typeof sp.open === "string" ? sp.open : "";
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);

  const rows = getDb()
    .select()
    .from(schema.shopItems)
    .where(eq(schema.shopItems.worldId, world.id))
    .orderBy(asc(schema.shopItems.name))
    .all();
  const inShop = new Map(rows.map((r) => [r.itemKey, r]));

  // Каталог нужен только для выбора вещей и свежей карточки; без него магазин работает по сохранённым копиям.
  let catalog: Item[] = [];
  let catalogError: string | null = null;
  try {
    catalog = await getItems();
  } catch (e) {
    catalogError = e instanceof Error ? e.message : String(e);
  }
  const byKey = new Map(catalog.map((i) => [i.key, i]));
  const snapshot = (r: (typeof rows)[number]) => byKey.get(r.itemKey) ?? (JSON.parse(r.data) as Item);

  const shelf = rows.map((r) => ({ row: r, item: snapshot(r) }));
  shelf.sort(
    (a, b) =>
      label(ITEM_CATEGORIES, a.item.category).localeCompare(label(ITEM_CATEGORIES, b.item.category), "ru") ||
      a.item.name.localeCompare(b.item.name),
  );
  const groups = Map.groupBy(shelf, (s) => s.item.category);

  const totalValue = rows.reduce((sum, r) => sum + (r.price ?? 0) * (r.qty ?? 0), 0);
  const hasUnlimited = rows.some((r) => r.qty === null);
  const inStockCount = rows.filter((r) => r.qty !== 0).length;

  // ---------- Подбор вещей из каталога ----------
  const f = parseItemFilter(sp);
  const found = adding ? filterItems(catalog, f) : [];
  const categories = [...new Set(catalog.map((i) => i.category))].sort((a, b) =>
    label(ITEM_CATEGORIES, a).localeCompare(label(ITEM_CATEGORIES, b), "ru"),
  );

  const openItem = openKey ? (byKey.get(openKey) ?? (inShop.get(openKey) ? snapshot(inShop.get(openKey)!) : null)) : null;

  const picker = adding && (
    <section className="border-border bg-panel p-3 lg:overflow-y-auto lg:border-r">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg text-accent">Каталог вещей</h2>
        <Link href={hrefWith("/shop", sp, { add: null, q: null, kind: null, category: null, rarity: null, priceMin: null, priceMax: null, limit: null })} className="text-xs text-muted hover:text-accent">
          закрыть ✕
        </Link>
      </div>
      {catalogError ? (
        <p className="text-sm text-red-400">Не удалось загрузить каталог: {catalogError}</p>
      ) : (
        <>
          <AutoForm action="/shop">
            <input type="hidden" name="add" value="1" />
            {openKey && <input type="hidden" name="open" value={openKey} />}
            <Field label="Поиск">
              <input name="q" type="search" defaultValue={f.q} placeholder="potion, sword, ring…" className="input w-full py-1.5 text-sm" autoFocus />
            </Field>
            <Check name="inDesc" checked={f.inDesc} label="искать и в описании" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Тип">
                <Select
                  name="kind"
                  value={f.kind}
                  empty="Все"
                  options={[
                    { value: "mundane", label: "Обычные" },
                    { value: "magic", label: "Магические" },
                  ]}
                />
              </Field>
              <Field label="Редкость">
                <Select name="rarity" value={f.rarity} options={toOptions(RARITIES)} />
              </Field>
            </div>
            <Field label="Категория">
              <Select name="category" value={f.category} options={toOptions(ITEM_CATEGORIES, categories)} />
            </Field>
            <Field label="Цена, зм">
              <div className="grid grid-cols-2 gap-2">
                <input name="priceMin" type="number" min={0} defaultValue={f.priceMin ?? ""} placeholder="от" className="input w-full py-1.5 text-sm" />
                <input name="priceMax" type="number" min={0} defaultValue={f.priceMax ?? ""} placeholder="до" className="input w-full py-1.5 text-sm" />
              </div>
            </Field>
          </AutoForm>

          <p className="mt-3 text-xs text-muted">
            Найдено: {found.length}. Подробные фильтры — на вкладке «Предметы».
          </p>
          {found.length > 0 && found.length <= BULK_MAX && (
            <div className="mt-2">
              <AddAllButton count={found.length} add={addShopItems.bind(null, found.map((i) => i.key))} />
            </div>
          )}

          <ul className="card mt-2 divide-y divide-border overflow-hidden">
            {found.slice(0, limit).map((i) => (
              <li key={i.key} className={`flex items-center gap-2 px-2 py-1.5 text-sm ${i.key === openKey ? "bg-panel-2" : ""}`}>
                <ShopToggle inShop={inShop.has(i.key)} toggle={toggleShopItem.bind(null, i.key)} />
                <Link href={hrefWith("/shop", sp, { open: i.key })} scroll={false} className="min-w-0 flex-1">
                  <span className={`block truncate ${i.rarity ? RARITY_COLORS[i.rarity] : ""}`}>{i.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {label(ITEM_CATEGORIES, i.category)}
                    {i.rarity && ` · ${label(RARITIES, i.rarity)}`}
                  </span>
                </Link>
                <span className="shrink-0 text-xs text-muted">{i.price !== null && `${i.priceEstimated ? "≈" : ""}${formatPrice(i.price)}`}</span>
              </li>
            ))}
          </ul>
          {found.length > limit && (
            <Link href={hrefWith("/shop", sp, { limit: String(limit + PAGE) })} scroll={false} className="btn mt-2 w-full">
              Показать ещё ({found.length - limit})
            </Link>
          )}
        </>
      )}
    </section>
  );

  const shelfView = (
    <section className="p-3 lg:overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-2xl text-accent">🏺 Магазин артефактов</h1>
          <p className="text-xs text-muted">
            Мир «{world.name}» · позиций: {rows.length}
            {rows.length > 0 && (
              <>
                {" "}
                · на складе ≈ {formatPrice(totalValue)}
                {hasUnlimited && " (без безлимитных)"}
              </>
            )}
          </p>
        </div>
        {!adding && (
          <Link href={hrefWith("/shop", sp, { add: "1" })} className="btn btn-primary">
            ＋ Добавить вещи
          </Link>
        )}
        {rows.length > 0 &&
          (inStockCount > 0 ? (
            // Обычная ссылка (не next/link): это скачивание файла, а не переход между страницами.
            <a
              href="/api/shop/pdf"
              download
              className="btn"
              title={`В PDF попадут вещи в наличии (${inStockCount}): название, цена и описание списком`}
            >
              📄 Экспорт в PDF
            </a>
          ) : (
            <span className="btn cursor-not-allowed opacity-50" title="Все вещи закончились — экспортировать нечего">
              📄 Экспорт в PDF
            </span>
          ))}
        {rows.length > 0 && <ClearShopButton clear={clearShop} />}
      </div>

      {rows.length === 0 ? (
        <div className="mt-10 text-center text-muted">
          <p>В магазине пока пусто.</p>
          {!adding && (
            <Link href={hrefWith("/shop", sp, { add: "1" })} className="btn btn-primary mt-3 inline-flex">
              ＋ Выбрать вещи из каталога
            </Link>
          )}
        </div>
      ) : (
        [...groups.entries()].map(([category, list]) => (
          <div key={category} className="mt-4">
            <h2 className="px-1 pb-1 text-xs font-medium uppercase tracking-wide text-muted">{label(ITEM_CATEGORIES, category)}</h2>
            <ul className="card divide-y divide-border overflow-hidden">
              {list.map(({ row, item }) => (
                <ShopRow
                  key={row.id}
                  id={row.id}
                  itemKey={row.itemKey}
                  name={item.name}
                  nameClass={item.rarity ? RARITY_COLORS[item.rarity] : ""}
                  subtitle={[item.rarity && label(RARITIES, item.rarity), item.attunement && "настройка"].filter(Boolean).join(" · ") || item.source}
                  href={hrefWith("/shop", sp, { open: row.itemKey })}
                  selected={row.itemKey === openKey}
                  price={row.price}
                  qty={row.qty}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );

  const detail = (
    <section className="border-border p-3 lg:overflow-y-auto lg:border-l">
      {openItem ? (
        <div className="space-y-3">
          <ItemCard i={openItem} />
          <ShopDetailButton inShop={inShop.has(openItem.key)} toggle={toggleShopItem.bind(null, openItem.key)} />
        </div>
      ) : (
        <p className="mt-10 text-center text-sm text-muted">Выберите вещь, чтобы увидеть её полные характеристики</p>
      )}
    </section>
  );

  return (
    <div
      className={`grid flex-1 lg:h-[calc(100vh-49px)] lg:overflow-hidden ${
        adding ? "lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,420px)]" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
      }`}
    >
      {picker}
      {shelfView}
      {detail}
    </div>
  );
}
