import { useEffect, useRef, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import {
  deleteSaved,
  filterSaved,
  setPinned,
  sortSaved,
  subscribeSaved,
  type SavedFilter,
  type SavedItem,
} from "../../lib/saved";
import { attachmentMediaUrl } from "../../lib/cloudinary";
import { splitLinks } from "../chat/linkify";
import { formatDayLabel } from "../chat/time";

interface SavedViewProps {
  user: User;
  onBack?: () => void;
}

const FILTERS: { key: SavedFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "messages", label: "Mensajes" },
  { key: "links", label: "Links" },
  { key: "pinned", label: "Fijados" },
];

export function SavedView({ user, onBack }: SavedViewProps) {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [filter, setFilter] = useState<SavedFilter>("all");

  useEffect(() => {
    return subscribeSaved(user.uid, setItems);
  }, [user.uid]);

  const visible = sortSaved(filterSaved(items, filter));
  const pinnedCount = items.filter((i) => i.pinned).length;
  const [menuItem, setMenuItem] = useState<SavedItem | null>(null);

  async function handleDelete(item: SavedItem) {
    try {
      await deleteSaved(user.uid, item.id);
    } catch {
      // ignora errores de eliminación
    }
  }

  async function handlePin(item: SavedItem, pinned: boolean) {
    try {
      await setPinned(user.uid, item.id, pinned);
    } catch {
      // ignora
    }
  }

  async function copySaved(item: SavedItem) {
    try {
      await navigator.clipboard.writeText(item.text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = item.text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  return (
    <div class="mx-auto w-full max-w-2xl">
      <header class="mb-4 flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            aria-label="Volver"
            onClick={onBack}
            class="grid h-10 w-10 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
        ) : null}
        <div class="min-w-0">
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Mis guardados
          </h1>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Mensajes y links que guardaste, con los más importantes fijados al
            inicio.
          </p>
        </div>
      </header>

      <div class="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            class={
              "flex-none rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
              (filter === f.key
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
            }
          >
            {f.label}
            {f.key === "pinned" && pinnedCount > 0 ? (
              <span class="ml-1 tabular-nums">({pinnedCount})</span>
            ) : null}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div class="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span class="grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-7 w-7">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <path d="M17 21v-8H7v8" />
              <path d="M7 3v5h8" />
            </svg>
          </span>
          <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Aún no has guardado nada
          </p>
          <p class="text-xs text-slate-400 dark:text-slate-500">
            Abre un mensaje en el chat, toca el menú y elige "Guardar en Mis
            guardados".
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div class="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
            No hay guardados con este filtro.
          </p>
        </div>
      ) : (
        <ul class="flex flex-col gap-2.5">
          {visible.map((item) => (
            <SavedCard
              key={item.id}
              item={item}
              onPin={(pinned) => handlePin(item, pinned)}
              onMenu={() => setMenuItem(item)}
            />
          ))}
        </ul>
      )}

      {menuItem ? (
        <div class="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div
            class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setMenuItem(null)}
          />
          <div class="absolute inset-x-0 bottom-0 flex justify-center">
            <div class="animate-sheet-in max-h-[70dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-2 pb-4 shadow-2xl dark:bg-slate-900">
              {menuItem.text ? (
                <p class="truncate px-3 pb-2 pt-2 text-sm text-slate-400 dark:text-slate-500">
                  “{menuItem.text.trim()}”
                </p>
              ) : null}

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  void copySaved(menuItem);
                  setMenuItem(null);
                }}
              >
                <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </span>
                Copiar
              </button>

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => {
                  handlePin(menuItem, !menuItem.pinned);
                  setMenuItem(null);
                }}
              >
                <span
                  class={
                    "grid h-9 w-9 flex-none place-items-center rounded-full " +
                    (menuItem.pinned
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300")
                  }
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <path d="M12 17v5" />
                    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
                  </svg>
                </span>
                {menuItem.pinned ? "Desfijar" : "Fijar"}
              </button>

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                onClick={() => {
                  handleDelete(menuItem);
                  setMenuItem(null);
                }}
              >
                <span class="grid h-9 w-9 flex-none place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                    <path d="M3 6h18" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </span>
                Eliminar
              </button>

              <button
                type="button"
                class="mt-1 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                onClick={() => setMenuItem(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SavedCard({
  item,
  onPin,
  onMenu,
}: {
  item: SavedItem;
  onPin: (pinned: boolean) => void;
  onMenu: () => void;
}) {
  const segments = item.text ? splitLinks(item.text) : [];
  const image = item.attachments?.find((a) => a.kind === "image");
  const others = (item.attachments ?? []).filter((a) => a.kind !== "image");

  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function handlePointerDown(e: PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    clearTimer();
    timer.current = window.setTimeout(() => {
      timer.current = null;
      onMenu();
    }, 500);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!start.current || timer.current === null) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 12) clearTimer();
  }

  function handlePointerEnd() {
    start.current = null;
    clearTimer();
  }

  return (
    <li
      class={
        "rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900 " +
        (item.pinned
          ? "border-amber-300 dark:border-amber-700"
          : "border-slate-200 dark:border-slate-800")
      }
      style={{ touchAction: "pan-y" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        clearTimer();
        onMenu();
      }}
    >
      <div class="flex items-start gap-3">
        <span
          class={
            "mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl " +
            (item.kind === "link"
              ? "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400"
              : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400")
          }
        >
          {item.kind === "link" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4.5 w-4.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4.5 w-4.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
        </span>

        <div class="min-w-0 flex-1">
          {item.text ? (
            <p class="whitespace-pre-wrap break-words text-sm leading-snug text-slate-800 dark:text-slate-100">
              {segments.map((seg, i) =>
                seg.url ? (
                  <a
                    key={i}
                    href={seg.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="break-all text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
                  >
                    {seg.text}
                  </a>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          ) : (
            <p class="text-sm italic text-slate-400 dark:text-slate-500">
              Adjunto
            </p>
          )}

          {image ? (
            <img
              src={attachmentMediaUrl(image.url, "w_400,f_auto,q_auto")}
              alt={image.name}
              loading="lazy"
              class="mt-2 max-h-48 w-auto max-w-full rounded-lg object-cover"
            />
          ) : null}

          {others.length > 0 ? (
            <span class="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-3 w-3">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              </svg>
              {others.length === 1 ? others[0].name : `${others.length} archivos`}
            </span>
          ) : null}
        </div>

        <div class="flex flex-none items-center gap-1.5">
          <button
            type="button"
            aria-label={item.pinned ? "Desfijar" : "Fijar"}
            onClick={() => onPin(!item.pinned)}
            onPointerDown={(e) => e.stopPropagation()}
            class={
              "grid h-8 w-8 place-items-center rounded-full transition-colors " +
              (item.pinned
                ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700")
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M12 17v5" />
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}
