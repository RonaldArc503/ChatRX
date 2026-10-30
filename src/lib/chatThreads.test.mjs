import assert from "node:assert/strict";
import test from "node:test";
import { buildMessageThreads, sameMessageDelivery } from "./chatThreads.ts";

const message = (id, parent, senderId = "user", text = id) => ({
  id, senderId, text, createdAt: 1,
  ...(parent ? { replyTo: { id: parent, senderId: "user", text: "original" } } : {}),
});

test("nested replies share the original root and retain their input order", () => {
  const list = [message("a"), message("b", "a"), message("c", "b"), message("d")];
  const threads = buildMessageThreads(list);
  assert.deepEqual(threads.timeline.map(m => m.id), ["a", "d"]);
  assert.deepEqual(threads.repliesByRoot.get("a").map(m => m.id), ["b", "c"]);
  assert.equal(threads.rootById.get("c"), "a");
});

test("replies can arrive before their root", () => {
  const threads = buildMessageThreads([message("c", "b"), message("b", "a"), message("a")]);
  assert.equal(threads.rootById.get("c"), "a");
  assert.deepEqual(threads.timeline.map(m => m.id), ["a"]);
});

test("deleting or hiding a root keeps its surviving replies accessible", () => {
  const threads = buildMessageThreads([message("b", "deleted"), message("c", "b"), message("d", "deleted")]);
  assert.deepEqual(threads.timeline.map(m => m.id), ["b", "d"]);
  assert.deepEqual(threads.repliesByRoot.get("b").map(m => m.id), ["c"]);
});

test("reply cycles and self references never remove messages", () => {
  const threads = buildMessageThreads([message("a", "b"), message("b", "a"), message("c", "c")]);
  assert.deepEqual(threads.timeline.map(m => m.id), ["a", "b", "c"]);
});

test("independent threads do not mix their responses", () => {
  const threads = buildMessageThreads([message("a"), message("b"), message("a1", "a"), message("b1", "b")]);
  assert.deepEqual(threads.repliesByRoot.get("a").map(m => m.id), ["a1"]);
  assert.deepEqual(threads.repliesByRoot.get("b").map(m => m.id), ["b1"]);
});

test("identical queued text in different threads is not treated as delivered", () => {
  assert.equal(sameMessageDelivery(message("local", "a", "user", "Sí"), message("real", "b", "user", "Sí")), false);
  assert.equal(sameMessageDelivery(message("local", "a", "user", "Sí"), message("real", "a", "user", "Sí")), true);
  assert.equal(sameMessageDelivery(message("local", "a", "user", "Sí"), message("real", null, "user", "Sí")), false);
});

test("a previous identical reply does not hide a newly queued response", () => {
  assert.equal(sameMessageDelivery(message("old", "a", "user", "Sí"), { ...message("queued", "a", "user", "Sí"), createdAt: 2 }), false);
});
