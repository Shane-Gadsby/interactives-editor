import { describe, expect, it } from 'vitest';
import { embedAllow, embedAspect, embedCode, embedTitle } from '../src/lib/embed';

const url = 'https://lti.unisq.edu.au/interactives/play/AbC_123-xyzAbC_123-xyz';

describe('embed code', () => {
  it('is the Toolbox shape: title, src with title and cdtID, data-cdt-id, allow, allowfullscreen, responsive style', () => {
    const code = embedCode({ url, title: 'Fractions lab', cdtID: 1790000000000, aspect: '1280/720' });
    expect(code).toBe(
      `<iframe title="Interactive: Fractions lab" src="${url}?title=Fractions%20lab&cdtID=1790000000000" data-cdt-id="1790000000000" allow="autoplay; fullscreen" allowfullscreen style="border:0; width:100%; height:auto; aspect-ratio:1280/720"></iframe>`,
    );
  });

  it('points at the learner page itself, not a bare app path (which would need the trailing slash redirect)', () => {
    const code = embedCode({ url: `${url}?old=1#x`, title: 'A', cdtID: 1 });
    expect(code).toContain(`src="${url}?title=A&cdtID=1"`);
    expect(code).not.toContain('old=1');
  });

  it('adds the microphone and camera to allow only when the shared project declared them', () => {
    expect(embedAllow(null)).toBe('autoplay; fullscreen');
    expect(embedAllow({ photos: true })).toBe('autoplay; fullscreen');
    expect(embedAllow({ microphone: true })).toBe('autoplay; fullscreen; microphone');
    expect(embedAllow({ microphone: true, camera: true, photos: true })).toBe('autoplay; fullscreen; microphone; camera');
    expect(embedCode({ url, title: 'Say it', cdtID: 2, sensors: { camera: true } })).toContain('allow="autoplay; fullscreen; camera"');
  });

  it('cannot be broken out of by the project name', () => {
    const code = embedCode({ url, title: '"><script>alert(1)</script> & co', cdtID: 3 });
    expect(code).not.toContain('<script');
    expect(code.match(/<iframe/g)).toHaveLength(1);
    expect(code).toContain('title="Interactive: &quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; co"');
    expect(code).toContain('title=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E%20%26%20co&cdtID=3');
  });

  it('titles an unnamed project plainly, and one named like the label once', () => {
    expect(embedTitle('')).toBe('Interactive');
    expect(embedTitle('  interactive ')).toBe('Interactive');
    expect(embedTitle('Two\n  lines')).toBe('Interactive: Two lines');
  });

  it('takes its shape from the start artboard, and falls back to 16/9', () => {
    const ab = (id: string, width: number, height: number) => ({ id, width, height }) as never;
    expect(embedAspect({ artboards: [ab('a', 800, 600), ab('b', 1080, 1920)], settings: { startArtboardId: 'b' } as never })).toBe('1080/1920');
    expect(embedAspect({ artboards: [ab('a', 800, 600)], settings: { startArtboardId: 'gone' } as never })).toBe('800/600');
    expect(embedAspect({ artboards: [], settings: {} as never })).toBe('16/9');
    expect(embedAspect({ artboards: [ab('a', 0, 600)], settings: {} as never })).toBe('16/9');
    expect(embedCode({ url, title: 'A', cdtID: 1, aspect: 'url(x)' })).toContain('aspect-ratio:16/9');
  });
});
