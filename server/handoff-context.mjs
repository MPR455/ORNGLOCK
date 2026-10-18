// Bounded context is rebuilt from a strict schema; pasted source cannot add fields.
export function validateHandoffContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid context');
  const allowed = ['patient', 'referenceDate', 'timezone', 'sourceAsOf', 'operation', 'existingNote'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Unknown context field');
  if (!input.patient || typeof input.patient !== 'object' || Array.isArray(input.patient)) throw new Error('Missing patient');
  const patient = {};
  const patientFields = ['id', 'bed', 'mrn', 'name', 'age', 'sex', 'codeStatus', 'quickRemark'];
  if (Object.keys(input.patient).some(key => !patientFields.includes(key))) throw new Error('Unknown patient field');
  for (const field of patientFields) {
    const value = input.patient[field] ?? '';
    if (typeof value !== 'string' || value.length > (field === 'quickRemark' ? 1000 : 200) || /[\x00-\x1f]/.test(value)) throw new Error('Invalid patient field');
    patient[field] = value;
  }
  if (!patient.id || (!patient.name && !patient.mrn)) throw new Error('Missing identity');
  if (!['create', 'revise'].includes(input.operation)) throw new Error('Invalid operation');
  if (input.timezone !== 'Asia/Taipei') throw new Error('Invalid timezone');
  if (typeof input.referenceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate) || Number.isNaN(Date.parse(input.referenceDate)) || new Date(input.referenceDate).toISOString().slice(0, 10) !== input.referenceDate) throw new Error('Invalid reference date');
  const sourceAsOf = input.sourceAsOf ?? '';
  if (typeof sourceAsOf !== 'string' || sourceAsOf.length > 60 || (sourceAsOf && Number.isNaN(Date.parse(sourceAsOf)))) throw new Error('Invalid source date');
  const existingNote = input.existingNote;
  if (existingNote !== undefined && (typeof existingNote !== 'string' || existingNote.length > 100000)) throw new Error('Invalid existing note');
  return { patient, referenceDate: input.referenceDate, timezone: input.timezone, sourceAsOf, operation: input.operation, ...(existingNote !== undefined ? { existingNote } : {}) };
}
