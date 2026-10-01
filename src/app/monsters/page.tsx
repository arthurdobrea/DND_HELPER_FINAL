import Link from "next/link";
import { connection } from "next/server";
import { catalogInfo, getMonsterFacets, getMonsterRaw, getMonsters, type MonsterEntry } from "@/lib/catalog";
import {
  ABILITIES,
  ALIGN_LAW,
  ALIGN_MORAL,
  DAMAGE_TYPES,
  ENVIRONMENTS,
  MONSTER_CONDITIONS,
  MONSTER_TYPES,
  MOVEMENTS,
  SENSES,
  SIZES,
  label,
} from "@/lib/catalog/labels";
import { filterMonsters, parseMonsterFilter, type RawMonster } from "@/lib/catalog/monsters";
import { getMonster } from "@/lib/open5e";
import { entryRefs, findEntry, requireWorld } from "@/lib/world";
import { hrefWith } from "@/lib/url";
import { resyncCatalog, saveEntryNotes, toggleEntry } from "@/app/actions";
import { AutoForm } from "@/components/filters/AutoForm";
import { Check, Chips, Field, Select, TriState, toOptions } from "@/components/filters/fields";
import { CatalogLayout } from "@/components/CatalogLayout";
import { CatalogSync } from "@/components/CatalogSync";
import { NotesEditor } from "@/components/NotesEditor";
import { PinButton } from "@/components/PinButton";
import { StatBlock } from "@/components/StatBlock";
import { TranslationBar } from "@/components/translate/TranslationBar";
import { localize, parseLang } from "@/lib/translate/view";

const PAGE = 100;

const CR_STEPS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const CR_OPTIONS = CR_STEPS.map((v) => ({ value: String(v), label: v === 0.125 ? "1/8" : v === 0.25 ? "1/4" : v === 0.5 ? "1/2" : String(v) }));

const envLabel = (key: string) => ENVIRONMENTS[key] ?? key.replace(/^./, (c) => c.toUpperCase());
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export default async function MonstersPage({ searchParams }: PageProps<"/monsters">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const f = parseMonsterFilter(sp);
  const lang = parseLang(sp.lang);
  const limit = Math.max(PAGE, Number(sp.limit) || PAGE);
  const openKey = typeof sp.open === "string" ? sp.open : "";

  let all: MonsterEntry[];
  try {
    all = await getMonsters();
  } catch (e) {
    return <p className="p-8 text-center text-red-400">Не удалось загрузить каталог монстров: {String(e)}</p>;
  }
  const facets = await getMonsterFacets();
  const found = filterMonsters(all, f);
  const pinned = entryRefs(world.id, "monster");
  const meta = catalogInfo("monsters");

  // Карточка: из каталога; если записи там нет (каталог обновили) — копия из закладок мира, затем API.
  const pin = openKey ? findEntry(world.id, "monster", openKey) : undefined;
  let open: RawMonster | null = null;
  if (openKey) {
    open =
      (await getMonsterRaw(openKey).catch(() => undefined)) ??
      (pin?.data ? (JSON.parse(pin.data) as RawMonster) : null) ??
      ((await getMonster(openKey).catch(() => null)) as RawMonster | null);
  }

  const filters = (
    <>
      <AutoForm action="/monsters">
        {openKey && <input type="hidden" name="open" value={openKey} />}
        <Field label="Поиск">
          <input name="q" type="search" defaultValue={f.q} placeholder="goblin, dragon…" className="input w-full py-1.5 text-sm" />
        </Field>
        <Check name="inDesc" checked={f.inDesc} label="искать и в описании / способностях" />

        <div className="grid grid-cols-2 gap-2">
          <Field label="CR от">
            <Select name="crMin" value={f.crMin === null ? "" : String(f.crMin)} options={CR_OPTIONS} empty="—" />
          </Field>
          <Field label="до">
            <Select name="crMax" value={f.crMax === null ? "" : String(f.crMax)} options={CR_OPTIONS} empty="—" />
          </Field>
        </div>

        <Field label="Тип">
          <Chips name="type" values={f.types} options={toOptions(MONSTER_TYPES)} />
        </Field>
        <Field label="Размер">
          <Chips name="size" values={f.sizes} options={toOptions(SIZES, ["tiny", "small", "medium", "large", "huge", "gargantuan"])} />
        </Field>
        <Field label="Среда обитания">
          <Select
            name="env"
            value={f.env}
            options={facets.environments
              .filter((e) => e.count >= 3)
              .sort((a, b) => envLabel(a.value).localeCompare(envLabel(b.value), "ru"))
              .map((e) => ({ value: e.value, label: `${envLabel(e.value)} (${e.count})` }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Хиты от">
            <input name="hpMin" type="number" min={0} defaultValue={f.hpMin ?? ""} className="input w-full py-1.5 text-sm" />
          </Field>
          <Field label="до">
            <input name="hpMax" type="number" min={0} defaultValue={f.hpMax ?? ""} className="input w-full py-1.5 text-sm" />
          </Field>
          <Field label="КД от">
            <input name="acMin" type="number" min={0} defaultValue={f.acMin ?? ""} className="input w-full py-1.5 text-sm" />
          </Field>
          <Field label="до">
            <input name="acMax" type="number" min={0} defaultValue={f.acMax ?? ""} className="input w-full py-1.5 text-sm" />
          </Field>
        </div>

        <Field label="Передвижение (все выбранные)">
          <Chips name="movement" values={f.movement} options={toOptions(MOVEMENTS)} />
        </Field>
        <Field label="Чувства">
          <Select name="sense" value={f.sense} options={toOptions(SENSES)} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Мораль">
            <Select name="moral" value={f.moral} options={toOptions(ALIGN_MORAL)} />
          </Field>
          <Field label="Порядок">
            <Select name="law" value={f.law} options={toOptions(ALIGN_LAW)} />
          </Field>
        </div>

        <Field label="Легендарные действия">
          <TriState name="legendary" value={f.legendary} />
        </Field>
        <Field label="Колдует">
          <TriState name="spellcaster" value={f.spellcaster} />
        </Field>

        <Field label="Иммунитет к урону">
          <Select name="immune" value={f.immune} options={toOptions(DAMAGE_TYPES)} />
        </Field>
        <Field label="Сопротивление урону">
          <Select name="resistant" value={f.resistant} options={toOptions(DAMAGE_TYPES)} />
        </Field>
        <Field label="Уязвимость к урону">
          <Select name="vulnerable" value={f.vulnerable} options={toOptions(DAMAGE_TYPES)} />
        </Field>
        <Field label="Иммунитет к состоянию">
          <Select name="conditionImmune" value={f.conditionImmune} options={toOptions(MONSTER_CONDITIONS)} />
        </Field>

        <div className="grid grid-cols-[1fr_72px] gap-2">
          <Field label="Характеристика ≥">
            <Select name="abilityKey" value={f.abilityKey} empty="—" options={toOptions(ABILITIES_BY_SHORT)} />
          </Field>
          <Field label="значение">
            <input name="abilityMin" type="number" min={1} max={30} defaultValue={f.abilityMin ?? ""} className="input w-full py-1.5 text-sm" />
          </Field>
        </div>

        <Field label="Язык">
          <Select
            name="language"
            value={f.language}
            options={[
              { value: "none", label: "Не владеет языками" },
              ...facets.languages.map((l) => ({ value: l.value, label: `${cap(l.value)} (${l.count})` })),
            ]}
          />
        </Field>
        <Field label="Телепатия">
          <TriState name="telepathy" value={f.telepathy} />
        </Field>

        <Field label="Источник">
          <Select
            name="source"
            value={f.source}
            empty="Все книги"
            options={facets.sources.map((s) => ({ value: s.value, label: `${s.label} (${s.count})` }))}
          />
        </Field>
        <Field label="Сортировка">
          <Select
            name="sort"
            value={f.sort === "name" ? "" : f.sort}
            empty="По имени"
            options={[
              { value: "cr", label: "CR ↑" },
              { value: "cr-desc", label: "CR ↓" },
              { value: "hp-desc", label: "Хиты ↓" },
              { value: "ac-desc", label: "КД ↓" },
            ]}
          />
        </Field>
      </AutoForm>
      <div className="mt-3 space-y-3">
        <Link href={openKey ? `/monsters?open=${encodeURIComponent(openKey)}` : "/monsters"} className="btn w-full">
          Сбросить фильтры
        </Link>
        <CatalogSync count={all.length} syncedAt={meta?.syncedAt} resync={resyncCatalog.bind(null, "monsters")} />
      </div>
    </>
  );

  const list = (
    <>
      <p className="mb-2 text-sm text-muted">Найдено: {found.length}</p>
      <ul className="card divide-y divide-border overflow-hidden">
        {found.slice(0, limit).map((m) => (
          <li key={m.key}>
            <Link
              href={hrefWith("/monsters", sp, { open: m.key })}
              scroll={false}
              className={`flex items-baseline gap-3 px-3 py-2 text-sm hover:bg-panel-2 ${m.key === openKey ? "bg-panel-2" : ""}`}
            >
              <span className="w-12 shrink-0 text-xs text-muted">CR {m.crLabel}</span>
              <span className="flex-1">
                <span className={m.key === openKey ? "text-accent" : ""}>
                  {pinned.has(m.key) && "★ "}
                  {m.name}
                </span>
                <span className="ml-2 text-xs text-muted">
                  {label(SIZES, m.size)} · {label(MONSTER_TYPES, m.type)}
                </span>
              </span>
              <span className="hidden w-20 shrink-0 text-right text-xs text-muted sm:inline">
                ♥ {m.hp} · КД {m.ac}
              </span>
              <span className="hidden max-w-40 truncate text-xs text-muted xl:inline">{m.source}</span>
            </Link>
          </li>
        ))}
      </ul>
      {found.length > limit && (
        <Link href={hrefWith("/monsters", sp, { limit: String(limit + PAGE) })} scroll={false} className="btn mt-3 w-full">
          Показать ещё ({found.length - limit})
        </Link>
      )}
    </>
  );

  const loc = open ? localize("monster", open, lang) : null;
  const detail = open && loc ? (
    <div className="space-y-3">
      <TranslationBar
        lang={lang}
        hrefRu={hrefWith("/monsters", sp, { lang: null })}
        hrefEn={hrefWith("/monsters", sp, { lang: "en" })}
        missing={loc.missing}
        enabled={loc.enabled}
      />
      <StatBlock m={loc.entry} lang={lang} />
      {loc.entry.desc && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer text-muted">Описание / лор</summary>
          <div className="mt-2 whitespace-pre-line">{loc.entry.desc.replace(/\\n/g, "\n")}</div>
        </details>
      )}
      <PinButton pinned={pinned.has(openKey)} toggle={toggleEntry.bind(null, "monster", openKey)} />
      {pin && <NotesEditor key={pin.notes} initial={pin.notes} save={saveEntryNotes.bind(null, pin.id)} />}
    </div>
  ) : (
    <p className="mt-10 text-center text-sm text-muted">Выберите монстра из списка</p>
  );

  return <CatalogLayout filters={filters} list={list} detail={detail} />;
}

const ABILITIES_BY_SHORT: Record<string, string> = {
  str: ABILITIES.strength,
  dex: ABILITIES.dexterity,
  con: ABILITIES.constitution,
  int: ABILITIES.intelligence,
  wis: ABILITIES.wisdom,
  cha: ABILITIES.charisma,
};
