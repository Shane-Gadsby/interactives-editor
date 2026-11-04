import type { Project } from 'interactives-player';
import { assetUrls } from './assets';

const loaded = new Set<string>();

/** Make the project's fonts available to the editor canvas (the player does the same at runtime). */
export function ensureFonts(project: Project): void {
  for (const f of project.fonts) {
    const key = `${f.source}:${f.family}:${f.assetId ?? ''}`;
    if (loaded.has(key)) continue;
    if (f.source === 'google') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      const weights = (f.weights?.length ? f.weights : [400, 700]).slice().sort((a, b) => a - b).join(';');
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${weights}&display=swap`;
      document.head.appendChild(link);
      loaded.add(key);
    } else if (f.source === 'asset' && f.assetId) {
      const url = assetUrls.resolve(f.assetId);
      if (!url) continue;
      const style = document.createElement('style');
      style.textContent = `@font-face{font-family:${JSON.stringify(f.family)};src:url("${url}");font-display:swap}`;
      document.head.appendChild(style);
      loaded.add(key);
    }
  }
}

/** The system font stacks the text toolbar offers after the project's own fonts (the Inspector's font picker has them too, and every Google font). */
export const FONT_FAMILIES = ['system-ui, sans-serif', 'Georgia, serif', '"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Courier New", monospace', 'ui-monospace, monospace'];
