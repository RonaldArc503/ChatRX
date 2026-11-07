import type { ChatAttachment } from "./chat";

export async function chatDocumentId(prefix: string, value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return prefix + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Same normalization and bounds as Android ChatSearchNormalizer. */
export function chatSearchTerms(values: string[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const normalized = value.toLowerCase().trim().normalize("NFD").replace(/\p{M}+/gu, "")
      .replace(/[^a-z0-9@._ -]/g, " ").replace(/\s+/g, " ").trim();
    for (const token of [...normalized.split(" "), normalized]) {
      for (let size = 2; size <= Math.min(token.length, 32); size++) {
        result.add(token.slice(0, size));
        if (result.size === 200) return [...result];
      }
    }
  }
  return [...result];
}

export function messageSearchData(text: string, attachments: ChatAttachment[] = []) {
  const kinds = new Set<string>();
  if (text.trim()) kinds.add("message");
  attachments.forEach(file => kinds.add(file.kind));
  if (/https?:\/\/\S+/i.test(text)) kinds.add("link");
  return { searchTerms: chatSearchTerms([text, ...attachments.map(file => file.name)]), contentKinds: [...kinds] };
}

export async function messageIndexEntries(conversationId: string, messageId: string,
  participants: string[], message: { senderId: string; createdAt: number; text?: string; attachments?: ChatAttachment[] }) {
  const search = messageSearchData(message.text ?? "", message.attachments);
  return Promise.all(participants.map(async userId => ({
    id: await chatDocumentId("gcs_", `${userId}|${conversationId}|${messageId}`),
    data: { userId, conversationId, messageId, senderId: message.senderId, createdAt: message.createdAt, ...search },
  })));
}
