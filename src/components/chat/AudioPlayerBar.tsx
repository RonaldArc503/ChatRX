import { useEffect, useRef, useState } from "preact/hooks";
import {
  formatDuration,
  getAudioState,
  nextTrack,
  prevTrack,
  seekAudio,
  stopAudio,
  subscribeAudio,
  toggleCurrent,
} from "../../lib/audioPlayer";

export function AudioPlayerBar() {
  const [state, setState] = useState(() => getAudioState());
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeAudio(setState), []);

  useEffect(() => {
    const value = state.currentTrack ? "46px" : "0px";
    const root = document.documentElement;
    root.style.setProperty("--audio-bar-h", value);
    return () => {
      root.style.setProperty("--audio-bar-h", "0px");
    };
  }, [state.currentTrack]);

  const track = state.currentTrack;
  if (!track) return null;

  const pct =
    state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;

  function handleSeek(e: MouseEvent) {
    const el = barRef.current;
    if (!el || state.duration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekAudio(ratio * state.duration);
  }

  return (
    <div class="fixed inset-x-0 top-0 z-[60] border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div class="mx-auto flex h-[46px] max-w-5xl items-center gap-2 px-3 sm:px-4">
        <span class="flex flex-none items-center gap-2">
          <span class="grid h-8 w-8 flex-none place-items-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
            {state.playing ? (
              <span class="flex h-3.5 items-end gap-0.5" aria-label="Reproduciendo">
                <span class="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: "0s" }} />
                <span class="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: "0.2s" }} />
                <span class="eq-bar w-[3px] rounded-full bg-current" style={{ animationDelay: "0.4s" }} />
              </span>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 translate-x-[1px]">
                <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6Z" />
              </svg>
            )}
          </span>
        </span>

        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => toggleCurrent()}
          aria-label={state.playing ? "Pausar" : "Reproducir"}
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
              {track.name}
            </span>
            <span class="block text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatDuration(state.currentTime)} / {formatDuration(state.duration)}
            </span>
          </span>
        </button>

        <div class="flex flex-none items-center gap-0.5">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => prevTrack()}
            class="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
              <path d="M6 5h2v14H6z" />
              <path d="M20 6.1v11.8a1 1 0 0 1-1.52.86l-9-5.9a1 1 0 0 1 0-1.7l9-5.9A1 1 0 0 1 20 6.1Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={state.playing ? "Pausar" : "Reproducir"}
            onClick={() => toggleCurrent()}
            class="grid h-10 w-10 place-items-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            {state.playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5 translate-x-[1px]">
                <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12-7.4a1 1 0 0 0 0-1.72l-12-7.4A1 1 0 0 0 7 4.6Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => nextTrack()}
            class="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5">
              <path d="M16 5h2v14h-2z" />
              <path d="M4 6.1v11.8a1 1 0 0 0 1.52.86l9-5.9a1 1 0 0 0 0-1.7l-9-5.9A1 1 0 0 0 4 6.1Z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Cerrar reproductor"
            onClick={() => stopAudio()}
            class="ml-1 grid h-8 w-8 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={barRef}
        class="h-0.5 w-full cursor-pointer bg-slate-200 dark:bg-slate-700"
        onClick={handleSeek}
        role="slider"
        aria-label="Progreso del audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(state.duration)}
        aria-valuenow={Math.round(state.currentTime)}
      >
        <div class="h-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}