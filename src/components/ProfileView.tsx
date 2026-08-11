import { useEffect, useState } from "preact/hooks";
import type { User } from "firebase/auth";
import {
  formatPhone,
  getProfile,
  normalizePhone,
  updateProfile,
  type UserProfile,
} from "../lib/profile";

interface ProfileViewProps {
  user: User;
  onLogout: () => Promise<void>;
}

export function ProfileView({ user, onLogout }: ProfileViewProps) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProfile(user.uid)
      .then((p) => {
        if (!active) return;
        if (p) {
          setProfile(p);
          setDisplayName(p.displayName);
          setPhone(p.phone);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user.uid]);

  const name = displayName.trim() || "Usuario";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function needsPhone() {
    return !profile || !profile.phone;
  }

  async function handleSave(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    const normalized = normalizePhone(phone);
    if (normalized.length < 8) {
      setError("Ingresa un número de teléfono válido.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(user.uid, { displayName: cleanName, phone });
      setProfile((p) => (p ? { ...p, displayName: cleanName, phone: normalized } : p));
      setPhone(normalized);
      setMessage("Perfil guardado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el perfil.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await onLogout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="mx-auto w-full max-w-md">
      {needsPhone() ? (
        <div class="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" class="mt-0.5 h-5 w-5 flex-none">
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <p>
            Necesitas registrar un <strong>número de teléfono</strong> para poder
            usar el Chat y que otros te encuentren.
          </p>
        </div>
      ) : null}

      <form
        class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={handleSave}
      >
        <div class="flex flex-col items-center gap-3 border-b border-slate-100 pb-6 text-center">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={`Foto de ${name}`}
              class="h-20 w-20 rounded-full object-cover ring-4 ring-indigo-100"
            />
          ) : (
            <span class="grid h-20 w-20 place-items-center rounded-full bg-indigo-600 text-2xl font-bold text-white">
              {initials}
            </span>
          )}
          <div>
            <h1 class="text-xl font-bold text-slate-800">{name}</h1>
            {user.email ? (
              <p class="mt-0.5 text-sm text-slate-500">{user.email}</p>
            ) : null}
            {profile?.phone ? (
              <p class="mt-0.5 text-sm text-slate-400">
                {formatPhone(profile.phone)}
              </p>
            ) : null}
          </div>
        </div>

        <div class="flex flex-col gap-3 py-4">
          <label class="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Nombre
            <input
              class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              type="text"
              value={displayName}
              placeholder="Tu nombre"
              onInput={(event) =>
                setDisplayName((event.target as HTMLInputElement).value)
              }
            />
          </label>

          <label class="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Teléfono
            <input
              class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              type="tel"
              value={phone}
              required
              placeholder="+52 55 1234 5678"
              autocomplete="tel"
              onInput={(event) =>
                setPhone((event.target as HTMLInputElement).value)
              }
            />
          </label>

          {error ? (
            <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {message ? (
            <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            class="mt-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Spinner /> : null}
            Guardar cambios
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleLogout}
            class="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-2.5 font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
          >
            {busy ? <Spinner /> : null}
            Cerrar sesión
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <span
      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}