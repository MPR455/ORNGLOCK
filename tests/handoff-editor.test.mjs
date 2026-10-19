import test from 'node:test';
import assert from 'node:assert/strict';
import { HandoffEditor, readEditableCells } from '../handoff-editor.mjs';
import { linesFromCells, createPatient, blocksOf, moveBlock, bodyText } from '../handoff-model.mjs';

const text = data => ({ nodeType: 3, data });
const element = (tagName, ...childNodes) => ({ nodeType: 1, tagName, dataset: {}, childNodes: childNodes.map(node => typeof node === 'string' ? text(node) : node) });
const br = () => element('BR');
const read = host => readEditableCells(host).map(cell => cell.char).join('');

test('browser paragraph fillers do not add a blank line to every note section', () => {
  const rows = ['[HX]: HTN', '[CC]: supplied symptom', '[O]:', 'finding', '[A]:', '# problem', '[P]:', '- original plan', '- ', '[Medication]', '- listed drug'];
  const host = element('DIV', ...rows.map(row => element('DIV', row, br())));
  assert.equal(read(host), rows.join('\n'));
  assert.deepEqual(linesFromCells(readEditableCells(host)).map(row => row.text), rows);
});

test('DOM fallback retains intentional empty paragraphs and repeated blank lines', () => {
  const host = element('DIV', element('DIV', '[HX]:', br()), element('DIV', br()), element('DIV', br()), element('P', '[CC]:', br()), element('DIV', br()));
  assert.equal(read(host), '[HX]:\n\n\n[CC]:\n');
  const nested = element('DIV', element('DIV', element('DIV', '- task', br()), element('DIV', br()), element('DIV', '# next', br())));
  assert.equal(read(nested), '- task\n\n# next');
});

test('DOM fallback preserves inline breaks, UTF-16 highlight ranges, and typed whitespace', () => {
  const mark = element('MARK', '高😀'); mark.dataset.color = 'red';
  const host = element('DIV', element('DIV', '[O]:', br()), element('DIV', '  ', mark, br(), 'next', br()), element('DIV', '- ', br()));
  const lines = linesFromCells(readEditableCells(host));
  assert.equal(lines.map(row => row.text).join('\n'), '[O]:\n  高😀\nnext\n- ');
  assert.deepEqual(lines[1].marks, [{ start: 2, end: 5, color: 'red' }]);
  assert.equal(read(element('DIV', 'first', br(), element('SPAN', 'second'), br(), br())), 'first\nsecond\n');
  assert.equal(read(element('DIV', 'first', br(), element('DIV', 'second', br()))), 'first\nsecond');
});

function dragFixture(dragged = 2) {
  const patient = createPatient({ body: '[A]:\n# first /highlight/\n  first continuation\n# second {pending}\n  second continuation\n[P]:\n- third\n  third continuation' });
  const blocks = blocksOf(patient);
  const rows = patient.lines.map((line, index) => ({ dataset: { lineId: line.id }, getBoundingClientRect: () => ({ top: 100 + index * 24, bottom: 124 + index * 24 }) }));
  const handles = blocks.map(block => ({ dataset: { blockId: block.id }, getBoundingClientRect: rows[block.start].getBoundingClientRect }));
  const host = { dataset: { patientId: patient.id }, children: rows };
  const wrap = { querySelector: () => host }, gutter = { querySelectorAll: () => handles };
  const editor = { drag: { patientId: patient.id, blockId: blocks[dragged].id }, patient: () => patient };
  const position = ({ handle, row, y }) => HandoffEditor.prototype.dropPosition.call(editor, {
    clientY: y,
    target: { closest: selector => ({ '.handoff-body-wrap': wrap, '.handoff-gutter': row === undefined ? gutter : null, '[data-block-id]': handles[handle], '[data-line-id]': rows[row] })[selector] || null }
  });
  return { patient, blocks, rows, handles, host, position };
}

test('dropping a handle above another handle moves its complete block before the target', () => {
  const f = dragFixture();
  const target = f.position({ handle: 0, y: f.handles[0].getBoundingClientRect().top + 2 });
  assert.equal(target.index, f.blocks[0].start); assert.equal(target.after, false);
  assert.equal(target.handle, f.handles[0]);
  moveBlock(f.patient, f.blocks[2].id, target.index);
  assert.match(bodyText(f.patient), /^\[A\]:\n- third\n  third continuation\n# first highlight/);
  assert.match(bodyText(f.patient), /# second \{pending\}\n  second continuation/);
  assert.equal(f.patient.lines.find(line => line.id === f.blocks[0].id).marks[0].color, 'red');
});

test('dropping below a handle uses the end of its block, preserving continuation lines and marks', () => {
  const f = dragFixture(0), target = f.position({ handle: 2, y: f.handles[2].getBoundingClientRect().bottom - 2 });
  assert.equal(target.index, f.blocks[2].end); assert.equal(target.after, true);
  moveBlock(f.patient, f.blocks[0].id, target.index);
  assert.ok(bodyText(f.patient).endsWith('- third\n  third continuation\n# first highlight\n  first continuation'));
  assert.equal(f.patient.lines.find(line => line.id === f.blocks[0].id).marks[0].color, 'red');
});

test('empty gutter space accepts drops without requiring a text row', () => {
  const f = dragFixture();
  const target = f.position({ y: f.handles[1].getBoundingClientRect().top - 4 });
  assert.equal(target.index, f.blocks[1].start); assert.equal(target.handle, f.handles[1]);
  const down = dragFixture(0), end = down.position({ y: down.handles[2].getBoundingClientRect().bottom + 40 });
  assert.equal(end.index, down.blocks[2].end); assert.equal(end.after, true);
});

test('handle targets cannot move into another patient or split the dragged block', () => {
  const f = dragFixture();
  assert.equal(f.position({ handle: 2, y: f.handles[2].getBoundingClientRect().top }), null);
  f.host.dataset.patientId = 'other-patient';
  assert.equal(f.position({ handle: 0, y: f.handles[0].getBoundingClientRect().top }), null);
  const textTarget = dragFixture(0).position({ row: 4, y: 215 });
  assert.equal(textTarget.index, 5); assert.equal(textTarget.after, true);
});
