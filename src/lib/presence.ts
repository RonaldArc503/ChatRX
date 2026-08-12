import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";

export interface Presence {
  online: boolean;
  lastSeen: number;
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
  return onSnapshot(presenceRef(uid), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    cb({
      online: data.online === true,
      lastSeen: typeof data.lastSeen === "number" ? data.lastSeen : 0,
    });
  });
}