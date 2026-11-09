//The bottom panel's height follows the window until somebody sets one, and the Keyframe column scrolls when it is taller than the panel.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOTTOM_DEFAULT, bottomHeightFor } from '../src/lib/dock';
import { DEFAULT_BOTTOM } from '../src/lib/interactions-room';

describe('bottomHeightFor', () => {
  it('the untouched default stays 260 on a short window and grows on a tall one, up to 440', () => {
    expect(bottomHeightFor(BOTTOM_DEFAULT, 600)).toBe(260);
    expect(bottomHeightFor(BOTTOM_DEFAULT, 720)).toBe(260);
    expect(bottomHeightFor(BOTTOM_DEFAULT, 900)).toBe(288);
    expect(bottomHeightFor(BOTTOM_DEFAULT, 1080)).toBe(346);
    expect(bottomHeightFor(BOTTOM_DEFAULT, 1400)).toBe(440);
    expect(bottomHeightFor(BOTTOM_DEFAULT, 4000)).toBe(440);
  });

  it('a height somebody set is theirs, except that the canvas keeps 200px', () => {
    expect(bottomHeightFor(300, 1400)).toBe(300);
    expect(bottomHeightFor(500, 1400)).toBe(500);
    expect(bottomHeightFor(500, 600)).toBe(400);
    expect(bottomHeightFor(140, 1400)).toBe(140);
  });

  it('a very short window still leaves a panel you can use', () => {
    expect(bottomHeightFor(BOTTOM_DEFAULT, 300)).toBe(140);
  });

  it('is the same number the Interactions room treats as untouched', () => {
    expect(DEFAULT_BOTTOM).toBe(BOTTOM_DEFAULT);
  });
});

describe('the Keyframe column', () => {
  const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
  const rule = (sel: string) => new RegExp(`\\n${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  it('scrolls on its own when its settings do not fit', () => {
    const r = rule('.key-editor');
    expect(r).toMatch(/overflow-y:\s*auto/);
    expect(r).toMatch(/min-height:\s*0/);
  });
});
