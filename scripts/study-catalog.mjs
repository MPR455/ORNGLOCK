import { readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

// The same discovery powers local refresh and the GitHub Pages build.
export async function studyCatalog(root) {
  const decksRoot = resolve(root, 'decks');
  const books = [];
  const compare = (a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true });
  async function entries(path) {
    try { return (await readdir(path, { withFileTypes: true })).filter(entry => !entry.name.startsWith('.')).sort(compare); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function collect(directory, bookRoot) {
    const decks = [];
    for (const entry of await entries(directory)) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) decks.push(...await collect(path, bookRoot));
      else if (entry.isFile() && /\.apkg$/i.test(entry.name)) {
        const info = await stat(path);
        const id = relative(root, path).split(sep).join('/');
        decks.push({ id, name: relative(bookRoot, path).split(sep).join(' / ').replace(/\.apkg$/i, ''), file: id.split('/').map(encodeURIComponent).join('/'), bytes: info.size, revision: `${info.size.toString(36)}-${Math.trunc(info.mtimeMs).toString(36)}` });
      }
    }
    return decks;
  }
  for (const entry of await entries(decksRoot)) {
    if (!entry.isDirectory()) continue;
    const decks = await collect(resolve(decksRoot, entry.name), resolve(decksRoot, entry.name));
    if (decks.length) books.push({ id: entry.name, name: entry.name, decks });
  }
  // Files directly in decks/ are also usable; folders remain the preferred grouping.
  const loose = [];
  for (const entry of await entries(decksRoot)) {
    if (!entry.isFile() || !/\.apkg$/i.test(entry.name)) continue;
    const info = await stat(resolve(decksRoot, entry.name));
    const id = `decks/${entry.name}`;
    loose.push({ id, name: entry.name.replace(/\.apkg$/i, ''), file: id.split('/').map(encodeURIComponent).join('/'), bytes: info.size, revision: `${info.size.toString(36)}-${Math.trunc(info.mtimeMs).toString(36)}` });
  }
  if (loose.length) books.push({ id: '.', name: 'Decks', decks: loose });
  return { version: 1, books };
}
