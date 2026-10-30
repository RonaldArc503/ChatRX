import type { ChatMessage } from "./chat";
import { sameFormatting } from "./messageFormatting.ts";

/** Replies stay in the existing message collection so other clients can read them. */
export function buildMessageThreads(messages: ChatMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const rootById = new Map<string, string>();

  for (const message of messages) {
    if (rootById.has(message.id)) continue;
    const path: string[] = [];
    const visited = new Set<string>();
    let current = message;
    let root = current.id;
    while (true) {
      if (rootById.has(current.id)) {
        root = rootById.get(current.id)!;
        break;
      }
      if (visited.has(current.id)) {
        // Malformed reply cycles must never hide messages from the conversation.
        path.forEach((id) => rootById.set(id, id));
        break;
      }
      visited.add(current.id);
      path.push(current.id);
      const parent = current.replyTo ? byId.get(current.replyTo.id) : undefined;
      if (!parent) {
        root = current.id;
        break;
      }
      current = parent;
    }
    path.forEach((id) => { if (!rootById.has(id)) rootById.set(id, root); });
  }

  const repliesByRoot = new Map<string, ChatMessage[]>();
  const timeline: ChatMessage[] = [];
  for (const message of messages) {
    const root = rootById.get(message.id)!;
    if (root === message.id) timeline.push(message);
    else {
      const replies = repliesByRoot.get(root) ?? [];
      replies.push(message);
      repliesByRoot.set(root, replies);
    }
  }
  return { timeline, repliesByRoot, rootById };
}

/** Match queued deliveries within the same reply context, never across threads. */
export function sameMessageDelivery(first: ChatMessage, second: ChatMessage) {
  return first.senderId === second.senderId && first.text === second.text &&
    sameFormatting(first.text, first.formatting, second.formatting) &&
    first.createdAt >= second.createdAt &&
    (first.replyTo?.id ?? null) === (second.replyTo?.id ?? null);
}
