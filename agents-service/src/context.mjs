import { requireWorkspace, fingerprint } from './auth.mjs';
import { parse, id, contextInput, ServiceError } from './validation.mjs';

export async function getContext(db, identity, workspaceId, key, version) {
  const { ref, data } = await requireWorkspace(db, identity, workspaceId);
  if (key) {
    parse(id, key);
    const contextRef = ref.collection('contexts').doc(key);
    const document = await (version ? contextRef.collection('revisions').doc(String(version)) : contextRef).get();
    if (!document.exists) throw new ServiceError(404, 'Ese contexto no está disponible.');
    return { project: data.name, context: { key, ...document.data() } };
  }
  const contexts = await ref.collection('contexts').orderBy('updatedAt', 'desc').limit(20).get();
  let budget = 16000;
  return { project: data.name, workspaceId, contexts: contexts.docs.map(document => {
    const context = document.data();
    const content = context.content.slice(0, Math.min(2000, Math.max(0, budget)));
    budget -= content.length;
    return { key: document.id, ...context, content, truncated: content.length < context.content.length };
  }) };
}
export async function publishContext(db, identity, workspaceId, input) {
  const data = parse(contextInput, input);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  const contextRef = ref.collection('contexts').doc(data.key);
  const operation = ref.collection('operations').doc(fingerprint(`${identity.uid}:${data.requestId}`));
  const hash = fingerprint(data);
  return db.runTransaction(async tx => {
    const previous = (await tx.get(operation)).data();
    if (previous) {
      if (previous.fingerprint !== hash) throw new ServiceError(409, 'El identificador ya se utilizó con otros datos.', 'conflict');
      return previous.result;
    }
    const current = (await tx.get(contextRef)).data();
    if ((current?.version ?? 0) !== data.expectedVersion) throw new ServiceError(409, 'El contexto cambió en otra conexión. Léelo de nuevo antes de guardar.', 'version-conflict');
    const now = Date.now();
    const context = { title: data.title, content: data.content, version: data.expectedVersion + 1,
      authorId: identity.uid, authorName: identity.name, authorKind: identity.kind, updatedAt: now };
    tx.set(contextRef, context);
    tx.set(contextRef.collection('revisions').doc(String(context.version)), context);
    tx.set(ref.collection('messages').doc(operation.id), { kind: 'context', text: `Actualizó ${data.title} (v${context.version})`,
      senderId: identity.uid, senderName: identity.name, senderKind: identity.kind, contextKey: data.key, createdAt: now, status: 'sent' });
    const result = { key: data.key, version: context.version };
    tx.set(operation, { fingerprint: hash, result, createdAt: now });
    tx.update(ref, { updatedAt: now });
    return result;
  });
}
