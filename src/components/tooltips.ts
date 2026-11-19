import { prefs } from '../lib/prefs';

/**
 * Styled tooltips for every element with a `title`, installed once for the whole app.
 * The title moves to `data-tip` on first hover or focus (so the browser's own slow tooltip doesn't show too), and a bubble
 * appears after a short delay, quicker when moving between tooltipped things.
 *
 * Moving a title must not lose the label for assistive technology or for scripts, so `adoptTitle` hands it on: an element
 * with no text of its own (an icon or arrow button) gets it as its `aria-label`, anything else as its `aria-description`
 * (a label wrapping a control passes it to the control). `data-tip` stays on the element either way.
 */

let installed = false;

/** Whether a text names something (has a letter or digit), as opposed to an arrow, a diamond or a cross. */
const hasWords = (t: string | null | undefined): boolean => !!t && /[\p{L}\p{N}]/u.test(t);

/** Moves an element's `title` to `data-tip` and keeps it readable by screen readers. Returns the tip text, if any. */
export function adoptTitle(el: HTMLElement): string | null {
  const t = el.getAttribute('title');
  if (t) {
    el.dataset.tip = t;
    el.removeAttribute('title');
    const target = (el instanceof HTMLLabelElement && el.control) || el;
    // A form control is named by a label with words in it; anything else by its own text
    const isControl = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    const named = target.hasAttribute('aria-label') || target.hasAttribute('aria-labelledby') || (isControl ? Array.from(target.labels ?? []).some((l) => hasWords(l.textContent)) : hasWords(target.textContent));
    if (!named) target.setAttribute('aria-label', t);
    else if (!target.hasAttribute('aria-description') && target.getAttribute('aria-label') !== t && target.textContent?.trim() !== t) target.setAttribute('aria-description', t);
  }
  return el.dataset.tip || null;
}

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };

/**
 * Where a tooltip of w x h goes for a thing at r, in a window of vw x vh. The editor's dense controls put it underneath (or
 * beside, for the tool bar). `above` is the way of the web: over the thing with a tail pointing down at it, which is what
 * a button standing on its own wants (`data-tip-side="top"`). With no room above it goes below and the tail points up.
 * tailX is where the tail sits along the bubble, so it still points at the thing when the bubble is pushed in from an edge.
 */
export function placeTip(r: Box, w: number, h: number, vw: number, vh: number, how: { above?: boolean; beside?: boolean } = {}): { x: number; y: number; tail?: 'down' | 'up'; tailX?: number } {
  const mid = r.left + r.width / 2;
  const clampX = (x: number) => Math.max(4, Math.min(vw - w - 4, x));
  if (how.above) {
    const fits = r.top - h - 10 >= 4;
    const x = clampX(mid - w / 2);
    return { x, y: fits ? r.top - h - 10 : r.bottom + 10, tail: fits ? 'down' : 'up', tailX: Math.max(10, Math.min(w - 10, mid - x)) };
  }
  let x = mid - w / 2;
  let y = r.bottom + 6;
  if (y + h > vh - 4) y = r.top - h - 6;
  // Tall thin things (the tool bar) read better with the tip to the side
  if (how.beside) {
    x = r.right + 8;
    y = r.top + r.height / 2 - h / 2;
  }
  return { x: clampX(x), y: Math.max(4, y) };
}

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

  const show = (el: HTMLElement, text: string) => {
    tip.textContent = text;
    document.body.appendChild(tip);
    const r = el.getBoundingClientRect();
    tip.classList.remove('tail-down', 'tail-up');
    const at = placeTip(r, tip.offsetWidth, tip.offsetHeight, innerWidth, innerHeight, { above: el.dataset.tipSide === 'top', beside: r.height > r.width * 1.5 || !!el.closest('.toolbar') });
    tip.style.left = `${at.x}px`;
    tip.style.top = `${at.y}px`;
    if (at.tail) {
      tip.classList.add(`tail-${at.tail}`);
      tip.style.setProperty('--tail-x', `${at.tailX}px`);
    }
  };

  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (el === current) return;
      hide();
      if (!el) return;
      const text = adoptTitle(el);
      if (!text || !prefs().tooltips) return;
      current = el;
      const warm = performance.now() - lastHide < 600;
      timer = setTimeout(() => current === el && el.isConnected && show(el, text), warm ? 80 : 450);
    },
    true,
  );
  // Keyboard users reach the label too, whether or not they ever hover
  document.addEventListener('focusin', (e) => {
    const el = (e.target as Element | null)?.closest?.('[title]') as HTMLElement | null;
    if (el) adoptTitle(el);
  });
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
