import type { TaskStatus, Todo } from "./todo";

const STORAGE_KEY = "taskly-todos";
const IMPORT_KEY = "taskly-imported";
const STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export function loadLegacyTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(migrateTodo)
      .filter((todo): todo is Todo => todo !== null);
  } catch {
    return [];
  }
}

export function clearLegacyTodos(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isImported(uid: string): boolean {
  try {
    return (localStorage.getItem(IMPORT_KEY) ?? "").split(",").includes(uid);
  } catch {
    return false;
  }
}

export function markImported(uid: string): void {
  try {
    const current = (localStorage.getItem(IMPORT_KEY) ?? "").split(",").filter(Boolean);
    if (!current.includes(uid)) {
      current.push(uid);
      localStorage.setItem(IMPORT_KEY, current.join(","));
    }
  } catch {
    // no hace nada si localStorage no esta disponible
  }
}

function migrateTodo(value: unknown): Todo | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.createdAt !== "number"
  ) {
    return null;
  }

  let status: TaskStatus;
  if (typeof raw.status === "string" && STATUSES.includes(raw.status as TaskStatus)) {
    status = raw.status as TaskStatus;
  } else if (typeof raw.completed === "boolean") {
    status = raw.completed ? "done" : "todo";
  } else {
    status = "todo";
  }

  return { id: raw.id, title: raw.title, status, createdAt: raw.createdAt };
}