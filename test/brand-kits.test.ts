import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createArtboard, createNode, createProject, type InstanceNode, type Project, type TextNode } from 'interactives-player';
import { buildSnapshot } from '../shared/library.mjs';
import { brandKitsOf, cleanProject } from '../shared/template.mjs';
import { addLibrary, applyComponents, detachArtboard, linkedArtboards, localCopy, lockViolation, makeInstance, removeLibrary, setBrand, startFromBrandKit, updateAll, type LibraryContent } from '../src/lib/libraries';
import { BRAND_SCALE, brandSize, clampBrandInstances, colourKey, offBrand } from '../src/lib/brand';
import { EditorStore } from '../src/store/store';

const KIT = 'prbrand01';

/** A brand kit: a Header (a navy bar and two texts, one the kit lets people change), a Logo, a colour style, a text style and a font. */
function makeKit(): Project {
  const lib = createProject('UniSQ brand');
  lib.id = KIT;
  lib.settings.library = true;
  const header = lib.artboards[0];
  header.name = 'Header';
  header.width = 400;
  header.height = 60;
  header.publish = true;
  header.brandPlace = 'top';
  header.children.push(
    createNode('rect', { name: 'Bar', width: 400, height: 60, fill: { type: 'solid', color: '#112233' }, styleRefs: { fill: 'c1' } }),
    createNode('text', { name: 'Title', text: 'Course title', brandEditable: true, fontFamily: 'Inter' }),
    createNode('text', { name: 'Slogan', text: 'Always on brand', fontFamily: 'Inter' }),
  );
  const logo = createArtboard({ name: 'Logo', width: 80, height: 40 });
  logo.publish = true;
  logo.brandPlace = 'bottom-right';
  logo.children.push(createNode('ellipse', { name: 'Mark', width: 80, height: 40 }));
  lib.artboards.push(logo);
  lib.styles = {
    colors: [
      { id: 'c1', name: 'Navy', color: '#112233' },
      { id: 'c2', name: 'Paper', color: '#FFFFFF' },
    ],
    texts: [{ id: 't1', name: 'Body', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.4, letterSpacing: 0, color: '#112233' }],
  };
  lib.fonts.push({ family: 'Inter', source: 'google', weights: [400, 700] });
  return lib;
}

const content = (lib: Project, version: number, brand = true): LibraryContent => ({ ...buildSnapshot(lib), version, brand });
const info = { id: KIT, name: 'UniSQ brand', brand: true };
const headerId = (lib: Project) => lib.artboards[0].id;

/** A project with the kit added and the header copied in, plus one artboard of its own holding an instance of it. */
function consumer(lib = makeKit(), brand = true) {
  const snap = content(lib, 1, brand);
  let instanceId = '';
  const app = produce(createProject('Course'), (d) => {
    const p = d as Project;
    addLibrary(p, { ...info, brand }, snap);
    applyComponents(p, KIT, snap, [headerId(lib)]);
    const copy = localCopy(p, KIT, headerId(lib))!;
    copy.canvasHidden = true;
    const inst = makeInstance(p, p.artboards[0].id, copy.id)!;
    instanceId = inst.id;
    p.artboards[0].children.push(inst);
  });
  return { app, snap, lib, instanceId };
}

/** The store, on the project, with the header's copy active. */
function open(brand = true) {
  const { app, lib, snap, instanceId } = consumer(makeKit(), brand);
  const copy = localCopy(app, KIT, headerId(lib))!;
  const s = new EditorStore(app);
  s.set({ activeArtboardId: copy.id });
  return { s, copy, lib, snap, instanceId };
}

describe('a brand kit in a project', () => {
  it('locks every copy it brings, nested ones too, and remembers its palette', () => {
    const { app } = consumer();
    expect(linkedArtboards(app, KIT).every((a) => a.library!.brand)).toBe(true);
    expect(app.libraries![0].brand).toEqual({ colors: ['#112233', '#ffffff'], fonts: ['inter'] });
  });

  it('is an ordinary library when the library is not a brand kit', () => {
    const { app } = consumer(makeKit(), false);
    expect(linkedArtboards(app, KIT)[0].library!.brand).toBeUndefined();
    expect(app.libraries![0].brand).toBeUndefined();
  });

  it('carries the placement and the editable marks from the kit', () => {
    const snap = buildSnapshot(makeKit());
    expect(snap.artboards[0].brandPlace).toBe('top');
    expect(snap.artboards[0].children.find((n: { name: string }) => n.name === 'Title').brandEditable).toBe(true);
  });

  it('picks the lock up when a library becomes a brand kit later, and drops it when it stops being one', () => {
    const { app, snap } = consumer(makeKit(), false);
    const on = produce(app, (d) => void setBrand(d as Project, KIT, true, snap));
    expect(linkedArtboards(on, KIT)[0].library!.brand).toBe(true);
    expect(on.libraries![0].brand!.fonts).toEqual(['inter']);
    const off = produce(on, (d) => void setBrand(d as Project, KIT, false, snap));
    expect(linkedArtboards(off, KIT)[0].library!.brand).toBeUndefined();
    expect(off.libraries![0].brand).toBeUndefined();
  });
});

describe('what the lock lets an ordinary author do to a brand kit item', () => {
  it('refuses to change its look, its size or its layers, and says it is the brand kit', () => {
    const { s, copy } = open();
    const before = s.get().project;
    s.setProps([copy.children[0].id], { x: 50 });
    expect(s.get().project).toBe(before);
    expect(s.get().toast?.text).toMatch(/brand kit/);
    s.update((d) => void (d.artboards.find((a) => a.id === copy.id)!.width = 999));
    expect(s.get().project).toBe(before);
    s.update((d) => void (d.artboards.find((a) => a.id === copy.id)!.background = { type: 'solid', color: '#ff0000' }));
    expect(s.get().project).toBe(before);
    s.update((d) => void d.artboards.find((a) => a.id === copy.id)!.children.pop());
    expect(s.get().project).toBe(before);
  });

  it('lets the artboard be moved and renamed', () => {
    const { s, copy } = open();
    s.update((d) => {
      const a = d.artboards.find((x) => x.id === copy.id)!;
      a.canvasX = 700;
      a.name = 'Page header';
    });
    expect(s.get().project.artboards.find((a) => a.id === copy.id)!.name).toBe('Page header');
  });

  it('lets the text the kit marked editable change, and nothing else about that layer', () => {
    const { s, copy } = open();
    const title = copy.children.find((n) => n.name === 'Title')!;
    s.setProps([title.id], { text: 'Introduction to statistics' });
    const now = s.get().project.artboards.find((a) => a.id === copy.id)!.children.find((n) => n.name === 'Title') as TextNode;
    expect(now.text).toBe('Introduction to statistics');
    expect(s.get().toast).toBeNull();

    const before = s.get().project;
    s.setProps([title.id], { fontSize: 40 });
    expect(s.get().project).toBe(before);
    s.setProps([title.id], { fontFamily: 'Comic Sans MS' });
    expect(s.get().project).toBe(before);
    s.setProps([title.id], { x: 30 });
    expect(s.get().project).toBe(before);
  });

  it('keeps text that is not marked editable locked', () => {
    const { s, copy } = open();
    const slogan = copy.children.find((n) => n.name === 'Slogan')!;
    const before = s.get().project;
    s.setProps([slogan.id], { text: 'Whatever' });
    expect(s.get().project).toBe(before);
  });

  it('cannot be unmarked to sneak a change in: the mark itself is locked', () => {
    const { s, copy } = open();
    const slogan = copy.children.find((n) => n.name === 'Slogan')!;
    const before = s.get().project;
    s.setProps([slogan.id], { brandEditable: true, text: 'Sneaky' });
    expect(s.get().project).toBe(before);
  });

  it('refuses to delete the artboard or copy it (a copy would be an unlocked one)', () => {
    const { s, copy } = open();
    const before = s.get().project;
    s.update((d) => void (d.artboards = d.artboards.filter((a) => a.id !== copy.id)));
    expect(s.get().project).toBe(before);
    s.duplicateArtboard(copy.id);
    expect(s.get().project.artboards).toHaveLength(before.artboards.length);
    expect(s.get().toast?.text).toMatch(/can't be copied/);
  });

  it('refuses to detach it or stop using the kit', () => {
    const { app, lib } = consumer();
    const copy = localCopy(app, KIT, headerId(lib))!;
    const kept = produce(app, (d) => {
      expect(detachArtboard(d as Project, copy.id)).toBe(false);
      expect(removeLibrary(d as Project, KIT)).toBe(false);
    });
    expect(localCopy(kept, KIT, headerId(lib))!.library!.brand).toBe(true);
    expect(kept.libraries).toHaveLength(1);
  });

  it('leaves everything that is not from the kit free', () => {
    const { s, instanceId } = open();
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    const rect = createNode('rect', { name: 'Mine', fill: { type: 'solid', color: '#ff00ff' } });
    s.addNodes([rect]);
    s.setProps([rect.id], { x: 10, width: 120 });
    const home = s.get().project.artboards[0];
    expect(home.children.find((n) => n.name === 'Mine')!.width).toBe(120);
    s.setProps([instanceId], { x: 33, y: 7, rotation: 5, opacity: 0.5 });
    const inst = s.get().project.artboards[0].children.find((n) => n.id === instanceId)!;
    expect([inst.x, inst.y, inst.rotation, inst.opacity]).toEqual([33, 7, 5, 0.5]);
  });

  it('does not touch an ordinary library copy, which keeps the old rules', () => {
    const { s, copy } = open(false);
    const before = s.get().project;
    s.setProps([copy.children[0].id], { x: 50 });
    expect(s.get().project).toBe(before);
    expect(s.get().toast?.text).toMatch(/Detach it to edit/);
    //and it can still be detached and removed
    const after = produce(before, (d) => {
      expect(detachArtboard(d as Project, copy.id)).toBe(true);
      expect(removeLibrary(d as Project, KIT)).toBe(true);
    });
    expect(after.libraries).toHaveLength(0);
  });
});

describe('the power user override', () => {
  it('lets a power user edit, copy and delete brand kit items while it is on, and puts the lock back when it is off', () => {
    const { s, copy } = open();
    s.set({ brandOverride: true });
    s.setProps([copy.children[0].id], { x: 50 });
    expect(s.get().project.artboards.find((a) => a.id === copy.id)!.children[0].x).toBe(50);
    s.duplicateArtboard(copy.id);
    expect(s.get().project.artboards.filter((a) => a.name.startsWith('Header'))).toHaveLength(2);
    s.update((d) => void (d.artboards = d.artboards.filter((a) => a.id !== copy.id)));
    expect(s.get().project.artboards.some((a) => a.id === copy.id)).toBe(false);

    const again = open();
    again.s.set({ brandOverride: true });
    again.s.set({ brandOverride: false });
    const before = again.s.get().project;
    again.s.setProps([again.copy.children[0].id], { x: 50 });
    expect(again.s.get().project).toBe(before);
  });

  it('lets them detach and stop using the kit', () => {
    const { app, lib } = consumer();
    const copy = localCopy(app, KIT, headerId(lib))!;
    const next = produce(app, (d) => {
      expect(detachArtboard(d as Project, copy.id, true)).toBe(true);
      expect(removeLibrary(d as Project, KIT, true)).toBe(true);
    });
    expect(linkedArtboards(next, KIT)).toHaveLength(0);
    expect(next.libraries).toHaveLength(0);
  });

  it('is only about brand kits: an ordinary library copy stays read-only', () => {
    const { s, copy } = open(false);
    s.set({ brandOverride: true });
    const before = s.get().project;
    s.setProps([copy.children[0].id], { x: 50 });
    expect(s.get().project).toBe(before);
  });

  it('lockViolation says the same thing without a store', () => {
    const { app, lib } = consumer();
    const copy = localCopy(app, KIT, headerId(lib))!;
    const edited = produce(app, (d) => void (d.artboards.find((a) => a.id === copy.id)!.height = 5));
    expect(lockViolation(app, edited)?.id).toBe(copy.id);
    expect(lockViolation(app, edited, true)).toBeNull();
  });
});

describe('instances of brand kit items', () => {
  const target = { width: 400, height: 60 } as never;

  it('keep the artboard proportions and a size range', () => {
    expect(brandSize(target, { width: 400, height: 60 })).toBeNull();
    expect(brandSize(target, { width: 600, height: 90 })).toBeNull();
    //only the width was dragged, so the height follows it
    expect(brandSize(target, { width: 500, height: 60 })).toEqual({ width: 500, height: 75 });
    //only the height was dragged
    expect(brandSize(target, { width: 400, height: 120 })).toEqual({ width: 800, height: 120 });
    //too big and too small are pulled in, with the proportions kept
    expect(brandSize(target, { width: 4000, height: 600 })).toEqual({ width: 400 * BRAND_SCALE.max, height: 60 * BRAND_SCALE.max });
    expect(brandSize(target, { width: 40, height: 6 })).toEqual({ width: 400 * BRAND_SCALE.min, height: 60 * BRAND_SCALE.min });
    //a little off is left alone
    expect(brandSize(target, { width: 400, height: 60.5 })).toBeNull();
  });

  it('are put right when the author resizes them, and stay free to move, rotate and fade', () => {
    const { s, instanceId } = open();
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    s.setProps([instanceId], { width: 1000, height: 40 });
    let inst = s.get().project.artboards[0].children.find((n) => n.id === instanceId) as InstanceNode;
    expect(inst.width / inst.height).toBeCloseTo(400 / 60, 1);
    expect(inst.width).toBeLessThanOrEqual(800);
    s.setProps([instanceId], { width: 300, height: 45 });
    inst = s.get().project.artboards[0].children.find((n) => n.id === instanceId) as InstanceNode;
    expect([inst.width, inst.height]).toEqual([300, 45]);
  });

  it('are left as they are by someone with the override on', () => {
    const { s, instanceId } = open();
    s.set({ activeArtboardId: s.get().project.artboards[0].id, brandOverride: true });
    s.setProps([instanceId], { width: 4000, height: 40 });
    const inst = s.get().project.artboards[0].children.find((n) => n.id === instanceId) as InstanceNode;
    expect([inst.width, inst.height]).toEqual([4000, 40]);
  });

  it('are not touched when they were not part of the change', () => {
    const { app, instanceId } = consumer();
    //an instance that was already off (placed before the kit was a brand kit) stays until somebody edits it
    const off = produce(app, (d) => void ((d.artboards[0].children.find((n) => n.id === instanceId) as InstanceNode).width = 5000));
    const other = produce(off, (d) => void d.artboards[0].children.push(createNode('rect', { name: 'New' })));
    expect(clampBrandInstances(off, other)).toBe(other);
    expect((clampBrandInstances(off, other).artboards[0].children.find((n) => n.id === instanceId) as InstanceNode).width).toBe(5000);
  });

  it('only count for brand kit artboards', () => {
    const { s, instanceId } = open(false);
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    s.setProps([instanceId], { width: 4000, height: 40 });
    const inst = s.get().project.artboards[0].children.find((n) => n.id === instanceId) as InstanceNode;
    expect([inst.width, inst.height]).toEqual([4000, 40]);
  });
});

describe('updating the kit', () => {
  it('keeps what the author wrote in the editable text, and takes everything else from the new version', () => {
    const { app, lib } = consumer();
    const copy = localCopy(app, KIT, headerId(lib))!;
    const title = copy.children.find((n) => n.name === 'Title')!;
    const written = produce(app, (d) => void ((d.artboards.find((a) => a.id === copy.id)!.children.find((n) => n.id === title.id) as TextNode).text = 'Introduction to statistics'));
    const v2 = produce(lib, (d) => {
      const h = d.artboards[0];
      (h.children[0] as { fill: { type: 'solid'; color: string } }).fill = { type: 'solid', color: '#445566' };
      (h.children.find((n) => n.name === 'Title') as TextNode).text = 'New default';
      (h.children.find((n) => n.name === 'Slogan') as TextNode).text = 'New slogan';
    });
    const next = produce(written, (d) => void updateAll(d as Project, info, content(v2, 2)));
    const now = localCopy(next, KIT, headerId(lib))!;
    expect((now.children.find((n) => n.name === 'Title') as TextNode).text).toBe('Introduction to statistics');
    expect((now.children.find((n) => n.name === 'Slogan') as TextNode).text).toBe('New slogan');
    expect((now.children[0] as { fill: { color: string } }).fill.color).toBe('#445566');
    expect(now.library!.brand).toBe(true);
  });
});

describe('the off-brand check', () => {
  it('has nothing to say in a project without a brand kit', () => {
    expect(offBrand(createProject('Plain'))).toBeNull();
  });

  it('lists colours and fonts the kit does not have, informationally, most used first', () => {
    const { app } = consumer();
    const used = produce(app, (d) => {
      const home = d.artboards[0];
      home.background = { type: 'solid', color: '#ffffff' };
      home.children.push(
        createNode('rect', { name: 'On brand', fill: { type: 'solid', color: '#112233' } }),
        createNode('rect', { name: 'Red 1', fill: { type: 'solid', color: '#FF0000' } }),
        createNode('rect', { name: 'Red 2', fill: { type: 'solid', color: 'rgb(255, 0, 0)' }, stroke: { paint: { type: 'solid', color: '#00ff00' }, width: 2 } }),
        createNode('text', { name: 'Body', text: 'x', fontFamily: 'Comic Sans MS', color: '#112233' }),
        createNode('text', { name: 'Fine', text: 'y', fontFamily: '"Inter", sans-serif', color: '#ffffff' }),
        createNode('rect', { name: 'Gradient', fill: { type: 'linear', angle: 0, stops: [{ offset: 0, color: '#112233' }, { offset: 1, color: '#abcdef' }] } }),
        createNode('rect', { name: 'See through', fill: { type: 'solid', color: 'transparent' } }),
      );
    });
    const report = offBrand(used)!;
    expect(report.kits).toEqual(['UniSQ brand']);
    expect(report.colors.map((c) => [c.value, c.uses])).toEqual([['#ff0000', 2], ['#00ff00', 1], ['#abcdef', 1]]);
    expect(report.colors[0].where).toEqual(['Home']);
    expect(report.fonts.map((f) => f.value)).toEqual(['Comic Sans MS']);
  });

  it('allows a font written as a stack only when the family is the kit\'s own', () => {
    const { app } = consumer();
    const used = produce(app, (d) => void d.artboards[0].children.push(createNode('text', { name: 'T', text: 'x', fontFamily: 'Inter' })));
    expect(offBrand(used)!.fonts).toHaveLength(0);
  });

  it('leaves library artboards out, and reads theme tokens as the colour they hold', () => {
    const { app } = consumer();
    const themed = produce(app, (d) => {
      d.themes = { list: [{ id: 'th1', name: 'Light', mode: 'light' }], tokens: [{ id: 'tk1', name: 'Accent', values: { th1: '#112233' } }, { id: 'tk2', name: 'Odd', values: { th1: '#13579b' } }] };
      d.artboards[0].children.push(createNode('rect', { name: 'A', fill: { type: 'solid', color: 'token:tk1' } }), createNode('rect', { name: 'B', fill: { type: 'solid', color: 'token:tk2' } }));
      //the kit's own copy is not the author's doing
      d.artboards.find((a) => a.library)!.children.push(createNode('rect', { name: 'Kit red', fill: { type: 'solid', color: '#fe0000' } }));
    });
    expect(offBrand(themed)!.colors.map((c) => c.value)).toEqual(['#13579b']);
  });

  it('never blocks anything: the same project edits as freely', () => {
    const { app } = consumer();
    const s = new EditorStore(produce(app, (d) => void d.artboards[0].children.push(createNode('rect', { name: 'Red', fill: { type: 'solid', color: '#ff0000' } }))));
    expect(offBrand(s.get().project)!.colors).toHaveLength(1);
    const red = s.get().project.artboards[0].children.find((n) => n.name === 'Red')!;
    s.setProps([red.id], { x: 12 });
    expect(s.get().project.artboards[0].children.find((n) => n.name === 'Red')!.x).toBe(12);
    expect(s.get().toast).toBeNull();
  });

  it('normalises colours the same way whatever they are written as', () => {
    expect(colourKey('#FFF')).toBe('#ffffff');
    expect(colourKey('rgb(17, 34, 51)')).toBe('#112233');
    expect(colourKey('#11223380')).toBe('#112233');
    expect(colourKey('transparent')).toBeNull();
    expect(colourKey('var(--x)')).toBeNull();
    expect(colourKey(undefined)).toBeNull();
  });
});

describe('a project that starts with a brand kit (a pre-branded template)', () => {
  const start = (lib = makeKit()) => {
    const snap = content(lib, 1);
    let placed: string[] = [];
    const project = produce(createProject('Branded start'), (d) => void (placed = startFromBrandKit(d as Project, info, snap)));
    return { project, placed, lib };
  };

  it('has the kit added and the items it marks placed where it says', () => {
    const { project, placed } = start();
    const home = project.artboards[0];
    expect(placed).toHaveLength(2);
    expect(project.libraries![0]).toMatchObject({ id: KIT, brand: { fonts: ['inter'] } });
    const [header, logo] = placed.map((id) => home.children.find((n) => n.id === id) as InstanceNode);
    //the header is 400 wide on an artboard that is 960 wide: native size, centred along the top
    expect([header.x, header.y, header.width, header.height]).toEqual([Math.round((home.width - 400) / 2), 0, 400, 60]);
    expect([logo.x, logo.y]).toEqual([home.width - 80, home.height - 40]);
    //they point at locked copies that stay off the canvas
    for (const n of [header, logo]) {
      const ab = project.artboards.find((a) => a.id === n.artboardId)!;
      expect(ab.library!.brand).toBe(true);
      expect(ab.canvasHidden).toBe(true);
    }
  });

  it('shrinks an item that is wider than the artboard, keeping its proportions', () => {
    const lib = makeKit();
    lib.artboards[0].width = 4000;
    lib.artboards[0].height = 600;
    const { project, placed } = start(lib);
    const home = project.artboards[0];
    const header = home.children.find((n) => n.id === placed[0]) as InstanceNode;
    expect(header.width).toBeLessThanOrEqual(home.width);
    expect(header.width / header.height).toBeCloseTo(4000 / 600, 1);
  });

  it('only adds the kit when it marks nothing for new projects', () => {
    const lib = makeKit();
    for (const a of lib.artboards) delete a.brandPlace;
    const { project, placed } = start(lib);
    expect(placed).toEqual([]);
    expect(project.libraries).toHaveLength(1);
    expect(project.artboards).toHaveLength(1);
  });

  it('becomes a template that says which kit it starts with, and every project made from it is locked the same', () => {
    const { project } = start();
    const asTemplate = JSON.parse(JSON.stringify(cleanProject(project)));
    expect(brandKitsOf(asTemplate)).toEqual([{ id: KIT, name: 'UniSQ brand' }]);

    //"Use template" is a copy of that document, so the kit, the locked copies and the instances come with it
    const made: Project = JSON.parse(JSON.stringify(asTemplate));
    made.id = 'prnew00001';
    const s = new EditorStore(made);
    const copy = made.artboards.find((a) => a.library)!;
    s.set({ activeArtboardId: copy.id });
    const before = s.get().project;
    s.setProps([copy.children[0].id], { x: 9 });
    expect(s.get().project).toBe(before);
    expect(s.get().toast?.text).toMatch(/brand kit/);
    //while the rest of the new project is the author's
    s.set({ activeArtboardId: made.artboards[0].id });
    const mine = createNode('text', { name: 'Mine', text: 'Hello' });
    s.addNodes([mine]);
    expect(s.get().project.artboards[0].children.some((n) => n.name === 'Mine')).toBe(true);
  });

  it('fits a host that is a library artboard by not placing anything', () => {
    const lib = makeKit();
    const snap = content(lib, 1);
    const withCopy = produce(createProject('X'), (d) => void applyComponents(d as Project, KIT, snap, [headerId(lib)]));
    const hostId = linkedArtboards(withCopy, KIT)[0].id;
    const placed = produce(withCopy, (d) => {
      expect(startFromBrandKit(d as Project, info, snap, hostId)).toEqual([]);
    });
    expect(placed.artboards.find((a) => a.id === hostId)!.children.every((n) => n.type !== 'instance')).toBe(true);
  });
});

describe('the project can still be saved and played', () => {
  it('keeps the new fields out of the way of the player: unknown to it, ignored', () => {
    const { app } = consumer();
    const round = JSON.parse(JSON.stringify(app)) as Project;
    expect(round.artboards.find((a) => a.library)!.library!.brand).toBe(true);
    expect(round.libraries![0].brand!.colors).toContain('#112233');
  });
});
