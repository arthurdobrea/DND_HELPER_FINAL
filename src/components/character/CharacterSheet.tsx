"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { deleteCharacter, saveCharacter } from "@/app/actions";
import { SpellChips } from "@/components/SpellChips";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILLS,
  applyDamage,
  applyHeal,
  initiative,
  mod,
  passivePerception,
  profBonus,
  saveBonus,
  signed,
  skillBonus,
  spellStats,
  type AbilityKey,
  type CharacterSheet as Sheet,
  type Proficiency,
} from "@/lib/character";
import { Stepper } from "./Stepper";

type Status = "saved" | "dirty" | "saving" | "error";

// ---------- Мелкие строительные блоки листа ----------

function Box({ label, children, className = "", labelTop = false }: { label: string; children: ReactNode; className?: string; labelTop?: boolean }) {
  return (
    <div className={`sheet-box flex flex-col p-1.5 ${className}`}>
      {labelTop && <span className="sheet-label mb-1 !text-[7.5px] !tracking-tight">{label}</span>}
      {children}
      {!labelTop && <span className="sheet-label mt-1 !text-[7.5px] !tracking-tight">{label}</span>}
    </div>
  );
}

function Field({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="sheet-input text-[12px]" />
      <span className="sheet-label !text-left">{label}</span>
    </label>
  );
}

function Area({ label, value, onChange, className = "", rows = 3 }: { label: string; value: string; onChange: (v: string) => void; className?: string; rows?: number }) {
  return (
    <div className={`sheet-box flex flex-col p-1.5 ${className}`}>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="sheet-area" />
      <span className="sheet-label mt-1">{label}</span>
    </div>
  );
}

/** Кружок владения: ○ нет → ● владение → ◉ компетентность (только для навыков). */
function ProfDot({ value, onChange, allowExpertise }: { value: Proficiency; onChange: (v: Proficiency) => void; allowExpertise: boolean }) {
  const next = (((value + 1) % (allowExpertise ? 3 : 2)) as Proficiency);
  return (
    <button
      type="button"
      className="sheet-dot"
      title={["Нет владения", "Владение", "Компетентность"][value]}
      onClick={() => onChange(next)}
    >
      {value > 0 && <span className={`rounded-full bg-[#3b2f22] ${value === 2 ? "h-1.5 w-1.5 ring-2 ring-[#3b2f22] ring-offset-1 ring-offset-[var(--sb-bg)]" : "h-1.5 w-1.5"}`} />}
    </button>
  );
}

/** Ряд из N кружков: закрашено count. Клик по кружку i ставит i+1 (повторный — снимает). */
function DotRow({ total, count, onChange, color = "#3b2f22" }: { total: number; count: number; onChange: (n: number) => void; color?: string }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          type="button"
          className="sheet-dot"
          style={{ borderColor: color, background: i < count ? color : undefined }}
          onClick={() => onChange(i + 1 === count ? i : i + 1)}
        />
      ))}
    </div>
  );
}

// ---------- Лист ----------

export function CharacterSheet({
  id,
  initial,
  backHref = "/characters",
  backLabel = "← Партия",
  noun = "персонажа",
  refreshOnSpells = false,
}: {
  id: number;
  initial: Sheet;
  /** Куда ведёт кнопка «назад» (для NPC — список NPC). */
  backHref?: string;
  backLabel?: string;
  noun?: string;
  /** После сохранения, если изменились заклинания, обновить страницу — боковые карточки магии пересоберутся. */
  refreshOnSpells?: boolean;
}) {
  const [sheet, setSheet] = useState(initial);
  const [status, setStatus] = useState<Status>("saved");
  const [hpAmount, setHpAmount] = useState("");
  const [deleting, startDelete] = useTransition();
  const sheetRef = useRef(initial);
  const router = useRouter();
  const lastSpells = useRef(JSON.stringify([initial.spells, initial.slots.map((x) => x.max)]));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);

  function flush() {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    const data = sheetRef.current;
    setStatus("saving");
    const spellsKey = JSON.stringify([data.spells, data.slots.map((x) => x.max)]);
    saveCharacter(id, data)
      .then(() => {
        setStatus(dirty.current ? "dirty" : "saved");
        if (refreshOnSpells && spellsKey !== lastSpells.current) {
          lastSpells.current = spellsKey;
          router.refresh();
        }
      })
      .catch(() => setStatus("error"));
  }

  function update(fn: (s: Sheet) => Sheet) {
    const next = fn(sheetRef.current);
    sheetRef.current = next;
    setSheet(next);
    dirty.current = true;
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  const set = <K extends keyof Sheet>(k: K, v: Sheet[K]) => update((s) => ({ ...s, [k]: v }));
  const setAbility = (a: AbilityKey, v: number) => update((s) => ({ ...s, abilities: { ...s.abilities, [a]: v } }));

  // Несохранённые правки уходят на сервер при уходе со страницы.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer.current);
      if (dirty.current) saveCharacter(id, sheetRef.current);
    };
  }, [id]);

  const pb = profBonus(sheet);
  const spell = spellStats(sheet);
  const hpPct = sheet.hpMax > 0 ? Math.max(0, Math.min(100, (sheet.hpCurrent / sheet.hpMax) * 100)) : 0;
  const amount = Math.max(0, parseInt(hpAmount, 10) || 0);

  return (
    <div className="flex flex-col items-center gap-6 pb-10">
      {/* ---------- Панель действий ---------- */}
      <div className="no-print sticky top-[var(--header-h,49px)] z-10 flex w-full items-center gap-3 border-b border-border bg-bg/95 px-4 py-2 text-sm backdrop-blur">
        <Link href={backHref} className="btn">
          {backLabel}
        </Link>
        <span className="font-display text-lg text-accent">{sheet.name || "Без имени"}</span>
        <span className={`text-xs ${status === "error" ? "text-red-400" : "text-muted"}`}>
          {{ saved: "✓ Сохранено", dirty: "● Изменено…", saving: "Сохраняю…", error: "Ошибка сохранения" }[status]}
        </span>
        <span className="ml-auto hidden text-xs text-muted lg:inline">Shift+клик по −/+ — шаг ×5</span>
        <button className="btn" onClick={() => window.print()}>
          🖨 Печать / PDF
        </button>
        <button
          className="btn btn-danger"
          disabled={deleting}
          onClick={() => confirm(`Удалить ${noun} «${sheet.name}»?`) && startDelete(() => deleteCharacter(id))}
        >
          🗑
        </button>
      </div>

      <div className="w-full overflow-x-auto px-4">
        <div className="mx-auto flex w-max flex-col gap-6">
          {/* =================== СТРАНИЦА 1 =================== */}
          <section className="sheet-page">
            {/* Шапка */}
            <div className="flex gap-3">
              <div className="flex w-[36%] flex-col justify-end">
                <input
                  value={sheet.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Имя персонажа"
                  className="sheet-input font-display text-2xl font-bold"
                />
                <span className="sheet-label !text-left">Имя персонажа</span>
              </div>
              <div className="sheet-box grid flex-1 grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2">
                <div className="flex items-end gap-1">
                  <Field label="Класс" value={sheet.className} onChange={(v) => set("className", v)} className="flex-1" />
                  <div>
                    <Stepper value={sheet.level} onChange={(v) => set("level", v)} min={1} max={20} inputClass="w-6 text-sm" />
                    <span className="sheet-label">Уровень</span>
                  </div>
                </div>
                <Field label="Предыстория" value={sheet.background} onChange={(v) => set("background", v)} />
                <Field label="Имя игрока" value={sheet.playerName} onChange={(v) => set("playerName", v)} />
                <Field label="Раса" value={sheet.race} onChange={(v) => set("race", v)} />
                <Field label="Мировоззрение" value={sheet.alignment} onChange={(v) => set("alignment", v)} />
                <label className="block">
                  <input
                    inputMode="numeric"
                    value={sheet.xp}
                    onChange={(e) => set("xp", Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="sheet-input text-[12px]"
                  />
                  <span className="sheet-label !text-left">Опыт</span>
                </label>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
              {/* ---------- Колонка 1: характеристики, спасброски, навыки ---------- */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="flex w-[64px] shrink-0 flex-col gap-1.5">
                    {ABILITY_KEYS.map((a) => (
                      <div key={a} className="sheet-box flex flex-col items-center px-0.5 pt-1 pb-1">
                        <span className="sheet-label !text-[7.5px] !tracking-normal">{ABILITY_LABELS[a].full}</span>
                        <span className="font-display text-2xl leading-none font-bold">{signed(mod(sheet.abilities[a]))}</span>
                        <Stepper
                          value={sheet.abilities[a]}
                          onChange={(v) => setAbility(a, v)}
                          min={1}
                          max={30}
                          inputClass="w-6 text-xs rounded-full border border-[#8a7a66]"
                          className="mt-0.5"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="sheet-box flex items-center gap-2 px-2 py-1">
                      <button
                        type="button"
                        className="sheet-dot !h-5 !w-5"
                        onClick={() => set("inspiration", !sheet.inspiration)}
                        title="Вдохновение"
                      >
                        {sheet.inspiration && <span className="text-[11px]">★</span>}
                      </button>
                      <span className="sheet-label">Вдохновение</span>
                    </div>
                    <div className="sheet-box flex items-center gap-1 px-2 py-1">
                      <Stepper
                        value={pb}
                        onChange={(v) => set("profBonusOverride", v)}
                        min={0}
                        max={10}
                        inputClass="w-6 text-sm"
                        title="Считается по уровню; можно поправить вручную"
                      />
                      <span className="sheet-label flex-1 !text-left">Бонус мастерства</span>
                      {sheet.profBonusOverride !== null && (
                        <button type="button" className="text-[9px] text-[var(--sb-rule)] underline print:hidden" onClick={() => set("profBonusOverride", null)}>
                          авто
                        </button>
                      )}
                    </div>

                    <div className="sheet-box px-2 py-1.5">
                      {ABILITY_KEYS.map((a) => (
                        <div key={a} className="flex items-center gap-1.5 text-[11px]">
                          <ProfDot
                            value={sheet.saves[a] ? 1 : 0}
                            onChange={(v) => update((s) => ({ ...s, saves: { ...s.saves, [a]: v > 0 } }))}
                            allowExpertise={false}
                          />
                          <span className="w-6 border-b border-[#8a7a66] text-center font-bold">{signed(saveBonus(sheet, a))}</span>
                          <span>{ABILITY_LABELS[a].full}</span>
                        </div>
                      ))}
                      <span className="sheet-label mt-1">Спасброски</span>
                    </div>

                    <div className="sheet-box px-2 py-1.5">
                      {SKILLS.map((sk) => (
                        <div key={sk.key} className="flex items-center gap-1 text-[10.5px] leading-[1.4]">
                          <ProfDot
                            value={sheet.skills[sk.key]}
                            onChange={(v) => update((s) => ({ ...s, skills: { ...s.skills, [sk.key]: v } }))}
                            allowExpertise
                          />
                          <span className="w-5 shrink-0 border-b border-[#8a7a66] text-center font-bold">{signed(skillBonus(sheet, sk.key))}</span>
                          <span className="min-w-0 flex-1 truncate" title={`${sk.label} (${ABILITY_LABELS[sk.ability].full})`}>
                            {sk.label}
                          </span>
                        </div>
                      ))}
                      <span className="sheet-label mt-1">Навыки</span>
                    </div>
                  </div>
                </div>

                <div className="sheet-box flex items-center gap-2 px-2 py-1.5">
                  <span className="w-9 rounded-full border-[1.5px] border-[#3b2f22] text-center font-display text-lg font-bold">
                    {passivePerception(sheet)}
                  </span>
                  <span className="sheet-label !text-left">Пассивная мудрость (внимательность)</span>
                </div>
                <Area label="Прочие владения и языки" value={sheet.proficiencies} onChange={(v) => set("proficiencies", v)} rows={9} className="flex-1" />
              </div>

              {/* ---------- Колонка 2: бой ---------- */}
              <div className="flex flex-col gap-2">
                <div className="sheet-box grid grid-cols-3 gap-1.5 bg-[#3b2f22]/5 p-1.5">
                  <Box label="Класс доспеха">
                    <Stepper value={sheet.ac} onChange={(v) => set("ac", v)} min={0} max={40} inputClass="w-8 font-display text-xl" />
                  </Box>
                  <Box label="Инициатива">
                    <div className="text-center font-display text-xl font-bold">{signed(initiative(sheet))}</div>
                    <Stepper
                      value={sheet.initiativeBonus}
                      onChange={(v) => set("initiativeBonus", v)}
                      inputClass="w-5 text-[10px]"
                      title="Доп. бонус к инициативе (помимо ЛОВ)"
                    />
                  </Box>
                  <Box label="Скорость">
                    <Stepper value={sheet.speed} onChange={(v) => set("speed", v)} min={0} step={5} inputClass="w-8 font-display text-xl" />
                  </Box>

                  <div className="sheet-box col-span-3 p-2">
                    <div className="flex items-center justify-between gap-2 text-[10px] text-[#5a4a38]">
                      <span className="font-bold uppercase">Максимум хитов</span>
                      <Stepper value={sheet.hpMax} onChange={(v) => set("hpMax", v)} min={1} inputClass="w-9 text-sm" />
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#3b2f22]/15 print:hidden">
                      <div
                        className={`h-full ${hpPct > 50 ? "bg-green-700" : hpPct > 25 ? "bg-amber-600" : "bg-red-700"}`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    <Stepper
                      value={sheet.hpCurrent}
                      onChange={(v) => set("hpCurrent", v)}
                      min={0}
                      max={sheet.hpMax}
                      inputClass="w-16 font-display text-4xl"
                      className="my-1"
                    />
                    <div className="flex items-center justify-center gap-1 print:hidden">
                      <input
                        value={hpAmount}
                        onChange={(e) => setHpAmount(e.target.value.replace(/\D/g, ""))}
                        placeholder="кол-во"
                        className="sheet-input w-14 text-center text-[11px]"
                      />
                      <button
                        type="button"
                        className="rounded border border-red-800 px-2 py-0.5 text-[10px] font-bold text-red-800 hover:bg-red-800 hover:text-white"
                        disabled={!amount}
                        onClick={() => {
                          update((s) => applyDamage(s, amount));
                          setHpAmount("");
                        }}
                      >
                        Урон
                      </button>
                      <button
                        type="button"
                        className="rounded border border-green-800 px-2 py-0.5 text-[10px] font-bold text-green-800 hover:bg-green-800 hover:text-white"
                        disabled={!amount}
                        onClick={() => {
                          update((s) => applyHeal(s, amount));
                          setHpAmount("");
                        }}
                      >
                        Лечение
                      </button>
                    </div>
                    <span className="sheet-label mt-1">Текущие хиты</span>
                  </div>
                  <Box label="Временные хиты" className="col-span-3">
                    <Stepper value={sheet.hpTemp} onChange={(v) => set("hpTemp", v)} min={0} inputClass="w-10 font-display text-xl" />
                  </Box>

                  <Box label="Кости хитов" className="col-span-1">
                    <input value={sheet.hitDice} onChange={(e) => set("hitDice", e.target.value)} className="sheet-input text-center text-[12px] font-bold" />
                    <div className="mt-1 text-center text-[8px] text-[#5a4a38]">потрачено</div>
                    <Stepper value={sheet.hitDiceUsed} onChange={(v) => set("hitDiceUsed", v)} min={0} max={sheet.level} inputClass="w-4 text-xs" />
                  </Box>
                  <Box label="Спасброски от смерти" className="col-span-2">
                    <div className="flex flex-col items-end gap-1 pr-1 text-[9px] font-bold uppercase text-[#5a4a38]">
                      <div className="flex items-center gap-2">
                        Успехи <DotRow total={3} count={sheet.deathSuccess} onChange={(n) => set("deathSuccess", n)} color="#166534" />
                      </div>
                      <div className="flex items-center gap-2">
                        Провалы <DotRow total={3} count={sheet.deathFail} onChange={(n) => set("deathFail", n)} color="#991b1b" />
                      </div>
                    </div>
                  </Box>
                </div>

                {/* Атаки */}
                <div className="sheet-box p-1.5">
                  <div className="grid grid-cols-[1fr_44px_1fr_14px] gap-1 text-[8px] font-bold uppercase text-[#5a4a38]">
                    <span>Название</span>
                    <span className="text-center">Бонус</span>
                    <span>Урон / вид</span>
                    <span />
                  </div>
                  {sheet.attacks.map((a, i) => (
                    <div key={i} className="grid grid-cols-[1fr_44px_1fr_14px] items-center gap-1">
                      {(["name", "bonus", "damage"] as const).map((k) => (
                        <input
                          key={k}
                          value={a[k]}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              attacks: s.attacks.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)),
                            }))
                          }
                          className={`sheet-input text-[11px] ${k === "bonus" ? "text-center" : ""}`}
                        />
                      ))}
                      <button
                        type="button"
                        className="text-[10px] text-[#8a7a66] hover:text-red-700 print:hidden"
                        onClick={() => update((s) => ({ ...s, attacks: s.attacks.filter((_, j) => j !== i) }))}
                        title="Убрать"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="mt-1 text-[10px] text-[var(--sb-rule)] hover:underline print:hidden"
                    onClick={() => update((s) => ({ ...s, attacks: [...s.attacks, { name: "", bonus: "", damage: "" }] }))}
                  >
                    ＋ атака
                  </button>
                  <span className="sheet-label mt-1">Атаки и заклинания</span>
                </div>

                {/* Снаряжение + монеты */}
                <div className="sheet-box flex flex-1 gap-1.5 p-1.5">
                  <div className="flex flex-col gap-1">
                    {(["cp", "sp", "ep", "gp", "pp"] as const).map((c) => (
                      <div key={c} className="rounded border border-[#8a7a66] px-0.5 py-0.5 text-center">
                        <div className="text-[8px] font-bold text-[#5a4a38]">{{ cp: "ММ", sp: "СМ", ep: "ЭМ", gp: "ЗМ", pp: "ПМ" }[c]}</div>
                        <Stepper
                          value={sheet.coins[c]}
                          onChange={(v) => update((s) => ({ ...s, coins: { ...s.coins, [c]: v } }))}
                          min={0}
                          inputClass="w-8 text-[11px]"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <textarea value={sheet.equipment} onChange={(e) => set("equipment", e.target.value)} className="sheet-area" />
                    <span className="sheet-label mt-1">Снаряжение</span>
                  </div>
                </div>
              </div>

              {/* ---------- Колонка 3: личность и умения ---------- */}
              <div className="flex flex-col gap-2">
                <div className="sheet-box flex flex-col gap-1.5 bg-[#3b2f22]/5 p-1.5">
                  <Area label="Черты характера" value={sheet.personality} onChange={(v) => set("personality", v)} />
                  <Area label="Мотивация" value={sheet.motivation} onChange={(v) => set("motivation", v)} rows={2} />
                  <Area label="Идеалы" value={sheet.ideals} onChange={(v) => set("ideals", v)} rows={2} />
                  <Area label="Привязанности" value={sheet.bonds} onChange={(v) => set("bonds", v)} rows={2} />
                  <Area label="Слабости" value={sheet.flaws} onChange={(v) => set("flaws", v)} rows={2} />
                </div>
                <Area label="Умения и особенности" value={sheet.features} onChange={(v) => set("features", v)} className="flex-1" rows={20} />
              </div>
            </div>
          </section>

          {/* =================== СТРАНИЦА 2: заклинания и история =================== */}
          <section className="sheet-page">
            <div className="flex gap-3">
              <div className="flex w-[36%] flex-col justify-end">
                <div className="sheet-input font-display text-2xl font-bold">{sheet.name || " "}</div>
                <span className="sheet-label !text-left">Имя персонажа</span>
              </div>
              <div className="sheet-box grid flex-1 grid-cols-4 items-end gap-3 px-3 py-2">
                <Field label="Класс заклинателя" value={sheet.spellClass} onChange={(v) => set("spellClass", v)} />
                <label className="block">
                  <select
                    value={sheet.spellAbility}
                    onChange={(e) => set("spellAbility", e.target.value as AbilityKey | "")}
                    className="sheet-input text-[12px]"
                  >
                    <option value="">—</option>
                    {ABILITY_KEYS.map((a) => (
                      <option key={a} value={a}>
                        {ABILITY_LABELS[a].full}
                      </option>
                    ))}
                  </select>
                  <span className="sheet-label !text-left">Базовая характеристика</span>
                </label>
                <div className="text-center">
                  <div className="font-display text-xl font-bold">{spell ? spell.dc : "—"}</div>
                  <span className="sheet-label">Сл спасброска</span>
                </div>
                <div className="text-center">
                  <div className="font-display text-xl font-bold">{spell ? signed(spell.attack) : "—"}</div>
                  <span className="sheet-label">Бонус атаки</span>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
              <div className="sheet-box col-span-1 flex flex-col p-1.5">
                <div className="flex items-center gap-2 border-b border-[#8a7a66] pb-1">
                  <span className="w-6 rounded bg-[#3b2f22] text-center font-display font-bold text-[var(--sb-bg)]">0</span>
                  <span className="sheet-label">Заговоры</span>
                </div>
                <textarea
                  value={sheet.spells[0]}
                  onChange={(e) => update((s) => ({ ...s, spells: s.spells.map((x, j) => (j === 0 ? e.target.value : x)) }))}
                  rows={8}
                  className="sheet-area"
                />
                <SpellChips text={sheet.spells[0]} />
              </div>
              {sheet.slots.map((slot, i) => {
                const lvl = i + 1;
                return (
                  <div key={lvl} className={`sheet-box flex flex-col p-1.5 ${lvl === 9 ? "col-span-2" : ""}`}>
                    <div className="flex items-center gap-2 border-b border-[#8a7a66] pb-1">
                      <span className="w-6 rounded bg-[#3b2f22] text-center font-display font-bold text-[var(--sb-bg)]">{lvl}</span>
                      <div className="flex flex-col items-center">
                        <Stepper
                          value={slot.max}
                          onChange={(v) =>
                            update((s) => ({
                              ...s,
                              slots: s.slots.map((x, j) => (j === i ? { max: v, used: Math.min(x.used, v) } : x)),
                            }))
                          }
                          min={0}
                          max={9}
                          inputClass="w-4 text-xs"
                        />
                        <span className="text-[7px] font-bold uppercase text-[#5a4a38]">ячеек</span>
                      </div>
                      <div className="ml-auto flex flex-col items-end">
                        {slot.max > 0 && (
                          <DotRow
                            total={slot.max}
                            count={slot.used}
                            onChange={(n) =>
                              update((s) => ({ ...s, slots: s.slots.map((x, j) => (j === i ? { ...x, used: n } : x)) }))
                            }
                            color="#9c2b23"
                          />
                        )}
                        <span className="text-[7px] font-bold uppercase text-[#5a4a38]">потрачено</span>
                      </div>
                    </div>
                    <textarea
                      value={sheet.spells[lvl]}
                      onChange={(e) =>
                        update((s) => ({ ...s, spells: s.spells.map((x, j) => (j === lvl ? e.target.value : x)) }))
                      }
                      rows={lvl <= 3 ? 8 : 5}
                      className="sheet-area"
                    />
                    <SpellChips text={sheet.spells[lvl]} />
                  </div>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Area label="Внешность" value={sheet.appearance} onChange={(v) => set("appearance", v)} rows={5} />
              <Area label="Союзники и организации" value={sheet.allies} onChange={(v) => set("allies", v)} rows={5} />
              <Area label="Предыстория персонажа" value={sheet.backstory} onChange={(v) => set("backstory", v)} rows={7} />
              <Area label="Сокровища" value={sheet.treasure} onChange={(v) => set("treasure", v)} rows={7} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
