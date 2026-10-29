import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import { studyCatalog } from '../scripts/study-catalog.mjs';
import { renderTemplate, cloze, cardOrder, readApkg } from '../study-core.mjs';
import { startLocal } from '../server/local.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function vendor(name) {
  const filename = resolve(root, 'vendor/study', name), module = { exports: {} };
  runInThisContext(`(function(module, exports, require, __filename, __dirname) {\n${await readFile(filename, 'utf8')}\n})`, { filename })(module, module.exports, createRequire(import.meta.url), filename, dirname(filename));
  return module.exports;
}

test('Anki templates handle cloze, nested conditions, special fields, and audio', () => {
  assert.equal(cloze('{{c1::retina::tissue}} / {{c2::cornea}}', 1, false), '<span class="cloze">[tissue]</span> / cornea');
  assert.equal(cloze('{{c1::retina}} / {{c2::cornea}}', 2, true), 'retina / <span class="cloze">cornea</span>');
  const fields = { Question: 'Question', Answer: '<b>Answer</b>', Optional: '', Audio: '[sound:a"b.mp3]' };
  assert.equal(renderTemplate('{{#Question}}Q: {{Question}}{{#Answer}} {{text:Answer}}{{/Answer}}{{/Question}}{{^Optional}}!{{/Optional}}', fields), 'Q: Question Answer!');
  assert.equal(renderTemplate('{{FrontSide}}<hr>{{Answer}}', fields, 'Front'), 'Front<hr><b>Answer</b>');
  assert.ok(renderTemplate('{{Audio}}', fields).includes('data-file="a&quot;b.mp3"'));
});

test('category filters include child decks, search is normalized, and shuffle preserves every card', () => {
  const cards = [{ deck: 'IM::Heart', front: 'ＡＢＣ', back: 'answer' }, { deck: 'IM::Heart::Valves', front: 'valve', back: 'regurgitation' }, { deck: 'ER', front: 'trauma', back: 'fracture' }];
  assert.deepEqual(cardOrder(cards, { category: 'IM::Heart' }), [0, 1]);
  assert.deepEqual(cardOrder(cards, { query: 'abc' }), [0]);
  assert.deepEqual(cardOrder(cards, { query: 'regurgitation' }), [1]);
  assert.deepEqual(cardOrder(cards, { query: 'missing' }), []);
  assert.deepEqual(cardOrder(cards, { shuffle: true, random: () => 0 }).sort(), [0, 1, 2]);
});

test('catalog discovers new, renamed, nested, removed, and Unicode decks without manual registration', async t => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'ornglock-study-'));
  // mkdtemp gives an exact owned path; deletion stays inside this named temporary directory.
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(resolve(temporary, 'decks', 'Book # 中', 'Sub'), { recursive: true });
  await writeFile(resolve(temporary, 'decks', 'Book # 中', 'Sub', '10 & one.apkg'), 'one');
  await writeFile(resolve(temporary, 'decks', 'Book # 中', '2.apkg'), 'two');
  await writeFile(resolve(temporary, 'decks', 'Book # 中', 'ignore.txt'), 'private');
  const catalog = await studyCatalog(temporary);
  assert.equal(catalog.books[0].name, 'Book # 中');
  assert.deepEqual(catalog.books[0].decks.map(deck => deck.name), ['2', 'Sub / 10 & one']);
  assert.equal(catalog.books[0].decks[1].file, 'decks/Book%20%23%20%E4%B8%AD/Sub/10%20%26%20one.apkg');
  await rename(resolve(temporary, 'decks', 'Book # 中'), resolve(temporary, 'decks', 'New book'));
  assert.equal((await studyCatalog(temporary)).books[0].name, 'New book');
  await rm(resolve(temporary, 'decks', 'New book', '2.apkg'));
  assert.equal((await studyCatalog(temporary)).books[0].decks.length, 1);
  assert.deepEqual((await studyCatalog(resolve(temporary, 'missing'))).books, []);
});

test('reader opens actual APKGs with templates, categories, and referenced media intact', async t => {
  const JSZip = await vendor('jszip.min.js');
  const SQL = await (await vendor('sql-wasm.js'))({ locateFile: name => resolve(root, 'vendor/study', name) });
  const catalog = await studyCatalog(root);
  for (const deck of catalog.books.flatMap(book => book.decks)) {
    await t.test(deck.name, async () => {
      const result = await readApkg(await readFile(resolve(root, deck.id)), JSZip, SQL);
      assert.ok(result.cards.length > 0);
      assert.ok(result.categories.length > 0);
      assert.ok(result.cards.every(card => card.front.trim() && card.back.trim()));
      assert.ok(result.cards.every(card => !/\{\{(?:Question|Answer|FrontSide)\}\}/.test(card.front + card.back)));
      for (const entry of result.media.values()) assert.ok(result.zip.file(entry), `Missing media entry ${entry}`);
    });
  }
  const modern = new JSZip(); modern.file('collection.anki21b', 'new format');
  await assert.rejects(readApkg(await modern.generateAsync({ type: 'uint8array' }), JSZip, SQL), /Support older Anki/);
  await assert.rejects(readApkg(new Uint8Array([1, 2, 3]), JSZip, SQL));
});

test('local server exposes only cataloged decks and self-hosted reader assets', async t => {
  const server = await startLocal({ port: 0, prompts: {} });
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${origin}/decks/catalog.json`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  for (const book of catalog.books) {
    const response = await fetch(`${origin}/${book.decks[0].file}`, { method: 'HEAD' });
    assert.equal(response.status, 200);
  }
  for (const file of ['study.mjs', 'study-frame.mjs', 'study-core.mjs', 'study-images.mjs', 'study.css', 'vendor/study/jszip.min.js', 'vendor/study/sql-wasm.js', 'vendor/study/sql-wasm.wasm']) assert.equal((await fetch(`${origin}/${file}`)).status, 200);
  assert.equal((await fetch(`${origin}/vendor/study/sql-wasm.wasm`)).headers.get('content-type'), 'application/wasm');
  for (const file of ['decks/README.md', 'decks/.secret.apkg', 'decks/%2e%2e/server/local.mjs', 'scripts/study-catalog.mjs', 'server/local.mjs']) assert.equal((await fetch(`${origin}/${file}`)).status, 404);
});
