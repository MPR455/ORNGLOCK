import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadAll, renderModule } from '../clinical database/DDx/build-data.mjs';

test('differential diagnosis data is valid, every order link resolves, and the bundled module is up to date', async () => {
  const { regions, symptoms } = await loadAll();
  const bundled = await readFile(new URL('../clinical database/DDx/ddx-data.mjs', import.meta.url), 'utf8');
  assert.equal(bundled.replace(/\r\n/g, '\n'), renderModule(regions, symptoms), 'Run: node "clinical database/DDx/build-data.mjs"');
});

test('every region on the body figure has a symptom, and every symptom has a first step and English name', async () => {
  const { regions, symptoms } = await loadAll();
  for (const region of regions) assert.ok(symptoms.some(symptom => symptom.regions.includes(region.id)), region.id);
  for (const symptom of symptoms) {
    assert.ok(symptom.en && symptom.aliases?.length, `${symptom.id}: needs English name and search aliases`);
    assert.ok(symptom.first.pe?.length && symptom.first.flags?.length, `${symptom.id}: first step needs red flags and exam`);
  }
});

test('every diagnosis says what to examine or score, so its "?" popup is never empty', async () => {
  const { symptoms } = await loadAll();
  const empty = symptoms.flatMap(symptom => symptom.groups.flatMap(group => group.dx.filter(dx => !dx.pe?.length && !dx.scores?.length).map(dx => `${symptom.id} / ${dx.name}`)));
  assert.deepEqual(empty, []);
});

test('the figure in ddx.mjs only draws regions that exist in regions.json', async () => {
  const { regions } = await loadAll();
  const source = await readFile(new URL('../ddx.mjs', import.meta.url), 'utf8');
  const drawn = new Set([...source.matchAll(/\['([a-z]+)', '(?:ellipse|rect|path)'/g)].map(match => match[1]));
  const ids = new Set(regions.map(region => region.id));
  for (const id of drawn) assert.ok(ids.has(id), `figure draws unknown region ${id}`);
  // skin and systemic are chips beside the figure, not drawn zones.
  for (const id of ids) if (!['skin', 'systemic'].includes(id)) assert.ok(drawn.has(id), `region ${id} is not on the figure`);
});
