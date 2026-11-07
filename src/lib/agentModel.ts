export interface AgentWorkspace { id: string; name: string; description: string; ownerUid: string; updatedAt: number }
export interface ProjectAgent { id: string; name: string; active: boolean; createdAt: number; lastSeenAt: number }
export interface ProjectContext { key: string; title: string; content: string; version: number; authorName: string; updatedAt: number }
export interface AgentMessage {
  id: string; text: string; kind: 'message' | 'question' | 'reply' | 'context'; senderId: string; senderName: string;
  senderKind: 'human' | 'agent'; targetAgentId?: string; targetAgentName?: string; createdAt: number;
  status: 'pending' | 'processing' | 'answered' | 'failed' | 'sent'; replyTo?: string; contextKey?: string; lastError?: string; processingUntil?: number;
}
export const REQUEST_STATES = { pending: 'En espera', processing: 'Preparando respuesta', answered: 'Respondida', failed: 'Revisar conexión', sent: 'Enviado' };
export function agentOnline(agent: Pick<ProjectAgent, 'active' | 'lastSeenAt'>, now = Date.now()) { return agent.active && agent.lastSeenAt > now - 90_000; }
export function opencodeConfiguration(serviceUrl: string) {
  return {
    $schema: 'https://opencode.ai/config.json',
    mcp: { taskly: { type: 'remote', url: `${serviceUrl.replace(/\/$/, '')}/mcp`, oauth: false,
      headers: { Authorization: 'Bearer {env:TASKLY_AGENT_TOKEN}' } } },
    agent: { 'taskly-context': { description: 'Responde consultas con el contexto compartido de Taskly.', mode: 'primary', steps: 1,
      permission: { '*': 'deny' }, prompt: 'Responde solo con el contexto del proyecto incluido en la solicitud. Indica qué información falta. No ejecutes herramientas ni cambios.' } },
  };
}
