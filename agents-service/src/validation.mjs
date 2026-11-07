import { z } from 'zod';

export class ServiceError extends Error {
  constructor(status, message, code = 'invalid-request') { super(message); this.status = status; this.code = code; }
}
export const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'Identificador inválido.');
const text = max => z.string().trim().min(1, 'Escribe un contenido.').max(max);
export const workspaceInput = z.object({ name: text(80), description: z.string().trim().max(500).default('') }).strict();
export const agentInput = z.object({ name: text(80) }).strict();
export const contextInput = z.object({ key: id, title: text(100), content: text(16000), expectedVersion: z.number().int().min(0), requestId: id }).strict();
export const messageInput = z.object({ text: text(8000), targetAgentId: id.optional(), kind: z.enum(['message', 'question']).default('message'), requestId: id }).strict();
export const replyInput = z.object({ text: text(8000), requestId: id, leaseToken: z.string().max(100).optional() }).strict();
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError(400, result.error.issues[0]?.message ?? 'Datos inválidos.');
  return result.data;
}
export function requireAgent(identity) {
  if (identity.kind !== 'agent') throw new ServiceError(403, 'Esta operación requiere una conexión de agente.');
}
