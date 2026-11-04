import { mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { studyCatalog } from './study-catalog.mjs';
import { manualsCatalog, manualsAssets } from './manuals-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'directory.css', 'app.js', 'sections.mjs', 'directory.mjs', 'directory-data.mjs', 'assets/ornglock.png', 'assets/ornglock-symbol.png', 'assets/cgmh-oph.svg', 'assets/cgmh-em.svg'];
files.push('forum-button.css', 'forum-button.mjs');
files.push('webapp.js', 'manifest.webmanifest', 'forum/index.html', 'forum/manifest.webmanifest', ...['ornglock', 'forum'].flatMap(name => [180, 192, 512].map(size => `assets/icons/${name}-${size}.png`)));
files.push('assets/faq-first-time.webp', 'assets/faq-logo.webp', 'assets/faq-vpn.webp', 'assets/faq-google-api.webp', 'assets/faq-shortcut.webp', 'assets/faq-mobile-shortcut.webp', 'assets/Printsetting.webp');
files.push('PE example/Admission normal PE.txt', 'PE example/Admission ROS.txt', 'PE example/Progress normal PE.txt');
files.push('handoff.css', 'handoff-model.mjs', 'handoff-import.mjs', 'handoff-editor.mjs', 'handoff.mjs');
files.push('oncall.css', 'oncall.mjs', 'clinical database/JustDoIt/justdoit-data.mjs');
files.push('ddx.css', 'ddx.mjs', 'clinical database/DDx/ddx-data.mjs');
files.push('study.css', 'study.mjs', 'study-core.mjs', 'study-frame.mjs', 'study-images.mjs');
files.push('manuals.css', 'manuals.mjs', ...await manualsAssets(root));
files.push(...['jszip.min.js', 'sql-wasm.js', 'sql-wasm.wasm', 'JSZip-LICENSE.md', 'sql.js-LICENSE.txt'].map(file => `vendor/study/${file}`));
for (const file of files) {
  const target = resolve(dist, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
const catalog = await studyCatalog(root);
const publicDecks = resolve(dist, 'decks');
// Only remove this build's generated decks directory, so removed decks disappear too.
if (dirname(publicDecks) !== dist) throw new Error('Invalid public decks directory');
await rm(publicDecks, { recursive: true, force: true });
await mkdir(publicDecks, { recursive: true });
for (const deck of catalog.books.flatMap(book => book.decks)) {
  const target = resolve(dist, deck.id);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, deck.id), target);
}
await writeFile(resolve(publicDecks, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
const manuals = await manualsCatalog(root, { requireConverted: true });
const publicManuals = resolve(dist, '工作手冊');
if (dirname(publicManuals) !== dist) throw new Error('Invalid public manuals directory');
await rm(publicManuals, { recursive: true, force: true });
for (const file of manuals.folders.flatMap(folder => folder.documents)) {
  const target = resolve(dist, file.id);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file.id), target);
}
await mkdir(resolve(dist, 'manuals'), { recursive: true });
await writeFile(resolve(dist, 'manuals/catalog.json'), JSON.stringify(manuals, null, 2) + '\n');
let apiBase = process.env.ORNGLOCK_API_BASE || '';
if (apiBase) {
  const url = new URL(apiBase);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('ORNGLOCK_API_BASE must be an HTTPS origin, e.g. https://ornglock-api.example.workers.dev');
  apiBase = url.origin;
}
if (apiBase) await writeFile(resolve(dist, 'config.js'), `window.ORNGLOCK_CONFIG = Object.freeze(${JSON.stringify({ apiBase })});\n`);
else await copyFile(resolve(root, 'config.js'), resolve(dist, 'config.js'));
const revision = async file => createHash('sha256').update(await readFile(resolve(dist, file))).digest('hex').slice(0, 12);
// Version imported modules before their entry point, so browser caches follow each release.
for (const [file, dependencies] of [['directory.mjs', ['directory-data.mjs']], ['handoff-import.mjs', ['handoff-model.mjs']], ['handoff-editor.mjs', ['handoff-model.mjs']], ['handoff.mjs', ['handoff-model.mjs', 'handoff-import.mjs', 'handoff-editor.mjs']], ['oncall.mjs', ['clinical database/JustDoIt/justdoit-data.mjs']], ['ddx.mjs', ['clinical database/DDx/ddx-data.mjs', 'clinical database/JustDoIt/justdoit-data.mjs']],['study-frame.mjs', ['study-core.mjs']], ['study.mjs', ['study-core.mjs', 'study-frame.mjs', 'study-images.mjs']], ['app.js', ['sections.mjs', 'directory.mjs', 'handoff.mjs', 'oncall.mjs', 'ddx.mjs', 'study.mjs', 'manuals.mjs']]]) {
  const path = resolve(dist, file);
  let contents = await readFile(path, 'utf8');
  for (const dependency of dependencies) contents = contents.replace(`'./${dependency}'`, `'./${dependency}?v=${await revision(dependency)}'`);
  await writeFile(path, contents);
}
const indexPath = resolve(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');
for (const file of ['styles.css', 'directory.css', 'handoff.css', 'oncall.css', 'ddx.css', 'study.css', 'manuals.css', 'forum-button.css', 'forum-button.mjs', 'config.js', 'webapp.js', 'app.js']) html = html.replace(`"${file}"`, `"${file}?v=${await revision(file)}"`);
await writeFile(indexPath, html);
const forumPath = resolve(dist, 'forum/index.html');
await writeFile(forumPath, (await readFile(forumPath, 'utf8')).replace('"../webapp.js"', `"../webapp.js?v=${await revision('webapp.js')}"`));
await writeFile(resolve(dist, '.nojekyll'), '');
// Public output is deliberately allowlisted: master prompts and backend source stay private.
for (const file of [...files.filter(file => !/\.(png|webp|gif|wasm|bcmap|ttf|pfb|icc)$/.test(file)), 'config.js']) {
  const contents = await readFile(resolve(dist, file), 'utf8');
  if (/MASTER PROMPT:|AQ\.[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{25,}/.test(contents)) throw new Error(`Private material found in public output: ${file}`);
}
console.log('Built GitHub Pages files in dist/. Private prompts and keys are excluded.');
