import { HandoffStore, createPatient, patientHeader, bodyText, fromPortable, parsePortable, replaceText, sortPatients, tasksOf, pendingCount, completeTask, exportPatients, insertObjective, currentOnly, taiwanDate, shiftDate, displayDate, sectionOf, moveBlock, sameName } from './handoff-model.mjs';
import { decodeFile, parsePatients, parseFullNote, reconcile, applyPlans } from './handoff-import.mjs';
import { HandoffEditor, appendMarked } from './handoff-editor.mjs';
const node = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const button = (text, action, className = '') => { const element = node('button', `handoff-button ${className}`, text); element.type = 'button'; if (action) element.addEventListener('click', action); return element; };
const labelInput = (label, value = '', type = 'text') => {
  const wrap = node('label', 'handoff-field', label), input = node(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type; input.value = value; wrap.append(input); return { wrap, input };
};
function dialog(title) {
  const element = node('dialog', 'handoff-dialog'), heading = node('h2', '', title), content = node('div', 'handoff-dialog-content'), footer = node('div', 'handoff-dialog-footer');
  heading.id = `dialog-${crypto.randomUUID()}`; element.setAttribute('aria-labelledby', heading.id); element.append(heading, content, footer); document.body.append(element);
  const opener = document.activeElement;
  const close = () => element.close();
  const cancel = button('取消', close); cancel.autofocus = true; footer.append(cancel);
  element.addEventListener('click', event => { if (event.target === element) close(); });
  element.addEventListener('close', () => { element.remove(); if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  element.showModal(); cancel.focus(); return { element, content, footer, cancel, close };
}
export function initHandoff({ endpoint, getKey, openKeySettings, copyText, toast }) {
  const root = document.getElementById('tab-handoff');
  root.classList.add('handoff-tab');
  root.innerHTML = `<div class="handoff-workspace"><aside class="handoff-left" aria-label="病人名單"><div class="handoff-list-top"><div id="handoff-import-actions"></div><label class="sr-only" for="handoff-search">搜尋床號、姓名或病歷號</label><input id="handoff-search" type="search" placeholder="搜尋床號 / 姓名 / 病歷號" autocomplete="off"></div><div id="handoff-list" class="handoff-list"></div><div class="handoff-list-bottom"><div id="handoff-sorts" class="handoff-segmented"></div><div id="handoff-views" class="handoff-view-controls"></div></div></aside>
  <section class="handoff-right" aria-label="交班筆記"><div id="handoff-tools" class="handoff-tools"></div><div id="handoff-editor" class="handoff-editor-scroll"></div><div class="handoff-editor-footer"><span id="handoff-editor-status">資料僅保留在此分頁</span><span>! 標註重要 · -/# 文字區塊 · @ 插入日期</span></div></section></div><div id="handoff-message" role="status" aria-live="polite" class="handoff-message" hidden></div>`;
  const find = id => root.querySelector(`#${id}`);
  const ui = { sort: 'bed', view: 'cards', expanded: false, minimized: false, search: '', aiAction: 'handoff_convert' };
  let messageTimer, request = null, draft = null, ai;
  const notice = text => { const message = find('handoff-message'); message.textContent = text; message.hidden = false; clearTimeout(messageTimer); messageTimer = setTimeout(() => { message.hidden = true; }, 6000); };
  const store = new HandoffStore(() => { renderCards(); renderToolbar(); editor.render(); refreshAIPatients(); });
  const editor = new HandoffEditor(find('handoff-editor'), store, { onActive: updateActive, onDate: openDate, onMove: openMove, onNotice: notice });
  let listComposing = false;
  find('handoff-list').addEventListener('compositionstart', () => { listComposing = true; });
  find('handoff-list').addEventListener('compositionend', () => { listComposing = false; renderCards(); });
  const importButton = button('↑ 匯入病人', openImport, 'handoff-primary'); importButton.id = 'handoff-import';
  const addButton = button('＋ 新增病人', () => openPatient()); addButton.id = 'handoff-add';
  const count = node('span', '', '0 位病人'); count.id = 'handoff-count'; count.setAttribute('aria-live', 'polite');
  const shrink = button('↙ 縮小', () => setExpanded(false), 'handoff-square'); shrink.id = 'handoff-shrink'; shrink.hidden = true;
  find('handoff-import-actions').append(importButton, addButton, count, shrink);
  for (const [mode, title] of [['bed', '床號'], ['important', '重要 !'], ['pending', '待辦']]) { const item = button(title, () => { ui.sort = mode; renderCards(); }); item.dataset.sort = mode; find('handoff-sorts').append(item); }
  const expand = button('⛶ 展開', () => setExpanded(true)); expand.id = 'handoff-expand'; expand.setAttribute('aria-expanded', 'false');
  const minimize = button('⇤ 縮小', () => setMinimized(true)); minimize.id = 'handoff-minimize'; minimize.setAttribute('aria-label', '縮小病人欄');
  const restore = button('⇥ 還原', () => setMinimized(false)); restore.id = 'handoff-restore'; restore.hidden = true; restore.setAttribute('aria-label', '還原病人欄');
  const sizes = node('div', 'handoff-size-controls'); sizes.append(expand, minimize, restore);
  const view = button('☑ 待辦事項', () => { ui.view = ui.view === 'cards' ? 'tasks' : 'cards'; view.textContent = ui.view === 'cards' ? '☑ 待辦事項' : '▣ 病人卡'; view.setAttribute('aria-pressed', String(ui.view === 'tasks')); root.classList.toggle('handoff-tasks-active', ui.view === 'tasks'); renderCards(); }, 'handoff-task-toggle'); view.id = 'handoff-task-toggle'; view.setAttribute('aria-pressed', 'false'); find('handoff-views').append(sizes, view);
  const tools = find('handoff-tools');
  const aiButton = button('🤖', openAI, 'handoff-ai-trigger handoff-square'); aiButton.id = 'handoff-ai'; aiButton.setAttribute('aria-label', '開啟 AI 工具'); aiButton.title = 'AI 工具';
  const mode = button('連續模式', () => { editor.mode = editor.mode === 'individual' ? 'continuous' : 'individual'; editor.bookmark = null; editor.render(); mode.textContent = editor.mode === 'individual' ? '個別模式' : '連續模式'; mode.setAttribute('aria-pressed', String(editor.mode === 'continuous')); if (store.activeId) editor.select(store.activeId); }, 'handoff-square'); mode.id = 'handoff-mode'; mode.setAttribute('aria-pressed', 'true');
  const returnList = button('← 病人', () => setExpanded(true), 'handoff-square'); returnList.id = 'handoff-return-list';
  tools.append(returnList, aiButton, mode);
  for (const [color, title] of [['red', '紅色'], ['yellow', '黃色'], ['green', '綠色']]) {
    const item = button('▰', () => editor.applyColor(color), `handoff-highlight handoff-color-${color}`); item.id = `handoff-highlight-${color}`; item.dataset.highlight = color; item.title = `${title}螢光筆`; item.setAttribute('aria-label', `${title}螢光筆`); item.setAttribute('aria-pressed', 'false'); item.addEventListener('pointerdown', event => { editor.bookmark = editor.selection() || editor.bookmark; event.preventDefault(); }); tools.append(item);
  }
  const clearHighlight = button('無色', () => editor.applyColor(null)); clearHighlight.id = 'handoff-highlight-clear'; clearHighlight.addEventListener('pointerdown', event => { editor.bookmark = editor.selection() || editor.bookmark; event.preventDefault(); }); tools.append(clearHighlight);
  const pendingButton = button('{pending}', () => editor.insertPending()); pendingButton.id = 'handoff-pending'; pendingButton.addEventListener('pointerdown', event => { editor.bookmark = editor.selection() || editor.bookmark; event.preventDefault(); }); tools.append(pendingButton);
  const sexButton = button('性別', () => openMetadata('sex', '性別', [['男', '男 Male'], ['女', '女 Female']])); sexButton.id = 'handoff-sex'; sexButton.setAttribute('aria-haspopup', 'dialog');
  const dnrButton = button('DNR', () => openMetadata('codeStatus', 'DNR', [['DNR1', 'DNR1'], ['DNR2', 'DNR2'], ['DNR3', 'DNR3']])); dnrButton.id = 'handoff-dnr'; dnrButton.setAttribute('aria-haspopup', 'dialog'); tools.append(sexButton, dnrButton);
  const undo = button('↶ 復原', () => { if (!store.undo()) notice('目前沒有可復原的操作。'); }); undo.id = 'handoff-undo';
  const redo = button('↷', () => store.undo(true)); redo.id = 'handoff-redo'; redo.setAttribute('aria-label', '重做');
  const download = button('↓ 下載交班單', downloadAll, 'handoff-download'); download.id = 'handoff-download'; tools.append(undo, redo, download);
  editor.onPaint = color => tools.querySelectorAll('[data-highlight]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.highlight === color)));
  find('handoff-search').addEventListener('input', event => { ui.search = event.target.value.trim().toLowerCase(); renderCards(); });
  window.addEventListener('beforeunload', event => { if (store.patients.length) { event.preventDefault(); event.returnValue = ''; } });
  function updateActive(id) {
    for (const card of find('handoff-list').querySelectorAll('[data-card-patient]')) { const active = card.dataset.cardPatient === id; card.classList.toggle('active', active); card.querySelector('[data-open-patient]')?.setAttribute('aria-pressed', String(active)); }
    find('handoff-editor-status').textContent = store.active ? `${store.active.bed || '床號待補'} ${store.active.name} · ${pendingCount(store.active)} 項待辦` : '資料僅保留在此分頁';
    sexButton.textContent = store.active?.sex ? `性別：${store.active.sex}` : '性別'; dnrButton.textContent = store.active?.codeStatus ? `DNR：${store.active.codeStatus}` : 'DNR';
  }
  function setExpanded(expanded) {
    if (expanded && ui.minimized) setMinimized(false);
    ui.expanded = expanded; root.classList.toggle('handoff-expanded', expanded);
    expand.hidden = expanded; minimize.hidden = expanded; expand.setAttribute('aria-expanded', String(expanded)); shrink.hidden = !expanded;
    if (expanded) root.classList.remove('handoff-mobile-editor');
    renderCards(); requestAnimationFrame(() => editor.positionHandles());
  }
  function setMinimized(minimized) {
    ui.minimized = minimized; root.classList.toggle('handoff-minimized', minimized);
    minimize.hidden = minimized; restore.hidden = !minimized;
    if (minimized) root.classList.add('handoff-mobile-editor');
    else root.classList.remove('handoff-mobile-editor');
    renderCards(); requestAnimationFrame(() => editor.positionHandles());
    if (!minimized) minimize.focus({ preventScroll: true });
  }
  function selectPatient(id) { if (ui.expanded) setExpanded(false); editor.select(id); root.classList.add('handoff-mobile-editor'); renderToolbar(); }
  function renderToolbar() {
    const has = Boolean(store.active); for (const item of [aiButton, mode, pendingButton, clearHighlight, sexButton, dnrButton, ...tools.querySelectorAll('[data-highlight]')]) item.disabled = !has;
    download.disabled = !store.patients.length; undo.disabled = !store.history.length; redo.disabled = !store.future.length;
    undo.title = store.history.length ? `復原：${store.history.at(-1).label}` : '目前沒有可復原的操作'; updateActive(store.activeId);
  }
  function editSource(patient, lineId, text) {
    if (lineId === 'remark') { patient.quickRemark = text.replace(/\n/g, ' '); return; }
    const index = patient.lines.findIndex(item => item.id === lineId); if (index < 0) return;
    const old = patient.lines[index].text; let prefix = 0, suffix = 0;
    while (prefix < old.length && prefix < text.length && old[prefix] === text[prefix]) prefix++;
    while (suffix < old.length - prefix && suffix < text.length - prefix && old[old.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
    const offset = patient.lines.slice(0, index).reduce((sum, item) => sum + item.text.length + 1, 0);
    replaceText(patient, offset + prefix, offset + old.length - suffix, text.slice(prefix, text.length - suffix));
  }
  function renderCards() {
    if (listComposing) return;
    const list = find('handoff-list'), focused = document.activeElement;
    const focus = list.contains(focused) && focused.dataset.editField ? { patientId: focused.dataset.patientId, field: focused.dataset.editField, start: focused.selectionStart, end: focused.selectionEnd } : null;
    list.replaceChildren(); find('handoff-count').textContent = `${store.patients.length} 位病人`;
    find('handoff-sorts').querySelectorAll('[data-sort]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.sort === ui.sort)));
    const patients = sortPatients(store.patients, ui.sort).filter(patient => !ui.search || [patient.bed, patient.name, patient.mrn].join(' ').toLowerCase().includes(ui.search));
    let shown = 0;
    for (const patient of patients) {
      const tasks = tasksOf(patient); if (ui.view === 'tasks' && !ui.minimized && !tasks.length) continue; shown++;
      const card = node('article', `handoff-patient${patient.id === store.activeId ? ' active' : ''}`); card.dataset.cardPatient = patient.id;
      const top = node('div', 'handoff-card-top'), open = button('', () => selectPatient(patient.id), 'handoff-patient-open'); open.dataset.openPatient = ''; open.append(node('strong', 'handoff-bed', patient.bed || '床號待補'), node('span', 'handoff-name', patient.name || '姓名待補')); open.setAttribute('aria-pressed', String(patient.id === store.activeId));
      const edit = button('編輯', () => openPatient(patient), 'handoff-mini'); edit.setAttribute('aria-label', `編輯 ${patient.name} 病人資料`);
      const remove = button('×', () => confirmDelete(patient.id), 'handoff-delete'); remove.setAttribute('aria-label', `刪除病人 ${patient.bed} ${patient.name}`); remove.title = '刪除病人'; top.append(open, edit, remove); card.append(top);
      card.append(node('div', 'handoff-demographics', `病歷號 ${patient.mrn || '待補'} · ${patient.age || '年齡待補'}${patient.sex ? ' · ' + patient.sex : ''}${patient.codeStatus ? ' · ' + patient.codeStatus : ''}`));
      if (ui.view === 'cards') {
        const remark = focus?.patientId === patient.id && focus.field === 'remark' ? focused : node('input', 'handoff-remark'); remark.type = 'text'; remark.value = patient.quickRemark; remark.removeAttribute('placeholder'); remark.maxLength = 1000; remark.dataset.patientId = patient.id; remark.dataset.editField = 'remark'; remark.setAttribute('aria-label', `${patient.name} 快速註記`);
        remark.oninput = event => { const value = event.target.value; store.transaction('編輯快速註記', () => { patient.quickRemark = value; }); }; card.append(remark);
        const badges = node('div', 'handoff-badges'); if (tasks.some(task => task.important)) badges.append(node('span', 'handoff-important-badge', '! 重要')); if (pendingCount(patient)) badges.append(node('span', 'handoff-pending-badge', `${pendingCount(patient)} 項待辦`)); if (badges.childElementCount) card.append(badges);
        if (ui.expanded) {
          const details = node('div', 'handoff-card-details');
          for (const [section, title, limit] of [['HX', '病史', 2], ['CC', '現況', 3], ['A', '評估', 3], ['P', '計畫', 3]]) {
            let current = ''; const lines = [];
            for (const item of patient.lines) {
              const heading = sectionOf(item.text); if (heading) current = heading;
              if (current !== section) continue;
              const offset = heading ? item.text.match(/^\s*\[[^\]]+\]\s*:?\s*/)[0].length : 0;
              if (item.text.slice(offset).trim()) lines.push({ text: item.text.slice(offset), marks: item.marks.filter(mark => mark.end > offset).map(mark => ({ ...mark, start: Math.max(0, mark.start - offset), end: mark.end - offset })) });
            }
            if (lines.length) { const preview = node('section', 'handoff-card-section'); preview.append(node('h3', '', title)); lines.slice(0, limit).forEach(item => { const row = node('div'); appendMarked(row, item); preview.append(row); }); if (lines.length > limit) preview.append(node('div', 'handoff-detail-more', `另 ${lines.length - limit} 行`)); details.append(preview); }
          }
          if (details.childElementCount) card.append(details);
          if (tasks.length) { const preview = node('section', 'handoff-task-preview'); preview.append(node('h3', '', '待辦 / 重要註記')); tasks.forEach(task => preview.append(node('div', '', task.text))); card.append(preview); }
        }
      } else {
        for (const task of tasks) {
          const row = node('div', `handoff-task-row${task.important ? ' important' : ''}`);
          if (task.pending) {
            const check = node('input'); check.type = 'checkbox'; check.setAttribute('aria-label', `完成待辦 ${patient.name} ${task.text}`);
            check.addEventListener('change', () => { store.transaction('完成待辦並移至 [O]', () => completeTask(patient, task.lineId)); notice('已移至此病人的 [O]:。可按「復原」還原。'); }); row.append(check);
          } else row.append(node('span', 'handoff-task-important', '!'));
          const input = focus?.patientId === patient.id && focus.field === task.lineId ? focused : node('textarea', 'handoff-task-input'); input.rows = 2; input.value = task.text; input.dataset.patientId = patient.id; input.dataset.editField = task.lineId; input.setAttribute('aria-label', `${patient.name} ${task.pending ? '待辦' : '重要註記'}`);
          input.oninput = event => { const value = event.target.value; store.transaction('編輯待辦文字', () => editSource(patient, task.lineId, value)); }; row.append(input); card.append(row);
        }
      }
      list.append(card);
    }
    if (!shown) list.append(node('p', 'handoff-list-empty', !store.patients.length ? '尚無病人。匯入名單或手動新增。' : ui.view === 'tasks' ? '沒有符合的待辦或重要註記。' : '沒有符合的病人。'));
    if (focus) { const field = [...list.querySelectorAll('[data-edit-field]')].find(item => item.dataset.patientId === focus.patientId && item.dataset.editField === focus.field); if (field) { field.focus({ preventScroll: true }); field.setSelectionRange(Math.min(focus.start, field.value.length), Math.min(focus.end, field.value.length)); } }
  }
  function openMetadata(field, title, options) {
    const patient = store.active; if (!patient) return;
    const modal = dialog(title); modal.content.append(node('strong', 'handoff-confirm-identity', patientHeader(patient)));
    const choices = node('div', 'handoff-metadata-choices');
    for (const [value, text] of [...options, ['', '清除']]) {
      const choice = button(text, () => {
        const current = store.patients.find(p => p.id === patient.id); if (!current) { modal.close(); return; }
        store.transaction(`設定${title}`, () => { current[field] = value; }); modal.close();
      }); choice.setAttribute('aria-pressed', String(patient[field] === value)); choices.append(choice);
    }
    modal.content.append(choices);
  }
  function openPatient(patient) {
    const modal = dialog(patient ? '編輯病人資料' : '新增病人'); const form = node('form', 'handoff-form');
    const fields = {};
    for (const [key, title] of [['bed', '床號'], ['mrn', '病歷號'], ['name', '姓名'], ['age', '年齡'], ['sex', '性別（未提供可留空）'], ['codeStatus', 'DNR / code status（未提供可留空）'], ['quickRemark', '快速註記']]) { const field = labelInput(title, patient?.[key] || ''); field.input.maxLength = key === 'quickRemark' ? 1000 : 200; fields[key] = field.input; form.append(field.wrap); }
    const error = node('p', 'handoff-error'); error.setAttribute('role', 'alert'); modal.content.append(form, error);
    const save = button(patient ? '儲存' : '加入病人', submit, 'handoff-primary'); modal.footer.append(save);
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    function submit() {
      const data = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
      if (!data.name && !data.mrn) { error.textContent = '請至少輸入姓名或病歷號。'; return; }
      if (patient) {
        if (!store.patients.some(p => p.id === patient.id)) { error.textContent = '這位病人已被移除。'; return; }
        if (store.patients.some(p => p.id !== patient.id && data.mrn && p.mrn === data.mrn)) { error.textContent = '病歷號與其他病人重複，請先核對。'; return; }
        store.transaction('編輯病人資料', () => Object.assign(patient, data)); modal.close();
      } else {
        const candidate = createPatient(data); const plans = reconcile(store.patients, [candidate]);
        if (plans.some(plan => plan.kind !== 'add')) { modal.close(); openPreview({ patients: [candidate], warnings: [], format: '手動輸入' }); return; }
        store.transaction('新增病人', () => { store.patients.push(candidate); store.activeId = candidate.id; }); modal.close(); selectPatient(candidate.id);
      }
    }
  }
  function confirmDelete(id) {
    const patient = store.patients.find(p => p.id === id); if (!patient) return;
    let identity = patientHeader(patient); const modal = dialog('確認刪除病人');
    const banner = node('strong', 'handoff-confirm-identity', identity); const message = node('p', '', '確認後，此病人的卡片、筆記及待辦會從交班單與下載內容移除。刪除後仍可復原。'); modal.content.append(banner, message);
    const confirm = button('確認刪除', () => {
      const current = store.patients.find(p => p.id === id); if (!current) { modal.close(); return; }
      if (patientHeader(current) !== identity) { identity = patientHeader(current); banner.textContent = identity; message.textContent = '病人資料剛剛已更新，請再次核對後確認刪除。'; modal.cancel.focus(); return; }
      if (ai?.patientId === id) resetAI(null);
      store.remove(id); modal.close(); notice('病人已刪除。按工具列「復原」可還原完整筆記及待辦。');
    }, 'handoff-danger'); modal.footer.append(confirm); modal.cancel.focus();
  }
  function openImport() {
    const modal = dialog('匯入病人名單'); modal.element.classList.add('handoff-dialog-wide');
    const description = node('p', 'small', '支援急診 / 病房 CSV、病房文字及先前下載的交班單 TXT。先預覽，再套用；既有病人不會因為未列在新檔案而被刪除。');
    const upload = labelInput('上傳 CSV / TXT', '', 'file'); upload.input.accept = '.csv,.txt,.tsv,text/plain,text/csv';
    const paste = labelInput('或貼上名單', '', 'textarea'); paste.input.rows = 10; paste.input.placeholder = '貼上含欄位標題的名單，或病歷號:… 姓名:… 年齡:… 床號 入院日期:…';
    const formatWrap = node('label', 'handoff-field', '格式'), format = node('select'); for (const [value, title] of [['auto', '自動辨識'], ['csv', 'CSV'], ['tsv', 'Tab 分隔表格'], ['ward', '病房文字'], ['txt', '交班單 TXT']]) { const option = node('option', '', title); option.value = value; format.append(option); } formatWrap.append(format);
    const encodingWrap = node('label', 'handoff-field', '檔案編碼'), encoding = node('select'); for (const [value, title] of [['auto', '自動（UTF-8 → Big5）'], ['utf-8', 'UTF-8'], ['big5', 'Big5 / CP950'], ['utf-16le', 'UTF-16 LE']]) { const option = node('option', '', title); option.value = value; encoding.append(option); } encodingWrap.append(encoding);
    const error = node('p', 'handoff-error'); error.setAttribute('role', 'alert'); const mapping = node('div', 'handoff-column-mapping'); const mapped = {};
    let bytes = null, decoding = false;
    const read = () => { if (!bytes) return; try { paste.input.value = decodeFile(bytes, encoding.value); error.textContent = ''; } catch (cause) { error.textContent = cause.message; paste.input.value = ''; } };
    upload.input.addEventListener('change', async () => { const file = upload.input.files[0]; if (!file) return; if (file.size > 5_000_000) { error.textContent = '檔案上限為 5 MB。'; return; } decoding = true; try { bytes = await file.arrayBuffer(); read(); } catch { error.textContent = '無法讀取檔案。'; } finally { decoding = false; } }); encoding.addEventListener('change', read);
    modal.content.append(description, upload.wrap, paste.wrap, formatWrap, encodingWrap, mapping, error);
    modal.footer.append(button('預覽匯入', () => {
      if (decoding) { error.textContent = '正在讀取檔案，請稍候。'; return; }
      try {
        const parsed = parsePatients(paste.input.value, { format: format.value, mapping: Object.fromEntries(Object.entries(mapped).map(([key, input]) => [key, input.value])) });
        if (!parsed.patients.length) throw new Error('沒有可匯入的病人資料。');
        if (store.patients.length + reconcile(store.patients, parsed.patients).filter(plan => plan.kind === 'add').length > 1000) throw new Error('名單上限為 1,000 人，請分批處理。');
        modal.close(); openPreview(parsed);
      } catch (cause) {
        error.textContent = cause.message;
        if (cause.headers && !mapping.childNodes.length) {
          mapping.append(node('p', 'small', '請指定欄位對應，再按預覽。'));
          for (const [key, title] of [['bed', '床號'], ['mrn', '病歷號'], ['name', '姓名'], ['age', '年齡']]) {
            const wrap = node('label', 'handoff-field', title), select = node('select'); const blank = node('option', '', '未指定 / 自動'); blank.value = ''; select.append(blank);
            cause.headers.forEach((header, index) => { const option = node('option', '', header || `空欄位 ${index + 1}`); option.value = index; select.append(option); }); mapped[key] = select; wrap.append(select); mapping.append(wrap);
          }
        }
      }
    }, 'handoff-primary'));
  }
  function openPreview(parsed) {
    const modal = dialog(`匯入預覽 · ${parsed.format}`); modal.element.classList.add('handoff-dialog-wide');
    const revision = store.clock, plans = reconcile(store.patients, parsed.patients);
    const counts = Object.fromEntries(['add', 'update', 'same', 'conflict'].map(kind => [kind, plans.filter(plan => plan.kind === kind).length]));
    modal.content.append(node('p', 'handoff-import-summary', `新增 ${counts.add} · 更新 ${counts.update} · 已存在 ${counts.same} · 衝突 ${counts.conflict}`));
    if (parsed.warnings.length) modal.content.append(node('p', 'handoff-error', parsed.warnings.join('\n')));
    const preview = node('div', 'handoff-import-preview');
    for (const plan of plans) {
      const row = node('div', `handoff-import-row handoff-import-${plan.kind}`), incoming = plan.incoming, existing = store.patients.find(p => p.id === plan.targetId);
      row.append(node('strong', '', `${({ add: '新增', update: '更新', same: '已存在', conflict: '衝突待處理' })[plan.kind]} · ${incoming.bed || '床號待補'} ${incoming.name || '姓名待補'} · ${incoming.mrn || '病歷號待補'}`));
      if (existing) row.append(node('div', 'small', `既存：${existing.bed || '床號待補'} ${existing.name} · ${existing.mrn || '病歷號待補'}${existing.bed !== incoming.bed ? ' → 更新床號' : ''}`));
      if (plan.reason) row.append(node('p', 'handoff-error', plan.reason));
      if (plan.kind !== 'same') {
        const choice = node('select'); choice.setAttribute('aria-label', `${incoming.name} 匯入處理方式`);
        const choices = plan.kind === 'conflict' ? [['skip', '略過此筆'], ...(!store.patients.some(p => incoming.mrn && p.mrn === incoming.mrn) ? [['add', '已核對：新增為不同病人']] : [])] : [['apply', plan.kind === 'add' ? '加入病人' : '更新資料，保留目前筆記'], ['skip', '略過此筆']];
        for (const [value, title] of choices) { const option = node('option', '', title); option.value = value; choice.append(option); } choice.value = plan.choice; choice.addEventListener('change', () => { plan.choice = choice.value; }); row.append(choice);
      }
      if (plan.differentNote) {
        const details = node('details'), summary = node('summary', '', '比較既存與匯入筆記'); details.append(summary, node('h4', '', '目前筆記'), node('pre', '', patientHeader(existing) + '\n\n' + bodyText(existing)), node('h4', '', '匯入筆記'), node('pre', '', patientHeader(incoming) + '\n\n' + bodyText(incoming)));
        const checkWrap = node('label', 'handoff-inline-check'), check = node('input'); check.type = 'checkbox'; check.addEventListener('change', () => { plan.replaceNote = check.checked; }); checkWrap.append(check, document.createTextNode('已比較：以匯入完整筆記取代目前筆記（可復原）')); row.append(details, checkWrap);
      }
      preview.append(row);
    }
    const error = node('p', 'handoff-error'); modal.content.append(preview, error);
    modal.footer.append(button('套用勾選的匯入', () => {
      if (store.clock !== revision) { error.textContent = '名單在預覽後已變更，請關閉後重新匯入預覽。'; return; }
      applyPlans(store, plans); modal.close(); notice(`匯入完成，目前 ${store.patients.length} 位病人。既有筆記已保留。`);
    }, 'handoff-primary'));
  }
  function openDate(selection) {
    editor.bookmark = selection; const modal = dialog('插入日期'); let iso = taiwanDate();
    let committed = false;
    const patient = store.patients.find(p => p.id === selection.patientId), revision = patient?.noteRevision;
    if (!patient) { modal.close(); return; }
    const selected = bodyText(patient).slice(selection.start, selection.end);
    if (/^\d{1,2}\/\d{1,2}$/.test(selected)) { const [month, day] = selected.split('/'); const candidate = `${iso.slice(0, 4)}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; if (validDate(candidate)) iso = candidate; }
    const date = labelInput('日期（月/日）', displayDate(iso)), calendar = labelInput('選擇日期', iso, 'date');
    const step = amount => { iso = shiftDate(iso, amount); date.input.value = displayDate(iso); calendar.input.value = iso; };
    calendar.input.addEventListener('change', () => { if (validDate(calendar.input.value)) { iso = calendar.input.value; date.input.value = displayDate(iso); } });
    const arrows = node('div', 'handoff-date-steps'); arrows.append(button('← 前一天', () => step(-1)), button('後一天 →', () => step(1)));
    const error = node('p', 'handoff-error'); modal.content.append(date.wrap, arrows, calendar.wrap, node('p', 'small', '← / → 切換一天，Enter 插入，Esc 取消。'), error);
    const confirm = () => {
      const match = /^(\d{1,2})\/(\d{1,2})$/.exec(date.input.value.trim());
      const candidate = match && `${iso.slice(0, 4)}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      if (!candidate || !validDate(candidate)) { error.textContent = '請輸入有效的月/日，例如 10/18。'; return; }
      const current = store.patients.find(p => p.id === selection.patientId); if (!current || current.noteRevision !== revision) { error.textContent = '筆記已變更，請關閉後重新選擇插入位置。'; return; }
      const value = displayDate(candidate); committed = true; modal.close(); editor.change('插入日期', selection, p => replaceText(p, selection.start, selection.end, value), selection.start + value.length);
    };
    modal.footer.append(button('插入日期', confirm, 'handoff-primary'));
    modal.element.addEventListener('keydown', event => { if (event.target === calendar.input) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1); } if (event.key === 'Enter') { event.preventDefault(); confirm(); } });
    date.input.focus(); date.input.select();
    modal.element.addEventListener('close', () => { if (!committed && store.patients.some(p => p.id === selection.patientId)) editor.restore(selection); }, { once: true });
  }
  function validDate(value) { const date = new Date(`${value}T12:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }
  function openMove(patientId, blockId) {
    const patient = store.patients.find(p => p.id === patientId); if (!patient) return;
    const modal = dialog('移動區塊至章節'), select = node('select'); select.setAttribute('aria-label', '目的章節');
    patient.lines.forEach(item => { if (sectionOf(item.text)) { const option = node('option', '', item.text); option.value = item.id; select.append(option); } }); modal.content.append(select);
    modal.footer.append(button('移至這個章節', () => {
      const current = store.patients.find(p => p.id === patientId); if (!current) { modal.close(); return; }
      const index = current.lines.findIndex(item => item.id === select.value); if (index >= 0) store.transaction('移動區塊', () => moveBlock(current, blockId, index + 1)); modal.close();
    }, 'handoff-primary'));
  }
  function downloadAll() {
    if (!store.patients.length) return;
    const text = exportPatients(store.patients), url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(':', '');
    const anchor = node('a'); anchor.href = url; anchor.download = `交班單_${taiwanDate()}_${time}.txt`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); notice('已下載全部病人，依樓層 / 床號排序。');
  }
  function openAI() {
    if (!store.active) return;
    editor.bookmark = editor.selection() || editor.bookmark;
    if (!ai) buildAI();
    if (ai.patientId !== store.activeId) switchAIPatient(store.activeId);
    refreshAIPatients(); if (!ai.panel.open) ai.panel.showModal();
    ai.source.focus();
  }
  function resetAI(patientId) {
    if (!ai) return;
    if (request) { request.controller.abort('patient-change'); request = null; }
    ai.patientId = patientId; draft = null;
    ai.source.value = ''; ai.output.value = ''; ai.status.textContent = '';
    ai.source.readOnly = false; ai.run.disabled = !patientId; ai.cancel.disabled = true;
    ai.tabs.querySelectorAll('button').forEach(item => { item.disabled = false; }); renderDraft();
  }
  function switchAIPatient(id) {
    if (!store.patients.some(patient => patient.id === id)) return;
    resetAI(id); selectPatient(id); refreshAIPatients(); ai.source.focus();
  }
  function refreshAIPatients() {
    if (!ai) return;
    const patients = sortPatients(store.patients);
    if (ai.patientId && !patients.some(patient => patient.id === ai.patientId)) resetAI(null);
    ai.select.replaceChildren();
    if (!ai.patientId) { const option = node('option', '', '選擇病人'); option.value = ''; ai.select.append(option); }
    for (const patient of patients) { const option = node('option', '', patientHeader(patient)); option.value = patient.id; ai.select.append(option); }
    ai.select.value = ai.patientId || ''; ai.select.disabled = !patients.length;
    const index = patients.findIndex(patient => patient.id === ai.patientId);
    ai.previous.disabled = index <= 0; ai.next.disabled = index < 0 || index >= patients.length - 1;
    ai.run.disabled = Boolean(request) || index < 0;
    renderDraft();
  }
  function buildAI() {
    const panel = node('dialog', 'handoff-ai-panel'); panel.setAttribute('aria-labelledby', 'handoff-ai-title');
    const head = node('div', 'handoff-ai-head'), title = node('h2', '', '🤖 交班單 AI'), close = button('← 交班筆記', () => panel.close(), 'handoff-square'); title.id = 'handoff-ai-title'; close.setAttribute('aria-label', '返回交班筆記'); head.append(title, close);
    const navigation = node('div', 'handoff-ai-patient'), select = node('select'); select.id = 'handoff-ai-patient'; select.setAttribute('aria-label', 'AI 病人'); select.addEventListener('change', () => switchAIPatient(select.value));
    const stepPatient = step => { const patients = sortPatients(store.patients), index = patients.findIndex(p => p.id === ai.patientId), target = patients[index + step]; if (target) switchAIPatient(target.id); };
    const previous = button('← 上一位', () => stepPatient(-1)), next = button('下一位 →', () => stepPatient(1)); previous.id = 'handoff-ai-previous'; next.id = 'handoff-ai-next'; navigation.append(select, previous, next);
    const tabs = node('div', 'handoff-ai-tabs'), sourceField = labelInput('來源資料', '', 'textarea'); sourceField.input.rows = 12; sourceField.input.maxLength = 100000; sourceField.input.setAttribute('aria-label', '來源資料');
    const key = button('API key 設定', () => { panel.close(); openKeySettings(); });
    const run = button('整理', runAI, 'handoff-primary'), cancel = button('停止', () => request?.controller.abort()); cancel.disabled = true;
    const actions = node('div', 'handoff-ai-actions'); actions.append(run, cancel, key);
    const status = node('p', 'handoff-ai-status'); status.setAttribute('role', 'status');
    const outputField = labelInput('整理結果（可編輯）', '', 'textarea'); outputField.input.rows = 12; outputField.input.maxLength = 100000; const preview = node('pre', 'handoff-ai-preview');
    const copyAll = button('複製全部', () => { if (draft) copyText(draft.text); }), copyCurrent = button('Copy current', () => { const value = draft && currentOnly(draft.text); if (value !== null && value !== false) copyText(value); }), apply = button('檢視並套用', applyDraft, 'handoff-primary');
    const outputActions = node('div', 'handoff-ai-actions'); outputActions.append(copyAll, copyCurrent, apply);
    for (const [action, text] of [['handoff_convert', 'Note convert'], ['handoff_order', 'Order'], ['handoff_clean', 'Data cleaning']]) {
      const tab = button(text, () => { if (request) return; ui.aiAction = action; tabs.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.aiAction === action))); }); tab.dataset.aiAction = action; tab.setAttribute('aria-pressed', String(action === ui.aiAction)); tabs.append(tab);
    }
    const columns = node('div', 'handoff-ai-columns'), inputColumn = node('section', 'handoff-ai-column'), outputColumn = node('section', 'handoff-ai-column'); inputColumn.setAttribute('aria-label', 'AI 來源'); outputColumn.setAttribute('aria-label', 'AI 結果');
    inputColumn.append(sourceField.wrap, actions); outputColumn.append(outputField.wrap, preview, outputActions); columns.append(inputColumn, outputColumn);
    panel.append(head, navigation, tabs, status, columns); root.append(panel);
    ai = { panel, select, previous, next, source: sourceField.input, run, cancel, status, output: outputField.input, preview, copyAll, copyCurrent, apply, tabs, patientId: null };
    outputField.input.addEventListener('input', () => { if (draft) { draft.text = outputField.input.value; renderDraft(); } });
    panel.addEventListener('close', () => { if (aiButton.getClientRects().length) aiButton.focus({ preventScroll: true }); requestAnimationFrame(() => editor.positionHandles()); }); renderDraft();
  }
  async function runAI() {
    if (request || !ai.source.value.trim()) { if (!request) ai.status.textContent = '請先貼上來源資料。'; return; }
    const patient = store.patients.find(p => p.id === ai.patientId); if (!patient) { ai.status.textContent = '請選擇病人後重新開啟 AI。'; return; }
    const key = getKey(), controller = new AbortController();
    const captured = { patientId: patient.id, revision: patient.noteRevision, action: ui.aiAction, controller, identity: patientHeader(patient) }; request = captured;
    draft = null; ai.output.value = ''; renderDraft();
    ai.run.disabled = true; ai.cancel.disabled = false; ai.source.readOnly = true; ai.tabs.querySelectorAll('button').forEach(item => { item.disabled = true; }); ai.status.textContent = '正在整理…';
    const timeout = setTimeout(() => controller.abort('timeout'), 100000);
    const context = {
      patient: Object.fromEntries(['id', 'bed', 'mrn', 'name', 'age', 'sex', 'codeStatus', 'quickRemark'].map(field => [field, patient[field] || ''])),
      referenceDate: taiwanDate(), timezone: 'Asia/Taipei', sourceAsOf: patient.sourceAsOf || '', operation: captured.action === 'handoff_convert' ? 'revise' : 'create',
      ...(captured.action === 'handoff_convert' ? { existingNote: patientHeader(patient) + '\n\n' + bodyText(patient) } : {})
    };
    try {
      const response = await fetch(endpoint('/api/generate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: captured.action, notes: ai.source.value, handoffContext: context, ...(key ? { apiKey: key } : {}) }), signal: controller.signal, cache: 'no-store' });
      const result = await response.json(); if (request !== captured || ai.patientId !== captured.patientId) return;
      if (!response.ok) throw new Error(result.error?.message || '無法產生草稿。'); if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('AI 未傳回內容。');
      if (controller.signal.aborted || !store.patients.some(p => p.id === captured.patientId)) { ai.status.textContent = '病人已刪除，回應未套用。'; return; }
      draft = { ...captured, text: result.text, controller: undefined }; ai.output.value = result.text;
      ai.status.textContent = `整理完成：${captured.identity}`; renderDraft();
    } catch (cause) {
      if (request === captured) ai.status.textContent = !store.patients.some(p => p.id === captured.patientId) ? '病人已刪除，已停止生成並清除來源與草稿。' : controller.signal.aborted ? (controller.signal.reason === 'timeout' ? '請求逾時，來源及既有筆記已保留。' : '已停止，來源及既有筆記已保留。') : (cause.message || '無法連線至 AI 服務。');
    } finally {
      clearTimeout(timeout);
      if (request === captured) { request = null; ai.cancel.disabled = true; ai.source.readOnly = false; ai.tabs.querySelectorAll('button').forEach(item => { item.disabled = false; }); refreshAIPatients(); }
    }
  }
  function renderDraft() {
    if (!ai) return;
    ai.preview.replaceChildren(); const text = draft?.text || '';
    if (text) for (const item of fromPortable(text)) { const row = node('div'); appendMarked(row, item); ai.preview.append(row); }
    ai.copyAll.disabled = !text; ai.copyCurrent.hidden = draft?.action !== 'handoff_order'; ai.copyCurrent.disabled = !text || currentOnly(text) === null;
    ai.copyCurrent.title = text && currentOnly(text) === null ? '需要依序且各一次出現 [Current]、[History]、[Unclear]。' : '僅複製 Current 內容';
    ai.apply.hidden = !draft || draft.action === 'handoff_order'; ai.apply.disabled = !draft || draft.applied || draft.patientId !== ai.patientId || !store.patients.some(p => p.id === draft.patientId) || /^(Conversion|Cleaning|Order review) stopped:/.test(text);
    ai.apply.textContent = draft?.action === 'handoff_clean' ? (draft.applied ? '已插入 [O]' : '插入 [O]') : '檢視並套用';
  }
  function applyDraft() {
    if (!draft || draft.applied || draft.patientId !== ai.patientId) return; const captured = draft, patient = store.patients.find(p => p.id === captured.patientId); if (!patient) { ai.status.textContent = '病人已被刪除，無法套用。'; renderDraft(); return; }
    if (captured.action === 'handoff_clean') {
      if (!captured.text.trim() || /^Cleaning stopped:/.test(captured.text)) return;
      store.transaction('插入清理資料', () => insertObjective(patient, captured.text)); captured.applied = true;
      ai.status.textContent = `已插入 ${patient.bed} ${patient.name} 的 [O]，可在筆記使用「復原」。`; renderDraft(); return;
    }
    let converted;
    try {
      if (captured.action === 'handoff_convert') {
        converted = parseFullNote(captured.text);
        if ((patient.mrn && patient.mrn !== converted.mrn) || (patient.name && !sameName(patient.name, converted.name)) || (patient.bed && patient.bed !== converted.bed)) throw new Error('草稿病人身分與目前病人不符，請核對來源。');
        if (!['HX', 'CC', 'O', 'A', 'P', 'Medication'].every(section => converted.lines.some(item => sectionOf(item.text) === section))) throw new Error('草稿缺少必要的交班章節，請修正後重試。');
      }
    } catch (cause) { ai.status.textContent = cause.message; return; }
    const modal = dialog('比較並套用筆記'); modal.element.classList.add('handoff-dialog-wide');
    const revision = patient.noteRevision;
    modal.content.append(node('strong', '', patientHeader(patient)));
    if (revision !== captured.revision) modal.content.append(node('p', 'handoff-error', '草稿產生後，筆記已變更。以下顯示最新筆記，請核對差異後再確認。'));
    modal.content.append(node('h3', '', '目前筆記'), node('pre', 'handoff-comparison', bodyText(patient)), node('h3', '', '新筆記'), node('pre', 'handoff-comparison', bodyText(converted)));
    const error = node('p', 'handoff-error'); modal.content.append(error);
    modal.footer.append(button('確認套用至這位病人', () => {
      const current = store.patients.find(p => p.id === captured.patientId);
      if (!current || current.noteRevision !== revision) { error.textContent = '筆記在比較期間又有變更，請關閉後重新比較。'; return; }
      store.transaction('套用 AI 筆記', () => { current.lines = structuredClone(converted.lines); }); captured.applied = true;
      modal.close(); selectPatient(current.id); ai.status.textContent = '筆記已套用，可在筆記使用「復原」。'; renderDraft();
    }, 'handoff-primary'));
  }
  renderCards(); renderToolbar(); editor.render();
  return { refresh() { editor.positionHandles(); }, hasPatients: () => store.patients.length > 0 };
}
