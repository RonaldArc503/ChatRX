import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, onSnapshot, orderBy, query, setDoc, updateDoc, where, setLogLevel } from 'firebase/firestore';
import { findOrCreateChat } from './chatConversations.ts';
import { sendConversationMessage, markConversationReadOnce } from './chatMessageWrites.ts';
import { editChatMessage, deleteChatMessage } from './chatMessageMutations.ts';
import { chatDocumentId, chatSearchTerms } from './chatSearchIndex.ts';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const integration = host ? test : test.skip;
function waitFor(reference, predicate) {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    const timeout = setTimeout(() => { stop(); reject(new Error('Live snapshot timeout')); }, 8000);
    stop = onSnapshot(reference, snapshot => {
      if (predicate(snapshot)) { clearTimeout(timeout); stop(); resolve(snapshot); }
    }, error => { clearTimeout(timeout); stop(); reject(error); });
  });
}

integration('web and native-schema messages share edits, deletions, indexes, receipts and conversation identity', async () => {
  assert.match(host, /^(127\.0\.0\.1|localhost):\d+$/, 'Only local demo emulators are permitted');
  const [hostname, port] = host.split(':');
  setLogLevel('silent');
  const suffix = Date.now().toString();
  const apps = [];
  function client(uid) {
    const app = initializeApp({ projectId: 'demo-taskly-music', apiKey: 'fake-key', appId: `test-${uid}` }, `chat-${uid}-${apps.length}`);
    apps.push(app);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, hostname, Number(port), { mockUserToken: { sub: uid } });
    return db;
  }
  const uid = `web-alice-${suffix}`, peer = `web-bob-${suffix}`;
  const alice = client(uid), secondDevice = client(uid), bob = client(peer);
  const me = { uid, displayName: 'Alice', email: 'alice@example.test', phone: '', photoURL: '', createdAt: 1 };
  const other = { ...me, uid: peer, displayName: 'Bob', email: 'bob@example.test' };
  try {
    const [id, same] = await Promise.all([findOrCreateChat(alice, me, other), findOrCreateChat(secondDevice, me, other)]);
    assert.equal(id, same);
    assert.equal(id, await chatDocumentId('dm_', [uid, peer].sort().join('|')));
    const chats = await getDocs(query(collection(alice, 'conversations'), where('participantIds', '==', [uid, peer].sort())));
    assert.equal(chats.size, 1, 'Concurrent clients must share one conversation');
    const legacy = `legacy-${suffix}`;
    await setDoc(doc(alice, 'conversations', legacy), { participantIds: [uid], createdAt: 1 });
    assert.equal(await findOrCreateChat(secondDevice, me, me), legacy, 'Reuse older self chat');
    const chat = doc(alice, 'conversations', id);
    const stream = query(collection(bob, 'conversations', id, 'messages'), orderBy('createdAt', 'asc'));
    await setDoc(doc(bob, 'users', peer, 'chatStates', id), { archived: true, archivedAt: 1, pinned: true });
    await sendConversationMessage(alice, { convId: id, senderId: uid, text: 'Original from web' });
    const sent = await waitFor(stream, snapshot => snapshot.size === 1);
    const messageId = sent.docs[0].id;
    const msg = doc(alice, 'conversations', id, 'messages', messageId);
    const archive = (await getDoc(doc(bob, 'users', peer, 'chatStates', id))).data();
    assert.equal(archive.archived, false); assert.equal(archive.pinned, true);
    const indexId = await chatDocumentId('gcs_', `${peer}|${id}|${messageId}`);
    assert.equal((await getDoc(doc(bob, 'globalChatSearch', indexId))).data().messageId, messageId);
    await updateDoc(chat, { pinnedMessages: [{ id: messageId, text: 'Original from web', senderId: uid, pinnedAt: 1 }] });
    const edited = waitFor(stream, snapshot => snapshot.docs[0]?.data().text === 'Edited on web');
    await editChatMessage(alice, id, messageId, 'Edited on web', [{ start: 0, end: 6, style: 'bold' }]);
    await edited;
    assert.equal((await getDoc(chat)).data().pinnedMessages[0].text, 'Edited on web');
    assert((await getDoc(doc(bob, 'globalChatSearch', indexId))).data().searchTerms.includes('edited'));
    const reflected = waitFor(stream, snapshot => snapshot.docs[0]?.data().text === 'Edited on second device');
    await updateDoc(doc(secondDevice, msg.path), { text: 'Edited on second device', edited: true, formatting: [] });
    await reflected;
    const current = (await getDoc(msg)).data();
    await markConversationReadOnce(bob, id, peer, { id: messageId, createdAt: current.createdAt });
    assert.equal((await getDoc(doc(alice, 'conversations', id, 'receipts', peer))).data().lastReadMessageId, messageId);
    assert.equal((await getDoc(chat)).data().unread[peer], 0);
    await sendConversationMessage(bob, { convId: id, senderId: peer, text: 'Thread reply', replyTo: { id: messageId, text: current.text, senderId: uid } });
    const reply = (await getDocs(stream)).docs.find(document => document.id !== messageId);
    assert.equal(reply.data().threadRootId, messageId);
    assert.equal((await getDoc(msg)).data().replyCount, 1);
    await Promise.all([deleteChatMessage(alice, id, reply.id), deleteChatMessage(bob, id, reply.id)]);
    assert.equal((await getDoc(msg)).data().replyCount, 0);
    const removed = waitFor(stream, snapshot => snapshot.empty);
    await deleteChatMessage(bob, id, messageId);
    await removed;
    assert.equal((await getDoc(chat)).data().pinnedMessages.length, 0);
    assert.equal((await getDoc(chat)).data().lastMessage, '');
    assert(!(await getDocs(query(collection(bob, 'globalChatSearch'), where('userId', '==', peer)))).docs.some(index => index.id === indexId));
    // Older web messages have neither search indexes nor conversationId.
    await setDoc(msg, { senderId: uid, text: 'Old message', createdAt: 1 });
    await editChatMessage(secondDevice, id, messageId, 'Recovered old message');
    const restoredIndex = (await getDoc(doc(bob, 'globalChatSearch', indexId))).data();
    assert.equal(restoredIndex.conversationId, id);
    await sendConversationMessage(alice, { convId: id, senderId: uid, text: 'Newest must remain' });
    await deleteChatMessage(bob, id, messageId);
    assert.equal((await getDoc(chat)).data().lastMessage, 'Newest must remain');
    const absentIndexMessage = doc(alice, 'conversations', id, 'messages', 'old-no-index');
    await setDoc(absentIndexMessage, { senderId: uid, text: 'No indexes', createdAt: 2 });
    await deleteChatMessage(bob, id, absentIndexMessage.id);
    assert(!(await getDoc(absentIndexMessage)).exists());
    assert.deepEqual(chatSearchTerms(['Música Ágil']), ['mu', 'mus', 'musi', 'music', 'musica', 'ag', 'agi', 'agil', 'musica ', 'musica a', 'musica ag', 'musica agi', 'musica agil']);
  } finally { await Promise.all(apps.map(deleteApp)); }
});
