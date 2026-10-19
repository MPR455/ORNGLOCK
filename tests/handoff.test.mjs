import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createPatient, HandoffStore, fromPortable, cellsOf, linesFromCells, parsePortable, serializeBody, highlight, replaceText, bodyText, completeTask, tasksOf, pendingCount, blocksOf, moveBlock, exportPatients, insertObjective, DIVIDER, sortPatients, patientHeader, currentOnly, shiftDate, taiwanDate, locationOf } from '../handoff-model.mjs';
import { parsePatients, parseDelimited, decodeFile, reconcile, applyPlans, parseFullNote } from '../handoff-import.mjs';
import { handleApi, createMemoryGuard } from '../server/api.mjs';
import { ACTIONS, HANDOFF_ACTIONS } from '../server/actions.mjs';
import { normalizeExams } from '../handoff-model.mjs';
const make = (extra = {}) => createPatient({ bed: 'LO601', mrn: '00001234', name: '示範甲', age: '71', ...extra });
const context = { patient: { id: 'synthetic-id', bed: 'LO601', mrn: '00001234', name: '示範甲', age: '71' }, timezone: 'Asia/Taipei', referenceDate: '2026-10-18', sourceAsOf: '', operation: 'create' };
const request = payload => new Request('http://localhost/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const prompts = Object.fromEntries([...ACTIONS, ...HANDOFF_ACTIONS].map(a => [a.id, `private ${a.id}`]));
const settings = extra => ({ prompts, sharedKey: 'original-secret', handoffSharedKey: 'handoff-secret', guard: createMemoryGuard({ perMinute: 100 }), ...extra });
const success = text => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] });
test('CSV handles quoted commas, embedded newlines, escaped quotes and trailing cells', () => {
  assert.deepEqual(parseDelimited('a,b,\r\n"x,y","line1\nline2",\r\n"quote""x",z,'), [['a', 'b', ''], ['x,y', 'line1\nline2', ''], ['quote"x', 'z', '']]);
  assert.throws(() => parseDelimited('a,b\n"bad,z'), /引號/);
});
test('CSV aliases preserve identifiers, suffixes and uncertainty without adding important flags', () => {
  const result = parsePatients('床號,病歷號,中文姓名,年齡,入觀診斷,\nLO601,00001234,示範甲,71,r/o sepsis,');
  assert.equal(result.patients[0].mrn, '00001234'); assert.equal(result.patients[0].sourceKind, 'ER'); assert.match(bodyText(result.patients[0]), /r\/o sepsis/); assert.equal(tasksOf(result.patients[0]).length, 0);
  const ward = parsePatients('床位\tMRN\tname\tage\nL13A1322B\t00007777\t示範乙\t6月').patients[0]; assert.equal(ward.bed, 'L13A1322B'); assert.equal(ward.age, '6月');
});
test('ward medication blocks attach to correct patient and admission date is separate', () => {
  const result = parsePatients('病歷號:00001234 姓名:示範甲 年齡:71   L13A1302A 入院日期:2026/10/06\nDrug A (自備藥) 1PC QD\n\n[到期]Drug B 1PC ONCE\n\n病歷號:00005678 姓名:示範乙 年齡:48   L13A1319 入院日期:2026/10/15\nDrug C 1PC Q8H');
  assert.equal(result.patients.length, 2); assert.match(bodyText(result.patients[0]), /Drug B/); assert.doesNotMatch(bodyText(result.patients[0]), /Drug C/); assert.equal(result.patients[0].sourceAsOf, ''); assert.equal(result.patients[0].admissionDate, '2026/10/06');
});
test('file decoder supports UTF8 BOM, UTF16 BOM, rejects NUL and oversize input', () => {
  assert.equal(decodeFile(new TextEncoder().encode('\uFEFF床號')), '床號');
  const text = Buffer.from('\uFEFF床號', 'utf16le'); assert.equal(decodeFile(text), '床號');
  assert.throws(() => decodeFile(new Uint8Array(5_000_001)), /5 MB/); assert.throws(() => decodeFile(new Uint8Array([0])), /字元/);
});
test('actual private sample formats decode and yield documented record counts', { skip: !existsSync(new URL('../data example/ER_List_example.csv', import.meta.url)) }, async () => {
  const er = parsePatients(decodeFile(await readFile(new URL('../data example/ER_List_example.csv', import.meta.url))));
  const ward = parsePatients(decodeFile(await readFile(new URL('../data example/病房_List_example.txt', import.meta.url))));
  assert.equal(er.patients.length, 18); assert.equal(ward.patients.length, 5); assert.equal(er.patients[0].bed, 'LO601');
});
test('safe upsert changes bed/header and keeps note, quick remark and absent patients', () => {
  const store = new HandoffStore(), a = make({ quickRemark: '!stay', body: '[P]:\n# lab {pending}' }), other = make({ mrn: '00002222', name: '示範乙', bed: 'LO602' }); store.patients = [a, other]; store.activeId = a.id;
  const plans = reconcile(store.patients, [make({ bed: 'L13A1302A' })]); assert.equal(plans[0].kind, 'update'); applyPlans(store, plans);
  assert.match(patientHeader(a), /^L13A1302A/); assert.equal(a.quickRemark, '!stay'); assert.equal(pendingCount(a), 1); assert.equal(store.patients.length, 2);
  assert.equal(reconcile(store.patients, [make({ bed: a.bed })])[0].kind, 'same');
});
test('unique name supports missing MRN; same name differing MRNs and duplicate names conflict', () => {
  const a = make(); assert.equal(reconcile([a], [make({ mrn: '', bed: 'LO602' })])[0].targetId, a.id);
  assert.equal(reconcile([a], [make({ mrn: '00008888' })])[0].kind, 'conflict');
  assert.equal(reconcile([a, make({ mrn: '00009999' })], [make({ mrn: '' })])[0].kind, 'conflict');
  assert.equal(reconcile([a], [make({ name: '示範乙' })])[0].kind, 'conflict');
});
test('bed reuse creates a new patient and does not transfer prior notes; repeated source row conflicts', () => {
  const a = make({ body: '[P]:\n- existing' }), b = make({ name: '示範乙', mrn: '00008888' });
  const plans = reconcile([a], [b]); assert.equal(plans[0].kind, 'add'); assert.match(plans[0].reason, /床號/);
  assert.equal(reconcile([], [a, make()])[1].kind, 'conflict');
});
test('full note import requires explicit replacement and is undoable', () => {
  const store = new HandoffStore(); const a = make({ body: '[P]:\n- old' }); store.patients = [a];
  const incoming = make({ body: '[P]:\n- new', fullNote: true }); const plans = reconcile(store.patients, [incoming]); assert.equal(plans[0].differentNote, true);
  applyPlans(store, plans); assert.match(bodyText(a), /old/); plans[0].replaceNote = true; applyPlans(store, plans); assert.match(bodyText(a), /new/); store.undo(); assert.match(bodyText(store.patients[0]), /old/);
});
test('highlights are background span data; partial-word, adjacent spans and literal punctuation round-trip', () => {
  const patient = make({ body: '[O]:\nNa 128 mmol/L; K 6.1; literal /word/; 10/18 40% C:\\notes\\file; &#47;' });
  // Initial inline shorthand becomes a mark by design. Then add partial-word and adjacent Word selections.
  const start = bodyText(patient).indexOf('Na 128'); highlight(patient, start + 1, start + 4, 'red'); highlight(patient, start + 4, start + 6, 'green');
  const serialized = serializeBody(patient), restored = make({ body: serialized });
  assert.equal(bodyText(restored), bodyText(patient)); assert.deepEqual(restored.lines.map(l => l.marks), patient.lines.map(l => l.marks));
  const literal = make({ lines: [{ id: crypto.randomUUID(), text: '/literal/ {{mark:red}}text{{/mark}} &', marks: [] }] });
  assert.equal(bodyText(make({ body: serializeBody(literal) })), bodyText(literal));
});
test('portable shorthand leaves dates, units, percentages, ratios and URLs alone', () => {
  const text = '10/18 Cr 1.2 mg/dL FiO2 40% C/S r/o https://example.test/a'; assert.equal(parsePortable(text).text, text); assert.equal(parsePortable(text).marks.length, 0);
  assert.deepEqual(parsePortable('/K 6.1 [H]/; \\Na 128 [L]\\').marks.map(m => m.color), ['red', 'green']);
});
test('lossless fallback retains literal closing markers inside highlighted text and keeps pending readable', () => {
  const patient = make({ lines: [{ id: crypto.randomUUID(), text: 'prefix{{/mark}}suffix {pending}', marks: [{ start: 2, end: 22, color: 'red' }] }] });
  const restored = make({ body: serializeBody(patient) }); assert.equal(bodyText(restored), bodyText(patient)); assert.deepEqual(restored.lines[0].marks, patient.lines[0].marks);
  assert.ok(serializeBody(make({ body: '[P]:\n# echo {pending}' })).includes('{pending}'));
});
test('exam-label normalization preserves source findings, dates and marked ranges', () => {
  const patient = make({ body: '[O]:\nCXR 10/18: /supplied finding/\n- CTA chest 10/17: no PE\n<CXR 10/16>: unchanged\nCr -2.0' });
  normalizeExams(patient); assert.match(bodyText(patient), /<CXR 10\/18>: supplied finding/); assert.match(bodyText(patient), /- <CTA chest 10\/17>: no PE/); assert.equal(patient.lines[1].marks[0].color, 'red'); assert.equal(bodyText(patient).match(/<CXR 10\/16>/g).length, 1); assert.ok(bodyText(patient).endsWith('Cr -2.0'));
});
test('line reconciliation does not reuse one stable ID twice after insertion', () => {
  const previous = fromPortable('B'), cells = cellsOf(fromPortable('A\nB')), lines = linesFromCells(cells, previous);
  assert.equal(lines[1].id, previous[0].id); assert.equal(new Set(lines.map(l => l.id)).size, 2);
});
test('editing text preserves surrounding marks and handles split lines', () => {
  const patient = make({ body: 'hello world' }); highlight(patient, 0, 5, 'yellow'); replaceText(patient, 2, 3, 'XX\n');
  assert.equal(bodyText(patient), 'heXX\nlo world'); assert.equal(patient.lines[0].marks[0].color, 'yellow'); assert.equal(patient.lines[1].marks[0].color, 'yellow');
});
test('checkbox completion moves the exact task and continuation with highlight into O, preserving importance', () => {
  const patient = make({ body: '[O]:\n\n[P]:\n# ! /echo/ {pending}\n  call team\n# echo {pending}\n[Medication]\n- drug' }); const id = patient.lines[3].id;
  assert.equal(completeTask(patient, id), true); assert.equal(pendingCount(patient), 1); assert.match(bodyText(patient), /\[O\]:\n- ! echo\n  call team/); assert.equal(tasksOf(patient).filter(t => t.important).length, 1); assert.equal(patient.lines.find(l => l.id === id).marks[0].color, 'red'); assert.equal(completeTask(patient, id), false);
});
test('pending remark completes without moving identity and literal double braces do not become tasks', () => {
  const patient = make({ quickRemark: 'call family {pending}', body: '[O]:\n\n[P]:\n- literal {{pending}}\n- value != target' });
  assert.equal(pendingCount(patient), 1); completeTask(patient, 'remark'); assert.equal(patient.quickRemark, ''); assert.match(bodyText(patient), /- call family/); assert.equal(tasksOf(patient).length, 0); assert.match(patientHeader(patient), /^LO601 00001234 示範甲 71$/);
});
test('block moves preserve continuation and marks and stop at sections', () => {
  const patient = make({ body: '[A]:\n# problem\ncontinuation\n[P]:\n- /plan/\nnext\n[Medication]\n- drug' }); const blocks = blocksOf(patient);
  assert.equal(blocks[0].end, 3); assert.equal(moveBlock(patient, blocks[1].id, 1), true); assert.equal(patient.lines[1].text, '- plan'); assert.equal(patient.lines[1].marks[0].color, 'red'); assert.equal(patient.lines[2].text, 'next');
});
test('deletion by stable ID removes only that patient, can restore exact document, and invalidates revisions', () => {
  const store = new HandoffStore(), a = make({ body: '[P]:\n# /echo/ {pending}' }), b = make({ name: '示範乙', mrn: '00007777' }); store.patients = [a, b]; store.activeId = a.id;
  store.remove(a.id); assert.deepEqual(store.patients.map(p => p.id), [b.id]); assert.doesNotMatch(exportPatients(store.patients), /示範甲|echo/); assert.equal(store.patients.some(p => p.lines.some(l => l.text.includes('echo'))), false);
  store.undo(); const restored = store.patients.find(p => p.id === a.id); assert.equal(serializeBody(restored), serializeBody(a)); assert.ok(restored.noteRevision > a.noteRevision); assert.equal(pendingCount(restored), 1); store.undo(true); assert.equal(store.patients.length, 1);
});
test('continuous floor/bed export ignores left sort and round-trips all patient notes', () => {
  const patients = [make({ bed: 'L13A1322B', mrn: '00003333', name: '示範丙', quickRemark: '!important' }), make({ bed: 'L2A201', mrn: '00002222', name: '示範乙' }), make({ body: '[O]:\n/K 6.1 [H]/\n[P]:\n# echo {pending}' })];
  const exported = exportPatients(sortPatients(patients, 'important')); assert.ok(exported.indexOf('LO601') < exported.indexOf('L2A201')); assert.ok(exported.indexOf('L2A201') < exported.indexOf('L13A1322B')); assert.equal(exported.split('\n').filter(l => l === DIVIDER).length, 3); assert.equal(DIVIDER.length, 44);
  assert.equal(exportPatients(parsePatients(exported).patients), exported); assert.equal(locationOf(patients[2]).rank, 0); assert.equal(locationOf(patients[0]).floor, 13);
});
test('Current-only copy validates unique, ordered headings and retains qualifiers', () => {
  assert.equal(currentOnly('[Current]\nO2: NC 3 L/min (ordered)\n[History]\nold\n[Unclear]\nunknown'), 'O2: NC 3 L/min (ordered)');
  assert.equal(currentOnly('[Current]\na\n[Current]\nb\n[History]\nc\n[Unclear]\nd'), null); assert.equal(currentOnly('[History]\na\n[Current]\nb\n[Unclear]\nc'), null);
});

test('TXT export omits background syntax without changing dates, units, literal punctuation or pending items', () => {
  const patient = make({ quickRemark: '/important/ {pending}', body: '[O]:\n/K 6.1 [H]/; \\Na 128 [L]\\; %review%\n10/18 40% mg/dL r/o C:\\notes\\file\n[P]:\n# ! echo {pending}' });
  const original = serializeBody(patient); highlight(patient, bodyText(patient).indexOf('review') + 1, bodyText(patient).indexOf('review') + 3, 'red');
  const exported = exportPatients([patient]);
  assert.match(exported, /K 6\.1 \[H\]; Na 128 \[L\]; review/);
  assert.match(exported, /10\/18 40% mg\/dL r\/o C:\\notes\\file/);
  assert.match(exported, /# ! echo \{pending\}/); assert.match(exported, /｜ important \{pending\}/);
  assert.doesNotMatch(exported, /\{\{mark:|\{\{\/mark\}\}|\/K 6\.1|\\Na 128|%review%|\/important\//);
  assert.equal(patient.quickRemark, '/important/ {pending}'); assert.ok(patient.lines.some(item => item.marks.length)); assert.match(original, /\/K 6\.1/);
});

test('direct objective insertion preserves existing findings, later sections, colors and undo', () => {
  const store = new HandoffStore(), patient = make({ body: '[HX]: HTN\n[O]:\nold finding\n\n[A]:\n# problem\n[P]:\n- task {pending}' }); store.patients = [patient]; store.activeId = patient.id;
  store.transaction('插入清理資料', () => insertObjective(patient, 'Lab:\n/K 6.1 [H]/; \\Na 128 [L]\\'));
  assert.match(bodyText(patient), /old finding\n\nLab:\nK 6\.1 \[H\]; Na 128 \[L\]\n\n\[A\]:/);
  assert.deepEqual(patient.lines.find(item => item.text.startsWith('K 6.1')).marks.map(mark => mark.color), ['red', 'green']);
  assert.match(bodyText(patient), /\[P\]:\n- task \{pending\}/); store.undo(); assert.doesNotMatch(bodyText(store.active), /K 6\.1/);
  const missing = make({ body: '[HX]: HTN\n[A]:\n# problem\n[P]:\n- task' }); insertObjective(missing, 'supplied data');
  assert.match(bodyText(missing), /\[HX\]: HTN\n\[O\]:\nsupplied data\n\n\[A\]:/);
});
test('Taiwan date and calendar stepping cross month/year boundaries', () => {
  assert.equal(taiwanDate(new Date('2026-10-17T20:00:00Z')), '2026-10-18'); assert.equal(shiftDate('2026-12-31', 1), '2027-01-01'); assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});
test('handoff tools select separate shared key and prompt; personal key wins without fallback', async () => {
  for (const action of HANDOFF_ACTIONS) for (const personal of [false, true]) {
    let captured;
    const response = await handleApi(request({ action: action.id, notes: 'Synthetic patient source', handoffContext: context, ...(personal ? { apiKey: 'personal-secret' } : {}) }), settings({ fetch: async (_, init) => { captured = init; return success('draft'); } }));
    assert.equal(response.status, 200); assert.equal(captured.headers['x-goog-api-key'], personal ? 'personal-secret' : 'handoff-secret');
    const body = JSON.parse(captured.body); assert.ok(body.system_instruction.parts[0].text.startsWith(prompts[action.id])); assert.ok(body.contents[0].parts[0].text.includes('00001234')); assert.ok(!body.system_instruction.parts[0].text.includes('Synthetic patient source'));
  }
  let calls = 0;
  const unavailable = await handleApi(request({ action: 'handoff_order', notes: 'source', handoffContext: context }), settings({ handoffSharedKey: '', fetch: async () => { calls++; return success('wrong'); } })); assert.equal(unavailable.status, 503); assert.equal(calls, 0);
});
test('invalid handoff context blocks provider calls, including numeric MRN and invalid dates', async () => {
  let calls = 0;
  for (const handoffContext of [undefined, { ...context, instructions: 'override' }, { ...context, patient: { ...context.patient, mrn: 123 } }, { ...context, referenceDate: '2026-02-30' }, { ...context, existingNote: 'x'.repeat(100001) }]) {
    const response = await handleApi(request({ action: 'handoff_clean', notes: 'source', handoffContext }), settings({ fetch: async () => { calls++; return success('wrong'); } })); assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});
test('optional handoff readiness does not change original four-tool readiness or leak keys/prompts', async () => {
  const oldPrompts = Object.fromEntries(ACTIONS.map(a => [a.id, 'old private']));
  const response = await handleApi(new Request('http://localhost/api/status'), settings({ prompts: oldPrompts })); const status = await response.json(); assert.equal(response.status, 200); assert.equal(status.ready, true); assert.equal(status.actions.length, 4); assert.equal(status.handoff.actions.length, 4); assert.ok(status.handoff.actions.filter(a => a.id !== 'handoff_import').every(a => !a.ready)); assert.equal(status.handoff.actions.find(a => a.id === 'handoff_import').ready, true); assert.ok(!JSON.stringify(status).includes('handoff-secret')); assert.ok(!JSON.stringify(status).includes('old private'));
});
