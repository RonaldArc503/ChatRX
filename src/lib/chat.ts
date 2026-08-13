import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
  kind?: "dm" | "group";
  name?: string;
  pinnedMessages?: PinnedMessage[];
}

export interface ReplyInfo {
  id: string;
  text: string;
  senderId: string;
}

export interface ForwardedFrom {
  uid: string;
  name: string;
}

export interface PinnedMessage extends ReplyInfo {
  pinnedAt: number;
}

export interface ChatAttachment {
  kind: "image" | "video" | "pdf" | "doc" | "file" | "audio";
  resourceType: string;
  url: string;
  publicId: string;
  name: string;
  size: number;
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  pages?: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  edited?: boolean;
  editedAt?: number;
  replyTo?: ReplyInfo | null;
  reactions?: Record<string, string>;
  attachments?: ChatAttachment[];
  mentions?: string[];
  forwardedFrom?: ForwardedFrom | null;
}

export function conversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join("__");
}

export function isGroupConversation(conv: Pick<ChatConversation, "kind" | "name">): boolean {
  return conv.kind === "group" || conv.name !== undefined;
}

function memberSnapshot(p: UserProfile): MemberSnapshot {
  return {
    displayName: p.displayName,
    photoURL: p.photoURL,
    phone: p.phone,
  };
}

export async function createGroup(
  me: UserProfile,
  name: string,
  memberProfiles: UserProfile[],
): Promise<string | null> {
  const clean = name.trim();
  if (!clean || memberProfiles.length === 0) return null;

  const members: Record<string, MemberSnapshot> = {
    [me.uid]: memberSnapshot(me),
  };
  for (const p of memberProfiles) {
    if (p.uid !== me.uid) members[p.uid] = memberSnapshot(p);
  }
  const participantIds = Object.keys(members);

  const ref = doc(collection(db!, "conversations"));
  const now = Date.now();
  await setDoc(ref, {
    participantIds,
    members,
    unread: Object.fromEntries(participantIds.map((uid) => [uid, 0])),
    lastMessage: "",
    lastMessageAt: 0,
    createdAt: now,
    kind: "group",
    name: clean,
  });
  return ref.id;
}

export async function addGroupMembers(
  convId: string,
  profiles: UserProfile[],
): Promise<void> {
  const ref = doc(db!, "conversations", convId);
  const members: Record<string, MemberSnapshot> = {};
  for (const p of profiles) members[p.uid] = memberSnapshot(p);
  const uids = Object.keys(members);
  const snap = await getDoc(ref);
  const current = (snap.exists() ? snap.data() : {}) as {
    unread?: Record<string, number>;
  };
  const unreadPatch: Record<string, number> = {};
  for (const uid of uids) unreadPatch[`unread.${uid}`] = current.unread?.[uid] ?? 0;

  await updateDoc(ref, {
    participantIds: arrayUnion(...uids),
    members,
    ...unreadPatch,
  });
}

export async function removeGroupMember(
  convId: string,
  uid: string,
): Promise<void> {
  const ref = doc(db!, "conversations", convId);
  await updateDoc(ref, {
    participantIds: arrayRemove(uid),
    [`members.${uid}`]: deleteField(),
  });
}

export async function renameGroup(convId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  await updateDoc(doc(db!, "conversations", convId), { name: clean });
}

export async function syncProfileInConversations(
  uid: string,
  snapshot: MemberSnapshot,
): Promise<void> {
  const q = query(
    collection(db!, "conversations"),
    where("participantIds", "array-contains", uid),
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db!);
  snap.forEach((d) => {
    batch.update(d.ref, { [`members.${uid}`]: snapshot });
  });
  await batch.commit();
}

export async function leaveGroup(convId: string, uid: string): Promise<void> {
  await removeGroupMember(convId, uid);
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
  replyTo?: ReplyInfo | null,
  attachments?: ChatAttachment[],
  mentions?: string[],
  forwardedFrom?: ForwardedFrom | null,
): Promise<void> {
  const clean = text.trim();
  if (!clean && (!attachments || attachments.length === 0)) return;
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
    const otherIds = data.participantIds.filter((id) => id !== senderId);
    const msgRef = doc(collection(convRef, "messages"));
    const now = Date.now();
    const preview =
      !clean && attachments && attachments.length > 0
        ? `📎 ${attachments[0].name}${
            attachments.length > 1 ? ` (+${attachments.length - 1})` : ""
          }`
        : clean;
    const patch: Record<string, unknown> = {
      lastMessage: preview,
      lastMessageAt: now,
      [`unread.${senderId}`]: 0,
    };
    const mentioned = mentions ?? [];
    for (const id of otherIds) {
      patch[`unread.${id}`] =
        (data.unread?.[id] ?? 0) + (mentioned.includes(id) ? 2 : 1);
    }

    const msgData: Record<string, unknown> = {
      senderId,
      text: clean,
      createdAt: now,
    };
    if (replyTo) msgData.replyTo = replyTo;
    if (attachments && attachments.length > 0) {
      msgData.attachments = attachments;
    }
    if (mentioned.length > 0) {
      msgData.mentions = mentioned;
    }
    if (forwardedFrom) {
      msgData.forwardedFrom = forwardedFrom;
    }

    tx.set(msgRef, msgData);
    tx.update(convRef, patch);
  });
}

export function markConversationRead(convId: string, uid: string): void {
  updateDoc(doc(db!, "conversations", convId), { [`unread.${uid}`]: 0 }).catch(
    () => {},
  );
}

export async function pinMessage(
  convId: string,
  msg: Pick<ChatMessage, "id" | "text" | "senderId">,
): Promise<void> {
  const convRef = doc(db!, "conversations", convId);
  const pinned: PinnedMessage = {
    id: msg.id,
    text: msg.text,
    senderId: msg.senderId,
    pinnedAt: Date.now(),
  };

  await runTransaction(db!, async (tx) => {
    const snap = await tx.get(convRef);
    const existing = (snap.exists()
      ? (snap.data() as { pinnedMessages?: PinnedMessage[] }).pinnedMessages
      : undefined) ?? [];
    const next = [
      pinned,
      ...existing.filter((p) => p.id !== msg.id),
    ];
    tx.update(convRef, { pinnedMessages: next });
  });
}

export async function unpinMessage(convId: string, msgId: string): Promise<void> {
  const convRef = doc(db!, "conversations", convId);
  await runTransaction(db!, async (tx) => {
    const snap = await tx.get(convRef);
    const existing = (snap.exists()
      ? (snap.data() as { pinnedMessages?: PinnedMessage[] }).pinnedMessages
      : undefined) ?? [];
    tx.update(convRef, {
      pinnedMessages: existing.filter((p) => p.id !== msgId),
    });
  });
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
  const msgRef = doc(db!, "conversations", convId, "messages", msgId);
  const target = await getDoc(msgRef);
  if (!target.exists()) return;
  await deleteDoc(msgRef);

  const latest = await getDocs(
    query(
      collection(db!, "conversations", convId, "messages"),
      orderBy("createdAt", "desc"),
      limit(1),
    ),
  );
  const convRef = doc(db!, "conversations", convId);
  if (latest.empty) {
    await updateDoc(convRef, { lastMessage: "", lastMessageAt: 0 });
    return;
  }
  const m = latest.docs[0].data() as {
    text?: string;
    createdAt: number;
    attachments?: ChatAttachment[];
  };
  const preview =
    (!m.text || m.text.trim().length === 0) &&
    m.attachments &&
    m.attachments.length > 0
      ? `📎 ${m.attachments[0].name}${
          m.attachments.length > 1 ? ` (+${m.attachments.length - 1})` : ""
        }`
      : m.text ?? "";
  await updateDoc(convRef, {
    lastMessage: preview,
    lastMessageAt: m.createdAt,
  });
}

export async function toggleReaction(
  convId: string,
  msgId: string,
  uid: string,
  emoji: string,
): Promise<void> {
  const msgRef = doc(db!, "conversations", convId, "messages", msgId);

  await runTransaction(db!, async (tx) => {
    const snap = await tx.get(msgRef);
    if (!snap.exists()) throw new Error("El mensaje ya no existe.");
    const reactions = (snap.data()?.reactions ?? {}) as Record<string, string>;
    const next = { ...reactions };
    if (next[uid] === emoji) {
      delete next[uid];
    } else {
      next[uid] = emoji;
    }
    const patch: Record<string, unknown> = { reactions: next };
    if (Object.keys(next).length === 0) {
      patch.reactions = deleteField();
    }
    tx.update(msgRef, patch);
  });
}