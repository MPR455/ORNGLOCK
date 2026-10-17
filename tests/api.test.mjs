import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGuard, handleApi } from '../server/api.mjs';
import { startLocal } from '../server/local.mjs';
import { ACTIONS, MAX_NOTE_CHARS } from '../server/actions.mjs';

const prompts = Object.fromEntries(ACTIONS.map(action => [action.id, `Private instructions for ${action.id}.`]));
const sharedKey = 'shared-test-secret';
const personalKey = 'personal-test-secret';
const notes = 'Synthetic case. 76M; suspected pneumonia. Ceftriaxone 2 g QD. NC 3 L/min. Foley removed on 10/16. NG status not documented.';
const success = text => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
const request = (payload, extra = {}) => new Request('http://127.0.0.1:8787/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra.headers }, body: JSON.stringify(payload), ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')) });
const options = extra => ({ prompts, sharedKey, guard: createMemoryGuard({ perMinute: 100 }), ...extra });

test('all four actions select the correct private prompt and command; user data stays in the user message', async () => {
  for (const action of ACTIONS) {
    let captured;
    const response = await handleApi(request({ action: action.id, notes }), options({ fetch: async (url, init) => { captured = { url, ...init, payload: JSON.parse(init.body) }; return success(`Completed ${action.id}`); } }));
    assert.equal(response.status, 200);
    assert.ok(captured.url.endsWith('gemini-3.5-flash-lite:generateContent'));
    assert.equal(captured.headers['x-goog-api-key'], sharedKey);
    assert.ok(captured.payload.system_instruction.parts[0].text.startsWith(prompts[action.id]));
    assert.ok(!captured.payload.system_instruction.parts[0].text.includes(notes));
    assert.ok(captured.payload.contents[0].parts[0].text.startsWith(action.command));
    assert.ok(captured.payload.contents[0].parts[0].text.includes(notes));
    const result = await response.json(); assert.equal(result.text, `Completed ${action.id}`); assert.equal(result.keyMode, 'shared');
    assert.ok(!JSON.stringify(result).includes(sharedKey)); assert.ok(!JSON.stringify(result).includes('Private instructions'));
  }
});

test('shared provider quota exhaustion offers personal-key fallback without leaking the provider response', async () => {
  const response = await handleApi(request({ action: 'support', notes }), options({ fetch: async () => new Response(`secret ${sharedKey}; ${notes}`, { status: 429 }) }));
  const result = await response.json(); assert.equal(response.status, 429); assert.equal(result.error.code, 'SHARED_QUOTA_EXHAUSTED'); assert.equal(result.error.canUseOwnKey, true);
  assert.ok(!JSON.stringify(result).includes(sharedKey)); assert.ok(!JSON.stringify(result).includes(notes));
});

test('personal key is explicitly selected and works after the shared daily allowance is exhausted', async () => {
  const guard = createMemoryGuard({ daily: 1, perMinute: 100 }); const seen = [];
  const settings = options({ guard, fetch: async (_url, init) => { seen.push(init.headers['x-goog-api-key']); return success('Antibiotics: Ceftriaxone\nFoley: Removed\nNG: Not documented'); } });
  assert.equal((await handleApi(request({ action: 'support', notes }), settings)).status, 200);
  const blocked = await handleApi(request({ action: 'support', notes }), settings); assert.equal(blocked.status, 429);
  const personal = await handleApi(request({ action: 'support', notes, apiKey: personalKey }), settings);
  assert.equal(personal.status, 200); assert.equal((await personal.json()).keyMode, 'personal'); assert.deepEqual(seen, [sharedKey, personalKey]);
});

test('personal quota failure is distinguished from shared failure', async () => {
  const response = await handleApi(request({ action: 'support', notes, apiKey: personalKey }), options({ fetch: async () => new Response('Quota', { status: 429 }) }));
  const result = await response.json(); assert.equal(result.error.code, 'PERSONAL_QUOTA_EXHAUSTED'); assert.equal(result.error.canUseOwnKey, false);
});

test('invalid shared key offers fallback; invalid personal key does not silently switch to the owner key', async () => {
  for (const apiKey of [undefined, personalKey]) {
    let calls = 0;
    const response = await handleApi(request({ action: 'admission', notes, ...(apiKey ? { apiKey } : {}) }), options({ fetch: async () => { calls++; return new Response('Rejected', { status: 403 }); } }));
    const result = await response.json(); assert.equal(calls, 1); assert.equal(result.error.code, apiKey ? 'PERSONAL_KEY_REJECTED' : 'SHARED_KEY_UNAVAILABLE'); assert.equal(result.error.canUseOwnKey, !apiKey);
  }
});

test('invalid, missing, oversize and unknown-action inputs never call Gemini', async () => {
  let calls = 0; const settings = options({ fetch: async () => { calls++; return success('Wrong'); } });
  for (const payload of [{ action: 'admission', notes: '' }, { action: '../../master prompt', notes }, { action: 'admission', notes: 'x'.repeat(MAX_NOTE_CHARS + 1) }, { action: 'support', notes, apiKey: 'key\r\ninjected' }, null]) {
    assert.ok((await handleApi(request(payload), settings)).status >= 400);
  }
  assert.equal(calls, 0);
});

test('foreign origins cannot use the API, and approved origins receive correct CORS headers', async () => {
  let calls = 0; const settings = options({ allowedOrigins: ['https://mpr455.github.io'], fetch: async () => { calls++; return success('Done'); } });
  const blocked = await handleApi(request({ action: 'support', notes }, { headers: { Origin: 'https://untrusted.example' } }), settings);
  assert.equal(blocked.status, 403); assert.equal(calls, 0); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
  const allowed = await handleApi(request({ action: 'support', notes }, { headers: { Origin: 'https://mpr455.github.io' } }), settings);
  assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://mpr455.github.io');
  const preflight = await handleApi(new Request('http://127.0.0.1:8787/api/generate', { method: 'OPTIONS', headers: { Origin: 'https://mpr455.github.io' } }), settings); assert.equal(preflight.status, 204);
});

test('rate limits expire at the next minute; shared allowance resets next UTC day', async () => {
  let now = Date.parse('2026-10-17T00:00:00Z'); const guard = createMemoryGuard({ perMinute: 1, daily: 1, now: () => now });
  assert.equal((await guard.take({ ip: 'a', shared: true })).allowed, true);
  assert.equal((await guard.take({ ip: 'a', shared: false })).code, 'RATE_LIMITED');
  now += 60_000;
  assert.equal((await guard.take({ ip: 'b', shared: true })).code, 'SHARED_QUOTA_EXHAUSTED');
  assert.equal((await guard.take({ ip: 'a', shared: false })).allowed, true);
  now += 86_400_000;
  assert.equal((await guard.take({ ip: 'a', shared: true })).allowed, true);
});

test('truncated, blocked, empty and thinking-only responses are not presented as completed notes', async () => {
  for (const result of [{ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Partial note' }] } }] }, { promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'Internal thought' }] } }] }]) {
    const response = await handleApi(request({ action: 'admission', notes }), options({ fetch: async () => Response.json(result) })); assert.ok(response.status >= 400); assert.equal((await response.json()).text, undefined);
  }
});

test('provider timeouts return a useful error without forwarding private details', async () => {
  const response = await handleApi(request({ action: 'support', notes }), options({ timeoutMs: 10, fetch: async (_url, init) => new Promise((_resolve, reject) => { init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }) }));
  assert.equal(response.status, 504); assert.equal((await response.json()).error.code, 'REQUEST_TIMEOUT');
});

test('local server serves the real UI and API but never serves keys, prompts, server code or dotfiles', async t => {
  const server = await startLocal({ port: 0, sharedKey, prompts, fetch: async () => success('Generated synthetic note') });
  t.after(() => new Promise(resolveClose => { server.closeAllConnections(); server.close(resolveClose); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(origin); assert.equal(page.status, 200); assert.ok((await page.text()).includes('ORNGLOCK')); assert.ok(page.headers.get('content-security-policy'));
  for (const path of ['/master%20prompt/01_MASTER_PROMPT_WRITE_ADMISSION_NOTE.txt', '/server/local.mjs', '/.git/config', '/.env', '/wrangler.toml']) assert.equal((await fetch(origin + path)).status, 404);
  const status = await fetch(origin + '/api/status'); const body = await status.json(); assert.equal(body.sharedAvailable, true); assert.equal(body.actions.length, 4); assert.ok(!JSON.stringify(body).includes(sharedKey)); assert.ok(!JSON.stringify(body).includes('Private instructions'));
  const response = await fetch(origin + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'support', notes }) }); assert.equal(response.status, 200); assert.equal((await response.json()).text, 'Generated synthetic note');
});
