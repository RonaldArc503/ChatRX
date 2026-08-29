import type { ForwardedFrom, ReplyInfo } from "./chat";

export interface PendingMessage {
  localId: string;
  convId: string;
  senderId: string;
  text: string;
  createdAt: number;
  replyTo?: ReplyInfo | null;
  mentions?: string[];
  forwardedFrom?: ForwardedFrom | null;
}

const DB_NAME = "taskly-pending";
const DB_VERSION = 1;
const STORE = "messages";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "localId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueuePending(msg: PendingMessage): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await tx("readwrite", (store) => store.put(msg));
  } catch {
    // si IndexedDB no está disponible, el mensaje no se puede persistir
  }
}

export async function listPending(convId?: string): Promise<PendingMessage[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const all = await tx<PendingMessage[]>("readonly", (store) => {
      const request: IDBRequest<PendingMessage[]> = store.getAll();
      return request as IDBRequest<PendingMessage[]>;
    });
    const source = Array.isArray(all) ? all : [];
    const filtered = convId ? source.filter((m) => m.convId === convId) : source;
    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removePending(localId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await tx("readwrite", (store) => store.delete(localId));
  } catch {
    // ignora
  }
}

export async function flushPending(
  send: (msg: PendingMessage) => Promise<void>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const pending = await listPending();
  for (const msg of pending) {
    try {
      await send(msg);
      await removePending(msg.localId);
    } catch {
      // el envío falló (sigue sin conexión o error de servidor): se conserva en la cola
      break;
    }
  }
}

export function newLocalId(): string {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}