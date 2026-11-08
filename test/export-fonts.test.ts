import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type FontRef, type Project } from 'interactives-player';
import { standaloneHtml } from '../src/lib/export';
import { embeddedFontStyles, fontElementId } from '../src/lib/font-embed';

const asked: string[] = [];
let down = new Set<string>();
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => {
    asked.push(url);
    const fam = url.startsWith('https://fonts.googleapis.com/') ? decodeURIComponent(/family=([^:&]+)/.exec(url)![1]).replace(/\+/g, ' ') : '';
    if (fam && down.has(fam)) return { ok: false, status: 503 } as Response;
    if (fam) {
      const w = /wght@([\d;]+)/.exec(url)![1].split(';');
      // A variable font: every weight points at the one file
      const css = w.map((x) => `@font-face{font-family:'${fam}';font-weight:${x};src:url(https://fonts.gstatic.com/${fam.replace(/ /g, '')}-var.woff2)}`).join('\n');
      return { ok: true, text: async () => css } as Response;
    }
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Response;
  }),
);

afterEach(() => {
  asked.length = 0;
  down = new Set();
});

const GOOGLE = (family: string, weights?: number[]): FontRef => ({ family, source: 'google', weights });
function projectWith(fonts: FontRef[], usedFamily?: string): Project {
  const p = createProject('Fonts' + Math.random());
  p.fonts = fonts;
  const text = createNode('text', { text: 'Hello', width: 100, height: 20, ...(usedFamily ? { fontFamily: usedFamily } : {}) } as never);
  p.artboards[0] = createArtboard({ name: 'A', width: 300, height: 200, children: [text] });
  return p;
}

describe('fonts in single-file exports and shares', () => {
  it('inlines each used Google font as @font-face data urls, with no google url left', async () => {
    const p = projectWith([GOOGLE('Open Sans', [400, 700])], 'Open Sans');
    const html = await standaloneHtml(p, { embedFonts: true });
    expect(html).toContain(`<style id="${fontElementId('Open Sans')}">`);
    expect(html).toContain('@font-face');
    expect(html).toMatch(/src:url\(data:font\/woff2;base64,/);
    // Both weights share one file, which is fetched once and used by both rules
    expect(asked.filter((u) => u.includes('gstatic'))).toHaveLength(1);
    expect(html.match(/data:font\/woff2/g)).toHaveLength(2);
    // The page itself (the player's own source, which can name Google, is in a script element)
    expect(html.replace(/<script[\s\S]*?<\/script>/g, '')).not.toContain('fonts.gstatic.com');
  });

  it('puts the style in the head, ahead of the player, under the id the player checks', async () => {
    const p = projectWith([GOOGLE('Lobster')], 'Lobster');
    const html = await standaloneHtml(p, { embedFonts: true });
    expect(html.indexOf('id="ix-font-Lobster"')).toBeLessThan(html.indexOf('</head>'));
    expect(fontElementId('Open Sans')).toBe('ix-font-Open-Sans');
  });

  it('asks Google only for the weights the font lists, falling back to 400 and 700', async () => {
    await embeddedFontStyles(projectWith([GOOGLE('Roboto', [300, 500]), GOOGLE('Lato')], 'Roboto Lato'));
    const urls = asked.filter((u) => u.includes('googleapis'));
    expect(urls.find((u) => u.includes('Roboto'))).toContain('wght@300;500');
    expect(urls.find((u) => u.includes('Lato'))).toContain('wght@400;700');
  });

  it('fetches nothing for a font the project never uses, but still keeps the player from linking to Google for it', async () => {
    const p = projectWith([GOOGLE('Open Sans')], 'Georgia, serif');
    const html = await standaloneHtml(p, { embedFonts: true });
    expect(asked).toEqual([]);
    expect(html).toContain('<style id="ix-font-Open-Sans"></style>');
  });

  it('warns, and leaves the font to the player, when Google cannot be reached', async () => {
    down.add('Lobster');
    const warn = vi.fn();
    const p = projectWith([GOOGLE('Lobster'), GOOGLE('Lato')], 'Lobster Lato');
    const html = await standaloneHtml(p, { embedFonts: true, onWarning: warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Lobster');
    expect(warn.mock.calls[0][0]).not.toContain('Lato');
    expect(html).not.toContain('id="ix-font-Lobster"');
    expect(html).toContain('id="ix-font-Lato"');
  });

  it('does not touch the network for previews', async () => {
    const p = projectWith([GOOGLE('Open Sans')], 'Open Sans');
    const html = await standaloneHtml(p);
    expect(asked).toEqual([]);
    expect(html).not.toContain('ix-font-Open-Sans');
  });

  it('leaves system and uploaded fonts alone', async () => {
    const p = projectWith([{ family: 'Georgia', source: 'system' }, { family: 'Mine', source: 'asset', assetId: 'a1' }], 'Georgia Mine');
    expect(await embeddedFontStyles(p)).toBe('');
    expect(asked).toEqual([]);
  });
});
