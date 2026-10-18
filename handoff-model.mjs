// Patient documents are plain text lines plus background marks; all offsets use UTF-16.
export const DIVIDER = '█'.repeat(44);
export const HEADINGS = ['[HX]:', '[CC]:', '[O]:', '[A]:', '[P]:', '[Medication]'];
export const uid = () => crypto.randomUUID();
const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' });
const colors = { '/': 'red', '%': 'yellow', '\\': 'green' };
const delimiters = { red: '/', yellow: '%', green: '\\' };
const entities = { '&#47;': '/', '&#37;': '%', '&#92;': '\\', '&#38;': '&', '&#123;': '{' };
const normalize = text => String(text ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
export const sameName = (a, b) => normalize(a) === normalize(b);
export const pending = text => /(?<!\{)\{pending\}(?!\})/.test(text);
export const important = text => /!(?!=)/.test(text);
export const sectionOf = text => {
  const match = /^\s*\[([^\]]+)\]\s*:?/.exec(text);
  if (!match) return null;
  const key = match[1].toLowerCase().trim();
  return ({ hx: 'HX', history: 'HX', cc: 'CC', o: 'O', objective: 'O', a: 'A', assessment: 'A', p: 'P', plan: 'P', medication: 'Medication' })[key] || (key.length > 2 ? 'other' : null);
};
export const bullet = text => /^\s*[-#](?:\s|$)/.test(text);

export function parsePortable(source) {
  const decoded = []; const literal = [];
  for (let i = 0; i < source.length;) {
    const entity = Object.keys(entities).find(key => source.startsWith(key, i));
    if (entity) { decoded.push(entities[entity]); literal.push(true); i += entity.length; }
    else { decoded.push(source[i]); literal.push(false); i++; }
  }
  const input = decoded.join(''); let text = ''; const marks = []; const syntax = [];
  for (let i = 0; i < input.length;) {
    const explicit = !literal[i] && /^\{\{mark:(red|yellow|green)\}\}/.exec(input.slice(i));
    if (explicit) {
      let end = input.indexOf('{{/mark}}', i + explicit[0].length);
      while (end >= 0 && literal[end]) end = input.indexOf('{{/mark}}', end + 9);
      if (end >= 0) { const start = text.length; text += input.slice(i + explicit[0].length, end); marks.push({ start, end: text.length, color: explicit[1] }); i = end + 9; continue; }
    }
    const delimiter = input[i];
    if (!literal[i] && colors[delimiter] && (i === 0 || /[\s(]/.test(input[i - 1])) && input[i + 1] && !/\s/.test(input[i + 1])) {
      let end = i + 1;
      while (end < input.length && input[end] !== '\n') {
        if (input[end] === delimiter && !literal[end] && !/\s/.test(input[end - 1]) && (end + 1 === input.length || /[\s;,.:)\]}]/.test(input[end + 1]))) break;
        end++;
      }
      if (end < input.length && input[end] === delimiter && end > i + 1) {
        const start = text.length; text += input.slice(i + 1, end);
        marks.push({ start, end: text.length, color: colors[delimiter] }); syntax.push(i, end); i = end + 1; continue;
      }
    }
    text += input[i++];
  }
  return { text, marks, syntax };
}
export function line(text = '', marks = [], id = uid()) { return { id, text, marks }; }
export const fromPortable = text => String(text).replace(/\r\n?/g, '\n').split('\n').map(value => { const parsed = parsePortable(value); return line(parsed.text, parsed.marks); });
export function cellsOf(lines) {
  const cells = [];
  lines.forEach((item, index) => {
    if (index) cells.push({ char: '\n', color: null });
    for (let at = 0; at < item.text.length; at++) cells.push({ char: item.text[at], color: item.marks.find(mark => at >= mark.start && at < mark.end)?.color || null });
  });
  return cells;
}
export function linesFromCells(cells, previous = []) {
  const result = [line()];
  for (const cell of cells) {
    if (cell.char === '\n') { result.push(line()); continue; }
    const item = result.at(-1), at = item.text.length; item.text += cell.char;
    if (cell.color) {
      const last = item.marks.at(-1);
      if (last?.color === cell.color && last.end === at) last.end++;
      else item.marks.push({ start: at, end: at + 1, color: cell.color });
    }
  }
  const equivalent = (a, b) => a && b && a.text === b.text && JSON.stringify(a.marks) === JSON.stringify(b.marks);
  let start = 0, tail = 0;
  while (start < result.length && equivalent(result[start], previous[start])) { result[start].id = previous[start].id; start++; }
  while (tail < result.length - start && tail < previous.length - start && equivalent(result[result.length - 1 - tail], previous[previous.length - 1 - tail])) {
    result[result.length - 1 - tail].id = previous[previous.length - 1 - tail].id; tail++;
  }
  if (start < result.length - tail && start < previous.length - tail && previous[start]) result[start].id = previous[start].id;
  return result;
}
export const bodyText = patient => patient.lines.map(item => item.text).join('\n');
export function replaceText(patient, start, end, text, insertedCells) {
  const cells = cellsOf(patient.lines); start = Math.max(0, Math.min(start, cells.length)); end = Math.max(start, Math.min(end, cells.length));
  const inherited = cells[start - 1]?.char !== '\n' ? cells[start - 1]?.color : null;
  const insert = insertedCells || text.split('').map(char => ({ char, color: inherited || null }));
  cells.splice(start, end - start, ...insert); patient.lines = linesFromCells(cells, patient.lines);
  return start + insert.length;
}
export function highlight(patient, start, end, color) {
  const cells = cellsOf(patient.lines);
  for (let i = Math.max(0, start); i < Math.min(end, cells.length); i++) if (cells[i].char !== '\n') cells[i].color = color || null;
  patient.lines = linesFromCells(cells, patient.lines);
}
export function serializeLine(item) {
  let explicitOutput = null;
  // Explicit spans disambiguate partial-word and adjacent Word selections in TXT.
  if (item.marks.length) {
    let result = '', active = null;
    for (let i = 0; i <= item.text.length; i++) {
      const color = i < item.text.length ? item.marks.find(mark => i >= mark.start && i < mark.end)?.color || null : null;
      if (color !== active) { if (active) result += '{{/mark}}'; if (color) result += `{{mark:${color}}}`; active = color; }
      if (i < item.text.length) result += ({ '&': '&#38;', '/': '&#47;', '%': '&#37;', '\\': '&#92;', '{': '&#123;' })[item.text[i]] || item.text[i];
    }
    explicitOutput = result;
  }
  const ambiguous = new Set(parsePortable(item.text).syntax);
  let output = '', active = null;
  for (let i = 0; i <= item.text.length; i++) {
    const color = i < item.text.length ? item.marks.find(mark => i >= mark.start && i < mark.end)?.color || null : null;
    if (color !== active) { if (active) output += delimiters[active]; if (color) output += delimiters[color]; active = color; }
    if (i === item.text.length) break;
    const char = item.text[i];
    if (char === '&') output += '&#38;';
    else if (char === '{' && item.text.startsWith('{{mark:', i)) output += '&#123;';
    else if (ambiguous.has(i) || (active && char === delimiters[active] && !(/[\p{L}\d]/u.test(item.text[i - 1] || '') && /[\p{L}\d]/u.test(item.text[i + 1] || '')))) output += ({ '/': '&#47;', '%': '&#37;', '\\': '&#92;' })[char] || char;
    else output += char;
  }
  const restored = parsePortable(output);
  return explicitOutput && (restored.text !== item.text || JSON.stringify(restored.marks) !== JSON.stringify(item.marks)) ? explicitOutput : output;
}
export const serializeBody = patient => patient.lines.map(serializeLine).join('\n');
export function patientHeader(patient) {
  return [patient.bed || '床號待補', patient.mrn || '病歷號待補', patient.name || '姓名待補', patient.age || '年齡待補', patient.sex, patient.codeStatus].filter(Boolean).join(' ') + (patient.quickRemark ? ` ｜ ${patient.quickRemark}` : '');
}
export function createPatient(data = {}) {
  const patient = { id: uid(), bed: '', mrn: '', name: '', age: '', sex: '', codeStatus: '', quickRemark: '', sourceKind: 'manual', sourceAsOf: '', admissionDate: '', noteRevision: 0, ...data };
  patient.lines = data.lines ? structuredClone(data.lines) : fromPortable(data.body ?? HEADINGS.join('\n\n'));
  return patient;
}
export function locationOf(patient) {
  if (patient.floorOverride) return { rank: 1, floor: Number(patient.floorOverride) || 999, ward: patient.wardOverride || '', label: `${patient.floorOverride} 樓` };
  const match = /^L(\d{1,2})([A-Z])\d/i.exec(patient.bed);
  if (match) return { rank: 1, floor: Number(match[1]), ward: `L${match[1]}${match[2]}`, label: `${Number(match[1])} 樓 · L${match[1]}${match[2]}` };
  if (patient.sourceKind === 'ER' || /^LO\d/i.test(patient.bed)) return { rank: 0, floor: 0, ward: '', label: '急診' };
  return { rank: 2, floor: 999, ward: '', label: '其他 / 樓層未指定' };
}
export function bedCompare(a, b) {
  const x = locationOf(a), y = locationOf(b);
  return x.rank - y.rank || x.floor - y.floor || collator.compare(x.ward, y.ward) || (!a.bed - !b.bed) || collator.compare(a.bed, b.bed) || collator.compare(a.id, b.id);
}
export function tasksOf(patient) {
  const tasks = [];
  if (pending(patient.quickRemark) || important(patient.quickRemark)) tasks.push({ patientId: patient.id, lineId: 'remark', text: parsePortable(patient.quickRemark).text, pending: pending(patient.quickRemark), important: important(patient.quickRemark) });
  patient.lines.forEach(item => {
    if (pending(item.text) || important(item.text)) tasks.push({ patientId: patient.id, lineId: item.id, text: item.text, pending: pending(item.text), important: important(item.text) });
  });
  return tasks;
}
export const pendingCount = patient => tasksOf(patient).filter(task => task.pending).length;
export function sortPatients(patients, mode = 'bed') {
  return [...patients].sort((a, b) => {
    if (mode === 'important') { const difference = Number(tasksOf(b).some(t => t.important)) - Number(tasksOf(a).some(t => t.important)); if (difference) return difference; }
    if (mode === 'pending') { const difference = pendingCount(b) - pendingCount(a); if (difference) return difference; }
    return bedCompare(a, b);
  });
}
export function blocksOf(patient) {
  const blocks = []; let section = 'HX';
  patient.lines.forEach((item, index) => {
    if (sectionOf(item.text)) { section = sectionOf(item.text); return; }
    if (bullet(item.text)) {
      let end = index + 1;
      while (end < patient.lines.length && !bullet(patient.lines[end].text) && !sectionOf(patient.lines[end].text)) end++;
      blocks.push({ id: item.id, start: index, end, section });
    }
  });
  return blocks;
}
export function moveBlock(patient, blockId, target) {
  const block = blocksOf(patient).find(item => item.id === blockId);
  if (!block || target < 0 || target > patient.lines.length || (target >= block.start && target <= block.end)) return false;
  const moved = patient.lines.splice(block.start, block.end - block.start);
  patient.lines.splice(target > block.start ? target - moved.length : target, 0, ...moved); return true;
}
export function normalizeExams(patient) {
  for (let index = patient.lines.length - 1; index >= 0; index--) {
    const item = patient.lines[index];
    const match = /^(\s*(?:[-#]\s+)?)(CXR|CTA|CT|MRA|MRI|2D Echo|Echo|ECG|EKG|US)([^:<>\n]*)([:：])/i.exec(item.text);
    if (!match) continue;
    const offset = patient.lines.slice(0, index).reduce((sum, row) => sum + row.text.length + 1, 0);
    replaceText(patient, offset + match[0].length - 1, offset + match[0].length - 1, '>');
    replaceText(patient, offset + match[1].length, offset + match[1].length, '<');
  }
}
export function completeTask(patient, lineId) {
  let completed;
  if (lineId === 'remark') {
    if (!pending(patient.quickRemark)) return false;
    completed = fromPortable(patient.quickRemark); patient.quickRemark = '';
  } else {
    const index = patient.lines.findIndex(item => item.id === lineId);
    if (index < 0 || !pending(patient.lines[index].text)) return false;
    let end = index + 1;
    while (end < patient.lines.length && patient.lines[end].text.trim() && !bullet(patient.lines[end].text) && !sectionOf(patient.lines[end].text) && !pending(patient.lines[end].text)) end++;
    completed = patient.lines.splice(index, end - index);
  }
  for (const item of completed) {
    const holder = { lines: [item] };
    const matches = [...item.text.matchAll(/(?<!\{)\{pending\}(?!\})/g)].reverse();
    for (const match of matches) replaceText(holder, match.index, match.index + match[0].length, '');
    Object.assign(item, holder.lines[0]);
    while (item.text.endsWith(' ')) { item.text = item.text.slice(0, -1); item.marks = item.marks.map(mark => ({ ...mark, end: Math.min(mark.end, item.text.length) })).filter(mark => mark.end > mark.start); }
  }
  if (/^\s*#\s/.test(completed[0].text)) completed[0].text = completed[0].text.replace('#', '-');
  else if (!bullet(completed[0].text)) { completed[0].text = '- ' + completed[0].text; completed[0].marks = completed[0].marks.map(mark => ({ ...mark, start: mark.start + 2, end: mark.end + 2 })); }
  let index = patient.lines.findIndex(item => sectionOf(item.text) === 'O');
  if (index < 0) {
    index = patient.lines.findIndex(item => ['A', 'P', 'Medication'].includes(sectionOf(item.text)));
    if (index < 0) index = patient.lines.length;
    patient.lines.splice(index, 0, line('[O]:'));
  }
  let end = index + 1;
  while (end < patient.lines.length && !sectionOf(patient.lines[end].text)) end++;
  while (end > index + 1 && !patient.lines[end - 1].text.trim()) end--;
  if (patient.lines[index + 1]?.text === '未提供') { patient.lines.splice(index + 1, 1); end--; }
  patient.lines.splice(Math.max(index + 1, end), 0, ...completed); return true;
}
export function insertObjective(patient, text) {
  if (!text.trim()) return false;
  let index = patient.lines.findIndex(item => sectionOf(item.text) === 'O');
  if (index < 0) {
    index = patient.lines.findIndex(item => ['A', 'P', 'Medication'].includes(sectionOf(item.text)));
    if (index < 0) index = patient.lines.length;
    patient.lines.splice(index, 0, ...fromPortable('[O]:'));
  }
  let end = index + 1; while (end < patient.lines.length && !sectionOf(patient.lines[end].text)) end++;
  patient.lines.splice(end, 0, ...fromPortable(text), ...fromPortable(''));
  return true;
}
export const exportPatients = patients => [...patients].sort(bedCompare).map(patient => `${DIVIDER}\n${patientHeader({ ...patient, quickRemark: parsePortable(patient.quickRemark).text })}\n\n${bodyText(patient)}`).join('\n\n') + (patients.length ? '\n' : '');
export function currentOnly(text) {
  const matches = [...text.matchAll(/^\[(Current|History|Unclear)\]\s*$/gm)];
  if (matches.length !== 3 || matches.map(m => m[1]).join(',') !== 'Current,History,Unclear') return null;
  return text.slice(matches[0].index + matches[0][0].length, matches[1].index).trim();
}
export function taiwanDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function shiftDate(iso, days) { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
export const displayDate = iso => { const parts = iso.split('-'); return `${Number(parts[1])}/${Number(parts[2])}`; };
export class HandoffStore {
  constructor(onChange = () => {}) { this.patients = []; this.activeId = null; this.history = []; this.future = []; this.clock = 0; this.onChange = onChange; }
  get active() { return this.patients.find(patient => patient.id === this.activeId); }
  transaction(label, mutate) {
    const before = structuredClone({ patients: this.patients, activeId: this.activeId });
    mutate();
    if (JSON.stringify(before.patients) === JSON.stringify(this.patients)) return false;
    this.clock++;
    for (const patient of this.patients) if (JSON.stringify(before.patients.find(p => p.id === patient.id)) !== JSON.stringify(patient)) patient.noteRevision = this.clock;
    this.history.push({ label, ...before }); if (this.history.length > 40) this.history.shift(); this.future = [];
    this.onChange(label); return true;
  }
  undo(redo = false) {
    const source = redo ? this.future : this.history, target = redo ? this.history : this.future;
    const snapshot = source.pop(); if (!snapshot) return false;
    target.push({ label: snapshot.label, patients: structuredClone(this.patients), activeId: this.activeId });
    this.patients = snapshot.patients; this.activeId = snapshot.activeId; this.clock++;
    this.patients.forEach(patient => { patient.noteRevision = this.clock; }); this.onChange(redo ? '重做' : '復原'); return true;
  }
  remove(id) {
    return this.transaction('刪除病人', () => {
      const index = this.patients.findIndex(patient => patient.id === id); if (index < 0) return;
      this.patients.splice(index, 1); if (this.activeId === id) this.activeId = this.patients[Math.min(index, this.patients.length - 1)]?.id || null;
    });
  }
}
