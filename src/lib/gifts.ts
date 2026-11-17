/**
 * Вещи, которые мастер дал герою из приложения игрока. Лежат очередью в DATA_DIR/tracker/gifts-<id>.json, пока приложение
 * их не заберёт (GET /api/sync/characters/<id> отдаёт очередь, POST …/gifts {taken} убирает забранные).
 * Отдельный файл, а не лист: игрок пишет лист каждые 4 с и затёр бы подарок, выданный между чтением и записью.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR } from "@/lib/config";
import type { Item } from "@/lib/catalog";

export type Gift = {
  id: string;
  name: string;
  qty: number;
  desc: string;
  weight: number;
  /** Цена в медных монетах (1 зм = 100); 0 — без цены. */
  costCp: number;
  /** weapon | armor | shield | consumable | magic | gear — категория вещи в приложении игрока. */
  category: string;
  attunement: boolean;
  damage: string;
  damageType: string;
  properties: string[];
};

const file = (heroId: number) => path.join(DATA_DIR, "tracker", `gifts-${heroId}.json`);

export function readGifts(heroId: number): Gift[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(heroId), "utf8"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeGifts(heroId: number, list: Gift[]) {
  fs.mkdirSync(path.dirname(file(heroId)), { recursive: true });
  const tmp = `${file(heroId)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, file(heroId));
}

/** Не больше стольких вещей в очереди: герой не в сети, а мастер жмёт «Дать» снова и снова. */
export const MAX_GIFTS = 50;

export function addGift(heroId: number, g: Omit<Gift, "id">): Gift | null {
  const list = readGifts(heroId);
  if (list.length >= MAX_GIFTS) return null;
  const gift = { ...g, id: randomUUID() };
  writeGifts(heroId, [...list, gift]);
  return gift;
}

export function dropGifts(heroId: number, ids: string[]) {
  const left = readGifts(heroId).filter((g) => !ids.includes(g.id));
  writeGifts(heroId, left);
}

const CATEGORY: Record<string, string> = {
  weapon: "weapon", armor: "armor", shield: "shield", tools: "tool",
  potion: "consumable", scroll: "consumable", ammunition: "consumable", poison: "consumable",
};

/** Вещь из каталога мастера в подарок. */
export function giftFromItem(i: Item, qty: number): Omit<Gift, "id"> {
  const cat = CATEGORY[i.category] ?? (i.weapon ? "weapon" : i.armor ? "armor" : i.magic ? "magic" : "gear");
  return {
    name: i.name,
    qty,
    desc: i.desc,
    weight: i.weight ?? 0,
    costCp: Math.round((i.price ?? 0) * 100),
    category: cat,
    attunement: i.attunement,
    damage: i.weapon?.damage ?? "",
    damageType: i.weapon?.damageType ?? "",
    properties: i.weapon?.properties.map((p) => p.name) ?? [],
  };
}

/** Своя вещь мастера: только имя, количество, описание и вес. */
export function customGift(name: string, qty: number, desc: string, weight: number, priceGp = 0): Omit<Gift, "id"> {
  return { name, qty, desc, weight, costCp: Math.round(Math.max(0, priceGp) * 100), category: "gear", attunement: false, damage: "", damageType: "", properties: [] };
}
