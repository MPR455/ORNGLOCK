import { ONCALL_MENU, ONCALL_HOME } from './clinical database/JustDoIt/justdoit-data.mjs';

// 值班 tab: kiosk-style order picker. Call type -> condition -> tap orders into a tray -> copy.
const TYPE_INFO = { m: ['💊', '藥物'], l: ['🧪', '檢驗'], x: ['📷', '檢查'], p: ['⚙️', '處置'] };
// "?" popup heading per order type; a reason may hold several "｜"-separated lines.
const WHY_HEADING = { m: '適應 / 禁忌', l: '排除 / 目的', x: '排除 / 目的', p: '為什麼？' };
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

const view = { chapter: null, item: null, query: '' };
const tray = new Map(); // key -> { item, text }
let root, copyText = async () => {}, toast = () => {};

const orderKey = (chapter, itemIndex, orderIndex) => `${chapter.slug}:${itemIndex}:${orderIndex}`;
const orderLine = order => order[3] ? `${order[1]}（${order[3]}）` : order[1];

// Recently opened conditions are a per-device convenience; storage can be unavailable.
const RECENT_KEY = 'ornglock_oncall_recent_v1';
function loadRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return saved.map(([slug, name]) => {
      const chapter = ONCALL_MENU.findIndex(entry => entry.slug === slug);
      const item = chapter < 0 ? -1 : ONCALL_MENU[chapter].items.findIndex(entry => entry.name === name);
      return item < 0 ? null : { chapter, item };
    }).filter(Boolean);
  } catch { return []; }
}
function rememberRecent(chapter, item) {
  const entry = [ONCALL_MENU[chapter].slug, ONCALL_MENU[chapter].items[item].name];
  const list = loadRecent().map(({ chapter: c, item: i }) => [ONCALL_MENU[c].slug, ONCALL_MENU[c].items[i].name])
    .filter(([slug, name]) => slug !== entry[0] || name !== entry[1]);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...list].slice(0, 6))); } catch {}
}

const tile = (className, action, attrs, icon, label) => `<button class="${className}" type="button" data-oc="${action}" ${attrs}><span class="oc-tile-icon" aria-hidden="true">${icon}</span><span class="oc-tile-name">${esc(label)}</span></button>`;

// Home is grouped by how the call comes in: emergencies first, then vitals, symptoms, lab values, drug requests.
function homeView() {
  const recent = loadRecent();
  const recentRow = recent.length ? `<section class="oc-section"><h2>🕘 最近</h2><div class="oc-chips">${recent.map(({ chapter, item }) => `<button class="oc-chip" type="button" data-oc="hit" data-chapter="${chapter}" data-index="${item}">${esc(ONCALL_MENU[chapter].items[item].name)}</button>`).join('')}</div></section>` : '';
  const urgent = `<section class="oc-section oc-urgent"><h2>🚨 危急：直接開醫囑</h2><div class="oc-grid">${ONCALL_HOME.urgent.map(entry => tile('oc-tile oc-tile-urgent', 'hit', `data-chapter="${entry.chapter}" data-index="${entry.item}"`, entry.icon, entry.label)).join('')}</div></section>`;
  const sections = ONCALL_HOME.sections.map(section => `<section class="oc-section"><h2>${esc(section.title)}</h2><div class="oc-grid">${section.tiles.map(entry => tile('oc-tile', 'chapter', `data-index="${entry.chapter}"`, entry.icon, entry.label)).join('')}</div></section>`).join('');
  return recentRow + urgent + sections;
}

const actions = () => `<div class="oc-actions"><button class="oc-big oc-primary" type="button" data-oc="all">＋ 基本醫囑</button><button class="oc-big" type="button" data-oc="tray">🧾 看醫囑單 (${tray.size})</button></div>`;

// A chapter opens on its first condition's orders (the work-up for that call);
// the other conditions follow as "依情況再加".
function chapterView(chapter) {
  const [start, ...rest] = chapter.items;
  return `<button class="oc-back" type="button" data-oc="home">‹ 首頁</button>
    <h1 class="oc-title" tabindex="-1">${chapter.icon} ${esc(chapter.title)}</h1>
    <p class="oc-hint">先開：${esc(start.name)}${start.hint ? ` · ${esc(start.hint)}` : ''}</p>
    ${actions()}
    ${orderGroups(chapter, 0)}
    <section class="oc-section"><h2>依情況再加</h2><div class="oc-list">${rest.map((item, index) => `<button class="oc-item" type="button" data-oc="item" data-index="${index + 1}"><span class="oc-item-name">${esc(item.name)}</span>${item.hint ? `<span class="oc-item-hint">${esc(item.hint)}</span>` : ''}<span class="oc-item-arrow" aria-hidden="true">›</span></button>`).join('')}</div></section>`;
}

function itemView(chapter, itemIndex) {
  const item = chapter.items[itemIndex];
  return `<button class="oc-back" type="button" data-oc="chapter" data-index="${ONCALL_MENU.indexOf(chapter)}">‹ ${esc(chapter.title)}</button>
    <h1 class="oc-title" tabindex="-1">${esc(item.name)}</h1>
    ${item.hint ? `<p class="oc-hint">${esc(item.hint)}</p>` : ''}
    ${actions()}
    ${orderGroups(chapter, itemIndex)}`;
}

function orderGroups(chapter, itemIndex) {
  const item = chapter.items[itemIndex];
  return Object.keys(TYPE_INFO).map(type => {
    const rows = item.orders.map((order, index) => [order, index]).filter(([order]) => order[0] === type);
    if (!rows.length) return '';
    const [icon, label] = TYPE_INFO[type];
    return `<section class="oc-group oc-type-${type}"><h2>${icon} ${label}</h2>${rows.map(([order, index]) => {
      const key = orderKey(chapter, itemIndex, index), picked = tray.has(key);
      return `<div class="oc-order${picked ? ' picked' : ''}">
          <button class="oc-pick" type="button" data-oc="pick" data-key="${key}" data-index="${index}" aria-pressed="${picked}"><span class="oc-check" aria-hidden="true">${picked ? '✓' : '+'}</span><span class="oc-order-text">${esc(order[1])}${order[3] ? `<em class="oc-when">${esc(order[3])}</em>` : ''}</span></button>
          ${order[2] ? `<button class="oc-why" type="button" data-oc="why" data-index="${index}" aria-label="為什麼：${esc(order[1])}" aria-expanded="false">?</button>` : ''}
        </div>`;
    }).join('')}</section>`;
  }).join('');
}

function searchView() {
  const query = normalize(view.query), hits = [];
  ONCALL_MENU.forEach(chapter => chapter.items.forEach((item, index) => {
    const haystack = normalize([chapter.title, item.name, item.hint || '', ...item.orders.map(order => order[1])].join(' '));
    if (haystack.includes(query)) hits.push([chapter, item, index]);
  }));
  if (!hits.length) return `<h1 class="oc-title" tabindex="-1">找不到「${esc(view.query)}」</h1><p class="oc-hint">試試其他關鍵字，或按 Esc 清除搜尋。</p>`;
  return `<h1 class="oc-title" tabindex="-1">搜尋結果 · ${hits.length}</h1>
    <div class="oc-list">${hits.map(([chapter, item, index]) => `<button class="oc-item" type="button" data-oc="hit" data-chapter="${ONCALL_MENU.indexOf(chapter)}" data-index="${index}"><span class="oc-item-name">${esc(item.name)}</span><span class="oc-item-hint">${chapter.icon} ${esc(chapter.title)}${item.hint ? ' · ' + esc(item.hint) : ''}</span><span class="oc-item-arrow" aria-hidden="true">›</span></button>`).join('')}</div>`;
}

function trayText() {
  const byItem = new Map();
  for (const { item, text } of tray.values()) { if (!byItem.has(item)) byItem.set(item, []); byItem.get(item).push(text); }
  return [...byItem].map(([item, lines]) => `【${item}】\n${lines.map(line => `- ${line}`).join('\n')}`).join('\n\n');
}

function renderTray() {
  const dialog = root.querySelector('.oc-tray');
  const list = tray.size
    ? [...tray].map(([key, { item, text }]) => `<li><span><small>${esc(item)}</small>${esc(text)}</span><button type="button" class="oc-remove" data-oc="remove" data-key="${key}" aria-label="移除 ${esc(text)}">×</button></li>`).join('')
    : '<li class="oc-empty">還沒點任何醫囑。</li>';
  dialog.querySelector('.oc-tray-list').innerHTML = list;
  dialog.querySelector('[data-oc="copy"]').disabled = !tray.size;
  dialog.querySelector('[data-oc="clear"]').disabled = !tray.size;
}

function render() {
  const chapter = view.chapter === null ? null : ONCALL_MENU[view.chapter];
  root.querySelector('.oc-body').innerHTML = view.query.trim() ? searchView() : chapter && view.item !== null ? itemView(chapter, view.item) : chapter ? chapterView(chapter) : homeView();
  root.querySelector('.oc-fab-back').hidden = chapter === null && !view.query.trim();
  updateCounts();
}

function go(chapter, item = null) {
  hideWhy();
  view.chapter = chapter; view.item = item; view.query = '';
  root.querySelector('#oc-search').value = '';
  if (item !== null) rememberRecent(chapter, item);
  render();
  scrollTo({ top: 0 });
  root.querySelector('.oc-title')?.focus({ preventScroll: true });
}

// On a chapter page the orders shown are its first condition's.
const shownItem = () => view.item ?? 0;
function currentItem() { const chapter = ONCALL_MENU[view.chapter]; return [chapter, chapter.items[shownItem()]]; }

function togglePick(button) {
  const [chapter, item] = currentItem(), order = item.orders[Number(button.dataset.index)], key = button.dataset.key;
  if (tray.has(key)) tray.delete(key); else tray.set(key, { item: item.name, text: orderLine(order) });
  const picked = tray.has(key);
  button.setAttribute('aria-pressed', String(picked));
  button.closest('.oc-order').classList.toggle('picked', picked);
  button.querySelector('.oc-check').textContent = picked ? '✓' : '+';
  updateCounts();
}

function updateCounts() {
  root.querySelectorAll('.oc-tray-btn b').forEach(node => { node.textContent = tray.size; });
  root.querySelectorAll('.oc-tray-btn').forEach(node => node.setAttribute('aria-label', `醫囑單，${tray.size} 項`));
  root.querySelectorAll('.oc-actions [data-oc="tray"]').forEach(node => { node.textContent = `🧾 看醫囑單 (${tray.size})`; });
}

function showWhy(button) {
  const pop = root.querySelector('.oc-pop');
  if (pop.dataset.for === button.dataset.index && !pop.hidden) return hideWhy();
  hideWhy();
  const [, item] = currentItem(), order = item.orders[Number(button.dataset.index)];
  pop.innerHTML = `<strong>${WHY_HEADING[order[0]]}</strong>${order[2].split('｜').map(line => `<span>${esc(line)}</span>`).join('')}`;
  pop.dataset.for = button.dataset.index; pop.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  const box = button.getBoundingClientRect(), width = Math.min(360, innerWidth - 24);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(12, Math.min(box.right - width, innerWidth - width - 12)) + scrollX}px`;
  const below = box.bottom + 8, height = pop.offsetHeight;
  pop.style.top = `${(below + height > innerHeight - 12 ? box.top - height - 8 : below) + scrollY}px`;
}

function hideWhy() {
  const pop = root?.querySelector('.oc-pop'); if (!pop || pop.hidden) return;
  pop.hidden = true;
  root.querySelector(`.oc-why[data-index="${pop.dataset.for}"]`)?.setAttribute('aria-expanded', 'false');
}

// Esc steps back one screen: popup, then search, then condition, then symptom list.
function goBack() {
  const pop = root.querySelector('.oc-pop');
  if (!pop.hidden) return hideWhy();
  if (view.query.trim()) { view.query = ''; root.querySelector('#oc-search').value = ''; return render(); }
  if (view.item !== null) return go(view.chapter);
  if (view.chapter !== null) go(null);
}

function onClick(event) {
  const target = event.target.closest('[data-oc]');
  if (!target || !root.contains(target)) { if (!event.target.closest('.oc-pop')) hideWhy(); return; }
  const action = target.dataset.oc, index = Number(target.dataset.index);
  if (action === 'back') return goBack(); // floating button: same steps as Esc
  if (action !== 'why') hideWhy();
  if (action === 'home') go(null);
  else if (action === 'chapter') go(index);
  else if (action === 'item') go(view.chapter, index);
  else if (action === 'hit') go(Number(target.dataset.chapter), index);
  else if (action === 'pick') togglePick(target);
  else if (action === 'why') showWhy(target);
  else if (action === 'all') {
    // Orders tagged with a situation (order[3]) are alternatives; pick those by hand.
    const [chapter, item] = currentItem();
    const core = item.orders.map((order, orderIndex) => [order, orderIndex]).filter(([order]) => !order[3]);
    core.forEach(([order, orderIndex]) => tray.set(orderKey(chapter, shownItem(), orderIndex), { item: item.name, text: orderLine(order) }));
    render(); toast(`已加入 ${core.length} 項基本醫囑；有標籤的請依情況點選`);
  }
  else if (action === 'tray') { renderTray(); root.querySelector('.oc-tray').showModal(); }
  else if (action === 'close') root.querySelector('.oc-tray').close();
  else if (action === 'remove') { tray.delete(target.dataset.key); renderTray(); updateCounts(); }
  else if (action === 'clear') { tray.clear(); renderTray(); render(); }
  else if (action === 'copy') copyText(trayText());
}

export function initOncall(options = {}) {
  ({ copyText = copyText, toast = toast } = options);
  root = document.getElementById('tab-oncall');
  root.innerHTML = `<div class="oc-top">
      <label class="oc-search"><span aria-hidden="true">⌕</span><input id="oc-search" type="search" placeholder="搜尋：低血鉀、chest pain、naloxone…" autocomplete="off" spellcheck="false" aria-label="搜尋病況或醫囑"></label>
      <button class="oc-tray-btn" type="button" data-oc="tray" aria-label="醫囑單，0 項">🧾<span class="oc-tray-label"> 醫囑單</span> <b>0</b></button>
    </div>
    <div class="oc-body"></div>
    <div class="oc-pop" role="tooltip" hidden></div>
    <button class="oc-fab-back" type="button" data-oc="back" aria-label="返回上一頁" hidden>‹ 返回</button>
    <dialog class="oc-tray" aria-labelledby="oc-tray-title">
      <div class="oc-tray-head"><h2 id="oc-tray-title">🧾 醫囑單</h2><button class="oc-big" type="button" data-oc="close" aria-label="關閉">×</button></div>
      <ul class="oc-tray-list"></ul>
      <div class="oc-tray-actions"><button class="oc-big oc-primary" type="button" data-oc="copy">📋 複製全部</button><button class="oc-big" type="button" data-oc="clear">清空</button></div>
    </dialog>`;
  root.addEventListener('input', event => {
    if (event.target.id !== 'oc-search') return;
    view.query = event.target.value; hideWhy(); render();
  });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !root.classList.contains('active') || root.querySelector('.oc-tray').open) return;
    event.preventDefault(); goBack();
  });
  addEventListener('resize', hideWhy);
  render();
}
