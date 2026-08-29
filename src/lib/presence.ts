import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";

export interface Presence {
  online: boolean;
  lastSeen: number;
}

const ONLINE_WINDOW_MS = 90_000;

export function isOnlineNow(
  p: Presence | null | undefined,
  now: number = Date.now(),
): boolean {
  return p?.online === true && now - p.lastSeen <= ONLINE_WINDOW_MS;
}

function presenceRef(uid: string) {
  return doc(db!, "presence", uid);
}

export function setOnline(uid: string): void {
  setDoc(
    presenceRef(uid),
    { online: true, lastSeen: Date.now() },
    { merge: true },
  ).catch(() => {});
}

export function setOffline(uid: string): void {
  setDoc(
    presenceRef(uid),
    { online: false, lastSeen: Date.now() },
    { merge: true },
  ).catch(() => {});
}

export function subscribePresence(
  uid: string,
  cb: (presence: Presence | null) => void,
): Unsubscribe {
  return onSnapshot(
    presenceRef(uid),
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      cb({
        online: data.online === true,
        lastSeen: typeof data.lastSeen === "number" ? data.lastSeen : 0,
      });
    },
    (error) => {
      console.error("Error al escuchar la presencia:", error);
    },
  );
}