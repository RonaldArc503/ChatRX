import type { SharedPlaylistPreview } from "../../lib/sharedPlaylistModel";

function MusicCover({ url, large = false }: { url: string; large?: boolean }) {
  return <div class={`grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-indigo-200 via-violet-100 to-rose-100 text-indigo-500 dark:from-indigo-950 dark:via-violet-950 dark:to-slate-800 ${large ? "h-36 w-36 rounded-3xl shadow-lg sm:h-44 sm:w-44" : "h-12 w-12 rounded-xl"}`}>
    {url ? <img src={url} alt="" class="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> :
      <svg class={large ? "h-16 w-16" : "h-6 w-6"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path d="M9 18V5l12-2v13M9 8l12-2" /><ellipse cx="6" cy="18" rx="3" ry="3" /><ellipse cx="18" cy="16" rx="3" ry="3" />
      </svg>}
  </div>;
}

export function SharedPlaylistContent({ preview, saved, saving, notice, onSave }: {
  preview: SharedPlaylistPreview; saved: boolean; saving: boolean; notice: string | null; onSave: () => void;
}) {
  return <>
    <section class="flex flex-col items-center gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <MusicCover url={preview.coverUrl || preview.tracks.find((track) => track.thumbnailUrl)?.thumbnailUrl || ""} large />
      <div class="min-w-0 flex-1 text-center sm:text-left">
        <h1 class="break-words text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">{preview.name}</h1>
        <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">{preview.tracks.length} {preview.tracks.length === 1 ? "canción" : "canciones"}</p>
        {!saved && <button type="button" disabled={saving} onClick={onSave}
          class="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-default disabled:bg-indigo-100 disabled:text-indigo-700 dark:disabled:bg-indigo-950 dark:disabled:text-indigo-200">
          {saving ? "Guardando…" : "Guardar en mi biblioteca"}
        </button>}
        {notice && <p class="mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-300" role="status">{notice}</p>}
      </div>
    </section>
    <section class="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Canciones de la lista">
      <h2 class="border-b border-slate-100 px-5 py-4 text-lg font-semibold dark:border-slate-800">Canciones</h2>
      {preview.tracks.length ? <ol class="divide-y divide-slate-100 dark:divide-slate-800">
        {preview.tracks.map((track, index) => <li key={track.id} class="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5">
          <span class="hidden w-5 shrink-0 text-center text-xs tabular-nums text-slate-400 sm:block">{index + 1}</span>
          <MusicCover url={track.thumbnailUrl} />
          <div class="min-w-0 flex-1"><p class="break-words font-medium text-slate-800 dark:text-slate-100">{track.name}</p>
            <p class="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">{track.artist}</p></div>
          <span class="shrink-0 text-xs tabular-nums text-slate-400">{track.durationSeconds > 0 ? `${Math.floor(track.durationSeconds / 60)}:${String(Math.floor(track.durationSeconds % 60)).padStart(2, "0")}` : "—"}</span>
        </li>)}
      </ol> : <p class="px-5 py-10 text-center text-slate-500 dark:text-slate-400">Esta lista todavía no tiene canciones.</p>}
    </section>
  </>;
}
