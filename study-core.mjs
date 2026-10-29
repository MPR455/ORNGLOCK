// Anki 2.0/2.1 reader, adapted from CGMHOPH's OPH Study tab.
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function cloze(text, number, answer) {
  return String(text).replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (_match, n, value, hint) => +n === number ? `<span class="cloze">${answer ? value : `[${hint || '…'}]`}</span>` : value);
}

export function renderTemplate(template, fields, front = '', ordinal = 0, answer = false) {
  let html = String(template ?? '');
  // Resolve sections before inserting field HTML; nested sections need multiple passes.
  const sections = /\{\{([#^])([^{}]+)\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\2\}\}/g;
  let previous;
  do {
    previous = html;
    html = html.replace(sections, (_match, kind, field, content) => (Boolean(fields[field.trim()]?.trim()) === (kind === '#')) ? content : '');
  } while (html !== previous);
  html = html.replace(/\{\{([^{}]+)\}\}/g, (_match, expression) => {
    const filters = expression.trim().split(':');
    const name = filters.pop().trim();
    if (name === 'FrontSide') return front;
    let value = fields[name] ?? '';
    for (const filter of filters.reverse()) {
      if (filter === 'cloze') value = cloze(value, ordinal + 1, answer);
      if (filter === 'text') value = value.replace(/<[^>]*>/g, '');
      if (filter === 'type') value = answer ? value : '<span class="type-hint">Think of your answer before revealing.</span>';
    }
    return value;
  });
  return html.replace(/\[sound:([^\]]+)\]/g, (_match, file) => `<audio controls preload="none" data-file="${escapeHTML(file)}"></audio>`);
}

export async function readApkg(buffer, JSZip, SQL) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!entry || zip.file('collection.anki21b')) throw new Error('This deck uses Anki’s newer export format. Re-export it from Anki with “Support older Anki (2.0)” enabled.');
  const db = new SQL.Database(await entry.async('uint8array'));
  let models, decks, notes, rows;
  try {
    const col = db.exec('SELECT models, decks FROM col')[0]?.values[0];
    if (!col) throw new Error('The deck has no collection metadata.');
    models = JSON.parse(col[0]); decks = JSON.parse(col[1] || '{}');
    notes = new Map((db.exec('SELECT id, mid, flds, tags FROM notes')[0]?.values || []).map(([id, model, fields, tags]) => [String(id), { model: String(model), fields: String(fields).split('\x1f'), tags }]));
    rows = db.exec('SELECT id, nid, ord, did FROM cards ORDER BY id')[0]?.values || [];
  } finally { db.close(); }
  const cards = [];
  for (const [id, noteId, ordinal, deckId] of rows) {
    const note = notes.get(String(noteId));
    const model = models[note?.model];
    if (!model) continue;
    const template = model.tmpls[model.type === 1 ? 0 : ordinal];
    if (!template) continue;
    const deck = decks[String(deckId)]?.name || 'Default';
    const fields = Object.fromEntries((model.flds || []).map(field => [field.name, note.fields[field.ord] || '']));
    Object.assign(fields, { Deck: deck, Subdeck: deck.split('::').at(-1), Tags: note.tags || '', Type: model.name, Card: template.name });
    const front = renderTemplate(template.qfmt, fields, '', ordinal);
    cards.push({ id: String(id), deck, model: model.name, css: model.css || '', front, back: renderTemplate(template.afmt, fields, front, ordinal, true) });
  }
  if (!cards.length) throw new Error('No readable cards were found in this deck.');
  const mediaEntry = zip.file('media');
  const media = new Map(Object.entries(mediaEntry ? JSON.parse(await mediaEntry.async('string')) : {}).map(([key, filename]) => [filename, key]));
  return { zip, cards, media, categories: [...new Set(cards.map(card => card.deck))].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })) };
}

export function cardOrder(cards, { category = '', query = '', shuffle = false, random = Math.random } = {}) {
  const needle = query.normalize('NFKC').toLowerCase().trim();
  const order = cards.map((_card, i) => i).filter(i => {
    const card = cards[i];
    return (!category || card.deck === category || card.deck.startsWith(`${category}::`)) && (!needle || (card.searchText ?? `${card.front} ${card.back} ${card.deck}`).normalize('NFKC').toLowerCase().includes(needle));
  });
  if (shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
}
