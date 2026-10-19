import test from 'node:test';
import assert from 'node:assert/strict';
import { readEditableCells } from '../handoff-editor.mjs';
import { linesFromCells } from '../handoff-model.mjs';

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
