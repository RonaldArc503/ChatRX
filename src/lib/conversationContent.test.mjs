import test from "node:test";
import assert from "node:assert/strict";
import { conversationAttachments, conversationLinks, conversationPins, searchConversationMessages, searchMessagePreview } from "./conversationContent.ts";

const attachment = (name, kind = "image") => ({ name, kind, url: "https://example.com/image.png", publicId: name, size: 120, mimeType: "image/png", resourceType: "image" });
const messages = [
  { id: "first", senderId: "a", text: "Reunión del miércoles https://taskly.app, https://taskly.app.", createdAt: 1, attachments: [attachment("Foto.png"), attachment("Notas.pdf", "pdf")] },
  { id: "reply", senderId: "b", text: "Confirmado el café", createdAt: 2, replyTo: { id: "first", text: "Reunión", senderId: "a" }, attachments: [attachment("Canción.mp3", "audio")] },
  { id: "last", senderId: "a", text: "https://taskly.app https://secret.example/code https://other.example", createdAt: 3,
    formatting: [{ start: 18, end: 45, style: "codeBlock" }] },
];

test("media includes all attachments, newest first, without mutating the timeline", () => {
  const result = conversationAttachments(messages);
  assert.deepEqual(result.map((entry) => entry.attachment.name), ["Canción.mp3", "Foto.png", "Notas.pdf"]);
  assert.equal(new Set(result.map((entry) => entry.id)).size, 3);
  assert.equal(messages[0].id, "first");
  assert.deepEqual(conversationAttachments([]), []);
});

test("links strip punctuation, deduplicate per message, and exclude literal code", () => {
  assert.deepEqual(conversationLinks(messages).map(({ message, url }) => [message.id, url]), [
    ["last", "https://taskly.app"], ["last", "https://other.example"], ["first", "https://taskly.app"],
  ]);
});

test("pins use current visible content and exclude hidden, missing or duplicated pins", () => {
  const result = conversationPins(messages.filter((message) => message.id !== "reply"), [
    { id: "first", text: "stale", pinnedAt: 1 }, { id: "reply", pinnedAt: 2 }, { id: "missing", pinnedAt: 5 },
    { id: "last", pinnedAt: 4 }, { id: "first", pinnedAt: 3 },
  ]);
  assert.deepEqual(result.map(({ message }) => message.id), ["last", "first"]);
  assert.equal(result[1].message.text, messages[0].text);
});

test("search finds accents, case, filenames, author names and replies within supplied conversation", () => {
  const author = (message) => message.senderId === "a" ? "María" : "José";
  assert.deepEqual(searchConversationMessages(messages, "MIERCOLES maria", author).map((message) => message.id), ["first"]);
  assert.deepEqual(searchConversationMessages(messages, "cancion jose", author).map((message) => message.id), ["reply"]);
  assert.deepEqual(searchConversationMessages(messages, "taskly.app").map((message) => message.id), ["last", "first"]);
  assert.deepEqual(searchConversationMessages([], "café"), []);
  assert.deepEqual(searchConversationMessages(messages, "   "), []);
  assert.deepEqual(searchConversationMessages(messages.filter((message) => message.id !== "reply"), "café"), []);
  assert.equal(searchMessagePreview({ text: "", attachments: [attachment("Notas.pdf")] }, "pdf"), "Notas.pdf");
  assert.match(searchMessagePreview({ text: "x".repeat(400) + " objetivo " + "x".repeat(400) }, "objetivo"), /objetivo/);
});
