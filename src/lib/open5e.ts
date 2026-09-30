/** Клиент к Open5e API (https://api.open5e.com) — бесплатно, без ключа. */

const BASE = "https://api.open5e.com/v1";

export type NamedDesc = { name: string; desc: string };

export type Monster = {
  slug: string;
  name: string;
  desc?: string;
  size: string;
  type: string;
  subtype?: string;
  alignment?: string;
  armor_class: number;
  armor_desc?: string | null;
  hit_points: number;
  hit_dice?: string;
  speed: Record<string, number | boolean>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save?: number | null;
  dexterity_save?: number | null;
  constitution_save?: number | null;
  intelligence_save?: number | null;
  wisdom_save?: number | null;
  charisma_save?: number | null;
  skills?: Record<string, number>;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  challenge_rating: string;
  cr: number;
  actions?: NamedDesc[] | null;
  bonus_actions?: NamedDesc[] | null;
  reactions?: NamedDesc[] | null;
  legendary_desc?: string;
  legendary_actions?: NamedDesc[] | null;
  special_abilities?: NamedDesc[] | null;
  spell_list?: string[];
  img_main?: string | null;
  document__slug?: string;
  document__title?: string;
};

export async function getMonster(slug: string): Promise<Monster | null> {
  const res = await fetch(`${BASE}/monsters/${encodeURIComponent(slug)}/`, { next: { revalidate: 86400 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open5e: ${res.status} ${res.statusText}`);
  return (await res.json()) as Monster;
}

export function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function formatSpeed(speed: Monster["speed"]): string {
  return Object.entries(speed ?? {})
    .filter(([k, v]) => k !== "hover" && typeof v === "number")
    .map(([k, v]) => (k === "walk" ? `${v} фт.` : `${k} ${v} фт.`))
    .join(", ");
}
