import { describe, expect, it } from 'vitest';
import { formatTracks, parseTracks } from '../src/lib/grid-tracks';

describe('grid track text', () => {
  it('reads px, percent, fr and auto, with a bare number as px, and skips what is not a size', () => {
    expect(parseTracks('100px 25% 1.5fr auto 40 wide')).toEqual([
      { type: 'px', value: 100 },
      { type: 'percent', value: 25 },
      { type: 'fr', value: 1.5 },
      { type: 'auto' },
      { type: 'px', value: 40 },
    ]);
    expect(parseTracks('')).toEqual([]);
  });
  it('writes the same text back', () => {
    const text = '100px 25% 1.5fr auto';
    expect(formatTracks(parseTracks(text))).toBe(text);
  });
});
