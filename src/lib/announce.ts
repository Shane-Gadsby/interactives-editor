let region: HTMLElement | null = null;
let flip = false;

/** Say something to a screen reader without showing it: a polite live region that lives for the whole page. */
export function announce(text: string): void {
  if (typeof document === 'undefined') return;
  if (!region || !region.isConnected) {
    region = document.createElement('div');
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.dataset.announce = '';
    document.body.appendChild(region);
  }
  // the same words twice in a row would not be read again, so the text alternates with a trailing space
  flip = !flip;
  region.textContent = text + (flip ? '' : ' ');
}
