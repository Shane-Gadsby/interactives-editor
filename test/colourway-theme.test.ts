//The branded colourways can be added to any project as themes from the Themes tab
import { describe, expect, it } from 'vitest';
import { createProject, tokenByName } from 'interactives-player';
import { ALL_COLOURWAYS, addColourwayTheme } from '../src/lib/branded/colourway';
import { COLOURWAYS, HIGH_CONTRAST } from '../src/lib/branded/looks';

describe('add a colourway as a theme', () => {
  it('adds it with its colours on the starter tokens and its brand tokens, once', () => {
    const p = createProject('C');
    const purple = COLOURWAYS.find((w) => w.id === 'purple')!;
    expect(addColourwayTheme(p, purple)).toBe(true);
    expect(addColourwayTheme(p, purple)).toBe(false);
    const t = p.themes!;
    expect(t.list.map((x) => x.name)).toEqual(expect.arrayContaining(['Light', 'Dark', 'High contrast', 'Purple']));
    expect(tokenByName(t, 'color/button')!.values['theme-purple']).toBe(purple.tokens.button);
    expect(tokenByName(t, 'color/background')!.values['theme-purple']).toBe('#ffffff');
    const grad = t.tokens.find((k) => k.values['theme-purple'] === purple.brand.gradientStart && /gradient/.test(k.name))!;
    expect(grad).toBeTruthy();
    //the themes that were there before get a value too, so the new token is never empty
    for (const th of t.list) expect(grad.values[th.id]).toBeTruthy();
  });

  it('adds every colourway; High contrast is the one every project already has, so it is not added twice', () => {
    const p = createProject('C');
    for (const w of ALL_COLOURWAYS) addColourwayTheme(p, w);
    expect(p.themes!.list.filter((x) => x.id === `theme-${HIGH_CONTRAST.id}`)).toHaveLength(1);
    expect(p.themes!.list).toHaveLength(3 + COLOURWAYS.length);
  });
});
