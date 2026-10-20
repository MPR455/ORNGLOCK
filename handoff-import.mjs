import { DIVIDER, HEADINGS, createPatient, fromPortable, sameName, serializeBody } from './handoff-model.mjs';
export const MAX_IMPORT_BYTES = 5_000_000;
export function decodeFile(bytes, encoding = 'auto') {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new Error('檔案上限為 5 MB。請分批匯入。');
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decode = name => new TextDecoder(name, { fatal: true }).decode(data).replace(/^\uFEFF/, '');
  let text;
  if (encoding !== 'auto') text = decode(encoding);
  else if (data[0] === 0xff && data[1] === 0xfe) text = decode('utf-16le');
  else if (data[0] === 0xfe && data[1] === 0xff) text = decode('utf-16be');
  else { try { text = decode('utf-8'); } catch { try { text = decode('big5'); } catch { throw new Error('無法解碼檔案，請選擇 UTF-8 或 Big5 編碼。'); } } }
  if (text.includes('\uFFFD') || /\x00/.test(text)) throw new Error('檔案包含無法辨識的字元，請檢查編碼。');
  return text;
}
export function parseDelimited(source, delimiter = ',') {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') { if (source[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += char;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; closed = false; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); if (row.some(value => value.trim())) rows.push(row); row = []; field = ''; closed = false;
    } else if (closed && !/\s/.test(char)) throw new Error('CSV 引號後有非分隔文字，請檢查格式。');
    else if (!closed) field += char;
  }
  if (quoted) throw new Error('CSV 有未結束的引號。');
  row.push(field); if (row.some(value => value.trim())) rows.push(row);
  return rows;
}
const headerKey = text => text.replace(/^\uFEFF/, '').normalize('NFKC').replace(/[\s:：_-]/g, '').toLowerCase();
const aliases = {
  bed: ['床號', '床位', 'bed', 'bedno'], mrn: ['病歷號', '病歷號碼', 'mrn', 'chartno'], name: ['姓名', '中文姓名', 'name', 'patientname'],
  age: ['年齡', 'age'], sex: ['性別', 'sex', 'gender'], codeStatus: ['dnr', 'codestatus', 'dnrstatus'], quickRemark: ['備註', '快速註記', 'remark', 'quickremark'], diagnosis: ['入觀診斷', '診斷', 'diagnosis'], admissionDate: ['入院日期', 'admissiondate']
};
function csvPatients(text, delimiter, mapping) {
  const rows = parseDelimited(text, delimiter); if (rows.length < 2) throw new Error('需要欄位標題和至少一筆病人資料。');
  const headers = rows.shift(); const fields = {};
  for (const [field, names] of Object.entries(aliases)) {
    const selected = mapping?.[field];
    const index = selected !== undefined && selected !== '' ? Number(selected) : headers.findIndex(h => names.includes(headerKey(h)));
    if (Number.isInteger(index) && index >= 0 && index < headers.length) fields[field] = index;
  }
  if (fields.name === undefined && fields.mrn === undefined) { const error = new Error('找不到姓名或病歷號欄位，請指定欄位對應。'); error.headers = headers; throw error; }
  const sourceKind = headers.some(h => ['檢傷級數', '入觀診斷'].includes(h.trim())) ? 'ER' : 'ward';
  const warnings = []; const patients = [];
  rows.forEach((row, index) => {
    const data = { sourceKind }; for (const [field, column] of Object.entries(fields)) data[field] = (row[column] || '').trim();
    if (!data.name && !data.mrn) { warnings.push(`第 ${index + 2} 列缺少姓名與病歷號，略過。`); return; }
    if (row.length > headers.length && row.slice(headers.length).some(value => value.trim())) { warnings.push(`第 ${index + 2} 列欄位數過多，略過以免錯置。`); return; }
    if (data.diagnosis) data.body = HEADINGS.map(h => h === '[A]:' ? `${h}\n# 入觀診斷: ${data.diagnosis}` : h).join('\n\n');
    patients.push(createPatient(data));
  });
  return { patients, warnings, format: sourceKind === 'ER' ? '急診 CSV' : '病人表格', headers };
}
function wardPatients(source) {
  const header = /^\s*病歷號[:：]\s*(\S+)\s+姓名[:：]\s*(.*?)\s+年齡[:：]\s*(\S+)\s+(\S+)\s+入院日期[:：]\s*(\S+)[ \t]*$/gm;
  const matches = [...source.matchAll(header)]; const patients = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i], medication = source.slice(match.index + match[0].length, matches[i + 1]?.index ?? source.length).trim();
    const body = HEADINGS.map(h => h === '[Medication]' && medication ? `${h}\n${medication.split('\n').filter(s => s.trim()).map(s => `- ${s.trim()}`).join('\n')}` : h).join('\n\n');
    patients.push(createPatient({ mrn: match[1], name: match[2], age: match[3], bed: match[4], admissionDate: match[5], sourceKind: 'ward', body }));
  }
  if (!patients.length) throw new Error('病房標頭無法辨識。請確認病歷號、姓名、年齡、床號及入院日期。');
  const headerCount = (source.match(/^\s*病歷號[:：]/gm) || []).length;
  if (headerCount !== patients.length) throw new Error('部分病房標頭無法辨識，請修正後再匯入，避免藥物接到錯誤病人。');
  return { patients, warnings: [], format: '病房文字' };
}
export function parsePatientHeader(text) {
  const [identity, ...remark] = text.split(/[｜|]/);
  const match = /^(\S+)\s+(\S+)\s+(.+?)\s+(年齡待補|\d+(?:\.\d+)?(?:\s*(?:歲|[YyMmDd]|月|天|years?|months?|days?))?|>\d+)(?:\s+(.*))?$/.exec(identity.trim());
  if (!match) throw new Error('交班單身分列無法辨識。格式需為：床號 病歷號 姓名 年齡。');
  const clean = (value, unknown) => value === unknown ? '' : value;
  let sex = '', codeStatus = match[5]?.trim() || '';
  const sexMatch = /^(男|女|M|F|male|female)(?:\s+|$)/i.exec(codeStatus);
  if (sexMatch) { sex = sexMatch[1]; codeStatus = codeStatus.slice(sexMatch[0].length); }
  return { bed: clean(match[1], '床號待補'), mrn: clean(match[2], '病歷號待補'), name: clean(match[3], '姓名待補'), age: clean(match[4], '年齡待補'), sex, codeStatus, quickRemark: remark.join('｜').trim(), sourceKind: /^LO\d/i.test(match[1]) ? 'ER' : 'ward' };
}
export function parseFullNote(text) {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(new RegExp(`^${DIVIDER}\\n`), '');
  const firstBreak = cleaned.indexOf('\n'); if (firstBreak < 0) throw new Error('交班單缺少內文。');
  const data = parsePatientHeader(cleaned.slice(0, firstBreak));
  return createPatient({ ...data, body: cleaned.slice(firstBreak + 1).replace(/^\n/, ''), fullNote: true });
}
export function parsePatients(text, { format = 'auto', mapping } = {}) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new Error('請先上傳檔案或貼上病人名單。');
  if (text.length > MAX_IMPORT_BYTES) throw new Error('文字過長，請分批匯入。');
  if (format === 'txt' || (format === 'auto' && text.startsWith(DIVIDER + '\n'))) {
    const parts = text.split(new RegExp(`^${DIVIDER}$`, 'm')).filter(part => part.trim());
    const patients = parts.map(part => parseFullNote(part.replace(/^\n/, '').replace(/\n+$/, '')));
    return { patients, warnings: [], format: '交班單 TXT' };
  }
  if (format === 'ward' || (format === 'auto' && /^\s*病歷號[:：]/m.test(text))) return wardPatients(text);
  if (format === 'csv' || format === 'tsv' || (format === 'auto' && /[,\t]/.test(text.split('\n')[0]))) return csvPatients(text, format === 'tsv' || (format === 'auto' && text.split('\n')[0].includes('\t')) ? '\t' : ',', mapping);
  throw new Error('無法辨識名單。請選擇格式；單一病人可用「新增病人」輸入，再貼上筆記。');
}
const aiBed = value => /^(?:床號待補|[A-Za-z]*[-.]?\d[\w+.-]*)$/.test(value);
function aiHeader(raw) {
  const text = raw.normalize('NFKC').replace(/^\s*#{1,6}\s+/, '').replace(/[【】]/g, ' ').replace(/\*\*/g, '').replace(/(\s\d{1,3})([MF])(?=\s|$)/gi, '$1 $2').replace(/\s+/g, ' ').trim();
  const [bed, mrn] = text.split(' ');
  if (!aiBed(bed) || !/^(?:病歷號待補|\d{4,}|[A-Za-z]+[\w-]*\d[\w-]*)$/.test(mrn || '')) return null;
  let data;
  try { data = parsePatientHeader(text); }
  catch {
    const match = /^(\S+)\s+(病歷號待補|[A-Za-z]*\d{4,}[\w-]*)(?:\s+(.+))?$/.exec(text);
    if (!match) return null;
    data = { bed: match[1] === '床號待補' ? '' : match[1], mrn: match[2] === '病歷號待補' ? '' : match[2], name: match[3] === '姓名待補' ? '' : (match[3] || ''), age: '', quickRemark: '', codeStatus: '' };
  }
  // Unstructured reminders in a header belong in the remark, not the DNR field.
  const dnr = /^DNR\s*\d+(?:\s*[,/+&]\s*\d+)*/i.exec(data.codeStatus || '');
  const reminder = (data.codeStatus || '').slice(dnr?.[0].length || 0).trim();
  data.codeStatus = dnr?.[0] || '';
  data.quickRemark = [data.quickRemark, reminder].filter(Boolean).join(' · ');
  return data;
}
const aiSectionAliases = { hx: 'HX', phx: 'HX', pmh: 'HX', history: 'HX', cc: 'CC', 'chief complaint': 'CC', o: 'O', objective: 'O', a: 'A', assessment: 'A', p: 'P', plan: 'P', medication: 'Medication', medications: 'Medication', meds: 'Medication' };
function aiSection(raw) {
  const text = raw.replace(/^\s*#{1,6}\s+/, '').trim();
  const match = /^(?:\[([^\]]+)\]\s*[:：]?\s*(.*)|([\w ]+)\s*[:：]\s*(.*))$/.exec(text);
  const key = (match?.[1] || match?.[3] || text).toLowerCase().trim();
  const section = aiSectionAliases[key];
  return section ? { section, inline: (match?.[2] ?? match?.[4] ?? '').trim() } : null;
}
// Best-effort normalization is limited to the AI import flow; ordinary TXT import stays exact.
export function parseAIList(text, source) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('目前沒有可套入的內容。');
  if (text.length > MAX_IMPORT_BYTES) throw new Error('文字過長，請分批套入。');
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\s*```[^\n]*$/gm, '').trim();
  const chunks = []; let rows = [];
  const flush = () => { if (rows.some(row => row.trim())) chunks.push(rows); rows = []; };
  for (const row of cleaned.split('\n')) {
    if (/^\s*[█=─━_\-]{5,}\s*$/.test(row)) { flush(); continue; }
    if (aiHeader(row) && rows.some(value => value.trim())) flush();
    rows.push(row);
  }
  flush();
  const patients = [], warnings = [];
  const compact = value => value.normalize('NFKC').replace(/\s/g, '');
  const compactSource = source === undefined ? '' : compact(source);
  let emptyBeds = 0, normalized = 0;
  for (const chunk of chunks) {
    const lines = [...chunk]; while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    if (lines.length === 1 && aiBed(lines[0].trim())) { emptyBeds++; continue; }
    const header = aiHeader(lines[0]);
    const data = header || { bed: aiBed(lines[0].trim()) ? lines[0].trim() : '', quickRemark: '待核對' };
    // Preserve an unrecognized identity line in the note rather than discarding its text.
    if (header) lines.shift();
    const sections = Object.fromEntries(['HX', 'CC', 'O', 'A', 'P', 'Medication'].map(key => [key, []]));
    const found = []; let current = 'O';
    for (const row of lines) {
      const heading = aiSection(row);
      if (heading) { current = heading.section; found.push(row.trim()); if (heading.inline) sections[current].push(heading.inline); }
      else sections[current].push(row);
    }
    if (JSON.stringify(found) !== JSON.stringify(HEADINGS)) normalized++;
    const body = HEADINGS.map((heading, index) => {
      const content = sections[['HX', 'CC', 'O', 'A', 'P', 'Medication'][index]].join('\n').trim();
      return content ? `${heading}\n${content}` : heading;
    }).join('\n\n');
    const patient = createPatient({ ...data, body, fullNote: true });
    if (!patient.name && !patient.mrn) warnings.push(`第 ${patients.length + 1} 筆身分待補，筆記已保留，可套入後編輯。`);
    const sourceHasMRN = !patient.mrn || (source !== undefined && (/^\d+$/.test(patient.mrn) ? new RegExp(`(?<!\\d)${patient.mrn}(?!\\d)`).test(source) : source.includes(patient.mrn)));
    if (source !== undefined && (!sourceHasMRN || (patient.name && !compactSource.includes(compact(patient.name))))) warnings.push(`第 ${patients.length + 1} 筆姓名或病歷號與來源文字不同，請核對；仍可套入。`);
    patients.push(patient);
    if (patients.length > 1000) throw new Error('每次最多套入 1,000 位病人，請分批處理。');
  }
  if (!patients.length) throw new Error('沒有病人筆記可套入，請貼上或編輯轉換結果。');
  if (emptyBeds) warnings.unshift(`已略過 ${emptyBeds} 個只有床號、沒有筆記的空白床位。`);
  if (normalized) warnings.unshift(`已自動整理 ${normalized} 筆章節格式並補上缺少的章節。`);
  return { patients, warnings, format: 'AI 轉換交班單', aiConverted: true };
}
export function reconcile(existing, incoming) {
  const staged = [...existing]; const plans = [];
  for (const candidate of incoming) {
    const mrnMatches = candidate.mrn ? staged.filter(p => p.mrn === candidate.mrn) : [];
    const nameMatches = candidate.name ? staged.filter(p => p.name && sameName(p.name, candidate.name)) : [];
    let match = null, reason = '', conflict = false;
    if (mrnMatches.length > 1) { conflict = true; reason = '病歷號有多筆既存資料'; }
    else if (mrnMatches.length === 1) {
      match = mrnMatches[0];
      if (candidate.name && match.name && !sameName(candidate.name, match.name)) { conflict = true; reason = '病歷號相同但姓名不同'; }
      if (candidate.admissionDate && match.admissionDate && candidate.admissionDate !== match.admissionDate) { conflict = true; reason = '可能是不同住院事件'; }
    } else if (nameMatches.length > 1) { conflict = true; reason = '姓名重複，無法安全配對'; }
    else if (nameMatches.length === 1) {
      match = nameMatches[0];
      if (candidate.mrn && match.mrn && candidate.mrn !== match.mrn) { conflict = true; reason = '姓名相同但病歷號不同'; }
    }
    if (match && plans.some(plan => plan.targetId === match.id || plan.incoming.id === match.id)) { conflict = true; reason = '同批匯入重複病人，請只保留一列'; }
    let kind = conflict ? 'conflict' : match ? 'update' : 'add';
    const changed = match && ['bed', 'mrn', 'name', 'age', 'sex', 'codeStatus', 'admissionDate'].some(key => candidate[key] && candidate[key] !== match[key]);
    const differentNote = match && candidate.fullNote && (serializeBody(candidate) !== serializeBody(match) || candidate.quickRemark !== match.quickRemark);
    if (match && !changed && !differentNote && !conflict) kind = 'same';
    if (!match && staged.some(p => candidate.bed && p.bed === candidate.bed)) reason = '床號與既存病人重複，請確認占床狀況';
    plans.push({ incoming: candidate, targetId: match?.id, kind, reason, differentNote, choice: conflict ? 'skip' : kind === 'same' ? 'skip' : 'apply', replaceNote: false });
    if (!match && !conflict) staged.push(candidate);
  }
  return plans;
}
export function applyPlans(store, plans) {
  store.transaction('匯入病人', () => {
    for (const plan of plans) {
      if (plan.choice === 'skip' || plan.kind === 'same') continue;
      if (plan.kind === 'conflict') {
        if (plan.choice === 'add' && !store.patients.some(p => plan.incoming.mrn && p.mrn === plan.incoming.mrn)) store.patients.push(structuredClone(plan.incoming));
        continue;
      }
      const existing = store.patients.find(p => p.id === plan.targetId);
      if (!existing) { if (plan.kind === 'add') store.patients.push(structuredClone(plan.incoming)); continue; }
      for (const field of ['bed', 'mrn', 'name', 'age', 'sex', 'codeStatus', 'admissionDate']) if (plan.incoming[field]) existing[field] = plan.incoming[field];
      if (plan.incoming.sourceKind !== 'manual') existing.sourceKind = plan.incoming.sourceKind;
      if (plan.replaceNote && plan.incoming.fullNote) { existing.lines = structuredClone(plan.incoming.lines); existing.quickRemark = plan.incoming.quickRemark; }
    }
    if (!store.activeId) store.activeId = store.patients[0]?.id || null;
  });
}
