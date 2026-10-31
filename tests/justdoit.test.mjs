import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadChapters, loadHome, loadIcuLines, renderModule } from '../clinical database/JustDoIt/build-data.mjs';
import { loadFormulary, checkFormulary } from '../clinical database/JustDoIt/formulary-check.mjs';

test('every chapter file and the home layout are valid, and the bundled module is up to date', async () => {
  const chapters = await loadChapters();
  assert.equal(chapters.length, 40);
  const bundled = await readFile(new URL('../clinical database/JustDoIt/justdoit-data.mjs', import.meta.url), 'utf8');
  assert.equal(bundled.replace(/\r\n/g, '\n'), renderModule(chapters, await loadHome(chapters)), 'Run: node "clinical database/JustDoIt/build-data.mjs"');
});

test('chapter numbers and slugs are unique and match their file order', async () => {
  const chapters = await loadChapters();
  chapters.forEach((chapter, index) => assert.equal(chapter.no, String(index + 1).padStart(2, '0')));
  assert.equal(new Set(chapters.map(chapter => chapter.slug)).size, chapters.length);
});

test('orders only name formulary drugs, and every formulary drug is used', async () => {
  const { unknown, unused } = checkFormulary(await loadChapters(), await loadFormulary());
  assert.deepEqual(unknown, [], 'Not in formulary.json (add it there or change the order)');
  assert.deepEqual(unused, [], 'In formulary.json but no order uses it');
});

test('every ☎ extension in a reason is one the phone links understand', async () => {
  const bad = [];
  for (const chapter of await loadChapters()) for (const item of chapter.items) for (const order of item.orders) {
    for (const match of (order[2] || '').matchAll(/☎\S*/g)) {
      if (!/^☎\d{4}(\/\d{4})*(#\d{3}(\/\d{3})*)?/.test(match[0])) bad.push(`${chapter.slug} / ${item.name}: ${match[0]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every chapter and condition has an English name for search', async () => {
  const missing = [];
  for (const chapter of await loadChapters()) {
    if (!chapter.en) missing.push(chapter.slug);
    for (const item of chapter.items) if (!item.en) missing.push(`${chapter.slug} / ${item.name}`);
  }
  assert.deepEqual(missing, []);
});

test('every ICU line appears unchanged in the overview and its related categories with the same selection ID', async () => {
  const chapters = await loadChapters(), catalog = await loadIcuLines();
  const icu = chapters.find(chapter => chapter.slug === 'icu-lines');
  const all = icu.items[0];
  const ids = catalog.groups.flatMap(group => group.lines.map(line => line.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(all.orderIds, ids);
  for (const group of catalog.groups) {
    const item = icu.items.find(item => item.name === `ICU Lines：${group.name}`);
    assert.ok(item);
    for (const slug of group.chapters) assert.deepEqual(chapters.find(chapter => chapter.slug === slug).items.find(entry => entry.name === item.name), item);
    item.orderIds.forEach((id, index) => {
      assert.deepEqual(all.orders[all.orderIds.indexOf(id)], item.orders[index]);
      assert.match(item.orders[index][2], /^ICU Line｜/);
      assert.doesNotMatch(item.orders[index][2], /來源|2017|2024|https?:|配製保留來源/);
      assert.ok(item.orders[index][3], 'ICU alternatives must never join the basic order bundle');
    });
  }
});

test('legacy review-only lines retain their status in every browsing location', async () => {
  for (const chapter of await loadChapters()) for (const item of chapter.items.filter(item => item.icuLines)) {
    assert.equal(item.orderIds.length, item.orders.length);
    for (const id of item.reviewOnlyIds) {
      assert.match(item.orders[item.orderIds.indexOf(id)][3], /僅供查閱/);
    }
  }
});
