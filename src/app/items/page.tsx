import Link from "next/link";
import { connection } from "next/server";
import { entryRefs, findEntry, requireWorld } from "@/lib/world";
import { catalogInfo, getItems, sourceOptions, type Item } from "@/lib/catalog";
import { DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES, RARITY_COLORS, label } from "@/lib/catalog/labels";
import { filterItems, formatPrice, parseItemFilter } from "@/lib/catalog/items";
import { hrefWith } from "@/lib/url";
import { resyncCatalog, saveEntryNotes, toggleEntry } from "@/app/actions";
import { AutoForm } from "@/components/filters/AutoForm";
import { Check, Field, Select, TriState, toOptions } from "@/components/filters/fields";
import { CatalogLayout } from "@/components/CatalogLayout";
import { CatalogSync } from "@/components/CatalogSync";
import { ItemCard } from "@/components/ItemCard";
import { NotesEditor } from "@/components/NotesEditor";
import { PinButton } from "@/components/PinButton";

const PAGE = 100;

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const f = parseItemFilter(sp);
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const openKey = typeof sp.open === "string" ? sp.open : "";

  let all: Item[];
  try {
    all = await getItems();
  } catch (e) {
    return <p className="p-8 text-center text-red-400">Не удалось загрузить каталог предметов: {String(e)}</p>;
  }
  const found = filterItems(all, f);
  const pinned = entryRefs(world.id, "item");
  const { systems, books } = sourceOptions(all);
  const categories = [...new Set(all.map((i) => i.category))].sort((a, b) =>
    label(ITEM_CATEGORIES, a).localeCompare(label(ITEM_CATEGORIES, b), "ru"),
  );
  const meta = catalogInfo("items");

  const pin = openKey ? findEntry(world.id, "item", openKey) : undefined;
  const open = openKey ? (all.find((i) => i.key === openKey) ?? (pin?.data ? (JSON.parse(pin.data) as Item) : null)) : null;

  const filters = (
    <>
      <AutoForm action="/items">
        {openKey && <input type="hidden" name="open" value={openKey} />}
        <Field label="Поиск">
          <input name="q" type="search" defaultValue={f.q} placeholder="longsword, potion…" className="input w-full py-1.5 text-sm" />
        </Field>
        <Check name="inDesc" checked={f.inDesc} label="искать и в описании" />

        <Field label="Тип">
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            {[
              ["", "Все"],
              ["mundane", "Обычные"],
              ["magic", "Магические"],
            ].map(([v, l]) => (
              <label key={v} className="flex-1 cursor-pointer px-2 py-1.5 text-center has-[:checked]:bg-accent has-[:checked]:text-bg">
                <input type="radio" name="kind" value={v} defaultChecked={f.kind === v} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Категория">
          <Select name="category" value={f.category} options={toOptions(ITEM_CATEGORIES, categories)} />
        </Field>
        <Field label="Редкость">
          <Select name="rarity" value={f.rarity} options={toOptions(RARITIES)} />
        </Field>
        <Field label="Цена, зм">
          <div className="grid grid-cols-2 gap-2">
            <input name="priceMin" type="number" min={0} defaultValue={f.priceMin ?? ""} placeholder="от" className="input w-full py-1.5 text-sm" />
            <input name="priceMax" type="number" min={0} defaultValue={f.priceMax ?? ""} placeholder="до" className="input w-full py-1.5 text-sm" />
          </div>
        </Field>
        <Field label="Вес до, фнт.">
          <input name="weightMax" type="number" min={0} defaultValue={f.weightMax ?? ""} className="input w-full py-1.5 text-sm" />
        </Field>
        <Field label="Требует настройки">
          <TriState name="attunement" value={f.attunement} />
        </Field>
        <Field label="Урон оружия">
          <Select
            name="damage"
            value={f.damage}
            options={toOptions(DAMAGE_TYPES, ["bludgeoning", "piercing", "slashing"])}
          />
        </Field>
        <Field label="Источник">
          <Select
            name="source"
            value={f.source}
            empty="Все книги"
            groups={[
              { label: "Редакция", options: systems.map((s) => ({ value: s.value, label: `${s.label} (${s.count})` })) },
              { label: "Книга", options: books.map((b) => ({ value: b.value, label: `${b.label} (${b.count})` })) },
            ]}
          />
        </Field>
        <Field label="Сортировка">
          <Select
            name="sort"
            value={f.sort === "name" ? "" : f.sort}
            options={[
              { value: "price", label: "По цене" },
              { value: "rarity", label: "По редкости" },
            ]}
            empty="По имени"
          />
        </Field>
      </AutoForm>
      <p className="mt-3 text-xs text-muted">
        У магических предметов в API нет цены — используется оценка по редкости (≈).
      </p>
      <div className="mt-3 space-y-3">
        <Link href={openKey ? `/items?open=${openKey}` : "/items"} className="btn w-full">
          Сбросить фильтры
        </Link>
        <CatalogSync count={all.length} syncedAt={meta?.syncedAt} resync={resyncCatalog.bind(null, "items")} />
      </div>
    </>
  );

  const list = (
    <>
      <p className="mb-2 text-sm text-muted">Найдено: {found.length}</p>
      <ul className="card divide-y divide-border overflow-hidden">
        {found.slice(0, limit).map((i) => (
          <li key={i.key}>
            <Link
              href={hrefWith("/items", sp, { open: i.key })}
              scroll={false}
              className={`flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-panel-2 ${i.key === openKey ? "bg-panel-2" : ""}`}
            >
              <span className="flex-1">
                <span className={i.rarity ? RARITY_COLORS[i.rarity] : ""}>
                  {pinned.has(i.key) && "★ "}
                  {i.name}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {label(ITEM_CATEGORIES, i.category)}
                  {i.rarity && ` · ${label(RARITIES, i.rarity)}`}
                  {i.attunement && " · настройка"}
                </span>
              </span>
              <span className="hidden text-xs text-muted xl:inline">{i.source}</span>
              <span className="w-24 shrink-0 text-right text-xs text-muted">
                {i.price !== null && `${i.priceEstimated ? "≈" : ""}${formatPrice(i.price)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {found.length > limit && (
        <Link href={hrefWith("/items", sp, { limit: String(limit + PAGE) })} scroll={false} className="btn mt-3 w-full">
          Показать ещё ({found.length - limit})
        </Link>
      )}
    </>
  );

  const detail = open ? (
    <div className="space-y-3">
      <ItemCard i={open} />
      <PinButton pinned={pinned.has(open.key)} toggle={toggleEntry.bind(null, "item", open.key)} />
      {pin && <NotesEditor key={pin.notes} initial={pin.notes} save={saveEntryNotes.bind(null, pin.id)} />}
    </div>
  ) : (
    <p className="mt-10 text-center text-sm text-muted">Выберите предмет из списка</p>
  );

  return <CatalogLayout filters={filters} list={list} detail={detail} />;
}
