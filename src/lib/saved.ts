import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ChatAttachment } from "./chat";

export interface SavedItem {
  id: string;
  kind: "message" | "link";
  text: string;
  links: string[];
  attachments?: ChatAttachment[];
  senderId: string;
  senderName: string;
  convId: string;
  convName: string;
  createdAt: number;
  savedAt: number;
  pinned: boolean;
  pinnedAt: number;
}

export type SavedFilter = "all" | "messages" | "links" | "pinned";

function savedCollection(uid: string) {
  return collection(db!, "users", uid, "saved");
}

function savedDoc(uid: string, id: string) {
  return doc(db!, "users", uid, "saved", id);
}

function newSavedId(): string {
  return `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSavedItem(data: {
  kind: SavedItem["kind"];
  text: string;
  links?: string[];
  attachments?: ChatAttachment[];
  senderId: string;
  senderName: string;
  convId: string;
  convName: string;
  createdAt: number;
}): SavedItem {
  const now = Date.now();
  return {
    id: newSavedId(),
    kind: data.kind,
    text: data.text,
    links: data.links ?? [],
    attachments: data.attachments ?? [],
    senderId: data.senderId,
    senderName: data.senderName,
    convId: data.convId,
    convName: data.convName,
    createdAt: data.createdAt,
    savedAt: now,
    pinned: false,
    pinnedAt: 0,
  };
}

export async function saveMessage(uid: string, item: SavedItem): Promise<void> {
  await setDoc(savedDoc(uid, item.id), {
    kind: item.kind,
    text: item.text,
    links: item.links,
    attachments: item.attachments,
    senderId: item.senderId,
    senderName: item.senderName,
    convId: item.convId,
    convName: item.convName,
    createdAt: item.createdAt,
    savedAt: item.savedAt,
    pinned: item.pinned,
    pinnedAt: item.pinnedAt,
  });
}

export async function deleteSaved(uid: string, id: string): Promise<void> {
  await deleteDoc(savedDoc(uid, id));
}

export async function setPinned(
  uid: string,
  id: string,
  pinned: boolean,
): Promise<void> {
  await updateDoc(savedDoc(uid, id), {
    pinned,
    pinnedAt: pinned ? Date.now() : 0,
  });
}

export function subscribeSaved(
  uid: string,
  cb: (items: SavedItem[]) => void,
): Unsubscribe {
  return onSnapshot(
    savedCollection(uid),
    (snap) => {
      const items: SavedItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          kind: data.kind === "link" ? "link" : "message",
          text: String(data.text ?? ""),
          links: Array.isArray(data.links) ? data.links : [],
          attachments: Array.isArray(data.attachments)
            ? (data.attachments as ChatAttachment[])
            : [],
          senderId: String(data.senderId ?? ""),
          senderName: String(data.senderName ?? ""),
          convId: String(data.convId ?? ""),
          convName: String(data.convName ?? ""),
          createdAt:
            typeof data.createdAt === "number" ? data.createdAt : 0,
          savedAt: typeof data.savedAt === "number" ? data.savedAt : 0,
          pinned: data.pinned === true,
          pinnedAt: typeof data.pinnedAt === "number" ? data.pinnedAt : 0,
        });
      });
      cb(items);
    },
    (error) => {
      console.error("Error al escuchar guardados:", error);
    },
  );
}

export function sortSaved(items: SavedItem[]): SavedItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.pinned) return b.pinnedAt - a.pinnedAt;
    return b.savedAt - a.savedAt;
  });
}

export function filterSaved(
  items: SavedItem[],
  filter: SavedFilter,
): SavedItem[] {
  switch (filter) {
    case "messages":
      return items.filter((i) => i.kind === "message");
    case "links":
      return items.filter((i) => i.kind === "link");
    case "pinned":
      return items.filter((i) => i.pinned);
    default:
      return items;
  }
}
