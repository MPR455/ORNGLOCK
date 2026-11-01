import { DDX_REGIONS, DDX_SYMPTOMS } from './clinical database/DDx/ddx-data.mjs';
import { ONCALL_MENU } from './clinical database/JustDoIt/justdoit-data.mjs';

// 鑑別診斷 tab: tap a body area (or search a symptom) -> categorized differential.
// Each diagnosis has a "?" popup with the physical exam and scores to do, and links into the order tab.
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const REGION = Object.fromEntries(DDX_REGIONS.map(region => [region.id, region]));

// Home screen sections: a symptom is listed under the section of its first region.
const SECTIONS = [
  ['🧠 頭 / 頸', ['head', 'eye', 'ent', 'neck']],
  ['🫁 胸', ['chest']],
  ['🟫 腹部', ['ruq', 'epigastric', 'luq', 'umbilical', 'rlq', 'suprapubic', 'llq']],
  ['🚻 泌尿 / 骨盆', ['pelvis', 'flank']],
  ['🦴 背 / 四肢', ['back', 'lowback', 'arm', 'leg']],
  ['🌡️ 全身 / 皮膚', ['systemic', 'skin']]
];

// Figure zones per view. Front view: the patient's right is on the viewer's left.
const ARM_R = 'M57 95 L43 99 L31 178 L22 246 L31 250 L44 184 L57 134 Z';
const ARM_L = 'M143 95 L157 99 L169 178 L178 246 L169 250 L156 184 L143 134 Z';
const LEG_R = 'M58 262 L98 270 L95 426 L74 426 Z';
const LEG_L = 'M142 262 L102 270 L105 426 L126 426 Z';
const SHARED = [
  ['head', 'ellipse', { cx: 100, cy: 40, rx: 26, ry: 32 }],
  ['neck', 'rect', { x: 88, y: 70, width: 24, height: 20 }],
  ['arm', 'path', { d: ARM_R }], ['arm', 'path', { d: ARM_L }],
  ['leg', 'path', { d: LEG_R }], ['leg', 'path', { d: LEG_L }]
];
const VIEWS = {
  front: [...SHARED,
    ['ent', 'path', { d: 'M100 41 L94 54 Q100 57 106 54 Z' }], ['ent', 'ellipse', { cx: 100, cy: 62, rx: 9, ry: 3.5 }],
    ['ent', 'ellipse', { cx: 73, cy: 42, rx: 4, ry: 8 }], ['ent', 'ellipse', { cx: 127, cy: 42, rx: 4, ry: 8 }],
    ['eye', 'ellipse', { cx: 90, cy: 37, rx: 6, ry: 4.5 }], ['eye', 'ellipse', { cx: 110, cy: 37, rx: 6, ry: 4.5 }],
    ['chest', 'path', { d: 'M57 93 Q100 83 143 93 L146 150 L54 150 Z' }],
    ['ruq', 'rect', { x: 54, y: 150, width: 31, height: 30 }],
    ['epigastric', 'rect', { x: 85, y: 150, width: 30, height: 30 }],
    ['luq', 'rect', { x: 115, y: 150, width: 31, height: 30 }],
    ['umbilical', 'rect', { x: 54, y: 180, width: 92, height: 28 }],
    ['rlq', 'rect', { x: 54, y: 208, width: 31, height: 30 }],
    ['suprapubic', 'rect', { x: 85, y: 208, width: 30, height: 30 }],
    ['llq', 'rect', { x: 115, y: 208, width: 31, height: 30 }],
    ['pelvis', 'path', { d: 'M54 238 L146 238 L132 270 L68 270 Z' }]
  ],
  back: [...SHARED,
    ['back', 'path', { d: 'M57 93 Q100 83 143 93 L146 150 L54 150 Z' }],
    ['flank', 'rect', { x: 54, y: 150, width: 28, height: 62 }],
    ['flank', 'rect', { x: 118, y: 150, width: 28, height: 62 }],
    ['lowback', 'path', { d: 'M82 150 L118 150 L118 212 L146 212 L146 238 L54 238 L54 212 L82 212 Z' }],
    ['pelvis', 'path', { d: 'M54 238 L146 238 L132 270 L68 270 Z' }]
  ]
};
// Side markers so left and right are never ambiguous.
const SIDE_LABELS = { front: ['右 R', '左 L'], back: ['左 L', '右 R'] };

const view = { side: 'front', region: null, symptom: null, query: '', focus: null };
let root, toast = () => {}, openOrder = () => {};

const dxCount = symptom => symptom.groups.reduce((sum, group) => sum + group.dx.length, 0);

// An order link reads "🫀 胸痛 › 疑主動脈剝離"; the chapter title comes from the order tab's own data.
function orderLabel([slug, name]) {
  const chapter = ONCALL_MENU.find(entry => entry.slug === slug);
  return `${chapter ? `${chapter.icon} ${chapter.title} › ` : ''}${name}`;
}
const orderLinks = (orders = [], className = 'dd-order') => orders.map(([slug, name]) => `<button class="${className}" type="button" data-dd="order" data-slug="${esc(slug)}" data-name="${esc(name)}"><span class="dd-order-tag">Order</span><span>${esc(orderLabel([slug, name]))}</span><span aria-hidden="true">›</span></button>`).join('');

function figure() {
  const zones = VIEWS[view.side].map(([id, tag, attrs]) => {
    const region = REGION[id];
    const on = view.region === id || (view.symptom !== null && DDX_SYMPTOMS[view.symptom].regions.includes(id));
    const attributes = Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ');
    return `<${tag} class="dd-zone${on ? ' on' : ''}" data-dd="region" data-region="${id}" ${attributes} tabindex="0" role="button" aria-label="${esc(`${region.name} ${region.en}`)}"><title>${esc(`${region.name} · ${region.en}`)}</title></${tag}>`;
  }).join('');
  const [left, right] = SIDE_LABELS[view.side];
  const chips = ['skin', 'systemic'].map(id => `<button class="oc-chip dd-region-chip${view.region === id ? ' on' : ''}" type="button" data-dd="region" data-region="${id}">${REGION[id].icon} ${esc(REGION[id].name)}</button>`).join('');
  return `<div class="dd-side" role="group" aria-label="身體正面或背面">
      <button type="button" class="dd-side-btn" data-dd="side" data-side="front" aria-pressed="${view.side === 'front'}">正面</button>
      <button type="button" class="dd-side-btn" data-dd="side" data-side="back" aria-pressed="${view.side === 'back'}">背面</button>
    </div>
    <svg class="dd-body" viewBox="0 0 200 440" aria-label="身體圖：點選部位">
      <text class="dd-lr" x="16" y="78">${left}</text><text class="dd-lr" x="184" y="78" text-anchor="end">${right}</text>
      ${zones}
    </svg>
    <p class="dd-hover" aria-live="polite">${view.region ? `${REGION[view.region].icon} ${esc(REGION[view.region].name)}` : '點選部位'}</p>
    <div class="dd-region-chips">${chips}</div>`;
}

const symptomRow = (symptom, hint) => `<button class="oc-item" type="button" data-dd="symptom" data-index="${DDX_SYMPTOMS.indexOf(symptom)}"><span class="oc-item-name">${esc(symptom.name)}<small class="oc-item-en" lang="en">${esc(symptom.en)}</small></span><span class="oc-item-hint">${hint ?? `${dxCount(symptom)} 個鑑別診斷 · ${symptom.regions.map(id => REGION[id].name).join('、')}`}</span><span class="oc-item-arrow" aria-hidden="true">›</span></button>`;

function homeView() {
  const sections = SECTIONS.map(([title, ids]) => {
    const symptoms = DDX_SYMPTOMS.filter(symptom => ids.includes(symptom.regions[0]));
    return symptoms.length ? `<section class="oc-section"><h2>${esc(title)}</h2><div class="oc-grid">${symptoms.map(symptom => `<button class="oc-tile" type="button" data-dd="symptom" data-index="${DDX_SYMPTOMS.indexOf(symptom)}"><span class="oc-tile-name">${esc(symptom.name)}<small class="dd-tile-en" lang="en">${esc(symptom.en)}</small></span></button>`).join('')}</div></section>` : '';
  }).join('');
  return `<h1 class="oc-title" tabindex="-1">🧍 鑑別診斷</h1>
    <p class="oc-hint">點左邊身體部位，或在上面搜尋症狀（中文 / English 都可以）。每個診斷按 <b>?</b> 看要做的理學檢查和評分量表，按 <b>Order</b> 直接跳到醫囑。</p>${sections}`;
}

function regionView() {
  const region = REGION[view.region];
  const symptoms = DDX_SYMPTOMS.filter(symptom => symptom.regions.includes(view.region));
  return `<button class="oc-back" type="button" data-dd="home">‹ 全部</button>
    <h1 class="oc-title" tabindex="-1">${region.icon} ${esc(region.name)}</h1><p class="oc-en" lang="en">${esc(region.en)}</p>
    <div class="oc-list">${symptoms.map(symptom => symptomRow(symptom)).join('')}</div>`;
}

const bullets = (items, className) => items?.length ? `<ul class="${className}">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';

function firstStep(first) {
  const block = (icon, title, body) => body ? `<div class="dd-first-block"><h3>${icon} ${title}</h3>${body}</div>` : '';
  return `<section class="dd-first" aria-label="第一步">
      ${block('🚩', '紅旗 / 先排除', bullets(first.flags, 'dd-list dd-flags'))}
      ${block('🩺', '理學檢查', bullets(first.pe, 'dd-list'))}
      ${block('📋', '評分 / 量表', bullets(first.scores, 'dd-list dd-scores'))}
      ${first.orders?.length ? `<div class="dd-first-block"><h3>🍟 先開醫囑</h3><div class="dd-orders">${orderLinks(first.orders)}</div></div>` : ''}
    </section>`;
}

function symptomView() {
  const symptom = DDX_SYMPTOMS[view.symptom];
  const back = view.region ? `<button class="oc-back" type="button" data-dd="region" data-region="${view.region}">‹ ${esc(REGION[view.region].name)}</button>` : '<button class="oc-back" type="button" data-dd="home">‹ 全部</button>';
  const groups = symptom.groups.map((group, groupIndex) => `<section class="dd-group${group.tone === 'urgent' ? ' dd-urgent' : ''}"><h2>${esc(group.title)}</h2>${group.dx.map((dx, dxIndex) => {
    const key = `${groupIndex}:${dxIndex}`;
    const hasWhy = dx.pe?.length || dx.scores?.length;
    return `<div class="dd-dx${view.focus === key ? ' dd-focus' : ''}" data-key="${key}">
        <div class="dd-dx-main">
          <span class="dd-dx-name">${esc(dx.name)}<small class="oc-item-en" lang="en">${esc(dx.en)}</small></span>
          <span class="dd-dx-clues">${esc(dx.clues)}</span>
          ${dx.orders?.length ? `<span class="dd-orders">${orderLinks(dx.orders)}</span>` : ''}
        </div>
        ${hasWhy ? `<button class="oc-why dd-why" type="button" data-dd="why" data-key="${key}" aria-label="要做什麼檢查：${esc(dx.name)}" aria-expanded="false">?</button>` : ''}
      </div>`;
  }).join('')}</section>`).join('');
  return `${back}
    <h1 class="oc-title" tabindex="-1">${esc(symptom.name)}</h1><p class="oc-en" lang="en">${esc(symptom.en)}</p>
    <div class="oc-chips dd-regions">${symptom.regions.map(id => `<button class="oc-chip" type="button" data-dd="region" data-region="${id}">${REGION[id].icon} ${esc(REGION[id].name)}</button>`).join('')}</div>
    ${firstStep(symptom.first)}
    ${groups}`;
}

// Latin queries match at a word start ("pe" finds PE and "PE" in Wells (PE), not "type");
// other scripts match anywhere — the same rule as the order tab's search.
function matcher(raw) {
  const query = normalize(raw);
  if (/[^\x00-\x7f]/.test(query)) return text => normalize(text).includes(query);
  const pattern = new RegExp(`(^|[^a-z0-9])${raw.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}`);
  return text => pattern.test(String(text).normalize('NFKC').toLowerCase());
}

const DX_LIMIT = 60;
function searchView() {
  const matches = matcher(view.query);
  const symptoms = DDX_SYMPTOMS.filter(symptom => [symptom.name, symptom.en, ...(symptom.aliases || [])].some(matches));
  const hits = [];
  DDX_SYMPTOMS.forEach((symptom, symptomIndex) => symptom.groups.forEach((group, groupIndex) => group.dx.forEach((dx, dxIndex) => {
    // Diagnosis names rank first, then clues, then the exams and scores it asks for (so "Wells" or "Murphy" finds where to use them).
    const rank = [dx.name, dx.en].some(matches) ? 0 : matches(dx.clues) ? 1 : [...(dx.pe || []), ...(dx.scores || [])].some(matches) ? 2 : -1;
    if (rank >= 0) hits.push({ symptom, symptomIndex, dx, key: `${groupIndex}:${dxIndex}`, rank });
  })));
  hits.sort((a, b) => a.rank - b.rank);
  if (!symptoms.length && !hits.length) return `<h1 class="oc-title" tabindex="-1">找不到「${esc(view.query)}」</h1><p class="oc-hint">試試其他關鍵字（例如：胸痛、headache、Wells、Murphy），或按 Esc 清除搜尋。</p>`;
  const symptomList = symptoms.length ? `<section class="oc-section"><h2>症狀 · ${symptoms.length}</h2><div class="oc-list">${symptoms.map(symptom => symptomRow(symptom)).join('')}</div></section>` : '';
  const dxList = hits.length ? `<section class="oc-section"><h2>診斷 · ${hits.length}${hits.length > DX_LIMIT ? `（顯示前 ${DX_LIMIT}）` : ''}</h2><div class="oc-list">${hits.slice(0, DX_LIMIT).map(hit => `<button class="oc-item" type="button" data-dd="hit" data-index="${hit.symptomIndex}" data-key="${hit.key}"><span class="oc-item-name">${esc(hit.dx.name)}<small class="oc-item-en" lang="en">${esc(hit.dx.en)}</small></span><span class="oc-item-hint">在「${esc(hit.symptom.name)}」· ${esc(hit.dx.clues)}</span><span class="oc-item-arrow" aria-hidden="true">›</span></button>`).join('')}</div></section>` : '';
  return `<h1 class="oc-title" tabindex="-1">搜尋結果</h1>${symptomList}${dxList}`;
}

function render() {
  const searching = view.query.trim();
  root.querySelector('.dd-figure').innerHTML = figure();
  root.querySelector('.dd-body-panel').innerHTML = searching ? searchView() : view.symptom !== null ? symptomView() : view.region ? regionView() : homeView();
  // On phones the figure is the way in; once reading a differential it steps aside.
  root.querySelector('.dd-layout').classList.toggle('dd-reading', Boolean(searching) || view.symptom !== null);
  root.querySelector('.oc-fab-back').hidden = !searching && view.symptom === null && !view.region;
}

function go(changes) {
  hideWhy();
  Object.assign(view, { focus: null }, changes);
  if (!('query' in changes)) { view.query = ''; root.querySelector('#dd-search').value = ''; }
  render();
  const focused = view.focus && root.querySelector(`.dd-dx[data-key="${view.focus}"]`);
  if (focused) focused.scrollIntoView({ block: 'center' });
  else { scrollTo({ top: 0 }); root.querySelector('.oc-title')?.focus({ preventScroll: true }); }
}

function selectRegion(id) {
  // A region with one symptom opens it straight away; otherwise list the symptoms there.
  const symptoms = DDX_SYMPTOMS.filter(symptom => symptom.regions.includes(id));
  go({ region: id, symptom: symptoms.length === 1 ? DDX_SYMPTOMS.indexOf(symptoms[0]) : null });
}

function showWhy(button) {
  const pop = root.querySelector('.oc-pop');
  if (pop.dataset.for === button.dataset.key && !pop.hidden) return hideWhy();
  hideWhy();
  const [groupIndex, dxIndex] = button.dataset.key.split(':').map(Number);
  const dx = DDX_SYMPTOMS[view.symptom].groups[groupIndex].dx[dxIndex];
  const section = (title, items) => items?.length ? `<strong>${title}</strong>${items.map(item => `<span>• ${esc(item)}</span>`).join('')}` : '';
  pop.innerHTML = `<strong class="dd-pop-title">${esc(dx.name)}</strong>${section('🩺 理學檢查', dx.pe)}${section('📋 評分 / 量表 / 問卷', dx.scores)}${dx.orders?.length ? `<strong>🍟 醫囑</strong><span class="dd-pop-orders">${orderLinks(dx.orders, 'dd-order dd-order-pop')}</span>` : ''}`;
  pop.dataset.for = button.dataset.key; pop.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  const box = button.getBoundingClientRect(), width = Math.min(380, innerWidth - 24);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(12, Math.min(box.right - width, innerWidth - width - 12)) + scrollX}px`;
  const below = box.bottom + 8, height = pop.offsetHeight;
  pop.style.top = `${Math.max(12, Math.min(below + height > innerHeight - 12 ? box.top - height - 8 : below, innerHeight - height - 12)) + scrollY}px`;
}

function hideWhy() {
  const pop = root?.querySelector('.oc-pop'); if (!pop || pop.hidden) return;
  pop.hidden = true;
  root.querySelector(`.dd-why[data-key="${pop.dataset.for}"]`)?.setAttribute('aria-expanded', 'false');
}

// Esc steps back one screen: popup, then search, then symptom, then region.
function goBack() {
  if (!root.querySelector('.oc-pop').hidden) return hideWhy();
  if (view.query.trim()) { view.query = ''; root.querySelector('#dd-search').value = ''; return render(); }
  if (view.symptom !== null) {
    const onlyOne = view.region && DDX_SYMPTOMS.filter(symptom => symptom.regions.includes(view.region)).length === 1;
    return go({ symptom: null, region: onlyOne ? null : view.region });
  }
  if (view.region) go({ region: null });
}

function onClick(event) {
  const target = event.target.closest('[data-dd]');
  if (!target || !root.contains(target)) { if (!event.target.closest('#tab-ddx .oc-pop')) hideWhy(); return; }
  const action = target.dataset.dd;
  if (action !== 'why') hideWhy();
  if (action === 'back') goBack();
  else if (action === 'home') go({ region: null, symptom: null });
  else if (action === 'side') { view.side = target.dataset.side; render(); }
  else if (action === 'region') selectRegion(target.dataset.region);
  else if (action === 'symptom') go({ symptom: Number(target.dataset.index) });
  else if (action === 'hit') go({ symptom: Number(target.dataset.index), region: null, focus: target.dataset.key });
  else if (action === 'why') showWhy(target);
  else if (action === 'order') {
    if (openOrder(target.dataset.slug, target.dataset.name)) toast(`Order：${target.dataset.name}`);
    else toast('Order 裡找不到這一項');
  }
}

export function initDdx(options = {}) {
  ({ toast = toast, openOrder = openOrder } = options);
  root = document.getElementById('tab-ddx');
  root.innerHTML = `<div class="oc-top dd-top">
      <label class="oc-search"><span aria-hidden="true">⌕</span><input id="dd-search" type="search" placeholder="搜尋症狀 / 診斷：胸痛、dyspnea、Wells…" autocomplete="off" spellcheck="false" aria-label="搜尋症狀或診斷（中英文）"></label>
    </div>
    <div class="dd-layout">
      <aside class="dd-figure" aria-label="身體圖"></aside>
      <div class="dd-body-panel"></div>
    </div>
    <div class="oc-pop" role="tooltip" hidden></div>
    <button class="oc-fab-back" type="button" data-dd="back" aria-label="返回上一頁" hidden>‹ 返回</button>`;
  root.addEventListener('input', event => {
    if (event.target.id !== 'dd-search') return;
    view.query = event.target.value; hideWhy(); render();
  });
  document.addEventListener('click', onClick);
  // SVG zones are focusable: Enter / Space selects them like buttons.
  root.addEventListener('keydown', event => {
    const zone = event.target.closest?.('.dd-zone');
    if (zone && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectRegion(zone.dataset.region); }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !root.classList.contains('active')) return;
    event.preventDefault(); goBack();
  });
  addEventListener('resize', hideWhy);
  render();
}
