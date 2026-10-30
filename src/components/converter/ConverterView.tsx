import { useState } from "preact/hooks";
import {
  isYouTubeUrl,
  widgetPlusUrl,
} from "../../lib/youtubeConverter";
import {
  hasYoutubeKey,
  searchYoutube,
  type YtSearchResult,
} from "../../lib/youtubeSearch";

interface ConverterViewProps {
  onBack: () => void;
}

export function ConverterView({ onBack }: ConverterViewProps) {
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YtSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [iframeUrl, setIframeUrl] = useState("");
  const [selectedTitle, setSelectedTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!isYouTubeUrl(url)) {
      setError("Ingresa un enlace o ID de YouTube válido.");
      return;
    }
    setError(null);
    setSelectedTitle("");
    setIframeUrl(widgetPlusUrl(url.trim()));
  }

  async function handleSearch(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    setSearched(false);
    setResults([]);
    try {
      const found = await searchYoutube(q);
      setResults(found);
      setSearched(true);
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "No se pudo buscar.",
      );
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  function handlePick(r: YtSearchResult) {
    setUrl(r.url);
    setError(null);
    setSelectedTitle(r.title);
    setIframeUrl(widgetPlusUrl(r.url));
  }

  function handleChangeVideo() {
    setIframeUrl("");
    setUrl("");
    setSelectedTitle("");
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
            Busca una canción o artista y descárgala en MP3/MP4.
          </p>
        </div>
      </header>

      {!iframeUrl ? (
        <div class="flex flex-col gap-4">
          <form
            class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            onSubmit={handleSearch}
          >
            <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Canción o artista
              <div class="flex gap-2">
                <input
                  class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                  type="text"
                  value={query}
                  placeholder="Ej. Bad Bunny - Tití me preguntó"
                  aria-label="Canción o artista"
                  onInput={(event) =>
                    setQuery((event.target as HTMLInputElement).value)
                  }
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  class="flex-none rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  {searching ? (
                    <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    "Buscar"
                  )}
                </button>
              </div>
            </label>

            {!hasYoutubeKey() ? (
              <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                Para buscar necesitas tu clave de YouTube Data API v3:
                configúrala en{" "}
                <code class="rounded bg-amber-100 px-1 dark:bg-amber-500/20">
                  PUBLIC_YOUTUBE_API_KEY
                </code>{" "}
                en el archivo{" "}
                <code class="rounded bg-amber-100 px-1 dark:bg-amber-500/20">.env</code>.
              </p>
            ) : null}

            {searchError ? (
              <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {searchError}
              </p>
            ) : null}
          </form>

          {searched && results.length === 0 && !searching ? (
            <div class="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Sin resultados para esa búsqueda.
              </p>
            </div>
          ) : null}

          {results.length > 0 ? (
            <div>
              <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Resultados
              </h2>
              <ul class="flex flex-col gap-2">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(r)}
                      class="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                    >
                      {r.thumbnail ? (
                        <img
                          src={r.thumbnail}
                          alt=""
                          loading="lazy"
                          class="h-12 w-16 flex-none rounded-lg object-cover"
                        />
                      ) : (
                        <span class="grid h-12 w-16 flex-none place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <path d="m9 11 3 3L22 4" />
                          </svg>
                        </span>
                      )}
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {r.title}
                        </span>
                        {r.channel ? (
                          <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {r.channel}
                          </span>
                        ) : null}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4 flex-none text-slate-300 dark:text-slate-600">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <summary class="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">
              O pega un enlace manualmente
            </summary>
            <form class="mt-3" onSubmit={handleSubmit}>
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
                <p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                class="mt-3 w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Abrir conversor
              </button>
            </form>
          </details>
        </div>
      ) : (
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2">
            {selectedTitle ? (
              <p class="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
                {selectedTitle}
              </p>
            ) : (
              <p class="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
                Conversor embebido
              </p>
            )}
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
