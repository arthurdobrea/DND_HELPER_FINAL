/** Трекер боя: модель состояния и чистые операции над ним (без серверных зависимостей). */

export type Coins = { cp: number; sp: number; ep: number; gp: number; pp: number };
export type LootItem = { key: string; name: string; rarity: string | null; price: number | null };
/** Добыча с поверженного монстра: монеты, вещи из каталога и трофеи (части тела, мелочи). */
export type Loot = { coins: Coins; items: LootItem[]; trophies: string[] };

export type Combatant = {
  id: string;
  kind: "monster" | "hero" | "npc";
  name: string;
  /** Ключ монстра в каталоге (для монстров и NPC) — по нему открывается статблок. */
  refKey: string;
  /** id листа персонажа (герой или NPC) — для ссылки на лист; 0, если нет. */
  sheetId: number;
  init: number | null;
  dex: number;
  ac: number;
  hp: number;
  hpMax: number;
  conditions: string[];
  note: string;
  cr: number;
  type: string;
  loot: Loot | null;
};

export type Battle = {
  started: boolean;
  round: number;
  activeId: string | null;
  combatants: Combatant[];
};

export const emptyBattle = (): Battle => ({ started: false, round: 1, activeId: null, combatants: [] });

export const CONDITIONS = [
  "Ослеплён", "Очарован", "Оглох", "Напуган", "Схвачен", "Недееспособен", "Невидим", "Парализован",
  "Окаменел", "Отравлен", "Сбит с ног", "Скован", "Оглушён", "Без сознания", "Истощён", "Концентрация",
] as const;

export const isDown = (c: Combatant) => c.hp <= 0;

/** Порядок ходов: по инициативе (убывание), затем по ловкости, затем по имени. Без инициативы — в конце. */
export function ordered(list: Combatant[]): Combatant[] {
  return [...list].sort(
    (a, b) =>
      (b.init ?? -Infinity) - (a.init ?? -Infinity) ||
      b.dex - a.dex ||
      a.name.localeCompare(b.name, "ru"),
  );
}

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const d20 = (rand: () => number = Math.random) => 1 + Math.floor(rand() * 20);

/** Бросок инициативы: d20 + модификатор ловкости. only — кому бросать (по умолчанию тем, у кого её нет). */
export function rollInitiative(b: Battle, scope: "monsters" | "all", rand: () => number = Math.random): Battle {
  return {
    ...b,
    combatants: b.combatants.map((c) => {
      if (c.init !== null && scope === "monsters") return c;
      if (scope === "monsters" && c.kind === "hero") return c;
      return { ...c, init: d20(rand) + c.dex };
    }),
  };
}

/** Начало боя: первый в порядке хода из тех, кто на ногах. */
export function startBattle(b: Battle): Battle {
  const first = ordered(b.combatants).find((c) => !isDown(c)) ?? ordered(b.combatants)[0];
  return { ...b, started: true, round: 1, activeId: first?.id ?? null };
}

/** Следующий ход: пропускает павших; при переходе через конец списка начинается новый раунд. */
export function nextTurn(b: Battle): Battle {
  const list = ordered(b.combatants);
  if (list.length === 0) return b;
  const alive = list.filter((c) => !isDown(c));
  if (alive.length === 0) return b;
  const idx = list.findIndex((c) => c.id === b.activeId);
  for (let step = 1; step <= list.length; step++) {
    const raw = idx + step;
    const i = raw % list.length;
    // Прошли конец списка — начался новый раунд.
    if (!isDown(list[i])) return { ...b, round: b.round + Math.floor(raw / list.length), activeId: list[i].id };
  }
  return b;
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Имя с номером: «Goblin 1», «Goblin 2» — если таких в бою уже несколько или добавляется сразу несколько. */
export function numberedName(base: string, existing: Combatant[], addingMany: boolean): string {
  const same = existing.filter((c) => c.name === base || c.name.startsWith(`${base} `)).length;
  return addingMany || same > 0 ? `${base} ${same + 1}` : base;
}

/** Суммарные монеты в золотых. */
export const coinsToGp = (c: Coins) => c.cp / 100 + c.sp / 10 + c.ep / 2 + c.gp + c.pp * 10;

export const addCoins = (a: Coins, b: Coins): Coins => ({ cp: a.cp + b.cp, sp: a.sp + b.sp, ep: a.ep + b.ep, gp: a.gp + b.gp, pp: a.pp + b.pp });
export const noCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

export function coinsText(c: Coins): string {
  const parts = ([["pp", "пм"], ["gp", "зм"], ["ep", "эм"], ["sp", "см"], ["cp", "мм"]] as const)
    .filter(([k]) => c[k] > 0)
    .map(([k, l]) => `${c[k]} ${l}`);
  return parts.length ? parts.join(", ") : "—";
}

/** Приводит присланное клиентом состояние к безопасному виду (длины и типы). */
export function sanitizeBattle(raw: unknown): Battle {
  const b = (raw ?? {}) as Partial<Battle>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const coins = (c: Partial<Coins> | undefined): Coins => ({ cp: num(c?.cp), sp: num(c?.sp), ep: num(c?.ep), gp: num(c?.gp), pp: num(c?.pp) });
  const list = Array.isArray(b.combatants) ? b.combatants.slice(0, 60) : [];
  return {
    started: !!b.started,
    round: Math.max(1, Math.min(999, Math.floor(num(b.round, 1)))),
    activeId: typeof b.activeId === "string" ? b.activeId : null,
    combatants: list.map((c) => ({
      id: str(c.id, 20) || uid(),
      kind: c.kind === "hero" || c.kind === "npc" ? c.kind : "monster",
      name: str(c.name, 80) || "Без имени",
      refKey: str(c.refKey, 120),
      sheetId: Math.max(0, Math.floor(num(c.sheetId))),
      init: c.init === null || c.init === undefined ? null : Math.round(num(c.init)),
      dex: Math.round(num(c.dex)),
      ac: Math.max(0, Math.round(num(c.ac, 10))),
      hp: Math.max(-999, Math.round(num(c.hp))),
      hpMax: Math.max(1, Math.round(num(c.hpMax, 1))),
      conditions: (Array.isArray(c.conditions) ? c.conditions : []).map((x) => str(x, 30)).slice(0, 20),
      note: str(c.note, 300),
      cr: num(c.cr),
      type: str(c.type, 30),
      loot: c.loot
        ? {
            coins: coins(c.loot.coins),
            items: (Array.isArray(c.loot.items) ? c.loot.items : []).slice(0, 10).map((i) => ({
              key: str(i.key, 120),
              name: str(i.name, 120),
              rarity: i.rarity ? str(i.rarity, 20) : null,
              price: typeof i.price === "number" ? i.price : null,
            })),
            trophies: (Array.isArray(c.loot.trophies) ? c.loot.trophies : []).slice(0, 10).map((t) => str(t, 120)),
          }
        : null,
    })),
  };
}
