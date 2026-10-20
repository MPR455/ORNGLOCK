import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { ACTIONS, HANDOFF_ACTIONS, DEFAULT_MODEL, MAX_BODY_BYTES } from './actions.mjs';
import { createMemoryGuard, handleApi, positiveInteger } from './api.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STATIC = new Map([
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/styles.css', 'styles.css'], ['/app.js', 'app.js'], ['/sections.mjs', 'sections.mjs'], ['/config.js', 'config.js'],
  ['/directory.css', 'directory.css'], ['/directory.mjs', 'directory.mjs'], ['/directory-data.mjs', 'directory-data.mjs'],
  ...['handoff.css', 'handoff.mjs', 'handoff-model.mjs', 'handoff-import.mjs', 'handoff-editor.mjs'].map(file => [`/${file}`, file]),
  ['/assets/ornglock.png', 'assets/ornglock.png'], ['/assets/ornglock-symbol.png', 'assets/ornglock-symbol.png'],
  ['/assets/cgmh-oph.svg', 'assets/cgmh-oph.svg'], ['/assets/cgmh-em.svg', 'assets/cgmh-em.svg'],
  ...['assets/faq-first-time.png', 'assets/faq-logo.png', 'assets/faq-vpn.png', 'assets/faq-google-api.png', 'assets/faq-shortcut.png', 'assets/faq-mobile-shortcut.png'].map(file => [`/${file}`, file]),
  ...['PE example/Admission normal PE.txt', 'PE example/Admission ROS.txt', 'PE example/Progress normal PE.txt'].map(file => [`/${encodeURI(file)}`, file])
]);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

export async function startLocal({ port = 8787, host = '127.0.0.1', sharedKey = '', handoffSharedKey = '', model = DEFAULT_MODEL, allowedOrigins = [], guard, fetch: providerFetch, prompts: configuredPrompts } = {}) {
  const prompts = configuredPrompts || Object.fromEntries(await Promise.all([...ACTIONS, ...HANDOFF_ACTIONS].map(async action => {
    try { return [action.id, await readFile(resolve(ROOT, 'master prompt', action.file), 'utf8')]; }
    catch (error) { if (error.code === 'ENOENT' && HANDOFF_ACTIONS.includes(action)) return [action.id, '']; throw error; }
  })));
  const requestGuard = guard || createMemoryGuard({ perMinute: positiveInteger(process.env.REQUESTS_PER_MINUTE, 6), daily: positiveInteger(process.env.SHARED_DAILY_LIMIT, 100) });
  const server = http.createServer(async (incoming, outgoing) => {
    outgoing.setHeader('X-Content-Type-Options', 'nosniff');
    outgoing.setHeader('Referrer-Policy', 'no-referrer');
    outgoing.setHeader('Cache-Control', 'no-store');
    const address = server.address();
    const base = `http://${host}:${address.port}`;
    const url = new URL(incoming.url || '/', base);
    try {
      if (url.pathname.startsWith('/api/')) {
        const abortController = new AbortController();
        outgoing.on('close', () => { if (!outgoing.writableEnded) abortController.abort(); });
        const chunks = [];
        let bytes = 0;
        for await (const chunk of incoming) {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            outgoing.writeHead(413, { 'Content-Type': 'application/json' });
            outgoing.end(JSON.stringify({ error: { code: 'INPUT_TOO_LARGE', message: 'The supplied notes are too large.' } }));
            return;
          }
          chunks.push(chunk);
        }
        const method = incoming.method || 'GET';
        const request = new Request(url, { method, headers: incoming.headers, signal: abortController.signal, ...(!['GET', 'HEAD'].includes(method) ? { body: Buffer.concat(chunks) } : {}) });
        const response = await handleApi(request, { prompts, sharedKey, handoffSharedKey, model, allowedOrigins, guard: requestGuard, ip: incoming.socket.remoteAddress || 'local', fetch: providerFetch });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      if (!['GET', 'HEAD'].includes(incoming.method)) { outgoing.writeHead(405); outgoing.end('Method not allowed'); return; }
      const filename = STATIC.get(url.pathname);
      if (!filename) { outgoing.writeHead(404); outgoing.end('Not found'); return; }
      const data = await readFile(resolve(ROOT, filename));
      outgoing.writeHead(200, { 'Content-Type': MIME[extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
      outgoing.end(incoming.method === 'HEAD' ? undefined : data);
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'The service could not complete the request.' } }));
    }
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, host, resolveListen); });
  return server;
}

async function readSecretFromStdin() {
  // This optional startup path avoids putting credentials in command arguments or files.
  return new Promise((resolveKey, reject) => {
    let input = '';
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    const onData = chunk => {
      input += chunk.toString();
      if (input.length > 4096) { cleanup(); reject(new Error('Invalid startup input.')); return; }
      const newline = input.search(/[\r\n]/);
      if (newline < 0) return;
      cleanup();
      try { const parsed = JSON.parse(input.slice(0, newline)); resolveKey({ apiKey: parsed.apiKey || '', handoffApiKey: parsed.handoffApiKey || '' }); }
      catch { reject(new Error('Invalid startup input.')); }
      input = '';
    };
    const cleanup = () => { process.stdin.off('data', onData); if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); };
    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let key = process.env.GEMINI_API_KEY || '';
  let handoffKey = process.env.HANDOFF_GEMINI_API_KEY || '';
  if (process.argv.includes('--key-stdin')) {
    process.stdout.write('Waiting for the Gemini key on stdin (the value will not be printed).\n');
    const secrets = await readSecretFromStdin();
    key = secrets.apiKey || key;
    handoffKey = secrets.handoffApiKey || handoffKey;
  }
  const port = positiveInteger(process.env.PORT, 8787);
  const server = await startLocal({ port, sharedKey: key, handoffSharedKey: handoffKey, model: process.env.GEMINI_MODEL || DEFAULT_MODEL, allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean) });
  process.stdout.write(`ORNGLOCK ready at http://127.0.0.1:${server.address().port}\nShared Gemini key: ${key ? 'configured' : 'not configured; personal keys can be used'}\nHandoff shared key: ${handoffKey ? 'configured' : 'not configured; personal keys can be used'}\n`);
}
