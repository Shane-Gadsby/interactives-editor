/**
 * Every starter's checklist is a to-do list a course designer can read at a glance: each item one short, plain action, and the how and
 * why in a fold (`detail`), where the layer, panel and variable names live.
 */
import { describe, expect, it } from 'vitest';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';

const MAX_CHARS = 90;
const MAX_WORDS = 14;
//what belongs in the fold: how the tool does it, not what the person has to do
const JARGON = /\b(variables?|nodes?|tabs?|inspector|expressions?|flows?|interactions?|repeater|formulas?|binding|bindings|asset id|user data|property)\b|[`"]|\b[a-z]+[A-Z]\w*|\bProject >|;|\.\s+[A-Z]/;

describe('starter checklists', () => {
  const items = BRANDED_STARTERS.flatMap((s) => projectFromBrandedStarter(s, COLOURWAYS[0]).template!.checklist.map((i, n) => ({ key: s.key, n: n + 1, ...i })));

  it('has a checklist for every starter', () => {
    for (const s of BRANDED_STARTERS) expect(items.filter((i) => i.key === s.key).length, s.key).toBeGreaterThan(0);
  });

  it(`keeps every item to ${MAX_WORDS} words and ${MAX_CHARS} characters`, () => {
    const long = items.filter((i) => i.text.length > MAX_CHARS || i.text.split(/\s+/).length > MAX_WORDS).map((i) => `${i.key} #${i.n}: ${i.text}`);
    expect(long).toEqual([]);
  });

  it('names no layer, tab, panel, variable or node in the item itself', () => {
    const jargon = items.filter((i) => JARGON.test(i.text)).map((i) => `${i.key} #${i.n}: ${i.text}`);
    expect(jargon).toEqual([]);
  });

  it('keeps the detail of an item that was shortened, and never repeats the item as its own detail', () => {
    for (const i of items) {
      if (i.detail === undefined) continue;
      expect(i.detail.trim().length, `${i.key} #${i.n}`).toBeGreaterThan(i.text.length);
      expect(i.detail, `${i.key} #${i.n}`).not.toBe(i.text);
    }
    //the long ones were not thrown away: most starters carry detail on most items
    expect(items.filter((i) => i.detail).length).toBeGreaterThan(items.length / 2);
  });

  it('reads as plain sentences: no em dashes, no trailing full stop on the item', () => {
    for (const i of items) {
      expect(i.text, `${i.key} #${i.n}`).not.toContain('—');
      expect(i.text.endsWith('.'), `${i.key} #${i.n}`).toBe(false);
    }
  });
});
