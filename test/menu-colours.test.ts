import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
/** The declarations of the rule whose selector list starts with `sel`. */
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel}`);
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(css.indexOf('{', i), css.indexOf('}', i));
};

describe('menus highlight in the brand gold, not the old blue', () => {
  it.each(['.ctx-item:hover:not(:disabled)', '.add-menu-list button:hover', '.quick-unlock:hover'])('%s', (sel) => {
    const r = rule(sel);
    expect(r).toMatch(/background:\s*var\(--primary-bg\)/);
    expect(r).toMatch(/color:\s*var\(--primary-fg\)/);
    expect(r).not.toMatch(/--accent/);
  });

  it('a Delete item still turns red, with light text', () => {
    const r = rule('.ctx-item.danger:hover');
    expect(r).toMatch(/background:\s*var\(--danger\)/);
    expect(r).toMatch(/color:\s*#fff/);
  });
});
