import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { createTodo, type TaskStatus, type Todo } from "./todo";

function tasksCollection(uid: string) {
  return collection(db!, "users", uid, "tasks");
}

function taskDoc(uid: string, id: string) {
  return doc(db!, "users", uid, "tasks", id);
}

function toTodo(id: string, data: Record<string, unknown>): Todo {
  const status =
    data.status === "doing" || data.status === "done"
      ? data.status
      : "todo";
  return {
    id,
    title: String(data.title ?? ""),
    status,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
  };
}

export function subscribeTasks(uid: string, cb: (todos: Todo[]) => void): Unsubscribe {
  return onSnapshot(tasksCollection(uid), (snapshot) => {
    const todos: Todo[] = [];
    snapshot.forEach((docSnap) => {
      todos.push(toTodo(docSnap.id, docSnap.data() as Record<string, unknown>));
    });
    todos.sort((a, b) => a.createdAt - b.createdAt);
    cb(todos);
  });
}

export async function addTask(uid: string, title: string): Promise<void> {
  const todo = createTodo(title);
  await setDoc(taskDoc(uid, todo.id), {
    title: todo.title,
    status: todo.status,
    createdAt: todo.createdAt,
    updatedAt: Date.now(),
  });
}

export async function moveTask(
  uid: string,
  id: string,
  status: TaskStatus,
): Promise<void> {
  await setDoc(taskDoc(uid, id), { status, updatedAt: Date.now() }, { merge: true });
}

export async function restoreTask(uid: string, todo: Todo): Promise<void> {
  await setDoc(taskDoc(uid, todo.id), {
    title: todo.title,
    status: todo.status,
    createdAt: todo.createdAt,
    updatedAt: Date.now(),
  });
}

export async function deleteTask(uid: string, id: string): Promise<void> {
  await deleteDoc(taskDoc(uid, id));
}

export async function clearDoneTasks(uid: string, doneIds: string[]): Promise<void> {
  const batch = writeBatch(db!);
  for (const id of doneIds) {
    batch.delete(taskDoc(uid, id));
  }
  await batch.commit();
}

export async function importLocalTasks(uid: string, todos: Todo[]): Promise<void> {
  const batch = writeBatch(db!);
  for (const todo of todos) {
    batch.set(taskDoc(uid, todo.id), {
      title: todo.title,
      status: todo.status,
      createdAt: todo.createdAt,
      updatedAt: Date.now(),
    });
  }
  await batch.commit();
}