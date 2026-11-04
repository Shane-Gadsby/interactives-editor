import { describe, expect, it } from 'vitest';
import { applyConstraints, apply, worldMatrices, walk, type BoneNode, type PathNode, type SceneNode, type ImageNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { RIVE_CLASSES } from '../src/lib/rive-defs';

type Spec = [string, Record<string, unknown>];

/** A minimal .riv writer: header, an empty property table, then objects as typeKey + key/value pairs. */
function writeRiv(objects: Spec[]): Uint8Array {
  const out: number[] = [];
  const varuint = (n: number) => {
    do {
      let b = n & 0x7f;
      n = Math.floor(n / 128);
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
  };
  const find = (cls: string, prop: string): [number, string] => {
    for (let c: string | undefined = cls; c && RIVE_CLASSES[c]; c = RIVE_CLASSES[c][1]) {
      const p = RIVE_CLASSES[c][2][prop];
      if (p) return [p[0], p[1]];
    }
    throw new Error(`${cls}.${prop} is not defined`);
  };
  out.push(...Array.from('RIVE', (c) => c.charCodeAt(0)));
  varuint(7);
  varuint(0);
  varuint(0);
  varuint(0);
  for (const [cls, props] of objects) {
    varuint(RIVE_CLASSES[cls][0]);
    for (const [name, v] of Object.entries(props)) {
      const [key, type] = find(cls, name);
      varuint(key);
      if (type === 'f') out.push(...new Uint8Array(new Float32Array([Number(v)]).buffer));
      else if (type === 's') {
        const b = new TextEncoder().encode(String(v));
        varuint(b.length);
        out.push(...b);
      } else if (type === 'y') {
        const b = v as Uint8Array;
        varuint(b.length);
        out.push(...b);
      } else if (type === 'c') out.push(...new Uint8Array(new Uint32Array([Number(v)]).buffer));
      else varuint(typeof v === 'boolean' ? Number(v) : Number(v));
    }
    varuint(0);
  }
  return new Uint8Array(out);
}

const propKey = (cls: string, prop: string): number => {
  for (let c: string | undefined = cls; c && RIVE_CLASSES[c]; c = RIVE_CLASSES[c][1]) {
    const p = RIVE_CLASSES[c][2][prop];
    if (p) return p[0];
  }
  throw new Error(`${cls}.${prop} is not defined`);
};

const near = (a: number, b: number, d = 0.02) => expect(Math.abs(a - b)).toBeLessThan(d);
const all = (list: SceneNode[]): SceneNode[] => {
  const out: SceneNode[] = [];
  walk(list, (n) => out.push(n));
  return out;
};

/**
 * Slots: 1 Root bone at (100, 100) 100 long, 2 Fore bone 100 long (at Root's tip), 3 Shape, 4 path, 5 + 6 its points
 * (on each bone's midpoint), 7 Skin, 8 + 9 tendons (bind poses of the two bones), 10 + 11 weights, 12 Goal node.
 */
function rig(extra: Spec[] = []): Uint8Array {
  return writeRiv([
    ['Artboard', { name: 'Main', width: 400, height: 300 }],
    ['RootBone', { name: 'Root', x: 100, y: 100, length: 100, parentId: 0 }],
    ['Bone', { name: 'Fore', length: 100, parentId: 1 }],
    ['Shape', { name: 'Skinned', parentId: 0 }],
    ['PointsPath', { isClosed: false, parentId: 3 }],
    ['StraightVertex', { x: 150, y: 100, parentId: 4 }],
    ['StraightVertex', { x: 250, y: 100, parentId: 4 }],
    ['Skin', { parentId: 4 }],
    ['Tendon', { boneId: 1, tx: 100, ty: 100, parentId: 7 }],
    ['Tendon', { boneId: 2, tx: 200, ty: 100, parentId: 7 }],
    ['Weight', { values: 255, indices: 1, parentId: 5 }],
    ['Weight', { values: 255, indices: 2, parentId: 6 }],
    ['Node', { name: 'Goal', x: 150, y: 170, parentId: 0 }],
    ...extra,
  ]);
}

describe('Rive bones, skins and constraints', () => {
  it('imports bones as a chain: a child sits at its parent\'s tip', async () => {
    const res = await importRive(rig(), 'rig');
    const bones = all(res.artboards[0].children).filter((n): n is BoneNode => n.type === 'bone');
    expect(bones.map((b) => b.name)).toEqual(['Root', 'Fore']);
    expect(bones[0]).toMatchObject({ x: 100, y: 100, width: 100, originX: 0, originY: 0 });
    expect(bones[0].children).toContain(bones[1]);
    expect(bones[1]).toMatchObject({ x: 100, y: 0, width: 100 });
    expect(res.warnings.some((w) => /Bones and skinning are not supported/.test(w))).toBe(false);
    expect(res.warnings.some((w) => /Bone-weighted/.test(w))).toBe(false);
  });

  it('skins the path: still in its rest shape, and bends with the bones', async () => {
    const res = await importRive(rig(), 'rig');
    const kids = res.artboards[0].children;
    const path = all(kids).find((n): n is PathNode => n.type === 'path')!;
    expect(path.skin!.bones).toHaveLength(2);
    expect(path.skin!.weights[0].map((v) => v.w)).toEqual([[{ b: 0, w: 1 }], [{ b: 1, w: 1 }]]);
    const rest = applyConstraints(kids);
    const restPath = all(rest).find((n) => n.type === 'path') as PathNode;
    path.paths[0].points.forEach((p, i) => {
      near(restPath.paths[0].points[i].x, p.x);
      near(restPath.paths[0].points[i].y, p.y);
    });
    // Turn the forearm a quarter turn: its point (50 along it) swings from (250, 100) to (200, 150)
    const fore = all(kids).find((n) => n.name === 'Fore')!;
    fore.rotation = 90;
    const bent = all(applyConstraints(kids)).find((n) => n.type === 'path') as PathNode;
    const w = worldMatrices(applyConstraints(kids));
    const p1 = apply(w.get(bent.id)!, bent.paths[0].points[1].x, bent.paths[0].points[1].y);
    near(p1.x, 200);
    near(p1.y, 150);
    // The point on the root bone stays where it was
    const p0 = apply(w.get(bent.id)!, bent.paths[0].points[0].x, bent.paths[0].points[0].y);
    near(p0.x, 150);
    near(p0.y, 100);
  });

  it('turns an IK constraint into a two-bone chain that reaches its target', async () => {
    // parentBoneCount 1: the Fore bone and its parent
    const res = await importRive(rig([['IKConstraint', { parentId: 2, targetId: 12, parentBoneCount: 1, strength: 1 }]]), 'ik');
    const kids = res.artboards[0].children;
    const fore = all(kids).find((n) => n.name === 'Fore') as BoneNode;
    expect(fore.constraints).toHaveLength(1);
    expect(fore.constraints![0]).toMatchObject({ type: 'ik', bones: 2, strength: 1 });
    expect(fore.constraints![0].invertBend).toBeUndefined();
    expect(res.warnings.some((w) => /IK/.test(w))).toBe(false);
    const out = applyConstraints(kids);
    const w = worldMatrices(out);
    const f = all(out).find((n) => n.name === 'Fore') as BoneNode;
    const tip = apply(w.get(f.id)!, f.width, 0);
    const goal = all(out).find((n) => n.name === 'Goal')!;
    near(tip.x, goal.x);
    near(tip.y, goal.y);
  });

  it('keeps IK\'s inverted direction and a keyed strength', async () => {
    const file = rig([
      ['IKConstraint', { parentId: 2, targetId: 12, parentBoneCount: 1, invertDirection: true, strength: 0.5 }],
      ['LinearAnimation', { name: 'Reach', duration: 60, fps: 60 }],
      ['KeyedObject', { objectId: 13 }],
      ['KeyedProperty', { propertyKey: propKey('IKConstraint', 'strength') }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 1, interpolationType: 1 }],
    ]);
    const res = await importRive(file, 'ik2');
    const fore = all(res.artboards[0].children).find((n) => n.name === 'Fore') as BoneNode;
    expect(fore.constraints![0]).toMatchObject({ type: 'ik', invertBend: true, strength: 0.5 });
    const tr = res.artboards[0].timelines[0].tracks.find((t) => t.prop === 'constraints.0.strength');
    expect(tr?.nodeId).toBe(fore.id);
    expect(tr?.keys.map((k) => k.value)).toEqual([0, 1]);
  });

  it('imports a distance constraint with its mode', async () => {
    const res = await importRive(rig([['DistanceConstraint', { parentId: 12, targetId: 1, distance: 80, modeValue: 2, strength: 1 }]]), 'dist');
    const goal = all(res.artboards[0].children).find((n) => n.name === 'Goal')!;
    expect(goal.constraints![0]).toMatchObject({ type: 'distance', distance: 80, mode: 'exact' });
    const out = applyConstraints(res.artboards[0].children);
    const g = all(out).find((n) => n.name === 'Goal')!;
    // Eighty from the root bone's base at (100, 100)
    near(Math.hypot(g.x - 100, g.y - 100), 80);
  });

  it('moves a child bone when its parent\'s length is keyed', async () => {
    const file = rig([
      ['LinearAnimation', { name: 'Grow', duration: 60, fps: 60 }],
      ['KeyedObject', { objectId: 1 }],
      ['KeyedProperty', { propertyKey: propKey('Bone', 'length') }],
      ['KeyFrameDouble', { frame: 0, value: 100, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 150, interpolationType: 1 }],
      ['KeyedObject', { objectId: 1 }],
      ['KeyedProperty', { propertyKey: propKey('Node', 'rotation') }],
      ['KeyFrameDouble', { frame: 0, value: 0, interpolationType: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 1, interpolationType: 1 }],
    ]);
    const res = await importRive(file, 'len');
    const ab = res.artboards[0];
    const [root, fore] = ['Root', 'Fore'].map((n) => all(ab.children).find((x) => x.name === n)!);
    const tl = ab.timelines[0];
    expect(tl.tracks.find((t) => t.nodeId === root.id && t.prop === 'width')?.keys.map((k) => k.value)).toEqual([100, 150]);
    expect(tl.tracks.find((t) => t.nodeId === fore.id && t.prop === 'x')?.keys.map((k) => k.value)).toEqual([100, 150]);
    const rot = tl.tracks.find((t) => t.nodeId === root.id && t.prop === 'rotation');
    near(Number(rot!.keys[1].value), (1 * 180) / Math.PI, 0.1);
  });

  it('imports an image mesh with its skin', async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png[19] = 100; // width 100
    png[23] = 50; // height 50
    // Slots: 1 Root bone, 2 Image, 3 Mesh, 4-7 vertices, 8 Skin, 9 Tendon, 10-13 weights
    const file = writeRiv([
      ['ImageAsset', { name: 'pic', width: 100, height: 50 }],
      ['FileAssetContents', { bytes: png }],
      ['Artboard', { name: 'Main', width: 300, height: 300 }],
      ['RootBone', { name: 'Root', x: 20, y: 30, length: 100, parentId: 0 }],
      ['Image', { name: 'Picture', assetId: 0, originX: 0, originY: 0, x: 20, y: 30, parentId: 0 }],
      ['Mesh', { triangleIndexBytes: new Uint8Array([0, 1, 2, 0, 2, 3]), parentId: 2 }],
      ['MeshVertex', { x: 0, y: 0, u: 0, v: 0, parentId: 3 }],
      ['MeshVertex', { x: 100, y: 0, u: 1, v: 0, parentId: 3 }],
      ['MeshVertex', { x: 100, y: 50, u: 1, v: 1, parentId: 3 }],
      ['MeshVertex', { x: 0, y: 50, u: 0, v: 1, parentId: 3 }],
      ['Skin', { tx: 20, ty: 30, parentId: 3 }],
      ['Tendon', { boneId: 1, tx: 20, ty: 30, parentId: 8 }],
      ['Weight', { parentId: 4 }],
      ['Weight', { parentId: 5 }],
      ['Weight', { parentId: 6 }],
      ['Weight', { parentId: 7 }],
    ]);
    const res = await importRive(file, 'mesh');
    const img = all(res.artboards[0].children).find((n): n is ImageNode => n.type === 'image')!;
    expect(img.mesh!.vertices).toHaveLength(4);
    expect(img.mesh!.vertices[2]).toMatchObject({ x: 100, y: 50, u: 1, v: 1 });
    expect(img.mesh!.triangles).toEqual([0, 1, 2, 0, 2, 3]);
    expect(img.mesh!.skin!.bones).toHaveLength(1);
    expect(img.mesh!.skin!.weights[0]).toHaveLength(4);
    // Bound in the rest pose, the mesh stays where it is; turning the bone turns the picture about its base
    const kids = res.artboards[0].children;
    const rest = all(applyConstraints(kids)).find((n) => n.type === 'image') as ImageNode;
    near(rest.mesh!.vertices[2].x, 100);
    near(rest.mesh!.vertices[2].y, 50);
    all(kids).find((n) => n.type === 'bone')!.rotation = 90;
    const turned = all(applyConstraints(kids)).find((n) => n.type === 'image') as ImageNode;
    // Local (100, 50) is 100 along and 50 down from the base: a quarter turn puts it 50 left and 100 down
    near(turned.mesh!.vertices[2].x, -50);
    near(turned.mesh!.vertices[2].y, 100);
  });
});
