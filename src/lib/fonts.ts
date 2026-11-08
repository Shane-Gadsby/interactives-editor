import { FONT_WAIT_MS, fontCssHref, fontNeeds, fontsAlreadyLoaded, fontWeights, googleCssHref, sheetArrived, waitForFonts, type Artboard, type FontLoader, type Project } from 'interactives-player';
import { assetUrls } from './assets';

const loaded = new Set<string>();

/** This server's font route as a full url (a Preview in a blob page needs it absolute). The editor is served at /interactives/, so it is /interactives/fonts. */
export const fontsBase = (): string => new URL('fonts', document.baseURI).href;
/** The Google stylesheets the editor added that have not arrived yet (a face can only be asked for once its stylesheet is in) */
const sheets = new Map<string, Promise<void>>();

/** Make the project's fonts available to the editor canvas (the player does the same at runtime). */
export function ensureFonts(project: Project): void {
  for (const f of project.fonts) {
    const key = `${f.source}:${f.family}:${f.assetId ?? ''}`;
    if (loaded.has(key)) continue;
    if (f.source === 'google') {
      const link = document.createElement('link');
      // The player's id for it, so a Preview in this page shares the one stylesheet
      link.id = `ix-font-${f.family.replace(/\W+/g, '-')}`;
      if (document.getElementById(link.id)) {
        loaded.add(key);
        continue;
      }
      link.rel = 'stylesheet';
      const weights = fontWeights(f.weights);
      // From this server's font route (Google is asked once, there, and never by a browser); Google's own if the route is down
      link.href = fontCssHref(f.family, weights, fontsBase());
      const arrived = sheetArrived(link, googleCssHref(f.family, weights));
      sheets.set(f.family.toLowerCase(), arrived);
      void arrived.then(() => sheets.delete(f.family.toLowerCase()));
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

/** The stylesheets still on their way for these needs (an unrelated slow font does not hold them up) */
const pendingSheets = (needs: { family: string }[]) => needs.flatMap((n) => sheets.get(n.family.toLowerCase()) ?? []);

let blockedUntil = 0;
const webFonts = () => (typeof document === 'undefined' ? undefined : (document.fonts as FontLoader | undefined));

/** Whether the project fonts these artboards draw with are all usable right now (true when they use none). */
export function fontsReadyNow(project: Project, artboards: Artboard[]): boolean {
  ensureFonts(project);
  const needs = fontNeeds(project, artboards);
  return !needs.length || !webFonts()?.load || (!pendingSheets(needs).length && fontsAlreadyLoaded(needs));
}

/**
 * Resolves once the fonts these artboards draw with have loaded, or after `capMs` (a blocked font host never holds the
 * canvas). True when they loaded in time. After one timeout the next waits are skipped for half a minute, so a dead host
 * costs one pause, not one per artboard.
 */
export function fontsReadyFor(project: Project, artboards: Artboard[], capMs = FONT_WAIT_MS): Promise<boolean> {
  if (fontsReadyNow(project, artboards)) return Promise.resolve(true);
  const needs = fontNeeds(project, artboards);
  const fonts = webFonts();
  if (Date.now() < blockedUntil) return Promise.resolve(false);
  return waitForFonts({ sheets: pendingSheets(needs), needs, fonts, capMs }).then((ok) => {
    if (!ok) blockedUntil = Date.now() + 30000;
    return ok;
  });
}

/** The system font stacks the text toolbar offers after the project's own fonts (the Inspector's font picker has them too, and every Google font). */
export const FONT_FAMILIES = ['system-ui, sans-serif', 'Georgia, serif', '"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Courier New", monospace', 'ui-monospace, monospace'];
