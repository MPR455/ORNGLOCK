import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const files = ['index.html', 'styles.css', 'app.js', 'assets/ornglock.png', 'assets/ornglock-symbol.png'];
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
await writeFile(resolve(dist, '.nojekyll'), '');
// Public output is deliberately allowlisted: master prompts and backend source stay private.
for (const file of [...files.filter(file => !file.endsWith('.png')), 'config.js']) {
  const contents = await readFile(resolve(dist, file), 'utf8');
  if (/MASTER PROMPT:|AQ\.[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{25,}/.test(contents)) throw new Error(`Private material found in public output: ${file}`);
}
console.log('Built GitHub Pages files in dist/. Private prompts and keys are excluded.');
