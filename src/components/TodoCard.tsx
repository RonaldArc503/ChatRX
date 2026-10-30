import type { TaskStatus, Todo } from "../lib/todo";
import { STATUS_META, nextStatus, prevStatus } from "../lib/todo";
import { Swipeable } from "./Swipeable";

interface TodoCardProps {
  todo: Todo;
  isOldest?: boolean;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

const CARD_STYLES: Record<
  TaskStatus,
  { item: string; title: string }
> = {
  todo: {
    item: "border-l-amber-500 dark:border-l-amber-500",
    title: "",
  },
  doing: {
    item: "border-l-indigo-500 dark:border-l-indigo-500",
    title: "",
  },
  done: {
    item: "border-l-emerald-500 dark:border-l-emerald-500",
    title: "text-slate-400 line-through dark:text-slate-500",
  },
};

export function TodoCard({ todo, isOldest, onMove, onDelete }: TodoCardProps) {
  const meta = STATUS_META[todo.status];
  const styles = CARD_STYLES[todo.status];

  function advance() {
    onMove(todo.id, nextStatus(todo.status));
  }

  function retreat() {
    onMove(todo.id, prevStatus(todo.status));
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") advance();
    else if (e.key === "ArrowLeft") retreat();
  }

  return (
    <li
      class={
        "rounded-xl border border-slate-200 border-l-[3px] bg-white shadow-sm transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-slate-700 dark:bg-slate-900" +
        " " +
        styles.item +
        (isOldest ? " ring-2 ring-amber-400 bg-amber-50/40 dark:bg-amber-950/20" : "")
      }
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${todo.title}, ${meta.label}`}
    >
      <Swipeable
        onSwipeLeft={retreat}
        onSwipeRight={advance}
        className="flex items-center gap-2 p-2"
      >
        <span
          class={"min-w-0 flex-1 break-words transition-colors " + styles.title}
        >
          {todo.title}
        </span>
        <button
          type="button"
          class="grid h-7 w-7 flex-none place-items-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500"
          onClick={() => onDelete(todo.id)}
          aria-label={`Eliminar: ${todo.title}`}
        >
          ✕
        </button>
      </Swipeable>
    </li>
  );
}