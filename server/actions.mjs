export const ACTIONS = Object.freeze([
  { id: 'admission', title: 'Admission note', command: 'Write admission:', file: '01_MASTER_PROMPT_WRITE_ADMISSION_NOTE.txt' },
  { id: 'consult', title: 'Consult request', command: 'Write consult:', file: '02_MASTER_PROMPT_WRITE_CONSULT_REQUEST.txt' },
  { id: 'summary', title: 'Treatment / weekly summary', command: 'Write treatment summary:', file: '03_MASTER_PROMPT_TREATMENT_SUMMARY_WEEKLY_SUMMARY.txt' },
  { id: 'support', title: 'Current treatment & devices', command: 'What are the currently documented antibiotics, oxygen support, NG, Foley, IV/vascular access, and other lines, drains, and devices?', file: '04_MASTER_PROMPT_CURRENT_ANTIBIOTICS_OXYGEN_LINES_TUBES.txt' }
]);

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const MAX_NOTE_CHARS = 100_000;
export const MAX_BODY_BYTES = 650_000;
