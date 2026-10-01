import Link from "next/link";
import { connection } from "next/server";
import { entryRefs, findEntry, requireWorld } from "@/lib/world";
import { catalogInfo, getSpells, sourceOptions, type Spell } from "@/lib/catalog";
import { ABILITIES, CASTING_TIMES, CLASSES, CONDITIONS, DAMAGE_TYPES, SCHOOLS, label } from "@/lib/catalog/labels";
import { SPELL_EFFECTS, filterSpells, parseSpellFilter, spellLevelLabel } from "@/lib/catalog/spells";
import { hrefWith } from "@/lib/url";
import { resyncCatalog, saveEntryNotes, toggleEntry } from "@/app/actions";
import { AutoForm } from "@/components/filters/AutoForm";
import { Check, Chips, Field, Select, TriState, toOptions } from "@/components/filters/fields";
import { CatalogLayout } from "@/components/CatalogLayout";
import { CatalogSync } from "@/components/CatalogSync";
import { NotesEditor } from "@/components/NotesEditor";
import { PinButton } from "@/components/PinButton";
import { SpellCard } from "@/components/SpellCard";
import { TranslationBar } from "@/components/translate/TranslationBar";
import { localize, parseLang } from "@/lib/translate/view";

const PAGE = 100;
const LEVELS = Array.from({ length: 10 }, (_, l) => ({ value: String(l), label: spellLevelLabel(l) }));

export default async function SpellsPage({ searchParams }: PageProps<"/spells">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const f = parseSpellFilter(sp);
  const lang = parseLang(sp.lang);
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const openKey = typeof sp.open === "string" ? sp.open : "";

  let all: Spell[];
  try {
    all = await getSpells();
  } catch (e) {
    return <p className="p-8 text-center text-red-400">Не удалось загрузить каталог заклинаний: {String(e)}</p>;
  }
  const found = filterSpells(all, f);
  const pinned = entryRefs(world.id, "spell");
  const { systems, books } = sourceOptions(all);
  const meta = catalogInfo("spells");

  // Карточка: из каталога, а если запись пропала после обновления — из копии в избранном.
  const pin = openKey ? findEntry(world.id, "spell", openKey) : undefined;
  const open = openKey ? (all.find((s) => s.key === openKey) ?? (pin?.data ? (JSON.parse(pin.data) as Spell) : null)) : null;

  const filters = (
    <>
      <AutoForm action="/spells">
        {openKey && <input type="hidden" name="open" value={openKey} />}
        <Field label="Поиск">
          <input name="q" type="search" defaultValue={f.q} placeholder="fireball, cure…" className="input w-full py-1.5 text-sm" />
        </Field>
        <Check name="inDesc" checked={f.inDesc} label="искать и в описании" />

        <Field label="Назначение (по описанию)">
          <Chips name="effect" values={f.effects} options={toOptions(SPELL_EFFECTS)} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Круг от">
            <Select name="levelMin" value={f.levelMin === 0 ? "" : String(f.levelMin)} options={LEVELS} empty="—" />
          </Field>
          <Field label="до">
            <Select name="levelMax" value={f.levelMax === 9 ? "" : String(f.levelMax)} options={LEVELS} empty="—" />
          </Field>
        </div>
        <Field label="Класс">
          <Select name="cls" value={f.cls} options={toOptions(CLASSES)} />
        </Field>
        <Field label="Школа">
          <Select name="school" value={f.school} options={toOptions(SCHOOLS)} />
        </Field>
        <Field label="Время накладывания">
          <Select name="castingTime" value={f.castingTime} options={toOptions(CASTING_TIMES)} />
        </Field>
        <Field label="Тип урона">
          <Select name="damage" value={f.damage} options={toOptions(DAMAGE_TYPES)} />
        </Field>
        <Field label="Накладывает состояние">
          <Select name="condition" value={f.condition} options={toOptions(CONDITIONS)} />
        </Field>
        <Field label="Спасбросок">
          <Select name="save" value={f.save} options={[{ value: "any", label: "Любой спасбросок" }, ...toOptions(ABILITIES)]} />
        </Field>
        <Field label="Концентрация">
          <TriState name="concentration" value={f.concentration} />
        </Field>
        <Field label="Ритуал">
          <TriState name="ritual" value={f.ritual} />
        </Field>
        <Field label="Бросок атаки">
          <TriState name="attack" value={f.attack} />
        </Field>
        <Check name="noMaterial" checked={f.noMaterial} label="без материальных компонентов" />
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
          <Select name="sort" value={f.sort === "name" ? "" : f.sort} options={[{ value: "level", label: "По кругу" }]} empty="По имени" />
        </Field>
      </AutoForm>
      <div className="mt-3 space-y-3">
        <Link href={openKey ? `/spells?open=${openKey}` : "/spells"} className="btn w-full">
          Сбросить фильтры
        </Link>
        <CatalogSync count={all.length} syncedAt={meta?.syncedAt} resync={resyncCatalog.bind(null, "spells")} />
      </div>
    </>
  );

  const list = (
    <>
      <p className="mb-2 text-sm text-muted">Найдено: {found.length}</p>
      <ul className="card divide-y divide-border overflow-hidden">
        {found.slice(0, limit).map((s) => (
          <li key={s.key}>
            <Link
              href={hrefWith("/spells", sp, { open: s.key })}
              scroll={false}
              className={`flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-panel-2 ${s.key === openKey ? "bg-panel-2" : ""}`}
            >
              <span className="w-16 shrink-0 text-xs text-muted">{spellLevelLabel(s.level)}</span>
              <span className="flex-1">
                <span className={s.key === openKey ? "text-accent" : ""}>
                  {pinned.has(s.key) && "★ "}
                  {s.name}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {label(SCHOOLS, s.school)}
                  {s.concentration && " · К"}
                  {s.ritual && " · Р"}
                </span>
              </span>
              <span className="hidden text-xs text-muted xl:inline">{s.source}</span>
            </Link>
          </li>
        ))}
      </ul>
      {found.length > limit && (
        <Link href={hrefWith("/spells", sp, { limit: String(limit + PAGE) })} scroll={false} className="btn mt-3 w-full">
          Показать ещё ({found.length - limit})
        </Link>
      )}
    </>
  );

  const loc = open ? localize("spell", open, lang) : null;
  const detail = open && loc ? (
    <div className="space-y-3">
      <TranslationBar
        lang={lang}
        hrefRu={hrefWith("/spells", sp, { lang: null })}
        hrefEn={hrefWith("/spells", sp, { lang: "en" })}
        missing={loc.missing}
        enabled={loc.enabled}
      />
      <SpellCard s={loc.entry} />
      <PinButton pinned={pinned.has(open.key)} toggle={toggleEntry.bind(null, "spell", open.key)} />
      {pin && <NotesEditor key={pin.notes} initial={pin.notes} save={saveEntryNotes.bind(null, pin.id)} />}
    </div>
  ) : (
    <p className="mt-10 text-center text-sm text-muted">Выберите заклинание из списка</p>
  );

  return <CatalogLayout filters={filters} list={list} detail={detail} />;
}
