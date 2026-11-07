import { randomBytes } from 'node:crypto';
import { digest, tokenMatches, requireWorkspace, requireHuman } from './auth.mjs';
import { requireAgent, ServiceError } from './validation.mjs';

export async function claimRequest(db, identity) {
  requireAgent(identity);
  await requireWorkspace(db, identity, identity.workspaceId);
  const candidates = await db.collection('agentRequests').where('targetAgentId', '==', identity.uid)
    .where('state', 'in', ['pending', 'processing']).orderBy('createdAt', 'asc').limit(20).get();
  for (const candidate of candidates.docs) {
    const leaseToken = randomBytes(24).toString('hex');
    const result = await db.runTransaction(async tx => {
      const request = (await tx.get(candidate.ref)).data();
      const now = Date.now();
      if (!request || request.workspaceId !== identity.workspaceId || request.targetAgentId !== identity.uid ||
        !['pending', 'processing'].includes(request.state) || request.leaseUntil > now) return null;
      const messageRef = db.collection('agentWorkspaces').doc(identity.workspaceId).collection('messages').doc(candidate.id);
      const message = (await tx.get(messageRef)).data();
      if (!message) return null;
      if (request.attempts >= 3) {
        tx.update(candidate.ref, { state: 'failed', leaseUntil: 0 });
        tx.update(messageRef, { status: 'failed', lastError: 'Se agotaron los tres intentos. Revisa la conexión y reintenta.' });
        return null;
      }
      const leaseUntil = now + 180_000;
      tx.update(candidate.ref, { state: 'processing', attempts: request.attempts + 1, leaseUntil, leaseHash: digest(leaseToken) });
      tx.update(messageRef, { status: 'processing', processingUntil: leaseUntil, lastError: null });
      return { id: candidate.id, text: message.text, senderName: message.senderName, leaseToken, leaseUntil };
    });
    if (result) return { request: result };
  }
  return { request: null };
}
export async function releaseRequest(db, identity, questionId, leaseToken) {
  requireAgent(identity);
  const ref = db.collection('agentRequests').doc(questionId);
  return db.runTransaction(async tx => {
    const request = (await tx.get(ref)).data();
    if (!request || request.workspaceId !== identity.workspaceId || request.targetAgentId !== identity.uid) throw new ServiceError(404, 'Pregunta no disponible.');
    if (request.state === 'answered') return { status: 'answered' };
    if (request.state !== 'processing' || !tokenMatches(leaseToken, request.leaseHash)) throw new ServiceError(409, 'El intento ya no está activo.', 'lease-conflict');
    const state = request.attempts >= 3 ? 'failed' : 'pending';
    tx.update(ref, { state, leaseUntil: 0, leaseHash: '' });
    tx.update(db.collection('agentWorkspaces').doc(identity.workspaceId).collection('messages').doc(questionId),
      { status: state, lastError: 'OpenCode no completó la respuesta. Comprueba que el conector y el modelo estén disponibles.' });
    return { status: state };
  });
}
export async function retryRequest(db, identity, workspaceId, questionId) {
  requireHuman(identity);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  const requestRef = db.collection('agentRequests').doc(questionId);
  await db.runTransaction(async tx => {
    const request = (await tx.get(requestRef)).data();
    if (!request || request.workspaceId !== workspaceId) throw new ServiceError(404, 'Pregunta no disponible.');
    if (request.state === 'answered' || (request.state === 'processing' && request.leaseUntil > Date.now())) throw new ServiceError(409, 'La pregunta ya está respondida o se está atendiendo.');
    const agent = (await tx.get(ref.collection('agents').doc(request.targetAgentId))).data();
    if (!agent?.active) throw new ServiceError(409, 'Restaura la conexión del agente antes de reintentar.');
    tx.update(requestRef, { state: 'pending', attempts: 0, leaseUntil: 0, leaseHash: '' });
    tx.update(ref.collection('messages').doc(questionId), { status: 'pending', lastError: null });
  });
  return { status: 'pending' };
}
