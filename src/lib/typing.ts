import {
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

function typingRef(convId: string) {
  return doc(db!, "typing", convId);
}

export function setTyping(convId: string, uid: string): void {
  setDoc(typingRef(convId), { [uid]: Date.now() }, { merge: true }).catch(
    () => {},
  );
}

export function clearTyping(convId: string, uid: string): void {
  updateDoc(typingRef(convId), { [uid]: deleteField() }).catch(() => {});
}

export function subscribeTyping(
  convId: string,
  cb: (users: Record<string, number>) => void,
): Unsubscribe {
  return onSnapshot(typingRef(convId), (snap) => {
    if (!snap.exists()) {
      cb({});
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") out[key] = value;
    }
    cb(out);
  });
}