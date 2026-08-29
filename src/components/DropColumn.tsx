import { type ComponentChildren } from "preact";
import type { TaskStatus } from "../lib/todo";
import { STATUS_META } from "../lib/todo";

interface DropColumnProps {
  status: TaskStatus;
  count: number;
  onClear?: () => void;
  active?: boolean;
  children: ComponentChildren;
}

const DOT_STYLES: Record<TaskStatus, string> = {
  todo: "bg-amber-500",
  doing: "bg-indigo-500 animate-pulse-ring",
  done: "bg-emerald-500",
};

export function DropColumn({
  status,
  count,
  onClear,
  active,
  children,
}: DropColumnProps) {
  const meta = STATUS_META[status];

  return (
    <section
      class={
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-[border-color,box-shadow] dark:bg-slate-900" +
        " border-slate-200 dark:border-slate-800" +
        (active ? " block" : " hidden") +
        " lg:block"
      }
      data-status={status}
    >
      <header class="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <span
          class={"h-2.5 w-2.5 flex-none rounded-full " + DOT_STYLES[status]}
          aria-hidden="true"
        />
        <h2 class="flex-1 text-sm font-bold text-slate-700 dark:text-slate-200">{meta.label}</h2>
        <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {count}
        </span>
        {onClear ? (
          <button
            type="button"
            class="grid h-7 w-7 flex-none place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            onClick={onClear}
            aria-label="Limpiar completadas"
          >
            ✕
          </button>
        ) : null}
      </header>
      <ul
        class="flex min-h-16 flex-col gap-2 p-2.5"
        aria-label={meta.label}
      >
        {children}
      </ul>
    </section>
  );
}