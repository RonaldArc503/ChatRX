import { collection, doc, onSnapshot, type Firestore, type Unsubscribe } from "firebase/firestore";
import { musicImage, playlistIdentity, savedPlaylistId, sharedMusicTrack,
  editableSavedPlaylist, type SharedPlaylistIdentity, type SharedPlaylistPreview } from "./sharedPlaylistModel.ts";
import { copySharedPlaylist } from "./sharedPlaylistCopy.ts";

export function watchSharedPlaylist(db: Firestore, token: string,
  update: (preview: SharedPlaylistPreview) => void, failure: (error: unknown) => void): Unsubscribe {
  savedPlaylistId(token);
  let stopPlaylist: Unsubscribe = () => {};
  let stopTracks: Unsubscribe = () => {};
  let generation = 0;
  const stopShare = onSnapshot(doc(db, "sharedMusicPlaylists", token), (share) => {
    stopPlaylist(); stopTracks();
    const current = ++generation;
    try {
      if (!share.exists()) throw new Error("La lista ya no está disponible.");
      const identity = playlistIdentity(token, share.data());
      const source = doc(db, "users", identity.ownerId, "playlists", identity.playlistId);
      let preview: SharedPlaylistPreview | null = null;
      let tracksReady = false;
      let watchingTracks = false;
      const fail = (error: unknown) => { if (current === generation) failure(error); };
      stopPlaylist = onSnapshot(source, (list) => {
        if (current !== generation) return;
        if (!list.exists() || list.data().shareId !== token) {
          stopTracks(); watchingTracks = false; tracksReady = false; preview = null;
          fail(new Error("La lista ya no está disponible.")); return;
        }
        preview = { identity, name: String(list.data().name || "Lista compartida"),
          coverUrl: musicImage(list.data().coverUrl), tracks: preview?.tracks ?? [] };
        if (tracksReady) update(preview);
        if (!watchingTracks) {
          watchingTracks = true;
          stopTracks = onSnapshot(collection(source, "tracks"), (tracks) => {
            if (current !== generation || !preview) return;
            preview = { ...preview, tracks: tracks.docs.map((track) => sharedMusicTrack(track.id, track.data()))
              .sort((a, b) => a.position - b.position || b.addedAt - a.addedAt) };
            tracksReady = true; update(preview);
          }, fail);
        }
      }, fail);
    } catch (error) { failure(error); }
  }, (error) => { stopPlaylist(); stopTracks(); ++generation; failure(error); });
  return () => { ++generation; stopShare(); stopPlaylist(); stopTracks(); };
}

export function watchPlaylistSaved(db: Firestore, uid: string, identity: SharedPlaylistIdentity,
  update: (saved: boolean) => void, failure: (error: unknown) => void): Unsubscribe {
  if (uid === identity.ownerId) { update(true); return () => {}; }
  return onSnapshot(doc(db, "users", uid, "playlists", savedPlaylistId(identity.shareId)),
    (snapshot) => update(editableSavedPlaylist(snapshot.data())), failure);
}

export async function saveSharedPlaylist(db: Firestore, uid: string, identity: SharedPlaylistIdentity): Promise<string> {
  if (!uid) throw new Error("Inicia sesión para guardar la lista.");
  if (uid === identity.ownerId) return identity.playlistId;
  const id = savedPlaylistId(identity.shareId);
  const target = doc(db, "users", uid, "playlists", id);
  await copySharedPlaylist(db, target, uid, identity);
  return id;
}
