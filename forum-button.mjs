// Keep the 論壇/回饋 link exactly as tall as the ORNGLOCK logo chip at every breakpoint.
const header = document.querySelector('header');
const chip = document.querySelector('header .logo-chip');
if (header && chip) {
  const sync = () => header.style.setProperty('--logo-chip-height', `${chip.getBoundingClientRect().height}px`);
  new ResizeObserver(sync).observe(chip);
  sync();
}
