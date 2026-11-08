import type { FontRef, Project } from 'interactives-player';

export const toDataUrl = (bytes: Uint8Array, mime: string) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
  });

const slug = (family: string) => family.replace(/\W+/g, '-');

/** The weights the player asks Google for when a font doesn't list its own */
export const googleWeights = (f: FontRef) => (f.weights?.length ? f.weights : [400, 700]).slice().sort((a, b) => a - b);

/** The id the player gives the <link> it adds for a Google font. It skips the font when an element with this id is already in the page. */
export const fontElementId = (family: string) => `ix-font-${slug(family)}`;

const within = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined);

/**
 * Google's @font-face CSS for a family at some weights, with every font file it points at inlined as a data URL.
 * Throws when Google (or a file) can't be reached, so a caller can choose what to do about it.
 */
export async function googleFontCss(family: string, weights: number[]): Promise<string> {
  const api = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}`;
  const res = await fetch(api, { signal: within(15000) });
  if (res.ok === false) throw new Error(`Google Fonts answered ${res.status} for ${family}`);
  let css = await res.text();
  // A variable font gives the same file for every weight, so fetch each file once
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  const data = await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(u, { signal: within(15000) });
      if (r.ok === false) throw new Error(`Google Fonts answered ${r.status} for a ${family} file`);
      return toDataUrl(new Uint8Array(await r.arrayBuffer()), 'font/woff2');
    }),
  );
  urls.forEach((u, i) => {
    css = css.split(u).join(data[i]);
  });
  return css;
}

/** The project's Google fonts that its content really names (outside the font list itself) */
function usedByContent(project: Project, f: FontRef): boolean {
  const { fonts: _fonts, ...rest } = project;
  return JSON.stringify(rest).toLowerCase().includes(f.family.toLowerCase());
}

/**
 * <style> elements for the head of a single-file export: each Google font the project draws with, as @font-face rules
 * with the files inlined. A Google font nothing uses gets an empty <style> under the same id, because that id is what
 * stops the player linking to Google for it. A font that can't be fetched gets nothing, so the player falls back to the
 * Google link, and `warn` says which.
 */
export async function embeddedFontStyles(project: Project, warn?: (text: string) => void): Promise<string> {
  const out: string[] = [];
  const failed: string[] = [];
  await Promise.all(
    project.fonts
      .filter((f) => f.source === 'google')
      .map(async (f) => {
        const id = fontElementId(f.family);
        if (!usedByContent(project, f)) {
          out.push(`<style id="${id}"></style>`);
          return;
        }
        try {
          const css = await googleFontCss(f.family, googleWeights(f));
          out.push(`<style id="${id}">${css.replace(/<\/style/gi, '')}</style>`);
        } catch {
          failed.push(f.family);
        }
      }),
  );
  if (failed.length) warn?.(`Couldn't fetch ${failed.join(', ')} from Google Fonts, so ${failed.length > 1 ? 'they are' : 'it is'} not inside this file. The page will load ${failed.length > 1 ? 'them' : 'it'} from Google when it opens; try again when you are online to embed ${failed.length > 1 ? 'them' : 'it'}.`);
  return out.join('\n');
}

/** Puts styles into the <head> of a built page */
export function inHead(html: string, styles: string): string {
  if (!styles) return html;
  const i = html.indexOf('</head>');
  return i < 0 ? html : html.slice(0, i) + styles + '\n' + html.slice(i);
}
