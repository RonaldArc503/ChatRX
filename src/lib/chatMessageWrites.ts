import { collection, doc, runTransaction, updateDoc, writeBatch, type Firestore } from "firebase/firestore";
import type { ChatAttachment, ForwardedFrom, ReplyInfo } from "./chat";
import { messageIndexEntries, messageSearchData } from "./chatSearchIndex.ts";
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
    const parentRef = input.replyTo?.id ? doc(convRef, "messages", input.replyTo.id) : null;
    const parent = parentRef ? await transaction.get(parentRef) : null;
    const rootId = parent?.exists() ? (parent.data().threadRootId ?? parent!.id) as string : null;
    const rootRef = rootId ? doc(convRef, "messages", rootId) : null;
    const root = rootRef && rootId !== parent?.id ? await transaction.get(rootRef) : parent;
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
    Object.assign(message, messageSearchData(clean, input.attachments));
    if (rootId) message.threadRootId = rootId;
    if (formatting.length) message.formatting = formatting;
    if (input.replyTo) message.replyTo = input.replyTo;
    if (input.attachments?.length) message.attachments = input.attachments;
    if (mentions.length) message.mentions = mentions;
    if (input.forwardedFrom) message.forwardedFrom = input.forwardedFrom;
    const indexes = await messageIndexEntries(input.convId, msgRef.id, conversation.participantIds,
      { senderId: input.senderId, createdAt: now, text: clean, attachments: input.attachments });
    transaction.set(msgRef, message);
    transaction.update(convRef, patch);
    if (rootRef && root?.exists()) transaction.update(rootRef, { replyCount: (root.data().replyCount ?? 0) + 1 });
    indexes.slice(0, 200).forEach(index => {
      transaction.set(doc(db, "globalChatSearch", index.id), index.data);
      if (index.data.userId !== input.senderId) transaction.set(doc(db, "users", index.data.userId, "chatStates", input.convId),
        { archived: false, archivedAt: 0 }, { merge: true });
    });
    return indexes.slice(200);
  }, { maxAttempts: 10 }).then(async remaining => {
    for (let offset = 0; offset < remaining.length; offset += 200) {
      const batch = writeBatch(db);
      remaining.slice(offset, offset + 200).forEach(index => {
        batch.set(doc(db, "globalChatSearch", index.id), index.data);
        if (index.data.userId !== input.senderId) batch.set(doc(db, "users", index.data.userId, "chatStates", input.convId),
          { archived: false, archivedAt: 0 }, { merge: true });
      });
      await batch.commit().catch(error => console.error("No se pudieron actualizar los índices adicionales del grupo", error));
    }
  }));
}

export function markConversationReadOnce(db: Firestore, convId: string, uid: string, message?: { id: string; createdAt: number }): Promise<void> {
  let requests = readRequests.get(db);
  if (!requests) { requests = new Map(); readRequests.set(db, requests); }
  const key = `${convId}:${uid}:${message?.id ?? ""}`;
  const existing = requests.get(key);
  if (existing) return existing;
  // A receipt must not wait behind a long burst and mark later, unseen messages
  // as read after the user has left the conversation.
  const conversation = doc(db, "conversations", convId);
  const request = message ? runTransaction(db, async tx => {
    const receiptRef = doc(conversation, "receipts", uid);
    const receipt = (await tx.get(receiptRef)).data() ?? {};
    const chat = (await tx.get(conversation)).data();
    if (message.createdAt > (receipt.lastReadAt ?? 0)) tx.set(receiptRef, {
      lastReadAt: message.createdAt, lastReadMessageId: message.id,
      lastDeliveredAt: Math.max(message.createdAt, receipt.lastDeliveredAt ?? 0),
      lastDeliveredMessageId: (receipt.lastDeliveredAt ?? 0) > message.createdAt ? receipt.lastDeliveredMessageId : message.id,
      updatedAt: Date.now(),
    }, { merge: true });
    if ((chat?.lastMessageAt ?? 0) <= message.createdAt && (chat?.unread?.[uid] ?? 0) > 0) tx.update(conversation, { [`unread.${uid}`]: 0 });
  }) : updateDoc(conversation, { [`unread.${uid}`]: 0 });
  requests.set(key, request);
  const cleanup = () => { if (requests.get(key) === request) requests.delete(key); };
  void request.then(cleanup, cleanup);
  return request;
}
