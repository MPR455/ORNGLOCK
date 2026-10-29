export function initStudyImages(dialog) {
  const image = dialog.querySelector('img'), stage = dialog.querySelector('.study-image-stage'), readout = dialog.querySelector('output');
  let scale = 1, x = 0, y = 0, drag = null;
  const pointers = new Map();
  let pinch;
  const paint = () => { image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; readout.value = `${Math.round(scale * 100)}%`; };
  const zoom = factor => { scale = Math.max(.25, Math.min(8, scale * factor)); paint(); };
  const reset = () => { scale = 1; x = y = 0; paint(); };
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-image]')?.dataset.image;
    if (action === 'close' || event.target === dialog) dialog.close();
    if (action === 'in') zoom(1.25);
    if (action === 'out') zoom(.8);
    if (action === 'fit') reset();
  });
  dialog.addEventListener('keydown', event => {
    if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '+' || event.key === '=') zoom(1.25);
      if (event.key === '-') zoom(.8);
      if (event.key === '0') reset();
      if (event.key === 'ArrowLeft') x -= 40;
      if (event.key === 'ArrowRight') x += 40;
      if (event.key === 'ArrowUp') y -= 40;
      if (event.key === 'ArrowDown') y += 40;
      paint();
    }
    event.stopPropagation();
  });
  stage.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  stage.addEventListener('dblclick', () => scale === 1 ? zoom(2) : reset());
  stage.addEventListener('pointerdown', event => {
    stage.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    drag = { px: event.clientX, py: event.clientY, x, y };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale }; }
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && pinch) { const [a, b] = [...pointers.values()]; scale = Math.max(.25, Math.min(8, pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.distance || 1))); }
    else if (drag) { x = drag.x + event.clientX - drag.px; y = drag.y + event.clientY - drag.py; }
    paint();
  });
  const release = event => { pointers.delete(event.pointerId); pinch = null; drag = null; if (pointers.size === 1) { const point = [...pointers.values()][0]; drag = { px: point.x, py: point.y, x, y }; } };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  image.addEventListener('dragstart', event => event.preventDefault());
  dialog.addEventListener('close', () => { image.removeAttribute('src'); pointers.clear(); drag = pinch = null; });
  return (src, alt) => { image.src = src; image.alt = alt || 'Deck image'; reset(); if (!dialog.open) dialog.showModal(); };
}
