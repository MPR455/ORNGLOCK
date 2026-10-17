import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAdmissionSections } from '../sections.mjs';

test('copies each body and retains plan subsections and literal list markers', () => {
  const text = '[Chief complaint]:\nFirst\n\n[Present illness]:\nSecond\n\n[Assessment / Impression]:\n#. Third\n\n[Plans]:\n[Diagnostic]\nFourth\n[Therapeutic]\nFifth';
  const sections = extractAdmissionSections(text);
  assert.equal(sections.chief.text, 'First');
  assert.equal(sections.illness.text, 'Second');
  assert.equal(sections.assessment.text, '#. Third');
  assert.equal(sections.plans.text, '[Diagnostic]\nFourth\n[Therapeutic]\nFifth');
  for (const section of Object.values(sections)) assert.equal(text.slice(section.start, section.end), section.text);
});

test('accepts Markdown headings, inline bodies, casing and Windows line endings', () => {
  const text = '## **[Chief complaint]:** One\r\n**[PRESENT ILLNESS]**:\r\nTwo\r\n[Assessment/Impression]：Three\r\n[Plans]: Four';
  const sections = extractAdmissionSections(text);
  assert.deepEqual(Object.values(sections).map(section => section.text), ['One', 'Two', 'Three', 'Four']);
});

test('missing or empty sections stay empty and extraction follows edits', () => {
  assert.deepEqual(extractAdmissionSections('Unstructured text'), {});
  const text = '[Chief complaint]:\n[Present illness]:\nChanged';
  const sections = extractAdmissionSections(text);
  assert.equal(sections.chief.text, '');
  assert.equal(sections.chief.start, sections.chief.end);
  assert.equal(sections.illness.text, 'Changed');
  assert.equal(sections.plans, undefined);
  assert.equal(extractAdmissionSections(text.replace('Changed', 'Updated')).illness.text, 'Updated');
});
