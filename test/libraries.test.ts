import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { createArtboard, createNode, createProject, type InstanceNode, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { accessFilter, buildSnapshot, cleanShare, hashArtboard, mayUseLibrary, planPublish, snapshotHash } from '../shared/library.mjs';
import {
  addLibrary,
  applyColorStyle,
  applyComponents,
  applyTextStyle,
  changedComponents,
  deleteStyle,
  describeChange,
  detachArtboard,
  editStyle,
  linkedArtboards,
  localCopy,
  lockViolation,
  makeInstance,
  missingAssets,
  pruneInternals,
  removeLibrary,
  syncLibraryStyles,
  updateAll,
  updateComponents,
  type LibraryContent,
} from '../src/lib/libraries';
import { EditorStore } from '../src/store/store';

const LIB = 'prkit0001';

/** A library: a Button component (a rect with a style, a text bound to a variable, an image, an Icon instance) and the Icon artboard it uses. */
function makeLibrary(): Project {
  const lib = createProject('Kit');
  lib.id = LIB;
  lib.settings.library = true;
  const button = lib.artboards[0];
  button.name = 'Button';
  button.width = 200;
  button.height = 60;
  button.publish = true;
  const icon = createArtboard({ name: 'Icon', width: 24, height: 24 });
  icon.children.push(createNode('ellipse', { name: 'Dot', width: 24, height: 24 }));
  const bg = createNode('rect', { name: 'Bg', width: 200, height: 60, fill: { type: 'solid', color: '#ff0000' }, styleRefs: { fill: 'c1' } });
  const label = createNode('text', { name: 'Label', text: 'Go', bindings: { text: 'caption' } });
  const pic = createNode('image', { name: 'Pic', assetId: 'as1' });
  const inst = createNode('instance', { name: 'Icon', artboardId: icon.id, width: 24, height: 24 });
  button.children.push(bg, label, pic, inst);
  lib.artboards.push(icon);
  lib.variables.push({ id: 'v1', name: 'caption', type: 'string', initial: 'Go' }, { id: 'v2', name: 'unused', type: 'number', initial: 0 });
  lib.assets.push({ id: 'as1', name: 'pic.png', mime: 'image/png', size: 10 }, { id: 'as2', name: 'other.png', mime: 'image/png', size: 10 });
  lib.styles = { colors: [{ id: 'c1', name: 'Brand', color: '#ff0000' }], texts: [{ id: 't1', name: 'Body', fontFamily: 'Inter', fontSize: 16, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.4, letterSpacing: 0 }] };
  return lib;
}

const content = (lib: Project, version: number): LibraryContent => ({ ...buildSnapshot(lib), version });
const info = { id: LIB, name: 'Kit' };
const buttonId = (lib: Project) => lib.artboards[0].id;

/** A project that has added the library and placed its Button. */
function consumerWith(lib: Project, version = 1) {
  const snap = content(lib, version);
  const app = produce(createProject('App'), (d) => {
    addLibrary(d as Project, info, snap);
    applyComponents(d as Project, LIB, snap, [buttonId(lib)]);
  });
  return { app, snap };
}

describe('library snapshot', () => {
  it('holds the published artboards, what they use, the assets and styles they need', () => {
    const lib = makeLibrary();
    const snap = buildSnapshot(lib);
    expect(snap.components.map((c) => c.name)).toEqual(['Button']);
    expect(snap.components[0].uses).toEqual([lib.artboards[1].id]);
    expect(snap.internals.map((c) => c.name)).toEqual(['Icon']);
    expect(snap.artboards.map((a) => a.name)).toEqual(['Button', 'Icon']);
    expect(snap.artboards.every((a) => !a.publish && !a.library)).toBe(true);
    expect(snap.assets.map((a) => a.id)).toEqual(['as1']);
    expect(snap.styles.colors[0].name).toBe('Brand');
  });

  it('also takes assets named in a variable, a binding or a style, not only those layers use directly', () => {
    const lib = makeLibrary();
    lib.assets.push(
      { id: 'as3', name: 'v.png', mime: 'image/png', size: 1 },
      { id: 'as4', name: 'b.png', mime: 'image/png', size: 1 },
      { id: 'as5', name: 's.png', mime: 'image/png', size: 1 },
      { id: 'as6', name: 'dq.png', mime: 'image/png', size: 1 },
      { id: 'as7', name: 'nope.png', mime: 'image/png', size: 1 },
    );
    lib.variables.push({ id: 'v3', name: 'skin', type: 'string', initial: 'as3' });
    const label = lib.artboards[0].children.find((c) => c.name === 'Label')!;
    label.bindings = { ...label.bindings, 'fill.assetId': "mode == 'a' ? 'as4' : 'x'", other: 'mode == "as6" ? 1 : 0' };
    lib.styles!.colors.push({ id: 'c2', name: 'Tex', color: '#000', fill: { type: 'image', assetId: 'as5', fit: 'cover' } } as never);
    // an id that is only part of a longer word is not a mention
    lib.variables.push({ id: 'v4', name: 'long', type: 'string', initial: 'as7x' });
    expect(buildSnapshot(lib).assets.map((a) => a.id).sort()).toEqual(['as1', 'as3', 'as4', 'as5', 'as6']);
  });

  it('hashes content, not position, so a move is not a change', () => {
    const lib = makeLibrary();
    const a = buildSnapshot(lib).components[0].hash;
    const moved = produce(lib, (d) => void (d.artboards[0].canvasX = 900));
    expect(buildSnapshot(moved).components[0].hash).toBe(a);
    expect(hashArtboard(moved.artboards[0])).toBe(hashArtboard(lib.artboards[0]));
    const edited = produce(lib, (d) => void (d.artboards[0].width = 220));
    expect(buildSnapshot(edited).components[0].hash).not.toBe(a);
    // a change inside the nested artboard changes the component that uses it
    const nested = produce(lib, (d) => void d.artboards[1].children.push(createNode('rect', { name: 'X' })));
    expect(buildSnapshot(nested).components[0].hash).not.toBe(a);
  });

  it('plans a publish: nothing new keeps the version, a change bumps it', () => {
    const lib = makeLibrary();
    const snap = buildSnapshot(lib);
    const first = planPublish(null, snap, { note: 'first', by: 'ann', now: 'now' });
    expect(first).toMatchObject({ unchanged: false, version: 1 });
    const stored = { version: 1, hash: first.hash, history: first.history };
    expect(planPublish(stored, snap, { now: 'later' })).toMatchObject({ unchanged: true, version: 1 });
    const next = planPublish(stored, buildSnapshot(produce(lib, (d) => void (d.artboards[0].height = 80))), { note: 'taller', now: 'later' });
    expect(next.version).toBe(2);
    expect(next.history!.map((h) => h.version)).toEqual([2, 1]);
    expect(snapshotHash(snap)).toBe(first.hash);
  });
});

describe('library access', () => {
  const lib = { owner: { username: 'ann' }, shared: { everyone: false, users: ['bob'] } };
  it('owner, named users and everyone, nobody else', () => {
    expect(mayUseLibrary(lib, { username: 'ann' }, true)).toBe(true);
    expect(mayUseLibrary(lib, { username: 'bob' }, true)).toBe(true);
    expect(mayUseLibrary(lib, { username: 'cy' }, true)).toBe(false);
    expect(mayUseLibrary({ ...lib, shared: { everyone: true, users: [] } }, { username: 'cy' }, true)).toBe(true);
    // no session: open until sessions are enforced
    expect(mayUseLibrary(lib, null, false)).toBe(true);
    expect(mayUseLibrary(lib, null, true)).toBe(false);
  });
  it('builds the list filter and cleans sharing input', () => {
    expect(accessFilter({ username: 'ann' }, true)).toEqual({ $or: [{ 'owner.username': 'ann' }, { 'shared.everyone': true }, { 'shared.users': 'ann' }] });
    expect(accessFilter(null, false)).toEqual({});
    expect(cleanShare({ everyone: 'yes', users: ['bob', ' bob ', 'a b', '', 7, 'cy.d'] })).toEqual({ everyone: false, users: ['bob', 'cy.d'] });
  });
});

describe('inserting a library component', () => {
  it('copies the component and what it uses as linked artboards, with what they need', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    expect(app.libraries).toEqual([{ id: LIB, name: 'Kit', version: 1 }]);
    const button = localCopy(app, LIB, buttonId(lib))!;
    const icon = localCopy(app, LIB, lib.artboards[1].id)!;
    expect(button.library).toMatchObject({ libraryId: LIB, version: 1 });
    expect(button.library!.internal).toBeUndefined();
    expect(icon.library!.internal).toBe(true);
    // the button's instance points at this project's copy of the icon
    const inner = button.children.find((n) => n.type === 'instance') as InstanceNode;
    expect(inner.artboardId).toBe(icon.id);
    // only the variable and asset it uses came along
    expect(app.variables.map((v) => v.name)).toEqual(['caption']);
    expect(app.assets.map((a) => a.id)).toEqual(['as1']);
    // the style ref follows the project's own copy of the style
    const bg = button.children[0] as SceneNode;
    expect(bg.styleRefs?.fill).toBe(app.styles!.colors[0].id);
    expect(app.styles!.colors[0].library).toEqual({ libraryId: LIB, styleId: 'c1' });
  });

  it('reuses the copy when placed again, and keeps your variable of the same name', () => {
    const lib = makeLibrary();
    const snap = content(lib, 1);
    let app = produce(createProject('App'), (d) => void d.variables.push({ id: 'mine', name: 'caption', type: 'string', initial: 'Mine' }));
    app = produce(app, (d) => void applyComponents(d as Project, LIB, snap, [buttonId(lib)]));
    const again = produce(app, (d) => void applyComponents(d as Project, LIB, snap, [buttonId(lib)]));
    expect(again.artboards).toHaveLength(app.artboards.length);
    expect(again.variables).toEqual([{ id: 'mine', name: 'caption', type: 'string', initial: 'Mine' }]);
  });

  it('says which assets still have to be fetched', () => {
    const lib = makeLibrary();
    const snap = content(lib, 1);
    expect(missingAssets(createProject('App'), snap, [buttonId(lib)])).toEqual(['as1']);
    const { app } = consumerWith(lib);
    expect(missingAssets(app, snap, [buttonId(lib)])).toEqual([]);
  });

  it('places an instance of the copy', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const home = app.artboards[0].id;
    const copy = localCopy(app, LIB, buttonId(lib))!;
    const node = makeInstance(app, home, copy.id, { x: 300, y: 200 })!;
    expect(node).toMatchObject({ type: 'instance', artboardId: copy.id, width: 200, height: 60, x: 200, y: 170 });
  });
});

describe('updating to a new version', () => {
  it('reports what changed, replaces the copy in place and keeps your overrides', () => {
    const lib = makeLibrary();
    const { app: before } = consumerWith(lib, 1);
    const copy = localCopy(before, LIB, buttonId(lib))!;
    // the consumer places the button in Home, overrides its input, moves the copy and edits a variable
    let app = produce(before, (d) => {
      const home = d.artboards[0];
      const inst = createNode('instance', { name: 'Button', artboardId: copy.id, width: 200, height: 60, inputs: { caption: 'Buy' } });
      home.children.push(inst as never);
      d.artboards.find((a) => a.id === copy.id)!.canvasX = 1234;
      d.variables[0].initial = 'Mine';
    });
    const instanceBefore = app.artboards[0].children[0];

    // the library gains a layer, a new size, a new asset and a nested change
    const lib2 = produce(lib, (d) => {
      d.artboards[0].width = 260;
      d.artboards[0].children.push(createNode('text', { name: 'Badge', text: 'New' }) as never);
      d.artboards[0].children.find((n) => n.name === 'Label')!.name = 'Caption';
      d.artboards[1].children.push(createNode('rect', { name: 'Ring' }) as never);
    });
    const snap2 = content(lib2, 2);
    const changed = changedComponents(app, LIB, snap2.components);
    expect(changed).toEqual([{ componentId: buttonId(lib), localId: copy.id, name: 'Button', status: 'changed', fromVersion: 1 }]);
    const lines = describeChange(app, LIB, copy.id, snap2.artboards.find((a) => a.id === buttonId(lib))!);
    expect(lines).toContain('Size 200 × 60 to 260 × 60');
    expect(lines.some((l) => l.startsWith('1 layer added: Badge'))).toBe(true);
    expect(lines.some((l) => l.startsWith('1 layer changed: Caption'))).toBe(true);

    app = produce(app, (d) => void updateAll(d as Project, info, snap2));
    const after = localCopy(app, LIB, buttonId(lib))!;
    expect(after.id).toBe(copy.id);
    expect(after.width).toBe(260);
    expect(after.children.map((n) => n.name)).toEqual(['Bg', 'Caption', 'Pic', 'Icon', 'Badge']);
    expect(after.library!.version).toBe(2);
    expect(after.canvasX).toBe(1234);
    // the nested artboard came along too
    expect(localCopy(app, LIB, lib.artboards[1].id)!.children.map((n) => n.name)).toEqual(['Dot', 'Ring']);
    // overrides kept: the instance (and its inputs), the variable you changed
    expect(app.artboards[0].children[0]).toBe(instanceBefore);
    expect((app.artboards[0].children[0] as InstanceNode).inputs).toEqual({ caption: 'Buy' });
    expect(app.variables[0].initial).toBe('Mine');
    expect(app.libraries![0].version).toBe(2);
    // and nothing is left to update
    expect(changedComponents(app, LIB, snap2.components)).toEqual([]);
  });

  it('updates one component and leaves the others', () => {
    const lib = produce(makeLibrary(), (d) => {
      const second = createArtboard({ name: 'Card', width: 100, height: 100 });
      second.publish = true;
      d.artboards.push(second);
    });
    const snap = content(lib, 1);
    const cardId = lib.artboards[2].id;
    let app = produce(createProject('App'), (d) => {
      addLibrary(d as Project, info, snap);
      applyComponents(d as Project, LIB, snap, [buttonId(lib), cardId]);
    });
    const lib2 = produce(lib, (d) => {
      d.artboards[0].height = 90;
      d.artboards[2].height = 150;
    });
    const snap2 = content(lib2, 2);
    expect(changedComponents(app, LIB, snap2.components).map((c) => c.name).sort()).toEqual(['Button', 'Card']);
    app = produce(app, (d) => void updateComponents(d as Project, LIB, snap2, [cardId]));
    expect(localCopy(app, LIB, cardId)!.height).toBe(150);
    expect(localCopy(app, LIB, buttonId(lib))!.height).toBe(60);
    expect(changedComponents(app, LIB, snap2.components).map((c) => c.name)).toEqual(['Button']);
  });

  it('flags a component the library dropped, and prunes inner copies nothing uses', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const gone = content(produce(lib, (d) => void (d.artboards[0].publish = false)), 2);
    const lib2 = produce(lib, (d) => {
      const second = createArtboard({ name: 'Card' });
      second.publish = true;
      d.artboards.push(second);
    });
    expect(changedComponents(app, LIB, gone.components)).toMatchObject([{ status: 'removed', name: 'Button' }]);
    // the library's Button no longer uses Icon: after the update the inner copy has no user
    const lib3 = produce(lib2, (d) => {
      d.artboards[0].children = d.artboards[0].children.filter((n) => n.type !== 'instance');
    });
    const updated = produce(app, (d) => void updateAll(d as Project, info, content(lib3, 2)));
    expect(updated.artboards.some((a) => a.library?.internal)).toBe(false);
    expect(updated.artboards.map((a) => a.name)).toEqual(['Home', 'Button']);
  });

  it('prunes an inner copy only when no artboard places it', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const icon = localCopy(app, LIB, lib.artboards[1].id)!;
    // your own artboard also places the icon, so it stays even when the Button is deleted
    const mine = produce(app, (d) => {
      d.artboards[0].children.push(createNode('instance', { artboardId: icon.id }) as never);
      d.artboards = d.artboards.filter((a) => a.name !== 'Button');
      pruneInternals(d as Project);
    });
    expect(mine.artboards.some((a) => a.library?.internal)).toBe(true);
  });
});

describe('detaching', () => {
  it('turns a copy into an ordinary artboard', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const copy = localCopy(app, LIB, buttonId(lib))!;
    const next = produce(app, (d) => void detachArtboard(d as Project, copy.id));
    expect(next.artboards.find((a) => a.id === copy.id)!.library).toBeUndefined();
    expect(changedComponents(next, LIB, content(lib, 2).components)).toEqual([]);
    // the inner icon is still linked
    expect(linkedArtboards(next, LIB)).toHaveLength(1);
  });

  it('stopping with a library detaches all of it and keeps its styles as your own', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const next = produce(app, (d) => void removeLibrary(d as Project, LIB));
    expect(linkedArtboards(next)).toHaveLength(0);
    expect(next.libraries).toEqual([]);
    expect(next.styles!.colors[0].library).toBeUndefined();
  });
});

describe('library artboards are read-only in the editor', () => {
  function open() {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const copy = localCopy(app, LIB, buttonId(lib))!;
    const s = new EditorStore(app);
    s.set({ activeArtboardId: copy.id });
    return { s, copy, lib };
  }

  it('refuses edits to a library artboard but lets you move it and rename it', () => {
    const { s, copy } = open();
    const bg = copy.children[0];
    const before = s.get().project;
    s.setProps([bg.id], { x: 50 });
    expect(s.get().project).toBe(before);
    expect(s.get().toast?.kind).toBe('error');
    s.update((d) => {
      const a = d.artboards.find((x) => x.id === copy.id)!;
      a.canvasX = 500;
      a.name = 'My button';
    });
    const moved = s.get().project.artboards.find((a) => a.id === copy.id)!;
    expect(moved.canvasX).toBe(500);
    expect(moved.name).toBe('My button');
    expect(lockViolation(before, s.get().project)).toBeNull();
  });

  it('still edits your own artboards, and library operations go through (one undo step)', () => {
    const { s, lib } = open();
    s.set({ activeArtboardId: s.get().project.artboards[0].id });
    const rect = createNode('rect', { name: 'Mine' });
    s.addNodes([rect]);
    expect(s.get().project.artboards[0].children.map((n) => n.name)).toContain('Mine');
    const snap2 = content(produce(lib, (d) => void (d.artboards[0].width = 300)), 2);
    s.update((d) => void updateAll(d as Project, info, snap2), { library: true });
    expect(localCopy(s.get().project, LIB, buttonId(lib))!.width).toBe(300);
    s.undo();
    expect(localCopy(s.get().project, LIB, buttonId(lib))!.width).toBe(200);
  });

  it('detaching makes it editable, and duplicating gives an ordinary copy', () => {
    const { s, copy } = open();
    s.duplicateArtboard(copy.id);
    const dup = s.get().project.artboards.at(-1)!;
    expect(dup.library).toBeUndefined();
    s.update((d) => void detachArtboard(d as Project, copy.id), { library: true });
    s.set({ activeArtboardId: copy.id });
    s.setProps([copy.children[0].id], { x: 50 });
    expect(s.artboard()!.children[0].x).toBe(50);
  });
});

describe('styles', () => {
  it('a library style updates in the project and in the layers that follow it', () => {
    const lib = makeLibrary();
    let app = produce(createProject('App'), (d) => void addLibrary(d as Project, info, content(lib, 1)));
    const brand = app.styles!.colors[0];
    // a layer of yours follows the library's colour
    app = produce(app, (d) => {
      const r = createNode('rect', { name: 'Mine' });
      d.artboards[0].children.push(r as never);
      expect(applyColorStyle(d.artboards[0].children[0] as SceneNode, 'fill', brand)).toBe(true);
    });
    expect((app.artboards[0].children[0] as { fill: { color: string } }).fill.color).toBe('#ff0000');
    const lib2 = produce(lib, (d) => void (d.styles!.colors[0].color = '#00ff00'));
    app = produce(app, (d) => void syncLibraryStyles(d as Project, LIB, content(lib2, 2).styles));
    expect(app.styles!.colors[0].id).toBe(brand.id);
    expect((app.artboards[0].children[0] as { fill: { color: string } }).fill.color).toBe('#00ff00');
  });

  it('your own styles: apply, edit cascades, hand edits unlink, delete keeps the look', () => {
    let app = createProject('App');
    app = produce(app, (d) => {
      d.artboards[0].children.push(createNode('text', { name: 'T', text: 'hi' }) as never, createNode('rect', { name: 'R' }) as never);
    });
    const s = new EditorStore(app);
    const [t, r] = s.get().project.artboards[0].children;
    let colorId = '';
    s.update((d) => {
      const p = d as Project;
      p.styles = { colors: [{ id: 'c9', name: 'Ink', color: '#111111' }], texts: [{ id: 't9', name: 'Head', fontFamily: 'Georgia', fontSize: 40, fontWeight: 700, fontStyle: 'normal', lineHeight: 1.1, letterSpacing: 1 }] };
      colorId = 'c9';
      expect(applyColorStyle(p.artboards[0].children[1], 'fill', p.styles.colors[0])).toBe(true);
      expect(applyTextStyle(p.artboards[0].children[0], p.styles.texts[0])).toBe(true);
      // a text style does not fit a rect
      expect(applyTextStyle(p.artboards[0].children[1], p.styles.texts[0])).toBe(false);
    });
    expect((s.get().project.artboards[0].children[0] as TextNode).fontSize).toBe(40);
    s.update((d) => void editStyle(d as Project, colorId, { color: '#222222' }));
    expect((s.get().project.artboards[0].children[1] as { fill: { color: string } }).fill.color).toBe('#222222');
    s.update((d) => void editStyle(d as Project, 't9', { fontSize: 44 }));
    expect((s.get().project.artboards[0].children[0] as TextNode).fontSize).toBe(44);
    // editing the layer's own fill drops the link, so the style no longer moves it
    s.setProps([r.id], { fill: { type: 'solid', color: '#abcdef' } });
    expect(s.get().project.artboards[0].children[1].styleRefs).toBeUndefined();
    s.update((d) => void editStyle(d as Project, colorId, { color: '#333333' }));
    expect((s.get().project.artboards[0].children[1] as { fill: { color: string } }).fill.color).toBe('#abcdef');
    s.update((d) => void deleteStyle(d as Project, 't9'));
    expect(s.get().project.styles!.texts).toHaveLength(0);
    expect((s.get().project.artboards[0].children[0] as TextNode).fontSize).toBe(44);
    expect(s.get().project.artboards[0].children[0].styleRefs).toBeUndefined();
    void t;
  });

  it('library styles cannot be edited or deleted here', () => {
    const lib = makeLibrary();
    const app = produce(createProject('App'), (d) => void addLibrary(d as Project, info, content(lib, 1)));
    const id = app.styles!.colors[0].id;
    const next = produce(app, (d) => {
      expect(editStyle(d as Project, id, { color: '#000000' })).toBe(false);
      expect(deleteStyle(d as Project, id)).toBe(false);
    });
    expect(next.styles!.colors[0].color).toBe('#ff0000');
  });
});

describe('export', () => {
  it('a library artboard is an ordinary artboard in the saved file', () => {
    const lib = makeLibrary();
    const { app } = consumerWith(lib);
    const json = JSON.parse(JSON.stringify(app)) as Project;
    const copy = json.artboards.find((a) => a.name === 'Button')!;
    // everything it needs is inside the project: layers, the icon it places, the asset and variable record
    const icon = json.artboards.find((a) => a.id === (copy.children.find((n) => n.type === 'instance') as InstanceNode).artboardId);
    expect(icon?.name).toBe('Icon');
    expect(json.assets.map((a) => a.id)).toContain('as1');
    expect(json.variables.map((v) => v.name)).toContain('caption');
  });
});
