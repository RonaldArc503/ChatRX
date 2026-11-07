import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getAnalytics, type Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
  measurementId: import.meta.env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const localEmulators = import.meta.env.DEV && import.meta.env.PUBLIC_FIREBASE_EMULATORS === "1";
if (localEmulators) Object.assign(firebaseConfig, {
  projectId: "demo-taskly-music", apiKey: "fake-api-key", authDomain: "localhost", appId: "1:123:web:playlist-test",
});

const browser = typeof window !== "undefined";

export const app: FirebaseApp | null = browser ? initializeApp(firebaseConfig) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    })
  : null;

if (localEmulators && auth && db) {
  connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8088);
}

export function initAnalytics(): Analytics | null {
  if (!browser || !app || localEmulators) return null;
  try {
    return getAnalytics(app);
  } catch {
    return null;
  }
}
