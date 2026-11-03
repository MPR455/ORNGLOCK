import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const compare = (a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true });
const publicPath = path => path.split('/').map(encodeURIComponent).join('/');

export async function manualsCatalog(root, { requireConverted = false } = {}) {
  const source = resolve(root, '工作手冊');
  const folders = [], missing = [];
  async function entries(path) {
    try { return (await readdir(path, { withFileTypes: true })).filter(entry => !entry.name.startsWith('.')).sort(compare); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function collect(directory, folderRoot) {
    const documents = [], list = await entries(directory);
    const names = new Set(list.filter(entry => entry.isFile()).map(entry => entry.name.toLowerCase()));
    for (const entry of list) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) documents.push(...await collect(path, folderRoot));
      else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
        const info = await stat(path);
        const id = relative(root, path).split(sep).join('/');
        documents.push({ id, name: relative(folderRoot, path).split(sep).join(' / ').replace(/\.pdf$/i, ''), file: publicPath(id), bytes: info.size, revision: `${info.size.toString(36)}-${Math.trunc(info.mtimeMs).toString(36)}` });
      } else if (requireConverted && entry.isFile() && /\.docx?$/i.test(entry.name) && !names.has(entry.name.replace(/\.docx?$/i, '.pdf').toLowerCase())) {
        missing.push(relative(root, path));
      }
    }
    return documents;
  }
  for (const entry of await entries(source)) {
    if (!entry.isDirectory()) continue;
    const path = resolve(source, entry.name);
    folders.push({ id: entry.name, name: entry.name, documents: await collect(path, path) });
  }
  // Root-level PDFs remain accessible without flattening department folders.
  const rootEntries = (await entries(source)).filter(entry => entry.isFile());
  if (rootEntries.some(entry => /\.pdf$/i.test(entry.name))) {
    const documents = [];
    for (const entry of rootEntries.filter(entry => /\.pdf$/i.test(entry.name))) {
      const path = resolve(source, entry.name), info = await stat(path);
      const id = relative(root, path).split(sep).join('/');
      documents.push({ id, name: entry.name.replace(/\.pdf$/i, ''), file: publicPath(id), bytes: info.size, revision: `${info.size.toString(36)}-${Math.trunc(info.mtimeMs).toString(36)}` });
    }
    folders.push({ id: '.', name: '工作手冊', documents });
  }
  if (requireConverted) for (const entry of rootEntries) {
    if (/\.docx?$/i.test(entry.name) && !rootEntries.some(pdf => pdf.name.toLowerCase() === entry.name.replace(/\.docx?$/i, '.pdf').toLowerCase())) missing.push(entry.name);
  }
  if (missing.length) throw new Error(`Convert Word manuals to PDF first (scripts/convert-manuals.ps1):\n${missing.join('\n')}`);
  return { version: 1, folders };
}

export async function manualsAssets(root) {
  const { files } = JSON.parse(await readFile(resolve(root, 'vendor/manuals/files.json'), 'utf8'));
  for (const file of files) if (!file || file.startsWith('/') || file.split('/').some(part => part === '..' || part === '.') || file.includes('\\')) throw new Error('Invalid PDF.js asset path');
  return ['vendor/manuals/files.json', ...files.map(file => `vendor/manuals/${file}`)];
}
