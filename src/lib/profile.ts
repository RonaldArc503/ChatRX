import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  emailLower: string;
  phone: string;
  photoURL: string;
  createdAt: number;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("503") && digits.length > 8
    ? digits.slice(3)
    : digits;
}

export function formatPhone(raw: string): string {
  const num = normalizePhone(raw);
  if (!num) return "";
  if (num.length === 8) return `${num.slice(0, 4)} ${num.slice(4)}`;
  if (num.length <= 6) return num;
  return `+${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5, 8)} ${num.slice(8)}`.trim();
}

export function phoneTakenError(): Error {
  return new Error("El teléfono ya está registrado por otro usuario.");
}

function profileRef(uid: string) {
  return doc(db!, "profiles", uid);
}

function phoneRef(phone: string) {
  return doc(db!, "phoneIndex", phone);
}

async function claimPhone(phone: string, uid: string): Promise<void> {
  if (!phone) return;
  await runTransaction(db!, async (tx) => {
    const ref = phoneRef(phone);
    const snap = await tx.get(ref);
    if (snap.exists()) {
      const existing = snap.data() as { uid: string };
      if (existing.uid !== uid) throw phoneTakenError();
    }
    tx.set(ref, { uid });
  });
}

export async function ensureProfile(
  user: User,
  extras?: { phone?: string; displayName?: string },
): Promise<UserProfile> {
  const ref = profileRef(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { uid: user.uid, ...(snap.data() as Omit<UserProfile, "uid">) };
  }

  const fallbackName =
    user.displayName ??
    (user.email ? user.email.split("@")[0] : "Usuario");
  const email = user.email ?? "";
  const phone = normalizePhone(extras?.phone ?? "");
  const profile: UserProfile = {
    uid: user.uid,
    displayName: extras?.displayName?.trim() || fallbackName,
    email,
    emailLower: email.toLowerCase(),
    phone,
    photoURL: user.photoURL ?? "",
    createdAt: Date.now(),
  };

  if (profile.phone) {
    await claimPhone(profile.phone, user.uid);
  }
  await setDoc(ref, profile);
  return profile;
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(profileRef(uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as Omit<UserProfile, "uid">) };
}

export async function updateProfile(
  uid: string,
  patch: { displayName?: string; phone?: string; photoURL?: string },
): Promise<void> {
  const ref = profileRef(uid);
  const snap = await getDoc(ref);
  const current = (snap.exists() ? snap.data() : {}) as Partial<UserProfile>;
  const update: Record<string, unknown> = {};

  if (patch.displayName !== undefined) {
    update.displayName = patch.displayName.trim();
  }
  if (patch.photoURL !== undefined) {
    update.photoURL = patch.photoURL;
  }
  if (patch.phone !== undefined) {
    const newPhone = normalizePhone(patch.phone);
    const oldPhone = current.phone ?? "";
    if (newPhone !== oldPhone) {
      if (newPhone) {
        await claimPhone(newPhone, uid);
      }
      if (oldPhone) {
        await deleteDoc(phoneRef(oldPhone));
      }
      update.phone = newPhone;
    }
  }

  if (Object.keys(update).length > 0) {
    await setDoc(ref, update, { merge: true });
  }
}

export async function searchProfiles(term: string): Promise<UserProfile[]> {
  const t = term.trim();
  if (t.length < 2) return [];

  const col = collection(db!, "profiles");
  const results = new Map<string, UserProfile>();

  const typed = normalizePhone(t);
  if (typed.length >= 8) {
    const snap = await getDocs(query(col, where("phone", "==", typed)));
    snap.forEach((d) =>
      results.set(d.id, { uid: d.id, ...(d.data() as Omit<UserProfile, "uid">) }),
    );
  }

  if (t.includes("@")) {
    const snap = await getDocs(query(col, where("emailLower", "==", t.toLowerCase())));
    snap.forEach((d) =>
      results.set(d.id, { uid: d.id, ...(d.data() as Omit<UserProfile, "uid">) }),
    );
  }

  return Array.from(results.values());
}