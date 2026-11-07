import assert from 'node:assert/strict';
import test from 'node:test';
import { runConnector } from '../../public/integrations/taskly-opencode.mjs';
import { digest, newToken, tokenMatches } from '../src/auth.mjs';
import { contextInput, messageInput, parse } from '../src/validation.mjs';

test('credentials contain independent entropy and are compared against hashes', () => {
  const one = newToken('a'.repeat(32));
  const two = newToken('a'.repeat(32));
  assert.notEqual(one, two);
  assert(tokenMatches(one, digest(one)));
  assert(!tokenMatches(two, digest(one)));
  assert(!tokenMatches(one, ''));
});
test('context ids cannot address a different document or project', () => {
  for (const key of ['../other', 'vm/config', '', 'a'.repeat(81)]) assert.throws(() => parse(contextInput, { key, title: 'VM', content: 'State', expectedVersion: 0, requestId: 'request' }));
  assert.throws(() => parse(messageInput, { text: 'Hello', requestId: 'request', senderId: 'impersonation' }));
  assert.throws(() => parse(contextInput, { key: 'vm', title: 'VM', content: 'x'.repeat(16001), expectedVersion: 0, requestId: 'request' }));
});
test('connector never sends its credential to insecure remote HTTP or nonlocal OpenCode', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('must not fetch'); };
  await assert.rejects(runConnector({ serviceUrl: 'http://remote.example', token: 'private', fetchImpl }));
  await assert.rejects(runConnector({ serviceUrl: 'https://taskly.example', token: 'private', openCodeUrl: 'https://remote.example', fetchImpl }));
  assert.equal(calls, 0);
});
test('automatic connector rejects an agent that can execute tools before claiming work', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ agent: { 'taskly-context': { steps: 1, permission: { '*': 'deny', bash: 'allow' } } } }), { status: 200 });
  };
  await assert.rejects(runConnector({ serviceUrl: 'https://taskly.example', token: 'private', fetchImpl }), /taskly-context/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:4096/config');
  assert.equal(calls[0].options.headers.Authorization, undefined);
});
test('connector preserves the Supabase function prefix without allowing arbitrary service paths', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const body = url.endsWith('/config') ? { agent: { 'taskly-context': { steps: 1, permission: { '*': 'deny' } } } }
      : url.endsWith('/connection') ? { name: 'PC1', workspaceId: 'project' } : { request: null };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  await runConnector({ serviceUrl: 'https://example.supabase.co/functions/v1/taskly-agents/', token: 'private', once: true, fetchImpl, onStatus: () => {} });
  assert.equal(calls[1].url, 'https://example.supabase.co/functions/v1/taskly-agents/api/agents/connection');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer private');
  await assert.rejects(runConnector({ serviceUrl: 'https://example.com/other', token: 'private', fetchImpl }));
});
