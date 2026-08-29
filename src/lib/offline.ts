import { waitForPendingWrites } from "firebase/firestore";
import { db } from "./firebase";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function subscribeOnlineChange(cb: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleOnline = () => cb(true);
  const handleOffline = () => cb(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

export async function flushFirestoreWrites(): Promise<void> {
  if (!db) return;
  try {
    await waitForPendingWrites(db);
  } catch {
    // sin conexión aún: se reintentará en el siguiente evento online
  }
}