/**
 * Rive runtime file (.riv, format major 7) -> Interactives artboards.
 *
 * Reads the documented binary container (header, property table of contents,
 * objects as typeKey + key/value properties) using the type definitions in
 * rive-defs.ts, rebuilds each artboard's component tree, and maps it onto our
 * model:
 *   - Node/Solo/LayoutComponent -> group; Shape -> path (or rect/ellipse when
 *     it is a single plain one), with fills/strokes/gradients; Text; Image;
 *     NestedArtboard -> a copy of that artboard's layers
 *   - LinearAnimation -> timeline (transforms, opacity, sizes, colours,
 *     stroke widths, text, with hold/linear/cubic/elastic easing)
 *   - State machines -> variables (bool/number inputs), messages (triggers),
 *     pointer listeners -> pointer events, and transitions -> flows that play
 *     the target state's timeline
 * Bones/meshes, constraints, clipping, data binding, events, audio, scripted
 * and layout-computed geometry are reported in `warnings`.
 */
import {
  createArtboard,
  createNode,
  uid,
  cloneWithNewIds,
  defaultParams,
  type Artboard,
  type Easing,
  type FontRef,
  type Keyframe,
  type LogicEdge,
  type LogicNode,
  type Paint,
  type PathPoint,
  type SceneNode,
  type Stroke,
  type SubPath,
  type Timeline,
  type Track,
  type Variable,
} from 'interactives-player';
import { RIVE_CLASSES } from './rive-defs';
import type { ImportedAsset } from './lottie-import';

export interface RiveImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  variables: Variable[];
  fonts: FontRef[];
  warnings: string[];
}

// ---------------------------------------------------------------- definitions

interface PropDef {
  name: string;
  type: string;
  def?: number | boolean;
}

const typeByKey = new Map<number, string>();
const propsByClass = new Map<string, Map<number, PropDef>>();
const propNameByKey = new Map<number, PropDef>();
for (const [name, [key, , props]] of Object.entries(RIVE_CLASSES)) {
  if (key >= 0) typeByKey.set(key, name);
  for (const [p, [k, t, d]] of Object.entries(props)) if (!propNameByKey.has(k)) propNameByKey.set(k, { name: p, type: t, def: d });
}

function classProps(cls: string): Map<number, PropDef> {
  let m = propsByClass.get(cls);
  if (m) return m;
  m = new Map();
  let c: string | undefined = cls;
  while (c && RIVE_CLASSES[c]) {
    for (const [p, [k, t, d]] of Object.entries(RIVE_CLASSES[c][2])) if (!m.has(k)) m.set(k, { name: p, type: t, def: d });
    c = RIVE_CLASSES[c][1];
  }
  propsByClass.set(cls, m);
  return m;
}

const isACache = new Map<string, boolean>();
function isA(cls: string, base: string): boolean {
  const key = `${cls}>${base}`;
  let v = isACache.get(key);
  if (v === undefined) {
    let c: string | undefined = cls;
    v = false;
    while (c && RIVE_CLASSES[c]) {
      if (c === base) {
        v = true;
        break;
      }
      c = RIVE_CLASSES[c][1];
    }
    isACache.set(key, v);
  }
  return v;
}

function defaultOf(cls: string, prop: string): number | boolean | string | undefined {
  for (const d of classProps(cls).values()) if (d.name === prop) return d.def ?? (d.type === 's' ? '' : d.type === 'b' ? false : 0);
  return undefined;
}

// ---------------------------------------------------------------- reading

interface RObj {
  type: string;
  props: Record<string, unknown>;
}

function get<T = number>(o: RObj, prop: string): T {
  return (prop in o.props ? o.props[prop] : defaultOf(o.type, prop)) as T;
}

class Reader {
  pos = 0;
  private readonly view: DataView;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get done(): boolean {
    return this.pos >= this.bytes.length;
  }
  varuint(): number {
    let r = 0;
    let s = 0;
    for (;;) {
      if (this.pos >= this.bytes.length) throw new Error('Unexpected end of .riv file');
      const b = this.bytes[this.pos++];
      r += (b & 0x7f) * Math.pow(2, s);
      s += 7;
      if (b < 0x80) return r;
    }
  }
  float(): number {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  uint32(): number {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  bytesOf(n: number): Uint8Array {
    const v = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  string(): string {
    return new TextDecoder().decode(this.bytesOf(this.varuint()));
  }
}

const TOC_TYPES = ['u', 's', 'f', 'c'];

function readObjects(bytes: Uint8Array): { objects: RObj[]; version: string } {
  const r = new Reader(bytes);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIVE') throw new Error('Not a Rive file (no RIVE header)');
  r.pos = 4;
  const major = r.varuint();
  const minor = r.varuint();
  if (major !== 7) throw new Error(`Rive format ${major}.${minor} is not supported (this importer reads major version 7)`);
  r.varuint(); // file id
  const toc: number[] = [];
  for (let k = r.varuint(); k !== 0; k = r.varuint()) toc.push(k);
  const tocType = new Map<number, string>();
  let cur = 0;
  let bit = 8;
  for (const k of toc) {
    if (bit === 8) {
      cur = r.uint32();
      bit = 0;
    }
    tocType.set(k, TOC_TYPES[(cur >>> bit) & 3]);
    bit += 2;
  }
  const objects: RObj[] = [];
  while (!r.done) {
    const typeKey = r.varuint();
    const type = typeByKey.get(typeKey) ?? `#${typeKey}`;
    const known = classProps(type);
    const props: Record<string, unknown> = {};
    for (let k = r.varuint(); k !== 0; k = r.varuint()) {
      const def = known.get(k) ?? propNameByKey.get(k);
      // The file's own table of contents says how to read anything this build doesn't know.
      let t = def?.type ?? tocType.get(k);
      if (!t) throw new Error(`Unknown property ${k} on ${type}; the file is newer than this importer`);
      if (!def && t) t = tocType.get(k)!;
      let v: unknown;
      switch (t) {
        case 'f':
          v = r.float();
          break;
        case 'c':
          v = r.uint32();
          break;
        case 's':
          v = r.string();
          break;
        case 'y':
          v = r.bytesOf(r.varuint());
          break;
        case 'b':
          v = r.varuint() !== 0;
          break;
        default:
          v = r.varuint();
      }
      props[def?.name ?? String(k)] = v;
    }
    objects.push({ type, props });
  }
  return { objects, version: `${major}.${minor}` };
}

// ---------------------------------------------------------------- file structure

interface RTransition {
  obj: RObj;
  conditions: RObj[];
}
interface RState {
  obj: RObj;
  transitions: RTransition[];
}
interface RLayer {
  obj: RObj;
  states: RState[];
}
interface RListener {
  obj: RObj;
  actions: RObj[];
}
interface RMachine {
  obj: RObj;
  inputs: RObj[];
  layers: RLayer[];
  listeners: RListener[];
}
interface RKeyedProperty {
  obj: RObj;
  keys: RObj[];
}
interface RKeyedObject {
  obj: RObj;
  props: RKeyedProperty[];
}
interface RAnim {
  obj: RObj;
  keyed: RKeyedObject[];
}
interface RArtboard {
  obj: RObj;
  slots: RObj[];
  anims: RAnim[];
  machines: RMachine[];
}
interface RAsset {
  obj: RObj;
  bytes: Uint8Array | null;
}

function claimsSlot(type: string): boolean {
  return (isA(type, 'Component') && type !== 'Artboard') || isA(type, 'KeyFrameInterpolator');
}

function structure(objects: RObj[]): { artboards: RArtboard[]; assets: RAsset[]; warnings: Set<string> } {
  const artboards: RArtboard[] = [];
  const assets: RAsset[] = [];
  const warnings = new Set<string>();
  let ab: RArtboard | null = null;
  let anim: RAnim | null = null;
  let ko: RKeyedObject | null = null;
  let kp: RKeyedProperty | null = null;
  let sm: RMachine | null = null;
  let layer: RLayer | null = null;
  let state: RState | null = null;
  let transition: RTransition | null = null;
  let listener: RListener | null = null;
  let asset: RAsset | null = null;
  for (const o of objects) {
    const t = o.type;
    if (t === 'Artboard') {
      ab = { obj: o, slots: [o], anims: [], machines: [] };
      artboards.push(ab);
      anim = ko = kp = null;
      sm = null;
      continue;
    }
    if (isA(t, 'FileAsset')) {
      asset = { obj: o, bytes: null };
      assets.push(asset);
      continue;
    }
    if (t === 'FileAssetContents') {
      if (asset) asset.bytes = get<Uint8Array>(o, 'bytes');
      continue;
    }
    if (!ab) continue;
    if (claimsSlot(t)) {
      ab.slots.push(o);
      continue;
    }
    if (t === 'LinearAnimation') {
      anim = { obj: o, keyed: [] };
      ab.anims.push(anim);
    } else if (t === 'KeyedObject' && anim) {
      ko = { obj: o, props: [] };
      anim.keyed.push(ko);
    } else if (t === 'KeyedProperty' && ko) {
      kp = { obj: o, keys: [] };
      ko.props.push(kp);
    } else if (isA(t, 'KeyFrame') && kp) kp.keys.push(o);
    else if (t === 'StateMachine') {
      sm = { obj: o, inputs: [], layers: [], listeners: [] };
      ab.machines.push(sm);
    } else if (isA(t, 'StateMachineInput') && sm) sm.inputs.push(o);
    else if (t === 'StateMachineLayer' && sm) {
      layer = { obj: o, states: [] };
      sm.layers.push(layer);
    } else if (isA(t, 'LayerState') && layer) {
      state = { obj: o, transitions: [] };
      layer.states.push(state);
    } else if (isA(t, 'StateTransition') && state) {
      transition = { obj: o, conditions: [] };
      state.transitions.push(transition);
    } else if (isA(t, 'TransitionCondition') && transition) transition.conditions.push(o);
    else if (isA(t, 'StateMachineListener') && sm) {
      listener = { obj: o, actions: [] };
      sm.listeners.push(listener);
    } else if (isA(t, 'ListenerAction') && listener) listener.actions.push(o);
    else if (isA(t, 'DataBind') || isA(t, 'ViewModel') || isA(t, 'ViewModelInstance') || isA(t, 'ViewModelInstanceValue') || isA(t, 'ViewModelProperty')) warnings.add('Data binding (view models) is not imported; use Interactives variables and bindings instead');
  }
  return { artboards, assets, warnings };
}

// ---------------------------------------------------------------- geometry helpers

const r2 = (n: number) => Math.round(n * 100) / 100;
const DEG = 180 / Math.PI;
const K = 0.5523;

function argb(c: number): string {
  const a = ((c >>> 24) & 255) / 255;
  const rgb = [(c >>> 16) & 255, (c >>> 8) & 255, c & 255].map((v) => v.toString(16).padStart(2, '0')).join('');
  return a >= 1 ? `#${rgb}` : `#${rgb}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
}

type M = [number, number, number, number, number, number];
function localMatrix(o: RObj): M {
  const x = get(o, 'x') ?? 0;
  const y = get(o, 'y') ?? 0;
  const rot = get(o, 'rotation') ?? 0;
  const sx = get(o, 'scaleX') ?? 1;
  const sy = get(o, 'scaleY') ?? 1;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}
const ap = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const av = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y });

function rectPoints(w: number, h: number, ox: number, oy: number, radius: number): PathPoint[] {
  const x0 = -w * ox;
  const y0 = -h * oy;
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (!r) return [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
  const k = r * K;
  return [
    { x: x0 + r, y: y0, in: { x: -k, y: 0 } },
    { x: x0 + w - r, y: y0, out: { x: k, y: 0 } },
    { x: x0 + w, y: y0 + r, in: { x: 0, y: -k } },
    { x: x0 + w, y: y0 + h - r, out: { x: 0, y: k } },
    { x: x0 + w - r, y: y0 + h, in: { x: k, y: 0 } },
    { x: x0 + r, y: y0 + h, out: { x: -k, y: 0 } },
    { x: x0, y: y0 + h - r, in: { x: 0, y: k } },
    { x: x0, y: y0 + r, out: { x: 0, y: -k } },
  ];
}

function ellipsePoints(w: number, h: number, ox: number, oy: number): PathPoint[] {
  const cx = w * (0.5 - ox);
  const cy = h * (0.5 - oy);
  const rx = w / 2;
  const ry = h / 2;
  return [
    { x: cx, y: cy - ry, in: { x: -rx * K, y: 0 }, out: { x: rx * K, y: 0 } },
    { x: cx + rx, y: cy, in: { x: 0, y: -ry * K }, out: { x: 0, y: ry * K } },
    { x: cx, y: cy + ry, in: { x: rx * K, y: 0 }, out: { x: -rx * K, y: 0 } },
    { x: cx - rx, y: cy, in: { x: 0, y: ry * K }, out: { x: 0, y: -ry * K } },
  ];
}

function polyPoints(n: number, w: number, h: number, ox: number, oy: number, inner: number | null): PathPoint[] {
  const cx = w * (0.5 - ox);
  const cy = h * (0.5 - oy);
  const count = inner === null ? Math.max(3, n) : Math.max(3, n) * 2;
  const pts: PathPoint[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const k = inner !== null && i % 2 ? inner : 1;
    pts.push({ x: cx + (Math.cos(a) * w * k) / 2, y: cy + (Math.sin(a) * h * k) / 2 });
  }
  return pts;
}

function vertexPoints(verts: RObj[]): PathPoint[] {
  return verts.map((v) => {
    const x = get(v, 'x');
    const y = get(v, 'y');
    const p: PathPoint = { x, y };
    if (v.type === 'CubicDetachedVertex') {
      p.in = { x: Math.cos(get(v, 'inRotation')) * get(v, 'inDistance'), y: Math.sin(get(v, 'inRotation')) * get(v, 'inDistance') };
      p.out = { x: Math.cos(get(v, 'outRotation')) * get(v, 'outDistance'), y: Math.sin(get(v, 'outRotation')) * get(v, 'outDistance') };
    } else if (v.type === 'CubicMirroredVertex') {
      const d = get(v, 'distance');
      const r = get(v, 'rotation');
      p.out = { x: Math.cos(r) * d, y: Math.sin(r) * d };
      p.in = { x: -p.out.x, y: -p.out.y };
    } else if (v.type === 'CubicAsymmetricVertex') {
      const r = get(v, 'rotation');
      p.out = { x: Math.cos(r) * get(v, 'outDistance'), y: Math.sin(r) * get(v, 'outDistance') };
      p.in = { x: -Math.cos(r) * get(v, 'inDistance'), y: -Math.sin(r) * get(v, 'inDistance') };
    }
    return p;
  });
}

/** Width/height of PNG, JPEG, GIF or WebP bytes. */
function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] === 0x89 && b[1] === 0x50) return { width: v.getUint32(16), height: v.getUint32(20) };
  if (b[0] === 0x47 && b[1] === 0x49) return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = v.getUint16(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...b.subarray(12, 16));
    if (kind === 'VP8 ') return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = v.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

function mimeOf(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  if ((b[0] === 0x00 && b[1] === 0x01) || String.fromCharCode(...b.subarray(0, 4)) === 'OTTO' || String.fromCharCode(...b.subarray(0, 4)) === 'true') return 'font/ttf';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'wOF2') return 'font/woff2';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'wOFF') return 'font/woff';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------- conversion

/** How keyframes on a Rive object land on our layers. */
interface Target {
  nodeId: string;
  /** Rive property -> (our property, value transform). */
  map: Record<string, { prop: string; f: (v: unknown) => Keyframe['value'] } | undefined>;
}

interface ArtboardCtx {
  rab: RArtboard;
  children: Map<number, number[]>;
  targets: Map<number, Target[]>;
  nodeBySlot: Map<number, SceneNode>;
  /** Solo slot -> its child slots that became layers (for activeComponentId keys). */
  solos: Map<number, number[]>;
}

interface FileCtx {
  file: { artboards: RArtboard[]; assets: RAsset[] };
  warnings: Set<string>;
  assets: ImportedAsset[];
  assetIdByIndex: Map<number, string>;
  fonts: FontRef[];
  built: Map<number, SceneNode[]>;
  building: Set<number>;
}

function addTarget(ac: ArtboardCtx, slot: number, t: Target): void {
  const list = ac.targets.get(slot) ?? [];
  list.push(t);
  ac.targets.set(slot, list);
}

const num = (f: (n: number) => number = (n) => n) => (v: unknown) => r2(f(Number(v)));

/** Our node placed at a Rive node's origin: our local (0,0) maps to Rive local `b`. */
function placeAtOrigin(n: SceneNode, o: RObj, b: { x: number; y: number }, w: number, h: number): void {
  n.width = Math.max(0.01, r2(w));
  n.height = Math.max(0.01, r2(h));
  n.x = r2(get(o, 'x') + b.x);
  n.y = r2(get(o, 'y') + b.y);
  n.originX = w ? -b.x / w : 0;
  n.originY = h ? -b.y / h : 0;
  n.rotation = r2(get(o, 'rotation') * DEG);
  n.scaleX = r2(get(o, 'scaleX'));
  n.scaleY = r2(get(o, 'scaleY'));
  n.opacity = r2(get(o, 'opacity'));
}

/** Transform keys on a Rive node onto our node, whose x/y sit `b` away from Rive's. */
function transformTarget(n: SceneNode, b: { x: number; y: number }): Target {
  return {
    nodeId: n.id,
    map: {
      x: { prop: 'x', f: num((v) => v + b.x) },
      y: { prop: 'y', f: num((v) => v + b.y) },
      rotation: { prop: 'rotation', f: num((v) => v * DEG) },
      scaleX: { prop: 'scaleX', f: num() },
      scaleY: { prop: 'scaleY', f: num() },
      opacity: { prop: 'opacity', f: num() },
    },
  };
}

function paintOf(ac: ArtboardCtx, fc: FileCtx, paintSlot: number, shapeBox: { x: number; y: number; w: number; h: number } | null): { paint: Paint | null; colorSlot: number | null } {
  for (const ci of ac.children.get(paintSlot) ?? []) {
    const c = ac.rab.slots[ci];
    if (c.type === 'SolidColor') return { paint: { type: 'solid', color: argb(get(c, 'colorValue')) }, colorSlot: ci };
    if (c.type === 'LinearGradient' || c.type === 'RadialGradient') {
      const stops = (ac.children.get(ci) ?? [])
        .map((i) => ac.rab.slots[i])
        .filter((s) => s.type === 'GradientStop')
        .map((s) => ({ offset: r2(get(s, 'position')), color: argb(get(s, 'colorValue')) }));
      if (c.type === 'RadialGradient') return { paint: { type: 'radial', stops }, colorSlot: null };
      const angle = Math.atan2(get(c, 'endY') - get(c, 'startY'), get(c, 'endX') - get(c, 'startX')) * DEG + 90;
      void shapeBox;
      fc.warnings.add('Gradients are mapped to CSS-style gradients across the layer box; exact start/end points may differ');
      return { paint: { type: 'linear', angle: r2(angle), stops }, colorSlot: null };
    }
  }
  return { paint: null, colorSlot: null };
}

function convertShape(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const kids = (ac.children.get(slot) ?? []).map((i) => ({ i, o: ac.rab.slots[i] }));
  const paths = kids.filter((k) => isA(k.o.type, 'Path'));
  const fills = kids.filter((k) => k.o.type === 'Fill' && get<boolean>(k.o, 'isVisible') !== false);
  const strokes = kids.filter((k) => k.o.type === 'Stroke' && get<boolean>(k.o, 'isVisible') !== false);
  if (fills.length > 1 || strokes.length > 1) fc.warnings.add('Shapes with several fills or strokes keep only the first of each');
  const fillInfo = fills[0] ? paintOf(ac, fc, fills[0].i, null) : { paint: null, colorSlot: null };
  const strokeInfo = strokes[0] ? paintOf(ac, fc, strokes[0].i, null) : { paint: null, colorSlot: null };
  const stroke: Stroke | null = strokes[0] && strokeInfo.paint ? { paint: strokeInfo.paint, width: r2(get(strokes[0].o, 'thickness')) } : null;
  const fill = fillInfo.paint;
  const name = String(o.props.name ?? 'Shape');

  const plain = paths.length === 1 && (paths[0].o.type === 'Rectangle' || paths[0].o.type === 'Ellipse') && !get(paths[0].o, 'x') && !get(paths[0].o, 'y') && !get(paths[0].o, 'rotation') && get(paths[0].o, 'scaleX') === 1 && get(paths[0].o, 'scaleY') === 1;
  let node: SceneNode;
  if (plain) {
    const p = paths[0].o;
    const w = get(p, 'width');
    const h = get(p, 'height');
    const ox = get(p, 'originX');
    const oy = get(p, 'originY');
    node =
      p.type === 'Rectangle'
        ? createNode('rect', { name, fill, stroke, cornerRadius: r2(get(p, 'cornerRadiusTL')) })
        : createNode('ellipse', { name, fill, stroke });
    placeAtOrigin(node, o, { x: -w * ox, y: -h * oy }, w, h);
    node.originX = ox;
    node.originY = oy;
    addTarget(ac, slot, transformTarget(node, { x: -w * ox, y: -h * oy }));
    // Size keys: our box grows from its top-left, Rive's around its origin, so x/y follow (with the shape's static x/y).
    addTarget(ac, paths[0].i, {
      nodeId: node.id,
      map: {
        width: { prop: 'width', f: num() },
        height: { prop: 'height', f: num() },
        cornerRadiusTL: { prop: 'cornerRadius', f: num() },
      },
    });
    if (ox || oy) sizeFollowers.push({ nodeId: node.id, pathSlot: paths[0].i, ox, oy, sx: get(o, 'x'), sy: get(o, 'y') });
  } else {
    const subs: SubPath[] = [];
    for (const { i, o: p } of paths) {
      const m = localMatrix(p);
      let pts: PathPoint[] = [];
      const w = get(p, 'width');
      const h = get(p, 'height');
      const ox = get(p, 'originX');
      const oy = get(p, 'originY');
      let closed = true;
      if (p.type === 'Rectangle') pts = rectPoints(w, h, ox, oy, get(p, 'cornerRadiusTL'));
      else if (p.type === 'Ellipse') pts = ellipsePoints(w, h, ox, oy);
      else if (p.type === 'Star') pts = polyPoints(get(p, 'points'), w, h, ox, oy, get(p, 'innerRadius'));
      else if (p.type === 'Polygon') pts = polyPoints(get(p, 'points'), w, h, ox, oy, null);
      else if (p.type === 'Triangle') pts = [{ x: w * (0.5 - ox), y: -h * oy }, { x: w * (1 - ox), y: h * (1 - oy) }, { x: -w * ox, y: h * (1 - oy) }];
      else if (isA(p.type, 'PointsCommonPath')) {
        const verts = (ac.children.get(i) ?? []).map((vi) => ac.rab.slots[vi]).filter((v) => isA(v.type, 'Vertex'));
        if (verts.some((v) => (ac.children.get(ac.rab.slots.indexOf(v)) ?? []).length)) fc.warnings.add('Bone-weighted (skinned) paths are imported in their rest pose');
        pts = vertexPoints(verts);
        closed = !!get<boolean>(p, 'isClosed');
      }
      if (pts.length < 2) continue;
      subs.push({
        closed,
        points: pts.map((q) => {
          const a = ap(m, q.x, q.y);
          const inV = q.in ? av(m, q.in.x, q.in.y) : null;
          const outV = q.out ? av(m, q.out.x, q.out.y) : null;
          return { x: a.x, y: a.y, in: inV, out: outV };
        }),
      });
    }
    if (!subs.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sp of subs)
      for (const p of sp.points)
        for (const [x, y] of [
          [p.x, p.y],
          [p.x + (p.in?.x ?? 0), p.y + (p.in?.y ?? 0)],
          [p.x + (p.out?.x ?? 0), p.y + (p.out?.y ?? 0)],
        ]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
    const fillRule = fills[0] && get(fills[0].o, 'fillRule') === 1 ? 'evenodd' : 'nonzero';
    node = createNode('path', {
      name,
      fill,
      stroke,
      fillRule,
      lineCap: strokes[0] ? (['butt', 'round', 'square'] as const)[get(strokes[0].o, 'cap')] ?? 'butt' : 'round',
      lineJoin: strokes[0] ? (['miter', 'round', 'bevel'] as const)[get(strokes[0].o, 'join')] ?? 'miter' : 'round',
      paths: subs.map((sp) => ({
        closed: sp.closed,
        points: sp.points.map((p) => ({
          x: r2(p.x - minX),
          y: r2(p.y - minY),
          in: p.in ? { x: r2(p.in.x), y: r2(p.in.y) } : null,
          out: p.out ? { x: r2(p.out.x), y: r2(p.out.y) } : null,
        })),
      })),
    });
    placeAtOrigin(node, o, { x: minX, y: minY }, maxX - minX, maxY - minY);
    addTarget(ac, slot, transformTarget(node, { x: minX, y: minY }));
    for (const { i } of paths) addTarget(ac, i, { nodeId: node.id, map: {} });
  }
  if (fillInfo.colorSlot !== null) addTarget(ac, fillInfo.colorSlot, { nodeId: node.id, map: { colorValue: { prop: 'fill.color', f: (v) => argb(Number(v)) } } });
  if (strokeInfo.colorSlot !== null) addTarget(ac, strokeInfo.colorSlot, { nodeId: node.id, map: { colorValue: { prop: 'stroke.paint.color', f: (v) => argb(Number(v)) } } });
  if (strokes[0]) addTarget(ac, strokes[0].i, { nodeId: node.id, map: { thickness: { prop: 'stroke.width', f: num() } } });
  const blend = get(o, 'blendModeValue');
  const blendMap: Record<number, SceneNode['blendMode']> = { 14: 'screen', 15: 'overlay', 16: 'darken', 17: 'lighten', 18: 'color-dodge', 19: 'color-burn', 22: 'difference', 23: 'exclusion', 24: 'multiply' };
  if (blendMap[blend]) node.blendMode = blendMap[blend];
  return node;
}

/** Rectangles/ellipses with an origin other than top-left: x/y keys that follow their animated size. */
let sizeFollowers: { nodeId: string; pathSlot: number; ox: number; oy: number; sx: number; sy: number }[] = [];

function convertText(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode {
  const o = ac.rab.slots[slot];
  const runs = (ac.children.get(slot) ?? []).map((i) => ({ i, o: ac.rab.slots[i] })).filter((k) => k.o.type === 'TextValueRun');
  const textColorSlots: number[] = [];
  const text = runs.map((r) => String(get(r.o, 'text') ?? '')).join('');
  const style = runs[0] ? ac.rab.slots[Number(get(runs[0].o, 'styleId'))] : undefined;
  let color = '#000000';
  let fontSize = 16;
  let fontFamily = 'Inter, system-ui, sans-serif';
  let letterSpacing = 0;
  let lineHeight = 1.2;
  if (style) {
    fontSize = r2(get(style, 'fontSize') || 16);
    letterSpacing = r2(get(style, 'letterSpacing'));
    const lh = get(style, 'lineHeight');
    if (lh > 0) lineHeight = r2(lh / fontSize);
    const styleSlot = ac.rab.slots.indexOf(style);
    for (const pi of ac.children.get(styleSlot) ?? []) {
      if (ac.rab.slots[pi].type === 'Fill') {
        const info = paintOf(ac, fc, pi, null);
        if (info.paint?.type === 'solid') color = info.paint.color;
        if (info.colorSlot !== null) textColorSlots.push(info.colorSlot);
      }
    }
    const fontAsset = fc.file.assets[Number(get(style, 'fontAssetId'))];
    const fam = fontAsset ? String(get(fontAsset.obj, 'name') ?? '') : '';
    if (fam) fontFamily = `"${fam.replace(/\.[^.]+$/, '')}", system-ui, sans-serif`;
  }
  if (runs.length > 1) fc.warnings.add('Text with several styled runs uses the first run’s style for the whole text');
  const w = get(o, 'width') || 200;
  const h = get(o, 'height') || fontSize * lineHeight;
  const ox = get(o, 'originX');
  const oy = get(o, 'originY');
  const sizing = get(o, 'sizingValue');
  const align = (['left', 'right', 'center', 'justify'] as const)[get(o, 'alignValue')] ?? 'left';
  const node = createNode('text', {
    name: String(o.props.name ?? 'Text'),
    text,
    fontSize,
    fontFamily,
    color,
    letterSpacing,
    lineHeight,
    align,
    autoSize: sizing === 0 ? 'width' : sizing === 1 ? 'height' : 'none',
  });
  // originValue 1 = the text's y is its first baseline (about 0.95 em below the top of our line box)
  const baselineShift = get(o, 'originValue') === 1 ? -fontSize * 0.95 : 0;
  placeAtOrigin(node, o, { x: -w * ox, y: -h * oy + baselineShift }, w, h);
  addTarget(ac, slot, transformTarget(node, { x: -w * ox, y: -h * oy + baselineShift }));
  for (const r of runs) addTarget(ac, r.i, { nodeId: node.id, map: { text: { prop: 'text', f: (v) => String(v) } } });
  for (const cs of textColorSlots) addTarget(ac, cs, { nodeId: node.id, map: { colorValue: { prop: 'color', f: (v) => argb(Number(v)) } } });
  return node;
}

function convertImage(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const index = Number(get(o, 'assetId'));
  const asset = fc.file.assets[index];
  if (!asset?.bytes) {
    fc.warnings.add('Images not embedded in the .riv (referenced or hosted on the CDN) were skipped');
    return null;
  }
  let assetId = fc.assetIdByIndex.get(index);
  if (!assetId) {
    assetId = uid('as');
    fc.assetIdByIndex.set(index, assetId);
    const mime = mimeOf(asset.bytes);
    fc.assets.push({ id: assetId, name: String(get(asset.obj, 'name') || `image-${index}`), mime, bytes: asset.bytes.slice() });
  }
  const size = imageSize(asset.bytes) ?? { width: 100, height: 100 };
  const ox = get(o, 'originX');
  const oy = get(o, 'originY');
  const node = createNode('image', { name: String(o.props.name ?? 'Image'), assetId, fit: 'fill' });
  placeAtOrigin(node, o, { x: -size.width * ox, y: -size.height * oy }, size.width, size.height);
  addTarget(ac, slot, transformTarget(node, { x: -size.width * ox, y: -size.height * oy }));
  return node;
}

function convertSlot(ac: ArtboardCtx, fc: FileCtx, slot: number, abIndex: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const t = o.type;
  let node: SceneNode | null = null;
  if (isA(t, 'Shape')) node = convertShape(ac, fc, slot);
  else if (t === 'Text') node = convertText(ac, fc, slot);
  else if (t === 'Image') node = convertImage(ac, fc, slot);
  else if (t === 'NestedArtboard') {
    const target = Number(get(o, 'artboardId'));
    const kids = fc.building.has(target) ? [] : buildArtboardNodes(fc, target).map((n) => cloneWithNewIds(JSON.parse(JSON.stringify(n)) as SceneNode));
    if (fc.building.has(target)) fc.warnings.add('A nested artboard that contains itself was cut off');
    fc.warnings.add('Nested artboards are copied in as static layers; their own animations and state machines do not run inside them');
    const g = createNode('group', { name: String(o.props.name ?? 'Nested artboard'), children: kids });
    // The nested artboard's own origin sits on this node, and its root layers are stored relative to that origin
    placeAtOrigin(g, o, { x: 0, y: 0 }, 0, 0);
    void abIndex;
    addTarget(ac, slot, transformTarget(g, { x: 0, y: 0 }));
    node = g;
  } else if (isA(t, 'Node') || isA(t, 'LayoutComponent')) {
    const g = createNode('group', { name: String(o.props.name ?? t) });
    placeAtOrigin(g, o, { x: 0, y: 0 }, isA(t, 'LayoutComponent') ? get(o, 'width') : 0, isA(t, 'LayoutComponent') ? get(o, 'height') : 0);
    g.originX = 0;
    g.originY = 0;
    if (isA(t, 'LayoutComponent')) fc.warnings.add('Rive layouts are imported at their stored positions, not re-laid out');
    addTarget(ac, slot, transformTarget(g, { x: 0, y: 0 }));
    node = g;
  } else if (isA(t, 'Bone') || isA(t, 'Skin') || isA(t, 'Weight')) fc.warnings.add('Bones and skinning are not supported');
  else if (isA(t, 'Constraint')) fc.warnings.add('Constraints (IK, follow, distance, ...) are not supported');
  else if (t === 'ClippingShape') fc.warnings.add('Clipping shapes are not supported yet; clipped content shows unclipped');
  else if (isA(t, 'Event') || t === 'AudioEvent') fc.warnings.add('Rive events and audio events are not imported');
  if (!node) return null;
  ac.nodeBySlot.set(slot, node);
  if (node.type === 'group') {
    // Rive lists children front-most first; ours go back to front
    for (const ci of [...(ac.children.get(slot) ?? [])].reverse()) {
      if (isA(ac.rab.slots[ci].type, 'Path') || isA(ac.rab.slots[ci].type, 'ShapePaint')) continue;
      const c = convertSlot(ac, fc, ci, abIndex);
      if (c) node.children.push(c);
    }
    if (o.type === 'Solo') {
      const active = Number(get(o, 'activeComponentId'));
      for (const ci of ac.children.get(slot) ?? []) {
        const c = ac.nodeBySlot.get(ci);
        if (c) c.visible = ci === active;
      }
      ac.solos.set(slot, (ac.children.get(slot) ?? []).filter((ci) => ac.nodeBySlot.has(ci)));
    }
  }
  return node;
}

const contexts = new Map<number, ArtboardCtx>();

function artboardCtx(fc: FileCtx, index: number): ArtboardCtx {
  let ac = contexts.get(index);
  if (ac) return ac;
  const rab = fc.file.artboards[index];
  const children = new Map<number, number[]>();
  rab.slots.forEach((o, i) => {
    if (i === 0) return;
    const p = Number(o.props.parentId ?? 0);
    const list = children.get(p) ?? [];
    list.push(i);
    children.set(p, list);
  });
  ac = { rab, children, targets: new Map(), nodeBySlot: new Map(), solos: new Map() };
  contexts.set(index, ac);
  return ac;
}

function buildArtboardNodes(fc: FileCtx, index: number): SceneNode[] {
  if (fc.built.has(index)) return fc.built.get(index)!;
  fc.building.add(index);
  const ac = artboardCtx(fc, index);
  const out: SceneNode[] = [];
  for (const ci of [...(ac.children.get(0) ?? [])].reverse()) {
    if (isA(ac.rab.slots[ci].type, 'ShapePaint')) continue;
    const n = convertSlot(ac, fc, ci, index);
    if (n) out.push(n);
  }
  fc.building.delete(index);
  fc.built.set(index, out);
  return out;
}

// ---------------------------------------------------------------- animations

function easeOf(ac: ArtboardCtx, k: RObj): Easing {
  const type = Number(k.props.interpolationType ?? 1);
  if (type === 0) return 'step';
  if (type === 1) return 'linear';
  const ip = k.props.interpolatorId;
  const interp = ip === undefined ? undefined : ac.rab.slots[Number(ip)];
  if (interp && isA(interp.type, 'CubicInterpolator')) return [r2(get(interp, 'x1')), r2(get(interp, 'y1')), r2(get(interp, 'x2')), r2(get(interp, 'y2'))];
  if (interp?.type === 'ElasticInterpolator') return 'elasticOut';
  return 'easeInOut';
}

function buildTimeline(ac: ArtboardCtx, fc: FileCtx, anim: RAnim, offsetFor: (nodeId: string) => { x: number; y: number }): Timeline {
  const o = anim.obj;
  const fps = get(o, 'fps') || 60;
  const work = get<boolean>(o, 'enableWorkArea');
  const start = work ? Math.max(0, get(o, 'workStart')) : 0;
  const end = work && get(o, 'workEnd') > 0 ? get(o, 'workEnd') : get(o, 'duration');
  const ms = (frame: number) => Math.max(0, Math.round(((frame - start) / fps) * 1000));
  const tracks: Track[] = [];
  for (const ko of anim.keyed) {
    const slot = Number(ko.obj.props.objectId ?? 0);
    const targets = ac.targets.get(slot);
    for (const kp of ko.props) {
      const key = Number(kp.obj.props.propertyKey);
      const rprop = propNameByKey.get(key)?.name ?? String(key);
      if (!targets?.length) {
        const ot = ac.rab.slots[slot]?.type ?? 'object';
        if (isA(ot, 'Vertex')) fc.warnings.add('Path vertex animation (shape morphing) is not supported; those paths stay in their rest shape');
        else if (isA(ot, 'Bone')) fc.warnings.add('Bones and skinning are not supported');
        else if (ot === 'TrimPath' || ot === 'DashPath') fc.warnings.add('Trim and dash path effects are not supported');
        else if (slot) fc.warnings.add(`Animated ${ot} properties (${rprop}) have no matching layer and were skipped`);
        continue;
      }
      if (rprop === 'activeComponentId' && ac.solos.has(slot)) {
        for (const ci of ac.solos.get(slot)!) {
          const child = ac.nodeBySlot.get(ci)!;
          tracks.push({ id: uid('tr'), nodeId: child.id, prop: 'visible', keys: kp.keys.map((k) => ({ id: uid('k'), t: ms(Number(k.props.frame ?? 0)), value: Number(k.props.value ?? 0) === ci, ease: 'step' as Easing })) });
        }
        continue;
      }
      for (const t of targets) {
        const m = t.map[rprop];
        if (!m) {
          if (rprop === 'x' || rprop === 'y') fc.warnings.add('Path vertex animation (shape morphing) is not supported');
          else fc.warnings.add(`Animating "${rprop}" on ${ac.rab.slots[slot]?.type} is not supported`);
          continue;
        }
        const off = m.prop === 'x' || m.prop === 'y' ? offsetFor(t.nodeId) : { x: 0, y: 0 };
        const keys: Keyframe[] = kp.keys.map((k) => {
          let v = m.f(k.props.value ?? defaultOf(k.type, 'value'));
          if (typeof v === 'number' && m.prop === 'x') v = r2(v + off.x);
          if (typeof v === 'number' && m.prop === 'y') v = r2(v + off.y);
          return { id: uid('k'), t: ms(Number(k.props.frame ?? 0)), value: v, ease: easeOf(ac, k) };
        });
        if (keys.length) tracks.push({ id: uid('tr'), nodeId: t.nodeId, prop: m.prop, keys });
      }
    }
  }
  // Rects/ellipses sized around a centre: keep the centre where Rive keeps it.
  for (const f of sizeFollowers) {
    for (const axis of ['width', 'height'] as const) {
      const tr = tracks.find((x) => x.nodeId === f.nodeId && x.prop === axis);
      if (!tr) continue;
      const prop = axis === 'width' ? 'x' : 'y';
      if (tracks.some((x) => x.nodeId === f.nodeId && x.prop === prop)) {
        fc.warnings.add('A shape animating both its position and its size around a centre may drift slightly');
        continue;
      }
      const o2 = offsetFor(f.nodeId);
      tracks.push({
        id: uid('tr'),
        nodeId: f.nodeId,
        prop,
        keys: tr.keys.map((k) => ({ id: uid('k'), t: k.t, ease: k.ease, value: r2((axis === 'width' ? f.sx + o2.x : f.sy + o2.y) - Number(k.value) * (axis === 'width' ? f.ox : f.oy)) })),
      });
    }
  }
  const loop = get(o, 'loopValue');
  return {
    id: uid('tl'),
    name: String(o.props.name ?? 'Animation'),
    duration: Math.max(1, ms(end)),
    loop: loop === 1 ? 'loop' : loop === 2 ? 'pingpong' : 'once',
    autoplay: false,
    speed: r2(get(o, 'speed') || 1),
    tracks,
  };
}

// ---------------------------------------------------------------- state machines

const identifier = (s: string) => s.replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || 'input';

function buildMachines(ac: ArtboardCtx, fc: FileCtx, ab: Artboard, timelines: Timeline[], names: Set<string>, variables: Variable[]): void {
  const unique = (base: string) => {
    let n = identifier(base);
    let i = 2;
    while (names.has(n)) n = `${identifier(base)}_${i++}`;
    names.add(n);
    return n;
  };
  let y = 40;
  const nodes = ab.logic.nodes;
  const edges = ab.logic.edges;
  const add = (kind: string, params: Record<string, unknown>, x: number): LogicNode => {
    const n: LogicNode = { id: uid('lg'), kind, x, y, params: { ...defaultParams(kind), ...params } };
    nodes.push(n);
    return n;
  };
  const link = (a: LogicNode, b: LogicNode, port = 'out') => edges.push({ id: uid('e'), from: a.id, fromPort: port, to: b.id, toPort: 'in' } as LogicEdge);
  const machines = ac.rab.machines;
  if (!machines.length) {
    // No state machine: play the first animation, as Rive does
    if (timelines[0]) timelines[0].autoplay = true;
    return;
  }
  if (machines.length > 1) fc.warnings.add(`Artboard "${ab.name}" has ${machines.length} state machines; all were converted and run together`);
  for (const sm of machines) {
    const smName = String(sm.obj.props.name ?? 'State Machine');
    const inputVars = sm.inputs.map((inp) => {
      const name = unique(String(inp.props.name ?? 'input'));
      if (inp.type === 'StateMachineTrigger') return { kind: 'trigger' as const, name, id: '' };
      const v: Variable =
        inp.type === 'StateMachineBool'
          ? { id: uid('v'), name, type: 'boolean', initial: !!get<boolean>(inp, 'value') }
          : { id: uid('v'), name, type: 'number', initial: r2(get(inp, 'value')) };
      variables.push(v);
      return { kind: inp.type === 'StateMachineBool' ? ('bool' as const) : ('number' as const), name, id: v.id };
    });
    sm.layers.forEach((layer, li) => {
      const stateVar: Variable = { id: uid('v'), name: unique(`${smName}_layer${li + 1}_state`), type: 'string', initial: '' };
      variables.push(stateVar);
      const tlOf = (st: RState | undefined) => (st?.obj.type === 'AnimationState' ? timelines[Number(st.obj.props.animationId ?? -1)] : undefined);
      const stateName = (st: RState) => String(st.obj.props.name ?? (st.obj.type === 'AnimationState' ? tlOf(st)?.name : st.obj.type) ?? 'state');
      const layerTimelines = layer.states.map(tlOf).filter(Boolean) as Timeline[];
      const goTo = (from: LogicNode, port: string, target: RState, x: number) => {
        let last = from;
        let lastPort = port;
        const others = layerTimelines.filter((o) => o !== tlOf(target)).map((o) => o.id);
        if (others.length) {
          // The layer's other states stop where they are; the target state's animation takes over
          const p = add('action.code', { code: `${JSON.stringify(others)}.forEach((id) => ix.timeline(id)?.pause());` }, x);
          p.note = 'Pause the layer’s other states';
          link(last, p, lastPort);
          last = p;
          lastPort = 'out';
          x += 240;
        }
        const set = add('action.setVariable', { variable: stateVar.id, op: 'set', value: JSON.stringify(stateName(target)) }, x);
        link(last, set, lastPort);
        const tl = tlOf(target);
        if (tl) {
          const play = add('action.timeline', { timeline: tl.id, op: 'restart' }, x + 240);
          link(set, play);
        }
        if (target.obj.type === 'BlendState1D' || target.obj.type === 'BlendStateDirect' || isA(target.obj.type, 'BlendState')) fc.warnings.add('Blend states are imported as plain states');
      };
      // Entry: the first unconditional transition picks the starting state
      const entry = layer.states.find((s) => s.obj.type === 'EntryState');
      const first = entry?.transitions[0];
      if (first) {
        const target = layer.states[Number(first.obj.props.stateToId ?? 0)];
        const start = add('event.start', {}, 40);
        start.note = `${smName}: layer ${li + 1} entry`;
        goTo(start, 'out', target, 280);
        y += 120;
      }
      for (const [si, st] of layer.states.entries()) {
        if (st.obj.type === 'EntryState') continue;
        for (const tr of st.transitions) {
          const target = layer.states[Number(tr.obj.props.stateToId ?? 0)];
          if (!target || target.obj.type === 'ExitState') continue;
          const conds: string[] = [];
          const triggers: string[] = [];
          const watched = new Set<string>();
          for (const c of tr.conditions) {
            const inp = inputVars[Number(c.props.inputId ?? 0)];
            if (!inp) continue;
            const op = Number(c.props.opValue ?? 0);
            if (c.type === 'TransitionTriggerCondition' || inp.kind === 'trigger') triggers.push(inp.name);
            else if (c.type === 'TransitionBoolCondition') {
              conds.push(op === 0 ? inp.name : `!${inp.name}`);
              watched.add(inp.id);
            } else if (c.type === 'TransitionNumberCondition') {
              const ops = ['===', '!==', '<=', '>=', '<', '>'];
              conds.push(`${inp.name} ${ops[op] ?? '==='} ${r2(get(c, 'value'))}`);
              watched.add(inp.id);
            } else fc.warnings.add(`Transition condition ${c.type} is not supported`);
          }
          if (st.obj.type !== 'AnyState') conds.push(`${stateVar.name} === ${JSON.stringify(stateName(st))}`);
          const condition = conds.join(' && ') || 'true';
          const sources: LogicNode[] = [];
          for (const name of triggers) sources.push(add('event.message', { name }, 40));
          if (!triggers.length) {
            for (const id of watched) sources.push(add('event.variable', { variable: id }, 40));
            if (!watched.size) {
              // No inputs: leave when the state's animation finishes (exit time)
              const tl = tlOf(st);
              if (tl) {
                if (tl.loop !== 'once') fc.warnings.add('Transitions out of looping animations by exit time only happen once the animation is set to play once');
                sources.push(add('event.timelineEnd', { timeline: tl.id }, 40));
              } else continue;
            }
          }
          const iff = add('logic.if', { condition }, 280);
          iff.note = `${stateName(st)} → ${stateName(target)}`;
          for (const s of sources) link(s, iff);
          goTo(iff, 'true', target, 520);
          if (get(tr.obj, 'duration')) fc.warnings.add('Transition blend durations are not imported (states switch instantly)');
          y += 120 + Math.max(0, sources.length - 1) * 100;
          void si;
        }
      }
    });
    // Listeners -> pointer events setting inputs
    for (const l of sm.listeners) {
      const type = Number(l.obj.props.listenerTypeValue ?? 0);
      const pointer: Record<number, string> = { 0: 'pointerenter', 1: 'pointerleave', 2: 'pointerdown', 3: 'pointerup', 6: 'click' };
      if (!(type in pointer)) {
        fc.warnings.add(`Listener type ${type} (only enter/exit/down/up/click are imported)`);
        continue;
      }
      const targetNode = ac.nodeBySlot.get(Number(l.obj.props.targetId ?? 0));
      const ev = add('event.pointer', { target: targetNode?.id ?? '', type: pointer[type] }, 40);
      let last: LogicNode = ev;
      let x = 280;
      for (const a of l.actions) {
        const inp = inputVars[Number(a.props.inputId ?? 0)];
        if (!inp) continue;
        let n: LogicNode | null = null;
        if (a.type === 'ListenerTriggerChange' || inp.kind === 'trigger') n = add('action.emit', { name: inp.name, payload: '' }, x);
        else if (a.type === 'ListenerBoolChange') {
          const v = Number(a.props.value ?? 1);
          n = v === 2 ? add('action.setVariable', { variable: inp.id, op: 'toggle' }, x) : add('action.setVariable', { variable: inp.id, op: 'set', value: v ? 'true' : 'false' }, x);
        } else if (a.type === 'ListenerNumberChange') n = add('action.setVariable', { variable: inp.id, op: 'set', value: String(r2(get(a, 'value'))) }, x);
        else fc.warnings.add(`Listener action ${a.type} is not supported`);
        if (n) {
          link(last, n);
          last = n;
          x += 240;
        }
      }
      y += 120;
    }
  }
}

// ---------------------------------------------------------------- entry point

export async function importRive(bytes: Uint8Array, name: string): Promise<RiveImport> {
  const { objects } = readObjects(bytes);
  const s = structure(objects);
  contexts.clear();
  const fc: FileCtx = { file: { artboards: s.artboards, assets: s.assets }, warnings: s.warnings, assets: [], assetIdByIndex: new Map(), fonts: [], built: new Map(), building: new Set() };
  if (!s.artboards.length) throw new Error('The .riv file has no artboards');
  // Embedded fonts become project fonts
  s.assets.forEach((a, i) => {
    if (a.obj.type !== 'FontAsset') return;
    if (!a.bytes) {
      fc.warnings.add(`Font "${String(a.obj.props.name ?? '')}" is not embedded; text falls back to a system font`);
      return;
    }
    const id = uid('as');
    fc.assetIdByIndex.set(i, id);
    const family = String(a.obj.props.name ?? `Font ${i}`).replace(/\.[^.]+$/, '');
    fc.assets.push({ id, name: `${family}.${mimeOf(a.bytes).split('/')[1] ?? 'ttf'}`, mime: mimeOf(a.bytes), bytes: a.bytes.slice() });
    if (!fc.fonts.some((f) => f.family === family)) fc.fonts.push({ family, source: 'asset', assetId: id });
  });
  const variables: Variable[] = [];
  const names = new Set<string>();
  const artboards: Artboard[] = [];
  s.artboards.forEach((rab, index) => {
    sizeFollowers = [];
    const ac = artboardCtx(fc, index);
    const w = get(rab.obj, 'width');
    const h = get(rab.obj, 'height');
    const ox = w * get(rab.obj, 'originX');
    const oy = h * get(rab.obj, 'originY');
    // The artboard origin is where Rive's (0,0) sits; our root layers count from the top-left. Copies, so the
    // cached nodes nested artboards are cloned from stay relative to the origin.
    const kids = buildArtboardNodes(fc, index).map((k) => ({ ...k, x: r2(k.x + ox), y: r2(k.y + oy) }) as SceneNode);
    const root = new Set(kids.map((k) => k.id));
    const bg = (ac.children.get(0) ?? []).map((i) => ({ i, o: rab.slots[i] })).find((k) => k.o.type === 'Fill');
    const background = bg ? paintOf(ac, fc, bg.i, null).paint : null;
    const ab = createArtboard({
      name: String(rab.obj.props.name ?? `Artboard ${index + 1}`),
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
      background,
      canvasX: Math.round(get(rab.obj, 'x')),
      canvasY: Math.round(get(rab.obj, 'y')),
      clip: !!get<boolean>(rab.obj, 'clip'),
      children: kids,
    });
    const timelines = rab.anims.map((a) => buildTimeline(ac, fc, a, (nodeId) => (root.has(nodeId) ? { x: ox, y: oy } : { x: 0, y: 0 })));
    ab.timelines = timelines;
    buildMachines(ac, fc, ab, timelines, names, variables);
    artboards.push(ab);
  });
  void name;
  const start = artboards.find((a) => a.name === String(s.artboards[0].obj.props.name)) ?? artboards[0];
  return { artboard: start, artboards, assets: fc.assets, variables, fonts: fc.fonts, warnings: [...fc.warnings] };
}

/** For tests and diagnostics: the raw object list. */
export function readRiveObjects(bytes: Uint8Array): { type: string; props: Record<string, unknown> }[] {
  return readObjects(bytes).objects;
}
