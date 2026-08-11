import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Unsubscribe,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

export function onAuthChange(cb: (user: User | null) => void): Unsubscribe | (() => void) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

export async function login(email: string, password: string): Promise<void> {
  if (!auth) throw new Error("Firebase no inicializado");
  await signInWithEmailAndPassword(auth, email, password);
}

export async function register(email: string, password: string): Promise<User> {
  if (!auth) throw new Error("Firebase no inicializado");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function loginWithGoogle(): Promise<void> {
  if (!auth) throw new Error("Firebase no inicializado");
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

export async function signOut(): Promise<void> {
  if (!auth) return;
  await firebaseSignOut(auth);
}

export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  const messages: Record<string, string> = {
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/invalid-login-credentials": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "La contraseña es incorrecta.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
    "auth/popup-closed-by-user": "Ventana de Google cerrada antes de terminar.",
    "auth/cancelled-popup-request": "Solicitud cancelada. Intenta de nuevo.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
  };

  return messages[code] ?? "Ocurrió un error inesperado. Intenta de nuevo.";
}