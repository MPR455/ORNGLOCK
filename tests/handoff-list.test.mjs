import test from 'node:test';
import assert from 'node:assert/strict';
import { createPatient, exportPatients, DIVIDER, HEADINGS, bodyText, HandoffStore } from '../handoff-model.mjs';
import { parseAIList, reconcile, applyPlans } from '../handoff-import.mjs';
import { handleApi, createMemoryGuard } from '../server/api.mjs';
import { startLocal } from '../server/local.mjs';
import { ACTIONS } from '../server/actions.mjs';

const patients = [
  createPatient({ bed: 'LO601', mrn: '00001234', name: '示範甲', age: '71', sex: '男', codeStatus: 'DNR2', quickRemark: '! call team', body: '[HX]:\nHTN\n\n[CC]:\nfever\n\n[O]:\n10/18 Cr 1.2 mg/dL\n\n[A]:\nr/o sepsis\n\n[P]:\n- culture {pending}\n\n[Medication]\nDrug A stopped 10/17' }),
  createPatient({ bed: 'L13A1322B', mrn: '00005678', name: '示範乙', age: '', body: HEADINGS.join('\n\n') })
];
const converted = exportPatients(patients);
const source = 'LO601 00001234 示範甲 71 男 DNR2 ! call team; HTN; fever; 10/18 Cr 1.2 mg/dL; r/o sepsis; culture {pending}; Drug A stopped 10/17\nL13A1322B 00005678 示範乙';
const request = (extra = {}) => new Request('http://localhost/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'handoff_import', notes: source, ...extra }) });
const success = (text = converted, finishReason = 'STOP') => Response.json({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const options = extra => ({ prompts: {}, sharedKey: 'original-key', handoffSharedKey: 'handoff-key', guard: createMemoryGuard({ perMinute: 100 }), fetch: async () => success(), ...extra });

test('AI conversion accepts exact downloaded format for multiple patients and preserves clinical qualifiers', () => {
  const parsed = parseAIList('\uFEFF' + converted.replace(/\n/g, '\r\n'), source);
  assert.equal(parsed.patients.length, 2); assert.equal(parsed.aiConverted, true);
  assert.equal(exportPatients(parsed.patients), converted);
  assert.equal(parsed.patients[0].mrn, '00001234'); assert.equal(parsed.patients[1].bed, 'L13A1322B');
  assert.equal(parsed.patients[1].age, ''); assert.match(bodyText(parsed.patients[0]), /r\/o sepsis/);
  assert.match(bodyText(parsed.patients[0]), /Drug A stopped 10\/17/);
});

test('AI import repairs fenced, incomplete, repeated and disordered sections without rejecting the draft', () => {
  for (const text of ['```text\n' + converted + '```', converted.replace('[CC]:', '[Subjective]:'), converted.replace('[CC]:', '[O]:'), converted.replace('[HX]:', '[CC]:').replace('[CC]:\nfever', '[HX]:\nfever')]) {
    const parsed = parseAIList(text, source);
    assert.equal(parsed.patients.length, 2);
    assert.match(bodyText(parsed.patients[0]), /HTN/); assert.match(bodyText(parsed.patients[0]), /fever/);
    assert.deepEqual(bodyText(parsed.patients[0]).split('\n').filter(row => HEADINGS.includes(row)), HEADINGS);
  }
  assert.throws(() => parseAIList(''), /沒有/);
  assert.throws(() => parseAIList(Array.from({ length: 1001 }, () => exportPatients([patients[1]])).join('\n')), /1,000/);
});

test('identity differences and missing identities are review notes, not import blockers', () => {
  for (const text of [converted.replace('00001234', '1234'), converted.replace('示範甲', '另一個人'), converted.replace('LO601 00001234 示範甲 71 男 DNR2', '床號待補 病歷號待補 姓名待補 年齡待補')]) {
    const parsed = parseAIList(text, source); assert.equal(parsed.patients.length, 2); assert.ok(parsed.warnings.length);
    const store = new HandoffStore(); applyPlans(store, reconcile([], parsed.patients)); assert.equal(store.patients.length, 2);
    assert.match(bodyText(store.patients[0]), /fever/);
  }
});

test('messy roster accepts bracketed identities, compact age/sex, bed suffixes, empty beds and mixed section labels', () => {
  const messy = '30E\n================================\n30F\n==================================\n329 00000001 示範甲 64F DNR1 **Hb**\nPhx: HTN\nCC: supplied symptom\nO:\nHb 8.2->7.4**\nA:\n# source assessment\nPlan:\n- stopped Drug A\n# lab ___\n=========================\n331\n=========================\n501+ 【00000002 示範乙 52 歲 男】\nHX: supplied history\nA:\n1. Acute source diagnosis, score 91\n2. Another source problem\nP:\n# echo on call';
  const parsed = parseAIList(messy, messy); assert.equal(parsed.patients.length, 2);
  assert.equal(parsed.patients[0].age, '64'); assert.equal(parsed.patients[0].sex, 'F');
  assert.equal(parsed.patients[0].codeStatus, 'DNR1'); assert.equal(parsed.patients[0].quickRemark, 'Hb');
  assert.equal(parsed.patients[1].bed, '501+'); assert.equal(parsed.patients[1].sex, '男');
  assert.match(bodyText(parsed.patients[0]), /Hb 8.2->7.4\*\*/); assert.match(bodyText(parsed.patients[0]), /# lab ___/);
  assert.match(bodyText(parsed.patients[1]), /1\. Acute source diagnosis, score 91/);
  assert.ok(parsed.warnings.some(value => value.includes('3 個')));
});

test('missing ages, headerless fragments and notes without dividers remain importable without combining patients', () => {
  const withoutDividers = 'LO601 00001234 示範甲 71\nHX: HTN\nLO602 00005678 示範乙\nPlan: review ___';
  const parsed = parseAIList(withoutDividers); assert.equal(parsed.patients.length, 2);
  assert.equal(parsed.patients[1].age, ''); assert.equal(parsed.patients[1].name, '示範乙');
  const fragment = parseAIList('O: original finding\nPlan: original task ___');
  assert.equal(fragment.patients[0].mrn, ''); assert.equal(fragment.patients[0].name, '');
  assert.match(bodyText(fragment.patients[0]), /original finding/); assert.match(bodyText(fragment.patients[0]), /original task ___/);
  const store = new HandoffStore(); applyPlans(store, reconcile([], fragment.patients)); assert.equal(store.patients.length, 1);
});

test('AI conversion allows a missing MRN or missing name when the other identity is documented', () => {
  for (const data of [{ name: '示範甲', mrn: '' }, { name: '', mrn: '00001234' }]) {
    const parsed = parseAIList(exportPatients([createPatient(data)]), source);
    assert.equal(parsed.patients.length, 1); assert.equal(parsed.patients[0].mrn, data.mrn);
  }
});

test('whole-list action works without a selected patient using the handoff key and a backend-only prompt', async () => {
  for (const apiKey of [undefined, 'personal-key']) {
    let captured;
    const response = await handleApi(request({ ...(apiKey ? { apiKey } : {}) }), options({ fetch: async (_, init) => { captured = init; return success(); } }));
    assert.equal(response.status, 200); assert.equal(captured.headers['x-goog-api-key'], apiKey || 'handoff-key');
    const payload = JSON.parse(captured.body), system = payload.system_instruction.parts[0].text, user = payload.contents[0].parts[0].text;
    assert.equal(payload.generationConfig.maxOutputTokens, 32768);
    assert.ok(system.includes('best-effort whole-list import')); assert.ok(system.includes('A patient with only a bed number plus clinical notes is still a valid entry'));
    assert.ok(system.includes(DIVIDER)); assert.ok(system.includes('Never interpret a bed number as an MRN'));
    assert.ok(!system.includes(source)); assert.ok(user.includes(source)); assert.ok(!user.includes('application_context'));
    const result = await response.json(); assert.equal(result.text, converted.trim()); assert.equal(result.action, 'handoff_import');
    assert.ok(!JSON.stringify(result).includes('handoff-key')); assert.ok(!JSON.stringify(result).includes('Never interpret'));
  }
});

test('provider drafts remain editable and importable despite imperfect formatting or truncation', async () => {
  for (const [text, finish] of [[converted.replace('[P]:', '[Missing]:'), 'STOP'], [converted, 'MAX_TOKENS'], ['O: unassigned source detail', 'STOP']]) {
    const response = await handleApi(request(), options({ fetch: async () => success(text, finish) }));
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.text, text.trim());
    assert.ok(parseAIList(result.text).patients.length > 0);
    if (finish === 'MAX_TOKENS') assert.ok(result.warnings[0].includes('長度上限'));
  }
});

test('list conversion uses existing shared quota, personal fallback, input limits and provider errors', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return success(); };
  const absent = await handleApi(request(), options({ handoffSharedKey: '', fetch })); assert.equal(absent.status, 503); assert.equal(calls, 0);
  const tooLarge = await handleApi(request({ notes: 'x'.repeat(100001) }), options({ fetch })); assert.equal(tooLarge.status, 413); assert.equal(calls, 0);
  const empty = await handleApi(request({ notes: '' }), options({ fetch })); assert.equal(empty.status, 400); assert.equal(calls, 0);
  const settings = options({ guard: createMemoryGuard({ daily: 1, perMinute: 100 }), fetch });
  assert.equal((await handleApi(request(), settings)).status, 200);
  const exhausted = await handleApi(request(), settings); assert.equal(exhausted.status, 429); assert.equal((await exhausted.json()).error.canUseOwnKey, true);
  assert.equal((await handleApi(request({ apiKey: 'personal-key' }), settings)).status, 200);
  const failed = await handleApi(request(), options({ fetch: async () => new Response('private provider data', { status: 403 }) }));
  const result = await failed.json(); assert.equal(result.error.canUseOwnKey, true); assert.ok(!JSON.stringify(result).includes('private provider data'));
});

test('converted lists enter the existing reconciliation flow without replacing notes until chosen, and undo restores all data', () => {
  const store = new HandoffStore(), existing = createPatient({ ...patients[0], body: '[P]:\n- retain existing plan', lines: undefined }), absent = createPatient({ name: '留在名單', mrn: '00009999' });
  store.patients = [existing, absent]; store.activeId = existing.id;
  const parsed = parseAIList(converted, source), plans = reconcile(store.patients, parsed.patients);
  assert.equal(plans[0].differentNote, true); applyPlans(store, plans);
  assert.match(bodyText(store.patients[0]), /retain existing plan/); assert.equal(store.patients.length, 3);
  store.undo(); assert.equal(store.patients.length, 2);
  plans[0].replaceNote = true; applyPlans(store, plans); assert.match(bodyText(store.patients[0]), /culture \{pending\}/);
  store.undo(); assert.match(bodyText(store.patients[0]), /retain existing plan/); assert.equal(store.patients[1].id, absent.id);
});

test('real local HTTP route handles a whole-list conversion without private prompt files', async t => {
  const prompts = Object.fromEntries(ACTIONS.map(action => [action.id, 'synthetic test prompt']));
  const server = await startLocal({ port: 0, handoffSharedKey: 'handoff-key', prompts, fetch: async () => success() });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'handoff_import', notes: source }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).text, converted.trim());
  assert.equal((await fetch(origin + '/server/handoff-list.mjs')).status, 404);
});
