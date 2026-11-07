export const PLAYLIST_ORIGIN = "https://tasksv.web.app";
const TOKEN = /^[a-f0-9]{32}$/;

export interface SharedPlaylistIdentity { shareId: string; ownerId: string; playlistId: string }
export interface SharedMusicTrack {
  id: string; name: string; artist: string; thumbnailUrl: string; durationSeconds: number;
  position: number; addedAt: number;
}
export interface SharedPlaylistPreview {
  identity: SharedPlaylistIdentity; name: string; coverUrl: string; tracks: SharedMusicTrack[];
}

export function editableSavedPlaylist(data: Record<string, unknown> | undefined): boolean {
  return !!data && data.copyInProgress !== true && !data.sharedOwnerId;
}

export async function musicTrackDocumentId(id: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function playlistToken(url: URL): string | null {
  return /^\/musica\/lista\/([a-f0-9]{32})\/?$/.exec(url.pathname)?.[1] ??
    (/^\/musica\/lista\/?$/.test(url.pathname) && TOKEN.test(url.searchParams.get("id") ?? "")
      ? url.searchParams.get("id") : null);
}

export function savedPlaylistId(token: string): string {
  if (!TOKEN.test(token)) throw new Error("El enlace de la lista no es válido.");
  return `shared_${token}`;
}

export function playlistIdentity(token: string, data: Record<string, unknown>): SharedPlaylistIdentity {
  savedPlaylistId(token);
  const validId = (value: unknown): value is string => typeof value === "string" &&
    value.length > 0 && value.length <= 1500 && !value.includes("/") && value !== "." && value !== "..";
  if (!validId(data.ownerId) || !validId(data.playlistId)) throw new Error("La lista ya no está disponible.");
  return { shareId: token, ownerId: data.ownerId, playlistId: data.playlistId };
}

export function musicImage(value: unknown): string {
  if (typeof value !== "string") return "";
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : ""; }
  catch { return ""; }
}

export function sharedMusicTrack(id: string, data: Record<string, unknown>): SharedMusicTrack {
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
  return { id: text(data.mediaId) || id, name: text(data.name) || "Canción sin título",
    artist: text(data.artist) || (text(data.sourceChannel) ? `Canal: ${data.sourceChannel}` : "Artista no disponible"),
    thumbnailUrl: musicImage(data.thumbnailUrl), durationSeconds: Math.max(0, number(data.durationSeconds)),
    position: typeof data.position === "number" && Number.isFinite(data.position) ? data.position : number(data.addedAt),
    addedAt: number(data.addedAt) };
}

export function openPlaylistInApp(token: string, android: boolean): string {
  savedPlaylistId(token);
  if (!android) return `taskly://playlist/${token}`;
  const fallback = encodeURIComponent(`${PLAYLIST_ORIGIN}/musica/lista/${token}`);
  return `intent://playlist/${token}#Intent;scheme=taskly;package=com.ronaldcolocho.taskly;S.browser_fallback_url=${fallback};end`;
}
