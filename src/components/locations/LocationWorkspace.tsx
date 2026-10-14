"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEvent,
  createLocation,
  deleteEvent,
  deleteLocation,
  setEventCharacter,
  setLocationCharacter,
  updateEvent,
  updateLocation,
} from "@/app/location-actions";
import { LOCATION_LIMITS, LOCATION_STATUS, type CharacterOption, type EventDto, type LocationDto, type LocationStatus } from "@/lib/locations";
import { CharacterPicker } from "./CharacterPicker";

type Props = { initialLocations: LocationDto[]; characters: CharacterOption[]; initialSelectedId: number | null };

const statusMeta = (s: LocationStatus) => LOCATION_STATUS.find((x) => x.key === s) ?? LOCATION_STATUS[0];

/** Повествование по локациям: слева список мест, справа — описание, кто там и лента событий. Всё сохраняется само. */
export function LocationWorkspace({ initialLocations, characters, initialSelectedId }: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LocationStatus | "all">("all");
  const [newName, setNewName] = useState("");

  const selected = locations.find((l) => l.id === selectedId) ?? null;
  const charName = useMemo(() => new Map(characters.map((c) => [c.id, c.name])), [characters]);

  function select(id: number | null) {
    setSelectedId(id);
    try {
      window.history.replaceState(null, "", id ? `?loc=${id}` : window.location.pathname);
    } catch {}
  }

  const patchLocation = (id: number, patch: Partial<LocationDto>) => setLocations((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  async function addLocation() {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    const loc = await createLocation(name);
    if (loc) {
      setLocations((ls) => [...ls, loc]);
      select(loc.id);
    }
  }

  async function removeLocation(l: LocationDto) {
    const extra = l.events.length ? ` и все её события (${l.events.length})` : "";
    if (!confirm(`Удалить локацию «${l.name}»${extra}? Сами персонажи не удаляются.`)) return;
    setLocations((ls) => ls.filter((x) => x.id !== l.id));
    if (selectedId === l.id) select(null);
    await deleteLocation(l.id);
  }

  const q = query.trim().toLowerCase();
  const list = locations.filter((l) => (filter === "all" || l.status === filter) && (!q || `${l.name} ${l.summary} ${l.events.map((e) => `${e.title} ${e.body}`).join(" ")}`.toLowerCase().includes(q)));

  return (
    <div className="mt-2 grid gap-4 lg:grid-cols-[20rem_1fr]">
      {/* Список локаций */}
      <aside className="space-y-2 lg:sticky lg:top-[calc(var(--header-h,49px)+1rem)] lg:self-start">
        <h1 className="font-display text-2xl text-accent">🗺️ Локации</h1>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void addLocation();
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={LOCATION_LIMITS.name} placeholder="Новая локация (озеро, таверна…)" className="input min-w-0 flex-1 text-sm" />
          <button className="btn btn-primary" disabled={!newName.trim()}>
            ＋
          </button>
        </form>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Поиск по локациям и событиям" className="input w-full py-1 text-sm" type="search" />
        <div className="flex flex-wrap gap-1">
          {([{ key: "all", label: "Все", icon: "" }, ...LOCATION_STATUS] as const).map((s) => (
            <button key={s.key} onClick={() => setFilter(s.key)} className={`rounded-md border px-2 py-0.5 text-xs ${filter === s.key ? "border-accent text-accent" : "border-border text-muted hover:text-text"}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <ul className="max-h-[70vh] space-y-1 overflow-y-auto">
          {list.map((l) => {
            const m = statusMeta(l.status);
            const planned = l.events.filter((e) => !e.happened).length;
            return (
              <li key={l.id}>
                <button
                  onClick={() => select(l.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${l.id === selectedId ? "border-accent bg-panel-2" : "border-border bg-panel hover:border-accent"}`}
                >
                  <div className="flex items-center gap-2">
                    <span title={m.label}>{m.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    {planned > 0 && (
                      <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent" title="Событий впереди">
                        {planned}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {l.events.length} соб. · {l.characterIds.length} перс.
                    {l.characterIds.length > 0 && ` · ${l.characterIds.slice(0, 3).map((id) => charName.get(id) ?? "?").join(", ")}`}
                  </div>
                </button>
              </li>
            );
          })}
          {list.length === 0 && <li className="p-2 text-sm text-muted">{locations.length === 0 ? "Локаций пока нет — добавьте первую выше." : "Ничего не найдено"}</li>}
        </ul>
      </aside>

      {/* Выбранная локация */}
      <section className="min-w-0">
        {selected ? (
          <LocationView key={selected.id} location={selected} characters={characters} onPatch={(p) => patchLocation(selected.id, p)} onDelete={() => removeLocation(selected)} />
        ) : (
          <div className="card p-6 text-center text-muted">
            <p className="font-display text-xl text-accent">Выберите или создайте локацию</p>
            <p className="mt-2 text-sm">Например, «Озеро Белых Теней»: опишите место, добавьте тех, кто там живёт, и записывайте события по мере сессии.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function LocationView({ location, characters, onPatch, onDelete }: { location: LocationDto; characters: CharacterOption[]; onPatch: (p: Partial<LocationDto>) => void; onDelete: () => void }) {
  const [hideDone, setHideDone] = useState(false);
  const [title, setTitle] = useState("");
  const [session, setSession] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  // Переход по ссылке #event-N с листа персонажа: прокручиваем к событию.
  useEffect(() => {
    const m = /^#event-(\d+)$/.exec(window.location.hash);
    if (m) document.getElementById(`event-${m[1]}`)?.scrollIntoView({ block: "center" });
  }, []);

  const patchEvent = (id: number, p: Partial<EventDto>) => onPatch({ events: location.events.map((e) => (e.id === id ? { ...e, ...p } : e)) });

  async function addEvent() {
    const t = title.trim();
    if (!t) return;
    setTitle("");
    const ev = await createEvent(location.id, t, session);
    if (ev) onPatch({ events: [...location.events, ev] });
    titleRef.current?.focus();
  }

  const m = statusMeta(location.status);
  const events = hideDone ? location.events.filter((e) => !e.happened) : location.events;
  const done = location.events.filter((e) => e.happened).length;

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={location.name}
            maxLength={LOCATION_LIMITS.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            onBlur={() => void updateLocation(location.id, { name: location.name })}
            className="input min-w-0 flex-1 font-display text-2xl text-accent"
          />
          <button className="btn btn-danger" onClick={onDelete} title="Удалить локацию">
            🗑
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {LOCATION_STATUS.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                onPatch({ status: s.key });
                void updateLocation(location.id, { status: s.key });
              }}
              className="rounded-md border px-2.5 py-1 text-sm"
              style={location.status === s.key ? { borderColor: s.color, color: s.color, backgroundColor: `${s.color}1f` } : undefined}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <textarea
          value={location.summary}
          maxLength={LOCATION_LIMITS.summary}
          onChange={(e) => onPatch({ summary: e.target.value })}
          onBlur={() => void updateLocation(location.id, { summary: location.summary })}
          rows={4}
          placeholder={`Что видят герои, атмосфера, общая канва: «${m.label}»…`}
          className="input w-full resize-y text-sm"
        />
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Кто здесь</div>
          <CharacterPicker
            options={characters}
            selectedIds={location.characterIds}
            onToggle={(id, on) => {
              onPatch({ characterIds: on ? [...location.characterIds, id] : location.characterIds.filter((x) => x !== id) });
              void setLocationCharacter(location.id, id, on);
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl text-accent">События</h2>
          <span className="text-sm text-muted">
            {done} из {location.events.length} произошло
          </span>
          {done > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-1 text-sm text-muted">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> скрыть произошедшие
            </label>
          )}
        </div>

        <form
          className="flex flex-wrap gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void addEvent();
          }}
        >
          <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LOCATION_LIMITS.eventTitle} placeholder="Новое событие — название и Enter (засада, находка, разговор…)" className="input min-w-0 flex-1 basis-64" />
          <input value={session} onChange={(e) => setSession(e.target.value)} maxLength={LOCATION_LIMITS.session} placeholder="Сессия" className="input w-28" />
          <button className="btn btn-primary" disabled={!title.trim()}>
            ＋ Событие
          </button>
        </form>

        {events.length === 0 && <p className="card p-4 text-sm text-muted">{location.events.length === 0 ? "Событий пока нет. Записывайте всё, что может случиться или уже случилось в этом месте." : "Все события уже произошли."}</p>}

        {events.map((ev) => (
          <EventCard key={ev.id} ev={ev} characters={characters} onPatch={(p) => patchEvent(ev.id, p)} onDelete={() => {
            if (!confirm(`Удалить событие «${ev.title || "Без названия"}»?`)) return;
            onPatch({ events: location.events.filter((x) => x.id !== ev.id) });
            void deleteEvent(ev.id);
          }} />
        ))}
      </div>
    </div>
  );
}

function EventCard({ ev, characters, onPatch, onDelete }: { ev: EventDto; characters: CharacterOption[]; onPatch: (p: Partial<EventDto>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(!ev.happened);
  return (
    <div id={`event-${ev.id}`} className={`card space-y-2 p-3 ${ev.happened ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm" title="Событие произошло">
          <input
            type="checkbox"
            checked={ev.happened}
            className="h-4 w-4"
            onChange={(e) => {
              onPatch({ happened: e.target.checked });
              void updateEvent(ev.id, { happened: e.target.checked });
              if (e.target.checked) setOpen(false);
            }}
          />
        </label>
        <input
          value={ev.title}
          maxLength={LOCATION_LIMITS.eventTitle}
          onChange={(e) => onPatch({ title: e.target.value })}
          onBlur={() => void updateEvent(ev.id, { title: ev.title })}
          placeholder="Название события"
          className={`input min-w-0 flex-1 basis-48 font-medium ${ev.happened ? "line-through decoration-muted" : ""}`}
        />
        <input
          value={ev.session}
          maxLength={LOCATION_LIMITS.session}
          onChange={(e) => onPatch({ session: e.target.value })}
          onBlur={() => void updateEvent(ev.id, { session: ev.session })}
          placeholder="Сессия"
          className="input w-24 text-sm"
        />
        <button className="btn" onClick={() => setOpen((v) => !v)} title={open ? "Свернуть" : "Развернуть"}>
          {open ? "▴" : "▾"}
        </button>
        <button className="btn btn-danger" onClick={onDelete} title="Удалить событие">
          🗑
        </button>
      </div>
      {open ? (
        <>
          <textarea
            value={ev.body}
            maxLength={LOCATION_LIMITS.eventBody}
            onChange={(e) => onPatch({ body: e.target.value })}
            onBlur={() => void updateEvent(ev.id, { body: ev.body })}
            rows={5}
            placeholder="Что происходит, что сказать игрокам, чем закончилось…"
            className="input w-full resize-y text-sm"
          />
        </>
      ) : (
        ev.body && <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{ev.body}</p>
      )}
      <CharacterPicker
        options={characters}
        selectedIds={ev.characterIds}
        label="＋ Участник"
        onToggle={(id, on) => {
          onPatch({ characterIds: on ? [...ev.characterIds, id] : ev.characterIds.filter((x) => x !== id) });
          void setEventCharacter(ev.id, id, on);
        }}
      />
    </div>
  );
}
