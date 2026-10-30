import assert from "node:assert/strict";
import test from "node:test";
import { createConversationWriteQueue } from "./chatMessageWrites.ts";

test("a burst executes in submission order with one active write per conversation", async () => {
  const enqueue = createConversationWriteQueue();
  let active = 0;
  let peak = 0;
  const delivered = [];
  const writes = Array.from({ length: 100 }, (_, index) => enqueue("chat", async () => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    delivered.push(index);
    active--;
  }));
  await Promise.all(writes);
  assert.equal(peak, 1);
  assert.deepEqual(delivered, Array.from({ length: 100 }, (_, index) => index));
});

test("a failed write is reported and does not discard later messages", async () => {
  const enqueue = createConversationWriteQueue();
  const first = enqueue("chat", async () => { throw new Error("permission-denied"); });
  const second = enqueue("chat", async () => "delivered");
  await assert.rejects(first, /permission-denied/);
  assert.equal(await second, "delivered");
  assert.equal(await enqueue("chat", async () => "next burst"), "next burst");
});

test("independent conversations can continue while another write is pending", async () => {
  const enqueue = createConversationWriteQueue();
  let release;
  const blocked = enqueue("chat-a", () => new Promise(resolve => { release = resolve; }));
  assert.equal(await enqueue("chat-b", async () => "delivered"), "delivered");
  release();
  await blocked;
});
