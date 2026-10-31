// Bundles chapters/*.json and home.json into justdoit-data.mjs, the module the 值班 tab imports.
// Run after editing a chapter or the home layout: node "clinical database/JustDoIt/build-data.mjs"
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = new URL('./', import.meta.url);
const TYPES = new Set(['m', 'l', 'x', 'p']);

// One source catalog supplies the ICU browser and related chapters. Stable IDs
// let the UI deduplicate a line selected through any of those locations.
export async function loadIcuLines() {
  return JSON.parse(await readFile(new URL('icu-lines.json', here), 'utf8'));
}

function addIcuLines(chapters, catalog) {
  const ids = new Set();
  const items = catalog.groups.map(group => {
    if (!group.name || !group.en || !group.lines?.length || !group.chapters?.length) throw new Error('icu-lines.json: incomplete group');
    const orders = group.lines.map(line => {
      if (!line.id || ids.has(line.id) || !line.text || !line.details?.length || !line.sources?.length) throw new Error(`icu-lines.json: invalid line ${line.id}`);
      ids.add(line.id);
      for (const key of line.sources) {
        if (!catalog.sources[key]) throw new Error(`icu-lines.json: unknown source ${key}`);
      }
      return ['m', line.text, ['ICU Line', ...line.details].join('｜'), line.reviewOnly ? '專科確認・僅供查閱' : 'ICU・依情況選用'];
    });
    const item = {
      name: `ICU Lines：${group.name}`, en: `ICU Lines, ${group.en}`,
      icuLines: true, orderIds: group.lines.map(line => line.id),
      reviewOnlyIds: group.lines.filter(line => line.reviewOnly).map(line => line.id), orders
    };
    for (const slug of group.chapters) {
      const chapter = chapters.find(entry => entry.slug === slug);
      if (!chapter) throw new Error(`icu-lines.json: unknown chapter ${slug}`);
      chapter.items.push(item);
    }
    return item;
  });
  chapters.push({
    no: String(chapters.length + 1).padStart(2, '0'), slug: 'icu-lines',
    title: 'ICU Lines', en: 'ICU continuous infusions', icon: '💉',
    items: [{
      name: 'ICU Lines：全部', en: 'All ICU Lines, continuous infusions',
      icuLines: true, orderIds: items.flatMap(item => item.orderIds),
      reviewOnlyIds: items.flatMap(item => item.reviewOnlyIds), orders: items.flatMap(item => item.orders)
    }, ...items]
  });
  return chapters;
}

export async function loadChapters() {
  const names = (await readdir(new URL('chapters/', here))).filter(name => name.endsWith('.json')).sort();
  const chapters = [];
  for (const name of names) {
    const chapter = JSON.parse(await readFile(new URL(`chapters/${name}`, here), 'utf8'));
    const where = `chapters/${name}`;
    for (const key of ['no', 'slug', 'title', 'icon']) if (typeof chapter[key] !== 'string' || !chapter[key]) throw new Error(`${where}: missing ${key}`);
    if (!Array.isArray(chapter.items) || !chapter.items.length) throw new Error(`${where}: no items`);
    for (const item of chapter.items) {
      if (!item.name || !Array.isArray(item.orders) || !item.orders.length) throw new Error(`${where}: item "${item.name}" has no orders`);
      for (const order of item.orders) {
        if (!Array.isArray(order) || order.length < 2 || order.length > 4 || !TYPES.has(order[0]) || !order[1]) throw new Error(`${where}: bad order in "${item.name}": ${JSON.stringify(order)}`);
      }
    }
    chapters.push(chapter);
  }
  return addIcuLines(chapters, await loadIcuLines());
}

// Resolves home.json's slugs and condition names to indices; every chapter must appear in exactly one section.
export async function loadHome(chapters) {
  const home = JSON.parse(await readFile(new URL('home.json', here), 'utf8'));
  const chapterIndex = slug => {
    const index = chapters.findIndex(chapter => chapter.slug === slug);
    if (index < 0) throw new Error(`home.json: unknown chapter "${slug}"`);
    return index;
  };
  const urgent = home.urgent.map(tile => {
    const chapter = chapterIndex(tile.chapter);
    const item = chapters[chapter].items.findIndex(entry => entry.name === tile.item);
    if (item < 0) throw new Error(`home.json: "${tile.item}" not found in ${tile.chapter}`);
    return { label: tile.label, icon: tile.icon, chapter, item };
  });
  const placed = new Set();
  const sections = home.sections.map(section => ({
    title: section.title,
    tiles: section.tiles.map(tile => {
      const chapter = chapterIndex(tile.chapter);
      if (placed.has(chapter)) throw new Error(`home.json: ${tile.chapter} is listed twice`);
      placed.add(chapter);
      return { label: tile.label, icon: tile.icon || chapters[chapter].icon, chapter };
    })
  }));
  const missing = chapters.filter((chapter, index) => !placed.has(index)).map(chapter => chapter.slug);
  if (missing.length) throw new Error(`home.json: chapters missing from sections: ${missing.join(', ')}`);
  return { urgent, sections };
}

export function renderModule(chapters, home) {
  return '// Generated by build-data.mjs from chapters/*.json and home.json. Edit those files, not this one.\n'
    + `export const ONCALL_MENU = ${JSON.stringify(chapters)};\n`
    + `export const ONCALL_HOME = ${JSON.stringify(home)};\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const chapters = await loadChapters();
  const home = await loadHome(chapters);
  await writeFile(new URL('justdoit-data.mjs', here), renderModule(chapters, home));
  const items = chapters.reduce((sum, chapter) => sum + chapter.items.length, 0);
  console.log(`Wrote justdoit-data.mjs: ${chapters.length} chapters, ${items} conditions.`);
}
