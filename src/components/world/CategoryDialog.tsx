"use client";

import { useEffect, useState, useTransition } from "react";
import { createCategory, deleteCategory, updateCategory } from "@/app/actions";
import { GroupTile, Icon } from "@/components/CategoryIcon";
import { COLORS, ICON_KEYS, ICON_LABELS, MAX_CATEGORY_NAME, type Category } from "@/lib/groups";

/**
 * Окно создания / правки своей категории: название, цвет и значок (с предпросмотром).
 * editing — правим существующую (есть кнопка «Удалить»), иначе создаём новую.
 * onCreated получает ключ новой категории.
 */
export function CategoryDialog({
  editing,
  onClose,
  onCreated,
}: {
  editing?: Category;
  onClose: () => void;
  onCreated?: (key: Category["key"]) => void;
}) {
  const [name, setName] = useState(editing?.label ?? "");
  const [color, setColor] = useState(editing?.color ?? COLORS[8].hex);
  const [icon, setIcon] = useState(editing?.icon ?? "star");
  const [pending, start] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const valid = name.trim() !== "";
  const editId = editing ? Number(editing.key.slice(1)) : null;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    start(async () => {
      if (editId !== null) await updateCategory(editId, name, color, icon);
      else {
        const key = await createCategory(name, color, icon);
        if (key) onCreated?.(key);
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-panel p-5 shadow-2xl" role="dialog" aria-label="Категория">
        <h2 className="font-display text-xl text-accent">{editing ? "Изменить категорию" : "Новая категория"}</h2>

        <div className="flex items-center gap-3">
          <GroupTile cat={{ color, icon }} size={52} />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_CATEGORY_NAME}
            placeholder="Название, например «Фракции»"
            className="input flex-1"
            autoFocus
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Цвет</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.hex}
                onClick={() => setColor(c.hex)}
                className="h-7 w-7 rounded-full transition hover:scale-110"
                style={{ backgroundColor: c.hex, boxShadow: color === c.hex ? `0 0 0 2px var(--color-panel, #1c1814), 0 0 0 4px ${c.hex}` : undefined }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">Значок</p>
          <div className="grid grid-cols-7 gap-1.5">
            {ICON_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                title={ICON_LABELS[k]}
                aria-label={ICON_LABELS[k]}
                aria-pressed={icon === k}
                onClick={() => setIcon(k)}
                className="flex h-10 items-center justify-center rounded-lg bg-panel-2 transition hover:bg-bg"
                style={icon === k ? { color, boxShadow: `0 0 0 2px ${color}` } : undefined}
              >
                <Icon name={k} size={22} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                confirm(`Удалить категорию «${editing.label}»? Закладки из неё перейдут в «Без категории».`) &&
                start(async () => {
                  await deleteCategory(editId!);
                  onClose();
                })
              }
            >
              Удалить
            </button>
          )}
          <span className="flex-1" />
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn btn-primary" disabled={!valid || pending}>
            {editing ? "Сохранить" : "Создать"}
          </button>
        </div>
      </form>
    </div>
  );
}
