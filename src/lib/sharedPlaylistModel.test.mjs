import test from "node:test";
import assert from "node:assert/strict";
import { playlistToken, playlistIdentity, savedPlaylistId, sharedMusicTrack, musicImage, openPlaylistInApp, editableSavedPlaylist, musicTrackDocumentId } from "./sharedPlaylistModel.ts";

const token = "0123456789abcdef0123456789abcdef";
test("only complete editable copies count as saved, and track ids match Android SHA-256", async () => {
  assert.equal(editableSavedPlaylist(undefined), false);
  assert.equal(editableSavedPlaylist({ sharedOwnerId: "owner" }), false);
  assert.equal(editableSavedPlaylist({ copyInProgress: true }), false);
  assert.equal(editableSavedPlaylist({ copiedFromShareId: token }), true);
  assert.equal(await musicTrackDocumentId("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("canonical and local preview URLs identify the same stable saved list", () => {
  for (const path of [`/musica/lista/${token}`, `/musica/lista/${token}/?utm_source=chat`, `/musica/lista/?id=${token}`])
    assert.equal(playlistToken(new URL(path, "https://tasksv.web.app")), token);
  assert.equal(savedPlaylistId(token), `shared_${token}`);
  for (const path of ["/", "/musica/lista/short", `/musica/lista/${token}/extra`, "/musica/lista/?id=../users"])
    assert.equal(playlistToken(new URL(path, "https://tasksv.web.app")), null);
  assert.throws(() => savedPlaylistId("../users"));
});
test("shared references cannot escape their Firestore document path", () => {
  assert.deepEqual(playlistIdentity(token, { ownerId: "alice", playlistId: "one" }), { shareId: token, ownerId: "alice", playlistId: "one" });
  for (const value of ["", ".", "..", "alice/other", null, 42]) {
    assert.throws(() => playlistIdentity(token, { ownerId: value, playlistId: "one" }));
    assert.throws(() => playlistIdentity(token, { ownerId: "alice", playlistId: value }));
  }
});
test("track ordering retains position zero and tolerates missing metadata", () => {
  const song = sharedMusicTrack("document", { mediaId: "youtube:test", position: 0, addedAt: 999, durationSeconds: -1, sourceChannel: "Channel" });
  assert.equal(song.id, "youtube:test"); assert.equal(song.position, 0); assert.equal(song.durationSeconds, 0);
  assert.equal(song.artist, "Canal: Channel"); assert.equal(song.name, "Canción sin título");
  assert.equal(sharedMusicTrack("document", { addedAt: 999 }).position, 999);
  assert.equal(sharedMusicTrack("document", { durationSeconds: Infinity }).durationSeconds, 0);
});
test("cover URLs accept only HTTPS without credentials", () => {
  assert.equal(musicImage("https://example.com/cover.jpg"), "https://example.com/cover.jpg");
  for (const image of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com/a", "https://user:password@example.com/a", null]) assert.equal(musicImage(image), "");
});
test("open in Android is a user-triggered intent with a safe HTTPS fallback", () => {
  assert.equal(openPlaylistInApp(token, false), `taskly://playlist/${token}`);
  const android = openPlaylistInApp(token, true);
  assert.match(android, /^intent:\/\/playlist\//);
  assert.ok(android.includes("package=com.ronaldcolocho.taskly;"));
  assert.ok(android.includes(encodeURIComponent(`https://tasksv.web.app/musica/lista/${token}`)));
  assert.throws(() => openPlaylistInApp("x;component=other", true));
});
