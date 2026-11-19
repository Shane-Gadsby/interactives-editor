// Fonts and where they come from: pages for learners (a share, an embed, a download) link them from this server's font
// route; only a .ixp package carries its own copy, and importing one links the font again whenever the server has it.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type FontRef, type Project } from 'interactives-player';
import { standaloneHtml } from '../src/lib/export';
import { relinkPackagedFonts, serverFontCss, withPackagedFonts } from '../src/lib/font-embed';

const BASE = 'https://h.example/interactives/fonts/';
const asked: string[] = [];
let missing = new Set<string>();

// The font server: its own copy of each file first, Google's as the fallback, the way /fonts/css2 answers
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => {
    asked.push(url);
    if (url.startsWith(`${BASE}css2`)) {
      const fam = decodeURIComponent(/family=([^:&]+)/.exec(url)![1]).replace(/\+/g, ' ');
      if (missing.has(fam)) return { ok: false, status: 404, text: async () => '' } as Response;
      const w = /wght@([\d;]+)/.exec(url)![1].split(';');
      const css = w
        .map((x) => `/* latin */\n@font-face {\n  font-family: '${fam}';\n  font-weight: ${x};\n  src: url(file/${fam.replace(/ /g, '')}${x}.woff2) format('woff2'), url(https://fonts.gstatic.com/${fam.replace(/ /g, '')}${x}.woff2) format('woff2');\n}`)
        .join('\n');
      return { ok: true, text: async () => css } as Response;
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Response;
  }),
);

afterEach(() => {
  asked.length = 0;
  missing = new Set();
});

const GOOGLE = (family: string, weights?: number[]): FontRef => ({ family, source: 'google', weights });
function projectWith(fonts: FontRef[], usedFamily?: string): Project {
  const p = createProject('Fonts' + Math.random());
  p.fonts = fonts;
  const text = createNode('text', { text: 'Hello', width: 100, height: 20, ...(usedFamily ? { fontFamily: usedFamily } : {}) } as never);
  p.artboards[0] = createArtboard({ name: 'A', width: 300, height: 200, children: [text] });
  return p;
}

describe('pages for learners', () => {
  it('link their Google fonts from the font server and carry no font files', async () => {
    const p = projectWith([GOOGLE('Open Sans', [400, 700])], 'Open Sans');
    // What Share, Publish and the HTML download build now
    const html = await standaloneHtml(p, { optimise: true });
    expect(html).not.toContain('data:font/woff2');
    expect(html).not.toContain('<style id="ix-font-Open-Sans">');
    expect(html).toContain('fontsBase:');
    expect(asked).toEqual([]);
  });
});

describe('a .ixp package', () => {
  it('inlines only the font server\'s own copy of each file, never Google\'s', async () => {
    const css = await serverFontCss('Open Sans', [400, 700], BASE);
    expect(css).toContain('@font-face');
    expect(css.match(/data:font\/woff2;base64,/g)).toHaveLength(2);
    expect(css).not.toContain('gstatic');
    expect(asked.filter((u) => u.includes('gstatic'))).toEqual([]);
    expect(asked).toContain(`${BASE}file/OpenSans400.woff2`);
  });

  it('carries each Google font the project draws with as a css asset, and its bytes', async () => {
    const bytes = new Map<string, Uint8Array>();
    const p = projectWith([GOOGLE('Open Sans', [400]), GOOGLE('Lobster'), { family: 'Georgia', source: 'system' }], 'Open Sans');
    const out = await withPackagedFonts(p, bytes, BASE);
    const open = out.fonts.find((f) => f.family === 'Open Sans')!;
    expect(open.embedded).toBeTruthy();
    const asset = out.assets.find((a) => a.id === open.embedded)!;
    expect(asset.mime).toBe('text/css');
    expect(new TextDecoder().decode(bytes.get(asset.id))).toContain('@font-face');
    // Lobster is listed but nothing uses it; a system font has nothing to carry
    expect(out.fonts.find((f) => f.family === 'Lobster')!.embedded).toBeUndefined();
    expect(out.fonts.find((f) => f.family === 'Georgia')!.embedded).toBeUndefined();
  });

  it('leaves a font linked, and says so, when the font server can\'t give it', async () => {
    missing.add('Open Sans');
    const warn = vi.fn();
    const out = await withPackagedFonts(projectWith([GOOGLE('Open Sans')], 'Open Sans'), new Map(), BASE, warn);
    expect(out.fonts[0].embedded).toBeUndefined();
    expect(warn.mock.calls[0][0]).toContain('Open Sans');
  });
});

describe('importing a package', () => {
  const packed = (): Project => {
    const p = projectWith([{ ...GOOGLE('Open Sans', [400]), embedded: 'ascss1' }], 'Open Sans');
    p.assets.push({ id: 'ascss1', name: 'Open Sans.css', mime: 'text/css', size: 10 });
    return p;
  };

  it('links the font from the server again and drops the copy, when the server has it', async () => {
    const r = await relinkPackagedFonts(packed(), BASE);
    expect(r.fonts[0].embedded).toBeUndefined();
    expect(r.fonts[0].source).toBe('google');
    expect([...r.drop]).toEqual(['ascss1']);
  });

  it('keeps the copy when the server doesn\'t have the font', async () => {
    missing.add('Open Sans');
    const r = await relinkPackagedFonts(packed(), BASE);
    expect(r.fonts[0].embedded).toBe('ascss1');
    expect(r.drop.size).toBe(0);
  });
});
