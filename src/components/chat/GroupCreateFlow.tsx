import { useEffect, useRef, useState } from "preact/hooks";
import { searchProfiles, type UserProfile } from "../../lib/profile";
import { Avatar } from "./Avatar";

const MAX_MEMBERS = 50;

interface GroupCreateFlowProps {
  me: UserProfile;
  onPick: (name: string, members: UserProfile[]) => void;
  onCancel: () => void;
}

export function GroupCreateFlow({ me, onPick, onCancel }: GroupCreateFlowProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<UserProfile[]>([]);
  const [step, setStep] = useState<"members" | "name">("members");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = window.setTimeout(() => {
      searchProfiles(term)
        .then((found) => {
          const others = found.filter(
            (p) => p.uid !== me.uid && !selected.some((s) => s.uid === p.uid),
          );
          setResults(others);
        })
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, me.uid, selected]);

  useEffect(() => {
    if (step === "name" && nameRef.current) nameRef.current.focus();
  }, [step]);

  function toggle(p: UserProfile) {
    setSelected((prev) =>
      prev.some((s) => s.uid === p.uid)
        ? prev.filter((s) => s.uid !== p.uid)
        : prev.length >= MAX_MEMBERS
          ? prev
          : [...prev, p],
    );
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          aria-label="Volver"
          onClick={() => (step === "name" ? setStep("members") : onCancel())}
          class="grid h-9 w-9 flex-none place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-5 w-5">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="text-sm font-bold text-slate-800 dark:text-slate-100">
            {step === "members" ? "Nuevo grupo" : "Nombre del grupo"}
          </h2>
          <p class="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {step === "members"
              ? selected.length > 0
                ? `${selected.length} seleccionados`
                : "Selecciona al menos un miembro"
              : null}
          </p>
        </div>
        {step === "members" && selected.length > 0 ? (
          <button
            type="button"
            onClick={() => setStep("name")}
            class="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Siguiente
          </button>
        ) : null}
      </div>

      {step === "members" ? (
        <>
          <div class="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <input
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoFocus
              value={query}
              placeholder="Busca por teléfono o correo…"
              onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            />
          </div>

          {selected.length > 0 ? (
            <div class="flex gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2 no-scrollbar dark:border-slate-800">
              {selected.map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  class="flex flex-none items-center gap-1.5 rounded-full bg-indigo-50 py-1 pl-1 pr-2 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                  onClick={() => toggle(p)}
                >
                  <Avatar uid={p.uid} name={p.displayName} photoURL={p.photoURL} size="sm" />
                  {p.displayName}
                  <span aria-hidden="true">✕</span>
                </button>
              ))}
            </div>
          ) : null}

          <div class="flex-1 overflow-y-auto">
            {busy ? (
              <p class="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Buscando…</p>
            ) : query.trim().length >= 2 && results.length === 0 ? (
              <p class="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Sin resultados para “{query.trim()}”.
              </p>
            ) : results.length > 0 ? (
              <ul>
                {results.map((peer) => (
                  <li key={peer.uid}>
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      onClick={() => toggle(peer)}
                    >
                      <Avatar uid={peer.uid} name={peer.displayName} photoURL={peer.photoURL} size="sm" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {peer.displayName}
                        </span>
                        <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {peer.phone || peer.email || "Sin contacto"}
                        </span>
                      </span>
                      <span
                        class={
                          "grid h-6 w-6 flex-none place-items-center rounded-full border " +
                          (selected.some((s) => s.uid === peer.uid)
                            ? "border-indigo-600 bg-indigo-600 text-white"
                            : "border-slate-300 text-transparent dark:border-slate-600")
                        }
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                Escribe un número de teléfono (8 dígitos) o un correo completo.
              </p>
            )}
          </div>
        </>
      ) : (
        <div class="flex flex-1 flex-col gap-4 px-4 py-6">
          <div>
            <label class="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
              Nombre del grupo
            </label>
            <input
              ref={nameRef}
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              value={name}
              placeholder="Ej. Familia, Trabajo, Viaje…"
              maxLength={60}
              onInput={(event) => setName((event.target as HTMLInputElement).value)}
            />
          </div>

          <div class="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
            <span class="grid h-6 w-6 flex-none place-items-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-3.5 w-3.5">
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </span>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Crearás el grupo <b>{name.trim() || "…"}</b> con{" "}
              {selected.length + 1} participantes (tú + {selected.length}).
            </p>
          </div>

          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onPick(name.trim(), selected)}
            class="mt-auto w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            Crear grupo
          </button>
        </div>
      )}
    </div>
  );
}