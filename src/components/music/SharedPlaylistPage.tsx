import { useEffect, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import { onAuthChange } from "../../lib/auth";
import { db } from "../../lib/firebase";
import { openPlaylistInApp, playlistToken, type SharedPlaylistPreview } from "../../lib/sharedPlaylistModel";
import { saveSharedPlaylist, watchPlaylistSaved, watchSharedPlaylist } from "../../lib/sharedPlaylists";
import { AuthView } from "../AuthView";
import { ThemeToggle } from "../ThemeToggle";
import { SharedPlaylistContent } from "./SharedPlaylistContent";

export function SharedPlaylistPage() {
  const [user, setUser] = useState<User | null>();
  const [token, setToken] = useState<string | null>();
  const [appLink, setAppLink] = useState("");
  const [preview, setPreview] = useState<SharedPlaylistPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const id = playlistToken(new URL(window.location.href));
    setToken(id);
    if (id) setAppLink(openPlaylistInApp(id, /Android/i.test(navigator.userAgent)));
    return onAuthChange(setUser);
  }, []);

  useEffect(() => {
    setPreview(null); setError(null); setSaved(false);
    if (!db || !user || !token) return;
    return watchSharedPlaylist(db, token, (value) => { setPreview(value); setError(null); }, (reason) => {
      setPreview(null);
      const code = typeof reason === "object" && reason !== null && "code" in reason ? reason.code : "";
      setError(code === "permission-denied" ? "No se puede acceder a esta lista. Puede haber dejado de compartirse." :
        reason instanceof Error && !code ? reason.message : "No pudimos cargar la lista. Revisa tu conexión y vuelve a intentarlo.");
    });
  }, [user?.uid, token, retry]);

  useEffect(() => {
    if (!db || !user || !preview) return;
    return watchPlaylistSaved(db, user.uid, preview.identity, setSaved,
      () => setError("No pudimos comprobar si ya guardaste esta lista. Vuelve a intentarlo."));
  }, [user?.uid, preview?.identity.shareId, retry]);

  async function save() {
    if (!db || !user || !preview || saving || saved) return;
    const uid = user.uid;
    setSaving(true); setError(null);
    try { await saveSharedPlaylist(db, uid, preview.identity); setNotice("Guardada en mi biblioteca"); }
    catch { setError("No se pudo guardar la lista. Revisa tu conexión e inténtalo de nuevo."); }
    finally { setSaving(false); }
  }

  return <div class="mx-auto w-full max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8">
    <header class="mb-8 flex items-center justify-between gap-4">
      <a href="/" class="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white"><img src="/favicon.svg" alt="" class="h-8 w-8" />Taskly</a>
      <ThemeToggle />
    </header>
    {token && <div class="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p class="text-sm text-slate-500 dark:text-slate-400">Escucha esta lista en Taskly para Android.</p>
      <a href={appLink} class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950">Abrir en Taskly <span aria-hidden="true">↗</span></a>
    </div>}
    {token === null ? <section class="rounded-3xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <h1 class="text-2xl font-bold">El enlace no es válido</h1><p class="mt-3 text-slate-500 dark:text-slate-400">Pide que te compartan nuevamente el enlace completo de la lista.</p>
    </section> : token === undefined || user === undefined ? <Loading /> : !user ? <section>
      <p class="mb-6 text-center text-sm text-slate-600 dark:text-slate-300">Inicia sesión para ver la lista y guardarla en tu biblioteca.</p>
      <div class="[&>div]:min-h-0 [&>div]:py-0"><AuthView /></div>
    </section> : <>
      {error && <div role="alert" class="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        <p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} class="mt-2 min-h-11 font-semibold underline underline-offset-4">Reintentar</button>
      </div>}
      {preview ? <SharedPlaylistContent preview={preview} saved={saved} saving={saving} notice={notice} onSave={save} /> : !error && <Loading />}
    </>}
    <footer class="mt-8 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">Si la app no se abre, comprueba que esté instalada y actualizada.<br />Puedes guardar la lista desde esta página.</footer>
  </div>;
}

function Loading() {
  return <div class="flex justify-center py-16" role="status" aria-label="Cargando lista"><span class="h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" /></div>;
}
