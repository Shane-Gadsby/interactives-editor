import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, type FontRef, type Project, type SceneNode } from 'interactives-player';
import { artboardSvg } from '../src/lib/image-export';
import { fontUseIn, neededFonts } from '../src/lib/font-use';

const asked: string[] = [];
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string) => {
    asked.push(url);
    if (url.startsWith('https://fonts.googleapis.com/')) {
      const fam = decodeURIComponent(/family=([^:&]+)/.exec(url)![1]).replace(/\+/g, ' ');
      const w = /wght@([\d;]+)/.exec(url)![1].split(';');
      const css = w.map((x) => `@font-face{font-family:'${fam}';font-weight:${x};src:url(https://fonts.gstatic.com/${fam.replace(/ /g, '')}-${x}.woff2)}`).join('\n');
      return { text: async () => css } as Response;
    }
    return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Response;
  }),
);

afterEach(() => {
  asked.length = 0;
});

const text = (t: string, style: Record<string, unknown> = {}) => createNode('text', { text: t, width: 100, height: 20, ...style } as never);
function projectWith(children: SceneNode[], fonts: FontRef[]): Project {
  const p = createProject('Fonts' + Math.random());
  p.fonts = fonts;
  p.artboards[0] = createArtboard({ name: 'A', width: 300, height: 200, children });
  return p;
}
const GOOGLE = (family: string, weights?: number[]): FontRef => ({ family, source: 'google', weights });

describe('SVG export fonts', () => {
  it('embeds no fonts at all when the artboard has no text', async () => {
    const p = projectWith([createNode('rect', { width: 50, height: 50 }), createNode('rect', { x: 60, width: 50, height: 50 })], [GOOGLE('Roboto', [400, 700]), GOOGLE('Lobster')]);
    const { svg } = await artboardSvg(p, p.artboards[0], null, 0);
    expect(svg).not.toContain('@font-face');
    expect(svg).not.toContain('<style>');
    expect(asked).toEqual([]);
  });

  it('embeds only the font families the text uses, and only the weights it uses', async () => {
    const p = projectWith([text('Hello', { fontFamily: 'Roboto', fontWeight: 700 })], [GOOGLE('Roboto', [300, 400, 700, 900]), GOOGLE('Lobster', [400])]);
    const { svg } = await artboardSvg(p, p.artboards[0], null, 0);
    expect(svg).toContain("font-family:'Roboto'");
    expect(svg).not.toContain('Lobster');
    expect(asked.filter((u) => u.includes('googleapis'))).toHaveLength(1);
    expect(asked[0]).toContain('Roboto:wght@700');
    expect(asked[0]).not.toContain('400');
  });

  it('finds a font used by a text run, and text inside an instance', async () => {
    const run = createNode('text', { text: 'ab', width: 100, height: 20, fontFamily: 'Roboto', runs: [{ text: 'a', fontFamily: 'Lobster' }, { text: 'b' }] } as never);
    const p = projectWith([run], [GOOGLE('Roboto', [400]), GOOGLE('Lobster', [400]), GOOGLE('Unused', [400])]);
    const inner = createArtboard({ name: 'Inner', width: 100, height: 40, children: [text('in', { fontFamily: 'Unused' })] });
    p.artboards.push(inner);
    p.artboards[0].children.push(createNode('instance', { artboardId: inner.id, width: 100, height: 40 }));
    const { svg } = await artboardSvg(p, p.artboards[0], null, 0);
    expect(svg).toContain("'Roboto'");
    expect(svg).toContain("'Lobster'");
    expect(svg).toContain("'Unused'");
    // and without the instance Unused is left out
    p.artboards[0].children.pop();
    const again = await artboardSvg(p, p.artboards[0], null, 0);
    expect(again.svg).not.toContain("'Unused'");
  });

  it('snaps a weight the font does not offer to the nearest one it does', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p style="font-family: Roboto, sans-serif; font-weight: 600">x</p><p style="font-family: Roboto; font-weight: 100">y</p>';
    document.body.appendChild(el);
    const use = fontUseIn(el);
    expect([...use.get('roboto')!.weights].sort()).toEqual([100, 600]);
    const need = neededFonts([GOOGLE('Roboto', [300, 400, 700])], use);
    expect(need[0].weights).toEqual([300, 700]);
    el.remove();
  });

  it('never embeds system fonts', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p style="font-family: Arial">x</p>';
    document.body.appendChild(el);
    expect(neededFonts([{ family: 'Arial', source: 'system' }], fontUseIn(el))).toEqual([]);
    el.remove();
  });
});
