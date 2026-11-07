import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, createProject, defaultTheme, tokenValue, type ButtonNode, type Project, type RectNode, type TextNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { starterThemes } from '../src/lib/themes';
import { colourKey, describeLink, followCounts, linkColours, matchToken, nothingFollowsTheme, planLinkColours, tokensByColour } from '../src/lib/link-colours';
import { brandedPage, brandedProject } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';

const solid = (color: string) => ({ type: 'solid' as const, color });
const tok = (p: Project, name: string) => p.themes!.tokens.find((t) => t.name === name)!;
const ref = (p: Project, name: string) => `token:${tok(p, name).id}`;
/** A token's colour in the default theme, as the matching sees it. */
const val = (p: Project, name: string) => tokenValue(p.themes!, tok(p, name), defaultTheme(p.themes!).id)!;

function plain(): Project {
  const p = createProject('Plain');
  p.themes = starterThemes();
  return p;
}

describe('link colours: matching', () => {
  it('reads #fff, #ffffff, rgb() and case the same, and cares about alpha', () => {
    expect(colourKey('#FFF')).toBe(colourKey('#ffffff'));
    expect(colourKey('rgb(255, 255, 255)')).toBe(colourKey('#ffffff'));
    expect(colourKey('#ffffff80')).not.toBe(colourKey('#ffffff'));
    expect(colourKey('transparent')).toBeNull();
    expect(colourKey('var(--x)')).toBeNull();
  });

  it('finds the token with that colour in the default theme, not another theme', () => {
    const p = plain();
    const table = tokensByColour(p.themes!);
    expect(matchToken(table, val(p, 'color/text').toUpperCase(), 'text')!.name).toBe('color/text');
    // a colour only the Dark theme has is no match
    const dark = p.themes!.list[1].id;
    tok(p, 'color/muted').values[dark] = '#123457';
    expect(matchToken(tokensByColour(p.themes!), '#123457', 'text')).toBeUndefined();
  });

  it('breaks a tie by the role: a shared value goes to the token that role prefers, else the first', () => {
    const p = plain();
    const t = p.themes!;
    const def = t.list[0].id;
    // make button, primary and surface the same colour
    tok(p, 'color/button').values[def] = '#abcdef';
    tok(p, 'color/primary').values[def] = '#abcdef';
    tok(p, 'color/surface').values[def] = '#abcdef';
    const table = tokensByColour(t);
    expect(matchToken(table, '#abcdef', 'buttonFill')!.name).toBe('color/button');
    expect(matchToken(table, '#abcdef', 'fill')!.name).toBe('color/surface');
    expect(matchToken(table, '#abcdef', 'background')!.name).toBe('color/surface');
    // a role with no preference among them gets the first by token order
    const order = t.tokens.map((x) => x.name);
    expect(matchToken(table, '#abcdef', 'shadow')!.name).toBe(['color/surface', 'color/primary', 'color/button'].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0]);
    // text and border roles
    tok(p, 'color/text').values[def] = '#778899';
    tok(p, 'color/muted').values[def] = '#778899';
    tok(p, 'color/border').values[def] = '#778899';
    tok(p, 'color/divider').values[def] = '#778899';
    tok(p, 'color/on-button').values[def] = '#778899';
    const t2 = tokensByColour(t);
    expect(matchToken(t2, '#778899', 'text')!.name).toBe('color/text');
    expect(matchToken(t2, '#778899', 'stroke')!.name).toBe('color/border');
    expect(matchToken(t2, '#778899', 'buttonText')!.name).toBe('color/on-button');
  });
});

describe('link colours: what gets linked', () => {
  function sample() {
    const p = plain();
    const t = p.themes!;
    const ab = p.artboards[0];
    ab.background = solid(val(p, 'color/background').toUpperCase());
    const rect = createNode('rect', { name: 'Card', fill: solid(val(p, 'color/surface')), stroke: { paint: solid(val(p, 'color/border')), width: 2 } }) as RectNode;
    const stray = createNode('rect', { name: 'Stray', fill: solid('#13579b') }) as RectNode;
    const label = createNode('text', {
      name: 'Label',
      color: val(p, 'color/text'),
      runs: [{ start: 0, end: 2, color: val(p, 'color/muted') }],
    } as never) as TextNode;
    const btn = createNode('button', { name: 'Go', label: 'Go', fill: solid(val(p, 'color/button')), color: val(p, 'color/on-button') }) as ButtonNode;
    ab.children.push(rect, stray, label, btn);
    return { p, t, ab, rect, stray, label, btn };
  }

  it('links backgrounds, fills, strokes, text, runs and button colours, and leaves the rest', () => {
    const { p } = sample();
    const snapshot = JSON.stringify(p);
    const plan = planLinkColours(p);
    expect(JSON.stringify(p)).toBe(snapshot);
    expect(plan.byKind).toMatchObject({ backgrounds: 1, fills: 2, text: 3, strokes: 1 });
    expect(plan.total).toBe(7);
    expect(describeLink(plan)).toBe('Link 7 colours: 1 background, 2 fills, 3 text, 1 stroke');
    expect(plan.left).toEqual([{ color: '#13579b', count: 1, where: ['Stray'] }]);
    const done = linkColours(p);
    expect(done.total).toBe(7);
    const ab = p.artboards[0];
    expect((ab.background as { color: string }).color).toBe(ref(p, 'color/background'));
    const [rect, stray, label, btn] = ab.children as [RectNode, RectNode, TextNode, ButtonNode];
    expect(rect.fill).toEqual(solid(ref(p, 'color/surface')));
    expect(rect.stroke!.paint).toEqual(solid(ref(p, 'color/border')));
    expect(stray.fill).toEqual(solid('#13579b'));
    expect(label.color).toBe(ref(p, 'color/text'));
    expect((label as unknown as { runs: { color: string }[] }).runs[0].color).toBe(ref(p, 'color/muted'));
    expect(btn.color).toBe(ref(p, 'color/on-button'));
    expect(followCounts(p)).toEqual({ followed: 7, plain: 1 });
  });

  it('does gradient stops and shadows, and keeps the alpha it matched on', () => {
    const { p, rect } = sample();
    const text = val(p, 'color/text');
    rect.fill = { type: 'linear', angle: 90, stops: [{ offset: 0, color: text }, { offset: 1, color: `${text}80` }] } as never;
    (rect as unknown as { shadow: object }).shadow = { x: 0, y: 2, blur: 4, spread: 0, color: text };
    linkColours(p);
    const f = p.artboards[0].children[0] as RectNode;
    const stops = (f.fill as unknown as { stops: { color: string }[] }).stops;
    expect(stops[0].color).toBe(ref(p, 'color/text'));
    expect(stops[1].color).toBe(`${text}80`);
    expect((f as unknown as { shadow: { color: string } }).shadow.color).toBe(ref(p, 'color/text'));
  });

  it('leaves a part that follows a colour style alone', () => {
    const { p, rect } = sample();
    rect.styleRefs = { fill: 'some-style' };
    linkColours(p);
    expect((p.artboards[0].children[0] as RectNode).fill).toEqual(solid(val(p, 'color/surface')));
    // the stroke has no style, so it was linked
    expect((p.artboards[0].children[0] as RectNode).stroke!.paint).toEqual(solid(ref(p, 'color/border')));
  });

  it('only touches the artboards asked for', () => {
    const { p } = sample();
    const other = createProject('x').artboards[0];
    other.id = 'ab2';
    other.background = solid(val(p, 'color/background'));
    p.artboards.push(other);
    const plan = planLinkColours(p, { artboardIds: ['ab2'] });
    expect(plan.total).toBe(1);
    linkColours(p, { artboardIds: ['ab2'] });
    expect((other.background as { color: string }).color).toBe(ref(p, 'color/background'));
    expect((p.artboards[0].background as { color: string }).color).toBe(val(p, 'color/background').toUpperCase());
  });

  it('does nothing in a project without tokens, and counts what already follows', () => {
    const bare = createProject('Bare');
    expect(planLinkColours(bare).total).toBe(0);
    const { p } = sample();
    linkColours(p);
    const again = planLinkColours(p);
    expect(again.total).toBe(0);
    expect(again.already).toBe(7);
  });
});

describe('link colours: brand and libraries', () => {
  it('skips brand chrome in a branded project until the override is on', () => {
    const ctx = brandedProject(COLOURWAYS[1], 'Pack');
    const page = brandedPage(ctx, 'One', { footer: 'Page 1' });
    const p = ctx.project;
    // a plain colour on a brand layer, as a hand edit under the override would leave
    const chrome = page.children.find((n) => (n as { tags?: string[] }).tags?.includes('brand-chrome') && (n as { fill?: unknown }).fill) as RectNode | undefined;
    expect(chrome).toBeTruthy();
    const hex = val(p, 'color/surface');
    chrome!.fill = solid(hex);
    expect(planLinkColours(p).byKind.fills).toBe(0);
    linkColours(p);
    expect(chrome!.fill).toEqual(solid(hex));
    expect(planLinkColours(p, { brandOverride: true }).byKind.fills).toBeGreaterThan(0);
    linkColours(p, { brandOverride: true });
    expect(chrome!.fill).toEqual(solid(ref(p, 'color/surface')));
  });

  it('skips a library copy, which is read-only', () => {
    const p = plain();
    p.artboards[0].background = solid(val(p, 'color/background'));
    p.artboards[0].library = { libraryId: 'l', artboardId: 'a', version: 1 } as never;
    expect(planLinkColours(p).total).toBe(0);
  });
});

describe('link colours: the hint', () => {
  it('says nothing follows when the project has tokens and only plain colours', () => {
    const p = plain();
    p.artboards[0].background = solid('#ffffff');
    expect(nothingFollowsTheme(p)).toBe(true);
    p.artboards[0].background = solid(ref(p, 'color/background'));
    expect(nothingFollowsTheme(p)).toBe(false);
  });

  it('says nothing for a project without tokens, an empty one, or hidden artboards', () => {
    const bare = createProject('B');
    bare.artboards[0].background = solid('#ffffff');
    expect(nothingFollowsTheme(bare)).toBe(false);
    const p = plain();
    p.artboards[0].background = null as never;
    expect(nothingFollowsTheme(p)).toBe(false);
    p.artboards[0].background = solid('#ffffff');
    expect(nothingFollowsTheme(p, [])).toBe(false);
  });
});

describe('link colours: one undo step', () => {
  let s: EditorStore;
  beforeEach(() => {
    const p = plain();
    p.artboards[0].background = solid(val(p, 'color/background'));
    p.artboards[0].children.push(
      createNode('rect', { name: 'A', fill: solid(val(p, 'color/surface')) }),
      createNode('rect', { name: 'B', fill: solid(val(p, 'color/primary')) }),
      createNode('text', { name: 'T', color: val(p, 'color/text') } as never),
    );
    s = new EditorStore(p);
    setCurrentStore(s);
  });

  it('is one update, so one undo puts every colour back and one redo links them again', () => {
    const before = JSON.stringify(s.get().project.artboards);
    s.update((d) => void linkColours(d));
    const after = JSON.stringify(s.get().project.artboards);
    expect(after).not.toBe(before);
    expect(nothingFollowsTheme(s.get().project)).toBe(false);
    s.undo();
    expect(JSON.stringify(s.get().project.artboards)).toBe(before);
    expect(nothingFollowsTheme(s.get().project)).toBe(true);
    s.redo();
    expect(JSON.stringify(s.get().project.artboards)).toBe(after);
  });
});
