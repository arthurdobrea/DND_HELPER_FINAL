import type { Item } from "@/lib/catalog";
import { DAMAGE_TYPES, ITEM_CATEGORIES, RARITIES, label } from "@/lib/catalog/labels";
import { formatPrice } from "@/lib/catalog/items";
import { RichText } from "./RichText";

function Row({ k, v }: { k: string; v?: string | null }) {
  if (!v) return null;
  return (
    <p>
      <span className="font-bold text-[var(--sb-rule)]">{k}:</span> {v}
    </p>
  );
}

export function ItemCard({ i }: { i: Item }) {
  return (
    <article className="rounded-md bg-[var(--sb-bg)] p-5 text-[15px] leading-snug text-[var(--sb-text)] shadow-xl">
      <h2 className="font-display text-3xl font-bold text-[var(--sb-rule)]">{i.name}</h2>
      <p className="italic">
        {label(ITEM_CATEGORIES, i.category)}
        {i.rarity && `, ${label(RARITIES, i.rarity).toLowerCase()}`}
        {i.attunement && ` (требует настройки${i.attunementDetail ? ` ${i.attunementDetail}` : ""})`}
      </p>
      <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />
      <Row
        k="Цена"
        v={i.price !== null ? `${i.priceEstimated ? "≈ " : ""}${formatPrice(i.price)}${i.priceEstimated ? " (оценка по редкости, XGtE)" : ""}` : "—"}
      />
      <Row k="Вес" v={i.weight !== null ? `${i.weight} фнт.` : null} />
      {i.weapon && (
        <>
          <Row
            k="Урон"
            v={`${i.weapon.damage} ${label(DAMAGE_TYPES, i.weapon.damageType).toLowerCase()}`}
          />
          <Row k="Тип" v={i.weapon.kind === "martial" ? "Воинское оружие" : i.weapon.kind === "simple" ? "Простое оружие" : null} />
          <Row
            k="Свойства"
            v={i.weapon.properties.map((p) => (p.detail ? `${p.name} (${p.detail})` : p.name)).join(", ")}
          />
        </>
      )}
      {i.armor && (
        <>
          <Row k="КД" v={i.armor.ac} />
          <Row k="Категория" v={i.armor.category} />
          {i.armor.strength && <Row k="Требуется Сила" v={String(i.armor.strength)} />}
          {i.armor.stealthDisadvantage && <Row k="Скрытность" v="помеха" />}
        </>
      )}
      {i.desc && (
        <>
          <div className="my-2 h-[3px] bg-gradient-to-r from-[var(--sb-rule)] to-transparent" />
          <RichText text={i.desc} />
        </>
      )}
      <p className="mt-3 text-xs italic opacity-60">Источник: {i.source}</p>
    </article>
  );
}
