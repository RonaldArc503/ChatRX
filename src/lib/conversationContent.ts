import type { ChatMessage, PinnedMessage } from "./chat";
import { splitLinks } from "../components/chat/linkify.ts";

export type ConversationTab = "messages" | "media" | "links" | "pins";
export const CONVERSATION_TABS = [
  ["messages", "Mensajes"], ["media", "Multimedia"], ["links", "Enlaces"], ["pins", "Pines"],
] as const;

export function conversationAttachments(messages: ChatMessage[]) {
  return [...messages].reverse().flatMap((message) => (message.attachments ?? []).map((attachment, index) => ({
    id: `${message.id}:${index}`, message, attachment,
  })));
}

export function conversationLinks(messages: ChatMessage[]) {
  return [...messages].reverse().flatMap((message) => {
    const seen = new Set<string>();
    let offset = 0;
    return splitLinks(message.text).flatMap((part) => {
      const start = offset;
      offset += part.text.length;
      const code = message.formatting?.some((range) => (range.style === "code" || range.style === "codeBlock") && range.start < offset && range.end > start);
      if (!part.url || code || seen.has(part.url)) return [];
      seen.add(part.url);
      return [{ id: `${message.id}:${start}`, message, url: part.url }];
    });
  });
}

export function conversationPins(messages: ChatMessage[], pins: PinnedMessage[]) {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const seen = new Set<string>();
  return [...pins].sort((a, b) => b.pinnedAt - a.pinnedAt).flatMap((pin) => {
    const message = byId.get(pin.id);
    if (!message || seen.has(pin.id)) return [];
    seen.add(pin.id);
    return [{ message, pinnedAt: pin.pinnedAt }];
  });
}

export function foldSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

export function searchConversationMessages(messages: ChatMessage[], query: string, authorName: (message: ChatMessage) => string = () => "") {
  const terms = foldSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return [...messages].reverse().filter((message) => {
    const haystack = foldSearch([message.text, authorName(message), ...(message.attachments ?? []).map((attachment) => attachment.name)].join("\n"));
    return terms.every((term) => haystack.includes(term));
  });
}

export function searchMessagePreview(message: ChatMessage, query: string) {
  const text = message.text || message.attachments?.map((attachment) => attachment.name).join(", ") || "Adjunto";
  const first = foldSearch(query).trim().split(/\s+/)[0] ?? "";
  const match = foldSearch(text).indexOf(first);
  const start = Math.max(0, match - 60);
  return `${start ? "…" : ""}${text.slice(start, start + 260)}${text.length > start + 260 ? "…" : ""}`;
}
