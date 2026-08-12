import { useEffect, useMemo, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import type { View } from "./BottomNav";
import {
  subscribeConversations,
  type ChatConversation,
} from "../lib/chat";
import { subscribeTasks } from "../lib/tasks";
import type { Todo } from "../lib/todo";
import { Avatar } from "./chat/Avatar";
import { peerOf } from "./chat/ConversationList";
import { formatDayLabel } from "./chat/time";
import { ThemeToggle } from "./ThemeToggle";

interface HomeViewProps {
  user: User;
  onNavigate: (view: View) => void;
  onOpenConversation: (id: string) => void;
}

type StatusKey = "todo" | "doing";

const STATUS_STYLE: Record<
  StatusKey,
  { label: string; dot: string; chip: string; accent: string }
> = {
  todo: {
    label: "Sin empezar",
    dot: "bg-amber-400",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    accent: "border-amber-400",
  },
  doing: {
    label: "En proceso",
    dot: "bg-indigo-500",
    chip: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
    accent: "border-indigo-500",
  },
};

type RecentItem =
  | { key: string; kind: "chat"; time: number; conv: ChatConversation }
  | { key: string; kind: "task"; time: number; task: Todo };

export function HomeView({
  user,
  onNavigate,
  onOpenConversation,
}: HomeViewProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);

  useEffect(() => {
    return subscribeTasks(user.uid, setTodos);
  }, [user.uid]);

  useEffect(() => {
    return subscribeConversations(user.uid, setConversations);
  }, [user.uid]);

  const pending = useMemo(() => {
    const pendingTodos = todos.filter((t) => t.status !== "done");
    return pendingTodos.sort(
      (a, b) =>
        (a.status === "doing" ? 1 : 0) - (b.status === "doing" ? 1 : 0) ||
        b.createdAt - a.createdAt,
    );
  }, [todos]);

  const pendingCount = pending.length;
  const todoCount = todos.filter((t) => t.status === "todo").length;
  const doingCount = todos.filter((t) => t.status === "doing").length;

  const recents = useMemo<RecentItem[]>(() => {
    const chatItems: RecentItem[] = conversations
      .filter((c) => (c.lastMessageAt ?? 0) > 0)
      .map((conv) => ({
        key: `chat:${conv.id}`,
        kind: "chat",
        time: conv.lastMessageAt,
        conv,
      }));
    const taskItems: RecentItem[] = todos
      .filter((t) => t.status !== "done")
      .map((task) => ({
        key: `task:${task.id}`,
        kind: "task",
        time: task.createdAt,
        task,
      }));
    return chatItems
      .concat(taskItems)
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);
  }, [conversations, todos]);

  const name = user.displayName ?? "hola";

  return (
    <div class="flex flex-col gap-8">
      <header class="flex items-center justify-between">
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            ¡Hola, {name}!
          </p>
          <p class="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Tu día, bajo control
          </p>
        </div>
        <div class="flex items-center gap-2">
          <ThemeToggle />
          <Avatar uid={user.uid} name={name} photoURL={user.photoURL ?? ""} />
        </div>
      </header>

      {recents.length > 0 ? (
        <section aria-label="Recientes">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Recientes
          </h2>
          <ul class="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {recents.map((item) => {
              if (item.kind === "chat") {
                const conv = item.conv;
                const peer = peerOf(conv, user.uid);
                const unread = conv.unread?.[user.uid] ?? 0;
                const preview = peer.isSelf
                  ? "Escríbete a ti mismo…"
                  : conv.lastMessage
                    ? conv.lastMessage
                    : "Toca para ver la conversación";
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onOpenConversation(conv.id)}
                      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
                      <Avatar
                        uid={peer.uid}
                        name={peer.name}
                        photoURL={peer.photoURL}
                        size="md"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="flex items-baseline justify-between gap-2">
                          <span class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {peer.name}
                          </span>
                          <span class="flex-none text-[11px] text-slate-400 dark:text-slate-500">
                            {formatDayLabel(conv.lastMessageAt)}
                          </span>
                        </span>
                        <span class="mt-0.5 flex items-center justify-between gap-2">
                          <span class="truncate text-xs text-slate-500 dark:text-slate-400">
                            {preview}
                          </span>
                          {unread > 0 ? (
                            <span class="grid h-5 min-w-5 flex-none place-items-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">
                              {unread}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              }
              const task = item.task;
              const style = STATUS_STYLE[task.status as StatusKey];
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onNavigate("tasks")}
                    class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <span
                      class={`h-2 w-2 flex-none rounded-full ${style.dot}`}
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {task.title}
                      </span>
                      <span
                        class={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}
                      >
                        {style.label}
                      </span>
                    </span>
                    <span class="flex-none text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDayLabel(task.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-label="Tarea Pendiente">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Tarea Pendiente
          </h2>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {pendingCount}
          </span>
        </div>

        {pending.length === 0 ? (
          <div class="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              class="h-10 w-10 text-slate-300 dark:text-slate-600"
            >
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
              Sin tareas pendientes
            </p>
            <p class="text-xs text-slate-400 dark:text-slate-500">
              Todo listo por ahora. ¡Buen trabajo!
            </p>
          </div>
        ) : (
          <ul class="flex flex-col gap-2">
            {pending.map((task: Todo) => {
              const style = STATUS_STYLE[task.status as StatusKey];
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate("tasks")}
                    class={`flex w-full items-center gap-3 rounded-2xl border border-slate-200 border-l-4 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60 ${style.accent}`}
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {task.title}
                      </span>
                    </span>
                    <span
                      class={`flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.chip}`}
                    >
                      {style.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {pendingCount > 0 ? (
          <p class="mt-2 text-right text-xs text-slate-400 dark:text-slate-500">
            {todoCount} sin empezar · {doingCount} en proceso
          </p>
        ) : null}
      </section>
    </div>
  );
}