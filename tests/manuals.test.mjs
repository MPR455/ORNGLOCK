import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { manualsCatalog } from '../scripts/manuals-catalog.mjs';
import { byteRange } from '../server/manuals-files.mjs';

test('manual discovery preserves departments and nested names, encodes URLs, and excludes Word originals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ornglock-manuals-'));
  try {
    await mkdir(join(root, '工作手冊', '兒科', '新生兒'), { recursive: true });
    await mkdir(join(root, '工作手冊', 'Empty'), { recursive: true });
    await writeFile(join(root, '工作手冊', '兒科', '新生兒', 'BR #1 & 2.pdf'), '%PDF-1.7');
    await writeFile(join(root, '工作手冊', '兒科', '指南.docx'), 'original');
    await writeFile(join(root, '工作手冊', '兒科', '.hidden.pdf'), 'hidden');
    const catalog = await manualsCatalog(root);
    assert.equal(catalog.folders.length, 2);
    assert.deepEqual(catalog.folders.find(folder => folder.id === 'Empty').documents, []);
    const [file] = catalog.folders.find(folder => folder.id === '兒科').documents;
    assert.equal(file.name, '新生兒 / BR #1 & 2');
    assert.equal(decodeURIComponent(file.file), file.id);
    assert.ok(file.file.includes('%231%20%26%202.pdf'));
    assert.equal(file.bytes, 8);
    await assert.rejects(manualsCatalog(root, { requireConverted: true }), /指南\.docx/);
    await writeFile(join(root, '工作手冊', '兒科', '指南.pdf'), '%PDF-1.7');
    assert.equal((await manualsCatalog(root, { requireConverted: true })).folders.flatMap(folder => folder.documents).length, 2);
  } finally {
    // This path is the exact directory returned by mkdtemp, within the OS temp directory.
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + '\\') || resolve(root).startsWith(resolve(tmpdir()) + '/'));
    await rm(root, { recursive: true, force: true });
  }
});

test('PDF byte ranges support normal, open-ended, and suffix reads and reject invalid requests', () => {
  assert.equal(byteRange(undefined, 100), null);
  assert.deepEqual(byteRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(byteRange('bytes=75-', 100), { start: 75, end: 99 });
  assert.deepEqual(byteRange('bytes=-20', 100), { start: 80, end: 99 });
  assert.deepEqual(byteRange('bytes=90-999', 100), { start: 90, end: 99 });
  for (const header of ['bytes=100-', 'bytes=10-5', 'bytes=-0', 'bytes=0-2,5-9', 'invalid', 'bytes=-']) assert.equal(byteRange(header, 100), false);
});
