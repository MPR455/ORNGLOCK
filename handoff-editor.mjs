import { DIVIDER, patientHeader, bodyText, cellsOf, linesFromCells, fromPortable, serializeLine, parsePortable, replaceText, highlight, blocksOf, moveBlock, sectionOf, bedCompare, locationOf } from './handoff-model.mjs';
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
export function appendMarked(node, item) {
  let at = 0;
  for (const mark of [...item.marks].sort((a, b) => a.start - b.start)) {
    node.append(document.createTextNode(item.text.slice(at, mark.start)));
    const span = el('mark', `handoff-mark handoff-mark-${mark.color}`, item.text.slice(mark.start, mark.end)); span.dataset.color = mark.color; node.append(span); at = mark.end;
  }
  node.append(document.createTextNode(item.text.slice(at))); if (!item.text) node.append(document.createElement('br'));
}
export class HandoffEditor {
  constructor(container, store, { onActive, onDate, onMove, onNotice }) {
    Object.assign(this, { container, store, onActive, onDate, onMove, onNotice }); this.mode = 'continuous'; this.paint = null; this.bookmark = null; this.composing = false;
    container.addEventListener('beforeinput', event => this.beforeInput(event));
    container.addEventListener('compositionstart', () => { this.composing = true; });
    container.addEventListener('compositionend', event => { this.composing = false; this.captureDom(event.target.closest('[data-editor]')); });
    container.addEventListener('input', event => { if (!this.composing) this.captureDom(event.target.closest('[data-editor]')); });
    container.addEventListener('paste', event => {
      const selection = this.selection(); if (!selection) return; event.preventDefault();
      const text = event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
      if (text.length > 100000 || bodyText(this.patient(selection.patientId)).length + text.length > 100000) { this.onNotice('筆記上限為 100,000 字元。'); return; }
      const cells = cellsOf(fromPortable(text)); this.change('貼上文字', selection, p => replaceText(p, selection.start, selection.end, '', cells), selection.start + cells.length);
    });
    for (const type of ['copy', 'cut']) container.addEventListener(type, event => {
      const selection = this.selection(); if (!selection || selection.start === selection.end) return;
      event.preventDefault(); const patient = this.patient(selection.patientId);
      const text = linesFromCells(cellsOf(patient.lines).slice(selection.start, selection.end)).map(serializeLine).join('\n'); event.clipboardData.setData('text/plain', text);
      if (type === 'cut') this.change('剪下文字', selection, p => replaceText(p, selection.start, selection.end, ''), selection.start);
    });
    container.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.setPaint(null); return; }
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); this.store.undo(event.shiftKey || event.key.toLowerCase() === 'y'); }
    });
    document.addEventListener('selectionchange', () => { const selection = this.selection(); if (selection) this.bookmark = selection; });
    container.addEventListener('pointerup', () => { if (this.drag) return; const selection = this.selection(); if (this.paint && selection && selection.start !== selection.end && !this.composing) this.applyColor(this.paint, selection); });
    container.addEventListener('focusin', event => { const host = event.target.closest('[data-editor]'); if (host && this.store.activeId !== host.dataset.patientId) { this.store.activeId = host.dataset.patientId; this.onActive(host.dataset.patientId); } });
    container.addEventListener('dragover', event => {
      const host = event.target.closest('[data-editor]');
      if (this.drag) { event.preventDefault(); const allowed = host?.dataset.patientId === this.drag.patientId; event.dataTransfer.dropEffect = allowed ? 'move' : 'none'; this.clearDrop(); if (allowed) { const target = this.dropPosition(event); target?.row.classList.add(target.after ? 'handoff-drop-after' : 'handoff-drop'); } }
    });
    container.addEventListener('drop', event => {
      const target = event.target.closest('[data-line-id]'), host = event.target.closest('[data-editor]');
      // Block native HTML drops and UUID text insertion into a different patient's note.
      event.preventDefault();
      if (!this.drag || !host || host.dataset.patientId !== this.drag.patientId) { this.clearDrop(); return; }
      event.preventDefault(); const patient = this.patient(this.drag.patientId); const position = this.dropPosition(event); const index = position?.index ?? -1;
      const drag = this.drag; this.drag = null; this.clearDrop();
      if (index >= 0) this.store.transaction('移動區塊', () => moveBlock(patient, drag.blockId, index));
    });
    container.addEventListener('dragend', () => { this.drag = null; this.clearDrop(); });
    this.resize = new ResizeObserver(() => this.positionHandles()); this.resize.observe(container);
    let timer;
    container.addEventListener('scroll', () => {
      if (this.mode !== 'continuous' || Date.now() < (this.navigationUntil || 0)) return;
      clearTimeout(timer); timer = setTimeout(() => {
        const top = container.getBoundingClientRect().top + 60;
        const sections = [...container.querySelectorAll('[data-note-patient]')];
        const selected = sections.find(section => section.getBoundingClientRect().bottom > top) || sections.at(-1);
        if (selected && this.store.activeId !== selected.dataset.notePatient) { this.store.activeId = selected.dataset.notePatient; this.onActive(this.store.activeId); }
      }, 70);
    });
  }
  patient(id) { return this.store.patients.find(patient => patient.id === id); }
  clearDrop() { this.container.querySelectorAll('.handoff-drop,.handoff-drop-after').forEach(node => node.classList.remove('handoff-drop', 'handoff-drop-after')); }
  dropPosition(event) {
    const row = event.target.closest('[data-line-id]'), host = event.target.closest('[data-editor]');
    const patient = this.drag && this.patient(this.drag.patientId);
    if (!row || !patient || host?.dataset.patientId !== patient.id) return null;
    const index = patient.lines.findIndex(item => item.id === row.dataset.lineId);
    if (index < 0) return null;
    const block = blocksOf(patient).find(block => index >= block.start && index < block.end);
    const first = block ? host.children[block.start] : row, last = block ? host.children[block.end - 1] : row;
    const after = event.clientY > (first.getBoundingClientRect().top + last.getBoundingClientRect().bottom) / 2;
    return { index: block ? (after ? block.end : block.start) : index + (after ? 1 : 0), row: after ? last : first, after };
  }
  host(id) { return [...this.container.querySelectorAll('[data-editor]')].find(node => node.dataset.patientId === id); }
  selection() {
    const selection = window.getSelection(); if (!selection?.rangeCount) return null;
    const hostOf = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest('[data-editor]');
    const first = hostOf(selection.anchorNode), last = hostOf(selection.focusNode);
    if (!first || !last || first !== last) return null;
    const position = (node, offset) => {
      const row = (node.nodeType === 1 ? node : node.parentElement).closest('[data-line-id]');
      if (!row) {
        if (node === first) return [...first.children].slice(0, offset).reduce((sum, child) => sum + child.textContent.length + 1, 0);
        return 0;
      }
      let prefix = 0; for (const child of first.children) { if (child === row) break; prefix += child.textContent.length + 1; }
      const range = document.createRange(); range.selectNodeContents(row); try { range.setEnd(node, offset); } catch { return prefix; }
      return prefix + range.toString().length;
    };
    const anchor = position(selection.anchorNode, selection.anchorOffset), focus = position(selection.focusNode, selection.focusOffset);
    return { patientId: first.dataset.patientId, start: Math.min(anchor, focus), end: Math.max(anchor, focus), backward: anchor > focus };
  }
  restore(bookmark, focus = true) {
    const host = bookmark && this.host(bookmark.patientId); if (!host) return;
    const point = offset => {
      let remaining = offset;
      for (const row of host.children) {
        if (remaining <= row.textContent.length) {
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT); let node;
          while ((node = walker.nextNode())) { if (remaining <= node.length) return [node, remaining]; remaining -= node.length; }
          return [row, 0];
        }
        remaining -= row.textContent.length + 1;
      }
      return [host.lastChild || host, host.lastChild?.childNodes.length || 0];
    };
    const [start, a] = point(bookmark.start), [end, b] = point(bookmark.end);
    if (focus) host.focus({ preventScroll: true });
    const selection = window.getSelection(); selection.removeAllRanges();
    if (bookmark.backward && selection.setBaseAndExtent) selection.setBaseAndExtent(end, b, start, a);
    else { const range = document.createRange(); range.setStart(start, a); range.setEnd(end, b); selection.addRange(range); }
    this.bookmark = bookmark;
  }
  render() {
    if (this.composing) return;
    const deliberate = this.nextBookmark;
    const focusedEditor = document.activeElement?.closest?.('[data-editor]');
    const bookmark = deliberate || (focusedEditor && this.container.contains(focusedEditor) ? this.selection() : null);
    const focusedHandle = document.activeElement?.dataset?.blockId;
    this.nextBookmark = null;
    const scroll = this.container.scrollTop;
    const patients = this.mode === 'continuous' ? [...this.store.patients].sort(bedCompare) : this.store.active ? [this.store.active] : [];
    const existing = new Map([...this.container.querySelectorAll('[data-note-patient]')].map(section => [section.dataset.notePatient, section]));
    const floors = new Map([...this.container.querySelectorAll('[data-floor]')].map(element => [element.dataset.floor, element]));
    const desired = []; let group = '';
    for (const patient of patients) {
      const location = locationOf(patient).label;
      if (this.mode === 'continuous' && group !== location) {
        let heading = floors.get(location); if (!heading) { heading = el('h3', 'handoff-floor', location); heading.dataset.floor = location; }
        desired.push(heading); group = location;
      }
      let section = existing.get(patient.id);
      if (!section) {
        section = el('section', 'handoff-note'); section.dataset.notePatient = patient.id;
        const divider = el('div', 'handoff-divider', DIVIDER), header = el('div', 'handoff-note-header'), wrap = el('div', 'handoff-body-wrap'), gutter = el('div', 'handoff-gutter'), host = el('div', 'handoff-editable');
        host.contentEditable = 'true'; host.spellcheck = false; host.dataset.editor = ''; host.dataset.patientId = patient.id; host.setAttribute('role', 'textbox'); host.setAttribute('aria-multiline', 'true');
        wrap.append(gutter, host); section.append(divider, header, wrap);
      }
      section.querySelector('.handoff-divider').hidden = this.mode !== 'continuous';
      const header = section.querySelector('.handoff-note-header'), headerText = patientHeader(patient);
      if (header._source !== headerText) { header.replaceChildren(); appendMarked(header, parsePortable(headerText)); header._source = headerText; }
      const host = section.querySelector('[data-editor]'), gutter = section.querySelector('.handoff-gutter');
      host.setAttribute('aria-label', `${patient.bed} ${patient.name} 病人筆記`);
      const oldRows = new Map([...host.children].map(row => [row.dataset.lineId, row])); const rows = []; let color = 'HX';
      for (const item of patient.lines) {
        color = sectionOf(item.text) || color;
        let row = oldRows.get(item.id); if (!row) { row = el('div'); row.dataset.lineId = item.id; }
        row.className = `handoff-line handoff-section-${color}`;
        const signature = JSON.stringify([item.text, item.marks]);
        if (row._signature !== signature) { row.replaceChildren(); appendMarked(row, item); row._signature = signature; }
        rows.push(row);
      }
      this.reconcileChildren(host, rows);
      gutter.replaceChildren();
      for (const block of blocksOf(patient)) {
        const handle = el('button', 'handoff-drag', '⠿'); handle.type = 'button'; handle.draggable = true; handle.dataset.blockId = block.id; handle.dataset.patientId = patient.id;
        handle.title = '拖曳區塊；Alt+↑/↓移動；點擊選擇章節'; handle.setAttribute('aria-label', `移動區塊：${patient.lines[block.start].text.slice(0, 40)}`);
        handle.addEventListener('dragstart', event => { this.drag = { patientId: patient.id, blockId: block.id }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', block.id); });
        handle.addEventListener('click', () => this.onMove(patient.id, block.id));
        handle.addEventListener('keydown', event => {
          if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); const blocks = blocksOf(patient), index = blocks.findIndex(b => b.id === block.id); const target = event.key === 'ArrowUp' ? blocks[index - 1]?.start : blocks[index + 1]?.end; if (target !== undefined) this.store.transaction('移動區塊', () => moveBlock(patient, block.id, target)); }
        }); gutter.append(handle);
      }
      desired.push(section);
    }
    if (!patients.length) { const empty = el('div', 'handoff-editor-empty'); empty.append(el('span', 'handoff-empty-symbol', '✎'), el('h2', '', '開始建立交班單'), el('p', '', '匯入 CSV / TXT、貼上病房名單，或新增病人。'), el('p', 'small', '病人資料保留在此分頁；請下載 TXT 備份。')); desired.push(empty); }
    this.reconcileChildren(this.container, desired);
    this.container.scrollTop = scroll; this.positionHandles();
    if (bookmark) this.restore(bookmark, true);
    else if (focusedHandle) this.container.querySelector(`[data-block-id="${focusedHandle}"]`)?.focus({ preventScroll: true });
  }
  reconcileChildren(parent, desired) {
    desired.forEach((child, index) => { if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] || null); });
    const keep = new Set(desired); for (const child of [...parent.childNodes]) if (!keep.has(child)) child.remove();
  }
  positionHandles() {
    for (const button of this.container.querySelectorAll('[data-block-id]')) {
      const host = this.host(button.dataset.patientId); const row = [...host.children].find(item => item.dataset.lineId === button.dataset.blockId);
      if (row) button.style.top = `${row.offsetTop}px`;
    }
  }
  select(id) {
    this.store.activeId = id; this.bookmark = null;
    if (this.mode === 'individual') this.render();
    else { this.navigationUntil = Date.now() + 500; const target = [...this.container.querySelectorAll('[data-note-patient]')].find(node => node.dataset.notePatient === id); if (target) this.container.scrollTop += target.getBoundingClientRect().top - this.container.getBoundingClientRect().top - 38; }
    this.onActive(id);
  }
  change(label, selection, mutate, caret) {
    const patient = this.patient(selection.patientId); if (!patient) return;
    this.nextBookmark = { ...selection, start: caret ?? selection.start, end: caret ?? selection.end };
    const changed = this.store.transaction(label, () => mutate(patient)); if (!changed) { this.restore(this.nextBookmark); this.nextBookmark = null; }
  }
  beforeInput(event) {
    if (this.composing || event.isComposing || event.inputType === 'insertCompositionText') return;
    const selection = this.selection(); if (!selection) return;
    const patient = this.patient(selection.patientId), text = bodyText(patient);
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); this.store.undo(event.inputType === 'historyRedo'); return; }
    let insert = null, start = selection.start, end = selection.end;
    if (event.inputType === 'insertText') insert = event.data || '';
    else if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) insert = '\n';
    else if (event.inputType.startsWith('delete')) {
      insert = '';
      if (start === end) {
        if (/Backward$/.test(event.inputType)) { start = Math.max(0, start - (/[\uDC00-\uDFFF]/.test(text[start - 1] || '') ? 2 : 1)); if (event.inputType.includes('Word')) { while (start > 0 && !/\s/.test(text[start - 1])) start--; } }
        else if (/Forward$/.test(event.inputType)) { end = Math.min(text.length, end + (/[\uD800-\uDBFF]/.test(text[end] || '') ? 2 : 1)); if (event.inputType.includes('Word')) { while (end < text.length && !/\s/.test(text[end])) end++; } }
        else return;
      }
    } else return;
    event.preventDefault();
    if (insert === '@' && (start !== end || start === 0 || /[\s(]/.test(text[start - 1]))) { this.onDate(selection); this.typingMarker = null; return; }
    if (text.length - (end - start) + insert.length > 100000) { this.onNotice('筆記上限為 100,000 字元。'); return; }
    const marker = this.typingMarker;
    let colorRange = null;
    if (marker && marker.patientId === patient.id && marker.next === start && start === end && insert === marker.char) {
      const raw = text.slice(marker.start, start) + insert, parsed = parsePortable(raw);
      if (parsed.marks.length === 1 && parsed.text.length === raw.length - 2) colorRange = { start: marker.start, parsed };
    }
    if (colorRange) {
      const cells = cellsOf(fromPortable(text.slice(colorRange.start, start) + insert));
      this.change('輸入螢光標示', selection, p => replaceText(p, colorRange.start, end, '', cells), colorRange.start + cells.length); this.typingMarker = null;
    } else {
      this.change('編輯筆記', selection, p => replaceText(p, start, end, insert), start + insert.length);
      if (marker && marker.patientId === patient.id && marker.next === start && start === end && !insert.includes('\n')) marker.next = start + insert.length;
      else this.typingMarker = null;
      if (['/', '%', '\\'].includes(insert) && (start === 0 || /[\s(]/.test(text[start - 1])) && start === end) this.typingMarker = { patientId: patient.id, start, next: start + 1, char: insert };
    }
  }
  captureDom(host) {
    if (!host) return;
    const patient = this.patient(host.dataset.patientId); if (!patient) return;
    const cells = [];
    const visit = (node, color = null) => {
      if (node.nodeType === Node.TEXT_NODE) { for (const char of node.data.split('')) cells.push({ char, color }); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') { if (node.parentNode.childNodes.length > 1) cells.push({ char: '\n', color: null }); return; }
      const block = ['DIV', 'P'].includes(node.tagName);
      if (block && cells.length && cells.at(-1).char !== '\n') cells.push({ char: '\n', color: null });
      for (const child of node.childNodes) visit(child, node.dataset.color || color);
    };
    for (const [index, node] of [...host.childNodes].entries()) {
      if (index) cells.push({ char: '\n', color: null });
      visit(node);
    }
    const lines = linesFromCells(cells, patient.lines);
    if (JSON.stringify(lines.map(({ text, marks }) => ({ text, marks }))) === JSON.stringify(patient.lines.map(({ text, marks }) => ({ text, marks })))) return;
    if (cells.length > 100000) { this.onNotice('筆記上限為 100,000 字元。'); this.render(); return; }
    this.nextBookmark = this.selection(); this.store.transaction('編輯筆記', () => { patient.lines = lines; });
  }
  applyColor(color, selection = this.selection() || this.bookmark) {
    if (!selection || selection.start === selection.end) { if (color) this.setPaint(this.paint === color ? null : color); else this.onNotice('請先選取要清除螢光標示的文字。'); return; }
    if (!this.patient(selection.patientId)) return;
    this.bookmark = selection; this.change('螢光標示', selection, p => highlight(p, selection.start, selection.end, color), undefined);
  }
  setPaint(color) { this.paint = color; this.container.classList.toggle('handoff-painting', Boolean(color)); this.container.dataset.paint = color || ''; this.onPaint?.(color); }
  insertPending() {
    let selection = this.selection() || this.bookmark;
    if (!selection || !this.patient(selection.patientId)) { const p = this.store.active; if (!p) return; selection = { patientId: p.id, start: bodyText(p).length, end: bodyText(p).length }; }
    const patient = this.patient(selection.patientId), text = bodyText(patient);
    const end = text.indexOf('\n', selection.end), lineEnd = end < 0 ? text.length : end, lineStart = text.lastIndexOf('\n', selection.start - 1) + 1;
    if (/(?<!\{)\{pending\}(?!\})/.test(text.slice(lineStart, lineEnd))) { this.onNotice('這一行已經有 {pending}。'); return; }
    this.change('加入待辦', selection, p => replaceText(p, lineEnd, lineEnd, ' {pending}'), lineEnd + 10);
  }
}
