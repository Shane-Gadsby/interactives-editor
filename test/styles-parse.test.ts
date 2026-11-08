//The stylesheet has to parse: the tests never load it, so a merge that left a rule unclosed only showed up when the editor
//was built (twice). This reads it the way the build does
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

describe('src/styles.css', () => {
  it('parses, with every rule closed', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
    expect(() => postcss.parse(css, { from: 'src/styles.css' })).not.toThrow();
  });

  it('has no rule opened inside another plain rule (the shape a bad merge leaves)', () => {
    const root = postcss.parse(readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8'));
    const nested: string[] = [];
    root.walkRules((r) => {
      if (r.parent?.type === 'rule') nested.push(`${(r.parent as { selector: string }).selector} > ${r.selector}`);
    });
    expect(nested).toEqual([]);
  });
});
