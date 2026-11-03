import { prefs } from '../lib/prefs';

/**
 * Styled tooltips for every element with a `title`, installed once for the whole app.
 * The title moves to `data-tip` on first hover (so the browser's own slow tooltip doesn't show too),
 * and a bubble appears after a short delay, quicker when moving between tooltipped things.
 */
let installed = false;

export function installTooltips(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const tip = document.createElement('div');
  tip.className = 'ix-tooltip';
  tip.setAttribute('role', 'tooltip');
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: HTMLElement | null = null;
  let lastHide = 0;

  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (current) lastHide = performance.now();
    current = null;
    tip.remove();
  };

  const textOf = (el: HTMLElement): string | null => {
    const t = el.getAttribute('title');
    if (t) {
      el.dataset.tip = t;
      el.removeAttribute('title');
      if (!el.getAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t);
    }
    return el.dataset.tip || null;
  };

  const show = (el: HTMLElement, text: string) => {
    tip.textContent = text;
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    let y = r.bottom + 6;
    if (y + h > innerHeight - 4) y = r.top - h - 6;
    // Tall thin things (the tool bar) read better with the tip to the side
    if (r.height > r.width * 1.5 || el.closest('.toolbar')) {
      x = r.right + 8;
      y = r.top + r.height / 2 - h / 2;
    }
    tip.style.left = `${Math.max(4, Math.min(innerWidth - w - 4, x))}px`;
    tip.style.top = `${Math.max(4, y)}px`;
  };

  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (el === current) return;
      hide();
      if (!el) return;
      const text = textOf(el);
      if (!text || !prefs().tooltips) return;
      current = el;
      const warm = performance.now() - lastHide < 600;
      timer = setTimeout(() => current === el && el.isConnected && show(el, text), warm ? 80 : 450);
    },
    true,
  );
  document.addEventListener(
    'pointerout',
    (e) => {
      if (current && !current.contains(e.relatedTarget as Node | null)) hide();
    },
    true,
  );
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'blur'] as const) window.addEventListener(ev, hide, true);
  document.addEventListener('scroll', hide, true);
}
