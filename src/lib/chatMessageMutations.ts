import { collection, doc, getDocs, limit, orderBy, query, runTransaction, type Firestore } from "firebase/firestore";
import type { ChatAttachment, ChatMessage, PinnedMessage } from "./chat";
import { messageIndexEntries, messageSearchData } from "./chatSearchIndex.ts";
import { trimFormattedText, type TextFormat } from "./messageFormatting.ts";

export async function editChatMessage(db: Firestore, conversationId: string, messageId: string,
  text: string, formatting?: TextFormat[]): Promise<void> {
  const clean = trimFormattedText(text, formatting);
  if (!clean.text) throw new Error("El mensaje no puede estar vacío.");
  const reference = doc(db, "conversations", conversationId, "messages", messageId);
  const conversation = doc(db, "conversations", conversationId);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(reference);
    if (!snapshot.exists()) throw new Error("El mensaje ya no existe.");
    const chat = (await tx.get(conversation)).data()!;
    const before = snapshot.data() as ChatMessage;
    const message = { ...before, text: clean.text };
    const indexes = await messageIndexEntries(conversationId, messageId, chat.participantIds, message);
    tx.update(reference, { text: clean.text, formatting: clean.formatting, edited: true, editedAt: Date.now(),
      ...messageSearchData(clean.text, message.attachments) });
    indexes.forEach(index => tx.set(doc(db, "globalChatSearch", index.id), index.data));
    const patch: Record<string, unknown> = {};
    if (chat.lastMessageAt === before.createdAt) patch.lastMessage = clean.text;
    const pins: PinnedMessage[] = chat.pinnedMessages ?? [];
    if (pins.some(pin => pin.id === messageId)) patch.pinnedMessages = pins.map(pin => pin.id === messageId ? { ...pin, text: clean.text } : pin);
    if (Object.keys(patch).length) tx.update(conversation, patch);
  });
}

export async function deleteChatMessage(db: Firestore, conversationId: string, messageId: string): Promise<void> {
  const conversation = doc(db, "conversations", conversationId);
  const reference = doc(conversation, "messages", messageId);
  const deletedAt = await runTransaction(db, async tx => {
    const target = await tx.get(reference);
    if (!target.exists()) return null;
    const chat = (await tx.get(conversation)).data()!;
    const message = target.data() as ChatMessage;
    const rootId = message.threadRootId ?? message.replyTo?.id;
    const rootRef = rootId && rootId !== messageId ? doc(conversation, "messages", rootId) : null;
    const root = rootRef ? await tx.get(rootRef) : null;
    const indexes = await messageIndexEntries(conversationId, messageId, chat.participantIds, message);
    tx.delete(reference);
    indexes.forEach(index => tx.delete(doc(db, "globalChatSearch", index.id)));
    if (rootRef && root?.exists() && (root.data().replyCount ?? 0) > 0) tx.update(rootRef, { replyCount: root.data().replyCount - 1 });
    const pins: PinnedMessage[] = chat.pinnedMessages ?? [];
    if (pins.some(pin => pin.id === messageId)) tx.update(conversation, { pinnedMessages: pins.filter(pin => pin.id !== messageId) });
    return message.createdAt;
  });
  if (deletedAt == null) return;
  const latest = (await getDocs(query(collection(conversation, "messages"), orderBy("createdAt", "desc"), limit(1)))).docs[0];
  await runTransaction(db, async tx => {
    const chat = (await tx.get(conversation)).data()!;
    const candidate = latest ? await tx.get(latest.ref) : null;
    if (chat.lastMessageAt !== deletedAt || (candidate && !candidate.exists())) return;
    const message = candidate?.data() as { text?: string; attachments?: ChatAttachment[]; createdAt: number } | undefined;
    const files = message?.attachments ?? [];
    const preview = !message?.text?.trim() && files.length
      ? `📎 ${files[0].name}${files.length > 1 ? ` (+${files.length - 1})` : ""}` : message?.text ?? "";
    tx.update(conversation, { lastMessage: preview, lastMessageAt: message?.createdAt ?? 0 });
  });
}
