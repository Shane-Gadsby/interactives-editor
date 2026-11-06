import { describe, expect, it } from 'vitest';
import { createProject } from 'interactives-player';
import {
  clampLevel,
  DEFAULT_LEVEL,
  fitWithin,
  hasAlphaPixels,
  isAnimatedImage,
  LEVELS,
  optimiseSettings,
  outputKey,
  outputMime,
  outputSource,
  planOutput,
  planProxy,
  PROXY,
  proxyKey,
  rasterMime,
  savingsOf,
  SMALL_BYTES,
  worthKeeping,
  type ImageFacts,
  type OptimiseLevel,
} from '../src/lib/image-optimise';

const facts = (over: Partial<ImageFacts> = {}): ImageFacts => ({ mime: 'image/jpeg', bytes: 4_000_000, width: 4000, height: 3000, animated: false, ...over });

describe('the size to quality slider', () => {
  it('runs from smaller files to better quality: every notch keeps more pixels at a higher quality', () => {
    const levels = [1, 2, 3, 4, 5] as OptimiseLevel[];
    for (let i = 1; i < levels.length; i++) {
      expect(LEVELS[levels[i]].maxSide).toBeGreaterThan(LEVELS[levels[i - 1]].maxSide);
      expect(LEVELS[levels[i]].quality).toBeGreaterThan(LEVELS[levels[i - 1]].quality);
    }
    for (const l of levels) expect(LEVELS[l].quality).toBeLessThan(1);
  });

  it('defaults to better quality, not the best or the smallest', () => {
    expect(DEFAULT_LEVEL).toBe(4);
    expect(LEVELS[DEFAULT_LEVEL].label).toBe('Better quality');
  });

  it('reads the project setting: a project that never had it counts as on, at the default level', () => {
    expect(optimiseSettings({})).toEqual({ on: true, level: 4 });
    expect(optimiseSettings(createProject('New').settings)).toEqual({ on: true, level: 4 });
    expect(optimiseSettings({ optimiseOutput: false, optimiseLevel: 2 })).toEqual({ on: false, level: 2 });
  });

  it('keeps a bad level inside the slider', () => {
    expect(clampLevel(0)).toBe(4);
    expect(clampLevel(9)).toBe(4);
    expect(clampLevel('x')).toBe(4);
    expect(clampLevel(1)).toBe(1);
    expect(clampLevel(4.6)).toBe(5);
  });
});

describe('fitWithin', () => {
  it('scales the long side down to the cap, keeping the shape', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('never makes a picture bigger', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 });
  });
  it('never makes a side zero', () => {
    expect(fitWithin(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe('which pictures are touched', () => {
  it('jpeg, png and webp only, and not svg, gif or video', () => {
    expect(rasterMime('image/jpeg')).toBe('image/jpeg');
    expect(rasterMime('image/jpg')).toBe('image/jpeg');
    expect(rasterMime('IMAGE/PNG; charset=x')).toBe('image/png');
    expect(rasterMime('image/webp')).toBe('image/webp');
    for (const m of ['image/svg+xml', 'image/gif', 'image/avif', 'video/mp4', 'audio/mpeg', 'font/woff2', 'application/json']) expect(rasterMime(m)).toBeNull();
  });

  const png = (chunks: string[]) => {
    const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const c of chunks) bytes.push(0, 0, 0, 4, ...[...c].map((x) => x.charCodeAt(0)), 1, 2, 3, 4, 0, 0, 0, 0);
    return new Uint8Array(bytes);
  };

  it('spots an animated PNG by its acTL chunk ahead of the picture data, and a still one by IDAT coming first', () => {
    expect(isAnimatedImage(png(['IHDR', 'acTL', 'IDAT']), 'image/png')).toBe(true);
    expect(isAnimatedImage(png(['IHDR', 'IDAT', 'IEND']), 'image/png')).toBe(false);
    // an acTL after the picture data does not count (the spec puts it before)
    expect(isAnimatedImage(png(['IHDR', 'IDAT', 'acTL']), 'image/png')).toBe(false);
  });

  it('spots an animated WebP by the animation flag in its VP8X header', () => {
    const webp = (flags: number) => {
      const b = new Uint8Array(30);
      b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
      b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
      b.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
      b[20] = flags;
      return b;
    };
    expect(isAnimatedImage(webp(0x02), 'image/webp')).toBe(true);
    expect(isAnimatedImage(webp(0x10), 'image/webp')).toBe(false);
    expect(isAnimatedImage(new Uint8Array(4), 'image/webp')).toBe(false);
    expect(isAnimatedImage(new Uint8Array(4), 'image/jpeg')).toBe(false);
  });

  it('finds transparency in pixel data, and picks WebP for it and JPEG without', () => {
    expect(hasAlphaPixels(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
    expect(hasAlphaPixels(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(true);
    expect(outputMime(true)).toBe('image/webp');
    expect(outputMime(false)).toBe('image/jpeg');
  });
});

describe('the canvas proxy plan', () => {
  it('shrinks a camera photo to the proxy size', () => {
    expect(planProxy(facts())).toEqual({ width: 2560, height: 1920 });
  });
  it('shrinks a heavy picture that is not big in pixels (no resize, a re-encode)', () => {
    expect(planProxy(facts({ width: 2000, height: 1000, bytes: 5_000_000 }))).toEqual({ width: 2000, height: 1000 });
  });
  it('leaves a small one, an animated one and a vector or gif one alone', () => {
    expect(planProxy(facts({ width: 1200, height: 800, bytes: 300_000 }))).toBeNull();
    expect(planProxy(facts({ animated: true }))).toBeNull();
    expect(planProxy(facts({ mime: 'image/svg+xml' }))).toBeNull();
    expect(planProxy(facts({ mime: 'image/gif' }))).toBeNull();
  });
  it('is named for the numbers that made it, so changing them makes a new copy', () => {
    expect(proxyKey()).toBe(`edit-${PROXY.maxSide}-${Math.round(PROXY.quality * 100)}`);
    expect(proxyKey()).toMatch(/^[a-z0-9-]{1,40}$/);
  });
});

describe('the optimised output plan', () => {
  it('caps the long side at the level, a notch at a time', () => {
    expect(planOutput(facts(), 1)).toEqual({ width: 1280, height: 960 });
    expect(planOutput(facts(), 4)).toEqual({ width: 2560, height: 1920 });
    expect(planOutput(facts(), 5)).toEqual({ width: 3840, height: 2880 });
  });
  it('does not upscale a picture smaller than the cap, but still re-encodes it if it is heavy', () => {
    expect(planOutput(facts({ width: 1000, height: 800, bytes: 2_000_000 }), 4)).toEqual({ width: 1000, height: 800 });
  });
  it('leaves a picture that is small in pixels and in bytes', () => {
    expect(planOutput(facts({ width: 1000, height: 800, bytes: SMALL_BYTES - 1 }), 4)).toBeNull();
  });
  it('still shrinks a light picture that has more pixels than the level keeps', () => {
    expect(planOutput(facts({ width: 6000, height: 3000, bytes: SMALL_BYTES - 1 }), 4)).toEqual({ width: 2560, height: 1280 });
  });
  it('skips animation and anything it does not redraw, at every level', () => {
    for (const l of [1, 2, 3, 4, 5] as OptimiseLevel[]) {
      expect(planOutput(facts({ animated: true }), l)).toBeNull();
      expect(planOutput(facts({ mime: 'image/gif' }), l)).toBeNull();
      expect(planOutput(facts({ mime: 'image/svg+xml' }), l)).toBeNull();
    }
  });
});

describe('worth keeping', () => {
  it('only when the copy is clearly smaller', () => {
    expect(worthKeeping(1000, 500)).toBe(true);
    expect(worthKeeping(1000, 900)).toBe(true);
    expect(worthKeeping(1000, 901)).toBe(false);
    expect(worthKeeping(1000, 1200)).toBe(false);
    expect(worthKeeping(1000, 0)).toBe(false);
  });
});

describe('the cache key', () => {
  it('is different for every level and says what made it', () => {
    const keys = ([1, 2, 3, 4, 5] as OptimiseLevel[]).map(outputKey);
    expect(new Set(keys).size).toBe(5);
    expect(outputKey(4)).toBe('o4-2560-85');
    for (const k of keys) expect(k).toMatch(/^[a-z0-9-]{1,40}$/);
  });
  it('is never the proxy key', () => {
    for (const l of [1, 2, 3, 4, 5] as OptimiseLevel[]) expect(outputKey(l)).not.toBe(proxyKey());
  });
});

describe('which file an export picks', () => {
  it('takes the original for anything that is not a redrawn picture', () => {
    for (const m of ['image/svg+xml', 'image/gif', 'video/mp4', 'audio/mpeg', 'font/woff2']) expect(outputSource(m, undefined, 4)).toBe('original');
  });
  it('makes the copy when none is stored for this level', () => {
    expect(outputSource('image/jpeg', undefined, 4)).toBe('make');
    expect(outputSource('image/jpeg', { [proxyKey()]: 300 }, 4)).toBe('make');
    // a copy for another level is not this level's
    expect(outputSource('image/jpeg', { [outputKey(2)]: 300 }, 4)).toBe('make');
  });
  it('takes the stored copy when there is one for this level', () => {
    expect(outputSource('image/png', { [outputKey(4)]: 300 }, 4)).toBe('variant');
  });
  it('takes the original when the stored answer is that the original is as good', () => {
    expect(outputSource('image/png', { [outputKey(4)]: 0 }, 4)).toBe('original');
  });
});

describe('what the Assets panel says', () => {
  it('reports the proxy and what the output saves at the current level', () => {
    expect(savingsOf(4_000_000, { [proxyKey()]: 400_000, [outputKey(4)]: 600_000 }, 4)).toEqual({ proxy: 400_000, output: { size: 600_000, saved: 3_400_000 } });
  });
  it('reports nothing for an asset with no copies, and ignores another level', () => {
    expect(savingsOf(4_000_000, undefined, 4)).toEqual({});
    expect(savingsOf(4_000_000, { [outputKey(1)]: 100 }, 4)).toEqual({});
  });
  it('says so when the original is as good', () => {
    expect(savingsOf(100_000, { [outputKey(4)]: 0, [proxyKey()]: 0 }, 4)).toEqual({ output: 'same' });
  });
});
