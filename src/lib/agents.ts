import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { AgentWorkspace, ProjectAgent, ProjectContext, AgentMessage } from './agentModel';

export function agentServiceUrl() { return (import.meta.env.PUBLIC_TASKLY_AGENT_SERVICE_URL || window.location.origin).replace(/\/$/, ''); }
export async function agentApi<T>(path: string, body?: unknown): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Inicia sesión para usar los proyectos de IA.');
  const response = await fetch(`${agentServiceUrl()}/api/agents${path}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({ message: 'El servidor de agentes todavía no está disponible.' }));
  if (!response.ok) throw new Error(data.message ?? 'No se pudo completar la operación.');
  return data as T;
}
export async function agentServiceReady() {
  try {
    const response = await fetch(`${agentServiceUrl()}/api/agents/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return response.ok && (await response.json()).status === 'ok';
  } catch { return false; }
}
export function watchAgentWorkspaces(uid: string, next: (items: AgentWorkspace[]) => void, fail: (error: Error) => void) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'agentWorkspaces'), where('ownerUid', '==', uid), limit(20)),
    snapshot => next(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as AgentWorkspace)).sort((a,b) => b.updatedAt - a.updatedAt)), fail);
}
export function watchProjectAgents(projectId: string, next: (items: ProjectAgent[]) => void, fail: (error: Error) => void) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'agentWorkspaces', projectId, 'agents'), orderBy('createdAt'), limit(20)),
    snapshot => next(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as ProjectAgent))), fail);
}
export function watchProjectContexts(projectId: string, next: (items: ProjectContext[]) => void, fail: (error: Error) => void) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'agentWorkspaces', projectId, 'contexts'), orderBy('updatedAt', 'desc'), limit(50)),
    snapshot => next(snapshot.docs.map(item => ({ ...item.data(), key: item.id } as ProjectContext))), fail);
}
export function watchAgentMessages(projectId: string, count: number, next: (items: AgentMessage[]) => void, fail: (error: Error) => void) {
  if (!db) return () => {};
  return onSnapshot(query(collection(db, 'agentWorkspaces', projectId, 'messages'), orderBy('createdAt', 'desc'), limit(count)),
    snapshot => next(snapshot.docs.map(item => ({ ...item.data(), id: item.id } as AgentMessage)).reverse()), fail);
}
