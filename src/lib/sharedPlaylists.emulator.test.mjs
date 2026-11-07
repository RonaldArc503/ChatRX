import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, collection, getDocs, getDoc, setDoc, writeBatch, updateDoc, deleteDoc, terminate } from "firebase/firestore";
import { watchSharedPlaylist, watchPlaylistSaved, saveSharedPlaylist } from "./sharedPlaylists.ts";
import { musicTrackDocumentId } from "./sharedPlaylistModel.ts";

test("saved playlists are independent editable copies, deduplicated and recoverable", { timeout: 90_000 }, async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8088", "Local Firestore emulator required");
  const clients = [];
  async function client(name) {
    const app = initializeApp({ apiKey: "fake-api-key", projectId: "demo-taskly-music", authDomain: "localhost" }, `playlist-${name}-${Date.now()}`);
    const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });
    const email = `${name}@example.test`;
    const account = await signInWithEmailAndPassword(auth, email, "test-password").catch(() => createUserWithEmailAndPassword(auth, email, "test-password"));
    const db = getFirestore(app); connectFirestoreEmulator(db, "127.0.0.1", 8088);
    clients.push({ app, db }); return { db, uid: account.user.uid };
  }
  function first(subscribe, predicate = () => true) {
    return new Promise((resolve, reject) => {
      let stop = () => {};
      const timeout = setTimeout(() => { stop(); reject(new Error("Snapshot timeout")); }, 10_000);
      stop = subscribe((value) => { if (predicate(value)) { clearTimeout(timeout); stop(); resolve(value); } }, (error) => { clearTimeout(timeout); stop(); reject(error); });
    });
  }
  const token = "0123456789abcdef0123456789abcdef";
  try {
    const owner = await client("playlist-owner"); const reader = await client("playlist-reader");
    const previous = doc(reader.db, "users", reader.uid, "playlists", `shared_${token}`);
    const previousTracks = (await getDocs(collection(previous, "tracks"))).docs;
    for (let offset = 0; offset < previousTracks.length; offset += 400) {
      const cleanup = writeBatch(reader.db);
      previousTracks.slice(offset, offset + 400).forEach((track) => cleanup.delete(track.ref));
      await cleanup.commit();
    }
    await deleteDoc(previous);
    const source = doc(owner.db, "users", owner.uid, "playlists", "web-test-list");
    await setDoc(source, { userId: owner.uid, name: "Canciones para compartir", createdAt: 1, updatedAt: 1, songCount: 2 });
    await setDoc(doc(collection(source, "tracks"), "a"), { mediaId: "song/a", name: "Primera canción", artist: "Artista de prueba", position: 0, addedAt: 999, durationSeconds: 185 });
    await setDoc(doc(collection(source, "tracks"), "b"), { mediaId: "song/b", name: "Segunda canción", sourceChannel: "Canal de prueba", position: 1, durationSeconds: 204 });
    const share = writeBatch(owner.db);
    share.update(source, { shareId: token }); share.set(doc(owner.db, "sharedMusicPlaylists", token), { ownerId: owner.uid, playlistId: source.id });
    // The fixture can be re-seeded without updating the immutable share document.
    if ((await getDoc(doc(owner.db, "sharedMusicPlaylists", token))).exists()) await updateDoc(source, { shareId: token });
    else await share.commit();
    const preview = await first((next, fail) => watchSharedPlaylist(reader.db, token, next, fail));
    assert.deepEqual(preview.tracks.map((track) => track.id), ["song/a", "song/b"]);
    const saved = await Promise.all([saveSharedPlaylist(reader.db, reader.uid, preview.identity), saveSharedPlaylist(reader.db, reader.uid, preview.identity)]);
    assert.equal(saved[0], `shared_${token}`); assert.equal(saved[0], saved[1]);
    const matchingCopies = async () => (await getDocs(collection(reader.db, "users", reader.uid, "playlists"))).docs
      .filter((list) => list.data().copiedFromShareId === token || list.data().shareId === token).length;
    assert.equal(await matchingCopies(), 1);
    const target = doc(reader.db, "users", reader.uid, "playlists", saved[0]);
    const copied = await getDoc(target);
    assert.equal(copied.data().sharedOwnerId, undefined);
    assert.equal(copied.data().shareId, undefined);
    assert.equal(copied.data().copiedFromShareId, token);
    assert.equal((await getDocs(collection(target, "tracks"))).size, 2);
    const songId = await musicTrackDocumentId("song/a");
    assert.equal((await getDoc(doc(target, "tracks", songId))).data().position, 0);
    await setDoc(doc(target, "tracks", "my-song"), { mediaId: "mine", name: "Mi canción" });
    await updateDoc(target, { name: "Mi copia", songCount: 3 });
    await saveSharedPlaylist(reader.db, reader.uid, preview.identity);
    assert.equal((await getDoc(target)).data().name, "Mi copia");
    assert.equal((await getDocs(collection(target, "tracks"))).size, 3);
    assert.equal((await getDocs(collection(source, "tracks"))).size, 2);
    assert.equal(await first((next, fail) => watchPlaylistSaved(reader.db, reader.uid, preview.identity, next, fail)), true);
    assert.equal(await saveSharedPlaylist(owner.db, owner.uid, preview.identity), source.id);
    await assert.rejects(updateDoc(doc(reader.db, source.path), { name: "Changed by reader" }));
    const renamed = first((next, fail) => watchSharedPlaylist(reader.db, token, next, fail), (value) => value.name === "Actualizada en vivo");
    await updateDoc(source, { name: "Actualizada en vivo" });
    assert.equal((await renamed).name, "Actualizada en vivo");
    assert.equal((await getDoc(target)).data().name, "Mi copia");
    // Old references are replaced in the same library slot, with no second entry.
    await setDoc(target, { userId: reader.uid, sharedOwnerId: owner.uid, sharedPlaylistId: source.id, shareId: token });
    assert.equal(await first((next, fail) => watchPlaylistSaved(reader.db, reader.uid, preview.identity, next, fail)), false);
    await saveSharedPlaylist(reader.db, reader.uid, preview.identity);
    assert.equal((await getDocs(collection(target, "tracks"))).size, 2);
    assert.equal(await matchingCopies(), 1);

    const largeToken = randomBytes(16).toString("hex");
    const largeSource = doc(owner.db, "users", owner.uid, "playlists", `large-${largeToken}`);
    const createLarge = writeBatch(owner.db);
    createLarge.set(largeSource, { userId: owner.uid, name: "Más de 500 canciones", shareId: largeToken, songCount: 503 });
    createLarge.set(doc(owner.db, "sharedMusicPlaylists", largeToken), { ownerId: owner.uid, playlistId: largeSource.id });
    await createLarge.commit();
    for (let offset = 0; offset < 503; offset += 300) {
      const tracks = writeBatch(owner.db);
      for (let index = offset; index < Math.min(offset + 300, 503); index++)
        tracks.set(doc(largeSource, "tracks", String(index)), { mediaId: `large/${index}`, name: `Canción ${index}`, position: index });
      await tracks.commit();
    }
    const identity = { shareId: largeToken, ownerId: owner.uid, playlistId: largeSource.id };
    const recovering = doc(reader.db, "users", reader.uid, "playlists", `shared_${largeToken}`);
    await setDoc(recovering, { userId: reader.uid, copyInProgress: true, copyAttempt: "interrupted", sharedOwnerId: owner.uid, sharedPlaylistId: largeSource.id });
    await setDoc(doc(recovering, "tracks", "stale"), { mediaId: "partial" });
    await Promise.all([saveSharedPlaylist(reader.db, reader.uid, identity), saveSharedPlaylist(reader.db, reader.uid, identity)]);
    assert.equal((await getDocs(collection(recovering, "tracks"))).size, 503);
    assert.equal((await getDoc(doc(recovering, "tracks", "stale"))).exists(), false);
    assert.equal((await getDoc(recovering)).data().copyInProgress, undefined);
    assert.equal((await getDoc(recovering)).data().songCount, 503);
    const disposable = randomBytes(16).toString("hex");
    const second = doc(owner.db, "users", owner.uid, "playlists", "deleted-web-list");
    const batch = writeBatch(owner.db);
    batch.set(second, { userId: owner.uid, name: "Temporal", shareId: disposable });
    batch.set(doc(owner.db, "sharedMusicPlaylists", disposable), { ownerId: owner.uid, playlistId: second.id });
    await batch.commit();
    const independentId = await saveSharedPlaylist(reader.db, reader.uid, { shareId: disposable, ownerId: owner.uid, playlistId: second.id });
    await deleteDoc(second);
    assert.equal((await getDoc(doc(reader.db, "users", reader.uid, "playlists", independentId))).data().name, "Temporal");
    await assert.rejects(first((next, fail) => watchSharedPlaylist(reader.db, disposable, next, fail), () => false),
      (error) => error.code === "permission-denied" || /ya no está disponible/.test(error.message));
    await updateDoc(source, { name: "Canciones para compartir" });
    await deleteDoc(doc(reader.db, "users", reader.uid, "playlists", saved[0]));
    console.log(`Browser fixture: /musica/lista/${token} · playlist-reader@example.test / test-password (local emulator only)`);
  } finally { for (const { app, db } of clients) { await terminate(db); await deleteApp(app); } }
});
