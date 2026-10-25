// Cross-checks 💊 orders against formulary.json: every drug named in an order must be in
// the formulary, and every formulary drug must be used by at least one order.
import { readFile } from 'node:fs/promises';

const FORMULARY = new URL('./formulary.json', import.meta.url);

// Latin words that appear in orders but are not drug names (units, routes, dosing, blood products).
const NOT_DRUGS = new Set(`
amp vial vials bag bot tab cap pack kit supp patch cream gel oint oph gtt neb puff puffs spray nasal soln solution
susp powder liquid enema MDI UDV premix tts eff tube free granules lotion epi paste gargle viscous
line run stress test TWOC Sliding scale ICU A-line keep open lock EGD q72h
mg mcg mmol mEq kg max min hr day Day per IU
IV IM SC PO NG BID TID QID QD QAM HS PRN NPO q10 q10min q12h q15min q1h q20 q20min q24h q2h q4h q5min q6h q8h
bolus infusion loading slow push flush over spacer challenge front overdrive pacing cardioversion Cold
CIWA CrCl AUC ECG INR aPTT SBP Hct TDD TBSA GPC GNB NSAID PPI SMZ TMP
pRBC FFP Platelet Cryoprecipitate Fibrinogen transfusion RBC
acid sodium Sodium chloride gluconate phosphate Phosphate carbonate acetate sulfate oxide bicarbonate
human Human immune globulin immunoglobulin vaccine toxoid Diphtheria Tetanus Rabies polyvalent Antivenin antidote Cyanide
beta blocker basal oral Neutral Fortified Intravitreal complex Vitamin Iron Ferrous Magnesium Potassium Calcium Glucose Dextrose
Zydis Zyprexa Avelox Harnalidge Herbesser Alphagan Actilyse Praxbind Lokelma Kalimate Recormon Insulatard Lantus NovoRapid
E275 H75 R150 Z400 earth blue enoxaparin heparin glucagon insulin Insulin sulfonate sucrose
`.trim().split(/\s+/).map(w => w.toLowerCase()));

export async function loadFormulary() {
  const f = JSON.parse(await readFile(FORMULARY, 'utf8'));
  return f.groups.flatMap(g => g.drugs.map(([name, forms, match]) => ({
    name, forms, group: g.group,
    re: new RegExp(match || name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
  })));
}

// Unknown names are only looked for in 💊 orders; any order type counts as using a drug
// (fluorescein is an exam, for example). Longer names go first so "Hydrocortisone cream"
// is not swallowed by "Hydrocortisone".
export function checkFormulary(chapters, drugs) {
  const used = new Set();
  const unknown = [];
  const byLength = [...drugs].sort((a, b) => b.name.length - a.name.length);
  for (const c of chapters) for (const it of c.items) for (const o of it.orders) {
    let rest = o[1];
    for (const d of byLength) {
      d.re.lastIndex = 0;
      if (d.re.test(rest)) { used.add(d.name); d.re.lastIndex = 0; rest = rest.replace(d.re, ' '); }
    }
    if (o[0] === 'm') for (const w of rest.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || []) {
      if (!NOT_DRUGS.has(w.toLowerCase())) unknown.push(`${c.slug} › ${it.name} › ${w}`);
    }
  }
  const unused = drugs.filter(d => !used.has(d.name)).map(d => d.name);
  return { unknown, unused };
}
