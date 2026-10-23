import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadChapters, loadHome, renderModule } from '../clinical database/JustDoIt/build-data.mjs';

test('every chapter file and the home layout are valid, and the bundled module is up to date', async () => {
  const chapters = await loadChapters();
  assert.equal(chapters.length, 34);
  const bundled = await readFile(new URL('../clinical database/JustDoIt/justdoit-data.mjs', import.meta.url), 'utf8');
  assert.equal(bundled.replace(/\r\n/g, '\n'), renderModule(chapters, await loadHome(chapters)), 'Run: node "clinical database/JustDoIt/build-data.mjs"');
});

test('chapter numbers and slugs are unique and match their file order', async () => {
  const chapters = await loadChapters();
  chapters.forEach((chapter, index) => assert.equal(chapter.no, String(index + 1).padStart(2, '0')));
  assert.equal(new Set(chapters.map(chapter => chapter.slug)).size, chapters.length);
});
