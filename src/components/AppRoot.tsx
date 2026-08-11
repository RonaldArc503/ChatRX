import { useEffect, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import { onAuthChange, signOut } from "../lib/auth";
import { initAnalytics } from "../lib/firebase";
import {
  clearLegacyTodos,
  isImported,
  loadLegacyTodos,
  markImported,
} from "../lib/storage";
import { importLocalTasks } from "../lib/tasks";
import { ensureProfile } from "../lib/profile";
import { ensureSelfConversation } from "../lib/chat";
import { AuthView } from "./AuthView";
import { BottomNav, type View } from "./BottomNav";
import { ChatView } from "./ChatView";
import { HomeView } from "./HomeView";
import { ProfileView } from "./ProfileView";
import { TodoApp } from "./TodoApp";

export function AppRoot() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>("home");
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    initAnalytics();
    return onAuthChange(setUser);
  }, []);

  useEffect(() => {
    setView("home");
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    ensureProfile(user)
      .then((profile) => ensureSelfConversation(profile))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    if (isImported(uid)) return;
    const legacy = loadLegacyTodos();
    if (legacy.length > 0) {
      importLocalTasks(uid, legacy)
        .then(() => {
          markImported(uid);
          clearLegacyTodos();
          setNotice(true);
          window.setTimeout(() => setNotice(false), 5000);
        })
        .catch(() => {});
    } else {
      markImported(uid);
    }
  }, [user]);

  async function handleLogout() {
    await signOut();
  }

  if (user === undefined) {
    return (
      <div class="flex min-h-screen items-center justify-center">
        <span
          class="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
          role="status"
          aria-label="Cargando"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthView />;
  }

  return (
    <div class="min-h-screen">
      {notice ? (
        <div class="fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)]">
          <div class="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5 flex-none">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            Tus tareas anteriores se importaron correctamente.
          </div>
        </div>
      ) : null}

      <BottomNav view={view} onNavigate={setView} />

      <main
        class={
          view === "chat"
            ? "h-[100dvh] w-full lg:h-auto lg:mx-auto lg:max-w-5xl lg:px-6 lg:pb-12 lg:pt-10"
            : "mx-auto w-full max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10"
        }
      >
        {view === "home" ? <HomeView user={user} onNavigate={setView} /> : null}
        {view === "tasks" ? (
          <div class="flex flex-col gap-5">
            <header class="text-center">
              <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Tareas
              </h1>
              <p class="mt-1 text-sm text-slate-500">
                Arrastra, desliza o toca para cambiar el estado.
              </p>
            </header>
            <TodoApp uid={user.uid} />
          </div>
        ) : null}
        {view === "chat" ? <ChatView user={user} /> : null}
        {view === "profile" ? <ProfileView user={user} onLogout={handleLogout} /> : null}
      </main>
    </div>
  );
}