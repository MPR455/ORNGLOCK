import { escapeHTML as esc, readApkg, cardOrder } from './study-core.mjs';
import { createCardFrame } from './study-frame.mjs';
import { initStudyImages } from './study-images.mjs';

const STORE = 'ornglock_study_v1';
const PAGE = 60;
const textOf = html => new DOMParser().parseFromString(html.replace(/<(?:br\b[^>]*|\/(?:p|div|li|h[1-6]|tr))>/gi, ' '), 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
const sizeOf = bytes => `${(bytes / 1048576).toFixed(1)} MB`;
function saved() { try { const value = JSON.parse(localStorage.getItem(STORE)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
function save(update) { try { localStorage.setItem(STORE, JSON.stringify({ ...saved(), ...update })); } catch {} }
let libraries;
async function readerLibraries() {
  if (!libraries) libraries = (async () => {
    const script = filename => new Promise((resolve, reject) => {
      const element = document.createElement('script'); element.src = new URL(`vendor/study/${filename}`, import.meta.url).href;
      element.onload = resolve; element.onerror = () => { element.remove(); reject(new Error('The deck reader could not load. Check the connection and try again.')); }; document.head.append(element);
    });
    await Promise.all([window.JSZip ? null : script('jszip.min.js'), window.initSqlJs ? null : script('sql-wasm.js')]);
    return { JSZip: window.JSZip, SQL: await window.initSqlJs({ locateFile: filename => new URL(`vendor/study/${filename}`, import.meta.url).href }) };
  })().catch(error => { libraries = null; throw error; });
  return libraries;
}

export function initStudy({ toast = () => {} } = {}) {
  const root = document.getElementById('tab-study');
  root.innerHTML = `
    <div class="study-library">
      <div class="study-heading"><div><h1 id="study-title">📚 Study</h1><p>Pick a book. Load a deck. Keep learning.</p></div><button type="button" class="study-btn" data-study="refresh">↻ Refresh books</button></div>
      <div class="study-books" id="study-books" role="group" aria-label="Books"><p class="study-hint">Loading books…</p></div>
      <div class="study-deck-controls"><label class="study-deck-label" for="study-deck">Deck<select id="study-deck" disabled><option>Choose a book</option></select></label><button class="study-btn study-primary" type="button" data-study="load" disabled>↓ Load deck</button><button class="study-btn" type="button" data-study="open">＋ Open .apkg</button><input id="study-file" type="file" accept=".apkg" hidden></div>
      <p class="study-status" id="study-status" role="status" aria-live="polite">Decks load only when you select Load deck. You can also open an APKG from your computer.</p>
    </div>
    <div class="study-welcome" id="study-welcome"><span aria-hidden="true">🃏</span><h2>Your next study session starts here.</h2><p>Choose a book above, then load one of its decks.</p><p class="study-hint">Questions, answers, explanations, and images — together in one place.</p></div>
    <div class="study-session" id="study-session" hidden>
      <div class="study-filters"><label for="study-category">Category<select id="study-category"></select></label><label class="study-search-label" for="study-search">Search cards<input type="search" id="study-search" placeholder="Question, answer, or keyword…" autocomplete="off"></label><label class="study-shuffle"><input type="checkbox" id="study-shuffle">Shuffle</label></div>
      <div class="study-workspace">
        <div class="study-viewer-head"><div><span class="study-eyebrow" id="study-loaded-book"></span><h2 id="study-loaded-name"></h2><p id="study-count" aria-live="polite"></p></div><button class="study-btn" data-study="focus" type="button" aria-pressed="false">⛶ Focus / fullscreen</button></div>
        <progress id="study-progress" value="0" max="1" aria-label="Position in deck"></progress>
        <div class="study-card"><p class="study-card-state" id="study-card-state" hidden>No cards match. Try another category or search.</p><iframe id="study-frame" title="Study card" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
        <div class="study-answer-bar"><button class="study-btn" data-study="prev" type="button" aria-label="Previous card">← Prev</button><button class="study-btn study-primary" data-study="reveal" type="button">Show answer</button><button class="study-btn" data-study="next" type="button" aria-label="Next card">Next →</button></div>
        <div class="study-foot"><span><kbd>A</kbd> / ← prev · <kbd>S</kbd> / Space answer · <kbd>D</kbd> / → next · <kbd>F</kbd> focus</span><label for="study-jump">Go to <input id="study-jump" type="number" min="1" inputmode="numeric" aria-label="Go to card number"><button class="study-btn" type="button" data-study="jump">Go</button></label></div>
      </div>
      <section class="study-explorer" aria-labelledby="study-browse-title"><div class="study-explorer-head"><h2 id="study-browse-title">Browse cards</h2><div class="study-view-switch" role="group" aria-label="Browse layout"><button class="study-btn" type="button" data-study="cards" aria-pressed="true">▦ Cards</button><button class="study-btn" type="button" data-study="list" aria-pressed="false">☰ List</button></div></div><div id="study-browse" class="study-browse"></div><div class="study-pages"><button class="study-btn" type="button" data-study="page-prev">← Previous page</button><span id="study-page-count"></span><button class="study-btn" type="button" data-study="page-next">Next page →</button></div></section>
    </div>
    <dialog class="study-image-dialog" aria-label="Image viewer"><div class="study-image-head"><span>Image viewer</span><div><button type="button" class="study-btn" data-image="out" aria-label="Zoom out">−</button><output aria-live="polite">100%</output><button type="button" class="study-btn" data-image="in" aria-label="Zoom in">＋</button><button type="button" class="study-btn" data-image="fit">Fit</button><button type="button" class="study-btn" data-image="close" aria-label="Close image viewer">✕</button></div></div><div class="study-image-stage"><img alt="Deck image" draggable="false"></div><p>Scroll or pinch to zoom · Drag to pan · Double-click to zoom / reset · Esc to close</p></dialog>`;
  const $ = id => root.querySelector(`#study-${id}`);
  const button = action => root.querySelector(`[data-study="${action}"]`);
  let catalog, book, collection, loadedId = '', order = [], position = 0, answer = false, layout = 'cards', page = 0, busy = false, focusMode = false, focusedNatively = false, loading, requestId = 0, refreshId = 0, searchTimer;
  const openImage = initStudyImages(root.querySelector('dialog'));
  const frame = createCardFrame($('frame'), { onImage: openImage, onKey: keydown });
  const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('study-error', error); };
  const selectedDeck = () => book?.decks.find(deck => deck.id === $('deck').value);
  function updateButtons() {
    for (const action of ['load', 'open', 'refresh']) button(action).disabled = busy || (action === 'load' && !selectedDeck());
    $('deck').disabled = busy || !book?.decks.length;
    root.querySelectorAll('[data-book]').forEach(item => { item.disabled = busy; });
    $('session').inert = busy;
  }
  function selectBook(id, preferredDeck) {
    book = catalog?.books.find(item => item.id === id) || catalog?.books[0];
    $('books').innerHTML = (catalog?.books || []).map(item => `<button class="study-book${item.id === book?.id ? ' selected' : ''}" data-book="${esc(item.id)}" type="button" aria-pressed="${item.id === book?.id}"><span class="study-book-icon" aria-hidden="true">📖</span><span class="study-book-name">${esc(item.name)}</span><span class="study-book-count">${item.decks.length} ${item.decks.length === 1 ? 'deck' : 'decks'}</span></button>`).join('');
    $('deck').innerHTML = book?.decks.map(deck => `<option value="${esc(deck.id)}">${esc(deck.name)} · ${sizeOf(deck.bytes)}</option>`).join('') || '<option value="">No decks available</option>';
    if (book?.decks.some(deck => deck.id === preferredDeck)) $('deck').value = preferredDeck;
    if (book) save({ book: book.id, deck: $('deck').value });
    updateButtons();
  }
  async function refresh(force = false) {
    if (catalog && !force) return;
    const current = ++refreshId;
    const oldBook = book?.id || saved().book, oldDeck = $('deck').value || saved().deck;
    button('refresh').disabled = true;
    try {
      const response = await fetch(new URL('decks/catalog.json', import.meta.url), { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not load the book library. Use Refresh books to try again, or open a local .apkg.');
      const result = await response.json();
      if (!Array.isArray(result.books)) throw new Error('The book library is unreadable. Rebuild the site and try again.');
      if (current !== refreshId) return;
      catalog = result; selectBook(oldBook, oldDeck);
      if (!catalog.books.length) { $('books').innerHTML = '<p class="study-hint">No books yet. Add a folder containing .apkg files inside decks/ and rebuild the site.</p>'; status('No bundled decks found. You can still open a local .apkg.'); }
      else if (force) status(`${catalog.books.length} books · ${catalog.books.reduce((n, item) => n + item.decks.length, 0)} decks available. Select a deck to load.`);
    } catch (error) { if (current === refreshId) { status(error.message, true); if (!catalog) $('books').innerHTML = '<p class="study-hint">The library is unavailable. Try Refresh books, or open a local APKG.</p>'; } }
    finally { if (current === refreshId) updateButtons(); }
  }
  function remember() {
    if (!loadedId || !order.length) return;
    const previous = saved().progress;
    const progress = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
    progress[loadedId] = { card: collection.cards[order[position]].id, category: $('category').value, shuffle: $('shuffle').checked };
    save({ progress });
  }
  async function load(file) {
    if (busy) return;
    const deck = file ? null : selectedDeck();
    if (!file && !deck) return;
    const current = ++requestId;
    loading?.abort(); loading = new AbortController();
    busy = true; updateButtons(); root.setAttribute('aria-busy', 'true');
    status(`Loading ${file?.name || deck.name}${deck ? ` (${sizeOf(deck.bytes)})` : ''}…`);
    try {
      const libs = await readerLibraries();
      let buffer;
      if (file) buffer = await file.arrayBuffer();
      else {
        const url = new URL(deck.file, import.meta.url); url.searchParams.set('v', deck.revision);
        const response = await fetch(url, { signal: loading.signal });
        if (!response.ok) throw new Error('This deck could not be downloaded. Refresh books and try again.');
        buffer = await response.arrayBuffer();
      }
      status('Opening cards and categories…');
      await new Promise(resolve => setTimeout(resolve, 30));
      const result = await readApkg(buffer, libs.JSZip, libs.SQL);
      if (current !== requestId) return;
      remember(); frame.setCollection(result); collection = result;
      loadedId = file ? `local:${file.name}:${file.size}:${file.lastModified}` : deck.id;
      $('loaded-book').textContent = file ? 'LOCAL DECK' : book.name;
      $('loaded-name').textContent = (file?.name || deck.name).replace(/\.apkg$/i, '');
      const counts = new Map();
      for (const card of collection.cards) counts.set(card.deck, (counts.get(card.deck) || 0) + 1);
      $('category').innerHTML = `<option value="">All categories (${collection.cards.length.toLocaleString()})</option>` + collection.categories.map(category => `<option value="${esc(category)}">${esc(category.replace(/::/g, ' › '))} (${[...counts].filter(([name]) => name === category || name.startsWith(`${category}::`)).reduce((n, [, count]) => n + count, 0).toLocaleString()})</option>`).join('');
      const resume = saved().progress?.[loadedId];
      if (resume && collection.categories.includes(resume.category)) $('category').value = resume.category;
      $('shuffle').checked = Boolean(resume?.shuffle); $('search').value = '';
      $('welcome').hidden = true; $('session').hidden = false;
      rebuild(resume?.card);
      status(`${collection.cards.length.toLocaleString()} cards · ${collection.categories.length} categories loaded. Click any image to zoom.${resume && collection.cards.some(card => card.id === resume.card) ? ' Study position restored.' : ''}`);
    } catch (error) { if (current === requestId && error.name !== 'AbortError') status(error.message || 'Could not open this deck. Please try another APKG.', true); }
    finally { if (current === requestId) { busy = false; updateButtons(); root.removeAttribute('aria-busy'); } }
  }
  function rebuild(resumeCard) {
    if (!collection) return;
    order = cardOrder(collection.cards, { category: $('category').value, query: $('search').value, shuffle: $('shuffle').checked });
    position = Math.max(0, order.findIndex(index => collection.cards[index].id === resumeCard)); answer = false; page = Math.floor(position / PAGE);
    render(); browse();
  }
  function render() {
    const card = collection?.cards[order[position]];
    $('frame').hidden = !card; $('card-state').hidden = Boolean(card);
    $('count').textContent = card ? `Card ${(position + 1).toLocaleString()} / ${order.length.toLocaleString()} · ${card.deck.replace(/::/g, ' › ')}` : 'No matching cards';
    $('progress').max = Math.max(1, order.length); $('progress').value = card ? position + 1 : 0;
    $('jump').max = order.length; $('jump').value = card ? position + 1 : '';
    for (const action of ['prev', 'next', 'reveal', 'jump']) button(action).disabled = !card;
    button('reveal').disabled = !card || answer; button('reveal').textContent = answer ? '✓ Answer shown' : 'Show answer';
    root.querySelector('.study-workspace').classList.toggle('study-answer-shown', answer);
    if (card) frame.render(card, answer).catch(() => toast('Could not render this card. Try the next card or reload the deck.'));
    root.querySelectorAll('[data-card-pos]').forEach(item => { const selected = +item.dataset.cardPos === position; item.classList.toggle('current', selected); item.setAttribute('aria-current', String(selected)); });
    remember();
  }
  function navigate(next) {
    if (!order.length || busy) return;
    position = (next + order.length) % order.length; answer = false;
    if (Math.floor(position / PAGE) !== page) { page = Math.floor(position / PAGE); browse(); }
    render();
  }
  function browse() {
    if (!collection) return;
    $('browse').classList.toggle('study-list', layout === 'list');
    const start = page * PAGE;
    $('browse').innerHTML = order.slice(start, start + PAGE).map((index, offset) => {
      const card = collection.cards[index], pos = start + offset;
      card.preview ??= textOf(card.front) || '(Image / media card)';
      return `<button type="button" class="study-preview${pos === position ? ' current' : ''}" data-card-pos="${pos}" aria-current="${pos === position}"><b>${pos + 1}</b><span>${esc(card.preview.slice(0, 240))}</span></button>`;
    }).join('') || '<p class="study-hint">No cards match this filter.</p>';
    $('page-count').textContent = order.length ? `${start + 1}–${Math.min(start + PAGE, order.length)} of ${order.length.toLocaleString()}` : '0 cards';
    button('page-prev').disabled = page === 0; button('page-next').disabled = (page + 1) * PAGE >= order.length;
    for (const view of ['cards', 'list']) button(view).setAttribute('aria-pressed', String(layout === view));
  }
  function exitFocus() {
    if (!focusMode) return;
    focusMode = false; document.body.classList.remove('study-focus');
    button('focus').textContent = '⛶ Focus / fullscreen'; button('focus').setAttribute('aria-pressed', 'false');
    if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
    focusedNatively = false;
    button('focus').focus({ preventScroll: true });
  }
  async function toggleFocus() {
    if (focusMode) { exitFocus(); return; }
    focusMode = true; document.body.classList.add('study-focus');
    button('focus').textContent = '⛶ Exit focus'; button('focus').setAttribute('aria-pressed', 'true');
    try { if (root.requestFullscreen) { await root.requestFullscreen(); focusedNatively = true; } } catch { /* Focus layout also works where native fullscreen is unavailable. */ }
    button('focus').focus({ preventScroll: true });
  }
  function keydown(event) {
    if (!root.classList.contains('active') || busy || event.ctrlKey || event.metaKey || event.altKey || root.querySelector('dialog').open) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && focusMode) { event.preventDefault(); exitFocus(); return; }
    if (event.target.closest('input,textarea,select,a,audio,video,[contenteditable="true"]')) return;
    // Keep normal Space/Enter activation on focused buttons.
    if (event.target.closest('button') && key === ' ') return;
    if (!order.length) return;
    if (['a', 'arrowleft'].includes(key)) navigate(position - 1);
    else if (['d', 'arrowright'].includes(key)) navigate(position + 1);
    else if (['s', 'arrowdown', ' '].includes(key)) { answer = true; render(); }
    else if (key === 'f') toggleFocus();
    else return;
    event.preventDefault();
  }
  root.addEventListener('click', event => {
    const bookId = event.target.closest('[data-book]')?.dataset.book;
    if (bookId !== undefined && !busy) selectBook(bookId);
    const pos = event.target.closest('[data-card-pos]')?.dataset.cardPos;
    if (pos !== undefined) navigate(+pos);
    const action = event.target.closest('[data-study]')?.dataset.study;
    if (action === 'refresh') refresh(true);
    if (action === 'load') load();
    if (action === 'open') $('file').click();
    if (action === 'prev') navigate(position - 1);
    if (action === 'next') navigate(position + 1);
    if (action === 'reveal') { answer = true; render(); }
    if (action === 'focus') toggleFocus();
    if (action === 'jump') { const value = $('jump').valueAsNumber; if (Number.isInteger(value) && value >= 1 && value <= order.length) navigate(value - 1); else toast(`Enter a card number from 1 to ${order.length}.`); }
    if (action === 'cards' || action === 'list') { layout = action; browse(); }
    if (action === 'page-prev' && page > 0) { page--; browse(); }
    if (action === 'page-next' && (page + 1) * PAGE < order.length) { page++; browse(); }
  });
  $('file').addEventListener('change', () => { const file = $('file').files[0]; if (file) load(file); $('file').value = ''; });
  $('deck').addEventListener('change', () => { save({ deck: $('deck').value }); updateButtons(); });
  $('category').addEventListener('change', () => rebuild()); $('shuffle').addEventListener('change', () => rebuild());
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => {
    // Strip markup once when search is first used, keeping initial deck loading lean.
    for (const card of collection?.cards || []) card.searchText ??= `${textOf(card.front)} ${textOf(card.back)} ${card.deck}`;
    rebuild();
  }, 180); });
  $('jump').addEventListener('keydown', event => { if (event.key === 'Enter') button('jump').click(); });
  document.addEventListener('keydown', keydown);
  document.addEventListener('fullscreenchange', () => { if (focusedNatively && document.fullscreenElement !== root) exitFocus(); });
  new MutationObserver(() => frame.theme()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { refresh, exitFocus };
}
