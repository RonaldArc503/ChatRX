import { useEffect, useRef, useState } from "preact/hooks";
import {
  addGroupMembers,
  leaveGroup,
  removeGroupMember,
  renameGroup,
  type ChatConversation,
} from "../../lib/chat";
import { searchProfiles, type UserProfile } from "../../lib/profile";
import { Avatar } from "./Avatar";
import { AvatarStack } from "./AvatarStack";
import { formatDayLabel } from "./time";

interface GroupInfoSheetProps {
  conv: ChatConversation;
  meUid: string;
  onClose: () => void;
  onLeft: () => void;
}

const MAX_NAME = 60;

export function GroupInfoSheet({
  conv,
  meUid,
  onClose,
  onLeft,
}: GroupInfoSheetProps) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(conv.name || "");
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (renaming && nameInputRef.current) nameInputRef.current.focus();
  }, [renaming]);

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
          const existing = new Set(Object.keys(conv.members ?? {}));
          setResults(found.filter((p) => !existing.has(p.uid)));
        })
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, conv.id]);

  const members = Object.entries(conv.members ?? {}).map(([uid, m]) => ({
    uid,
    displayName: m.displayName,
    photoURL: m.photoURL,
    phone: m.phone,
  }));

  async function handleSaveName() {
    const clean = nameDraft.trim();
    if (!clean || clean === conv.name) {
      setRenaming(false);
      return;
    }
    try {
      await renameGroup(conv.id, clean);
      setRenaming(false);
    } catch {
      setError("No se pudo cambiar el nombre.");
    }
  }

  async function handleAdd(profile: UserProfile) {
    setError(null);
    try {
      await addGroupMembers(conv.id, [profile]);
      setQuery("");
      setResults([]);
      setShowSearch(false);
    } catch {
      setError("No se pudo agregar al miembro.");
    }
  }

  async function handleRemove(uid: string) {
    setError(null);
    try {
      await removeGroupMember(conv.id, uid);
    } catch {
      setError("No se pudo quitar al miembro.");
    }
  }

  async function handleLeave() {
    setError(null);
    try {
      await leaveGroup(conv.id, meUid);
      onLeft();
    } catch {
      setError("No se pudo salir del grupo.");
    }
  }

  return (
    <div class="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div class="absolute inset-x-0 bottom-0 flex justify-center">
        <div class="animate-sheet-in w-full max-w-md rounded-t-2xl bg-white p-2 pb-4 shadow-2xl dark:bg-slate-900">
          <div class="flex items-center justify-between border-b border-slate-100 px-2 pb-3 pt-1 dark:border-slate-800">
            <span class="text-sm font-bold text-slate-800 dark:text-slate-100">
              Información del grupo
            </span>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              class="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {error ? (
            <p class="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <div class="flex flex-col items-center gap-2 px-2 py-4">
            <AvatarStack members={members} size="md" />
            {renaming ? (
              <div class="flex w-full items-center gap-2">
                <input
                  ref={nameInputRef}
                  value={nameDraft}
                  maxLength={MAX_NAME}
                  onInput={(e) =>
                    setNameDraft((e.target as HTMLInputElement).value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  class="flex-none rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  Guardar
                </button>
              </div>
            ) : (
              <div class="text-center">
                <p class="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {conv.name || "Grupo"}
                </p>
                <p class="text-xs text-slate-400 dark:text-slate-500">
                  {members.length} miembros · creado{" "}
                  {conv.createdAt ? formatDayLabel(conv.createdAt) : ""}
                </p>
              </div>
            )}
          </div>

          <div class="flex items-center justify-between px-2 py-1.5">
            <span class="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Miembros ({members.length})
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRenaming((v) => !v)}
                class="grid h-8 w-8 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Renombrar grupo"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                class="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-400"
                aria-label="Agregar miembro"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          </div>

          {showSearch ? (
            <div class="mx-2 mb-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                autoFocus
                value={query}
                placeholder="Busca por teléfono o correo…"
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                class="w-full border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-800 dark:text-slate-100"
              />
              <div class="max-h-48 overflow-y-auto">
                {busy ? (
                  <p class="px-3 py-3 text-xs text-slate-400">Buscando…</p>
                ) : query.trim().length < 2 ? (
                  <p class="px-3 py-3 text-xs text-slate-400">
                    Escribe mínimo 2 caracteres.
                  </p>
                ) : results.length === 0 ? (
                  <p class="px-3 py-3 text-xs text-slate-400">
                    Sin resultados o ya es miembro.
                  </p>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.uid}
                      type="button"
                      class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      onClick={() => handleAdd(p)}
                    >
                      <Avatar uid={p.uid} name={p.displayName} photoURL={p.photoURL} size="sm" />
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {p.displayName}
                        </span>
                        <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {p.phone || p.email}
                        </span>
                      </span>
                      <span class="flex-none text-xs font-bold text-indigo-500">Agregar</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <ul class="max-h-64 overflow-y-auto px-2">
            {members.map((m) => (
              <li key={m.uid}>
                <div class="flex items-center gap-3 px-2 py-2.5">
                  <Avatar uid={m.uid} name={m.displayName} photoURL={m.photoURL} size="sm" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {m.displayName}
                      {m.uid === meUid ? (
                        <span class="ml-1.5 text-[11px] font-medium text-indigo-500">(tú)</span>
                      ) : null}
                    </span>
                    <span class="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {m.phone || "Sin teléfono"}
                    </span>
                  </span>
                  {m.uid !== meUid ? (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.uid)}
                      class="flex-none rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={handleLeave}
            class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="h-4 w-4">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Salir del grupo
          </button>
        </div>
      </div>
    </div>
  );
}