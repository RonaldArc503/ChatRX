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
import { setOffline, setOnline } from "../lib/presence";
import { ensureProfile } from "../lib/profile";
import { ensureSelfConversation } from "../lib/chat";
import { stopAudio } from "../lib/audioPlayer";
import { AgentsView } from "./agents/AgentsView";
import { AuthView } from "./AuthView";
import { BottomNav, type View } from "./BottomNav";
import { ChatView } from "./ChatView";
import { HomeView } from "./HomeView";
import { ProfileView } from "./ProfileView";
import { TodoApp } from "./TodoApp";
import { AudioPlayerBar } from "./chat/AudioPlayerBar";
import { SavedView } from "./saved/SavedView";
import { RemindersView } from "./reminders/RemindersView";
import {
  flushFirestoreWrites,
  isOnline,
  subscribeOnlineChange,
} from "../lib/offline";

export function AppRoot() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>("home");
  const [chatTargetId, setChatTargetId] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [isOffline, setIsOffline] = useState(() => !isOnline());

  useEffect(() => {
    return subscribeOnlineChange((online) => {
      setIsOffline(!online);
      if (online) flushFirestoreWrites().catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!isOffline) return;
    const id = window.setTimeout(() => setIsOffline(false), 5000);
    return () => window.clearTimeout(id);
  }, [isOffline]);

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

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    setOnline(uid);
    const beat = window.setInterval(() => setOnline(uid), 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") setOnline(uid);
      else setOffline(uid);
    };
    const handleHide = () => setOffline(uid);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handleHide);
    window.addEventListener("beforeunload", handleHide);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handleHide);
      window.removeEventListener("beforeunload", handleHide);
      setOffline(uid);
    };
  }, [user?.uid]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [view]);

  async function handleLogout() {
    stopAudio();
    await signOut();
  }

  function handleOpenConversation(id: string) {
    setChatTargetId(id);
    setView("chat");
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
    <div class="min-h-screen dark:bg-slate-950">
      <AudioPlayerBar />
      {notice ? (
        <div class="fixed inset-x-0 top-[calc(var(--audio-bar-h)+1rem)] z-50 mx-auto w-fit max-w-[calc(100vw-2rem)]">
          <div class="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5 flex-none">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            Tus tareas anteriores se importaron correctamente.
          </div>
        </div>
      ) : null}

      {isOffline ? (
        <div class="fixed inset-x-0 top-[calc(var(--audio-bar-h)+1rem)] z-50 mx-auto w-fit max-w-[calc(100vw-2rem)]">
          <div class="flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5 flex-none">
              <path d="M1 1l22 22" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <path d="M12 20h.01" />
            </svg>
            Sin conexión. Los cambios se sincronizarán cuando vuelvas a estar en línea.
          </div>
        </div>
      ) : null}

      <BottomNav view={view} onNavigate={setView} profile={user} />

      <div class="lg:pl-[var(--app-rail-w)]">
      <main
        class={
          view === "chat"
            ? "w-full"
            : "mx-auto w-full max-w-6xl px-4 pb-28 pt-[calc(var(--audio-bar-h)+1.5rem)] sm:px-6 lg:px-8 lg:pb-12 lg:pt-[calc(var(--audio-bar-h)+2.5rem)]"
        }
      >
        {view === "home" ? (
          <HomeView
            user={user}
            onNavigate={setView}
            onOpenConversation={handleOpenConversation}
          />
        ) : null}
        {view === "tasks" ? (
          <div class="flex flex-col gap-5">
            <header class="text-center">
              <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                Tareas
              </h1>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Arrastra, desliza o toca para cambiar el estado.
              </p>
            </header>
            <TodoApp uid={user.uid} />
          </div>
        ) : null}
        {view === "chat" ? (
          <ChatView
            user={user}
            targetId={chatTargetId}
            onConsumeTarget={() => setChatTargetId(null)}
          />
        ) : null}
        {view === "agents" ? <AgentsView user={user} /> : null}
        {view === "saved" ? <SavedView user={user} /> : null}
        {view === "reminders" ? <RemindersView user={user} /> : null}
        {view === "profile" ? <ProfileView user={user} onLogout={handleLogout} /> : null}
      </main>
      </div>
    </div>
  );
}
