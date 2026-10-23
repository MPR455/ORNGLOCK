import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'directory.css', 'app.js', 'sections.mjs', 'directory.mjs', 'directory-data.mjs', 'assets/ornglock.png', 'assets/ornglock-symbol.png', 'assets/cgmh-oph.svg', 'assets/cgmh-em.svg'];
files.push('assets/faq-first-time.png', 'assets/faq-logo.png', 'assets/faq-vpn.png', 'assets/faq-google-api.png', 'assets/faq-shortcut.png', 'assets/faq-mobile-shortcut.png');
files.push('PE example/Admission normal PE.txt', 'PE example/Admission ROS.txt', 'PE example/Progress normal PE.txt');
files.push('handoff.css', 'handoff-model.mjs', 'handoff-import.mjs', 'handoff-editor.mjs', 'handoff.mjs');
files.push('oncall.css', 'oncall.mjs', 'clinical database/JustDoIt/justdoit-data.mjs');
for (const file of files) {
  const target = resolve(dist, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
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
for (const [file, dependencies] of [['directory.mjs', ['directory-data.mjs']], ['handoff-import.mjs', ['handoff-model.mjs']], ['handoff-editor.mjs', ['handoff-model.mjs']], ['handoff.mjs', ['handoff-model.mjs', 'handoff-import.mjs', 'handoff-editor.mjs']], ['oncall.mjs', ['clinical database/JustDoIt/justdoit-data.mjs']], ['app.js', ['sections.mjs', 'directory.mjs', 'handoff.mjs', 'oncall.mjs']]]) {
  const path = resolve(dist, file);
  let contents = await readFile(path, 'utf8');
  for (const dependency of dependencies) contents = contents.replace(`'./${dependency}'`, `'./${dependency}?v=${await revision(dependency)}'`);
  await writeFile(path, contents);
}
const indexPath = resolve(dist, 'index.html');
let html = await readFile(indexPath, 'utf8');
for (const file of ['styles.css', 'directory.css', 'handoff.css', 'oncall.css', 'config.js', 'app.js']) html = html.replace(`"${file}"`, `"${file}?v=${await revision(file)}"`);
await writeFile(indexPath, html);
await writeFile(resolve(dist, '.nojekyll'), '');
// Public output is deliberately allowlisted: master prompts and backend source stay private.
for (const file of [...files.filter(file => !file.endsWith('.png')), 'config.js']) {
  const contents = await readFile(resolve(dist, file), 'utf8');
  if (/MASTER PROMPT:|AQ\.[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{25,}/.test(contents)) throw new Error(`Private material found in public output: ${file}`);
}
console.log('Built GitHub Pages files in dist/. Private prompts and keys are excluded.');
