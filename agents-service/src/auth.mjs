import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ServiceError } from './validation.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const fingerprint = value => digest(JSON.stringify(value));
export const newToken = agentId => `tk_${agentId}_${randomBytes(32).toString('hex')}`;
export function tokenMatches(token, expected) {
  const actual = Buffer.from(digest(token), 'hex');
  const saved = Buffer.from(expected ?? '', 'hex');
  return actual.length === saved.length && timingSafeEqual(actual, saved);
}
export async function authenticate(db, auth, header) {
  const bearer = /^Bearer ([^\s]{1,4096})$/i.exec(header ?? '')?.[1];
  if (!bearer) throw new ServiceError(401, 'Inicia sesión o configura la credencial del agente.', 'unauthorized');
  if (!bearer.startsWith('tk_')) {
    try {
      const user = await auth.verifyIdToken(bearer, true);
      return { kind: 'human', uid: user.uid, name: user.name || 'Tú' };
    } catch { throw new ServiceError(401, 'Tu sesión venció. Vuelve a iniciar sesión.', 'unauthorized'); }
  }
  const agentId = /^tk_([a-f0-9]{32})_[a-f0-9]{64}$/.exec(bearer)?.[1];
  if (!agentId) throw new ServiceError(401, 'Credencial inválida.', 'unauthorized');
  const ref = db.collection('agentCredentials').doc(agentId);
  const now = Date.now();
  return db.runTransaction(async tx => {
    const credential = (await tx.get(ref)).data();
    if (!credential || credential.revoked || !tokenMatches(bearer, credential.tokenHash)) throw new ServiceError(401, 'Conexión revocada o credencial inválida.', 'unauthorized');
    const workspace = db.collection('agentWorkspaces').doc(credential.workspaceId);
    const project = (await tx.get(workspace)).data();
    const agentRef = workspace.collection('agents').doc(agentId);
    const agent = (await tx.get(agentRef)).data();
    if (!project || project.archived || !agent?.active) throw new ServiceError(403, 'El proyecto o la conexión ya no están disponibles.');
    const count = now - (credential.windowAt ?? 0) < 60_000 ? (credential.windowCount ?? 0) + 1 : 1;
    if (count > 120) throw new ServiceError(429, 'Demasiadas solicitudes. Espera un minuto.', 'rate-limit');
    tx.update(ref, { windowAt: count === 1 ? now : credential.windowAt, windowCount: count });
    if (now - (agent.lastSeenAt ?? 0) >= 30_000) tx.update(agentRef, { lastSeenAt: now });
    return { kind: 'agent', uid: agentId, name: agent.name, workspaceId: credential.workspaceId, ownerUid: project.ownerUid };
  });
}
export async function requireWorkspace(db, identity, workspaceId) {
  if (identity.kind === 'agent' && identity.workspaceId !== workspaceId) throw new ServiceError(403, 'La conexión pertenece a otro proyecto.');
  const ref = db.collection('agentWorkspaces').doc(workspaceId);
  const data = (await ref.get()).data();
  if (!data || (identity.kind === 'human' && data.ownerUid !== identity.uid)) throw new ServiceError(404, 'Proyecto no disponible.');
  return { ref, data };
}
export function requireHuman(identity) {
  if (identity.kind !== 'human') throw new ServiceError(403, 'Solo el propietario puede administrar las conexiones.');
}
