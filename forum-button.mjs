const widget = document.getElementById('forum-float');
const handle = document.getElementById('forum-float-handle');
const storageKey = 'ornglock_forum_position';
let position = null;
let drag = null;
let suppressClickUntil = 0;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && [saved.x, saved.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) position = saved;
} catch {}

function bounds() {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0;
  const top = viewport?.offsetTop || 0;
  const width = viewport?.width || document.documentElement.clientWidth;
  const height = viewport?.height || window.innerHeight;
  const rect = widget.getBoundingClientRect();
  const header = document.querySelector('header')?.getBoundingClientRect();
  const nav = document.getElementById('mobile-bottom-nav');
  const navRect = nav?.getBoundingClientRect();
  const navVisible = nav && getComputedStyle(nav).display !== 'none' && navRect.top < top + height;
  const right = Math.max(left + 12, left + width - rect.width - 12);
  const bottom = Math.max(top + 12, Math.min(top + height, navVisible ? navRect.top : Infinity) - rect.height - 12);
  return { left: left + 12, right, top: Math.min(bottom, Math.max(top + 12, (header?.bottom || 0) + 12)), bottom };
}

function place(x, y, limits = bounds()) {
  x = Math.max(limits.left, Math.min(limits.right, x));
  y = Math.max(limits.top, Math.min(limits.bottom, y));
  widget.style.left = `${x}px`;
  widget.style.top = `${y}px`;
  widget.style.right = 'auto';
  widget.style.bottom = 'auto';
  return { x, y };
}

function remember(x, y) {
  const limits = bounds();
  const placed = place(x, y, limits);
  position = {
    x: (placed.x - limits.left) / (limits.right - limits.left || 1),
    y: (placed.y - limits.top) / (limits.bottom - limits.top || 1)
  };
  try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
}

function refresh() {
  const limits = bounds();
  place(limits.left + (position?.x ?? 1) * (limits.right - limits.left), limits.top + (position?.y ?? 1) * (limits.bottom - limits.top), limits);
}

function reset() {
  position = null;
  try { localStorage.removeItem(storageKey); } catch {}
  refresh();
}

widget.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  const rect = widget.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
});

window.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  if (!drag.moved) {
    drag.moved = true;
    widget.setPointerCapture(event.pointerId);
    widget.classList.add('is-dragging');
  }
  event.preventDefault();
  place(drag.left + dx, drag.top + dy);
}, { passive: false });

function finish(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const previous = drag;
  drag = null;
  widget.classList.remove('is-dragging');
  if (previous.moved) {
    suppressClickUntil = performance.now() + 400;
    const rect = widget.getBoundingClientRect();
    remember(rect.left, rect.top);
  }
  if (widget.hasPointerCapture(previous.id)) widget.releasePointerCapture(previous.id);
}

window.addEventListener('pointerup', finish);
window.addEventListener('pointercancel', finish);
widget.addEventListener('lostpointercapture', finish);
widget.addEventListener('dragstart', event => event.preventDefault());
widget.addEventListener('click', event => {
  if (event.detail > 0 && performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

handle.addEventListener('keydown', event => {
  if (event.key === 'Home') { event.preventDefault(); reset(); return; }
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!direction) return;
  event.preventDefault();
  const rect = widget.getBoundingClientRect();
  const step = event.shiftKey ? 40 : 10;
  remember(rect.left + direction[0] * step, rect.top + direction[1] * step);
});
handle.addEventListener('dblclick', reset);
window.addEventListener('resize', refresh);
window.visualViewport?.addEventListener('resize', refresh);
window.visualViewport?.addEventListener('scroll', refresh);
refresh();
