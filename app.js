import { extractAdmissionSections } from './sections.mjs';
import { initDirectory, refreshDirectoryLayout } from './directory.mjs';

const $ = id => document.getElementById(id);
const TABS = [
  { id: 'directory', icon: '☎️', label: 'Directory', short: 'Directory' },
  { id: 'handoff', icon: '📝', label: '交班單', short: '交班單' },
  { id: 'notes', icon: '🤖', label: '病歷', short: '病歷' },
  { id: 'faq', icon: '❓', label: 'FAQ 腫麼用', short: 'FAQ 腫麼用' },
  { id: 'key', icon: '⚿', label: 'API key', short: 'API key' }
];
const TITLES = { admission: 'Admission note', consult: 'Consult request', summary: 'Treatment summary', support: 'Anti/O2/IV' };
const state = { tab: 'notes', apiKey: '', ready: false, sharedAvailable: false, active: null, lastAction: null, model: '', maxChars: 100000, generatedAction: null, startedAt: 0 };
let sheetOpener, elapsedTimer, toastTimer;

function tabButton(tab, className = '', iconClass = '') {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.dataset.tab = tab.id;
  const icon = document.createElement('span'); icon.className = iconClass; icon.setAttribute('aria-hidden', 'true'); icon.textContent = tab.icon;
  const text = document.createElement('span'); text.textContent = className === 'mobile-nav-item' ? tab.short : tab.label;
  button.append(icon, text); return button;
}

function buildNavigation() {
  const primary = TABS.filter(tab => tab.mobilePrimary !== false);
  for (const tab of TABS) {
    $('primary-nav').append(tabButton(tab));
    $('menu-dd').append(tabButton(tab, 'menu-item'));
    $('mobile-tab-grid').append(tabButton(tab, 'mobile-tab-card', 'mobile-tab-icon'));
  }
  $('mobile-bottom-nav').style.setProperty('--mobile-nav-count', String(primary.length + 1));
  for (const tab of primary) $('mobile-bottom-nav').append(tabButton(tab, 'mobile-nav-item', 'mobile-nav-icon'));
  const more = document.createElement('button'); more.type = 'button'; more.className = 'mobile-nav-item'; more.id = 'mobile-more-tab'; more.setAttribute('aria-controls', 'mobile-tabs-layer'); more.setAttribute('aria-expanded', 'false');
  const icon = document.createElement('span'); icon.className = 'mobile-nav-icon'; icon.textContent = '▦'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = 'All'; more.append(icon, label); more.addEventListener('click', openSheet); $('mobile-bottom-nav').append(more);
  const separator = document.createElement('div'); separator.className = 'menu-sep';
  const themeLabel = document.createElement('div'); themeLabel.className = 'menu-label'; themeLabel.textContent = 'Color theme';
  const row = document.createElement('div'); row.className = 'theme-row';
  for (const [theme, title, color] of [['default', 'Default', '#0f6bb2'], ['macaroon', 'Macaroon', '#e0873a'], ['dark', 'Dark', '#1a2632'], ['black', 'Black / high contrast', '#000']]) {
    const dot = document.createElement('button'); dot.type = 'button'; dot.className = 'theme-dot'; dot.dataset.theme = theme; dot.title = title; dot.setAttribute('aria-label', `${title} theme`); dot.style.background = color; dot.addEventListener('click', () => setTheme(theme)); row.append(dot);
  }
  $('menu-dd').append(separator, themeLabel, row);
  let theme = 'default'; try { theme = localStorage.getItem('ornglock_theme') || 'default'; } catch {}
  setTheme(theme); showTab('notes');
}

function setTheme(theme) {
  if (!['default', 'macaroon', 'dark', 'black'].includes(theme)) theme = 'default';
  document.body.classList.remove('theme-macaroon', 'theme-dark', 'theme-black');
  if (theme !== 'default') document.body.classList.add(`theme-${theme}`);
  $('color-mode').value = theme;
  try { localStorage.setItem('ornglock_theme', theme); } catch {}
  document.querySelectorAll('.theme-dot').forEach(dot => { const selected = dot.dataset.theme === theme; dot.classList.toggle('sel', selected); dot.setAttribute('aria-pressed', String(selected)); });
}

function showTab(id, focus = false) {
  const tab = TABS.find(item => item.id === id); if (!tab) return;
  state.tab = id;
  document.querySelectorAll('main > .tab').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${id}`));
  document.querySelectorAll('button[data-tab]').forEach(button => { const active = button.dataset.tab === id; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('mobile-current-title').textContent = tab.label;
  $('mobile-more-tab').classList.toggle('active', tab.mobilePrimary === false);
  if (tab.mobilePrimary === false) $('mobile-more-tab').setAttribute('aria-current', 'page'); else $('mobile-more-tab').removeAttribute('aria-current');
  closeMenu(); closeSheet(false);
  if (id === 'directory') refreshDirectoryLayout();
  if (focus) $(`tab-${id}`).focus({ preventScroll: true });
}

function closeMenu() { $('menu-dd').classList.remove('open'); $('site-menu-trigger').setAttribute('aria-expanded', 'false'); }
function openSheet() {
  if (innerWidth > 860 || !$('mobile-tabs-layer').hidden) return;
  closeMenu(); sheetOpener = document.activeElement; $('mobile-tabs-layer').hidden = false; $('mobile-tabs-layer').classList.add('open'); document.body.classList.add('mobile-tabs-open');
  document.querySelectorAll('header,main,#mobile-bottom-nav,#menu-dd').forEach(element => { element.inert = true; });
  $('mobile-tabs-trigger').setAttribute('aria-expanded', 'true'); $('mobile-more-tab').setAttribute('aria-expanded', 'true');
  ($('mobile-tab-grid').querySelector('.active') || document.querySelector('.mobile-sheet-close')).focus();
}
function closeSheet(restore = true) {
  if ($('mobile-tabs-layer').hidden) return;
  $('mobile-tabs-layer').hidden = true; $('mobile-tabs-layer').classList.remove('open'); document.body.classList.remove('mobile-tabs-open');
  document.querySelectorAll('header,main,#mobile-bottom-nav,#menu-dd').forEach(element => { element.inert = false; });
  $('mobile-tabs-trigger').setAttribute('aria-expanded', 'false'); $('mobile-more-tab').setAttribute('aria-expanded', 'false');
  if (restore && sheetOpener?.isConnected) sheetOpener.focus();
  sheetOpener = null;
}

function endpoint(path) {
  const configured = window.ORNGLOCK_CONFIG?.apiBase?.trim();
  if (configured) {
    const base = new URL(configured);
    if (base.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(base.hostname) && base.protocol === 'http:')) throw new Error('The service connection is not configured correctly.');
    return new URL(path, base.origin).href;
  }
  if (location.protocol === 'file:') throw new Error('Open this page through the local server to connect to Gemini.');
  return new URL(path, location.origin).href;
}

async function connect() {
  try {
    const response = await fetch(endpoint('/api/status'), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('The documentation service is not connected yet.');
    const status = await response.json();
    if (!status.ready) throw new Error('The documentation tools are not configured yet.');
    state.ready = true; state.sharedAvailable = status.sharedAvailable; state.model = status.model; state.maxChars = status.maxNoteChars || 100000;
    $('source-notes').maxLength = state.maxChars; $('model-name').textContent = state.model; updateConnection(); updateInputs();
  } catch {
    state.ready = false; $('model-name').textContent = 'Gemini Flash-Lite'; updateConnection(); updateInputs();
    showError('Service not connected', 'The documentation service could not be reached. Your notes stay in this tab. Please try again after the connection is available.', false);
    const retry = document.createElement('button'); retry.className = 'btn sec sm'; retry.textContent = 'Retry connection'; retry.type = 'button'; retry.addEventListener('click', () => { clearError(); retry.remove(); connect(); }); $('error-notice').append(retry);
  }
}

function updateConnection() {
  const personal = Boolean(state.apiKey);
  $('connection-pill').classList.toggle('connected', state.ready && (personal || state.sharedAvailable));
  $('connection-label').textContent = !state.ready ? 'Service offline' : personal ? 'Your API key' : state.sharedAvailable ? 'Shared key ready' : 'Add your API key';
  $('key-state').textContent = personal ? 'Your API key is selected for the next request.' : !state.ready ? 'The documentation service is not connected.' : state.sharedAvailable ? 'The shared key is selected. You can generate notes now.' : 'The shared key is unavailable. Add your own key to continue.';
  $('key-mode').textContent = personal ? 'Your personal key' : 'Shared key'; $('use-shared-key').disabled = !personal;
}

function updateInputs() {
  const text = $('source-notes').value;
  $('source-count').textContent = `${text.length.toLocaleString()} / ${state.maxChars.toLocaleString()}`;
  $('clear-source').disabled = !text || Boolean(state.active);
  document.querySelectorAll('[data-action]').forEach(button => { button.disabled = !text.trim() || !state.ready || Boolean(state.active); });
  $('copy-output').disabled = !$('output-notes').value.trim(); $('download-output').disabled = !$('output-notes').value.trim();
  const sections = extractAdmissionSections($('output-notes').value);
  $('section-copy-controls').hidden = state.generatedAction !== 'admission' && !(sections.chief && sections.illness);
  document.querySelectorAll('[data-copy-section]').forEach(button => { button.disabled = !sections[button.dataset.copySection]?.text; });
  $('key-form').querySelectorAll('input,button').forEach(control => { control.disabled = Boolean(state.active); });
  $('use-shared-key').disabled = Boolean(state.active) || !state.apiKey;
  $('run-status').hidden = !state.active;
  if (!state.active) { $('run-status').classList.remove('working'); $('run-message').textContent = ''; }
}

function clearError() { $('error-notice').hidden = true; }
function showError(title, message, canUseOwnKey) { $('error-title').textContent = title; $('error-message').textContent = message; $('error-key-button').hidden = !canUseOwnKey; $('error-notice').hidden = false; }
function openKeySettings() { showTab('key', true); $('personal-key').focus(); }
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500); }

async function generate(action) {
  if (state.active || !state.ready || !$('source-notes').value.trim()) return;
  if (!state.apiKey && !state.sharedAvailable) { showError('An API key is needed', 'The shared key is unavailable. Add your own Gemini key to generate this document.', true); openKeySettings(); return; }
  clearError();
  const controller = new AbortController(); state.active = controller; state.lastAction = action; state.startedAt = Date.now();
  updateInputs(); $('cancel-generation').hidden = false; $('run-status').classList.add('working'); $('output-notes').setAttribute('aria-busy', 'true');
  const actionButton = document.querySelector(`[data-action="${action}"]`); actionButton.classList.add('generating');
  const updateElapsed = () => { $('run-message').textContent = `Generating ${TITLES[action].toLowerCase()}… ${Math.floor((Date.now() - state.startedAt) / 1000)}s`; };
  updateElapsed(); elapsedTimer = setInterval(updateElapsed, 1000);
  const timeout = setTimeout(() => controller.abort('timeout'), 100000);
  try {
    const response = await fetch(endpoint('/api/generate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, notes: $('source-notes').value, ...(state.apiKey ? { apiKey: state.apiKey } : {}) }), signal: controller.signal, cache: 'no-store' });
    let result;
    try { result = await response.json(); } catch { throw new Error('The service returned an unreadable response. Please try again.'); }
    if (!response.ok) {
      const error = new Error(result.error?.message || 'The document could not be generated.'); error.canUseOwnKey = result.error?.canUseOwnKey; error.code = result.error?.code; throw error;
    }
    if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No document was returned. Please try again.');
    $('output-notes').value = result.text; state.generatedAction = action;
    $('output-meta').textContent = `${TITLES[action]} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    document.querySelectorAll('[data-action]').forEach(button => { const selected = button.dataset.action === action; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    toast(`${TITLES[action]} is ready to review.`);
    if (matchMedia('(max-width: 680px)').matches && state.tab === 'notes') $('output-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (error) {
    if (controller.signal.aborted) {
      if (controller.signal.reason === 'timeout') showError('The request took too long', 'Your source notes and previous output are still here. Please try again.', false);
      else toast('Generation stopped. Your notes have been kept.');
    } else {
      if (error.canUseOwnKey) { state.sharedAvailable = false; updateConnection(); }
      showError(error.canUseOwnKey ? 'Continue with your own key' : 'Could not generate the document', error.message || 'Please check the connection and try again.', Boolean(error.canUseOwnKey));
      if (error.canUseOwnKey) $('error-key-button').focus();
    }
  } finally {
    clearTimeout(timeout); clearInterval(elapsedTimer); state.active = null; actionButton.classList.remove('generating'); $('cancel-generation').hidden = true; $('output-notes').removeAttribute('aria-busy'); updateInputs();
  }
}

$('color-mode').addEventListener('change', event => setTheme(event.target.value));
$('site-menu-trigger').addEventListener('click', event => { event.stopPropagation(); const open = $('menu-dd').classList.toggle('open'); $('site-menu-trigger').setAttribute('aria-expanded', String(open)); });
$('mobile-tabs-trigger').addEventListener('click', openSheet);
document.querySelector('.mobile-tabs-backdrop').addEventListener('click', () => closeSheet());
document.querySelector('.mobile-sheet-close').addEventListener('click', () => closeSheet());
document.addEventListener('click', event => { const tab = event.target.closest('button[data-tab]'); if (tab) showTab(tab.dataset.tab, true); if (!event.target.closest('#menu-wrap,#menu-dd')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { if (!$('mobile-tabs-layer').hidden) closeSheet(); else { closeMenu(); } }
  if (event.key === 'Tab' && !$('mobile-tabs-layer').hidden) {
    const controls = [...document.querySelectorAll('.mobile-tabs-sheet button, .mobile-tabs-sheet a[href]')]; const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }
});
window.addEventListener('resize', () => { if (innerWidth > 860) closeSheet(false); });
$('source-notes').addEventListener('input', updateInputs);
$('output-notes').addEventListener('input', updateInputs);
$('clear-source').addEventListener('click', () => { $('source-notes').value = ''; clearError(); updateInputs(); $('source-notes').focus(); });
$('action-grid').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (button) generate(button.dataset.action); });
$('cancel-generation').addEventListener('click', () => state.active?.abort('user'));
$('connection-pill').addEventListener('click', openKeySettings); $('error-key-button').addEventListener('click', openKeySettings);
$('return-to-notes').addEventListener('click', () => showTab('notes', true));
$('key-form').addEventListener('submit', event => {
  event.preventDefault(); const key = $('personal-key').value.trim();
  if (!key || /[\r\n\x00]/.test(key)) { $('key-form-message').textContent = 'Paste a valid Gemini API key first.'; $('personal-key').focus(); return; }
  state.apiKey = key; $('personal-key').value = ''; $('personal-key').type = 'password'; $('toggle-key').textContent = 'Show'; $('toggle-key').setAttribute('aria-pressed', 'false'); $('toggle-key').setAttribute('aria-label', 'Show API key');
  $('key-form-message').textContent = 'Your key is selected for the next request. It will be forgotten when this page reloads.'; clearError(); updateConnection(); updateInputs(); toast('Personal key selected. Return to notes to generate.');
});
$('use-shared-key').addEventListener('click', () => { state.apiKey = ''; $('personal-key').value = ''; $('key-form-message').textContent = 'Your personal key has been cleared from this tab.'; updateConnection(); updateInputs(); });
$('toggle-key').addEventListener('click', () => { const reveal = $('personal-key').type === 'password'; $('personal-key').type = reveal ? 'text' : 'password'; $('toggle-key').textContent = reveal ? 'Hide' : 'Show'; $('toggle-key').setAttribute('aria-pressed', String(reveal)); $('toggle-key').setAttribute('aria-label', reveal ? 'Hide API key' : 'Show API key'); });
async function copyText(text, start = 0, end = text.length) {
  try { await navigator.clipboard.writeText(text); toast('Copied.'); }
  catch { $('output-notes').focus(); $('output-notes').setSelectionRange(start, end); toast('Text selected. Use your device’s Copy command.'); }
}
$('copy-output').addEventListener('click', () => copyText($('output-notes').value));
$('section-copy-controls').addEventListener('click', event => {
  const button = event.target.closest('[data-copy-section]');
  if (!button || button.disabled) return;
  const section = extractAdmissionSections($('output-notes').value)[button.dataset.copySection];
  if (section?.text) copyText(section.text, section.start, section.end);
});
$('download-output').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('output-notes').value], { type: 'text/plain;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ORNGLOCK-${state.generatedAction || 'document'}-${new Date().toISOString().slice(0, 10)}.txt`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
buildNavigation(); initDirectory({ closeMenu }); updateInputs(); connect();
