import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { opencodeConfiguration, agentOnline } from './agentModel.ts';

test('OpenCode config uses an environment credential and a dedicated tool-free coordinator', () => {
  const config = opencodeConfiguration('https://tasksv.web.app/');
  assert.equal(config.mcp.taskly.url, 'https://tasksv.web.app/mcp');
  assert.equal(config.mcp.taskly.oauth, false);
  assert.equal(config.mcp.taskly.headers.Authorization, 'Bearer {env:TASKLY_AGENT_TOKEN}');
  assert.deepEqual(config.agent['taskly-context'].permission, { '*': 'deny' });
  assert.equal(config.agent['taskly-context'].steps, 1);
});
test('recent activity does not imply a revoked agent is online', () => {
  const agent = { active: true, lastSeenAt: 100000 };
  assert(agentOnline(agent, 110000));
  assert(!agentOnline({ ...agent, active: false }, 110000));
  assert(!agentOnline(agent, 200001));
});
test('service worker never serves or stores authenticated agent responses from cache', async () => {
  let fetchHandler;
  let cached = 0, network = 0;
  const context = { URL, self: { location: { origin: 'https://tasksv.web.app' }, addEventListener: (type, handler) => { if (type === 'fetch') fetchHandler = handler; } },
    caches: { open: async () => { cached++; throw new Error('No cache access allowed'); } },
    fetch: async () => { network++; return { ok: true }; } };
  vm.runInNewContext(await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8'), context);
  for (const path of ['/api/agents/health', '/api/agents/workspaces/private/context', '/mcp']) {
    let result;
    fetchHandler({ request: { method: 'GET', mode: 'cors', url: 'https://tasksv.web.app' + path }, respondWith: value => { result = value; } });
    await Promise.resolve(result);
  }
  assert.equal(network, 3);
  assert.equal(cached, 0);
});
