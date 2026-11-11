"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aiDelete, aiGenerate, aiHistory, aiItemToShop, aiRefine, aiStar, aiUpdate, type AiResult } from "@/app/ai-forge-actions";
import { createForgedNpc } from "@/app/forge-actions";
import { stashCatch } from "@/app/fishing-actions";
import { AI_KINDS, defaultOptions, entitySubtitle, fishingTierOf, type AiCreation, type AiEntity, type AiKind, type AiOptions, type AiQuality } from "@/lib/ai-forge";
import { ItemFields, MonsterFields, SpellFields, applyRows, rowsFromDraft, type AbilityRow } from "@/components/ai/AiEditor";
import { CLASSES, ITEM_CATEGORIES, MONSTER_TYPES, RARITIES, SCHOOLS, SIZES } from "@/lib/catalog/labels";
import { CR_LIST, crText, estimateCr } from "@/lib/cr";
import { buildMonster, type ForgeDraft } from "@/lib/forge";
import { TIER_BY_ID } from "@/lib/fishing";
import { StatBlock } from "@/components/StatBlock";
import { SpellCard } from "@/components/SpellCard";
import { ItemCard } from "@/components/ItemCard";
import { STORE_KEY } from "@/components/npc/NpcParts";

const PLACEHOLDER: Record<AiKind, string> = {
  monster: "Болотная ведьма-утопленница для группы 5 уровня. Тянет героев под воду, насылает гниль, боится огня…",
  spell: "Заклинание друида 3 круга: из земли вырастают шипастые корни, опутывают врагов и тянут из них жизнь…",
  item: "Гарпун, который возвращается в руку и подтягивает пойманное существо к владельцу…",
};
const REFINE_HINTS: Record<AiKind, string[]> = {
  monster: ["сделай слабее", "сделай сильнее", "добавь легендарные действия", "убери заклинания", "добавь атаку хвостом"],
  spell: ["сделай на круг выше", "добавь концентрацию", "убери урон, сделай контроль", "сделай ритуалом"],
  item: ["сделай редким", "добавь заряды", "добавь проклятие", "сделай оружием", "сделай дешевле"],
};

const options = (map: Record<string, string>) =>
  Object.entries(map).map(([k, v]) => (
    <option key={k} value={k}>
      {v}
    </option>
  ));

const fileName = (s: string) => `${(s.trim() || "NPC").replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
const isRedirect = (e: unknown) => !!e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");

export function AiForge({ initialHistory, enabled }: { initialHistory: AiCreation[]; enabled: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<AiKind>("monster");
  const [prompts, setPrompts] = useState<Record<AiKind, string>>({ monster: "", spell: "", item: "" });
  const [opts, setOpts] = useState<AiOptions>(defaultOptions);
  const [count, setCount] = useState(1);
  const [quality, setQuality] = useState<AiQuality>("fast");
  const [variants, setVariants] = useState<AiCreation[]>([]);
  const [current, setCurrent] = useState<AiCreation | null>(null);
  const [refine, setRefine] = useState("");
  const [history, setHistory] = useState<AiCreation[]>(initialHistory);
  const [histFilter, setHistFilter] = useState<"all" | "star" | AiKind>("all");
  const [busy, setBusy] = useState<null | "gen" | "refine">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Правка «как текст»: рабочая копия сущности и (для монстра) строки способностей
  const [editing, setEditing] = useState<AiEntity | null>(null);
  const [rows, setRows] = useState<AbilityRow[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (p: Partial<AiOptions>) => setOpts((o) => ({ ...o, ...p }));
  const say = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4000);
  };

  async function run(fn: () => Promise<AiResult>, mode: "gen" | "refine") {
    setError(null);
    setNotice(null);
    setBusy(mode);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (mode === "gen") setVariants(res.items);
      else setVariants((v) => [...res.items, ...v].slice(0, 6));
      open(res.items[0] ?? null);
      if (mode === "refine") setRefine("");
      setHistory((h) => [...res.items, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка генерации");
    } finally {
      setBusy(null);
    }
  }

  const generate = () => run(() => aiGenerate({ kind, prompt: prompts[kind], options: opts, count, quality }), "gen");
  const doRefine = (text = refine) => {
    if (current && text.trim()) void run(() => aiRefine({ id: current.id, instruction: text, quality }), "refine");
  };

  function startEdit() {
    if (!current) return;
    setEditing(structuredClone(current.entity));
    setRows(current.entity.kind === "monster" ? rowsFromDraft(current.entity.draft) : []);
    setError(null);
  }
  const stopEdit = () => {
    setEditing(null);
    setRows([]);
  };
  const open = (c: AiCreation | null) => {
    stopEdit();
    setCurrent(c);
  };

  async function saveEdit() {
    if (!current || !editing) return;
    setSaving(true);
    setError(null);
    try {
      const entity: AiEntity = editing.kind === "monster" ? { kind: "monster", draft: applyRows(editing.draft, rows) } : editing;
      const res = await aiUpdate(current.id, entity);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const upd = (x: AiCreation) => (x.id === res.item.id ? res.item : x);
      setHistory((h) => h.map(upd));
      setVariants((v) => v.map(upd));
      setCurrent(res.item);
      stopEdit();
      say("Правки сохранены");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить правки");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStar(c: AiCreation) {
    const next = !c.starred;
    await aiStar(c.id, next);
    const upd = (x: AiCreation) => (x.id === c.id ? { ...x, starred: next } : x);
    setHistory((h) => h.map(upd));
    setVariants((v) => v.map(upd));
    setCurrent((cur) => (cur && cur.id === c.id ? { ...cur, starred: next } : cur));
  }

  async function remove(c: AiCreation) {
    if (!confirm(`Удалить «${c.name}» из истории?`)) return;
    await aiDelete(c.id);
    setHistory((h) => h.filter((x) => x.id !== c.id));
    setVariants((v) => v.filter((x) => x.id !== c.id));
    if (current?.id === c.id) open(null);
  }

  function toBuilder(d: ForgeDraft) {
    try {
      const prev = localStorage.getItem(STORE_KEY);
      if (prev && prev.length > 400 && !confirm("В сборщике уже есть черновик. Заменить его этим существом?")) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(d));
    } catch {
      setError("Браузер не дал сохранить черновик (хранилище недоступно).");
      return;
    }
    router.push("/npcs/builder");
  }

  function createNpc(d: ForgeDraft) {
    setError(null);
    start(async () => {
      try {
        await createForgedNpc(d);
      } catch (e) {
        if (isRedirect(e)) throw e; // переход на страницу NPC — это не ошибка
        setError(e instanceof Error ? e.message : "Не удалось создать NPC");
      }
    });
  }

  async function pdf(d: ForgeDraft) {
    setError(null);
    try {
      const res = await fetch("/api/npcs/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft: d }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Ошибка ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(d.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось собрать PDF");
    }
  }

  async function toShop(c: AiCreation) {
    const r = await aiItemToShop(c.id);
    if (r.ok) say("Предмет добавлен в магазин");
    else setError(r.error ?? "Не удалось добавить в магазин");
  }

  async function toFishing(c: AiCreation) {
    if (c.entity.kind !== "item") return;
    const it = c.entity.item;
    const tier = fishingTierOf(it);
    try {
      await stashCatch({
        tier,
        value: null,
        junk: null,
        item: { key: it.key, name: it.name, nameEn: it.name, rarity: it.rarity, category: it.category, price: it.price, priceEstimated: it.priceEstimated, attunement: it.attunement, desc: it.desc },
      });
      say(`Добавлено в заготовки рыбалки: ${TIER_BY_ID[tier].title}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить в заготовки");
    }
  }

  // Статблок и оценка CR текущего монстра
  const draft = current?.entity.kind === "monster" ? current.entity.draft : null;
  const monster = useMemo(() => (draft ? buildMonster(draft) : null), [draft]);
  const est = useMemo(() => (monster && draft ? estimateCr(monster, draft.multiattack) : null), [monster, draft]);
  const crGap = est && draft ? CR_LIST.indexOf(est.cr) - CR_LIST.indexOf(draft.cr) : 0;

  const shownHistory = history.filter((c) => (histFilter === "all" ? true : histFilter === "star" ? c.starred : c.kind === histFilter));
  const icon = (k: AiKind) => AI_KINDS.find((x) => x.id === k)?.icon ?? "";
  const sel = "input py-1 text-sm";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {/* ===== Тип ===== */}
        <div className="flex gap-1 rounded-lg border border-border bg-panel p-1">
          {AI_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm ${kind === k.id ? "bg-panel-2 font-semibold text-accent" : "text-muted hover:text-text"}`}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>

        {/* ===== Описание и параметры ===== */}
        <section className="card space-y-3 p-4">
          {!enabled && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-200">ИИ выключен: впишите GEMINI_API_KEY в файл .env и перезапустите приложение.</p>
          )}
          <textarea
            value={prompts[kind]}
            onChange={(e) => setPrompts((p) => ({ ...p, [kind]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !busy) void generate();
            }}
            rows={4}
            maxLength={2000}
            placeholder={PLACEHOLDER[kind]}
            className="input w-full resize-y text-base leading-relaxed"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {kind === "monster" && (
              <>
                <select value={opts.cr} onChange={(e) => set({ cr: e.target.value })} className={sel} aria-label="CR">
                  <option value="">CR — любой</option>
                  {CR_LIST.map((c) => (
                    <option key={c} value={c}>
                      CR {crText(c)}
                    </option>
                  ))}
                </select>
                <select value={opts.type} onChange={(e) => set({ type: e.target.value })} className={sel} aria-label="Тип">
                  <option value="">Тип — любой</option>
                  {options(MONSTER_TYPES)}
                </select>
                <select value={opts.size} onChange={(e) => set({ size: e.target.value })} className={sel} aria-label="Размер">
                  <option value="">Размер — любой</option>
                  {options(SIZES)}
                </select>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={opts.casting} onChange={(e) => set({ casting: e.target.checked })} /> колдует
                </label>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={opts.legendary} onChange={(e) => set({ legendary: e.target.checked })} /> легендарный
                </label>
              </>
            )}
            {kind === "spell" && (
              <>
                <select value={opts.level} onChange={(e) => set({ level: e.target.value })} className={sel} aria-label="Круг">
                  <option value="">Круг — любой</option>
                  <option value="0">Заговор</option>
                  {Array.from({ length: 9 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} круг
                    </option>
                  ))}
                </select>
                <select value={opts.school} onChange={(e) => set({ school: e.target.value })} className={sel} aria-label="Школа">
                  <option value="">Школа — любая</option>
                  {options(SCHOOLS)}
                </select>
                <select value={opts.cls} onChange={(e) => set({ cls: e.target.value })} className={sel} aria-label="Класс">
                  <option value="">Класс — любой</option>
                  {options(CLASSES)}
                </select>
              </>
            )}
            {kind === "item" && (
              <>
                <select value={opts.rarity} onChange={(e) => set({ rarity: e.target.value })} className={sel} aria-label="Редкость">
                  <option value="">Редкость — любая</option>
                  {options(RARITIES)}
                </select>
                <select value={opts.category} onChange={(e) => set({ category: e.target.value })} className={sel} aria-label="Категория">
                  <option value="">Категория — любая</option>
                  {options(ITEM_CATEGORIES)}
                </select>
                <label className="flex items-center gap-1.5 text-muted">
                  <input type="checkbox" checked={opts.attune} onChange={(e) => set({ attune: e.target.checked })} /> требует настройки
                </label>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
            <label className="flex items-center gap-1.5 text-muted">
              Вариантов
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={sel}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex overflow-hidden rounded-md border border-border text-xs">
              {(
                [
                  ["fast", "⚡ Быстро", "Модель из GEMINI_MODEL (Flash-Lite): дёшево, около 0,4 цента за монстра"],
                  ["quality", "💎 Качественнее", "Модель из GEMINI_MODEL_QUALITY (3.5 Flash): умнее, около 2–3 центов за монстра"],
                ] as const
              ).map(([q, label, title]) => (
                <button key={q} type="button" title={title} onClick={() => setQuality(q)} className={`px-2.5 py-1.5 ${quality === q ? "bg-panel-2 text-accent" : "text-muted hover:text-text"}`}>
                  {label}
                </button>
              ))}
            </div>
            <span className="hidden text-xs text-muted md:inline">Ctrl+Enter — сгенерировать</span>
            <button type="button" className="btn btn-primary ml-auto px-5 py-2 text-base" disabled={!!busy || !enabled} onClick={() => void generate()}>
              {busy === "gen" ? "Куём…" : "🔮 Сгенерировать"}
            </button>
          </div>
        </section>

        {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-300">{error}</p>}
        {notice && <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-300">{notice}</p>}

        {/* ===== Варианты ===== */}
        {variants.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {variants.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => open(v)}
                className={`rounded-md border px-3 py-1 text-sm ${current?.id === v.id ? "border-accent bg-panel-2 text-accent" : "border-border text-muted hover:text-text"}`}
              >
                {i + 1}. {v.name}
              </button>
            ))}
          </div>
        )}

        {/* ===== Результат ===== */}
        {busy === "gen" && <div className="card animate-pulse p-4 text-center text-sm text-muted">Gemini придумывает… обычно 10–40 секунд</div>}
        {current ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
            <div className={`min-w-0 space-y-2 ${busy ? "opacity-60" : ""}`}>
              {editing && (
                <div className="card space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
                    <span className="font-display text-lg text-accent">✏️ Правка текста</span>
                    <button type="button" className="btn btn-primary ml-auto px-4" disabled={saving} onClick={() => void saveEdit()}>
                      {saving ? "Сохраняю…" : "💾 Сохранить"}
                    </button>
                    <button type="button" className="btn" disabled={saving} onClick={stopEdit}>
                      Отмена
                    </button>
                  </div>
                  {editing.kind === "monster" && <MonsterFields d={editing.draft} rows={rows} onDraft={(d) => setEditing({ kind: "monster", draft: d })} onRows={setRows} />}
                  {editing.kind === "spell" && <SpellFields s={editing.spell} onChange={(s) => setEditing({ kind: "spell", spell: s })} />}
                  {editing.kind === "item" && <ItemFields i={editing.item} onChange={(i) => setEditing({ kind: "item", item: i })} />}
                </div>
              )}
              {!editing && monster && <StatBlock m={monster} lang="ru" />}
              {!editing && current.entity.kind === "spell" && <SpellCard s={current.entity.spell} />}
              {!editing && current.entity.kind === "item" && <ItemCard i={current.entity.item} />}
              {!editing && draft && est && (
                <p className={`rounded-md border p-2 text-xs ${Math.abs(crGap) <= 1 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"}`}>
                  Расчётный CR по таблице мастера ≈ <b>{crText(est.cr)}</b> (защита {crText(est.defCr)}, атака {crText(est.offCr)}, урон ≈ {Math.round(est.dpr)} за раунд) при заявленном{" "}
                  <b>{crText(draft.cr)}</b>.
                  {Math.abs(crGap) > 1 && (crGap > 0 ? " Существо сильнее заявленного — попросите «сделай слабее»." : " Существо слабее заявленного — попросите «сделай сильнее».")} Заклинания в
                  оценку не входят.
                </p>
              )}
              {!editing && draft && (draft.motivation || draft.backstory) && (
                <div className="card space-y-1 p-3 text-sm">
                  {draft.motivation && (
                    <p>
                      <b className="text-accent">Мотивация.</b> {draft.motivation}
                    </p>
                  )}
                  {draft.backstory && (
                    <p>
                      <b className="text-accent">Предыстория.</b> {draft.backstory}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Действия */}
            <div className="space-y-2">
              <button type="button" className="btn w-full" disabled={!!busy} onClick={() => void generate()} title="Ещё раз по тому же описанию и параметрам">
                🔄 Другой вариант
              </button>
              <button type="button" className={`btn w-full ${editing ? "border-accent text-accent" : ""}`} disabled={!!busy || saving} onClick={() => (editing ? stopEdit() : startEdit())} title="Править всё вручную: поля и текст способностей, без сборщика">
                {editing ? "✕ Закрыть правку" : "📝 Править текст"}
              </button>
              <div className="card space-y-2 p-2">
                <textarea
                  value={refine}
                  onChange={(e) => setRefine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      doRefine();
                    }
                  }}
                  rows={2}
                  placeholder="Что изменить?"
                  className="input w-full resize-y text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {REFINE_HINTS[current.kind].map((h) => (
                    <button
                      key={h}
                      type="button"
                      disabled={!!busy}
                      className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
                      onClick={() => doRefine(h)}
                    >
                      {h}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn w-full text-sm" disabled={!!busy || !refine.trim()} onClick={() => doRefine()}>
                  {busy === "refine" ? "Дорабатываю…" : "✏️ Уточнить"}
                </button>
              </div>

              {draft && (
                <>
                  <button type="button" className="btn w-full" onClick={() => toBuilder(draft)}>
                    🧩 В сборщик
                  </button>
                  <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => createNpc(draft)}>
                    {pending ? "Создаю…" : "🎭 Создать NPC"}
                  </button>
                  <button type="button" className="btn w-full" onClick={() => void pdf(draft)}>
                    📄 PDF-лист
                  </button>
                </>
              )}
              {current.entity.kind === "item" && (
                <>
                  <button type="button" className="btn w-full" onClick={() => void toShop(current)}>
                    🏺 В магазин
                  </button>
                  <button type="button" className="btn w-full" onClick={() => void toFishing(current)}>
                    🎣 В заготовки рыбалки
                  </button>
                </>
              )}
              <button type="button" className={`btn w-full ${current.starred ? "text-accent" : ""}`} onClick={() => void toggleStar(current)}>
                {current.starred ? "★ В избранном" : "☆ В избранное"}
              </button>
              {current.prompt && <p className="whitespace-pre-line text-[11px] text-muted">Запрос: {current.prompt}</p>}
            </div>
          </div>
        ) : (
          busy !== "gen" && (
            <div className="card p-8 text-center text-sm text-muted">
              Опишите, что нужно, и нажмите «Сгенерировать». У монстров бонусы атак, Сл и урон пересчитываются по правилам из характеристик и CR. Результат можно открыть в сборщике,
              сделать из него NPC, положить в магазин или в заготовки рыбалки.
            </div>
          )
        )}
      </div>

      {/* ===== История ===== */}
      <aside className="card flex max-h-[calc(100dvh-var(--header-h,49px)-2rem)] flex-col overflow-hidden xl:sticky xl:top-[calc(var(--header-h,49px)+1rem)]">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <span className="font-display text-lg text-accent">История</span>
          <select value={histFilter} onChange={(e) => setHistFilter(e.target.value as typeof histFilter)} className="input ml-auto py-1 text-xs" aria-label="Фильтр истории">
            <option value="all">все</option>
            <option value="star">★ избранное</option>
            {AI_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.icon} {k.label.toLowerCase()}
              </option>
            ))}
          </select>
          <button type="button" className="text-xs text-muted hover:text-text" title="Обновить" onClick={() => void aiHistory().then(setHistory)}>
            ⟳
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shownHistory.length === 0 && <li className="p-4 text-center text-sm text-muted">Пока пусто</li>}
          {shownHistory.map((c) => (
            <li key={c.id} className={`group flex items-center gap-2 border-b border-border px-3 py-2 text-sm ${current?.id === c.id ? "bg-panel-2" : "hover:bg-panel-2/60"}`}>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  open(c);
                  setKind(c.kind);
                  setVariants((v) => (v.some((x) => x.id === c.id) ? v : []));
                }}
              >
                <span className="block truncate">
                  {icon(c.kind)} {c.name}
                </span>
                <span className="block text-[11px] text-muted">
                  {entitySubtitle(c.entity)} · {new Date(c.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </button>
              <button
                type="button"
                className={c.starred ? "text-accent" : "text-muted opacity-60 hover:opacity-100"}
                onClick={() => void toggleStar(c)}
                title="Избранное не удаляется при чистке истории"
              >
                {c.starred ? "★" : "☆"}
              </button>
              <button type="button" className="text-muted opacity-0 hover:text-red-400 group-hover:opacity-100" onClick={() => void remove(c)} title="Удалить">
                ✕
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border p-2 text-[11px] text-muted">Хранятся последние 60 генераций; ★ избранное — всегда.</p>
      </aside>
    </div>
  );
}
