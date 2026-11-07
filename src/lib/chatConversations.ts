import { collection, doc, getDocs, limit, query, runTransaction, where, type Firestore } from "firebase/firestore";
import type { UserProfile } from "./profile";
import { chatDocumentId, chatSearchTerms } from "./chatSearchIndex.ts";

/** Prefer existing legacy chats, then use Android's canonical ID to avoid a second conversation. */
export async function findOrCreateChat(db: Firestore, me: UserProfile, other: UserProfile): Promise<string> {
  const orders = me.uid === other.uid ? [[me.uid]] : [[me.uid, other.uid], [other.uid, me.uid]];
  for (const participants of orders) {
    const found = await getDocs(query(collection(db, "conversations"), where("participantIds", "==", participants), limit(5)));
    const existing = found.docs.find(document => (document.data().kind ?? "dm") === "dm" && document.data().name == null);
    if (existing) return existing.id;
  }
  const participants = [...new Set([me.uid, other.uid])].sort();
  const id = await chatDocumentId("dm_", participants.join("|"));
  const reference = doc(db, "conversations", id);
  const indexes = await Promise.all(participants.map(async userId => {
    const peer = userId === me.uid ? other : me;
    return { id: await chatDocumentId("cs_", `${userId}|${id}`), data: {
      userId, conversationId: id, prefixes: chatSearchTerms([peer.displayName, peer.phone, peer.email]), updatedAt: Date.now(),
    } };
  }));
  await runTransaction(db, async tx => {
    if ((await tx.get(reference)).exists()) return;
    const members = Object.fromEntries([me, other].map(profile => [profile.uid,
      { displayName: profile.displayName, photoURL: profile.photoURL, phone: profile.phone }]));
    tx.set(reference, { participantIds: participants, members, unread: Object.fromEntries(participants.map(uid => [uid, 0])),
      lastMessage: "", lastMessageAt: 0, createdAt: Date.now(), kind: "dm", directKey: participants.join("|") });
    indexes.forEach(index => tx.set(doc(db, "conversationSearch", index.id), index.data));
  });
  return id;
}
