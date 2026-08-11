import { useEffect, useState } from "preact/hooks";
import { searchProfiles, type UserProfile } from "../../lib/profile";
import { Avatar } from "./Avatar";

interface NewChatSearchProps {
  me: UserProfile;
  onPick: (peer: UserProfile) => void;
  onCancel: () => void;
}

export function NewChatSearch({ me, onPick, onCancel }: NewChatSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [selfOnly, setSelfOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSelfOnly(false);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = window.setTimeout(() => {
      searchProfiles(term)
        .then((found) => {
          const others = found.filter((p) => p.uid !== me.uid);
          setResults(others);
          setSelfOnly(found.length > 0 && others.length === 0);
        })
        .catch(() => {
          setResults([]);
          setSelfOnly(false);
        })
        .finally(() => setBusy(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, me.uid]);

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <button
          type="button"
          aria-label="Volver"
          onClick={onCancel}
          class="grid h-9 w-9 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <input
          class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          autoFocus
          value={query}
          placeholder="Busca por teléfono o correo…"
          onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        />
      </div>

      <div class="flex-1 overflow-y-auto">
        {!me.phone ? (
          <p class="px-4 py-3 text-xs text-amber-700">
            Aún no tienes un teléfono en tu perfil. Agrégalo para que otros te
            encuentren.
          </p>
        ) : null}

        {busy ? (
          <p class="px-4 py-6 text-center text-sm text-slate-400">Buscando…</p>
        ) : query.trim().length >= 2 && results.length === 0 ? (
          <p class="px-4 py-6 text-center text-sm text-slate-400">
            {selfOnly
              ? "Ya puedes escribirte desde «Mensajes guardados» en tu lista de chats."
              : `Sin resultados para “${query.trim()}”.`}
          </p>
        ) : results.length > 0 ? (
          <ul>
            {results.map((peer) => (
              <li key={peer.uid}>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => onPick(peer)}
                >
                  <Avatar uid={peer.uid} name={peer.displayName} photoURL={peer.photoURL} size="sm" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-slate-800">
                      {peer.displayName}
                    </span>
                    <span class="block truncate text-xs text-slate-500">
                      {peer.phone || peer.email || "Sin contacto"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="px-4 py-6 text-center text-sm text-slate-400">
            Escribe un número de teléfono (mínimo 7 dígitos) o un correo
            completo.
          </p>
        )}
      </div>
    </div>
  );
}