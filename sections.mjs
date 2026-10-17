const SECTION_IDS = {
  'chief complaint': 'chief',
  'present illness': 'illness',
  'assessment / impression': 'assessment',
  'plans': 'plans'
};

// Only top-level admission headings delimit sections; plans retain their subsections.
export function extractAdmissionSections(text) {
  const heading = /^[\t ]*(?:#{1,6}[\t ]+)?(?:\*\*)?\[[\t ]*(Chief complaint|Present illness|Assessment[\t ]*\/[\t ]*Impression|Plans)[\t ]*\](?:\*\*)?[\t ]*[:：]?(?:\*\*)?[\t ]*/gim;
  const matches = [...text.matchAll(heading)];
  const sections = {};
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const id = SECTION_IDS[match[1].toLowerCase().replace(/[\t ]*\/[\t ]*/, ' / ')];
    const rawStart = match.index + match[0].length;
    const rawEnd = matches[i + 1]?.index ?? text.length;
    const raw = text.slice(rawStart, rawEnd);
    const start = rawStart + raw.length - raw.trimStart().length;
    const end = rawEnd - (raw.length - raw.trimEnd().length);
    if (!sections[id]) sections[id] = { text: text.slice(start, Math.max(start, end)), start, end: Math.max(start, end) };
  }
  return sections;
}
