import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, isContainer, uid, walk, type Artboard, type SceneNode } from 'interactives-player';
import { REMOVED_SUFFIX, baselineOf, describeStats, hashBytes, newSource, reconcileArtboard, stable } from '../src/lib/link-reconcile';

// A stand-in for what the importer makes from a file: fresh ids and fresh asset ids on every call.
interface Spec {
  name: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Picture content (stands in for the PNG bytes). */
  img?: string;
  text?: string;
  opacity?: number;
  kids?: Spec[];
}
interface File {
  artboard: Artboard;
  hashes: Record<string, string>;
}
function file(specs: Spec[], size = { width: 400, height: 300 }): File {
  const hashes: Record<string, string> = {};
  const build = (s: Spec): SceneNode => {
    const box = { name: s.name, x: s.x ?? 0, y: s.y ?? 0, width: s.w ?? 10, height: s.h ?? 10, opacity: s.opacity ?? 1 };
    if (s.kids) return createNode('group', { ...box, children: s.kids.map(build) });
    if (s.text !== undefined) return createNode('text', { ...box, text: s.text, autoSize: 'none' });
    const id = uid('as');
    hashes[id] = hashBytes(new TextEncoder().encode(s.img ?? s.name));
    return createNode('image', { ...box, assetId: id });
  };
  return { artboard: createArtboard({ name: 'Poster', ...size, children: specs.map(build) }), hashes };
}
/** The project's artboard right after the first import. */
function imported(f: File): Artboard {
  return { ...f.artboard, source: newSource(f.artboard, f.hashes, { kind: 'psd', fileName: 'Poster.psd', linkId: 'lk1', lastModified: 1, importedAt: 't' }) };
}
const find = (ab: Artboard, name: string): SceneNode | undefined => {
  let r: SceneNode | undefined;
  walk(ab.children, (n) => {
    if (n.name === name || n.name === name + REMOVED_SUFFIX) r ??= n;
  });
  return r;
};
const names = (list: SceneNode[]): string[] => list.map((n) => n.name);
const edit = (ab: Artboard, name: string, patch: Record<string, unknown>): Artboard => {
  const copy = structuredClone(ab);
  Object.assign(find(copy, name)!, patch);
  return copy;
};
const base = (): Spec[] => [
  { name: 'Background', w: 400, h: 300, img: 'bg' },
  { name: 'Title', x: 20, y: 20, w: 200, h: 40, text: 'Hello' },
  { name: 'Hero', x: 50, y: 80, w: 100, h: 100, img: 'hero' },
  { name: 'Group', x: 10, y: 200, w: 100, h: 50, kids: [{ name: 'Icon', x: 0, y: 0, img: 'icon' }, { name: 'Label', x: 20, y: 0, text: 'Go' }] },
];

describe('reconcile', () => {
  it('an unchanged file changes nothing', () => {
    const cur = imported(file(base()));
    const nx = file(base());
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.changed).toBe(false);
    expect(r.artboard).toBe(cur);
    expect(r.usedAssetIds).toEqual([]);
    expect(describeStats('Poster.psd', r.stats)).toBe('Poster.psd reloaded: nothing changed');
  });

  it('keeps the same layer ids and asset ids when nothing changed', () => {
    const cur = imported(file(base()));
    const nx = file(base());
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.children.map((c) => c.id)).toEqual(cur.children.map((c) => c.id));
  });

  it('takes a property the file changed when you have not touched it', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec[2] = { ...spec[2], x: 70, opacity: 0.5 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const hero = find(r.artboard, 'Hero')!;
    expect(hero.x).toBe(70);
    expect(hero.opacity).toBe(0.5);
    expect(hero.id).toBe(find(cur, 'Hero')!.id);
    expect(r.stats.changed).toBe(1);
    expect(r.changed).toBe(true);
    expect(describeStats('Poster.psd', r.stats)).toBe('Poster.psd updated: 1 layer changed');
  });

  it('keeps a property you edited, and still takes the other changes', () => {
    const cur = edit(imported(file(base())), 'Hero', { x: 999 });
    const spec = base();
    spec[2] = { ...spec[2], y: 120 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const hero = find(r.artboard, 'Hero')!;
    expect(hero.x).toBe(999);
    expect(hero.y).toBe(120);
    // yours is kept even if the file moves the same property too
    const spec2 = base();
    spec2[2] = { ...spec2[2], x: 60 };
    const nx2 = file(spec2);
    const r2 = reconcileArtboard(cur, nx2.artboard, nx2.hashes);
    expect(find(r2.artboard, 'Hero')!.x).toBe(999);
    expect(r2.stats.protectedEdits).toBe(1);
  });

  it('leaves your edit alone when the file did not change that property', () => {
    const cur = edit(imported(file(base())), 'Title', { text: 'My words', opacity: 0.2 });
    const nx = file(base());
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.changed).toBe(false);
    expect(find(r.artboard, 'Title')).toMatchObject({ text: 'My words', opacity: 0.2 });
  });

  it('updates text the file changed', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec[1] = { ...spec[1], text: 'Hello world' };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(find(r.artboard, 'Title')).toMatchObject({ text: 'Hello world' });
  });

  it('does not treat the measured size of auto-sizing text as your edit', () => {
    const cur0 = imported(file(base()));
    const withAuto = edit(cur0, 'Title', { autoSize: 'width', width: 77 }); // the editor measured it
    // the file said autoSize none, so it is yours (changed from the file); but width follows autoSize 'width'
    const spec = base();
    spec[1] = { ...spec[1], w: 260 };
    const nx = file(spec);
    const r = reconcileArtboard(withAuto, nx.artboard, nx.hashes);
    // autoSize is the user's change, so the width stays measured rather than being replaced
    expect(find(r.artboard, 'Title')!.width).toBe(77);
  });

  it('adds a new layer at its place in the file order, with its picture', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec.splice(2, 0, { name: 'Badge', x: 5, y: 5, img: 'badge' });
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(names(r.artboard.children)).toEqual(['Background', 'Title', 'Badge', 'Hero', 'Group']);
    expect(r.stats.added).toBe(1);
    const badge = find(r.artboard, 'Badge') as Extract<SceneNode, { type: 'image' }>;
    expect(r.usedAssetIds).toEqual([badge.assetId]);
    expect(describeStats('Poster.psd', r.stats)).toBe('Poster.psd updated: 1 added');
  });

  it('adds inside an existing folder', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec[3].kids!.push({ name: 'Extra', x: 40, img: 'extra' });
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const group = find(r.artboard, 'Group')!;
    expect(isContainer(group) && names(group.children)).toEqual(['Icon', 'Label', 'Extra']);
  });

  it('removes a layer that the file dropped', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec.splice(2, 1);
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(names(r.artboard.children)).toEqual(['Background', 'Title', 'Group']);
    expect(r.stats.removed).toBe(1);
    expect(r.releasedAssetIds).toEqual([(find(cur, 'Hero') as Extract<SceneNode, { type: 'image' }>).assetId]);
  });

  it('removes a whole folder as one removal', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec.pop();
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(names(r.artboard.children)).toEqual(['Background', 'Title', 'Hero']);
    expect(r.stats.removed).toBe(1);
    expect(r.releasedAssetIds).toHaveLength(1); // the icon's picture
  });

  it('follows a layer renamed in the file and keeps its id, your edits and your name edits', () => {
    const cur = edit(imported(file(base())), 'Hero', { x: 321 });
    const spec = base();
    spec[2] = { ...spec[2], name: 'Hero shot' };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.children).toHaveLength(4);
    const hero = find(r.artboard, 'Hero shot')!;
    expect(hero.id).toBe(find(cur, 'Hero')!.id);
    expect(hero.x).toBe(321);
    expect(r.stats.renamed).toBe(1);
    expect(r.stats.removed).toBe(0);
    expect(r.stats.added).toBe(0);
    // if you had renamed it yourself, your name stays
    const mine = edit(imported(file(base())), 'Hero', { name: 'My hero' });
    const r2 = reconcileArtboard(mine, nx.artboard, nx.hashes);
    expect(find(r2.artboard, 'My hero')).toBeTruthy();
  });

  it('follows a renamed folder and its children', () => {
    const cur = imported(file(base()));
    const spec = base();
    spec[3] = { ...spec[3], name: 'Buttons' };
    spec[3].kids![0] = { ...spec[3].kids![0], x: 3 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.children).toHaveLength(4);
    const g = find(r.artboard, 'Buttons')!;
    expect(g.id).toBe(find(cur, 'Group')!.id);
    expect(isContainer(g) && g.children[0].x).toBe(3);
    expect(r.stats.removed + r.stats.added).toBe(0);
  });

  it('keeps a layer the file dropped when it has interactions, marks it and hides it', () => {
    const cur0 = imported(file(base()));
    const hero = find(cur0, 'Hero')!;
    const cur: Artboard = {
      ...cur0,
      logic: { nodes: [{ id: 'ln1', kind: 'action.set', x: 0, y: 0, params: { target: hero.id } }], edges: [] },
    };
    const spec = base();
    spec.splice(2, 1);
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const kept = find(r.artboard, 'Hero')!;
    expect(kept.id).toBe(hero.id);
    expect(kept.name).toBe('Hero' + REMOVED_SUFFIX);
    expect(kept.visible).toBe(false);
    expect(r.stats.kept).toBe(1);
    expect(r.stats.removed).toBe(0);
    // reconciling again does not pile up suffixes, nor treat it as part of the file
    const nx2 = file(spec);
    const again = reconcileArtboard(r.artboard, nx2.artboard, nx2.hashes);
    expect(find(again.artboard, 'Hero')!.name).toBe('Hero' + REMOVED_SUFFIX);
    expect(again.stats.kept).toBe(0);
  });

  it('keeps a dropped layer that has timeline keys or bindings', () => {
    const cur0 = imported(file(base()));
    const hero = find(cur0, 'Hero')!;
    const timelines = [{ id: 'tl1', name: 'T', duration: 1000, loop: 'once' as const, autoplay: false, speed: 1, tracks: [{ id: 'tr1', nodeId: hero.id, prop: 'x', keys: [{ id: 'k1', t: 0, value: 1, ease: 'linear' as const }] }] }];
    const withKeys: Artboard = { ...cur0, timelines };
    const withBinding = edit(cur0, 'Hero', { bindings: { opacity: 'amount' } });
    const spec = base();
    spec.splice(2, 1);
    for (const cur of [withKeys, withBinding]) {
      const nx = file(spec);
      const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
      expect(find(r.artboard, 'Hero')!.name).toBe('Hero' + REMOVED_SUFFIX);
    }
  });

  it('keeps a removed folder when your own layer sits inside it, visible', () => {
    const cur0 = imported(file(base()));
    const cur = structuredClone(cur0);
    const g = find(cur, 'Group')!;
    if (isContainer(g)) g.children.push(createNode('rect', { name: 'Mine' }));
    const spec = base();
    spec.pop();
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const kept = find(r.artboard, 'Group')!;
    expect(kept.name).toBe('Group' + REMOVED_SUFFIX);
    expect(kept.visible).toBe(true);
    expect(isContainer(kept) && names(kept.children)).toEqual(['Mine']);
  });

  it('leaves layers you added alone', () => {
    const cur = structuredClone(imported(file(base())));
    cur.children.push(createNode('rect', { name: 'Mine' }));
    const spec = base();
    spec[0] = { ...spec[0], opacity: 0.9 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(names(r.artboard.children)).toEqual(['Background', 'Title', 'Hero', 'Group', 'Mine']);
    expect(find(r.artboard, 'Background')!.opacity).toBe(0.9);
  });

  it('does not bring back a layer you deleted, and keeps remembering that', () => {
    const cur0 = imported(file(base()));
    const cur: Artboard = { ...cur0, children: cur0.children.filter((c) => c.name !== 'Hero') };
    const nx = file(base());
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(names(r.artboard.children)).toEqual(['Background', 'Title', 'Group']);
    const nx2 = file(base());
    const r2 = reconcileArtboard(r.artboard, nx2.artboard, nx2.hashes);
    expect(names(r2.artboard.children)).toEqual(['Background', 'Title', 'Group']);
  });

  it('replaces a changed picture with the new asset, releasing the old one', () => {
    const cur = imported(file(base()));
    const heroOld = (find(cur, 'Hero') as Extract<SceneNode, { type: 'image' }>).assetId;
    const spec = base();
    spec[2] = { ...spec[2], img: 'hero v2' };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    const hero = find(r.artboard, 'Hero') as Extract<SceneNode, { type: 'image' }>;
    const heroNew = (find(nx.artboard, 'Hero') as Extract<SceneNode, { type: 'image' }>).assetId;
    expect(hero.assetId).toBe(heroNew);
    expect(hero.assetId).not.toBe(heroOld);
    expect(r.usedAssetIds).toEqual([heroNew]);
    expect(r.releasedAssetIds).toEqual([heroOld]);
    expect(r.stats.changed).toBe(1);
    // the same picture again is not replaced a second time
    const nx2 = file(spec);
    const r2 = reconcileArtboard(r.artboard, nx2.artboard, nx2.hashes);
    expect(r2.changed).toBe(false);
    expect(r2.usedAssetIds).toEqual([]);
  });

  it('keeps a picture you swapped for another', () => {
    const cur0 = imported(file(base()));
    const cur = edit(cur0, 'Hero', { assetId: 'as_mine' });
    const spec = base();
    spec[2] = { ...spec[2], img: 'hero v2' };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect((find(r.artboard, 'Hero') as Extract<SceneNode, { type: 'image' }>).assetId).toBe('as_mine');
    expect(r.usedAssetIds).toEqual([]);
    expect(r.releasedAssetIds).toEqual([]);
  });

  it('resizes the artboard unless you resized it', () => {
    const cur = imported(file(base()));
    const nx = file(base(), { width: 500, height: 300 });
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.width).toBe(500);
    expect(r.stats.artboardChanged).toBe(true);
    const mine = { ...cur, width: 640 };
    const r2 = reconcileArtboard(mine, nx.artboard, nx.hashes);
    expect(r2.artboard.width).toBe(640);
  });

  it('matches repeated names by their order', () => {
    const rep = (): Spec[] => [{ name: 'Dot', x: 0, img: 'a' }, { name: 'Dot', x: 20, img: 'b' }, { name: 'Dot', x: 40, img: 'c' }];
    const cur = imported(file(rep()));
    const spec = rep();
    spec[1] = { ...spec[1], x: 25 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.children.map((c) => c.x)).toEqual([0, 25, 40]);
    expect(r.artboard.children.map((c) => c.id)).toEqual(cur.children.map((c) => c.id));
  });

  it('keeps timelines, interactions and bindings, and shares unchanged layers by reference', () => {
    const cur0 = imported(file(base()));
    const hero = find(cur0, 'Hero')!;
    const cur: Artboard = {
      ...edit(cur0, 'Hero', { bindings: { opacity: 'amount' } }),
      timelines: [{ id: 'tl1', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'tr1', nodeId: hero.id, prop: 'x', keys: [] }] }],
    };
    const spec = base();
    spec[2] = { ...spec[2], x: 99 };
    const nx = file(spec);
    const r = reconcileArtboard(cur, nx.artboard, nx.hashes);
    expect(r.artboard.timelines).toBe(cur.timelines);
    expect(r.artboard.logic).toBe(cur.logic);
    expect(find(r.artboard, 'Hero')).toMatchObject({ x: 99, bindings: { opacity: 'amount' } });
    expect(find(r.artboard, 'Background')).toBe(find(cur, 'Background'));
  });

  it('moves the baseline forward so the next change is judged against this file', () => {
    const cur = imported(file(base()));
    const s1 = base();
    s1[2] = { ...s1[2], x: 70 };
    const f1 = file(s1);
    const r1 = reconcileArtboard(cur, f1.artboard, f1.hashes);
    expect(r1.artboard.source!.baseline![find(r1.artboard, 'Hero')!.id].h.x).toBe(baselineOf(f1.artboard, f1.hashes)[find(f1.artboard, 'Hero')!.id].h.x);
    const s2 = base();
    s2[2] = { ...s2[2], x: 80 };
    const f2 = file(s2);
    const r2 = reconcileArtboard(r1.artboard, f2.artboard, f2.hashes);
    expect(find(r2.artboard, 'Hero')!.x).toBe(80);
    // and a user edit after the first update is protected in the second
    const edited = edit(r1.artboard, 'Hero', { x: 5 });
    const r3 = reconcileArtboard(edited, f2.artboard, f2.hashes);
    expect(find(r3.artboard, 'Hero')!.x).toBe(5);
  });

  it('is deterministic and the baseline stays small', () => {
    const f = file(base());
    expect(stable(imported(f).source)).toBe(stable(imported(f).source));
    const s = imported(f).source!;
    expect(Object.keys(s.baseline!)).toHaveLength(6);
    expect(JSON.stringify(s).length).toBeLessThan(6 * 700);
  });
});
