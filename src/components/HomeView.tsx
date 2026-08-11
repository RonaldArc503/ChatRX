import type { User } from "firebase/auth";
import type { JSX } from "preact";
import type { View } from "./BottomNav";

interface HomeViewProps {
  user: User;
  onNavigate: (view: View) => void;
}

const FEATURES: { title: string; description: string; icon: () => JSX.Element }[] = [
  {
    title: "Tablero Kanban",
    description: "Mueve tus tareas entre Por hacer, En progreso y Completada.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" class="h-6 w-6">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M3 9h18" />
      </svg>
    ),
  },
  {
    title: "En la nube",
    description: "Tus tareas se sincronizan y se guardan por usuario en Firebase.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-6 w-6">
        <path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A3.5 3.5 0 0 1 17 18H7z" />
      </svg>
    ),
  },
  {
    title: "Funciona offline",
    description: "Firestore guarda en caché tus cambios aunque no tengas internet.",
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-6 w-6">
        <path d="M17 8a5 5 0 0 0-9.5-1.6" />
        <path d="M5 8a5 5 0 0 0 0 10h11" />
        <path d="m2 2 20 20" />
      </svg>
    ),
  },
];

export function HomeView({ user, onNavigate }: HomeViewProps) {
  const name = user.displayName ?? "hola";
  return (
    <div class="flex flex-col gap-6">
      <header class="text-center">
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          ¡Hola, {name}!
        </h1>
        <p class="mt-2 text-sm text-slate-500 sm:text-base">
          Organiza tu día, una tarea a la vez.
        </p>
      </header>

      <button
        type="button"
        onClick={() => onNavigate("tasks")}
        class="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-md transition-colors hover:bg-indigo-700 active:scale-95"
      >
        Ir a mis tareas
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </button>

      <div class="grid gap-3 sm:grid-cols-3">
        {FEATURES.map(({ title, description, icon }) => {
          const Icon = icon;
          return (
            <div
              key={title}
              class="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span class="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon />
              </span>
              <div>
                <h2 class="text-sm font-bold text-slate-800">{title}</h2>
                <p class="mt-1 text-xs text-slate-500">{description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}