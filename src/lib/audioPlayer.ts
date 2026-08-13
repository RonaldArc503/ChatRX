export interface AudioTrack {
  id: string;
  url: string;
  name: string;
  msgId: string;
}

export type AudioMode = "queue" | "repeat" | "loop";

export interface AudioPlayerState {
  tracks: AudioTrack[];
  currentId: string | null;
  currentTrack: AudioTrack | null;
  playing: boolean;
  mode: AudioMode;
  currentTime: number;
  duration: number;
}

type Listener = (state: AudioPlayerState) => void;

const listeners = new Set<Listener>();

let audio: HTMLAudioElement | null = null;
let tracks: AudioTrack[] = [];
let currentId: string | null = null;
let currentTrack: AudioTrack | null = null;
let playing = false;
let mode: AudioMode = "queue";
let currentTime = 0;
let duration = 0;
let tick: number | null = null;

function getCurrentIndex(id: string): number {
  return tracks.findIndex((t) => t.id === id);
}

function snapshot(): AudioPlayerState {
  return {
    tracks: [...tracks],
    currentId,
    currentTrack,
    playing,
    mode,
    currentTime,
    duration,
  };
}

function emit() {
  const state = snapshot();
  listeners.forEach((cb) => cb(state));
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", () => {
    if (audio) {
      currentTime = audio.currentTime || 0;
    }
    emit();
  });
  audio.addEventListener("loadedmetadata", () => {
    if (audio) {
      duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    }
    emit();
  });
  audio.addEventListener("play", () => {
    playing = true;
    startTick();
    emit();
  });
  audio.addEventListener("pause", () => {
    playing = false;
    stopTick();
    emit();
  });
  audio.addEventListener("ended", () => {
    if (mode === "repeat" && currentId) {
      if (audio) {
        audio.currentTime = 0;
        void audio.play();
      }
      return;
    }
    if (mode === "loop" && currentId) {
      const idx = getCurrentIndex(currentId);
      if (idx >= 0 && tracks.length > 0) {
        playTrack(tracks[(idx + 1) % tracks.length]);
      } else {
        stopPlayback();
      }
      return;
    }
    if (currentId) {
      const idx = getCurrentIndex(currentId);
      if (idx >= 0 && idx < tracks.length - 1) {
        playTrack(tracks[idx + 1]);
      } else {
        stopPlayback();
      }
    }
  });
  return audio;
}

function startTick() {
  if (tick !== null) return;
  tick = window.setInterval(() => {
    if (!audio) return;
    currentTime = audio.currentTime || 0;
    emit();
  }, 500);
}

function stopTick() {
  if (tick !== null) {
    window.clearInterval(tick);
    tick = null;
  }
}

function stopPlayback() {
  playing = false;
  currentId = null;
  currentTrack = null;
  currentTime = 0;
  duration = 0;
  stopTick();
  emit();
}

export function updatePlaylist(next: AudioTrack[]) {
  if (currentId && !next.some((t) => t.id === currentId)) {
    emit();
    return;
  }
  tracks = next;
  emit();
}

function playTrack(track: AudioTrack) {
  const el = ensureAudio();
  currentId = track.id;
  currentTrack = track;
  currentTime = 0;
  duration = 0;
  el.src = track.url;
  void el.play().catch(() => {
    playing = false;
    emit();
  });
}

export function toggleTrack(track: AudioTrack) {
  const el = ensureAudio();
  if (currentId === track.id) {
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => {});
    }
    return;
  }
  playTrack(track);
}

export function playWithQueue(track: AudioTrack) {
  mode = "queue";
  playTrack(track);
}

export function playWithRepeat(track: AudioTrack) {
  mode = "repeat";
  playTrack(track);
}

export function playWithLoop(track: AudioTrack) {
  mode = "loop";
  playTrack(track);
}

export function setAudioMode(m: AudioMode) {
  mode = m;
  emit();
}

export function playWithTrack(track: AudioTrack) {
  playTrack(track);
}

export function nextTrack() {
  if (tracks.length === 0) return;
  if (currentId) {
    const idx = getCurrentIndex(currentId);
    const next = idx >= 0 ? tracks[(idx + 1) % tracks.length] : tracks[0];
    playTrack(next);
  } else {
    playTrack(tracks[0]);
  }
}

export function prevTrack() {
  if (tracks.length === 0) return;
  if (currentId) {
    const idx = getCurrentIndex(currentId);
    const prev = idx > 0 ? tracks[idx - 1] : tracks[tracks.length - 1];
    playTrack(prev);
  } else {
    playTrack(tracks[0]);
  }
}

export function toggleCurrent() {
  if (!currentId) return;
  const el = ensureAudio();
  if (playing) {
    el.pause();
  } else {
    void el.play().catch(() => {});
  }
}

export function stopAudio() {
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  stopPlayback();
}

export function seekAudio(t: number) {
  if (!audio) return;
  audio.currentTime = t;
  currentTime = t;
  emit();
}

export function subscribeAudio(cb: Listener): () => void {
  listeners.add(cb);
  cb(snapshot());
  return () => listeners.delete(cb);
}

export function getAudioState(): AudioPlayerState {
  return snapshot();
}

export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}