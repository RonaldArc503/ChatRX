import type { JSX } from "preact";

export type View = "home" | "tasks" | "chat" | "profile";

interface BottomNavProps {
  view: View;
  onNavigate: (view: View) => void;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  class: "h-7 w-7 lg:h-6 lg:w-6",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ITEMS: { key: View; label: string; icon: () => JSX.Element }[] = [
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

export function BottomNav({ view, onNavigate }: BottomNavProps) {
  return (
    <nav
      class={
        "fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur " +
        (view === "chat"
          ? "shadow-[0_-3px_12px_rgb(15_23_42/0.06)]"
          : "border-t border-slate-200") +
        " lg:sticky lg:inset-x-auto lg:bottom-auto lg:top-0 lg:border-b lg:border-t-0 lg:shadow-none"
      }
      aria-label="Navegación principal"
    >
      <div class="mx-auto flex max-w-5xl items-stretch px-1 sm:px-4">
        {ITEMS.map(({ key, label, icon }) => {
          const Icon = icon;
          const active = view === key;
          return (
            <button
              key={key}
              type="button"
              class={
                "group flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors lg:flex-row lg:justify-center lg:gap-2 lg:px-5 lg:py-4 lg:text-sm" +
                (active
                  ? " text-indigo-600"
                  : " text-slate-500 hover:text-slate-700")
              }
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate(key)}
            >
              <Icon />
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