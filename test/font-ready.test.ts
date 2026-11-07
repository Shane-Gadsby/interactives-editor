// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, forgetLoadedFonts, type Project } from 'interactives-player';
import { ensureFonts, fontsBase, fontsReadyFor, fontsReadyNow } from '../src/lib/fonts';
import { standaloneHtml } from '../src/lib/export';

function project(fonts: Project['fonts']): Project {
  const p = createProject('F');
  p.fonts = fonts;
  p.artboards = [createArtboard({ name: 'A', children: [createNode('text', { text: 'Hi', fontFamily: '"Lobster", cursive', fontWeight: 400 } as never), createNode('text', { text: 'Yo', fontFamily: '"Open Sans", sans-serif', fontWeight: 700 } as never)] })];
  return p;
}

describe('the editor canvas fonts', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    forgetLoadedFonts();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it('takes Google fonts from this server\'s font route, under the id the player uses, with Google as the fallback', () => {
    const p = project([{ family: 'Open Sans', source: 'google', weights: [700, 400, 600] }]);
    ensureFonts(p);
    const link = document.head.querySelector('link#ix-font-Open-Sans') as HTMLLinkElement;
    expect(link.href).toBe(`${fontsBase()}/css2?family=Open+Sans:wght@400;600;700`);
    expect(document.head.querySelector('link[href*="fonts.googleapis.com"]')).toBeNull();
    link.dispatchEvent(new Event('error'));
    expect(link.href).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap');
  });

  it('still asks Google for other families, under the id the player uses', () => {
    ensureFonts(project([{ family: 'Pacifico', source: 'google', weights: [400] }]));
    expect(document.head.querySelector('link#ix-font-Pacifico')?.getAttribute('href')).toContain('family=Pacifico');
  });

  it('waits for a font that is still loading and then says yes', async () => {
    let done!: () => void;
    const gate = new Promise<void>((r) => (done = r));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => gate, ready: Promise.resolve() } });
    const p = project([{ family: 'Lobster', source: 'google', weights: [400] }]);
    expect(fontsReadyNow(p, p.artboards)).toBe(false);
    const ready = vi.fn();
    void fontsReadyFor(p, p.artboards).then(ready);
    await new Promise((r) => setTimeout(r, 20));
    expect(ready).not.toHaveBeenCalled();
    // The stylesheet arrives, then the face
    document.head.querySelector('link')!.dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 20));
    expect(ready).not.toHaveBeenCalled();
    done();
    await new Promise((r) => setTimeout(r, 20));
    expect(ready).toHaveBeenCalledWith(true);
    // Seen loaded: the next ask has nothing to wait for
    expect(fontsReadyNow(p, p.artboards)).toBe(true);
  });

  it('gives up after the cap, and then does not hold the next artboard up as well', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load: () => new Promise(() => undefined) } });
    const p = project([{ family: 'Open Sans', source: 'google', weights: [400, 700] }]);
    const first = fontsReadyFor(p, p.artboards, 500);
    await vi.advanceTimersByTimeAsync(600);
    expect(await first).toBe(false);
    expect(await fontsReadyFor(p, p.artboards, 500)).toBe(false);
  });

  it('is ready at once for a project with system fonts only', async () => {
    const p = project([]);
    expect(fontsReadyNow(p, p.artboards)).toBe(true);
    expect(await fontsReadyFor(p, p.artboards)).toBe(true);
  });
});

describe('exports', () => {
  it('take their fonts from this server unless the file carries them', async () => {
    const p = project([{ family: 'Pacifico', source: 'google', weights: [400] }]);
    const plain = await standaloneHtml(p, { bytesFor: async () => null });
    // Not embedded: the page takes the fonts from this server's route (so no connection to Google is opened ahead)
    expect(plain).toContain(`fontsBase: ${JSON.stringify(fontsBase())}`);
    expect(plain.replace(/<script[\s\S]*?<\/script>/g, '')).not.toContain('rel="preconnect"');
  });
});
