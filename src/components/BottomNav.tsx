import type { JSX } from "preact";
import { Avatar } from "./chat/Avatar";

export type View = "home" | "tasks" | "chat" | "saved" | "reminders" | "profile";

interface BottomNavProps {
  view: View;
  onNavigate: (view: View) => void;
  profile?: { uid: string; displayName: string | null; photoURL: string | null };
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  class: "h-7 w-7 lg:h-[17px] lg:w-[17px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ITEMS: { key: View; label: string; desktopOnly?: boolean; icon: () => JSX.Element }[] = [
  {
    key: "home",
    label: "Inicio",
    icon: () => (
      <svg {...ICON_PROPS}>
        <path d="M3 11.5 12 3l9 8.5" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    key: "tasks",
    label: "Tareas",
    icon: () => (
      <svg {...ICON_PROPS}>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
  },
  {
    key: "chat",
    label: "Chat",
    icon: () => (
      <svg {...ICON_PROPS}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "saved",
    label: "Guardados",
    desktopOnly: true,
    icon: () => (
      <svg {...ICON_PROPS}>
        <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
      </svg>
    ),
  },
  {
    key: "reminders",
    label: "Recordatorios",
    icon: () => (
      <svg {...ICON_PROPS}>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Perfil",
    icon: () => (
      <svg {...ICON_PROPS}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export function BottomNav({ view, onNavigate, profile }: BottomNavProps) {
  return (
    <nav
      class={
        "app-navigation fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur dark:bg-slate-900/95 lg:inset-x-auto lg:left-0 lg:top-[var(--audio-bar-h)] lg:w-[var(--app-rail-w)] lg:border-r lg:border-slate-200 lg:dark:border-slate-800 " +
        (view === "chat"
          ? "shadow-[0_-3px_12px_rgb(15_23_42/0.06)]"
          : "border-t border-slate-200 dark:border-slate-800")
      }
      aria-label="Navegación principal"
    >
      <div class="mx-auto flex max-w-5xl items-stretch px-1 sm:px-4 lg:h-full lg:flex-col lg:gap-2 lg:overflow-y-auto lg:px-2 lg:py-3">
        <button
          type="button"
          aria-label="Taskly, ir al inicio"
          onClick={() => onNavigate("home")}
          class="mb-2 hidden shrink-0 flex-col items-center gap-1 rounded-xl py-2 text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-400 lg:flex"
        >
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-6 w-6"><path d="m6 12 4 4 8-9" /></svg>
          </span>
          <span class="text-[11px] font-extrabold tracking-tight">Taskly</span>
        </button>
        {ITEMS.map(({ key, label, icon, desktopOnly }) => {
          const Icon = icon;
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              class={
                (desktopOnly ? "hidden lg:flex " : "flex ") +
                "group flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 lg:flex-none lg:shrink-0 lg:gap-1.5 lg:rounded-xl lg:px-1 lg:py-2.5 lg:text-[11px] lg:font-semibold" +
                (key === "profile" ? " lg:mt-auto" : "") +
                (active
                  ? " text-indigo-600 dark:text-indigo-400 lg:bg-indigo-50 lg:dark:bg-indigo-500/15"
                  : " text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 lg:hover:bg-slate-100 lg:dark:hover:bg-slate-800")
              }
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(key)}
            >
              {key === "profile" && profile ? (
                <>
                  <span class="lg:hidden"><Icon /></span>
                  <span class="hidden lg:block"><Avatar uid={profile.uid} name={profile.displayName || "Perfil"} photoURL={profile.photoURL || ""} size="sm" /></span>
                </>
              ) : <Icon />}
              <span class="flex flex-col items-center gap-0.5">
                {label}
                <span
                  class={
                    "h-1 w-1 rounded-full transition-colors lg:hidden" +
                    (active ? " bg-indigo-600" : " bg-transparent")
                  }
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
