const base = new URL('./', import.meta.url);
let rendererPromise;
function viewerStyles() {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('vendor/manuals/pdf_viewer.css', base).href;
    link.onload = resolve; link.onerror = () => { link.remove(); reject(new Error('Viewer styles unavailable')); };
    document.head.append(link);
  });
}
async function pdfRenderer() {
  if (!rendererPromise) rendererPromise = (async () => {
    const pdfjs = await import(new URL('vendor/manuals/pdf.min.mjs', base).href);
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/manuals/pdf.worker.min.mjs', base).href;
    const [components] = await Promise.all([import(new URL('vendor/manuals/pdf_viewer.mjs', base).href), viewerStyles()]);
    return { pdfjs, components };
  })().catch(error => { rendererPromise = null; throw error; });
  return rendererPromise;
}
const icons = {
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3z"/><path d="M3 6V4h7l2 2"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v15H5z"/><path d="M14 2v6h5M8 12h8M8 16h8"/></svg>'
};
function icon(kind) { const span = document.createElement('span'); span.className = 'manuals-file-icon'; span.innerHTML = icons[kind]; return span; }
const sizeLabel = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function initManuals({ toast = () => {} } = {}) {
  const root = document.getElementById('tab-manuals');
  root.innerHTML = `
    <div class="manuals-explorer">
      <div class="manuals-address">
        <button class="manuals-root" type="button" aria-label="返回所有科別">${icons.folder}<span>工作手冊</span></button>
        <span class="manuals-invitation">(如果有新的檔案請寄給我)</span>
        <span class="manuals-current-path" hidden><span aria-hidden="true">›</span> <span></span></span>
      </div>
      <div class="manuals-explorer-body">
        <nav class="manuals-folders" aria-label="科別資料夾"></nav>
        <div class="manuals-file-pane">
          <div class="manuals-file-columns" aria-hidden="true"><span>名稱</span><span>類型</span><span>大小</span></div>
          <div class="manuals-documents" role="group" aria-label="資料夾內容"></div>
        </div>
      </div>
      <button class="manuals-btn manuals-retry" type="button" hidden>重新載入</button>
    </div>
    <section class="manuals-viewer" aria-label="PDF 檢視器" hidden>
      <div class="manuals-toolbar" role="toolbar" aria-label="PDF 操作">
        <div class="manuals-toolbar-scroll" tabindex="0" aria-label="PDF 工具列，可橫向捲動">
        <div class="manuals-pager"><input class="manuals-page-number" type="number" min="1" value="1" inputmode="numeric" aria-label="頁碼"><output class="manuals-total" aria-label="總頁數">/ 0</output></div>
        <div class="manuals-search" role="search" aria-label="搜尋 PDF 文字">
          <input type="search" aria-label="搜尋 PDF 文字" placeholder="搜尋文字" autocomplete="off" spellcheck="false">
          <output class="manuals-matches" aria-live="polite"></output>
          <button class="manuals-btn" type="button" data-find="prev" aria-label="上一個搜尋結果">↑</button>
          <button class="manuals-btn" type="button" data-find="next" aria-label="下一個搜尋結果">↓</button>
        </div>
        <select class="manuals-btn manuals-zoom" aria-label="縮放"><option value="page-width">適合寬度</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select>
        <a class="manuals-btn manuals-download" download>下載</a>
        <button class="manuals-btn manuals-focus" type="button" aria-pressed="false">⛶ 專注模式</button>
        </div>
        <button class="manuals-btn manuals-close" type="button" aria-label="關閉 PDF，返回資料夾" title="關閉 PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="manuals-viewport"><div class="manuals-stage" tabindex="0" aria-label="PDF 頁面" aria-busy="false"><div class="pdfViewer manuals-pages"></div></div></div>
    </section>
    <p class="manuals-error" role="alert" hidden></p>`;
  const $ = selector => root.querySelector(selector);
  const folders = $('.manuals-folders'), documents = $('.manuals-documents'), viewer = $('.manuals-viewer');
  const stage = $('.manuals-stage'), pages = $('.manuals-pages'), pageInput = $('.manuals-page-number'), total = $('.manuals-total'), zoom = $('.manuals-zoom');
  const download = $('.manuals-download'), focus = $('.manuals-focus'), error = $('.manuals-error'), retry = $('.manuals-retry');
  const search = $('.manuals-search input'), matches = $('.manuals-matches'), currentPath = $('.manuals-current-path');
  let catalog, catalogPromise, folderId = '', selected, pdf, loadingTask, pdfView, eventBus, linkService;
  let requestId = 0, focusMode = false, savedScroll = 0, resizeTimer;

  function showError(message = '') { error.textContent = message; error.hidden = !message; }
  function controls() {
    pageInput.disabled = zoom.disabled = search.disabled = !pdf;
    pageInput.max = String(pdf?.numPages || 1);
    if (document.activeElement !== pageInput) pageInput.value = String(pdfView?.currentPageNumber || 1);
    total.value = `/ ${pdf?.numPages || 0}`;
    for (const button of root.querySelectorAll('[data-find]')) button.disabled = !pdf || !search.value.trim();
  }
  function row(name, kind, type, size, activate) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'manuals-file-row';
    const label = document.createElement('span'); label.className = 'manuals-file-name'; label.append(icon(kind), document.createTextNode(name));
    const format = document.createElement('span'); format.className = 'manuals-file-type'; format.textContent = type;
    const bytes = document.createElement('span'); bytes.className = 'manuals-file-size'; bytes.textContent = size;
    button.append(label, format, bytes); button.addEventListener('click', activate); return button;
  }
  function renderDocuments() {
    documents.replaceChildren();
    const folder = catalog?.folders.find(item => item.id === folderId);
    currentPath.hidden = !folder;
    currentPath.lastElementChild.textContent = folder?.name || '';
    if (!folder) {
      for (const folder of catalog?.folders || []) {
        const button = row(folder.name, 'folder', '資料夾', '', () => chooseFolder(folder.id));
        button.classList.add('manuals-directory'); button.dataset.openFolder = folder.id; documents.append(button);
      }
      return;
    }
    for (const file of folder.documents) {
      const button = row(file.name, 'file', 'PDF', sizeLabel(file.bytes), () => { void openManual(file); });
      button.classList.add('manuals-document'); button.dataset.manualId = file.id;
      button.setAttribute('aria-pressed', String(selected?.id === file.id)); documents.append(button);
    }
  }
  function chooseFolder(id = '') {
    folderId = id;
    for (const button of folders.children) button.setAttribute('aria-pressed', String(button.dataset.folderId === id));
    renderDocuments();
  }
  async function loadCatalog() {
    if (catalog) return;
    if (catalogPromise) return catalogPromise;
    retry.hidden = true; folders.setAttribute('aria-busy', 'true'); showError();
    catalogPromise = (async () => {
      const response = await fetch(new URL('manuals/catalog.json', base), { cache: 'no-cache' });
      if (!response.ok) throw new Error('Catalog unavailable');
      const next = await response.json(); if (!Array.isArray(next.folders)) throw new Error('Invalid catalog');
      catalog = next; folders.replaceChildren();
      for (const folder of catalog.folders) {
        const button = document.createElement('button'); button.className = 'manuals-folder'; button.type = 'button';
        const label = document.createElement('span'); label.textContent = folder.name;
        const count = document.createElement('span'); count.className = 'manuals-folder-count'; count.textContent = folder.documents.length;
        button.append(icon('folder'), label, count); button.dataset.folderId = folder.id; button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => chooseFolder(folder.id)); folders.append(button);
      }
      renderDocuments();
    })().catch(() => { showError('無法載入目錄'); retry.hidden = false; }).finally(() => { catalogPromise = null; folders.removeAttribute('aria-busy'); });
    return catalogPromise;
  }
  function applyZoom() {
    if (!pdfView || !pdf || !root.classList.contains('active')) return;
    pdfView.currentScaleValue = zoom.value; pdfView.update();
  }
  function updateMatches(count = { current: 0, total: 0 }) {
    matches.value = search.value.trim() ? `${count.current} / ${count.total}` : '';
    matches.dataset.total = String(count.total);
  }
  async function ensureViewer() {
    const { pdfjs, components } = await pdfRenderer();
    if (!pdfView) {
      eventBus = new components.EventBus();
      linkService = new components.PDFLinkService({ eventBus, externalLinkTarget: components.LinkTarget.BLANK, externalLinkRel: 'noopener noreferrer' });
      const findController = new components.PDFFindController({ eventBus, linkService });
      pdfView = new components.PDFViewer({ container: stage, viewer: pages, eventBus, linkService, findController,
        textLayerMode: 1, annotationMode: pdfjs.AnnotationMode.ENABLE, removePageBorders: true,
        imageResourcesPath: new URL('vendor/manuals/images/', base).href, maxCanvasPixels: 16_000_000 });
      pdfView.scrollMode = components.ScrollMode.VERTICAL; linkService.setViewer(pdfView);
      eventBus.on('pagesinit', () => { applyZoom(); controls(); });
      eventBus.on('pagechanging', () => controls());
      eventBus.on('pagerendered', event => {
        if (event.error) { showError('無法顯示此頁 PDF'); return; }
        stage.setAttribute('aria-busy', 'false'); stage.dataset.renderedPage = String(event.pageNumber);
      });
      eventBus.on('updatefindmatchescount', event => updateMatches(event.matchesCount));
      eventBus.on('updatefindcontrolstate', event => {
        search.setAttribute('aria-invalid', String(event.state === components.FindState.NOT_FOUND)); updateMatches(event.matchesCount);
      });
    }
    return pdfjs;
  }
  async function openManual(file) {
    if (selected?.id === file.id && pdf) { viewer.scrollIntoView({ block: 'start' }); return; }
    const current = ++requestId, previousTask = loadingTask;
    pdfView?.setDocument(null); linkService?.setDocument(null); loadingTask = null; pdf = null; selected = file;
    zoom.value = 'page-width'; search.value = ''; updateMatches(); search.removeAttribute('aria-invalid');
    delete stage.dataset.renderedPage; viewer.hidden = false; showError(); renderDocuments(); controls();
    const url = new URL(file.file, base); url.searchParams.set('v', file.revision);
    download.href = url.href; download.download = `${file.name.split(' / ').at(-1)}.pdf`;
    stage.setAttribute('aria-busy', 'true'); viewer.scrollIntoView({ block: 'start' });
    try {
      await previousTask?.destroy(); const pdfjs = await ensureViewer(); if (current !== requestId) return;
      const assets = new URL('vendor/manuals/', base);
      const task = pdfjs.getDocument({ url: url.href, cMapUrl: new URL('cmaps/', assets).href, cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', assets).href, wasmUrl: new URL('wasm/', assets).href, iccUrl: new URL('iccs/', assets).href,
        disableAutoFetch: true, disableStream: true, rangeChunkSize: 131072, isEvalSupported: false, disableWorkerRendering: true });
      loadingTask = task; const loaded = await task.promise;
      if (current !== requestId) { await task.destroy(); return; }
      pdf = loaded; linkService.setDocument(pdf); pdfView.setDocument(pdf); controls(); stage.scrollTo(0, 0);
    } catch (cause) {
      if (current === requestId) { stage.setAttribute('aria-busy', 'false'); showError('無法開啟 PDF'); toast('無法開啟 PDF'); }
    }
  }
  function find(type = '', previous = false) {
    if (!pdf || !eventBus) return;
    eventBus.dispatch('find', { source: root, type, query: search.value, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
    controls(); if (!search.value.trim()) updateMatches();
  }
  async function closeManual() {
    requestId++;
    const task = loadingTask, closedId = selected?.id;
    loadingTask = null; pdf = null; selected = null;
    pdfView?.setDocument(null); linkService?.setDocument(null); exitFocus();
    viewer.hidden = true; stage.setAttribute('aria-busy', 'false'); delete stage.dataset.renderedPage;
    search.value = ''; updateMatches(); search.removeAttribute('aria-invalid');
    download.removeAttribute('href'); showError(); controls(); renderDocuments();
    const returnTarget = [...documents.children].find(button => button.dataset.manualId === closedId) || $('.manuals-root');
    $('.manuals-explorer').scrollIntoView({ block: 'start' }); returnTarget.focus({ preventScroll: true });
    try { await task?.destroy(); } catch { /* A closing document may already have been cancelled. */ }
  }
  function exitFocus() {
    if (!focusMode) return;
    focusMode = false; document.body.classList.remove('manuals-focus'); focus.textContent = '⛶ 專注模式'; focus.setAttribute('aria-pressed', 'false');
    window.scrollTo(0, savedScroll); focus.focus({ preventScroll: true }); applyZoom();
  }
  focus.addEventListener('click', () => {
    if (focusMode) { exitFocus(); return; }
    savedScroll = window.scrollY; focusMode = true; document.body.classList.add('manuals-focus');
    focus.textContent = '⛶ 退出專注'; focus.setAttribute('aria-pressed', 'true'); applyZoom();
  });
  pageInput.addEventListener('change', () => {
    const page = Number(pageInput.value);
    if (pdfView && pdf && Number.isInteger(page)) pdfView.currentPageNumber = Math.max(1, Math.min(pdf.numPages, page));
    controls();
  });
  pageInput.addEventListener('keydown', event => { if (event.key === 'Enter') pageInput.dispatchEvent(new Event('change')); });
  zoom.addEventListener('change', applyZoom);
  $('.manuals-close').addEventListener('click', () => { void closeManual(); });
  search.addEventListener('input', () => find());
  search.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); find('again', event.shiftKey); } });
  $('[data-find="prev"]').addEventListener('click', () => find('again', true));
  $('[data-find="next"]').addEventListener('click', () => find('again'));
  $('.manuals-root').addEventListener('click', () => chooseFolder());
  retry.addEventListener('click', () => { void loadCatalog(); });
  document.addEventListener('keydown', event => {
    if (!root.classList.contains('active')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && pdf) { event.preventDefault(); search.focus(); search.select(); }
    if (event.key === 'Escape' && !viewer.hidden) { event.preventDefault(); $('.manuals-close').click(); }
  });
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyZoom, 120); }).observe(stage);
  controls();
  return { refresh() { void loadCatalog(); applyZoom(); }, deactivate() { exitFocus(); } };
}
