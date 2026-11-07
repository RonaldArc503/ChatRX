import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { initializeApp as initializeAdmin, deleteApp as deleteAdmin } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getDoc, getFirestore as clientFirestore, setDoc, setLogLevel } from 'firebase/firestore';
import { createApp } from '../src/app.mjs';
import { runConnector } from '../../public/integrations/taskly-opencode.mjs';

const enabled = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;
const integration = enabled ? test : test.skip;
const projectId = 'demo-taskly-music';
async function listen(server) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
async function ownerAccount() {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `agents-${crypto.randomUUID()}@example.test`, password: 'local-test-password', returnSecureToken: true }) });
  const data = await response.json(); assert(response.ok); return data;
}
integration('two real MCP clients share versioned context, private projects, questions, revocation and OpenCode replies', { timeout: 60000 }, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  setLogLevel('silent');
  const admin = initializeAdmin({ projectId }, `agents-admin-${Date.now()}`);
  const db = getFirestore(admin);
  // The REST SDK overwrites the emulator's owner header with its test JWT.
  // Restore it only on loopback, leaving client permission checks on port 8088.
  const proxy = process.env.TASKLY_TEST_REST_PROXY ? createServer((req, res) => {
    const upstream = httpRequest({ hostname: '127.0.0.1', port: 8088, path: req.url, method: req.method,
      headers: { ...req.headers, authorization: 'Bearer owner' } }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  }) : null;
  if (proxy) await new Promise(resolve => proxy.listen(8089, '127.0.0.1', resolve));
  const server = createServer(createApp({ db, auth: getAuth(admin) }));
  const origin = process.env.TASKLY_TEST_SERVICE_URL || await listen(server);
  const owner = await ownerAccount();
  const outsider = await ownerAccount();
  const clients = [];
  const browserApp = initializeApp({ projectId, apiKey: 'fake-key', appId: 'test-browser' }, `agents-browser-${Date.now()}`);
  const browser = clientFirestore(browserApp);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(browser, host, Number(port), { mockUserToken: { sub: owner.localId } });
  async function api(path, token, body, status = 200, extraHeaders = {}) {
    const response = await fetch(origin + '/api/agents' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, JSON.stringify(result)); return result;
  }
  async function connect(token) {
    const client = new Client({ name: 'taskly-integration', version: '1.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    clients.push(client); return client;
  }
  async function tool(client, name, args = {}, errorCode) {
    const result = await client.callTool({ name, arguments: args });
    const data = JSON.parse(result.content[0].text);
    if (errorCode) { assert(result.isError); assert.equal(data.error, errorCode); }
    else assert(!result.isError, JSON.stringify(data));
    return data;
  }
  let fakeOpenCode;
  try {
    const workspace = await api('/workspaces', owner.idToken, { name: 'Laboratorio', description: 'Configuraciones entre dos PC' }, 201);
    const path = `/workspaces/${workspace.id}`;
    const alice = await api(path + '/agents', owner.idToken, { name: 'IA-PC1' }, 201);
    const bob = await api(path + '/agents', owner.idToken, { name: 'IA-PC2' }, 201);
    assert.match(alice.token, /^tk_[a-f0-9]{32}_[a-f0-9]{64}$/);
    assert(!(await db.collection('agentCredentials').doc(alice.id).get()).data().tokenHash.includes(alice.token));
    assert(!(await db.collection('agentWorkspaces').doc(workspace.id).collection('agents').doc(alice.id).get()).data().token);
    await assert.rejects(getDoc(doc(browser, 'agentCredentials', alice.id)), error => error.code === 'permission-denied');
    await assert.rejects(setDoc(doc(browser, 'agentWorkspaces', workspace.id), { ownerUid: owner.localId }), error => error.code === 'permission-denied');
    assert((await getDoc(doc(browser, 'agentWorkspaces', workspace.id))).exists());
    const a = await connect(alice.token), b = await connect(bob.token);
    assert.equal((await a.listTools()).tools.length, 5);
    const update = { key: 'dns-01', title: 'Servidor DNS', content: 'Ubuntu instalado. Pendiente configurar DNS. Fuente: IA-PC1.', expectedVersion: 0, requestId: crypto.randomUUID() };
    assert.equal((await tool(a, 'publish_project_context', update)).version, 1);
    assert.equal((await tool(a, 'publish_project_context', update)).version, 1);
    assert.equal((await tool(b, 'get_project_context', { key: 'dns-01' })).context.authorName, 'IA-PC1');
    const competing = await Promise.all([
      a.callTool({ name: 'publish_project_context', arguments: { ...update, content: 'Cambio A', expectedVersion: 1, requestId: crypto.randomUUID() } }),
      b.callTool({ name: 'publish_project_context', arguments: { ...update, content: 'Cambio B', expectedVersion: 1, requestId: crypto.randomUUID() } }),
    ]);
    const all = competing.map(result => JSON.parse(result.content[0].text));
    assert.equal(all.filter(value => value.version === 2).length, 1);
    assert.equal(all.filter(value => value.error === 'version-conflict').length, 1);
    assert.equal((await tool(a, 'get_project_context', { key: 'dns-01', version: 1 })).context.content, update.content);
    const questionInput = { kind: 'question', targetAgentId: bob.id, text: '¿Qué falta para terminar DNS?', requestId: crypto.randomUUID() };
    const question = await tool(a, 'send_agent_message', questionInput);
    assert.equal((await tool(a, 'send_agent_message', questionInput)).id, question.id);
    await tool(a, 'send_agent_message', { ...questionInput, text: 'Otro contenido' }, 'conflict');
    assert.equal((await tool(b, 'read_agent_inbox')).questions[0].id, question.id);
    assert.equal((await tool(a, 'read_agent_inbox')).questions.length, 0);
    await tool(a, 'reply_to_agent_request', { questionId: question.id, text: 'No soy el destinatario', requestId: crypto.randomUUID() }, 'invalid-request');
    const reply = await tool(b, 'reply_to_agent_request', { questionId: question.id, text: 'Falta configurar DNS.', requestId: crypto.randomUUID() });
    assert.equal((await tool(b, 'reply_to_agent_request', { questionId: question.id, text: 'No sobrescribir', requestId: crypto.randomUUID() })).id, reply.id);
    assert.equal((await db.collection('agentWorkspaces').doc(workspace.id).collection('messages').doc(question.id).get()).data().status, 'answered');
    const foreign = await api('/workspaces', outsider.idToken, { name: 'Privado' }, 201);
    await api(`/workspaces/${foreign.id}/context`, alice.token, undefined, 403);
    await api(path + '/context', outsider.idToken, undefined, 404);
    await api('/workspaces', alice.token, { name: 'Sin permiso' }, 403);
    await api(path + '/context', owner.idToken, { ...update, key: '../escape' }, 400);
    await api(path + '/messages', owner.idToken, { text: 'Origin', requestId: crypto.randomUUID() }, 403, { Origin: 'https://evil.example' });
    await api(path + `/agents/${bob.id}/revoke`, owner.idToken, {});
    await assert.rejects(b.callTool({ name: 'read_agent_inbox', arguments: {} }));
    const restored = await api(path + `/agents/${bob.id}/token`, owner.idToken, {});
    await assert.rejects(b.callTool({ name: 'read_agent_inbox', arguments: {} }));
    const b2 = await connect(restored.token);
    assert.equal((await tool(b2, 'get_project_context')).currentAgent.id, bob.id);
    const pending = await api(path + '/messages', owner.idToken, { kind: 'question', targetAgentId: bob.id, text: 'Resume lo pendiente.', requestId: crypto.randomUUID() });
    const claims = await Promise.all([api('/runner/claim', restored.token, {}), api('/runner/claim', restored.token, {})]);
    assert.equal(claims.filter(value => value.request).length, 1);
    const claim = claims.find(value => value.request).request;
    await api(`/runner/${pending.id}/reply`, restored.token, { text: 'Bad lease', leaseToken: 'bad', requestId: crypto.randomUUID() }, 409);
    await api(`/runner/${pending.id}/release`, restored.token, { leaseToken: claim.leaseToken });
    const prompts = [];
    fakeOpenCode = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/config') return res.end(JSON.stringify({ agent: { 'taskly-context': { permission: { '*': 'deny' }, steps: 1 } }, privateSetting: 'DO_NOT_COPY' }));
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (req.url === '/session') return res.end(JSON.stringify({ id: 'session-test' }));
      if (req.url === '/session/session-test/message') { prompts.push(JSON.parse(raw)); return res.end(JSON.stringify({ info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Según el contexto compartido, falta configurar DNS.' }] })); }
      if (req.url.endsWith('/abort')) return res.end('true');
      res.statusCode = 404; res.end('{}');
    });
    const openCodeUrl = await listen(fakeOpenCode);
    const result = await runConnector({ serviceUrl: origin, token: restored.token, openCodeUrl, once: true, onStatus: () => {} });
    assert.equal(result.answered, 1);
    assert.equal(prompts[0].agent, 'taskly-context');
    assert(!prompts[0].parts[0].text.includes(restored.token));
    assert(!prompts[0].parts[0].text.includes('DO_NOT_COPY'));
    assert.equal((await db.collection('agentWorkspaces').doc(workspace.id).collection('messages').doc(pending.id).get()).data().status, 'answered');
    assert((await getDoc(doc(browser, 'agentWorkspaces', workspace.id, 'contexts', 'dns-01'))).exists());
    const failures = await api(path + '/messages', owner.idToken, { kind: 'question', targetAgentId: bob.id, text: 'Sin OpenCode', requestId: crypto.randomUUID() });
    for (let attempt = 0; attempt < 3; attempt++) {
      const lease = (await api('/runner/claim', restored.token, {})).request;
      assert.equal(lease.id, failures.id);
      await api(`/runner/${lease.id}/release`, restored.token, { leaseToken: lease.leaseToken });
    }
    assert.equal((await db.collection('agentRequests').doc(failures.id).get()).data().state, 'failed');
    await api(path + `/requests/${failures.id}/retry`, owner.idToken, {});
    assert.equal((await db.collection('agentRequests').doc(failures.id).get()).data().attempts, 0);
  } finally {
    await Promise.all(clients.map(client => client.close().catch(() => {})));
    if (fakeOpenCode) await close(fakeOpenCode);
    if (proxy) await close(proxy);
    if (server.listening) await close(server); await deleteApp(browserApp); await deleteAdmin(admin);
  }
});
