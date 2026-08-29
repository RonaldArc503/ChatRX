import { useState } from "preact/hooks";
import {
  isYouTubeUrl,
  widgetPlusUrl,
} from "../../lib/youtubeConverter";

interface ConverterViewProps {
  onBack: () => void;
}

export function ConverterView({ onBack }: ConverterViewProps) {
  const [url, setUrl] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!isYouTubeUrl(url)) {
      setError("Ingresa un enlace o ID de YouTube válido.");
      return;
    }
    setError(null);
    setIframeUrl(widgetPlusUrl(url.trim()));
  }

  function handleChangeVideo() {
    setIframeUrl("");
    setUrl("");
    setError(null);
  }

  return (
    <div class="mx-auto w-full max-w-2xl">
      <header class="mb-4 flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver al perfil"
          onClick={onBack}
          class="grid h-10 w-10 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div class="min-w-0">
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Conversor de YouTube
          </h1>
          <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Convierte un video a MP3 o MP4 (demo).
          </p>
        </div>
      </header>

      {!iframeUrl ? (
        <form
          class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          onSubmit={handleSubmit}
        >
          <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Enlace o ID de YouTube
            <input
              class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              type="text"
              value={url}
              placeholder="https://www.youtube.com/watch?v=..."
              aria-label="Enlace de YouTube"
              onInput={(event) =>
                setUrl((event.target as HTMLInputElement).value)
              }
            />
          </label>

          {error ? (
            <p class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            class="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="m9 11 3 3L22 4" />
            </svg>
            Abrir conversor
          </button>

          <p class="mt-3 text-center text-xs text-slate-400 dark:text-slate-500">
            El conversor permite elegir MP3 o MP4 y descargar el archivo.
          </p>
        </form>
      ) : (
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <p class="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
              Conversor embebido
            </p>
            <button
              type="button"
              onClick={handleChangeVideo}
              class="flex-none rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cambiar video
            </button>
          </div>
          <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <iframe
              src={iframeUrl}
              title="Conversor de YouTube"
              class="h-[620px] w-full"
              allow="clipboard-write; autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
