import { describe, expect, it } from 'vitest';
import { createNode, createProject, uid, type Artboard, type LogicNode, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { contrastRatio, luminance, requiredRatio, suggestColour, toRgba } from '../src/lib/a11y/colour';
import { maxFlashesPerSecond, sampleTimeline } from '../src/lib/a11y/flash';
import { checkAccessibility, meaningfulName, summarise } from '../src/lib/a11y/checks';
import { applyFix } from '../src/lib/a11y/fixes';
import type { Finding } from '../src/lib/a11y/types';

/** A project with one 800x600 white artboard holding `children`. */
function scene(children: SceneNode[], extra: Partial<Artboard> = {}, settings: Partial<Project['settings']> = {}) {
  const p = createProject('Test');
  p.settings.title = 'Test';
  Object.assign(p.settings, settings);
  const ab = p.artboards[0];
  ab.children.push(...children);
  Object.assign(ab, extra);
  return { p, ab };
}

const of = (p: Project, check: string): Finding[] => checkAccessibility(p).findings.filter((f) => f.check === check);
const rect = (o: object = {}) => createNode('rect', { x: 0, y: 0, width: 800, height: 600, fill: { type: 'solid', color: '#ffffff' }, ...o });
const text = (o: object = {}) => createNode('text', { x: 20, y: 20, width: 300, height: 24, text: 'Hello there, this is the text', ...o } as never);

const ev = (id: string, kind: string, params: Record<string, unknown>): LogicNode => ({ id, kind, x: 0, y: 0, params });
const edge = (from: string, to: string) => ({ id: uid('e'), from, fromPort: 'out', to, toPort: 'in' });

describe('colour maths', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1);
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5);
  });

  it('asks 4.5:1 of normal text and 3:1 of large text (24 px, or 18.66 px and bold)', () => {
    expect(requiredRatio(16, 400)).toBe(4.5);
    expect(requiredRatio(24, 400)).toBe(3);
    expect(requiredRatio(19, 700)).toBe(3);
    expect(requiredRatio(19, 400)).toBe(4.5);
  });

  it('reads hex, rgb, hsl and a few names without a browser', () => {
    expect(toRgba('#fff')).toEqual([255, 255, 255, 1]);
    expect(toRgba('rgb(10, 20, 30)')).toEqual([10, 20, 30, 1]);
    expect(toRgba('rgba(0,0,0,0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(toRgba('hsl(0, 100%, 50%)')).toEqual([255, 0, 0, 1]);
    expect(toRgba('navy')).toEqual([0, 0, 128, 1]);
    expect(toRgba('var(--x)')).toBeNull();
    expect(toRgba('')).toBeNull();
  });

  it('suggests the nearest passing colour, or none when light and dark backgrounds both have to be cleared', () => {
    const s = suggestColour([150, 150, 150], [[255, 255, 255]], 4.5)!;
    const c = toRgba(s)!;
    expect(contrastRatio(c, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(c[0]).toBeGreaterThan(40); // not slammed all the way to black
    expect(suggestColour([128, 128, 128], [[255, 255, 255], [0, 0, 0]], 7)).toBeNull();
  });
});

describe('text contrast', () => {
  it('flags grey text on white, with the ratio, and a fix that clears it', () => {
    const t = text({ color: '#999999' });
    const { p } = scene([t]);
    const [f] = of(p, 'contrast');
    expect(f.severity).toBe('issue');
    expect(f.nodeId).toBe(t.id);
    expect(f.detail).toMatch(/2\.8\d:1/);
    expect(f.detail).toMatch(/needs 4\.5:1/);
    expect(f.fix).toBeTruthy();
    expect(applyFix(p, f.fix!)).toBe(true);
    expect(of(p, 'contrast')).toEqual([]);
    expect(p.artboards[0].children[0]).toMatchObject({ color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
  });

  it('passes black on white and leaves white on a dark panel alone', () => {
    const { p } = scene([text({ color: '#000000' })]);
    expect(of(p, 'contrast')).toEqual([]);
    const dark = rect({ x: 0, y: 0, width: 400, height: 100, fill: { type: 'solid', color: '#10204a' } });
    expect(of(scene([dark, text({ color: '#ffffff' })]).p, 'contrast')).toEqual([]);
  });

  it('measures against the layer behind the text, not the page', () => {
    // Light grey text is fine on a dark panel and fails on the white page behind a panel that does not reach it
    const panel = rect({ x: 0, y: 0, width: 400, height: 100, fill: { type: 'solid', color: '#222222' } });
    expect(of(scene([panel, text({ color: '#bbbbbb' })]).p, 'contrast')).toEqual([]);
    const far = rect({ x: 500, y: 300, width: 100, height: 100, fill: { type: 'solid', color: '#222222' } });
    expect(of(scene([far, text({ color: '#bbbbbb' })]).p, 'contrast')[0]?.severity).toBe('issue');
  });

  it('a layer above the text does not count, and an opaque layer hides what is under it', () => {
    const dark = rect({ fill: { type: 'solid', color: '#000000' } });
    const white = rect({ fill: { type: 'solid', color: '#ffffff' } });
    // black text, black panel ABOVE it in order is irrelevant (the text is drawn later)
    expect(of(scene([white, dark, text({ color: '#000000' })]).p, 'contrast')[0]?.severity).toBe('issue');
    expect(of(scene([dark, white, text({ color: '#000000' })]).p, 'contrast')).toEqual([]);
    // text first, panel after: the text is covered, it is checked against what it was drawn on (white page here)
    expect(of(scene([text({ color: '#000000' }), dark]).p, 'contrast')).toEqual([]);
  });

  it('follows groups and transforms: a panel inside a moved group', () => {
    const panel = rect({ x: 0, y: 0, width: 300, height: 60, fill: { type: 'solid', color: '#202020' } });
    const label = text({ x: 10, y: 10, width: 200, color: '#ffffff' });
    const g = createNode('group', { x: 100, y: 200, children: [panel, label] });
    expect(of(scene([g]).p, 'contrast')).toEqual([]);
    const away = createNode('group', { x: 100, y: 200, children: [panel] });
    // the label is outside the panel's group, over the white page
    expect(of(scene([away, text({ x: 110, y: 400, color: '#ffffff' })]).p, 'contrast')[0]?.severity).toBe('issue');
  });

  it('uses 3:1 for large text', () => {
    const grey = '#808080'; // about 3.9:1 on white
    expect(of(scene([text({ color: grey, fontSize: 16 })]).p, 'contrast')[0]?.severity).toBe('issue');
    expect(of(scene([text({ color: grey, fontSize: 28, height: 40 })]).p, 'contrast')).toEqual([]);
  });

  it('counts the layer opacity against the text', () => {
    const t = text({ color: '#000000', opacity: 0.3 });
    const [f] = of(scene([t]).p, 'contrast');
    expect(f.severity).toBe('issue');
    expect(f.detail).toMatch(/partly transparent/);
    // opacity on a parent can't be fixed from the text
    const g = createNode('group', { opacity: 0.3, children: [text({ color: '#000000' })] });
    expect(of(scene([g]).p, 'contrast')[0].fix).toBeUndefined();
  });

  it('reads a button label against the button own fill', () => {
    const b = createNode('button', { label: 'Go', color: '#ffffff', fill: { type: 'solid', color: '#f0e68c' } });
    const [f] = of(scene([b]).p, 'contrast');
    expect(f.severity).toBe('issue');
    const ok = createNode('button', { label: 'Go', color: '#ffffff', fill: { type: 'solid', color: '#1b3a8c' } });
    expect(of(scene([ok]).p, 'contrast')).toEqual([]);
  });

  it('says it could not check over a gradient that straddles the limit, and passes one that clears it everywhere', () => {
    const straddle = rect({ fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] } });
    const [f] = of(scene([straddle, text({ color: '#777777' })]).p, 'contrast');
    expect(f.severity).toBe('review');
    const dark = rect({ fill: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#223355' }] } });
    expect(of(scene([dark, text({ color: '#ffffff' })]).p, 'contrast')).toEqual([]);
  });

  it('says it could not check over a picture, and checks it once it has the picture colours', () => {
    const img = createNode('image', { assetId: 'a1', x: 0, y: 0, width: 800, height: 600 });
    const { p } = scene([img, text({ color: '#ffffff' })]);
    const [f] = of(p, 'contrast');
    expect(f.severity).toBe('review');
    expect(f.detail).toMatch(/image/);
    const dark = checkAccessibility(p, { images: () => [[10, 10, 20]] }).findings.filter((x) => x.check === 'contrast');
    expect(dark).toEqual([]);
    const light = checkAccessibility(p, { images: () => [[240, 240, 240]] }).findings.filter((x) => x.check === 'contrast');
    expect(light[0].severity).toBe('issue');
    const mixed = checkAccessibility(p, { images: () => [[10, 10, 20], [250, 250, 250]] }).findings.filter((x) => x.check === 'contrast');
    expect(mixed[0].severity).toBe('review');
  });

  it('says it could not check over video, blend modes and freeform shapes', () => {
    expect(of(scene([createNode('video', { x: 0, y: 0, width: 800, height: 600, src: 'x.mp4' }), text({ color: '#fff' })]).p, 'contrast')[0].severity).toBe('review');
    expect(of(scene([rect({ blendMode: 'multiply' }), text({ color: '#111' })]).p, 'contrast')[0].severity).toBe('review');
    expect(of(scene([createNode('star', { x: 0, y: 0, width: 800, height: 600, fill: { type: 'solid', color: '#000' } }), text({ color: '#111' })]).p, 'contrast')[0].severity).toBe('review');
  });

  it('checks a layer that is hidden until shown, against its own popup background', () => {
    const popup = createNode('frame', { visible: false, x: 0, y: 0, width: 400, height: 200, fill: { type: 'solid', color: '#202020' }, children: [text({ color: '#ffffff' })] });
    expect(of(scene([popup]).p, 'contrast')).toEqual([]);
    const popup2 = createNode('frame', { visible: false, x: 0, y: 0, width: 400, height: 200, fill: { type: 'solid', color: '#ffffff' }, children: [text({ color: '#ffffff' })] });
    const [f] = of(scene([popup2]).p, 'contrast');
    expect(f.severity).toBe('issue');
    expect(f.detail).toMatch(/hidden until/);
    // a hidden panel does not paint behind a visible layer
    const ghost = rect({ visible: false, fill: { type: 'solid', color: '#000000' } });
    expect(of(scene([ghost, text({ color: '#000000' })]).p, 'contrast')).toEqual([]);
  });

  it('checks the colours of text runs and fixes the run that fails', () => {
    const t = text({ color: '#000000', text: 'Hello world', runs: [{ text: 'Hello ' }, { text: 'world', color: '#aaaaaa' }] });
    const { p } = scene([t]);
    const [f] = of(p, 'contrast');
    expect(f.severity).toBe('issue');
    expect(applyFix(p, f.fix!)).toBe(true);
    const runs = (p.artboards[0].children[0] as { runs: { color?: string }[] }).runs;
    expect(runs[0].color).toBeUndefined();
    expect(runs[1].color).not.toBe('#aaaaaa');
    expect(of(p, 'contrast')).toEqual([]);
  });

  it('offers no fix when the colour is driven by a binding', () => {
    const t = text({ color: '#aaaaaa', bindings: { color: 'theme' } });
    expect(of(scene([t]).p, 'contrast')[0].fix).toBeUndefined();
  });

  it('only checks the part of the box the words fill', () => {
    // A wide, left-aligned label: the panel behind the words is dark, the rest of the (wide) box is over white
    const panel = rect({ x: 0, y: 0, width: 160, height: 60, fill: { type: 'solid', color: '#111111' } });
    const t = text({ x: 10, y: 10, width: 700, color: '#ffffff', text: 'Hi' });
    expect(of(scene([panel, t]).p, 'contrast')).toEqual([]);
  });
});

describe('small text', () => {
  it('flags text under 12 px and fixes it', () => {
    const t = text({ fontSize: 10, color: '#000000' });
    const { p } = scene([t]);
    const [f] = of(p, 'small-text');
    expect(f.severity).toBe('warning');
    expect(applyFix(p, f.fix!)).toBe(true);
    expect(of(p, 'small-text')).toEqual([]);
  });
  it('leaves 12 px alone and counts the scale the layer is drawn at', () => {
    expect(of(scene([text({ fontSize: 12, color: '#000' })]).p, 'small-text')).toEqual([]);
    const g = createNode('group', { scaleX: 0.5, scaleY: 0.5, children: [text({ fontSize: 20, color: '#000' })] });
    expect(of(scene([g]).p, 'small-text')).toHaveLength(1);
  });
  it('catches a small run in bigger text', () => {
    const t = text({ fontSize: 16, color: '#000', text: 'ab', runs: [{ text: 'a' }, { text: 'b', fontSize: 9 }] });
    const { p } = scene([t]);
    const [f] = of(p, 'small-text');
    applyFix(p, f.fix!);
    expect(of(p, 'small-text')).toEqual([]);
  });
});

describe('keyboard path', () => {
  const clicky = () => createNode('rect', { name: 'Arrow', x: 0, y: 0, width: 60, height: 60, ariaLabel: 'Next' });
  const toTimeline = (tl: string) => ({ timeline: tl, op: 'play' });

  it('flags a clickable shape that no key can operate', () => {
    const r = clicky();
    const { p, ab } = scene([r]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }), ev('a1', 'action.timeline', toTimeline('t')));
    ab.logic.edges.push(edge('e1', 'a1'));
    const [f] = of(p, 'keyboard');
    expect(f.severity).toBe('issue');
    expect(f.nodeId).toBe(r.id);
    expect(f.detail).toMatch(/Nothing on this artboard reacts to a key/);
  });

  it('accepts a Button, and a layer link', () => {
    const b = createNode('button', { label: 'Next' });
    const l = createNode('rect', { ariaLabel: 'Docs', link: { url: 'https://x.test', target: '_blank' } });
    const { p, ab } = scene([b, l]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: b.id, type: 'click' }), ev('a1', 'action.timeline', toTimeline('t')));
    ab.logic.edges.push(edge('e1', 'a1'));
    expect(of(p, 'keyboard')).toEqual([]);
  });

  it('accepts an On key that runs the same action, even through a separate node', () => {
    const r = clicky();
    const { p, ab } = scene([r]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }), ev('a1', 'action.timeline', toTimeline('t')), ev('k1', 'event.key', { key: 'Enter' }), ev('a2', 'action.timeline', toTimeline('t')));
    ab.logic.edges.push(edge('e1', 'a1'), edge('k1', 'a2'));
    expect(of(p, 'keyboard')).toEqual([]);
  });

  it('is not fooled by a key that does something else', () => {
    const r = clicky();
    const { p, ab } = scene([r]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }), ev('a1', 'action.timeline', toTimeline('t')), ev('k1', 'event.key', { key: 'Enter' }), ev('a2', 'action.timeline', toTimeline('other')));
    ab.logic.edges.push(edge('e1', 'a1'), edge('k1', 'a2'));
    const [f] = of(p, 'keyboard');
    expect(f.severity).toBe('issue');
    expect(f.detail).toMatch(/none runs the same actions/);
  });

  it('flags hover-only and drag-only layers as warnings, and lets a working click cover for them', () => {
    const h = clicky();
    const d = clicky();
    const both = clicky();
    const { p, ab } = scene([h, d, both]);
    ab.logic.nodes.push(
      ev('e1', 'event.pointer', { target: h.id, type: 'pointerenter' }),
      ev('a1', 'action.visibility', { target: 'x', op: 'show' }),
      ev('e2', 'event.pointer', { target: d.id, type: 'drag' }),
      ev('a2', 'action.setVariable', { variable: 'v' }),
      ev('e3', 'event.pointer', { target: both.id, type: 'pointerenter' }),
      ev('e4', 'event.pointer', { target: both.id, type: 'click' }),
      ev('a3', 'action.visibility', { target: 'y', op: 'show' }),
      ev('k1', 'event.key', { key: 'Enter' }),
    );
    ab.logic.edges.push(edge('e1', 'a1'), edge('e2', 'a2'), edge('e3', 'a3'), edge('e4', 'a3'), edge('k1', 'a3'));
    const fs = of(p, 'keyboard');
    expect(fs.map((f) => [f.nodeId, f.severity])).toEqual([[h.id, 'warning'], [d.id, 'warning']]);
    expect(fs[1].title).toMatch(/Dragging/);
  });

  it('reads the layer-semantics fields when a layer has them', () => {
    const r = clicky() as SceneNode & { focusable?: boolean; role?: string };
    r.focusable = true;
    r.role = 'button';
    const { p, ab } = scene([r]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }), ev('a1', 'action.timeline', toTimeline('t')));
    ab.logic.edges.push(edge('e1', 'a1'));
    expect(of(p, 'keyboard')).toEqual([]);
  });

  it('ignores a click with nothing connected to it', () => {
    const r = clicky();
    const { p, ab } = scene([r]);
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }));
    expect(of(p, 'keyboard')).toEqual([]);
  });
});

describe('names', () => {
  const click = (p: Project, id: string) => {
    const ab = p.artboards[0];
    ab.logic.nodes.push(ev('e1', 'event.pointer', { target: id, type: 'click' }));
  };

  it('flags a clickable shape with no label and takes the label you type', () => {
    const r = createNode('rect', { name: 'Arrow', width: 60, height: 60 });
    const { p } = scene([r]);
    click(p, r.id);
    const [f] = of(p, 'name');
    expect(f.severity).toBe('issue');
    expect(f.fix?.input?.value).toBe('Arrow'); // a human-looking name is offered as the starting point
    expect(applyFix(p, f.fix!, '   ')).toBe(false);
    expect(applyFix(p, f.fix!, 'Next page')).toBe(true);
    expect(of(p, 'name')).toEqual([]);
    expect((p.artboards[0].children[0] as SceneNode).ariaLabel).toBe('Next page');
  });

  it('asks a draggable layer for a name too, since a screen reader reads it out when it is picked up', () => {
    const r = createNode('rect', { name: 'Rectangle 4', width: 60, height: 60, draggable: {} });
    const { p } = scene([r]);
    expect(of(p, 'name').map((f) => f.severity)).toEqual(['issue']);
    r.ariaLabel = 'Apple card';
    expect(of(p, 'name')).toEqual([]);
    //a draggable that is switched off is just a shape
    const off = createNode('rect', { name: 'Rectangle 5', width: 60, height: 60, draggable: { enabled: false } });
    expect(of(scene([off]).p, 'name')).toEqual([]);
  });

  it('does not suggest an editor-made name, and counts text inside as a name', () => {
    const r = createNode('rect', { name: 'Rectangle 4', width: 60, height: 60 });
    const { p } = scene([r]);
    click(p, r.id);
    expect(of(p, 'name')[0].fix?.input?.value).toBe('');
    const g = createNode('group', { children: [createNode('rect', {}), createNode('text', { text: 'Buy now' })] });
    const q = scene([g]).p;
    click(q, g.id);
    expect(of(q, 'name')).toEqual([]);
    expect(meaningfulName('Image 12')).toBe('');
    expect(meaningfulName('IMG_0042.jpg')).toBe('');
    expect(meaningfulName('Logo')).toBe('Logo');
  });

  it('flags an empty button, an unlabelled field, and a field named only by its placeholder', () => {
    const b = createNode('button', { label: '' });
    const i1 = createNode('input', { placeholder: '' });
    const i2 = createNode('input', { placeholder: 'Your email' });
    const i3 = createNode('input', { placeholder: 'Your email', ariaLabel: 'Email address' });
    const fs = of(scene([b, i1, i2, i3]).p, 'name');
    expect(fs.map((f) => [f.nodeId, f.severity])).toEqual([[b.id, 'issue'], [i1.id, 'issue'], [i2.id, 'warning']]);
  });

  it('flags a link layer with no text and no label', () => {
    const r = createNode('rect', { link: { url: 'https://x.test', target: '_blank' } });
    expect(of(scene([r]).p, 'name')).toHaveLength(1);
  });
});

describe('pictures, videos and frames', () => {
  it('flags a picture with no description and takes one', () => {
    const img = createNode('image', { assetId: 'a1', name: 'Kite' });
    const { p } = scene([img]);
    const [f] = of(p, 'description');
    expect(f.severity).toBe('warning');
    expect(applyFix(p, f.fix!, 'A red kite over a hill')).toBe(true);
    expect(of(p, 'description')).toEqual([]);
  });
  it('skips labelled pictures, decorative ones, empty image slots and ones that are controls', () => {
    const a = createNode('image', { assetId: 'a1', ariaLabel: 'x' });
    const b = createNode('image', { assetId: 'a1' }) as SceneNode & { decorative?: boolean };
    b.decorative = true;
    const c = createNode('image', { assetId: null });
    const d = createNode('image', { assetId: 'a1', altText: 'From the semantics task' } as never);
    expect(of(scene([a, b, c, d]).p, 'description')).toEqual([]);
  });
  it('flags videos, iframes without a title, and asks about script layers; HTML embeds are a review', () => {
    const v = createNode('video', { src: 'x.mp4', controls: true });
    const f = createNode('embed', { mode: 'iframe', src: 'https://x.test' });
    const h = createNode('embed', { mode: 'html' });
    const d = createNode('draw', {});
    const fs = of(scene([v, f, h, d]).p, 'description');
    expect(fs.map((x) => [x.nodeType, x.severity])).toEqual([['video', 'warning'], ['embed', 'warning'], ['embed', 'review'], ['draw', 'review']]);
  });
  it('flags a video with nothing to play, unless a binding supplies it', () => {
    const empty = createNode('video', { src: '', assetId: null, ariaLabel: 'Intro' } as never);
    const [f] = of(scene([empty]).p, 'description');
    expect(f).toMatchObject({ severity: 'warning', title: 'Video has nothing to play', nodeType: 'video' });
    const worded = createNode('video', { src: '', assetId: null, ariaLabel: 'Intro', emptyText: 'Coming soon' } as never);
    expect(of(scene([worded]).p, 'description')[0].detail).toContain('Coming soon');
    const bound = createNode('video', { src: '', assetId: null, ariaLabel: 'Intro', bindings: { src: 'clip' } } as never);
    expect(of(scene([bound]).p, 'description')).toEqual([]);
    const filled = createNode('video', { src: 'x.mp4', assetId: null, ariaLabel: 'Intro' } as never);
    expect(of(scene([filled]).p, 'description')).toEqual([]);
  });
  it('always asks a person about a video captions', () => {
    const v = createNode('video', { src: 'x.mp4', controls: true, ariaLabel: 'Intro' });
    const [c] = of(scene([v]).p, 'captions');
    expect(c.severity).toBe('review');
  });
});

describe('target size', () => {
  it('flags a clickable thing under 24 px and not one at 24 or more', () => {
    const small = createNode('button', { label: 'x', width: 16, height: 16 });
    const ok = createNode('button', { label: 'y', width: 24, height: 24 });
    const fs = of(scene([small, ok]).p, 'target-size');
    expect(fs.map((f) => f.nodeId)).toEqual([small.id]);
    expect(fs[0].detail).toMatch(/16 by 16/);
  });
  it('counts the scale, and leaves text links to the inline exception', () => {
    const g = createNode('group', { scaleX: 0.5, scaleY: 0.5, children: [createNode('button', { label: 'x', width: 40, height: 40 })] });
    expect(of(scene([g]).p, 'target-size')).toHaveLength(1);
    expect(of(scene([createNode('link', { height: 14 })]).p, 'target-size')).toEqual([]);
  });
  it('covers a pointer-only shape too', () => {
    const r = createNode('ellipse', { width: 10, height: 10, ariaLabel: 'Dot' });
    const { p } = scene([r]);
    p.artboards[0].logic.nodes.push(ev('e1', 'event.pointer', { target: r.id, type: 'click' }));
    expect(of(p, 'target-size')).toHaveLength(1);
  });
});

describe('autoplay and motion', () => {
  const timeline = (o: Partial<Timeline> = {}): Timeline => ({
    id: 'tl1',
    name: 'Intro',
    duration: 2000,
    loop: 'once',
    autoplay: true,
    speed: 1,
    tracks: [{ id: 'tr1', nodeId: 'n1', prop: 'x', keys: [{ id: 'k1', t: 0, value: 0, ease: 'linear' }, { id: 'k2', t: 2000, value: 100, ease: 'linear' }] }],
    ...o,
  });

  it('flags an autoplaying timeline until the project respects reduced motion, and the fix turns that on', () => {
    const r = rect({ id: 'n1', width: 50, height: 50 });
    const { p, ab } = scene([r]);
    p.settings.reducedMotion = false;
    ab.timelines.push(timeline());
    const [f] = of(p, 'autoplay-motion');
    expect(f.severity).toBe('warning');
    expect(f.fix?.target).toEqual({ scope: 'project' });
    expect(applyFix(p, f.fix!)).toBe(true);
    expect(p.settings.reducedMotion).toBe(true);
    expect(of(p, 'autoplay-motion')).toEqual([]);
  });
  it('ignores timelines that wait to be played or have nothing to animate', () => {
    const { p, ab } = scene([rect({ id: 'n1' })]);
    ab.timelines.push(timeline({ autoplay: false }), timeline({ id: 't2', tracks: [] }));
    expect(of(p, 'autoplay-motion')).toEqual([]);
  });
  it('asks for a way to pause a loop or anything over 5 seconds, and accepts a Pause action', () => {
    const { p, ab } = scene([rect({ id: 'n1' })], {}, { reducedMotion: true });
    ab.timelines.push(timeline({ loop: 'loop' }), timeline({ id: 'tl2', name: 'Long', duration: 8000 }), timeline({ id: 'tl3', name: 'Short' }));
    expect(of(p, 'pause').map((f) => f.detail.match(/"(\w+)"/)![1])).toEqual(['Intro', 'Long']);
    ab.logic.nodes.push(ev('a1', 'action.timeline', { timeline: 'tl1', op: 'toggle' }), ev('a2', 'action.timeline', { timeline: 'tl2', op: 'pause' }));
    expect(of(p, 'pause')).toEqual([]);
  });
  it('flags a video that plays by itself with sound or without controls and the fix mutes it and shows controls', () => {
    const loud = createNode('video', { src: 'x.mp4', autoplay: true, muted: false, controls: false, ariaLabel: 'a' });
    const quiet = createNode('video', { src: 'x.mp4', autoplay: true, muted: true, controls: true, ariaLabel: 'b' });
    const manual = createNode('video', { src: 'x.mp4', autoplay: false, muted: false, controls: false, ariaLabel: 'c' });
    const { p } = scene([loud, quiet, manual]);
    const fs = of(p, 'autoplay-media');
    expect(fs.map((f) => [f.nodeId, f.severity])).toEqual([[loud.id, 'issue']]);
    expect(fs[0].fix?.label).toBe('Mute it and show controls');
    applyFix(p, fs[0].fix!);
    expect(of(p, 'autoplay-media')).toEqual([]);
    expect(p.artboards[0].children[0]).toMatchObject({ muted: true, controls: true });
  });
});

describe('flashing', () => {
  it('counts flashes in a brightness signal', () => {
    const fast = sampleTimeline({ duration: 1000, loop: 'loop' }, (ms) => (Math.floor(ms / 62.5) % 2 ? 1 : 0)); // 8 swings a second
    expect(maxFlashesPerSecond(fast)).toBeGreaterThan(3);
    const slow = sampleTimeline({ duration: 1000, loop: 'loop' }, (ms) => (Math.floor(ms / 250) % 2 ? 1 : 0)); // 4 swings a second = 2 flashes
    expect(maxFlashesPerSecond(slow)).toBeLessThanOrEqual(3);
    const flat = sampleTimeline({ duration: 1000, loop: 'loop' }, () => 0.5);
    expect(maxFlashesPerSecond(flat)).toBe(0);
  });
  it('ignores small swings and pairs of very bright levels', () => {
    const faint = sampleTimeline({ duration: 1000, loop: 'loop' }, (ms) => (Math.floor(ms / 50) % 2 ? 0.55 : 0.5));
    expect(maxFlashesPerSecond(faint)).toBe(0);
    const bright = sampleTimeline({ duration: 1000, loop: 'loop' }, (ms) => (Math.floor(ms / 50) % 2 ? 0.98 : 0.85));
    expect(maxFlashesPerSecond(bright)).toBe(0);
  });

  const strobe = (period: number, extra: object = {}): Timeline => ({
    id: 'tl1',
    name: 'Strobe',
    duration: 2000,
    loop: 'loop',
    autoplay: true,
    speed: 1,
    tracks: [
      {
        id: 'tr1',
        nodeId: 'n1',
        prop: 'opacity',
        keys: Array.from({ length: Math.floor(2000 / period) + 1 }, (_, i) => ({ id: `k${i}`, t: i * period, value: i % 2 ? 1 : 0, ease: 'step' as const })),
      },
    ],
    ...extra,
  });

  it('flags a big layer whose opacity strobes, and not a slow pulse or a small layer', () => {
    const big = rect({ id: 'n1', fill: { type: 'solid', color: '#ffffff' } });
    const dark = { type: 'solid' as const, color: '#000000' };
    const a = scene([rect({ fill: dark }), big], { timelines: [strobe(100)] });
    const [f] = of(a.p, 'flashing');
    expect(f.severity).toBe('issue');
    expect(f.nodeId).toBe('n1');
    expect(f.detail).toMatch(/times in a second/);
    const slow = scene([rect({ fill: dark }), rect({ id: 'n1', fill: { type: 'solid', color: '#ffffff' } })], { timelines: [strobe(800)] });
    expect(of(slow.p, 'flashing')).toEqual([]);
    const small = scene([rect({ id: 'n1', width: 40, height: 40 })], { timelines: [strobe(100)] });
    expect(of(small.p, 'flashing')).toEqual([]);
  });
  it('flags a colour track that flips between black and white', () => {
    const r = rect({ id: 'n1' });
    const tl: Timeline = { id: 'tl1', name: 'Blink', duration: 1000, loop: 'loop', autoplay: false, speed: 1, tracks: [{ id: 'tr1', nodeId: 'n1', prop: 'fill.color', keys: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000].map((t, i) => ({ id: `k${i}`, t, value: i % 2 ? '#ffffff' : '#000000', ease: 'step' as const })) }] };
    expect(of(scene([r], { timelines: [tl] }).p, 'flashing')).toHaveLength(1);
  });
  it('assumes the worst when it can not tell how bright the layer or its backdrop is', () => {
    const g = createNode('group', { id: 'n1', width: 800, height: 600, children: [] });
    const [f] = of(scene([g], { timelines: [strobe(100)] }).p, 'flashing');
    expect(f.detail).toMatch(/worst case/);
  });
});

describe('project title and the rest', () => {
  it('flags an empty title and the fix uses the project name', () => {
    const { p } = scene([]);
    p.settings.title = '  ';
    const [f] = of(p, 'title');
    expect(f.artboardId).toBeNull();
    applyFix(p, f.fix!);
    expect(p.settings.title).toBe('Test');
    expect(of(p, 'title')).toEqual([]);
  });

  it('has no fix for a library artboard, and says so', () => {
    const t = text({ fontSize: 9, color: '#000' });
    const { p, ab } = scene([t]);
    ab.library = { libraryId: 'l', componentId: 'c', version: 1, hash: 'h' };
    const [f] = of(p, 'small-text');
    expect(f.readOnly).toBe(true);
    expect(f.fix).toBeUndefined();
  });

  it('files findings under their artboard, worst first, and counts them without the ones marked reviewed', () => {
    const a = scene([text({ fontSize: 9, color: '#aaaaaa' })]);
    const second = createProjectAB(a.p);
    const report = checkAccessibility(a.p);
    expect(report.findings.map((f) => f.artboardId)).toEqual([a.ab.id, a.ab.id, second.id].slice(0, report.findings.length));
    expect(report.findings[0].severity).toBe('issue');
    const s = summarise(report.findings, new Set([report.findings[0].id]));
    expect(s.reviewed).toBe(1);
    expect(s.open).toBe(report.findings.length - 1);
    expect(report.notChecked.length).toBeGreaterThan(3);
    expect(report.checks.map((c) => c.id)).toContain('flashing');
  });

  it('gives every finding a stable id that does not change when the project is edited elsewhere', () => {
    const t = text({ fontSize: 9, color: '#aaaaaa' });
    const a = scene([t]);
    const before = checkAccessibility(a.p).findings.map((f) => f.id);
    a.p.name = 'Renamed';
    a.p.artboards[0].children.push(rect({ x: 700, y: 500, width: 10, height: 10 }));
    expect(checkAccessibility(a.p).findings.map((f) => f.id)).toEqual(expect.arrayContaining(before));
  });

  it('a clean project has no findings', () => {
    const { p } = scene([text({ color: '#111111', fontSize: 16 })]);
    expect(checkAccessibility(p).findings).toEqual([]);
  });
});

function createProjectAB(p: Project): Artboard {
  const ab = { ...p.artboards[0], id: 'second', name: 'Second', children: [], timelines: [], logic: { nodes: [], edges: [] } } as Artboard;
  ab.children = [text({ fontSize: 9, color: '#000' })];
  p.artboards.push(ab);
  return ab;
}
