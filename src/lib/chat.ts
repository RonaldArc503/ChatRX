import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { UserProfile } from "./profile";

export interface MemberSnapshot {
  displayName: string;
  photoURL: string;
  phone: string;
}

export interface ChatConversation {
  id: string;
  participantIds: string[];
  members: Record<string, MemberSnapshot>;
  unread: Record<string, number>;
  lastMessage: string;
  lastMessageAt: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  edited?: boolean;
  editedAt?: number;
}

export function conversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("__");
}

function memberSnapshot(p: UserProfile): MemberSnapshot {
  return {
    displayName: p.displayName,
    photoURL: p.photoURL,
    phone: p.phone,
  };
}

export async function getOrCreateConversation(
  me: UserProfile,
  other: UserProfile,
): Promise<string | null> {
  if (me.uid === other.uid) return null;
  const id = conversationId(me.uid, other.uid);
  const ref = doc(db!, "conversations", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return id;

  const now = Date.now();
  await setDoc(ref, {
    participantIds: [me.uid, other.uid].sort(),
    members: {
      [me.uid]: memberSnapshot(me),
      [other.uid]: memberSnapshot(other),
    },
    unread: { [me.uid]: 0, [other.uid]: 0 },
    lastMessage: "",
    lastMessageAt: 0,
    createdAt: now,
  });
  return id;
}

export async function ensureSelfConversation(
  me: UserProfile,
): Promise<string | null> {
  const id = conversationId(me.uid, me.uid);
  const ref = doc(db!, "conversations", id);
  const snap = await getDoc(ref);
  if (snap.exists()) return id;

  await setDoc(ref, {
    participantIds: [me.uid],
    members: { [me.uid]: memberSnapshot(me) },
    unread: { [me.uid]: 0 },
    lastMessage: "",
    lastMessageAt: 0,
    createdAt: Date.now(),
  });
  return id;
}

export function subscribeConversations(
  uid: string,
  cb: (list: ChatConversation[]) => void,
): Unsubscribe {
  const q = query(
    collection(db!, "conversations"),
    where("participantIds", "array-contains", uid),
  );
  return onSnapshot(q, (snap) => {
    const list: ChatConversation[] = [];
    snap.forEach((d) =>
      list.push({ id: d.id, ...(d.data() as Omit<ChatConversation, "id">) }),
    );
    list.sort((a, b) => {
      const aSelf = a.participantIds.length === 1 ? 1 : 0;
      const bSelf = b.participantIds.length === 1 ? 1 : 0;
      if (aSelf !== bSelf) return bSelf - aSelf;
      return b.lastMessageAt - a.lastMessageAt;
    });
    cb(list);
  });
}

export function subscribeMessages(
  convId: string,
  cb: (msgs: ChatMessage[]) => void,
): Unsubscribe {
  const q = query(
    collection(db!, "conversations", convId, "messages"),
    orderBy("createdAt", "asc"),
  );
  return onSnapshot(q, (snap) => {
    const msgs: ChatMessage[] = [];
    snap.forEach((d) =>
      msgs.push({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }),
    );
    cb(msgs);
  });
}

export async function sendMessage(
  convId: string,
  senderId: string,
  text: string,
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const convRef = doc(db!, "conversations", convId);

  await runTransaction(db!, async (tx) => {
    const snap = await tx.get(convRef);
    if (!snap.exists()) throw new Error("La conversación ya no existe.");
    const data = snap.data() as {
      participantIds: string[];
      unread: Record<string, number>;
    };
    if (!data.participantIds.includes(senderId)) {
      throw new Error("No puedes enviar mensajes en esta conversación.");
    }
    const otherId = data.participantIds.find((id) => id !== senderId);
    const msgRef = doc(collection(convRef, "messages"));
    const now = Date.now();
    const patch: Record<string, unknown> = {
      lastMessage: clean,
      lastMessageAt: now,
      [`unread.${senderId}`]: 0,
    };
    if (otherId) {
      patch[`unread.${otherId}`] = (data.unread?.[otherId] ?? 0) + 1;
    }

    tx.set(msgRef, { senderId, text: clean, createdAt: now });
    tx.update(convRef, patch);
  });
}

export function markConversationRead(convId: string, uid: string): void {
  updateDoc(doc(db!, "conversations", convId), { [`unread.${uid}`]: 0 }).catch(
    () => {},
  );
}

export async function editMessage(
  convId: string,
  msgId: string,
  text: string,
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const msgRef = doc(db!, "conversations", convId, "messages", msgId);
  const now = Date.now();

  const convRef = doc(db!, "conversations", convId);

  await runTransaction(db!, async (tx) => {
    const snap = await tx.get(msgRef);
    if (!snap.exists()) throw new Error("El mensaje ya no existe.");

    const convSnap = await tx.get(convRef);
    const msg = snap.data() as { createdAt: number; text: string };
    const convData = convSnap.exists()
      ? (convSnap.data() as { lastMessage: string; lastMessageAt: number })
      : null;

    tx.update(msgRef, { text: clean, edited: true, editedAt: now });

    if (
      convData &&
      convData.lastMessageAt === msg.createdAt &&
      convData.lastMessage === msg.text
    ) {
      tx.update(convRef, { lastMessage: clean });
    }
  });
}

export async function deleteMessage(convId: string, msgId: string): Promise<void> {
  await deleteDoc(doc(db!, "conversations", convId, "messages", msgId));
}