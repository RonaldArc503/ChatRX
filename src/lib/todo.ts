export type TaskStatus = "todo" | "doing" | "done";

export interface Todo {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: number;
}

export const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];

export interface StatusMeta {
  label: string;
  next: TaskStatus;
  prev: TaskStatus;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  todo: { label: "Por hacer", next: "doing", prev: "done" },
  doing: { label: "En progreso", next: "done", prev: "todo" },
  done: { label: "Completada", next: "todo", prev: "doing" },
};

export function createTodo(title: string): Todo {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    status: "todo",
    createdAt: Date.now(),
  };
}

export function nextStatus(status: TaskStatus): TaskStatus {
  return STATUS_META[status].next;
}

export function prevStatus(status: TaskStatus): TaskStatus {
  return STATUS_META[status].prev;
}