import Link from "next/link";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { entryRefs, requireWorld } from "@/lib/world";
import { getMonsterFacets, getMonsterRaw, getMonsters, type MonsterEntry, type RawMonster } from "@/lib/catalog";
import { MONSTER_TYPES, label } from "@/lib/catalog/labels";
import { normalizeSheet } from "@/lib/character";
import { CR_OFFSET, DIFFICULTIES, ENCOUNTER_TYPES, difficultyOf, enemyRange, generateEncounter, multiplier, partyThresholds, xpForCr, type Difficulty } from "@/lib/encounter";
import { toggleEntry } from "@/app/actions";
import { PinButton } from "@/components/PinButton";
import { StatBlock } from "@/components/StatBlock";
import { RerollButton } from "@/components/encounter/RerollButton";
import { StartBattleButton } from "@/components/encounter/StartBattleButton";
import { PresetRowActions, SavePresetButton } from "@/components/encounter/PresetActions";
import { PresetBuilder } from "@/components/encounter/PresetBuilder";
import { TranslationBar } from "@/components/translate/TranslationBar";
import { localize, parseLang } from "@/lib/translate/view";
import { hrefWith } from "@/lib/url";
import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";

const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

function Chip({
  type = "checkbox",
  name,
  value,
  checked,
  children,
  title,
}: {
  type?: "checkbox" | "radio";
  name: string;
  value: string;
  checked: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <label className="cursor-pointer" title={title}>
      <input type={type} name={name} value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="block rounded-md border border-border bg-panel-2 px-2 py-1 text-sm text-muted transition hover:text-text peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
        {children}
      </span>
    </label>
  );
}

export const metadata: Metadata = pageMeta("Столкновения", "⚔️");

export default async function EncountersPage({ searchParams }: PageProps<"/encounters">) {
  await connection();
  const world = await requireWorld();
  const sp = await searchParams;
  const lang = parseLang(sp.lang);
  const go = sp.go === "1";

  const heroes = getDb()
    .select()
    .from(schema.characters)
    .where(and(eq(schema.characters.worldId, world.id), eq(schema.characters.kind, "pc")))
    .orderBy(asc(schema.characters.name))
    .all()
    .map((r) => ({ id: r.id, s: normalizeSheet(JSON.parse(r.data)) }));

  const chosenIds = new Set(all(sp.c));
  const heroOn = (id: number) => !go || chosenIds.has(String(id));
  const extraN = Math.min(10, Math.max(0, Number(sp.xn) || 0));
  const extraL = Math.min(20, Math.max(1, Number(sp.xl) || 1));
  const difficulty = (DIFFICULTIES.find((d) => d.key === sp.d)?.key ?? "medium") as Difficulty;
  const boss = sp.boss === "1";
  const typeKeys = new Set(all(sp.t).filter((t) => ENCOUNTER_TYPES.some((x) => x.key === t)));
  const src = typeof sp.src === "string" ? sp.src : "";

  const levels = [...heroes.filter((h) => heroOn(h.id)).map((h) => h.s.level), ...Array<number>(extraN).fill(extraL)];

  const facets = await getMonsterFacets().catch(() => null);

  // ---------- Пресеты (сохранённые наборы монстров) ----------
  const monsterMap = new Map((await getMonsters().catch(() => [])).map((m) => [m.key, m]));
  const presets = getDb()
    .select()
    .from(schema.encounterPresets)
    .where(eq(schema.encounterPresets.worldId, world.id))
    .orderBy(asc(schema.encounterPresets.name))
    .all()
    .map((r) => {
      const groups = (JSON.parse(r.groups) as { key: string; name: string; count: number }[]).map((g) => ({ ...g, monster: monsterMap.get(g.key) }));
      return { id: r.id, name: r.name, groups };
    });
  const current = presets.find((p) => String(p.id) === sp.preset);
  const building = sp.build === "1" || (sp.edit === "1" && !!current);
  const presetView = !!current && !building;

  // ---------- Генерация ----------
  let result: ReturnType<typeof generateEncounter> = null;
  let message = "";
  let poolSize = 0;
  if (go && !current && !building) {
    const matchers = ENCOUNTER_TYPES.filter((t) => typeKeys.has(t.key));
    const pool = (await getMonsters().catch(() => [])).filter(
      (m) => (!src || m.sourceKey === src) && (matchers.length === 0 || matchers.some((t) => t.match(m))),
    );
    poolSize = pool.length;
    if (levels.length === 0) message = "Отметьте хотя бы одного героя или добавьте героев вручную.";
    else if (pool.length === 0) message = "Каталог монстров пуст или под выбранные типы и источник ничего нет. Попробуйте убрать часть фильтров.";
    else {
      result = generateEncounter({ levels, difficulty, boss, pool, seed: Number(sp.seed) || 1 });
      if (!result) message = "Не нашлось монстров, подходящих по силе этой партии. Попробуйте другой тип или сложность.";
    }
  }

  // Что показываем справа: сгенерированное столкновение или открытый пресет.
  type Shown = {
    title: string;
    groups: { monster: MonsterEntry; count: number; xp: number }[];
    totalXp: number;
    adjustedXp: number;
    monsters: number;
    difficulty: Difficulty | "trivial" | null;
    notes: string[];
    generated: boolean;
  };
  let shown: Shown | null = null;
  if (result) {
    shown = {
      title: boss ? "👑 Босс-файт" : "Столкновение",
      groups: result.groups,
      totalXp: result.totalXp,
      adjustedXp: result.adjustedXp,
      monsters: result.monsters,
      difficulty: result.difficulty,
      notes: result.notes,
      generated: true,
    };
  } else if (current && presetView) {
    const groups = current.groups.flatMap((g) => (g.monster ? [{ monster: g.monster, count: g.count, xp: xpForCr(g.monster.cr) }] : []));
    const monsters = groups.reduce((n, g) => n + g.count, 0);
    const totalXp = groups.reduce((n, g) => n + g.xp * g.count, 0);
    const adjustedXp = levels.length ? Math.round(totalXp * multiplier(monsters, levels.length)) : totalXp;
    const lost = current.groups.length - groups.length;
    shown = {
      title: `📚 ${current.name}`,
      groups,
      totalXp,
      adjustedXp,
      monsters,
      difficulty: levels.length ? difficultyOf(adjustedXp, partyThresholds(levels)) : null,
      notes: lost > 0 ? [`${lost} из монстров пресета не найдены в каталоге (каталог обновился?) и пропущены.`] : [],
      generated: false,
    };
  }

  // Статблоки участников (из кэша переводов; недостающее переводит TranslationBar).
  const pinned = entryRefs(world.id, "monster");
  const cards: { key: string; node: React.ReactNode }[] = [];
  let missing: string[] = [];
  let enabled = false;
  if (shown) {
    for (const g of shown.groups) {
      const raw = await getMonsterRaw(g.monster.key).catch(() => undefined);
      if (!raw) continue;
      const loc = localize("monster", raw as RawMonster, lang);
      missing = [...missing, ...loc.missing];
      enabled = loc.enabled;
      cards.push({ key: g.monster.key, node: <StatBlock m={loc.entry} lang={lang} /> });
    }
  }

  const th = partyThresholds(levels);
  const avgLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
  const targetCr = Math.max(0, Math.round(avgLevel + CR_OFFSET[difficulty]));
  const diff = shown?.difficulty ? DIFFICULTIES.find((x) => x.key === shown.difficulty) : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row">
      {/* ---------- Настройки ---------- */}
      <div className="w-full shrink-0 space-y-4 lg:sticky lg:top-[calc(var(--header-h,49px)+1rem)] lg:max-h-[calc(100dvh-var(--header-h,49px)-2rem)] lg:w-80 lg:self-start lg:overflow-y-auto lg:pr-1">
      <section className="card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-xs uppercase tracking-wide text-muted">📚 Пресеты · {presets.length}</h2>
          <Link href="/encounters?build=1" className="btn px-2 py-1 text-xs" title="Собрать набор монстров вручную">
            ＋ Новый
          </Link>
        </div>
        {presets.length === 0 ? (
          <p className="text-xs text-muted">Сохраняйте понравившиеся наборы монстров: кнопка «💾 Сохранить как пресет» под результатом или «＋ Новый» для ручной сборки.</p>
        ) : (
          <ul className="space-y-1">
            {presets.map((p) => {
              const total = p.groups.reduce((n, g) => n + g.count, 0);
              const active = current?.id === p.id;
              return (
                <li key={p.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${active ? "border-accent bg-panel-2" : "border-border hover:border-accent"}`}>
                  <Link href={`/encounters?preset=${p.id}`} className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${active ? "text-accent" : ""}`}>{p.name}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {total} монстров: {p.groups.map((g) => `${g.count}× ${g.name}`).join(", ")}
                    </span>
                  </Link>
                  <PresetRowActions id={p.id} name={p.name} picks={p.groups.map((g) => ({ key: g.key, count: g.count }))} active={active} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <form method="get" className="space-y-4">
        <input type="hidden" name="go" value="1" />
        <input type="hidden" name="seed" defaultValue={String(sp.seed ?? "1")} />
        {lang === "en" && <input type="hidden" name="lang" value="en" />}

        <h1 className="font-display text-2xl text-accent">⚔️ Столкновения</h1>

        <section className="card space-y-2 p-3">
          <h2 className="text-xs uppercase tracking-wide text-muted">Партия мира «{world.name}»</h2>
          {heroes.length === 0 && (
            <p className="text-sm text-muted">В мире нет персонажей — добавьте героев вручную ниже или создайте их во вкладке «Персонажи».</p>
          )}
          {heroes.map(({ id, s }) => (
            <label key={id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="c" value={id} defaultChecked={heroOn(id)} className="accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate">{s.name || "Без имени"}</span>
              <span className="truncate text-xs text-muted">{s.className}</span>
              <span className="tag shrink-0">ур. {s.level}</span>
            </label>
          ))}
          <div className="flex items-center gap-2 border-t border-border pt-2 text-sm">
            <span className="text-muted">+ вручную:</span>
            <input name="xn" type="number" min={0} max={10} defaultValue={extraN} className="input w-16 py-1 text-center" aria-label="Сколько героев добавить" />
            <span className="text-muted">× ур.</span>
            <input name="xl" type="number" min={1} max={20} defaultValue={extraL} className="input w-16 py-1 text-center" aria-label="Уровень добавленных героев" />
          </div>
        </section>

        <section className="card space-y-2 p-3">
          <h2 className="text-xs uppercase tracking-wide text-muted">Сложность</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {DIFFICULTIES.map((d) => (
              <Chip key={d.key} type="radio" name="d" value={d.key} checked={difficulty === d.key} title={d.hint}>
                {d.label}
              </Chip>
            ))}
          </div>
          {levels.length > 0 && (
            <p className="text-xs text-muted">
              Средний уровень героев {Math.round(avgLevel * 10) / 10}: главный враг ≈ CR {targetCr}
              {boss && " (босс — всегда выше среднего уровня)"}. Врагов: {enemyRange(levels.length)[0]}–{enemyRange(levels.length)[1]}
            </p>
          )}
          <label className="mt-1 flex cursor-pointer items-start gap-2 rounded-md border border-border bg-panel-2 p-2 text-sm">
            <input type="checkbox" name="boss" value="1" defaultChecked={boss} className="mt-0.5 accent-[var(--accent)]" />
            <span>
              <b className="text-accent">👑 Босс-файт</b>
              <span className="block text-xs text-muted">Один сильный враг (CR выше среднего уровня героев, чаще легендарный) и несколько приспешников послабее</span>
            </span>
          </label>
        </section>

        <section className="card space-y-2 p-3">
          <h2 className="text-xs uppercase tracking-wide text-muted">Кто нападает (можно несколько; пусто — любые)</h2>
          <div className="flex flex-wrap gap-1.5">
            {ENCOUNTER_TYPES.map((t) => (
              <Chip key={t.key} name="t" value={t.key} checked={typeKeys.has(t.key)}>
                {t.icon} {t.label}
              </Chip>
            ))}
          </div>
          {facets && (
            <select name="src" defaultValue={src} className="input mt-1 w-full py-1.5 text-sm" aria-label="Источник монстров">
              <option value="">Все источники</option>
              {facets.sources.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label} ({s.count})
                </option>
              ))}
            </select>
          )}
        </section>

        <RerollButton label={go ? "🎲 Сгенерировать заново" : "🎲 Сгенерировать"} />
      </form>
      </div>

      {/* ---------- Результат ---------- */}
      <section className="min-w-0 flex-1 space-y-4">
        {building && (
          <PresetBuilder
            key={current?.id ?? "new"}
            id={current?.id}
            initialName={current?.name ?? ""}
            initial={(current?.groups ?? []).flatMap((g) =>
              g.monster
                ? [{ key: g.key, name: g.monster.name, type: g.monster.type, cr: g.monster.cr, crLabel: g.monster.crLabel, ac: g.monster.ac, hp: g.monster.hp, count: g.count }]
                : [],
            )}
          />
        )}

        {!go && !current && !building && (
          <div className="card p-6 text-center text-muted">
            <p className="font-display text-xl text-accent">Выберите настройки слева и нажмите «Сгенерировать»</p>
            <p className="mt-2 text-sm">
              Сила столкновения считается по правилам DMG: бюджет опыта по уровням героев, множитель за число врагов. Понравившийся набор монстров можно сохранить как пресет.
            </p>
          </div>
        )}
        {message && !building && <p className="card p-4 text-red-400">{message}</p>}

        {shown && !building && (
          <>
            <div className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-display text-2xl text-accent">{shown.title}</h2>
                {shown.difficulty && (
                  <span
                    className="rounded-full px-3 py-0.5 text-sm font-medium"
                    style={{ backgroundColor: `${diff?.color ?? "#9ca3af"}26`, color: diff?.color ?? "#9ca3af" }}
                  >
                    {diff?.label ?? "Слишком лёгкий"}
                  </span>
                )}
                <span className="text-sm text-muted">
                  {shown.monsters} {shown.monsters === 1 ? "враг" : "врагов"} · опыт {shown.totalXp}
                  {levels.length > 0 && (
                    <>
                      {" "}
                      × {multiplier(shown.monsters, levels.length)} = <b className="text-text">{shown.adjustedXp}</b>
                    </>
                  )}
                </span>
              </div>
              {!shown.generated && levels.length > 0 && (
                <p className="text-xs text-muted">
                  Сложность посчитана для {levels.length} {levels.length === 1 ? "героя" : "героев"} партии (ур. {[...levels].sort((a, b) => a - b).join(", ")}).
                </p>
              )}

              <ul className="divide-y divide-border">
                {shown.groups.map((g) => (
                  <li key={g.monster.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="w-12 shrink-0 font-display text-2xl text-accent">{g.count}×</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/monsters?open=${encodeURIComponent(g.monster.key)}`} target="_blank" className="font-display text-lg hover:text-accent">
                        {g.monster.name}
                      </Link>
                      {shown.generated && boss && g.count === 1 && g.monster.key === shown.groups[0].monster.key && (
                        <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-xs font-bold text-bg">БОСС</span>
                      )}
                      <span className="block text-xs text-muted">
                        {label(MONSTER_TYPES, g.monster.type)} · CR {g.monster.crLabel} · КД {g.monster.ac} · хиты {g.monster.hp} · {g.xp} опыта · {g.monster.source}
                      </span>
                    </span>
                    <span className="w-44 shrink-0">
                      <PinButton pinned={pinned.has(g.monster.key)} toggle={toggleEntry.bind(null, "monster", g.monster.key)} />
                    </span>
                  </li>
                ))}
              </ul>

              {shown.notes.map((n) => (
                <p key={n} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300">
                  ⚠ {n}
                </p>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <StartBattleButton picks={shown.groups.map((g) => ({ key: g.monster.key, count: g.count }))} />
                {shown.generated ? (
                  <SavePresetButton
                    picks={shown.groups.map((g) => ({ key: g.monster.key, count: g.count }))}
                    defaultName={`${boss ? "Босс: " : ""}${shown.groups
                      .slice(0, 3)
                      .map((g) => g.monster.name)
                      .join(", ")}`.slice(0, 80)}
                  />
                ) : (
                  current && (
                    <Link href={`/encounters?preset=${current.id}&edit=1`} className="btn">
                      ✏️ Править состав
                    </Link>
                  )
                )}
              </div>

              {shown.generated && (
                <p className="text-xs text-muted">
                  Порог для {levels.length} героев (ур. {[...levels].sort((a, b) => a - b).join(", ")}): лёгкий {th[0]} · средний {th[1]} · тяжёлый {th[2]} · смертельный {th[3]}. Подобрано из{" "}
                  {poolSize} монстров.
                </p>
              )}
            </div>

            {cards.length > 0 && (
              <TranslationBar
                lang={lang}
                hrefRu={hrefWith("/encounters", sp, { lang: null })}
                hrefEn={hrefWith("/encounters", sp, { lang: "en" })}
                missing={[...new Set(missing)]}
                enabled={enabled}
              />
            )}
            <div className="grid gap-4 2xl:grid-cols-2">
              {cards.map((c) => (
                <details key={c.key} open>
                  <summary className="mb-2 cursor-pointer text-sm text-muted hover:text-accent">Статблок</summary>
                  {c.node}
                </details>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
