import { beforeEach, describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, uid, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { STARTERS, projectFromStarter } from '../src/lib/template-starters';
import { brokenThings, checkBeforeShare, deadButtons, HEAVY_BYTES, loadFine, mediaThings, placeholderText, setFine, templateLeftovers, unreachablePages } from '../src/lib/before-share';
import { writeClickFlow } from '../src/lib/click-flow';

const add = (ab: Artboard, ...n: SceneNode[]) => void ab.children.push(...n);
const btn = (name: string, extra: Record<string, unknown> = {}) => createNode('button', { name, label: name, x: 10, y: 10, width: 120, height: 40, ...extra } as never);
function pages(n = 3): Project {
  const p = createProject('Pages');
  p.artboards = Array.from({ length: n }, (_, i) => createArtboard({ id: `p${i + 1}`, name: `Page ${i + 1}`, width: 800, height: 500, canvasX: i * 900 }));
  p.settings.startArtboardId = 'p1';
  return p;
}
const goTo = (ab: Artboard, layer: SceneNode, page: string) => writeClickFlow(ab, layer.id, [{ kind: 'action.artboard', params: { to: 'picked', artboard: page } }]);

beforeEach(() => localStorage.clear());

describe('before you share: buttons that do nothing', () => {
  it('flags a button nothing happens to, and not one that has a click, a click on what holds it, or is switched off', () => {
    const p = pages(1);
    const ab = p.artboards[0];
    const dead = btn('Dead');
    const wired = btn('Wired');
    const inner = btn('Inner');
    const off = btn('Off', { disabled: true });
    const hidden = btn('Hidden', { visible: false });
    const card = createNode('frame', { name: 'Card', width: 300, height: 100, children: [inner] } as never);
    add(ab, dead, wired, card, off, hidden);
    writeClickFlow(ab, wired.id, [{ kind: 'action.timeline' }]);
    writeClickFlow(ab, card.id, [{ kind: 'action.timeline' }]);
    expect(deadButtons(p).map((i) => i.name)).toEqual(['Dead (“Dead”)']);
  });

  it('counts a pointer event with no layer picked as covering the page', () => {
    const p = pages(1);
    add(p.artboards[0], btn('Anything'));
    p.artboards[0].logic.nodes.push({ id: uid('lg'), kind: 'event.pointer', x: 0, y: 0, params: { type: 'click' } });
    expect(deadButtons(p)).toEqual([]);
  });
});

describe('before you share: pages nothing leads to', () => {
  it('follows Go to artboard from the start page, and lists the pages left over', () => {
    const p = pages(4);
    const [a, b] = p.artboards;
    const next = btn('Next');
    add(a, next);
    goTo(a, next, 'p2');
    const more = btn('More');
    add(b, more);
    goTo(b, more, 'p3');
    expect(unreachablePages(p).map((i) => i.name)).toEqual(['Page 4']);
  });

  it('counts Next as leading to the next page, but only from a page that can be reached', () => {
    const p = pages(3);
    const next = btn('Next');
    add(p.artboards[0], next);
    writeClickFlow(p.artboards[0], next.id, [{ kind: 'action.artboard', params: { to: 'next' } }]);
    //page 2 is reached, but nothing on it goes on
    expect(unreachablePages(p).map((i) => i.name)).toEqual(['Page 3']);
  });

  it('says nothing when a graph picks pages by expression, for one page, and for pages another page draws or uses as a master', () => {
    const p = pages(3);
    const x = btn('X');
    add(p.artboards[0], x);
    writeClickFlow(p.artboards[0], x.id, [{ kind: 'action.artboard', params: { to: 'expression', expr: '"Page 3"' } }]);
    expect(unreachablePages(p)).toEqual([]);
    expect(unreachablePages(pages(1))).toEqual([]);
    const q = pages(3);
    q.artboards[2].isMaster = true;
    add(q.artboards[0], createNode('instance', { name: 'Part', artboardId: 'p2' } as never));
    expect(unreachablePages(q)).toEqual([]);
  });
});

describe('before you share: words, links and files', () => {
  it('finds sample words, the tool\'s own defaults and placeholders in brackets, but not ordinary words', () => {
    const p = pages(1);
    const ab = p.artboards[0];
    add(ab, createNode('text', { name: 'A', text: 'Text' } as never), createNode('text', { name: 'B', text: 'Lorem ipsum dolor sit amet' } as never), createNode('text', { name: 'C', text: 'Welcome, [Your name]' } as never), btn('Button'), createNode('text', { name: 'D', text: 'Replace this with your picture' } as never));
    add(ab, createNode('text', { name: 'Fine', text: 'The text of the lesson' } as never), btn('Start the lesson'), createNode('text', { name: 'Hid', text: 'Text', visible: false } as never));
    expect(placeholderText(p).map((i) => i.name)).toEqual(['A', 'B', 'C', 'Button', 'D']);
  });

  it('finds links with no address, a space in it or a scheme a browser will not open', () => {
    const p = pages(1);
    add(p.artboards[0], createNode('link', { name: 'Empty', text: 'x', href: '' } as never), createNode('link', { name: 'Spacey', text: 'x', href: 'https://a b.com' } as never), createNode('link', { name: 'Odd', text: 'x', href: 'ftp-ish:thing' } as never), createNode('link', { name: 'Fine', text: 'x', href: 'https://example.com' } as never), createNode('link', { name: 'Mail', text: 'x', href: 'mailto:a@b.com' } as never));
    expect(brokenThings(p).map((i) => i.name)).toEqual(['Empty', 'Spacey', 'Odd']);
  });

  it('reports what Usage finds gone, but not a layer that lives on another page', () => {
    const p = pages(2);
    const target = btn('Target');
    add(p.artboards[1], target);
    const a = p.artboards[0];
    a.logic.nodes.push({ id: 'ev', kind: 'event.start', x: 0, y: 0, params: {} }, { id: 'ac', kind: 'action.visibility', x: 0, y: 0, params: { target: target.id } }, { id: 'gone', kind: 'action.visibility', x: 0, y: 0, params: { target: 'nope' } });
    expect(brokenThings(p).filter((i) => i.key.startsWith('missing:')).map((i) => i.key.split(':')[2])).toEqual(['nope']);
  });

  it('finds files nothing uses, and a project that is heavy', () => {
    const p = pages(1);
    const asset = (name: string, size: number) => ({ id: uid('as'), name, mime: 'image/png', size } as never);
    p.assets.push(asset('big.png', HEAVY_BYTES), asset('small.png', 1000));
    const m = mediaThings(p);
    expect(m.unused.map((i) => i.name).sort()).toEqual(['big.png', 'small.png']);
    expect(m.heavy.map((i) => i.name)).toEqual(['big.png', 'small.png']);
    expect(mediaThings(pages(1)).heavy).toEqual([]);
  });

  it('lists the template checklist items still to do', () => {
    const p = pages(1);
    p.template = { name: 'T', version: 1, checklist: [{ id: 'a', text: 'Do one', done: true }, { id: 'b', text: 'Do two' }, { id: 'c', text: 'Do three', done: false }] } as never;
    expect(templateLeftovers(p).map((i) => i.name)).toEqual(['Do two', 'Do three']);
    expect(templateLeftovers(pages(1))).toEqual([]);
  });
});

describe('before you share: the list', () => {
  it('groups what it finds, one group per kind, in a friendly order with counts in the title', () => {
    const p = pages(3);
    add(p.artboards[0], btn('Dead'), createNode('text', { name: 'A', text: 'Text' } as never), createNode('image', { name: 'Photo', assetId: 'x', x: 0, y: 100, width: 100, height: 100 } as never));
    p.assets.push({ id: 'x', name: 'photo.png', mime: 'image/png', size: 10 } as never);
    const g = checkBeforeShare(p, {});
    expect(g.map((x) => x.id)).toEqual(['dead-buttons', 'unreachable-pages', 'placeholder-text', 'alt-text']);
    expect(g[0].title).toBe('1 button does nothing when clicked');
    expect(g[1].title).toBe('2 pages nothing leads to');
    expect(g[2].title).toBe('1 piece of text still says the sample words');
    expect(g[3].items[0].finding?.fix?.input).toBeTruthy();
  });

  it('is empty for a project with nothing wrong', () => {
    const p = pages(1);
    add(p.artboards[0], createNode('text', { name: 'Body', text: 'Welcome to the lesson', color: '#111111' } as never));
    expect(checkBeforeShare(p, {})).toEqual([]);
  });

  it('leaves out what was marked fine, counts it, and brings it back when unmarked', () => {
    const p = pages(1);
    add(p.artboards[0], btn('Decor'), btn('Real'));
    const items = deadButtons(p);
    const fine = setFine(p.id, [items[0].key], true);
    const g = checkBeforeShare(p, fine);
    expect(g[0].items.map((i) => i.name)).toEqual(['Real (“Real”)']);
    expect(g[0].fine).toBe(1);
    expect(loadFine(p.id)[items[0].key]).toBeTruthy();
    expect(checkBeforeShare(p, setFine(p.id, [items[0].key], false))[0].items).toHaveLength(2);
  });

  it('honours the accessibility checker\'s own reviewed marks on a picture', async () => {
    const { toggleReviewed } = await import('../src/lib/a11y/reviewed');
    const p = pages(1);
    add(p.artboards[0], createNode('image', { name: 'Photo', assetId: 'x', x: 0, y: 100, width: 100, height: 100 } as never));
    p.assets.push({ id: 'x', name: 'photo.png', mime: 'image/png', size: 10 } as never);
    const f = checkBeforeShare(p, {}).find((g) => g.id === 'alt-text')!;
    toggleReviewed(p.id, f.items[0].finding!.id);
    expect(checkBeforeShare(p, {}).find((g) => g.id === 'alt-text')).toBeUndefined();
  });

  it('leaves locked brand layers to the accessibility panel', () => {
    const p = pages(1);
    add(p.artboards[0], createNode('image', { name: 'Logo', assetId: 'x', x: 0, y: 0, width: 100, height: 100, locked: true } as never));
    p.assets.push({ id: 'x', name: 'logo.png', mime: 'image/png', size: 10 } as never);
    expect(checkBeforeShare(p, {}).find((g) => g.id === 'alt-text')).toBeUndefined();
  });

  it('has no dead buttons and no unreachable pages in any starter, so a fresh one is never nagged falsely', () => {
    const all = [...BRANDED_STARTERS.map((s) => [s.key, projectFromBrandedStarter(s, COLOURWAYS[0])] as const), ...STARTERS.map((s) => [s.key, projectFromStarter(s)] as const)];
    expect(all.length).toBeGreaterThan(40);
    for (const [key, p] of all) {
      expect(deadButtons(p).map((i) => `${key}: ${i.name}`)).toEqual([]);
      expect(unreachablePages(p).map((i) => `${key}: ${i.name}`)).toEqual([]);
      expect(brokenThings(p).filter((i) => i.key.startsWith('href:')).map((i) => `${key}: ${i.name}`)).toEqual([]);
    }
  });
});
