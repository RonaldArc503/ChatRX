import { randomUUID } from 'node:crypto';
import { digest, newToken, requireHuman, requireWorkspace } from './auth.mjs';
import { parse, workspaceInput, agentInput, ServiceError } from './validation.mjs';

export async function createWorkspace(db, identity, input) {
  requireHuman(identity);
  const data = parse(workspaceInput, input);
  const existing = await db.collection('agentWorkspaces').where('ownerUid', '==', identity.uid).limit(20).get();
  if (existing.size >= 20) throw new ServiceError(409, 'Ya tienes 20 proyectos de agentes.');
  const ref = db.collection('agentWorkspaces').doc();
  const now = Date.now();
  await ref.set({ ...data, ownerUid: identity.uid, createdAt: now, updatedAt: now, archived: false, agentCount: 0 });
  return { id: ref.id, ...data };
}
export async function createAgent(db, identity, workspaceId, input) {
  requireHuman(identity);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  const { name } = parse(agentInput, input);
  const agentId = randomUUID().replaceAll('-', '');
  const token = newToken(agentId);
  await db.runTransaction(async tx => {
    const project = (await tx.get(ref)).data();
    if ((project.agentCount ?? 0) >= 20) throw new ServiceError(409, 'Este proyecto ya tiene 20 conexiones.');
    tx.set(ref.collection('agents').doc(agentId), { name, active: true, createdAt: Date.now(), lastSeenAt: 0 });
    tx.set(db.collection('agentCredentials').doc(agentId), { workspaceId, ownerUid: identity.uid, tokenHash: digest(token), revoked: false, createdAt: Date.now() });
    tx.update(ref, { agentCount: (project.agentCount ?? 0) + 1, updatedAt: Date.now() });
  });
  return { id: agentId, name, token };
}
export async function changeAgentToken(db, identity, workspaceId, agentId, revoke) {
  requireHuman(identity);
  const { ref } = await requireWorkspace(db, identity, workspaceId);
  const agentRef = ref.collection('agents').doc(agentId);
  const credentialRef = db.collection('agentCredentials').doc(agentId);
  const token = revoke ? null : newToken(agentId);
  await db.runTransaction(async tx => {
    const agent = (await tx.get(agentRef)).data();
    const credential = (await tx.get(credentialRef)).data();
    if (!agent || credential?.workspaceId !== workspaceId) throw new ServiceError(404, 'Conexión no disponible.');
    tx.update(agentRef, { active: !revoke, lastSeenAt: 0 });
    tx.update(credentialRef, { revoked: revoke, ...(token ? { tokenHash: digest(token), windowCount: 0, windowAt: 0 } : {}) });
  });
  return { id: agentId, token, active: !revoke };
}
