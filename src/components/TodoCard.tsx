import { useEffect, useState } from "preact/hooks";
import type { TaskStatus, Todo } from "../lib/todo";
import { STATUS_META, nextStatus, prevStatus } from "../lib/todo";
import { Swipeable } from "./Swipeable";

interface TodoCardProps {
  todo: Todo;
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}

const CARD_STYLES: Record<
  TaskStatus,
  { item: string; title: string; chip: string }
> = {
  todo: {
    item: "border-l-amber-500 dark:border-l-amber-500",
    title: "",
    chip: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25",
  },
  doing: {
    item: "border-l-indigo-500 dark:border-l-indigo-500",
    title: "",
    chip: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25",
  },
  done: {
    item: "border-l-emerald-500 dark:border-l-emerald-500",
    title: "text-slate-400 line-through dark:text-slate-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25",
  },
};

export function TodoCard({ todo, onMove, onDelete }: TodoCardProps) {
  const [canDrag, setCanDrag] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setCanDrag(window.matchMedia("(pointer: fine)").matches);
  }, []);

  const meta = STATUS_META[todo.status];
  const styles = CARD_STYLES[todo.status];

  function handleDragStart(e: DragEvent) {
    e.dataTransfer?.setData("text/plain", todo.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    setDragging(true);
  }

  function handleDragEnd() {
    setDragging(false);
  }

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
        (dragging ? " opacity-50" : "") +
        " " +
        styles.item
      }
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label={`${todo.title}, ${meta.label}`}
    >
      <Swipeable
        onSwipeLeft={retreat}
        onSwipeRight={advance}
        className="flex items-center gap-1.5 p-2"
      >
        <span
          class="flex-none cursor-grab select-none px-1 text-lg font-bold text-slate-300 transition-colors hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500"
          draggable={canDrag}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          aria-hidden="true"
        >
          ⋮⋮
        </span>
        <span
          class={"min-w-0 flex-1 break-words transition-colors " + styles.title}
        >
          {todo.title}
        </span>
        <button
          type="button"
          class={
            "flex-none whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors active:scale-95 " +
            styles.chip
          }
          onClick={advance}
          aria-label={`${meta.chipLabel}: ${todo.title}`}
        >
          {meta.chipLabel}
        </button>
        <button
          type="button"
          class="grid h-7 w-7 flex-none place-items-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          onClick={retreat}
          aria-label={`Retroceder: ${todo.title}`}
        >
          ←
        </button>
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