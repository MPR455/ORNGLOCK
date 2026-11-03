import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';

// PDF.js can request a few chunks of a large manual instead of the whole file.
export function byteRange(header, size) {
  if (header === undefined) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return false;
  return { start, end };
}

export async function serveManual(incoming, outgoing, path) {
  const { size } = await stat(path);
  const range = byteRange(incoming.headers.range, size);
  outgoing.setHeader('Accept-Ranges', 'bytes');
  outgoing.setHeader('Content-Type', 'application/pdf');
  if (range === false) { outgoing.writeHead(416, { 'Content-Range': `bytes */${size}` }); outgoing.end(); return; }
  const start = range?.start ?? 0, end = range?.end ?? size - 1;
  outgoing.setHeader('Content-Length', end - start + 1);
  if (range) outgoing.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  outgoing.writeHead(range ? 206 : 200);
  if (incoming.method === 'HEAD') { outgoing.end(); return; }
  try { await pipeline(createReadStream(path, { start, end }), outgoing); }
  catch (error) { if (!incoming.destroyed && !outgoing.destroyed) throw error; }
}
