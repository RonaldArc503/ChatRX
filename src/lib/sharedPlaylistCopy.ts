import { collection, doc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction,
  type DocumentReference, type Firestore, type Transaction } from "firebase/firestore";
import { musicImage, editableSavedPlaylist, musicTrackDocumentId, type SharedPlaylistIdentity } from "./sharedPlaylistModel.ts";

/** An import is hidden until complete; retries never overwrite a finished, editable copy. */
export async function copySharedPlaylist(db: Firestore, target: DocumentReference, uid: string, identity: SharedPlaylistIdentity): Promise<void> {
  if (editableSavedPlaylist((await getDocFromServer(target)).data())) return;
  const source = doc(db, "users", identity.ownerId, "playlists", identity.playlistId);
  const original = await getDocFromServer(source);
  if (!original.exists() || original.data().shareId !== identity.shareId) throw new Error("La lista ya no está disponible.");
  const sourceTracks = await getDocsFromServer(collection(source, "tracks"));
  const tracks = new Map(await Promise.all(sourceTracks.docs.map(async (track) => {
    const data = track.data();
    const id = typeof data.mediaId === "string" && data.mediaId ? data.mediaId : track.id;
    return [await musicTrackDocumentId(id), { ...data, mediaId: id }] as const;
  })));
  const attempt = crypto.randomUUID();
  const now = Date.now();
  const metadata = { userId: uid, name: String(original.data().name || "Lista"),
    coverUrl: musicImage(original.data().coverUrl), songCount: tracks.size,
    createdAt: now, updatedAt: now, copiedFromShareId: identity.shareId };
  const claimed = await runTransaction(db, async (tx) => {
    const existing = await tx.get(target);
    if (editableSavedPlaylist(existing.data())) return false;
    tx.set(target, { ...metadata, copyInProgress: true, copyAttempt: attempt,
      sharedOwnerId: identity.ownerId, sharedPlaylistId: identity.playlistId,
      createdAt: existing.data()?.createdAt ?? now });
    return true;
  });
  if (!claimed) return;

  async function write(action: (tx: Transaction) => void): Promise<boolean> {
    return runTransaction(db, async (tx) => {
      if ((await tx.get(target)).data()?.copyAttempt !== attempt) return false;
      action(tx); return true;
    });
  }
  async function awaitOtherCopy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { stop(); reject(new Error("La copia se está preparando en otro dispositivo. Vuelve a intentarlo.")); }, 30_000);
      const stop = onSnapshot(target, (snapshot) => {
        if (editableSavedPlaylist(snapshot.data())) { clearTimeout(timer); stop(); resolve(); }
        else if (!snapshot.exists()) { clearTimeout(timer); stop(); reject(new Error("La copia fue eliminada.")); }
      }, (error) => { clearTimeout(timer); stop(); reject(error); });
    });
  }
  const stale = (await getDocsFromServer(collection(target, "tracks"))).docs;
  for (let offset = 0; offset < stale.length; offset += 400) {
    if (!await write((tx) => stale.slice(offset, offset + 400).forEach((track) => tx.delete(track.ref)))) {
      await awaitOtherCopy(); return;
    }
  }
  const entries = [...tracks];
  for (let offset = 0; offset < entries.length; offset += 400) {
    if (!await write((tx) => entries.slice(offset, offset + 400).forEach(([id, track]) => tx.set(doc(target, "tracks", id), track)))) {
      await awaitOtherCopy(); return;
    }
  }
  if (!await write((tx) => tx.set(target, metadata))) await awaitOtherCopy();
}
