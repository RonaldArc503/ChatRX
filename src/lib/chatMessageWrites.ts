import { collection, doc, runTransaction, updateDoc, type Firestore } from "firebase/firestore";
import type { ChatAttachment, ForwardedFrom, ReplyInfo } from "./chat";
import { trimFormattedText, type TextFormat } from "./messageFormatting.ts";

/** A rejection belongs to its caller; it must not block the following message. */
export function createConversationWriteQueue() {
  const tails = new Map<string, Promise<void>>();
  return function enqueue<T>(conversation: string, operation: () => Promise<T>): Promise<T> {
    const result = (tails.get(conversation) ?? Promise.resolve()).then(operation);
    const settled = result.then(() => {}, () => {});
    tails.set(conversation, settled);
    void settled.then(() => { if (tails.get(conversation) === settled) tails.delete(conversation); });
    return result;
  };
}

const queues = new WeakMap<Firestore, ReturnType<typeof createConversationWriteQueue>>();
const readRequests = new WeakMap<Firestore, Map<string, Promise<void>>>();

function queueFor(db: Firestore) {
  let queue = queues.get(db);
  if (!queue) { queue = createConversationWriteQueue(); queues.set(db, queue); }
  return queue;
}

interface MessageToSend {
  convId: string;
  senderId: string;
  text: string;
  formatting?: TextFormat[];
  replyTo?: ReplyInfo | null;
  attachments?: ChatAttachment[];
  mentions?: string[];
  forwardedFrom?: ForwardedFrom | null;
}

export function sendConversationMessage(db: Firestore, input: MessageToSend): Promise<void> {
  const { text: clean, formatting } = trimFormattedText(input.text, input.formatting);
  if (!clean && !input.attachments?.length) return Promise.resolve();
  const convRef = doc(db, "conversations", input.convId);
  // One ID per send, including all transaction retries.
  const msgRef = doc(collection(convRef, "messages"));
  return queueFor(db)(input.convId, () => runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(convRef);
    if (!snapshot.exists()) throw new Error("La conversación ya no existe.");
    const conversation = snapshot.data() as {
      participantIds: string[];
      unread?: Record<string, number>;
      lastMessageAt?: number;
    };
    if (!conversation.participantIds.includes(input.senderId)) throw new Error("No puedes enviar mensajes en esta conversación.");
    const now = Math.max(Date.now(), Number.isFinite(conversation.lastMessageAt) ? conversation.lastMessageAt! + 1 : 0);
    const preview = !clean && input.attachments?.length
      ? `📎 ${input.attachments[0].name}${input.attachments.length > 1 ? ` (+${input.attachments.length - 1})` : ""}`
      : clean;
    const patch: Record<string, unknown> = {
      lastMessage: preview,
      lastMessageAt: now,
      [`unread.${input.senderId}`]: 0,
    };
    const mentions = input.mentions ?? [];
    for (const id of conversation.participantIds) {
      if (id !== input.senderId) patch[`unread.${id}`] = (conversation.unread?.[id] ?? 0) + (mentions.includes(id) ? 2 : 1);
    }
    const message: Record<string, unknown> = { senderId: input.senderId, text: clean, createdAt: now, conversationId: input.convId };
    if (formatting.length) message.formatting = formatting;
    if (input.replyTo) message.replyTo = input.replyTo;
    if (input.attachments?.length) message.attachments = input.attachments;
    if (mentions.length) message.mentions = mentions;
    if (input.forwardedFrom) message.forwardedFrom = input.forwardedFrom;
    transaction.set(msgRef, message);
    transaction.update(convRef, patch);
  }, { maxAttempts: 10 }));
}

export function markConversationReadOnce(db: Firestore, convId: string, uid: string): Promise<void> {
  let requests = readRequests.get(db);
  if (!requests) { requests = new Map(); readRequests.set(db, requests); }
  const key = `${convId}:${uid}`;
  const existing = requests.get(key);
  if (existing) return existing;
  // A receipt must not wait behind a long burst and mark later, unseen messages
  // as read after the user has left the conversation.
  const request = updateDoc(doc(db, "conversations", convId), { [`unread.${uid}`]: 0 });
  requests.set(key, request);
  const cleanup = () => { if (requests.get(key) === request) requests.delete(key); };
  void request.then(cleanup, cleanup);
  return request;
}
