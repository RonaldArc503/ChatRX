import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  addTask,
  clearDoneTasks,
  deleteTask,
  moveTask,
  restoreTask,
  subscribeTasks,
} from "../lib/tasks";
import {
  createTodo,
  STATUS_META,
  STATUS_ORDER,
  type TaskStatus,
  type Todo,
} from "../lib/todo";
import { TodoCard } from "./TodoCard";
import { DropColumn } from "./DropColumn";

interface TodoAppProps {
  uid: string;
}

type ToastState =
  | { kind: "move"; id: string; message: string; fromStatus: TaskStatus }
  | { kind: "delete"; message: string; removed: Todo };

export function TodoApp({ uid }: TodoAppProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<TaskStatus>("todo");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return subscribeTasks(uid, setTodos);
  }, [uid]);

  const byStatus = useMemo(() => {
    const groups: Record<TaskStatus, Todo[]> = { todo: [], doing: [], done: [] };
    for (const todo of todos) groups[todo.status].push(todo);
    return groups;
  }, [todos]);

  const total = todos.length;
  const doneCount = byStatus.done.length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  function showToast(next: ToastState) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }

  function applyMove(id: string, to: TaskStatus) {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, status: to } : todo)),
    );
  }

  function moveTodo(id: string, to: TaskStatus) {
    const from = todos.find((todo) => todo.id === id)?.status;
    if (!from || from === to) return;
    applyMove(id, to);
    moveTask(uid, id, to).catch(() => {});
    showToast({
      kind: "move",
      id,
      message: `Movida a "${STATUS_META[to].label}"`,
      fromStatus: from,
    });
  }

  function deleteTodo(id: string) {
    const removed = todos.find((todo) => todo.id === id);
    if (!removed) return;
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
    deleteTask(uid, id).catch(() => {});
    showToast({
      kind: "delete",
      message: "Tarea eliminada",
      removed,
    });
  }

  function addTodo(event: SubmitEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const todo = createTodo(title);
    setTodos((prev) => [...prev, todo]);
    addTask(uid, title).catch(() => {});
    setDraft("");
  }

  function clearCompleted() {
    const doneIds = todos
      .filter((todo) => todo.status === "done")
      .map((todo) => todo.id);
    if (!doneIds.length) return;
    setTodos((prev) => prev.filter((todo) => todo.status !== "done"));
    clearDoneTasks(uid, doneIds).catch(() => {});
  }

  function closeToast() {
    setToast(null);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }

  function undoToast() {
    if (!toast) return;
    if (toast.kind === "move") {
      applyMove(toast.id, toast.fromStatus);
      moveTask(uid, toast.id, toast.fromStatus).catch(() => {});
    } else {
      setTodos((prev) => [toast.removed, ...prev]);
      restoreTask(uid, toast.removed).catch(() => {});
    }
    closeToast();
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <div
            class="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso"
          >
            <div
              class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span class="whitespace-nowrap text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400">
            {doneCount}/{total} · {progress}%
            {progress === 100 && total > 0 ? " · ¡Día completado!" : ""}
          </span>
        </div>

        <nav
          class="sticky top-3 z-10 flex gap-2 rounded-2xl bg-slate-100/90 p-1.5 backdrop-blur dark:bg-slate-800/80 lg:hidden"
          aria-label="Columnas"
        >
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              class={
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors" +
                (tab === status
                  ? " bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400"
                  : " text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
              }
              onClick={() => setTab(status)}
            >
              {STATUS_META[status].label}
              <span
                class={
                  "rounded-full px-2 py-0.5 text-xs tabular-nums" +
                  (tab === status
                    ? " bg-indigo-100 text-indigo-600 dark:bg-indigo-500/25 dark:text-indigo-300"
                    : " bg-slate-200/70 dark:bg-slate-700")
                }
              >
                {byStatus[status].length}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <form class="flex gap-2" onSubmit={addTodo}>
        <input
          class="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          type="text"
          value={draft}
          placeholder="¿Qué necesitas hacer?"
          aria-label="Nueva tarea"
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
        />
        <button
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 active:scale-95"
          type="submit"
        >
          Añadir
        </button>
      </form>

      <div class="grid items-start gap-4 lg:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <DropColumn
            key={status}
            status={status}
            count={byStatus[status].length}
            onDrop={moveTodo}
            onClear={status === "done" ? clearCompleted : undefined}
            active={tab === status}
          >
            {byStatus[status].length === 0 ? (
              <li class="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
                Sin tareas aquí
              </li>
            ) : (
              byStatus[status].map((todo) => (
                <TodoCard
                  key={todo.id}
                  todo={todo}
                  onMove={moveTodo}
                  onDelete={deleteTodo}
                />
              ))
            )}
          </DropColumn>
        ))}
      </div>

      {toast ? (
        <div
          class="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[calc(100vw-2rem)] animate-toast-in"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-center gap-3 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-white shadow-xl">
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {toast.message}
            </span>
            <button
              type="button"
              class="flex-none font-bold text-indigo-300 transition-colors hover:text-indigo-200"
              onClick={undoToast}
            >
              Deshacer
            </button>
            <button
              type="button"
              class="grid h-6 w-6 flex-none place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              onClick={closeToast}
              aria-label="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}