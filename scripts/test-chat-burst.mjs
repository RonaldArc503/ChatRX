import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, setDoc } from "firebase/firestore";
import { markConversationReadOnce, sendConversationMessage } from "../src/lib/chatMessageWrites.ts";

// This test must never connect to a live Firebase project.
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(emulator ?? "", /^(127\.0\.0\.1|localhost):\d+$/, "Run this test through the local Firestore emulator.");
const [host, port] = emulator.split(":");
const projectId = "demo-taskly-chat-burst";
const apps = [];
function client(uid) {
  const app = initializeApp({ projectId, apiKey: "demo-key", appId: `demo-${uid}` }, `burst-${uid}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } });
  return db;
}

let stopReader = () => {};
try {
  const alice = client("alice");
  const bob = client("bob");
  const charlie = client("charlie");
  const convId = `burst-${Date.now()}`;
  await setDoc(doc(alice, "conversations", convId), {
    kind: "group", name: "Prueba de ráfaga", participantIds: ["alice", "bob", "charlie"],
    unread: { alice: 0, bob: 0, charlie: 0 }, lastMessage: "", lastMessageAt: 0, createdAt: 0,
  });
  await setDoc(doc(alice, "conversations", convId, "messages", "seed"), {
    senderId: "alice", text: "Mensaje original", createdAt: 0, conversationId: convId,
  });

  const reading = new Set();
  const readErrors = [];
  stopReader = onSnapshot(doc(bob, "conversations", convId), (snapshot) => {
    if ((snapshot.data()?.unread?.bob ?? 0) === 0) return;
    const request = markConversationReadOnce(bob, convId, "bob");
    reading.add(request);
    void request.then(() => reading.delete(request), error => { readErrors.push(error); reading.delete(request); });
  }, error => readErrors.push(error));

  const root = { id: "seed", text: "Mensaje original", senderId: "alice" };
  const writes = [
    ...Array.from({ length: 100 }, (_, index) => sendConversationMessage(alice, {
      convId, senderId: "alice", text: `alice-${index}`,
      formatting: index === 0 ? [{ start: 0, end: 5, style: "bold" }, { start: 2, end: 7, style: "italic" }, { start: 1, end: 4, style: "underline" }] : undefined,
      replyTo: index % 3 === 0 ? root : undefined,
      mentions: index % 5 === 0 ? ["charlie"] : undefined,
      attachments: index === 99 ? [{ kind: "pdf", resourceType: "raw", url: "https://example.test/sample.pdf", publicId: "sample", name: "sample.pdf", size: 10, mimeType: "application/pdf" }] : undefined,
    })),
    ...Array.from({ length: 30 }, (_, index) => sendConversationMessage(bob, {
      convId, senderId: "bob", text: `bob-${index}`,
    })),
  ];
  const results = await Promise.allSettled(writes);
  const failures = results.filter(result => result.status === "rejected");
  assert.deepEqual(failures, [], "Every message must complete, including under cross-client contention.");

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await Promise.all([...reading]);
    if ((await getDoc(doc(bob, "conversations", convId))).data().unread.bob === 0) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.deepEqual(readErrors, []);
  const snapshot = await getDocs(query(collection(charlie, "conversations", convId, "messages"), orderBy("createdAt", "asc")));
  const messages = snapshot.docs.map(message => ({ id: message.id, ...message.data() }));
  assert.equal(messages.length, 131, "130 sends plus the thread root; no losses or duplicates.");
  for (const [uid, total] of [["alice", 100], ["bob", 30]]) {
    const sent = messages.filter(message => message.senderId === uid && message.id !== "seed");
    assert.deepEqual(sent.map(message => message.text), Array.from({ length: total }, (_, index) => `${uid}-${index}`));
  }
  assert.equal(messages.filter(message => message.replyTo?.id === "seed").length, 34);
  assert.equal(messages.find(message => message.text === "alice-99").attachments[0].name, "sample.pdf");
  assert.deepEqual(messages.find(message => message.text === "alice-0").formatting, [
    { start: 0, end: 5, style: "bold" }, { start: 2, end: 7, style: "italic" }, { start: 1, end: 4, style: "underline" },
  ]);
  assert.equal(messages.find(message => message.text === "bob-0").formatting, undefined);
  const conversation = (await getDoc(doc(charlie, "conversations", convId))).data();
  assert.equal(conversation.unread.charlie, 150, "Unread increments and mentions must survive concurrent sends.");
  assert.equal(conversation.unread.bob, 0);
  assert.equal(conversation.lastMessage, messages.at(-1).text);
  assert.equal(conversation.lastMessageAt, messages.at(-1).createdAt);
  console.log("PASS: 130 concurrent sends from two clients, active reading, stable order, threads, formatting, attachments, counters and no duplicate messages.");
} finally {
  stopReader();
  await Promise.all(apps.map(app => deleteApp(app)));
}
