import express from 'express';
import { z } from 'zod';
import { authenticate } from './auth.mjs';
import { createWorkspace, createAgent, changeAgentToken } from './workspaces.mjs';
import { getContext, publishContext } from './context.mjs';
import { sendMessage, replyToRequest } from './messages.mjs';
import { claimRequest, releaseRequest, retryRequest } from './requests.mjs';
import { handleMcp } from './mcp.mjs';
import { id, parse, requireAgent } from './validation.mjs';

export function createApp({ db, auth, allowedOrigins = ['https://tasksv.web.app', 'https://tasksv.firebaseapp.com'] }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return res.status(403).json({ message: 'Origen no autorizado.' });
    if (req.headers.origin) {
      res.set('Access-Control-Allow-Origin', req.headers.origin);
      res.vary('Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/agents/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));
  app.use(async (req, _res, next) => {
    try { req.identity = await authenticate(db, auth, req.headers.authorization); next(); }
    catch (error) { next(error); }
  });
  for (const name of ['workspaceId', 'agentId', 'questionId']) app.param(name, (_req, _res, next, value) => {
    try { parse(id, value); next(); } catch (error) { next(error); }
  });
  app.post('/mcp', (req, res) => handleMcp(req, res, db, req.identity));
  app.all('/mcp', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'Este servidor MCP usa solicitudes HTTP POST.' }));
  app.get('/api/agents/connection', (req, res) => { requireAgent(req.identity); res.json({ agentId: req.identity.uid, name: req.identity.name, workspaceId: req.identity.workspaceId }); });
  app.post('/api/agents/workspaces', async (req, res) => res.status(201).json(await createWorkspace(db, req.identity, req.body)));
  app.post('/api/agents/workspaces/:workspaceId/agents', async (req, res) => res.status(201).json(await createAgent(db, req.identity, req.params.workspaceId, req.body)));
  app.post('/api/agents/workspaces/:workspaceId/agents/:agentId/token', async (req, res) => res.json(await changeAgentToken(db, req.identity, req.params.workspaceId, req.params.agentId, false)));
  app.post('/api/agents/workspaces/:workspaceId/agents/:agentId/revoke', async (req, res) => res.json(await changeAgentToken(db, req.identity, req.params.workspaceId, req.params.agentId, true)));
  app.get('/api/agents/workspaces/:workspaceId/context', async (req, res) => res.json(await getContext(db, req.identity, req.params.workspaceId,
    typeof req.query.key === 'string' ? req.query.key : undefined, req.query.version ? parse(z.coerce.number().int().positive(), req.query.version) : undefined)));
  app.post('/api/agents/workspaces/:workspaceId/context', async (req, res) => res.json(await publishContext(db, req.identity, req.params.workspaceId, req.body)));
  app.post('/api/agents/workspaces/:workspaceId/messages', async (req, res) => res.json(await sendMessage(db, req.identity, req.params.workspaceId, req.body)));
  app.post('/api/agents/workspaces/:workspaceId/requests/:questionId/reply', async (req, res) => res.json(await replyToRequest(db, req.identity, req.params.workspaceId, req.params.questionId, req.body)));
  app.post('/api/agents/workspaces/:workspaceId/requests/:questionId/retry', async (req, res) => res.json(await retryRequest(db, req.identity, req.params.workspaceId, req.params.questionId)));
  app.post('/api/agents/runner/claim', async (req, res) => {
    parse(z.object({}).strict(), req.body ?? {});
    res.json(await claimRequest(db, req.identity));
  });
  app.post('/api/agents/runner/:questionId/reply', async (req, res) => {
    requireAgent(req.identity);
    res.json(await replyToRequest(db, req.identity, req.identity.workspaceId, req.params.questionId, req.body));
  });
  app.post('/api/agents/runner/:questionId/release', async (req, res) => {
    const body = parse(z.object({ leaseToken: z.string().min(1).max(100) }).strict(), req.body);
    res.json(await releaseRequest(db, req.identity, req.params.questionId, body.leaseToken));
  });
  app.use((_req, res) => res.status(404).json({ message: 'Operación no disponible.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) console.error('Taskly agents service error', { name: error.name, code: error.code,
      frames: error.stack?.split('\n').slice(1, 4).join('\n') });
    res.status(status).json({ error: error.code ?? 'service-error', message: error.type === 'entity.parse.failed' ? 'Los datos JSON no son válidos.' : error.type === 'entity.too.large' ? 'La solicitud supera el tamaño permitido.' : status < 500 ? error.message : 'El servicio no pudo completar la operación. Intenta de nuevo.' });
  });
  return app;
}
