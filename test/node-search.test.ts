//Finding graph nodes: the palette's search box and the Add and connect menu share one matcher (the properties panel's scorer).
import { describe, expect, it } from 'vitest';
import { CATALOG } from 'interactives-player';
import { NODE_SYNONYMS, rankNodes, suggestNode } from '../src/lib/node-search';

const kinds = (q: string) => rankNodes(q).map((d) => d.kind);
const top = (q: string) => kinds(q)[0];

describe('node search', () => {
  it('finds every node by its own label, at or near the top', () => {
    for (const d of CATALOG) {
      const hits = kinds(d.label);
      expect(hits, d.label).toContain(d.kind);
      expect(hits.indexOf(d.kind), `${d.label} should rank in the first few`).toBeLessThan(3);
    }
  });

  it('finds every node by each of its synonyms', () => {
    for (const [kind, words] of Object.entries(NODE_SYNONYMS)) {
      expect(CATALOG.some((d) => d.kind === kind), `a synonym list for ${kind}, which is not a node`).toBe(true);
      for (const w of words) expect(kinds(w), `${w} should find ${kind}`).toContain(kind);
    }
  });

  it('knows the names people use', () => {
    expect(top('goto')).toBe('action.artboard');
    expect(kinds('navigate')).toContain('action.artboard');
    expect(kinds('page')).toContain('action.artboard');
    expect(top('condition')).toBe('logic.if');
    expect(top('branch')).toBe('logic.if');
    expect(top('wait')).toBe('action.delay');
    expect(kinds('delay')).toContain('action.delay');
    expect(kinds('pause')).toContain('action.delay');
    expect(top('audio')).toBe('action.sound');
    expect(kinds('countdown')).toEqual(expect.arrayContaining(['action.clock', 'event.timer']));
    expect(top('var')).toBe('action.setVariable');
    expect(kinds('tap')).toContain('event.pointer');
    expect(top('click')).toBe('event.pointer');
    expect(kinds('shortcut')).toContain('event.key');
    expect(top('keyboard')).toBe('event.key');
  });

  it('puts the exact label first and looser matches after', () => {
    const hits = kinds('wait');
    expect(hits[0]).toBe('action.delay');
    expect(hits.slice(1)).toEqual(expect.arrayContaining(['action.waitBlendIn', 'action.waitTimeline']));
    expect(top('on key')).toBe('event.key');
    expect(top('set variable')).toBe('action.setVariable');
  });

  it('forgives typos and missing letters', () => {
    expect(kinds('artbord')).toContain('action.artboard');
    expect(kinds('varable')).toContain('action.setVariable');
    expect(kinds('seqence')).toContain('logic.sequence');
    expect(kinds('rndom')).toContain('logic.random');
  });

  it('needs every word to match something, in any order', () => {
    expect(top('artboard go')).toBe('action.artboard');
    expect(kinds('sound variable')).toEqual([]);
  });

  it('reads the topic and the summary too', () => {
    expect(kinds('dragging').length).toBeGreaterThan(4);
    expect(kinds('microphone')).toEqual(expect.arrayContaining(['action.recordStart', 'action.listen']));
    expect(kinds('screen readers')).toEqual(expect.arrayContaining(['action.announce']));
  });

  it('gives every node when nothing is typed, in catalog order', () => {
    expect(rankNodes('')).toEqual(CATALOG);
    expect(rankNodes('   ')).toEqual(CATALOG);
  });

  it('suggests the nearest name when nothing matches', () => {
    expect(kinds('artbaord zzz')).toEqual([]);
    expect(suggestNode('artbaord')).toBe('Go to a page');
    expect(suggestNode('qqqqqq')).toBeNull();
  });
});
