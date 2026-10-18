export const ACTIONS = Object.freeze([
  { id: 'admission', title: 'Admission note', command: 'Write admission:', file: '01_MASTER_PROMPT_WRITE_ADMISSION_NOTE.txt' },
  { id: 'consult', title: 'Consult request', command: 'Write consult:', file: '02_MASTER_PROMPT_WRITE_CONSULT_REQUEST.txt' },
  { id: 'summary', title: 'Treatment / weekly summary', command: 'Write treatment summary:', file: '03_MASTER_PROMPT_TREATMENT_SUMMARY_WEEKLY_SUMMARY.txt' },
  { id: 'support', title: 'Current treatment & devices', command: 'What are the currently documented antibiotics, oxygen support, NG, Foley, IV/vascular access, and other lines, drains, and devices?', file: '04_MASTER_PROMPT_CURRENT_ANTIBIOTICS_OXYGEN_LINES_TUBES.txt' }
]);

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const HANDOFF_ACTIONS = Object.freeze([
  { id: 'handoff_convert', title: 'Handoff note convert', command: 'Convert this patient source into the canonical handoff note:', file: '05_MASTER_PROMPT_HANDOFF_NOTE_CONVERT.txt' },
  { id: 'handoff_clean', title: 'Handoff data cleaning', command: 'Organize and clean this patient data:', file: '06_MASTER_PROMPT_HANDOFF_DATA_CLEANING.txt' },
  { id: 'handoff_order', title: 'Handoff order review', command: 'Extract current IV, oxygen, and medication orders with history:', file: '07_MASTER_PROMPT_HANDOFF_ORDER_REVIEW.txt' }
]);
export const MAX_NOTE_CHARS = 100_000;
export const MAX_BODY_BYTES = 650_000;
