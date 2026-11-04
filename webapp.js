// Home-screen web app helpers shared by the main page and the forum launcher.
(() => {
  const launchUrl = document.documentElement.dataset.launchUrl;
  if (launchUrl) {
    // The forum launcher's saved URL carries ?launch=1, so opening the home-screen icon goes straight to the forum.
    if (new URLSearchParams(location.search).has('launch')) { location.replace(launchUrl); return; }
    // iOS saves the current address, so mark it before the person adds it to the home screen.
    try { history.replaceState(null, '', '?launch=1'); } catch {}
  }
  const standalone = () => matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone === true;
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event; });
  addEventListener('appinstalled', () => { deferred = null; });
  document.addEventListener('click', async event => {
    if (event.target.closest('[data-close-dialog]')) { event.target.closest('dialog')?.close(); return; }
    const button = event.target.closest('[data-install]'); if (!button) return;
    if (deferred && !standalone()) { const prompt = deferred; deferred = null; prompt.prompt(); try { await prompt.userChoice; } catch {} return; }
    const dialog = document.getElementById('webapp-help'); if (!dialog) return;
    dialog.dataset.platform = standalone() && !launchUrl ? 'installed' : ios ? 'ios' : 'android';
    dialog.showModal();
  });
})();
