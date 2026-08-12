import { useState } from "preact/hooks";
import { authErrorMessage, login, loginWithGoogle, register } from "../lib/auth";
import { ensureProfile, normalizePhone, searchProfiles } from "../lib/profile";

const GOOGLE_ICON = (
  <svg class="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
    />
    <path
      fill="#FBBC05"
      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
    />
  </svg>
);

export function AuthView() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register") {
      if (password !== confirm) {
        setError("Las contraseñas no coinciden.");
        return;
      }
      if (password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
      const normalizedPhone = normalizePhone(phone);
      if (normalizedPhone.length !== 8) {
        setError("El número de teléfono debe tener 8 dígitos (El Salvador).");
        return;
      }
      const taken = await searchProfiles(normalizedPhone);
      if (taken.some((p) => p.phone === normalizedPhone)) {
        setError("Ese número de teléfono ya está registrado.");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        const user = await register(email, password);
        await ensureProfile(user, {
          phone: normalizePhone(phone),
          displayName: user.email?.split("@")[0] ?? "Usuario",
        });
      }
    } catch (err) {
      setError(
        err instanceof Error && /teléfono ya está registrado/i.test(err.message)
          ? err.message
          : authErrorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex min-h-screen items-center justify-center px-4 py-10">
      <div class="w-full max-w-md">
        <div class="mb-8 text-center">
          <h1 class="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Taskly
          </h1>
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Organiza tus tareas en la nube y llévalas contigo.
          </p>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div class="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              class={
                "rounded-lg px-3 py-2 text-sm font-semibold transition-colors" +
                (mode === "login"
                  ? " bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : " text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
              }
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              class={
                "rounded-lg px-3 py-2 text-sm font-semibold transition-colors" +
                (mode === "register"
                  ? " bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : " text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200")
              }
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form class="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Correo electrónico
              <input
                class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                type="email"
                required
                value={email}
                placeholder="tucorreo@ejemplo.com"
                autocomplete={mode === "login" ? "email" : "email"}
                onInput={(event) =>
                  setEmail((event.target as HTMLInputElement).value)
                }
              />
            </label>

            <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Contraseña
              <input
                class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                type="password"
                required
                value={password}
                placeholder="••••••••"
                autocomplete={mode === "login" ? "current-password" : "new-password"}
                onInput={(event) =>
                  setPassword((event.target as HTMLInputElement).value)
                }
              />
            </label>

            {mode === "register" ? (
              <>
                <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Confirmar contraseña
                  <input
                    class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    type="password"
                    required
                    value={confirm}
                    placeholder="••••••••"
                    autocomplete="new-password"
                    onInput={(event) =>
                      setConfirm((event.target as HTMLInputElement).value)
                    }
                  />
                </label>

                <label class="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                  Teléfono
                  <input
                    class="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                    type="tel"
                    required
                    value={phone}
                    placeholder="1234 5678"
                    autocomplete="tel"
                    onInput={(event) =>
                      setPhone((event.target as HTMLInputElement).value)
                    }
                  />
                </label>
              </>
            ) : null}

            {error ? (
              <p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              class="mt-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? <Spinner /> : null}
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <div class="my-5 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span class="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            o continúa con
            <span class="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogle}
            class="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-base font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {GOOGLE_ICON}
            Continuar con Google
          </button>
        </div>
      </div>
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