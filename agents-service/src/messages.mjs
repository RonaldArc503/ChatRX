import { requireWorkspace, fingerprint, tokenMatches } from './auth.mjs';
import { parse, messageInput, replyInput, ServiceError } from './validation.mjs';

export async function sendMessage(db, identity, workspaceId, input) {
  const data = parse(messageInput, input);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  if (data.kind === 'question' && !data.targetAgentId) throw new ServiceError(400, 'Selecciona el agente que debe responder.');
  if (data.kind === 'question' && data.targetAgentId === identity.uid) throw new ServiceError(400, 'Dirige la pregunta a otro agente.');
  const key = fingerprint(`${workspaceId}:${identity.uid}:${data.requestId}`);
  const messageRef = ref.collection('messages').doc(key);
  return db.runTransaction(async tx => {
    const old = (await tx.get(messageRef)).data();
    if (old) {
      if (old.fingerprint !== fingerprint(data)) throw new ServiceError(409, 'Este envío ya se utilizó con otro contenido.', 'conflict');
      return { id: key, status: old.status ?? 'sent' };
    }
    const target = data.targetAgentId ? (await tx.get(ref.collection('agents').doc(data.targetAgentId))).data() : null;
    if (data.targetAgentId && !target?.active) throw new ServiceError(400, 'El agente seleccionado no está disponible.');
    const now = Date.now();
    const message = { text: data.text, kind: data.kind, senderId: identity.uid, senderName: identity.name, senderKind: identity.kind,
      targetAgentId: data.targetAgentId ?? null, targetAgentName: target?.name ?? null,
      status: data.kind === 'question' ? 'pending' : 'sent', createdAt: now, fingerprint: fingerprint(data) };
    tx.set(messageRef, message);
    if (data.kind === 'question') tx.set(db.collection('agentRequests').doc(key), {
      workspaceId, targetAgentId: data.targetAgentId, senderId: identity.uid, state: 'pending', attempts: 0, createdAt: now, leaseUntil: 0,
    });
    tx.update(ref, { updatedAt: now });
    return { id: key, status: message.status };
  });
}
export async function replyToRequest(db, identity, workspaceId, questionId, input) {
  const data = parse(replyInput, input);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  const requestRef = db.collection('agentRequests').doc(questionId);
  return db.runTransaction(async tx => {
    const request = (await tx.get(requestRef)).data();
    if (!request || request.workspaceId !== workspaceId) throw new ServiceError(404, 'Pregunta no disponible.');
    if (identity.kind === 'agent' && request.targetAgentId !== identity.uid) throw new ServiceError(403, 'La pregunta está dirigida a otro agente.');
    if (request.state === 'answered') return { id: request.replyId, alreadyAnswered: true };
    if (request.state === 'processing' && identity.kind === 'agent' &&
      (!data.leaseToken || request.leaseUntil < Date.now() || !tokenMatches(data.leaseToken, request.leaseHash))) {
      throw new ServiceError(409, 'Otro proceso está atendiendo esta pregunta. Espera su respuesta.', 'lease-conflict');
    }
    const now = Date.now();
    const replyId = fingerprint(`${workspaceId}:${questionId}:reply`);
    tx.set(ref.collection('messages').doc(replyId), { text: data.text, kind: 'reply', senderId: identity.uid,
      senderName: identity.name, senderKind: identity.kind, replyTo: questionId, createdAt: now, status: 'sent' });
    tx.update(ref.collection('messages').doc(questionId), { status: 'answered', replyId });
    tx.update(requestRef, { state: 'answered', replyId, answeredAt: now, leaseUntil: 0 });
    tx.update(ref, { updatedAt: now });
    return { id: replyId, alreadyAnswered: false };
  });
}
export async function readInbox(db, identity, workspaceId, limit = 15) {
  await requireWorkspace(db, identity, workspaceId);
  const documents = await db.collection('agentRequests').where('targetAgentId', '==', identity.uid)
    .where('state', 'in', ['pending', 'processing']).orderBy('createdAt', 'asc').limit(limit).get();
  const questions = await Promise.all(documents.docs.map(async document => {
    const request = document.data();
    const message = (await db.collection('agentWorkspaces').doc(workspaceId).collection('messages').doc(document.id).get()).data();
    return message && request.workspaceId === workspaceId ? { id: document.id, text: message.text, senderName: message.senderName,
      state: request.state, createdAt: request.createdAt } : null;
  }));
  return { questions: questions.filter(Boolean) };
}
