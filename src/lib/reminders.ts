import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export type ReceiptKind = "image" | "pdf";

export interface Receipt {
  publicId: string;
  url: string;
  name: string;
  size: number;
  kind: ReceiptKind;
}

export interface Reminder {
  id: string;
  title: string;
  dueDate: number;
  receipts: Receipt[];
  createdAt: number;
  updatedAt: number;
}

export type Urgency = "overdue" | "red" | "orange" | "green" | "none";

export const RED_DAYS = 3;
export const ORANGE_DAYS = 7;
const DAY_MS = 86_400_000;

function remindersCollection(uid: string) {
  return collection(db!, "users", uid, "reminders");
}

function reminderDoc(uid: string, id: string) {
  return doc(db!, "users", uid, "reminders", id);
}

function newReminderId(): string {
  return `rem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createReminder(title: string, dueDate?: number): Reminder {
  const now = Date.now();
  return {
    id: newReminderId(),
    title: title.trim(),
    dueDate: typeof dueDate === "number" && dueDate > 0 ? dueDate : 0,
    receipts: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function urgencyFor(
  dueDate: number,
  now: number = Date.now(),
): Urgency {
  if (!dueDate || dueDate <= 0) return "none";
  const days = Math.ceil((dueDate - now) / DAY_MS);
  if (days < 0) return "overdue";
  if (days <= RED_DAYS) return "red";
  if (days <= ORANGE_DAYS) return "orange";
  return "green";
}

export function urgencyLabel(
  dueDate: number,
  now: number = Date.now(),
): string {
  if (!dueDate || dueDate <= 0) return "Sin fecha";
  const days = Math.ceil((dueDate - now) / DAY_MS);
  if (days < 0) {
    const abs = Math.abs(days);
    return `Vencido hace ${abs === 1 ? "1 día" : `${abs} días`}`;
  }
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  return `Vence en ${days} días`;
}

export function dateToTimestamp(dateValue: string): number {
  const trimmed = dateValue.trim();
  if (!trimmed) return 0;
  const parsed = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
}

export function timestampToDateValue(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nextMonthDueDate(dueDate: number, now: number = Date.now()): number {
  const base = dueDate && dueDate > 0 ? dueDate : now;
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

export async function addReminder(uid: string, reminder: Reminder): Promise<void> {
  await setDoc(reminderDoc(uid, reminder.id), {
    title: reminder.title,
    dueDate: reminder.dueDate,
    receipts: reminder.receipts,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  });
}

export async function updateReminder(
  uid: string,
  id: string,
  patch: { title?: string; dueDate?: number },
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.title !== undefined) data.title = patch.title.trim();
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  await updateDoc(reminderDoc(uid, id), data);
}

export async function deleteReminder(uid: string, id: string): Promise<void> {
  await deleteDoc(reminderDoc(uid, id));
}

export async function addReceipt(
  uid: string,
  id: string,
  receipt: Receipt,
): Promise<void> {
  await updateDoc(reminderDoc(uid, id), {
    receipts: arrayUnion(receipt),
    updatedAt: Date.now(),
  });
}

export async function removeReceipt(
  uid: string,
  id: string,
  receipt: Receipt,
): Promise<void> {
  await updateDoc(reminderDoc(uid, id), {
    receipts: arrayRemove(receipt),
    updatedAt: Date.now(),
  });
}

export function subscribeReminders(
  uid: string,
  cb: (items: Reminder[]) => void,
): Unsubscribe {
  return onSnapshot(
    remindersCollection(uid),
    (snap) => {
      const items: Reminder[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          title: String(data.title ?? ""),
          dueDate: typeof data.dueDate === "number" ? data.dueDate : 0,
          receipts: Array.isArray(data.receipts)
            ? (data.receipts as Receipt[])
            : [],
          createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
        });
      });
      cb(items);
    },
    (error) => {
      console.error("Error al escuchar recordatorios:", error);
    },
  );
}

export function sortReminders(items: Reminder[]): Reminder[] {
  const urgencyRank: Record<Urgency, number> = {
    overdue: 0,
    red: 1,
    orange: 2,
    green: 3,
    none: 4,
  };
  return [...items].sort((a, b) => {
    const ua = urgencyRank[urgencyFor(a.dueDate)];
    const ub = urgencyRank[urgencyFor(b.dueDate)];
    if (ua !== ub) return ua - ub;
    if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
    return b.createdAt - a.createdAt;
  });
}
