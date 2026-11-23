import { uid, type FontRef, type Project } from 'interactives-player';

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

// ---------------------------------------------------------------- fonts inside a .ixp package
// Pages for learners (a share, an embed, a download) link their Google fonts from this server's font route. Only a
// package carries its own copy, so it plays with no network, and importing it links the font again whenever it can.

/**
 * A family's @font-face rules from a font server (`base`, this server's /fonts/), with every file inlined. The server
 * lists its own copy of each file and Google's as a fallback; only the first is kept. Throws when the server can't be read.
 */
export async function serverFontCss(family: string, weights: number[], base: string): Promise<string> {
  const root = base.endsWith('/') ? base : `${base}/`;
  const res = await fetch(`${root}css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}`, { signal: within(15000) });
  if (res.ok === false) throw new Error(`The font server answered ${res.status} for ${family}`);
  const css = await res.text();
  if (!css.includes('@font-face')) throw new Error(`The font server has no ${family}`);
  const firstUrl = (src: string) => /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/.exec(src)?.[1] ?? '';
  const srcs = [...css.matchAll(/src:\s*([^;]+);/g)];
  const files = [...new Set(srcs.map((m) => new URL(firstUrl(m[1]), root).href))];
  const data = new Map(
    await Promise.all(
      files.map(async (u) => {
        const r = await fetch(u, { signal: within(15000) });
        if (r.ok === false) throw new Error(`The font server answered ${r.status} for a ${family} file`);
        return [u, await toDataUrl(new Uint8Array(await r.arrayBuffer()), 'font/woff2')] as const;
      }),
    ),
  );
  return css.replace(/src:\s*([^;]+);/g, (_all, src: string) => `src: url(${data.get(new URL(firstUrl(src), root).href)}) format('woff2');`);
}

/**
 * The project with each Google font it draws with carried inside it, as a `text/css` asset (`FontRef.embedded`), and
 * that asset's bytes added to `bytes`, for a .ixp package. A font that already carries one keeps it. One that can't be
 * fetched is left linked, and `warn` says which.
 */
export async function withPackagedFonts(project: Project, bytes: Map<string, Uint8Array>, base: string, warn?: (text: string) => void): Promise<Project> {
  const failed: string[] = [];
  const assets = [...project.assets];
  const fonts = await Promise.all(
    project.fonts.map(async (f): Promise<FontRef> => {
      if (f.source !== 'google' || !usedByContent(project, f)) return f;
      if (f.embedded && assets.some((a) => a.id === f.embedded)) return f;
      try {
        const css = new TextEncoder().encode(await serverFontCss(f.family, googleWeights(f), base));
        const id = uid('as');
        assets.push({ id, name: `${f.family}.css`, mime: 'text/css', size: css.length });
        bytes.set(id, css);
        return { ...f, embedded: id };
      } catch {
        failed.push(f.family);
        return f;
      }
    }),
  );
  if (failed.length) warn?.(`Couldn't fetch ${failed.join(', ')} from the font server, so ${failed.length > 1 ? 'they are' : 'it is'} not inside this package. Opened online it still loads from the server.`);
  return { ...project, fonts, assets };
}

/**
 * Importing a package: a Google font it carries its own copy of is linked from the font server again whenever the
 * server has it, and the copy is dropped. Gives the fonts and the asset ids to leave out. A font the server can't
 * give keeps its copy, so it still draws.
 */
export async function relinkPackagedFonts(project: Project, base: string): Promise<{ fonts: FontRef[]; drop: Set<string> }> {
  const drop = new Set<string>();
  const root = base.endsWith('/') ? base : `${base}/`;
  const fonts = await Promise.all(
    project.fonts.map(async (f): Promise<FontRef> => {
      if (f.source !== 'google' || !f.embedded) return f;
      try {
        const res = await fetch(`${root}css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${googleWeights(f).join(';')}`, { signal: within(15000) });
        if (res.ok === false || !(await res.text()).includes('@font-face')) return f;
      } catch {
        return f;
      }
      drop.add(f.embedded);
      const { embedded: _e, ...linked } = f;
      return linked;
    }),
  );
  return { fonts, drop };
}
