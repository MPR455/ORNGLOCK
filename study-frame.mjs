const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' };

export function createCardFrame(iframe, { onImage, onKey }) {
  let collection, generation = 0, observer;
  const urls = new Map();
  function clear() {
    generation++; observer?.disconnect();
    for (const promise of urls.values()) promise.then(url => { if (url) URL.revokeObjectURL(url); });
    urls.clear();
  }
  async function mediaURL(filename) {
    try { filename = decodeURIComponent(filename); } catch {}
    if (!collection.media.has(filename)) return '';
    if (!urls.has(filename)) urls.set(filename, (async () => {
      const entry = collection.zip.file(collection.media.get(filename));
      if (!entry) return '';
      const data = await entry.async('uint8array');
      const type = MIME[filename.split('.').at(-1).toLowerCase()] || 'application/octet-stream';
      return URL.createObjectURL(new Blob([data], { type }));
    })());
    return urls.get(filename);
  }
  function theme() {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;
    const tokens = getComputedStyle(document.body);
    for (const name of ['--ink', '--sub', '--bg', '--card', '--line', '--acc', '--chip']) doc.documentElement.style.setProperty(name, tokens.getPropertyValue(name));
    const dark = document.body.classList.contains('theme-dark') || document.body.classList.contains('theme-black');
    doc.body.classList.toggle('nightMode', dark);
    doc.querySelector('.card')?.classList.toggle('nightMode', dark);
    // Neutral inline ink follows the host theme, while meaningful source colors survive.
    if (dark) doc.querySelectorAll('[style],font[color]').forEach(element => {
      if (!element.style.color && !element.getAttribute('color')) return;
      const channels = doc.defaultView.getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number);
      if (channels && Math.max(...channels.slice(0, 3)) - Math.min(...channels.slice(0, 3)) < 25 && channels[3] !== 0) element.style.setProperty('color', 'var(--ink)', 'important');
    });
  }
  async function render(card, answer) {
    const current = ++generation;
    observer?.disconnect();
    const parsed = new DOMParser().parseFromString(answer ? card.back : card.front, 'text/html');
    parsed.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,base,link,meta').forEach(element => element.remove());
    for (const element of parsed.querySelectorAll('*')) {
      for (const attr of [...element.attributes]) if (/^on/i.test(attr.name) || ['srcdoc', 'autoplay', 'srcset'].includes(attr.name)) element.removeAttribute(attr.name);
      if (element.matches('a')) {
        const href = element.getAttribute('href') || '';
        if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href');
        element.target = '_blank'; element.rel = 'noopener noreferrer';
      }
    }
    await Promise.all([...parsed.querySelectorAll('img,audio,video,source')].map(async element => {
      const filename = element.getAttribute('data-file') || element.getAttribute('src') || '';
      const url = await mediaURL(filename);
      if (url) element.setAttribute('src', url);
      else if (!/^data:(image|audio|video)\//i.test(filename)) element.removeAttribute('src');
      if (element.matches('audio,video')) { element.controls = true; element.preload = 'none'; }
      if (element.matches('img')) { element.title = 'Click to zoom'; element.alt ||= filename; element.tabIndex = 0; element.setAttribute('role', 'button'); }
    }));
    if (current !== generation) return;
    const modelCSS = card.css.replace(/<\/style/gi, '<\\/style');
    iframe.onload = () => {
      if (current !== generation) return;
      const doc = iframe.contentDocument;
      theme();
      const size = () => { iframe.style.height = `${Math.max(260, doc.body.scrollHeight)}px`; };
      observer = new ResizeObserver(size); observer.observe(doc.body); size();
      doc.addEventListener('click', event => { const img = event.target.closest('img'); if (img?.src) { event.preventDefault(); onImage(img.src, img.alt); } });
      doc.addEventListener('keydown', event => {
        if (event.target.matches('img') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onImage(event.target.src, event.target.alt); }
        else onKey(event);
      });
    };
    // Imported markup and model CSS live in a script-free sandbox, away from the application.
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob: data:; font-src data:;"><style>${modelCSS}</style><style>
      *{box-sizing:border-box}html,body{margin:0;background:var(--card);color:var(--ink);overflow-wrap:anywhere}body{padding:clamp(16px,3vw,32px);font-family:"Segoe UI","Noto Sans TC",system-ui,sans-serif}
      .card{font-size:18px;line-height:1.75;text-align:left;max-width:960px;margin:auto;padding:0;background:var(--card)!important;color:var(--ink)!important}
      img{max-width:100%!important;height:auto!important;cursor:zoom-in;touch-action:manipulation}img:focus-visible{outline:3px solid var(--acc)}audio,video{max-width:100%}hr{border:0;border-top:3px solid var(--line);margin:24px 0}.cloze{color:var(--acc);font-weight:800}a{color:var(--acc)}.nightMode .meta,.nightMode .src,.nightMode .top{color:var(--sub)!important}.nightMode .box,.nightMode .exp,.nightMode .answer{background:var(--chip)!important;color:var(--ink)!important}table{max-width:100%;border-collapse:collapse}td,th{padding:6px}pre{white-space:pre-wrap}
      </style></head><body><div class="card">${parsed.body.innerHTML}</div></body></html>`;
    iframe.title = `${answer ? 'Answer' : 'Question'} — ${card.model}`;
  }
  return { render, theme, setCollection(value) { clear(); collection = value; }, clear };
}
