import { beforeEach, describe, expect, it } from 'vitest';
import { createNode, isTokenRef, walk, type Artboard, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { brandedPage, brandedProject, contentBox, isChrome, logo, text } from '../src/lib/branded/kit';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { brandLookViolation, isBrandLocked, snapToBrand } from '../src/lib/branded/lock';
import { offBrand } from '../src/lib/brand';

/** A two page branded project: a hero page and a content page with a text layer of the author's. */
function sample(strict?: boolean) {
  const ctx = brandedProject(COLOURWAYS[1], 'Pack');
  const hero = brandedPage(ctx, 'Welcome', { kind: 'hero', subtitle: 'Sub' });
  const page = brandedPage(ctx, 'One', { footer: 'Page 1' });
  const body = text(ctx, 'Body', 'Hello', contentBox(page).x, contentBox(page).y, 400);
  page.children.push(body);
  if (strict === false) ctx.project.brandLook!.strict = false;
  return { ctx, project: ctx.project, hero, page, body };
}
const byName = (ab: Artboard, name: string) => ab.children.find((n) => n.name === name)!;
//the chrome (logo, accent bar) is on a page's master, not the page
const chromeOn = (project: Project, page: Artboard, name: string) => byName(project.artboards.find((a) => a.id === page.master)!, name);

let s: EditorStore;
function open(p: Project, activeIndex = 1) {
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[activeIndex].id });
  return s;
}
const current = (id: string): SceneNode | undefined => {
  let hit: SceneNode | undefined;
  for (const ab of s.get().project.artboards) walk(ab.children, (n) => void (n.id === id && (hit = n)));
  return hit;
};

describe('the UniSQ logo', () => {
  it('is vector path layers painted with tokens, in a chrome group of the width asked for', () => {
    const ctx = brandedProject(COLOURWAYS[0], 'T');
    for (const mode of [false, true, 'deep'] as const) {
      const g = logo(ctx, 10, 20, 120, mode) as SceneNode & { children: SceneNode[]; width: number; height: number };
      expect(g.type).toBe('group');
      expect(g.name).toBe('UniSQ logo');
      expect(isChrome(g)).toBe(true);
      expect(g.width).toBe(120);
      expect(g.role).toBe('image');
      expect(g.ariaLabel).toMatch(/Southern Queensland/);
      expect(g.children.length).toBeGreaterThan(3);
      for (const c of g.children) {
        expect(c.type).toBe('path');
        // inside the group's box
        expect(c.x + c.width).toBeLessThanOrEqual(120.5);
        expect(c.y + c.height).toBeLessThanOrEqual(g.height + 0.5);
      }
      expect(JSON.stringify(g)).not.toMatch(/"#[0-9a-f]{3,8}"/i);
      const fills = g.children.map((c) => ((c as unknown as { fill: { color: string } }).fill.color));
      expect(fills.every(isTokenRef)).toBe(true);
      //the mark and the words are painted with different tokens
      expect(new Set(fills).size).toBe(2);
    }
  });

  it('follows the colourway: gold mark on white, white words on the gradient pages of the dark colourways', () => {
    const ctx = brandedProject(COLOURWAYS[1], 'T');
    const colourOf = (g: SceneNode, name: RegExp) => {
      const hit = (g as unknown as { children: { name: string; fill: { color: string } }[] }).children.find((c) => name.test(c.name))!;
      const id = hit.fill.color.slice('token:'.length);
      const tk = ctx.project.themes!.tokens.find((t) => t.id === id)!;
      return tk.values['theme-purple'];
    };
    const onGradient = logo(ctx, 0, 0, 150, false);
    const onWhite = logo(ctx, 0, 0, 96, true);
    expect(colourOf(onGradient, /mark/i)).toBe('#ffb448');
    expect(colourOf(onGradient, /words/i)).toBe('#ffffff');
    expect(colourOf(onWhite, /mark/i)).toBe('#ffb448');
    expect(colourOf(onWhite, /words/i)).toBe('#3c2d4d');
  });
});

describe('the branded lock', () => {
  beforeEach(() => void 0);

  it('knows a locked project: brandLook, strict unless it says false', () => {
    expect(isBrandLocked(sample().project)).toBe(true);
    expect(isBrandLocked(sample(false).project)).toBe(false);
    expect(isBrandLocked({ brandLook: undefined })).toBe(false);
  });

  it('refuses to edit, move or delete a chrome layer, with a toast', () => {
    const { project, page } = sample();
    open(project);
    s.set({ activeArtboardId: page.master! });
    const logoId = chromeOn(project, page, 'UniSQ logo').id;
    s.setProps([logoId], { x: 300 });
    expect((current(logoId) as { x: number }).x).not.toBe(300);
    expect(s.get().toast?.kind).toBe('error');
    expect(s.get().toast?.text).toMatch(/UniSQ brand/);
    s.set({ toast: null });
    s.set({ activeArtboardId: page.master! });
    s.select([chromeOn(project, page, 'Brand accent').id]);
    s.deleteSelection();
    //(the toast is throttled, so it is the layer that says the delete was refused)
    expect(current(chromeOn(project, page, 'Brand accent').id)).toBeTruthy();
  });

  it('refuses to detach a chrome layer by taking its tag off', () => {
    const { project, page } = sample();
    open(project);
    const id = chromeOn(project, page, 'Brand accent').id;
    s.update((d) => {
      const n = d.artboards.find((a) => a.id === page.master)!.children.find((x) => x.id === id) as unknown as { tags?: string[] };
      n.tags = [];
    });
    expect(isChrome(current(id)!)).toBe(true);
  });

  it('still lets the author edit, move and delete their own layers, and delete a whole page', () => {
    const { project, page, body } = sample();
    open(project);
    s.setProps([body.id], { x: 120, text: 'Changed' });
    expect((current(body.id) as TextNode).text).toBe('Changed');
    //deleting one layer rebuilds the page's groups but leaves the logo as it was
    s.select([body.id]);
    s.deleteSelection();
    expect(current(body.id)).toBeUndefined();
    expect(current(chromeOn(project, page, 'UniSQ logo').id)).toBeTruthy();
    expect(s.get().toast).toBeNull();
    s.deleteArtboard(page.id);
    //(its master stays, with the hero's)
    expect(s.get().project.artboards.filter((a) => !a.isMaster)).toHaveLength(1);
  });

  it('takes theme tokens only for a colour on an existing layer: a hex is refused, a token is fine', () => {
    const { project, ctx, body } = sample();
    open(project);
    s.setProps([body.id], { color: '#ff00ff' });
    expect((current(body.id) as TextNode).color).toBe(ctx.L.text);
    expect(s.get().toast?.text).toMatch(/branded project/);
    expect(s.get().toast?.text).toMatch(/#ff00ff/);
    s.set({ toast: null });
    s.setProps([body.id], { color: ctx.L.muted });
    expect((current(body.id) as TextNode).color).toBe(ctx.L.muted);
    expect(s.get().toast).toBeNull();
    //a gradient with a plain stop is refused as well
    s.setProps([body.id], { fill: { type: 'linear', angle: 0, stops: [{ offset: 0, color: ctx.L.text }, { offset: 1, color: 'rgb(1, 2, 3)' }] } });
    expect((current(body.id) as unknown as { fill?: unknown }).fill).toBeUndefined();
  });

  it('refuses a page background that is a hex, and lets transparent through', () => {
    const { project, ctx, page } = sample();
    open(project);
    s.update((d) => void (d.artboards[1].background = { type: 'solid', color: '#123456' }));
    expect(JSON.stringify(s.get().project.artboards[1].background)).toContain(ctx.L.background);
    s.update((d) => void (d.artboards[1].background = { type: 'solid', color: ctx.L.surface }));
    expect(JSON.stringify(s.get().project.artboards[1].background)).toContain(ctx.L.surface);
    expect(page.id).toBe(s.get().project.artboards[1].id);
  });

  it('keeps the font Open Sans', () => {
    const { project, body } = sample();
    open(project);
    s.setProps([body.id], { fontFamily: 'Georgia, serif' });
    expect((current(body.id) as TextNode).fontFamily).toBe('Open Sans');
    expect(s.get().toast?.text).toMatch(/Open Sans/);
    s.set({ toast: null });
    s.setProps([body.id], { fontFamily: '"Open Sans", sans-serif', fontSize: 22 });
    expect((current(body.id) as TextNode).fontSize).toBe(22);
    expect(s.get().toast).toBeNull();
  });

  it('puts a new layer\'s plain colours and font onto the nearest token and Open Sans instead of refusing it', () => {
    const { project, ctx, page } = sample();
    open(project);
    const rect = createNode('rect', { name: 'Mine', fill: { type: 'solid', color: '#dddcd7' } });
    const label = createNode('text', { name: 'Mine text', text: 'x', color: '#2d2d2d', fontFamily: 'Georgia' } as Partial<TextNode>);
    s.addNodes([rect, label], { artboardId: page.id });
    expect(s.get().toast).toBeNull();
    const fill = (current(rect.id) as unknown as { fill: { color: string } }).fill.color;
    expect(isTokenRef(fill)).toBe(true);
    const t = current(label.id) as TextNode;
    expect(isTokenRef(t.color)).toBe(true);
    expect(t.fontFamily).toBe('Open Sans');
    //the nearest token of #2d2d2d is the text colour
    expect(t.color).toBe(ctx.L.text);
  });

  it('snapToBrand and brandLookViolation work without a store', () => {
    const { project, page } = sample();
    const logoNode = chromeOn(project, page, 'UniSQ logo');
    const moved = { ...project, artboards: project.artboards.map((a) => (a.id === page.master ? { ...a, children: a.children.map((n) => (n === logoNode ? { ...n, x: 5 } : n)) } : a)) } as Project;
    expect(brandLookViolation(project, moved)).toMatch(/UniSQ logo/);
    expect(brandLookViolation(project, project)).toBeNull();
    expect(snapToBrand(project, project)).toBe(project);
  });

  it('is not applied when strict is false, nor to an ordinary project', () => {
    const { project, body } = sample(false);
    open(project);
    s.setProps([body.id], { color: '#ff00ff' });
    expect((current(body.id) as TextNode).color).toBe('#ff00ff');
    const page = project.artboards[1];
    s.set({ activeArtboardId: page.master! });
    const logoId = chromeOn(project, page, 'UniSQ logo').id;
    s.setProps([logoId], { x: 77 });
    expect((current(logoId) as { x: number }).x).toBe(77);
  });

  it('is lifted by the power user override (F9), and back on when it is switched off', () => {
    const { project, page, body } = sample();
    open(project);
    s.set({ brandOverride: true, activeArtboardId: page.master! });
    const logoId = chromeOn(project, page, 'UniSQ logo').id;
    s.setProps([logoId], { x: 88 });
    expect((current(logoId) as { x: number }).x).toBe(88);
    s.set({ activeArtboardId: page.id });
    s.setProps([body.id], { color: '#00ff00', fontFamily: 'Georgia' });
    expect((current(body.id) as TextNode).color).toBe('#00ff00');
    s.set({ brandOverride: false, activeArtboardId: page.master! });
    s.setProps([logoId], { x: 99 });
    expect((current(logoId) as { x: number }).x).toBe(88);
  });

  it('counts token colours as on brand in the off-brand check, and lists hex colours and other fonts', () => {
    const { project, ctx, page } = sample();
    expect(offBrand(project)).toEqual({ kits: ['Purple colourway'], colors: [], fonts: [] });
    page.children.push(createNode('rect', { name: 'Off', fill: { type: 'solid', color: '#abcdef' } }));
    page.children.push(text(ctx, 'Georgia', 'x', 0, 0, 100, { fontFamily: 'Georgia' }));
    const r = offBrand(project)!;
    expect(r.colors.map((c) => c.value)).toEqual(['#abcdef']);
    expect(r.fonts.map((f) => f.value)).toEqual(['Georgia']);
  });
});
