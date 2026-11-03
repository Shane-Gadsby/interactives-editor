/**
 * Rive runtime file (.riv, format major 7) -> Interactives artboards.
 *
 * Reads the documented binary container (header, property table of contents,
 * objects as typeKey + key/value properties) using the type definitions in
 * rive-defs.ts, rebuilds each artboard's component tree, and maps it onto our
 * model:
 *   - Node/Solo/LayoutComponent -> group; Shape -> path (or rect/ellipse when
 *     it is a single plain one), with fills/strokes/gradients (several of each become layers: fills + fills[], stroke + strokes[], with
 *     blend mode and Feather as feather + offset); Text; Image;
 *     NestedArtboard -> a copy of that artboard's layers
 *   - LinearAnimation -> timeline (transforms, opacity, sizes, colours,
 *     stroke widths, text, with hold/linear/cubic/elastic easing)
 *   - State machines -> variables (bool/number inputs), messages (triggers),
 *     pointer listeners -> pointer events, and transitions -> flows that play
 *     the target state's timeline
 *   - Blend states (1D and direct) -> blends: entering the state plays the blend, leaving it stops the blend
 *   - Solo -> a group with native solo (animated through `solo.active`)
 *   - ClippingShape -> the clipped layer wrapped in a group with a masking copy of the clip shape in front of it
 *   - DrawRules/DrawTarget -> `drawOrder` on the parent, when the clipped node and its target are siblings
 *   - Events: an Event becomes a message (Send message, custom properties as
 *     the payload); an AudioEvent also plays its embedded sound and an
 *     OpenUrlEvent opens its link. They fire from keyframes (timeline markers
 *     + On timeline marker), listeners and state/transition "fire event"
 *     actions; event listeners become On message.
 *   - Path vertex keys (shape morphing) -> keys on the path's points, sampled (handles are keyed as rotation + distance)
 *   - isHole paths -> wound the other way round so the fill leaves them open; TranslationConstraint -> copy position, TransformConstraint -> copy position + rotation + scale
 * Data binds: a view model property driving a layer property becomes a binding (with converters); view models are shared variables.
 *   - Bones: RootBone/Bone -> bone layers (a child bone sits at its parent's tip; an animated `length` moves it); Skin + Tendon +
 *     Weight/CubicWeight on a path -> the path's `skin` (bind matrices from the skin's and tendons' transforms), Mesh +
 *     MeshVertex on an image -> its `mesh`; IKConstraint (parentBoneCount + 1 bones, invertDirection) -> IK, DistanceConstraint -> distance
 * Other constraints, scripted and layout-computed geometry are reported in `warnings`.
 */
import {
  createArtboard,
  createNode,
  uid,
  defaultParams,
  runsPatch,
  type Artboard,
  type Blend,
  type Joystick,
  type Easing,
  type FontRef,
  type InstanceNode,
  type AutoLayout,
  type GridLayout,
  type GridTrack,
  type LayoutItem,
  type Keyframe,
  type LogicEdge,
  type LogicNode,
  type Paint,
  type PaintFx,
  fillPath,
  strokePath,
  type PathPoint,
  type SceneNode,
  type Stroke,
  type TextRun,
  type SubPath,
  type Timeline,
  type TimelineMarker,
  type Track,
  type Variable,
  type Converter,
  walk,
  invert,
  multiply,
  sampleKeys,
  nodeMatrix,
  type Matrix,
  type PathSkin,
  type SkinBone,
  type SkinInfluence,
  type SkinVertex,
  type ImageNode,
  type PathNode,
  type Constraint,
  isPlainOrder,
  paintOrderField,
  type PaintKind,
  type TextModifier,
  defaultModifier,
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

// By class, then base: called for every object many times over, so no key string is built per call
const isACache = new Map<string, Map<string, boolean>>();
function isA(cls: string, base: string): boolean {
  let byBase = isACache.get(cls);
  if (!byBase) isACache.set(cls, (byBase = new Map()));
  let v = byBase.get(base);
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
    byBase.set(base, v);
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
  /** Data binding: the bindable property and DataBindContext objects that belong to a comparator or listener action. */
  parts?: RObj[];
}

/** A view model: its properties in order, and the first instance's values by property index. */
interface RViewModel {
  name: string;
  props: RObj[];
  /** The first instance's values by property index (the starting values). */
  values: Map<number, unknown>;
  instances: number;
  /** Every instance's values by property index, and the list items of each list property (viewModelId/instanceId pairs). */
  all: { values: Map<number, unknown>; lists: Map<number, { vm: number; instance: number }[]> }[];
}

/** A Rive enum: its values' keys, in order (a view model enum property stores an index into them). */
interface REnum {
  name: string;
  values: string[];
}

/** A file-level data converter, with the converters a group holds and the tokens a formula is made of. */
interface RConverter {
  obj: RObj;
  items: number[];
  tokens: RObj[];
}

/** A DataBind on a component: which property of the component, where it reads from, and how it converts. */
interface RDataBind {
  slot: number;
  obj: RObj;
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
        case 'i': {
          // Signed ints are zigzag varints (0, -1, 1, -2, ...)
          const z = r.varuint();
          v = z % 2 ? -(z + 1) / 2 : z / 2;
          break;
        }
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
  /** StateMachineFireEvent / FireTrigger actions (occurs at start or end of the transition). */
  fires: RObj[];
}
interface RState {
  obj: RObj;
  transitions: RTransition[];
  fires: RObj[];
  /** BlendAnimation1D / BlendAnimationDirect objects of a blend state. */
  blends: RObj[];
}
interface RLayer {
  obj: RObj;
  states: RState[];
}
interface RListener {
  obj: RObj;
  actions: RObj[];
  /** ListenerInputTypeEvent objects: the events an event listener reacts to. */
  inputTypes: RObj[];
  /** KeyboardInput objects: the keys a keyboard listener reacts to. */
  keys: RObj[];
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
  /** Data binds that sit right after the component they bind (layer properties: position, text, colour...). */
  binds: RDataBind[];
}
interface RAsset {
  obj: RObj;
  bytes: Uint8Array | null;
}

function claimsSlot(type: string): boolean {
  return (isA(type, 'Component') && type !== 'Artboard') || isA(type, 'KeyFrameInterpolator');
}

function structure(objects: RObj[]): { artboards: RArtboard[]; assets: RAsset[]; warnings: Set<string>; viewModels: RViewModel[]; enums: REnum[]; converters: RConverter[] } {
  const viewModels: RViewModel[] = [];
  const enums: REnum[] = [];
  const converters: RConverter[] = [];
  let vmInstance: { vm: RViewModel; first: boolean; all: RViewModel['all'][number] } | null = null;
  let listValue: { vm: RViewModel; first: boolean; items: { vm: number; instance: number }[] } | null = null;
  // The component a DataBind belongs to is the object read just before it (consecutive binds share it)
  let prevSlot = -1;
  // Bindable properties and their DataBindContexts come just before the comparator or listener action that uses them
  let pending: RObj[] = [];
  let condition: RObj | null = null;
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
    const bindTarget = prevSlot;
    if (!isA(t, 'DataBind')) prevSlot = -1;
    if (t === 'ViewModel') {
      viewModels.push({ name: String(o.props.name ?? `ViewModel${viewModels.length + 1}`), props: [], values: new Map(), instances: 0, all: [] });
      continue;
    }
    if (t === 'DataEnumCustom') {
      enums.push({ name: String(o.props.name ?? `Enum${enums.length + 1}`), values: [] });
      continue;
    }
    if (t === 'DataEnumValue') {
      enums[enums.length - 1]?.values.push(String(o.props.key ?? o.props.value ?? ''));
      continue;
    }
    if (isA(t, 'DataConverter')) {
      converters.push({ obj: o, items: [], tokens: [] });
      continue;
    }
    if (t === 'DataConverterGroupItem') {
      converters[converters.length - 1]?.items.push(Number(o.props.converterId ?? 0));
      continue;
    }
    if (isA(t, 'FormulaToken')) {
      converters[converters.length - 1]?.tokens.push(o);
      continue;
    }
    if (isA(t, 'ViewModelProperty') && viewModels.length) {
      viewModels[viewModels.length - 1].props.push(o);
      continue;
    }
    if (t === 'ViewModelInstance') {
      const vm = viewModels[Number(o.props.viewModelId ?? 0)];
      const all = { values: new Map<number, unknown>(), lists: new Map<number, { vm: number; instance: number }[]>() };
      if (vm) vm.all.push(all);
      vmInstance = vm ? { vm, first: vm.instances++ === 0, all } : null;
      listValue = null;
      continue;
    }
    if (isA(t, 'ViewModelInstanceValue')) {
      const prop = Number(o.props.viewModelPropertyId ?? 0);
      if (vmInstance?.first) vmInstance.vm.values.set(prop, o.props.propertyValue);
      vmInstance?.all.values.set(prop, o.props.propertyValue);
      listValue = null;
      if (vmInstance && t === 'ViewModelInstanceList') {
        const items: { vm: number; instance: number }[] = [];
        vmInstance.all.lists.set(prop, items);
        listValue = { vm: vmInstance.vm, first: vmInstance.first, items };
      }
      continue;
    }
    if (t === 'ViewModelInstanceListItem') {
      listValue?.items.push({ vm: Number(o.props.viewModelId ?? 0), instance: Number(o.props.viewModelInstanceId ?? 0) });
      continue;
    }
    if (isA(t, 'DataBind') && bindTarget >= 0 && ab) {
      ab.binds.push({ slot: bindTarget, obj: o });
      continue;
    }
    if (isA(t, 'BindableProperty') || isA(t, 'DataBind')) {
      pending.push(o);
      continue;
    }
    if (isA(t, 'TransitionComparator')) {
      if (condition) (condition.parts ??= []).push({ ...o, parts: pending });
      pending = [];
      continue;
    }
    if (pending.length && t !== 'ListenerViewModelChange') {
      // A binding nobody consumed: it was on a layer property (text, colour, position...)
      if (pending.some((x) => x.type === 'DataBindContext')) warnings.add('Some data binds are not attached to a layer property, so they were skipped');
      pending = [];
    }
    if (t === 'Artboard') {
      ab = { obj: o, slots: [o], anims: [], machines: [], binds: [] };
      artboards.push(ab);
      prevSlot = 0;
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
      prevSlot = ab.slots.length - 1;
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
      state = { obj: o, transitions: [], fires: [], blends: [] };
      transition = null;
      layer.states.push(state);
    } else if (isA(t, 'BlendAnimation') && state) state.blends.push(o);
    else if (isA(t, 'StateTransition') && state) {
      transition = { obj: o, conditions: [], fires: [] };
      state.transitions.push(transition);
    } else if (isA(t, 'TransitionCondition') && transition) {
      transition.conditions.push(o);
      condition = o;
    } else if (isA(t, 'StateMachineFireAction') && (transition || state)) (transition ?? state)!.fires.push(o);
    else if (isA(t, 'StateMachineListener') && sm) {
      listener = { obj: o, actions: [], inputTypes: [], keys: [] };
      sm.listeners.push(listener);
    } else if (isA(t, 'ListenerInputType') && listener) listener.inputTypes.push(o);
    else if (t === 'KeyboardInput' && listener) listener.keys.push(o);
    else if (isA(t, 'ListenerAction') && listener) {
      listener.actions.push(t === 'ListenerViewModelChange' ? { ...o, parts: pending } : o);
      pending = [];
    }
  }
  return { artboards, assets, warnings, viewModels, enums, converters };
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

/** A rectangle's or layout's radii per corner (top-left, top-right, bottom-right, bottom-left), or null when it has one radius (linked, or all four equal). */
function riveRadii(o: RObj | undefined): [number, number, number, number] | null {
  if (!o || get<boolean>(o, 'linkCornerRadius') !== false) return null;
  const radii = [get(o, 'cornerRadiusTL'), get(o, 'cornerRadiusTR'), get(o, 'cornerRadiusBR'), get(o, 'cornerRadiusBL')].map((v) => r2(Math.max(0, v))) as [number, number, number, number];
  return radii.every((v) => v === radii[0]) ? null : radii;
}

/** A rectangle's outline: four corners, each with its own radius (radii that don't fit are scaled down together, as in CSS). */
function rectPoints(w: number, h: number, ox: number, oy: number, radius: number, radii?: [number, number, number, number] | null): PathPoint[] {
  const x0 = -w * ox;
  const y0 = -h * oy;
  let [tl, tr, br, bl] = radii ?? [radius, radius, radius, radius];
  const f = Math.min(1, ...[w / (tl + tr), w / (bl + br), h / (tl + bl), h / (tr + br)].filter((v) => Number.isFinite(v) && v > 0));
  // Without per-corner radii a single radius is held to half the smaller side
  if (!radii) tl = tr = br = bl = Math.max(0, Math.min(radius, w / 2, h / 2));
  else [tl, tr, br, bl] = [tl, tr, br, bl].map((v) => Math.max(0, v * f)) as [number, number, number, number];
  if (!tl && !tr && !br && !bl) return [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
  const out: PathPoint[] = [];
  // Clockwise from the top-left corner's end: each rounded corner is the point it is approached at and the one it leaves from
  const corner = (r: number, cx: number, cy: number, ax: number, ay: number, bx: number, by: number) => {
    // a: approach (comes along an edge), b: leave
    if (!r) return out.push({ x: cx, y: cy });
    const k = r * K;
    out.push({ x: cx + ax * r, y: cy + ay * r, out: { x: -ax * k, y: -ay * k } });
    return out.push({ x: cx + bx * r, y: cy + by * r, in: { x: -bx * k, y: -by * k } });
  };
  // TL: approached going up the left edge, left going along the top edge
  corner(tl, x0, y0, 0, 1, 1, 0);
  corner(tr, x0 + w, y0, -1, 0, 0, 1);
  corner(br, x0 + w, y0 + h, 0, -1, -1, 0);
  corner(bl, x0, y0 + h, 1, 0, 0, -1);
  return out;
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

/** One path vertex as a point, from a getter for its (possibly animated) values. */
function vertexPoint(type: string, g: (prop: string) => number): PathPoint {
  const p: PathPoint = { x: g('x'), y: g('y') };
  if (type === 'CubicDetachedVertex') {
    p.in = { x: Math.cos(g('inRotation')) * g('inDistance'), y: Math.sin(g('inRotation')) * g('inDistance') };
    p.out = { x: Math.cos(g('outRotation')) * g('outDistance'), y: Math.sin(g('outRotation')) * g('outDistance') };
  } else if (type === 'CubicMirroredVertex') {
    const d = g('distance');
    const r = g('rotation');
    p.out = { x: Math.cos(r) * d, y: Math.sin(r) * d };
    p.in = { x: -p.out.x, y: -p.out.y };
  } else if (type === 'CubicAsymmetricVertex') {
    const r = g('rotation');
    p.out = { x: Math.cos(r) * g('outDistance'), y: Math.sin(r) * g('outDistance') };
    p.in = { x: -Math.cos(r) * g('inDistance'), y: -Math.sin(r) * g('inDistance') };
  }
  return p;
}

function vertexPoints(verts: RObj[]): PathPoint[] {
  return verts.map((v) => vertexPoint(v.type, (prop) => get(v, prop)));
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
  if (String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WAVE') return 'audio/wav';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'OggS') return 'audio/ogg';
  if (String.fromCharCode(...b.subarray(0, 4)) === 'fLaC') return 'audio/flac';
  if (String.fromCharCode(...b.subarray(0, 3)) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
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
  /** Set on a path vertex: where its point sits in the path node, so keys on its x/y/handles morph the path. */
  vertex?: { sub: number; index: number; m: M; minX: number; minY: number };
}

interface ArtboardCtx {
  rab: RArtboard;
  children: Map<number, number[]>;
  targets: Map<number, Target[]>;
  nodeBySlot: Map<number, SceneNode>;
  /** Solo slot -> its child slots that became layers (for activeComponentId keys). */
  solos: Map<number, number[]>;
  /** Slot -> the group that now holds it, when clipping wrapped the layer (its parent lists the wrapper). */
  wrapBySlot: Map<number, SceneNode>;
  /** Slot of a clip shape -> the masking copies made of it (constraints on the shape have to move its copies too). */
  clones: Map<number, SceneNode[]>;
  /** Layer mask sources that Rive does not draw on their own: hidden once every layer exists. */
  maskHidden: number[];
  /** DrawRules slot -> the container it reorders and the child order for each of its draw targets. */
  drawRules: Map<number, { nodeId: string; base: string[]; orders: Map<number, string[]> }>;
  /** Skinned paths and meshes, resolved once every bone has become a layer. */
  skins: PendingSkin[];
}

/** A skinned path (one or more of its sub-paths) or image mesh, waiting for the bones it names to exist. */
interface PendingSkin {
  node: SceneNode;
  /** Our node's local space -> the Rive object's local space the skin's matrices were made for, per sub-path (a mesh has one). */
  parts: { skinSlot: number; toRive: M; sub: number; vslots: number[] }[];
}

interface VmVar {
  id: string;
  name: string;
  kind: 'number' | 'boolean' | 'string' | 'color' | 'trigger' | 'enum' | 'list';
  /** Enum variables: the options (a Rive enum value is stored as an index into them). */
  options?: string[];
}

interface FileCtx {
  file: { artboards: RArtboard[]; assets: RAsset[] };
  warnings: Set<string>;
  assets: ImportedAsset[];
  assetIdByIndex: Map<number, string>;
  fonts: FontRef[];
  built: Map<number, SceneNode[]>;
  building: Set<number>;
  /** Our artboard id for each Rive artboard index (instances point at them before they are built). */
  abIds: string[];
  /** Instance input values, resolved to variable names once every artboard's state machines are converted. */
  pendingInputs: { node: InstanceNode; artboard: number; machine: number; input: number; value: number | boolean }[];
  /** Variable name for (artboard, state machine, input) indexes. */
  inputNames: Map<string, string>;
  viewModels: RViewModel[];
  enums: REnum[];
  converters: RConverter[];
  /** Project variables and the names they take, shared by every artboard's data binds and state machines. */
  variables: Variable[];
  names: Set<string>;
  /** One shared variable per view model property used (key: "vm/prop"). Triggers become counters. */
  vmVars: Map<string, VmVar>;
  /** Events keyed on a timeline: marker name -> the Rive event's slot. Filled by buildTimeline, turned into flows by buildMachines. */
  timelineEvents: Map<Timeline, Map<string, number>>;
  /** Nested inputs keyed on a timeline (markers that set the input or fire the trigger), named once every artboard's inputs are. */
  nestedKeys: NestedKey[];
  /** Flow nodes that name a nested input, filled in once every artboard's state machine inputs have names. */
  pendingNested: { node: LogicNode; ref: NestedRef }[];
}

/** An input of the state machine of a nested artboard, as the parent sees it (a NestedBool / NestedNumber / NestedTrigger). */
interface NestedRef {
  inst: SceneNode;
  artboard: number;
  machine: number;
  input: number;
  kind: 'bool' | 'number' | 'trigger';
}

/** One key of a nested input animation: a marker on the timeline, then a flow that sets the input or fires the trigger. */
interface NestedKey {
  tl: Timeline;
  marker: TimelineMarker;
  ref: NestedRef;
  value: number | boolean;
}

/** The nested input a NestedBool / NestedNumber / NestedTrigger component stands for, found through its nested state machine and nested artboard. */
function nestedRef(ac: ArtboardCtx, slot: number): NestedRef | null {
  const o = ac.rab.slots[slot];
  const kind = o?.type === 'NestedBool' ? 'bool' : o?.type === 'NestedNumber' ? 'number' : o?.type === 'NestedTrigger' ? 'trigger' : null;
  if (!kind) return null;
  const smSlot = Number(o.props.parentId ?? 0);
  const sm = ac.rab.slots[smSlot];
  if (sm?.type !== 'NestedStateMachine') return null;
  const naSlot = Number(sm.props.parentId ?? 0);
  const na = ac.rab.slots[naSlot];
  const inst = ac.nodeBySlot.get(naSlot);
  if (!na || !isA(na.type, 'NestedArtboard') || inst?.type !== 'instance') return null;
  return { inst, artboard: Number(get(na, 'artboardId')), machine: Number(get(sm, 'animationId')), input: Number(get(o, 'inputId')), kind };
}

/** sourcePathIds: varuints, the view model index then property indexes (through nested view model properties). */
function pathIds(v: unknown): number[] {
  const bytes = v instanceof Uint8Array ? v : v && typeof v === 'object' ? Uint8Array.from(Object.values(v as Record<string, number>)) : new Uint8Array();
  const out: number[] = [];
  let n = 0;
  let shift = 0;
  for (const b of bytes) {
    n |= (b & 0x7f) << shift;
    if (b & 0x80) shift += 7;
    else {
      out.push(n);
      n = 0;
      shift = 0;
    }
  }
  return out;
}

const argbCss = (v: number) => `rgba(${(v >>> 16) & 255}, ${(v >>> 8) & 255}, ${v & 255}, ${Math.round((((v >>> 24) & 255) / 255) * 1000) / 1000})`;

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

function paintOf(ac: ArtboardCtx, fc: FileCtx, paintSlot: number, shapeBox: { x: number; y: number; w: number; h: number } | null): { paint: Paint | null; colorSlot: number | null; radius?: number } {
  for (const ci of ac.children.get(paintSlot) ?? []) {
    const c = ac.rab.slots[ci];
    if (c.type === 'SolidColor') return { paint: { type: 'solid', color: argb(get(c, 'colorValue')) }, colorSlot: ci };
    if (c.type === 'LinearGradient' || c.type === 'RadialGradient') {
      const stops = (ac.children.get(ci) ?? [])
        .map((i) => ac.rab.slots[i])
        .filter((s) => s.type === 'GradientStop')
        .map((s) => ({ offset: r2(get(s, 'position')), color: argb(get(s, 'colorValue')) }));
      if (c.type === 'RadialGradient') return { paint: { type: 'radial', stops }, colorSlot: null, radius: Math.hypot(get(c, 'endX') - get(c, 'startX'), get(c, 'endY') - get(c, 'startY')) };
      const angle = Math.atan2(get(c, 'endY') - get(c, 'startY'), get(c, 'endX') - get(c, 'startX')) * DEG + 90;
      void shapeBox;
      fc.warnings.add('Gradients are mapped to CSS-style gradients across the layer box; exact start/end points may differ');
      return { paint: { type: 'linear', angle: r2(angle), stops }, colorSlot: null };
    }
  }
  return { paint: null, colorSlot: null };
}

/**
 * A radial gradient that ends `radius` from its centre, on our box paint (which ends at the farthest corner): the stops
 * are squeezed towards the centre and the last colour carries on to the edge.
 */
function fitRadial(paint: Paint, radius: number, w: number, h: number): Paint {
  const far = Math.hypot(w / 2, h / 2);
  if (paint.type !== 'radial' || !(radius > 0) || !(far > 0)) return paint;
  const k = radius / far;
  if (Math.abs(k - 1) < 0.01 || k > 1) return paint;
  const stops = paint.stops.map((st) => ({ ...st, offset: r2(Math.min(1, st.offset * k)) }));
  const last = paint.stops[paint.stops.length - 1];
  if (last) stops.push({ ...last, offset: 1 });
  return { ...paint, stops };
}

/**
 * A stroke's DashPath effect: its Dash children alternate dash and gap lengths, plus an offset. Lengths and offset are
 * pixels, or (flagged) a fraction of the outline's length, which needs `length`: the outline's length in px, known for
 * boxes and worked out from the points for paths. Without it percent dashes are left out and reported.
 */
function dashOf(ac: ArtboardCtx, fc: FileCtx, strokeSlot: number, length?: number): { dash?: number[]; dashOffset?: number } {
  const dashPath = (ac.children.get(strokeSlot) ?? []).find((i) => ac.rab.slots[i]?.type === 'DashPath');
  if (dashPath === undefined) return {};
  const dp = ac.rab.slots[dashPath];
  const dashes = (ac.children.get(dashPath) ?? []).map((i) => ac.rab.slots[i]).filter((d) => d?.type === 'Dash');
  const percent = dashes.some((d) => get<boolean>(d, 'lengthIsPercentage'));
  const offsetPercent = !!get<boolean>(dp, 'offsetIsPercentage');
  if ((percent || offsetPercent) && !(length && length > 0)) {
    fc.warnings.add('Dash lengths given as percentages are not supported on this kind of shape');
    return {};
  }
  const px = (d: RObj) => (get<boolean>(d, 'lengthIsPercentage') ? get(d, 'length') * (length ?? 0) : get(d, 'length'));
  const list = dashes.map((d) => r2(px(d))).filter((n) => n > 0);
  if (!list.length) return {};
  // One length means equal dashes and gaps
  const offset = offsetPercent ? get(dp, 'offset') * (length ?? 0) : get(dp, 'offset');
  return { dash: list.length % 2 ? [...list, ...list] : list, ...(offset ? { dashOffset: r2(offset) } : {}) };
}

/** How a keyed dash offset becomes a px offset: as it is, or scaled by the outline's length when the offset is a share of it. */
function dashOffsetKey(ac: ArtboardCtx, dashSlot: number, outline: number): (v: unknown) => number {
  return get<boolean>(ac.rab.slots[dashSlot], 'offsetIsPercentage') ? (v) => r2(Number(v) * outline) : num();
}

/** Length of a rounded box's outline (radii: top-left, top-right, bottom-right, bottom-left), or an ellipse's with `ellipse`. */
function boxPerimeter(w: number, h: number, radii: number[], ellipse = false): number {
  if (ellipse) {
    const a = w / 2;
    const b = h / 2;
    return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  }
  const f = Math.min(1, ...[w / (radii[0] + radii[1]), w / (radii[3] + radii[2]), h / (radii[0] + radii[3]), h / (radii[1] + radii[2])].filter((v) => Number.isFinite(v) && v > 0));
  const r = radii.map((v) => Math.max(0, v) * f);
  // Straight edges, plus a quarter circle per corner
  return 2 * (w + h) - 2 * r.reduce((t, v) => t + v, 0) + (Math.PI / 2) * r.reduce((t, v) => t + v, 0);
}

/** Length of the longest sub-path of a path layer, by sampling its curves. */
function pathLength(paths: SubPath[]): number {
  let best = 0;
  for (const sp of paths) {
    let len = 0;
    const n = sp.points.length;
    for (let i = 0; i < (sp.closed ? n : n - 1); i++) {
      const a = sp.points[i];
      const b = sp.points[(i + 1) % n];
      let px = a.x;
      let py = a.y;
      const steps = a.out || b.in ? 16 : 1;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const u = 1 - t;
        const c1 = { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) };
        const c2 = { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) };
        const x = u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x;
        const y = u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y;
        len += Math.hypot(x - px, y - py);
        px = x;
        py = y;
      }
    }
    best = Math.max(best, len);
  }
  return best;
}

/**
 * One vertex's values through an animation, with the easing applied: at every key frame and three steps between
 * (the handles are keyed as rotation and distance, which a straight blend of x/y would not follow).
 */
function vertexSamples(ac: ArtboardCtx, slot: number, anim: RAnim): { frame: number; g: (prop: string) => number }[] {
  const ko = anim.keyed.find((k) => Number(k.obj.props.objectId ?? 0) === slot);
  if (!ko) return [];
  const rest = ac.rab.slots[slot];
  const byProp = new Map<string, Keyframe[]>();
  const frames = new Set<number>();
  for (const kp of ko.props) {
    const name = propNameByKey.get(Number(kp.obj.props.propertyKey))?.name;
    if (!name) continue;
    const keys = kp.keys.map((k, i) => ({ id: '', t: Number(k.props.frame ?? 0), value: Number(k.props.value ?? defaultOf(k.type, 'value') ?? 0), ease: easeOf(ac, k, kp.keys[i + 1]) }));
    byProp.set(name, keys.sort((a, b) => a.t - b.t));
    for (const k of keys) frames.add(k.t);
  }
  const sorted = [...frames].sort((a, b) => a - b);
  const times: number[] = [];
  sorted.forEach((f, i) => {
    times.push(f);
    const next = sorted[i + 1];
    if (next !== undefined) for (let j = 1; j < 4; j++) times.push(f + ((next - f) * j) / 4);
  });
  return times.map((frame) => ({
    frame,
    g: (prop: string) => {
      const keys = byProp.get(prop);
      return keys ? Number(sampleKeys(keys, frame)) : get(rest, prop);
    },
  }));
}

function convertShape(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const kids = (ac.children.get(slot) ?? []).map((i) => ({ i, o: ac.rab.slots[i] }));
  const paths = kids.filter((k) => isA(k.o.type, 'Path'));
  const fills = kids.filter((k) => k.o.type === 'Fill' && get<boolean>(k.o, 'isVisible') !== false);
  const strokes = kids.filter((k) => k.o.type === 'Stroke' && get<boolean>(k.o, 'isVisible') !== false);
  // Every fill and stroke becomes a layer, in file order (bottom to top): the first is the shape's own fill / stroke
  const blendMap: Record<number, SceneNode['blendMode']> = { 14: 'screen', 15: 'overlay', 16: 'darken', 17: 'lighten', 18: 'color-dodge', 19: 'color-burn', 22: 'difference', 23: 'exclusion', 24: 'multiply' };
  const fxOf = (slot: number, ps: RObj): PaintFx => {
    const fx: PaintFx = {};
    const bm = blendMap[get(ps, 'blendModeValue')];
    if (bm) fx.blend = bm;
    // A Feather child blurs just this paint; with an offset it is how Rive builds drop shadows
    const feather = (ac.children.get(slot) ?? []).find((ci) => ac.rab.slots[ci]?.type === 'Feather');
    if (feather !== undefined) {
      const fe = ac.rab.slots[feather];
      if (get<boolean>(fe, 'inner')) fc.warnings.add('Inner feathers are imported as ordinary (outer) feathers');
      if (get(fe, 'strength') > 0) fx.feather = r2(get(fe, 'strength'));
      if (get(fe, 'offsetX')) fx.offsetX = r2(get(fe, 'offsetX'));
      if (get(fe, 'offsetY')) fx.offsetY = r2(get(fe, 'offsetY'));
    }
    return fx;
  };
  const fillL = fills
    .map((f) => ({ f, info: paintOf(ac, fc, f.i, null) }))
    .filter((x) => x.info.paint)
    .map((x) => ({ ...x, paint: { ...x.info.paint!, ...fxOf(x.f.i, x.f.o) } as Paint }));
  const multiStroke = strokes.length > 1;
  const strokeL = strokes
    .map((st) => ({ st, info: paintOf(ac, fc, st.i, null) }))
    .filter((x) => x.info.paint)
    .map((x) => {
      const stroke: Stroke = { paint: x.info.paint!, width: r2(get(x.st.o, 'thickness')), ...fxOf(x.st.i, x.st.o) };
      // Trim path effect on the stroke: start/end/offset are fractions in Rive, percentages here
      const trim = (ac.children.get(x.st.i) ?? []).find((i) => ac.rab.slots[i]?.type === 'TrimPath');
      if (trim !== undefined) {
        const t = ac.rab.slots[trim];
        stroke.trimStart = r2(get(t, 'start') * 100);
        stroke.trimEnd = r2(get(t, 'end') * 100);
        stroke.trimOffset = r2(get(t, 'offset') * 100);
        if (Number(t.props.modeValue ?? 1) === 2) fc.warnings.add('Trim paths in "synchronized" mode trim the whole outline at once');
      }
      // Each stroke has its own cap and join (a path layer's own are the first stroke's)
      if (multiStroke) {
        stroke.cap = (['butt', 'round', 'square'] as const)[get(x.st.o, 'cap')] ?? 'butt';
        stroke.join = (['miter', 'round', 'bevel'] as const)[get(x.st.o, 'join')] ?? 'miter';
      }
      return { ...x, stroke, trim };
    });
  const stroke: Stroke | null = strokeL[0]?.stroke ?? null;
  // Layers on top of the first of each (their own list, see ShapeStyle)
  // Rive draws its fills and strokes in the order they sit in the shape, interleaved: `paintOrder` keeps that (nothing when every fill is under every stroke)
  const order = kids.flatMap((k): PaintKind[] => (fillL.some((x) => x.f.i === k.i) ? ['fill'] : strokeL.some((x) => x.st.i === k.i) ? ['stroke'] : []));
  const extra = { ...paintOrderField(order), ...(fillL.length > 1 ? { fills: fillL.slice(1).map((x) => x.paint) } : {}), ...(strokeL.length > 1 ? { strokes: strokeL.slice(1).map((x) => x.stroke) } : {}) };
  const fill = fillL[0]?.paint ?? null;
  const name = String(o.props.name ?? 'Shape');

  const plain = paths.length === 1 && (paths[0].o.type === 'Rectangle' || paths[0].o.type === 'Ellipse') && !get(paths[0].o, 'x') && !get(paths[0].o, 'y') && !get(paths[0].o, 'rotation') && get(paths[0].o, 'scaleX') === 1 && get(paths[0].o, 'scaleY') === 1;
  let node: SceneNode;
  // The outline's length in px, for dashes given as a share of it
  let outline = 0;
  if (plain) {
    const p = paths[0].o;
    const w = get(p, 'width');
    const h = get(p, 'height');
    outline = p.type === 'Ellipse' ? boxPerimeter(w, h, [], true) : boxPerimeter(w, h, riveRadii(p) ?? Array<number>(4).fill(get(p, 'cornerRadiusTL')));
    for (const x of strokeL) Object.assign(x.stroke, dashOf(ac, fc, x.st.i, outline));
    const ox = get(p, 'originX');
    const oy = get(p, 'originY');
    // Rive centres a stroke on the outline, while our rects and ellipses draw it inside their box: grow the box by the stroke
    // (half each side) so outer edges agree. Left alone when the size or the stroke's width is animated.
    const sized = ac.rab.anims.some((an) => an.keyed.some((k) => [paths[0].i, ...strokes.map((st) => st.i)].includes(Number(k.obj.props.objectId ?? 0))));
    // With several strokes, or a stroke under a fill, each one is centred on the outline, as in Rive, so the box keeps the path's size
    // (a dashed or trimmed stroke is drawn on the outline as well)
    const centred = strokeL.length > 1 || !isPlainOrder(order) || strokeL.some((x) => x.stroke.dash?.length || x.trim !== undefined);
    if (centred) for (const x of strokeL) x.stroke.align = 'center';
    const half = !centred && stroke && stroke.width > 0 && !sized ? stroke.width / 2 : 0;
    // Rive's radial gradients end where the file says (usually the box's side); a CSS-like box paint ends at the corner
    const fit = (x: (typeof fillL)[number]): Paint => (x.info.radius ? fitRadial(x.paint, x.info.radius, w + half * 2, h + half * 2) : x.paint);
    const fitFill = fillL[0] ? fit(fillL[0]) : null;
    const fitExtra = { ...extra, ...(fillL.length > 1 ? { fills: fillL.slice(1).map(fit) } : {}) };
    node =
      p.type === 'Rectangle'
        ? createNode('rect', { name, fill: fitFill, stroke, ...fitExtra, cornerRadius: r2(get(p, 'cornerRadiusTL') + half), ...(riveRadii(p) ? { cornerRadii: riveRadii(p)!.map((v) => r2(v + half)) as [number, number, number, number] } : {}) })
        : createNode('ellipse', { name, fill: fitFill, stroke, ...fitExtra });
    const b = { x: -w * ox - half, y: -h * oy - half };
    placeAtOrigin(node, o, b, w + half * 2, h + half * 2);
    addTarget(ac, slot, transformTarget(node, b));
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
    const vertexRefs: { slot: number; sub: number; index: number; m: M }[] = [];
    const skinParts: { skinSlot: number; m: M; sub: number; vslots: number[] }[] = [];
    for (const { i, o: p } of paths) {
      let vslots: number[] = [];
      const m = localMatrix(p);
      let pts: PathPoint[] = [];
      const w = get(p, 'width');
      const h = get(p, 'height');
      const ox = get(p, 'originX');
      const oy = get(p, 'originY');
      let closed = true;
      if (p.type === 'Rectangle') pts = rectPoints(w, h, ox, oy, get(p, 'cornerRadiusTL'), riveRadii(p));
      else if (p.type === 'Ellipse') pts = ellipsePoints(w, h, ox, oy);
      else if (p.type === 'Star') pts = polyPoints(get(p, 'points'), w, h, ox, oy, get(p, 'innerRadius'));
      else if (p.type === 'Polygon') pts = polyPoints(get(p, 'points'), w, h, ox, oy, null);
      else if (p.type === 'Triangle') pts = [{ x: w * (0.5 - ox), y: -h * oy }, { x: w * (1 - ox), y: h * (1 - oy) }, { x: -w * ox, y: h * (1 - oy) }];
      else if (isA(p.type, 'PointsCommonPath')) {
        vslots = (ac.children.get(i) ?? []).filter((vi) => isA(ac.rab.slots[vi].type, 'Vertex'));
        const verts = vslots.map((vi) => ac.rab.slots[vi]);
        pts = vertexPoints(verts);
        const skinSlot = (ac.children.get(i) ?? []).find((ci) => ac.rab.slots[ci].type === 'Skin');
        if (skinSlot !== undefined && get<boolean>(p, 'isHole')) fc.warnings.add('A skinned hole in a path is imported in its rest pose');
        else if (skinSlot !== undefined) skinParts.push({ skinSlot, m, sub: subs.length, vslots });
        closed = !!get<boolean>(p, 'isClosed');
      }
      if (pts.length < 2) continue;
      // Holes wind the other way round, so the shape's nonzero fill leaves them open. Handles swap with the order.
      if (get<boolean>(p, 'isHole')) {
        pts = pts.reverse().map((q) => ({ x: q.x, y: q.y, in: q.out ?? null, out: q.in ?? null }));
        vslots = [];
      }
      if (vslots.length === pts.length) vslots.forEach((slot, index) => vertexRefs.push({ slot, sub: subs.length, index, m }));
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
    outline = pathLength(subs);
    for (const x of strokeL) Object.assign(x.stroke, dashOf(ac, fc, x.st.i, outline));
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
    // Morphing paths: the box has to hold every pose
    for (const ref of vertexRefs)
      for (const anim of ac.rab.anims)
        for (const smp of vertexSamples(ac, ref.slot, anim)) {
          const q = vertexPoint(ac.rab.slots[ref.slot].type, smp.g);
          const a = ap(ref.m, q.x, q.y);
          const hin = q.in ? av(ref.m, q.in.x, q.in.y) : { x: 0, y: 0 };
          const hout = q.out ? av(ref.m, q.out.x, q.out.y) : { x: 0, y: 0 };
          for (const [x, y] of [[a.x, a.y], [a.x + hin.x, a.y + hin.y], [a.x + hout.x, a.y + hout.y]]) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
    const fillRule = fills[0] && get(fills[0].o, 'fillRule') === 1 ? 'evenodd' : 'nonzero';
    node = createNode('path', {
      name,
      fill,
      stroke,
      ...extra,
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
    // Our local point -> the path's own space: undo the shift to the box, then the path's transform inside the shape
    if (skinParts.length) ac.skins.push({ node, parts: skinParts.map((s) => ({ skinSlot: s.skinSlot, sub: s.sub, vslots: s.vslots, toRive: multiply(invert(s.m), [1, 0, 0, 1, minX, minY]) as M })) });
    for (const { i } of paths) addTarget(ac, i, { nodeId: node.id, map: {} });
    for (const ref of vertexRefs) addTarget(ac, ref.slot, { nodeId: node.id, map: {}, vertex: { sub: ref.sub, index: ref.index, m: ref.m, minX, minY } });
  }
  // Keys on each layer's colour, thickness, dashes, trim and feather go to that layer's own paths (`fills.0.color`, `strokes.1.width`)
  const pct = (v: unknown) => r2(Number(v ?? 0) * 100);
  const featherMap = (prefix: string) => ({ strength: { prop: `${prefix}.feather`, f: num() }, offsetX: { prop: `${prefix}.offsetX`, f: num() }, offsetY: { prop: `${prefix}.offsetY`, f: num() } });
  const featherSlot = (slot: number) => (ac.children.get(slot) ?? []).find((ci) => ac.rab.slots[ci]?.type === 'Feather');
  fillL.forEach((x, k) => {
    const prefix = fillPath(k);
    if (x.info.colorSlot !== null) addTarget(ac, x.info.colorSlot, { nodeId: node.id, map: { colorValue: { prop: `${prefix}.color`, f: (v) => argb(Number(v)) } } });
    const fe = featherSlot(x.f.i);
    if (fe !== undefined) addTarget(ac, fe, { nodeId: node.id, map: featherMap(prefix) });
  });
  strokeL.forEach((x, k) => {
    const prefix = strokePath(k);
    if (x.info.colorSlot !== null) addTarget(ac, x.info.colorSlot, { nodeId: node.id, map: { colorValue: { prop: `${prefix}.paint.color`, f: (v) => argb(Number(v)) } } });
    addTarget(ac, x.st.i, { nodeId: node.id, map: { thickness: { prop: `${prefix}.width`, f: num() } } });
    const dashSlot = (ac.children.get(x.st.i) ?? []).find((i) => ac.rab.slots[i]?.type === 'DashPath');
    // A dash offset given as a share of the outline is keyed in px of it (the outline is measured once, at import)
    if (dashSlot !== undefined) addTarget(ac, dashSlot, { nodeId: node.id, map: { offset: { prop: `${prefix}.dashOffset`, f: dashOffsetKey(ac, dashSlot, outline) } } });
    if (x.trim !== undefined) addTarget(ac, x.trim, { nodeId: node.id, map: { start: { prop: `${prefix}.trimStart`, f: pct }, end: { prop: `${prefix}.trimEnd`, f: pct }, offset: { prop: `${prefix}.trimOffset`, f: pct } } });
    const fe = featherSlot(x.st.i);
    if (fe !== undefined) addTarget(ac, fe, { nodeId: node.id, map: featherMap(prefix) });
  });
  const blend = get(o, 'blendModeValue');
  if (blendMap[blend]) node.blendMode = blendMap[blend];
  return node;
}

/** Rectangles/ellipses with an origin other than top-left: x/y keys that follow their animated size. */
let sizeFollowers: { nodeId: string; pathSlot: number; ox: number; oy: number; sx: number; sy: number }[] = [];

/** A font's tables read once, with the glyphs looked up so far (every text of a file with the same font measures against it). */
interface MeasuredFont {
  upm: number;
  metrics: number;
  hmtx: number;
  dv: DataView;
  glyphOf: (cp: number) => number;
}
const fontReaders = new WeakMap<Uint8Array, MeasuredFont | null>();

function readMeasuredFont(bytes: Uint8Array): MeasuredFont | null {
  if (fontReaders.has(bytes)) return fontReaders.get(bytes)!;
  let out: MeasuredFont | null = null;
  try {
    out = parseMeasuredFont(bytes);
  } catch {
    out = null;
  }
  fontReaders.set(bytes, out);
  return out;
}

function parseMeasuredFont(bytes: Uint8Array): MeasuredFont | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = dv.getUint32(0);
  if (magic !== 0x00010000 && magic !== 0x4f54544f && magic !== 0x74727565) return null;
  const tables = new Map<string, number>();
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    tables.set(String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]), dv.getUint32(rec + 8));
  }
  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) return null;
  const upm = dv.getUint16(head + 18);
  const metrics = dv.getUint16(hhea + 34);
  // The Unicode cmap subtable: format 12 (full range) or format 4 (BMP)
  let sub = -1;
  let fmt = 0;
  const count = dv.getUint16(cmap + 2);
  for (let i = 0; i < count; i++) {
    const plat = dv.getUint16(cmap + 4 + i * 8);
    const enc = dv.getUint16(cmap + 6 + i * 8);
    const off = cmap + dv.getUint32(cmap + 8 + i * 8);
    const f = dv.getUint16(off);
    if ((plat === 3 && (enc === 1 || enc === 10)) || plat === 0) {
      if (f === 12 || (f === 4 && fmt !== 12)) {
        sub = off;
        fmt = f;
      }
    }
  }
  if (sub < 0) return null;
  const glyphs = new Map<number, number>();
  const lookup = (cp: number): number => {
    if (fmt === 12) {
      const groups = dv.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const o = sub + 16 + g * 12;
        const start = dv.getUint32(o);
        const end = dv.getUint32(o + 4);
        if (cp >= start && cp <= end) return dv.getUint32(o + 8) + (cp - start);
      }
      return 0;
    }
    const segX2 = dv.getUint16(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let g = 0; g < segX2; g += 2) {
      if (cp > dv.getUint16(ends + g)) continue;
      if (cp < dv.getUint16(starts + g)) return 0;
      const ro = dv.getUint16(ranges + g);
      if (!ro) return (cp + dv.getInt16(deltas + g)) & 0xffff;
      const gi = dv.getUint16(ranges + g + ro + (cp - dv.getUint16(starts + g)) * 2);
      return gi ? (gi + dv.getInt16(deltas + g)) & 0xffff : 0;
    }
    return 0;
  };
  const glyphOf = (cp: number): number => {
    let g = glyphs.get(cp);
    if (g === undefined) glyphs.set(cp, (g = lookup(cp)));
    return g;
  };
  return { upm, metrics, hmtx, dv, glyphOf };
}

/** Width of one line of text in a plain TrueType/OpenType font (advance widths only, no kerning), or null. */
function fontLineWidth(bytes: Uint8Array, line: string, size: number): number | null {
  try {
    const f = readMeasuredFont(bytes);
    if (!f) return null;
    let units = 0;
    for (const ch of line) {
      const gid = f.glyphOf(ch.codePointAt(0)!);
      units += f.dv.getUint16(f.hmtx + Math.min(gid, f.metrics - 1) * 4);
    }
    return (units / f.upm) * size;
  } catch {
    return null;
  }
}

const lineRatios = new WeakMap<Uint8Array, number | null>();
/** The file's own line height for texts whose single-line height was raised to the font's metrics. */
const riveLineHeight = new Map<number, number>();
/** (ascender - descender) / unitsPerEm from an OpenType/TrueType font's head and hhea tables. */
function fontLineRatio(bytes: Uint8Array): number | null {
  if (lineRatios.has(bytes)) return lineRatios.get(bytes)!;
  let ratio: number | null = null;
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const magic = dv.getUint32(0);
    // Plain TrueType/OpenType only (WOFF tables are compressed)
    if (magic !== 0x00010000 && magic !== 0x4f54544f && magic !== 0x74727565) throw new Error('not sfnt');
    const n = dv.getUint16(4);
    let head = -1;
    let hhea = -1;
    for (let i = 0; i < n; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]);
      if (tag === 'head') head = dv.getUint32(rec + 8);
      if (tag === 'hhea') hhea = dv.getUint32(rec + 8);
    }
    if (head >= 0 && hhea >= 0) {
      const upm = dv.getUint16(head + 18);
      const asc = dv.getInt16(hhea + 4);
      const desc = dv.getInt16(hhea + 6);
      if (upm > 0) ratio = (asc - desc) / upm;
    }
  } catch {
    ratio = null;
  }
  lineRatios.set(bytes, ratio);
  return ratio;
}

function convertText(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode {
  riveLineHeight.delete(slot); // slot numbers repeat across artboards
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
  let fontWeight = 400;
  let fontBytes: Uint8Array | null = null;
  if (style) {
    fontSize = r2(get(style, 'fontSize') || 16);
    // Variable font weight axis ('wght')
    for (const ai of ac.children.get(ac.rab.slots.indexOf(style)) ?? []) {
      const ax = ac.rab.slots[ai];
      if (ax.type === 'TextStyleAxis' && get(ax, 'tag') === 0x77676874) fontWeight = Math.round(get(ax, 'axisValue')) || 400;
    }
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
    // A single line is as tall as the font's own ascent + descent in Rive, even with a smaller line height
    fontBytes = fontAsset?.bytes ?? null;
    const natural = fontAsset?.bytes ? fontLineRatio(fontAsset.bytes) : null;
    const runText = runs.map((r) => String(get(r.o, 'text') ?? '')).join('');
    // Rive sizes a line by the file's line height and centres the glyphs in it, as CSS does, so the file's value
    // is used as is. (The font's own metrics are still read, for fonts with no line height set.)
    if (natural && !(get(style, 'lineHeight') > 0)) lineHeight = r2(natural);
    void riveLineHeight;
    void runText;
  }
  // Further runs that use another style become rich text runs: only what differs from the first run's style is stored.
  let textRuns: TextRun[] | undefined;
  if (runs.length > 1) {
    const read = (st: typeof style) => {
      let col = color;
      let fam = fontFamily;
      if (st) {
        const stSlot = ac.rab.slots.indexOf(st);
        for (const pi of ac.children.get(stSlot) ?? []) {
          if (ac.rab.slots[pi].type === 'Fill') {
            const info = paintOf(ac, fc, pi, null);
            if (info.paint?.type === 'solid') col = info.paint.color;
          }
        }
        const fa = fc.file.assets[Number(get(st, 'fontAssetId'))];
        const nm = fa ? String(get(fa.obj, 'name') ?? '') : '';
        if (nm) fam = `"${nm.replace(/\.[^.]+$/, '')}", system-ui, sans-serif`;
      }
      return { fontSize: st ? r2(get(st, 'fontSize') || 16) : fontSize, letterSpacing: st ? r2(get(st, 'letterSpacing')) : letterSpacing, color: col, fontFamily: fam };
    };
    const base = read(style);
    textRuns = runs.map((r) => {
      const st = ac.rab.slots[Number(get(r.o, 'styleId'))];
      const run: TextRun = { text: String(get(r.o, 'text') ?? '') };
      if (!st || st === style) return run;
      const v = read(st);
      if (v.fontSize !== base.fontSize) run.fontSize = v.fontSize;
      if (v.letterSpacing !== base.letterSpacing) run.letterSpacing = v.letterSpacing;
      if (v.color !== base.color) run.color = v.color;
      if (v.fontFamily !== base.fontFamily) run.fontFamily = v.fontFamily;
      return run;
    });
    const patch = runsPatch(textRuns);
    textRuns = patch.runs;
  }
  const ox = get(o, 'originX');
  const oy = get(o, 'originY');
  const sizing = get(o, 'sizingValue');
  let w = get(o, 'width') || 200;
  const h = get(o, 'height') || fontSize * lineHeight;
  let align = (['left', 'right', 'center', 'justify'] as const)[get(o, 'alignValue')] ?? 'left';
  // Auto-width text hangs off its origin (centred on 0.5, ending at 1). Ours is a box of fixed width, so the text
  // gets a box as wide as the font measures it (or an estimate) and aligns to the origin, which puts it where Rive draws it.
  const lines = text.split('\n');
  const measured = fontBytes ? lines.map((l) => fontLineWidth(fontBytes!, l, fontSize)) : [];
  const natural = measured.length && measured.every((m) => m !== null) ? Math.max(...(measured as number[])) + letterSpacing * Math.max(...lines.map((l) => l.length)) : null;
  const widest = natural ?? Math.max(...lines.map((l) => l.length)) * fontSize * 0.6;
  if (sizing === 0 && (natural !== null || ox > 0 || lines.length > 1) && (lines.length === 1 || align === 'center')) {
    w = Math.max(1, Math.ceil(widest) + (natural === null ? 16 : 2));
    align = ox >= 1 && lines.length === 1 ? 'right' : lines.length > 1 || ox === 0.5 ? 'center' : align;
  }
  // Rive: 0 visible, 1 hidden, 2 clipped, 3 ellipsis, 4 fit
  const overflow = (['visible', 'hidden', 'hidden', 'ellipsis', 'hidden'] as const)[get(o, 'overflowValue')] ?? 'visible';
  const node = createNode('text', {
    name: String(o.props.name ?? 'Text'),
    text,
    ...(textRuns ? { runs: textRuns } : {}),
    fontSize,
    fontFamily,
    ...(fontWeight !== 400 ? { fontWeight } : {}),
    color,
    letterSpacing,
    lineHeight,
    align,
    autoSize: sizing === 0 ? 'width' : sizing === 1 ? 'height' : 'none',
    // Vertical alignment inside a fixed box, what happens to lines that don't fit, and no-wrap
    verticalAlign: (['top', 'middle', 'bottom'] as const)[get(o, 'verticalAlignValue')] ?? 'top',
    ...(sizing === 2 && overflow !== 'visible' ? { overflow } : {}),
    ...(get(o, 'wrapValue') === 1 ? { wrap: false } : {}),
  });
  if (get(o, 'overflowValue') === 4) fc.warnings.add('Text that shrinks to fit its box (fit overflow) is clipped at the box instead');
  if (get(o, 'paragraphSpacing') > 0) node.paragraphSpacing = r2(get(o, 'paragraphSpacing'));
  // originValue 1 = the text's y is its first baseline (about 0.95 em below the top of our line box)
  const baselineShift = get(o, 'originValue') === 1 ? -fontSize * 0.95 : 0;
  placeAtOrigin(node, o, { x: -w * ox, y: -h * oy + baselineShift }, w, h);
  addTarget(ac, slot, transformTarget(node, { x: -w * ox, y: -h * oy + baselineShift }));
  importTextModifiers(ac, fc, slot, node, text);
  for (const r of runs) addTarget(ac, r.i, { nodeId: node.id, map: { text: { prop: 'text', f: (v) => String(v) } } });
  for (const cs of textColorSlots) addTarget(ac, cs, { nodeId: node.id, map: { colorValue: { prop: 'color', f: (v) => argb(Number(v)) } } });
  return node;
}

/**
 * Text modifier groups: what they change (move, turn, scale and fade per letter, word or line, by the flags 4, 8, 16 and 32)
 * and their ranges. Each range becomes one of our text modifiers, with the group's changes. Keys on a range or a group
 * follow onto the modifier.
 */
function importTextModifiers(ac: ArtboardCtx, fc: FileCtx, slot: number, node: SceneNode, text: string): void {
  if (node.type !== 'text') return;
  const groups = (ac.children.get(slot) ?? []).filter((i) => ac.rab.slots[i].type === 'TextModifierGroup');
  const others = new Set<string>();
  for (const c of ac.children.get(slot) ?? []) {
    const t = ac.rab.slots[c].type;
    if (isA(t, 'TextModifier') && t !== 'TextModifierGroup') others.add(t);
    for (const g of ac.children.get(c) ?? []) if (isA(ac.rab.slots[g].type, 'TextModifier') && ac.rab.slots[g].type !== 'TextModifierGroup') others.add(ac.rab.slots[g].type);
  }
  for (const t of others) {
    if (t === 'TextFollowPathModifier') fc.warnings.add('Text that follows a path (text follow path modifiers) is not imported; the text stays in its line');
    else if (t === 'TextVariationModifier') fc.warnings.add('Text variation modifiers (variable font axes changed per letter) are not imported');
    else fc.warnings.add(`Text modifiers of type ${t} are not imported`);
  }
  const mods: TextModifier[] = [];
  for (const gi of groups) {
    const g = ac.rab.slots[gi];
    const flags = get(g, 'modifierFlags');
    const ranges = (ac.children.get(gi) ?? []).filter((i) => ac.rab.slots[i].type === 'TextModifierRange');
    if (!ranges.length) continue;
    const move = !!(flags & 4);
    const turn = !!(flags & 8);
    const grow = !!(flags & 16);
    const fade = !!(flags & 32);
    if (!(move || turn || grow || fade)) continue;
    if (grow && Math.abs(get(g, 'scaleX') - get(g, 'scaleY')) > 1e-4) fc.warnings.add('Text modifiers that scale letters differently across and down use the horizontal scale for both');
    const groupTargets: Target[] = [];
    for (const ri of ranges) {
      const r = ac.rab.slots[ri];
      const units = get(r, 'unitsValue');
      const unit = units === 2 ? 'word' : units === 3 ? 'line' : 'letter';
      const byIndex = get(r, 'typeValue') === 1;
      // Counts of what the range counts, to turn index ranges into percentages
      const count = Math.max(1, unit === 'word' ? text.split(/\s+/).filter(Boolean).length : unit === 'line' ? text.split('\n').length : text.replace(/\s/g, '').length);
      const pct = (v: number) => (byIndex ? (v / count) * 100 : v * 100);
      if (units === 0 && /\s/.test(text.trim())) fc.warnings.add('Text modifier ranges that count characters count the spaces too in Rive; here spaces are skipped');
      if (unit === 'line') fc.warnings.add('Text modifier ranges that count lines count the lines as laid out; wrapped text may differ');
      if (get(r, 'modeValue')) fc.warnings.add('Text modifier ranges that combine with others by subtracting, multiplying, min, max or difference are imported as adding');
      if (get(r, 'runId')) fc.warnings.add('Text modifier ranges limited to one text run apply to the whole text');
      const from = get(r, 'falloffFrom');
      const to = get(r, 'falloffTo');
      const shape = from <= 0 && to >= 1 ? 'square' : from > 0 && to < 1 ? 'triangle' : from > 0 ? 'ramp-up' : 'ramp-down';
      if (shape !== 'square') fc.warnings.add('Text modifier falloffs are approximated by a ramp or a triangle');
      const index = mods.length;
      mods.push(
        defaultModifier({
          name: String(r.props.name ?? '') || String(g.props.name ?? '') || `Modifier ${index + 1}`,
          unit,
          start: r2(pct(get(r, 'modifyFrom'))),
          end: r2(pct(get(r, 'modifyTo'))),
          offset: r2(pct(get(r, 'offset'))),
          shape,
          strength: r2(get(r, 'strength') * 100),
          ...(move ? { x: r2(get(g, 'x')), y: r2(get(g, 'y')) } : {}),
          ...(turn ? { rotation: r2(get(g, 'rotation') * DEG) } : {}),
          ...(grow ? { scale: r2(get(g, 'scaleX')) } : {}),
          ...(fade ? { opacity: r2(get(g, 'opacity')) } : {}),
        }),
      );
      // Keys on the range's window and strength
      const map: Target['map'] = { strength: { prop: `modifiers.${index}.strength`, f: num((v) => v * 100) } };
      if (!byIndex) {
        map.modifyFrom = { prop: `modifiers.${index}.start`, f: num((v) => v * 100) };
        map.modifyTo = { prop: `modifiers.${index}.end`, f: num((v) => v * 100) };
        map.offset = { prop: `modifiers.${index}.offset`, f: num((v) => v * 100) };
      } else fc.warnings.add('Keys on the range of text modifiers that count by index are not imported');
      addTarget(ac, ri, { nodeId: node.id, map });
      const gmap: Target['map'] = {};
      if (move) {
        gmap.x = { prop: `modifiers.${index}.x`, f: num() };
        gmap.y = { prop: `modifiers.${index}.y`, f: num() };
      }
      if (turn) gmap.rotation = { prop: `modifiers.${index}.rotation`, f: num((v) => v * DEG) };
      if (grow) gmap.scaleX = { prop: `modifiers.${index}.scale`, f: num() };
      if (fade) gmap.opacity = { prop: `modifiers.${index}.opacity`, f: num() };
      groupTargets.push({ nodeId: node.id, map: gmap });
    }
    for (const t of groupTargets) addTarget(ac, gi, t);
  }
  if (mods.length) node.modifiers = mods;
}

/** An audio asset the file embeds, as a project asset (once). */
function audioAsset(fc: FileCtx, index: number): { id: string; volume: number } | null {
  const asset = fc.file.assets[index];
  if (!asset || !isA(asset.obj.type, 'ExportAudio')) {
    fc.warnings.add('Sound events pointing at a missing audio asset play no sound');
    return null;
  }
  if (!asset.bytes) {
    fc.warnings.add('Audio not embedded in the .riv (referenced or hosted on the CDN) was skipped');
    return null;
  }
  let id = fc.assetIdByIndex.get(index);
  if (!id) {
    id = uid('as');
    fc.assetIdByIndex.set(index, id);
    const mime = mimeOf(asset.bytes);
    const ext = mime === 'audio/mpeg' ? 'mp3' : (mime.split('/')[1] ?? 'audio');
    const base = String(get(asset.obj, 'name') || `sound-${index}`);
    fc.assets.push({ id, name: /\.\w{2,4}$/.test(base) ? base : `${base}.${ext}`, mime, bytes: asset.bytes.slice() });
  }
  return { id, volume: r2(Number(get(asset.obj, 'volume') ?? 1)) };
}

/**
 * The 9-slice of an image: its NSlicer child holds two axes per direction (offsets in image pixels, or 0 to 1 of the
 * size when `normalized`), so the pieces are corner, stretching edge, corner. Tile modes are kept per patch in Rive; here
 * one mode covers the edges and middle.
 */
function imageSlice(ac: ArtboardCtx, fc: FileCtx, slot: number, size: { width: number; height: number }): { slice: NonNullable<ImageNode['slice']>; tile?: 'repeat' } | null {
  const slicer = (ac.children.get(slot) ?? []).find((i) => ac.rab.slots[i].type === 'NSlicer');
  if (slicer === undefined) return null;
  const parts = (ac.children.get(slicer) ?? []).map((i) => ac.rab.slots[i]);
  const stops = (type: string, extent: number) =>
    parts
      .filter((p) => p.type === type)
      .map((p) => (get<boolean>(p, 'normalized') ? Math.min(1, Math.max(0, get(p, 'offset'))) * extent : Math.min(extent, Math.max(0, get(p, 'offset')))))
      .sort((a, b) => a - b);
  const xs = stops('AxisX', size.width);
  const ys = stops('AxisY', size.height);
  if (xs.length !== 2 || ys.length !== 2) {
    fc.warnings.add('A 9-slice image needs two axes in each direction; this one has a different number and imports as a plain image');
    return null;
  }
  const slice = { top: r2(ys[0]), right: r2(size.width - xs[1]), bottom: r2(size.height - ys[1]), left: r2(xs[0]) };
  // Patches count left to right, top to bottom, three to a row; the corners never stretch, so only 1, 3, 4, 5 and 7 can tile
  const modes = new Map(parts.filter((p) => p.type === 'NSlicerTileMode').map((p) => [Number(get(p, 'patchIndex')), Number(get(p, 'style'))] as const));
  const stretchy = [1, 3, 4, 5, 7].map((i) => modes.get(i) ?? 0);
  if ([...modes.values()].some((s) => s === 2)) fc.warnings.add('Hidden patches of a 9-slice image are drawn');
  const repeats = stretchy.filter((s) => s === 1).length;
  if (repeats && repeats < stretchy.length) fc.warnings.add('A 9-slice image tiles all its edges and its middle or none of them; the tile modes were merged');
  return { slice, ...(repeats ? { tile: 'repeat' as const } : {}) };
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
  // 9-slice: an NSlicer child with axes; the image then resizes by stretching only what lies between them
  const sliced = imageSlice(ac, fc, slot, size);
  let w = size.width;
  let h = size.height;
  if (sliced) {
    node.slice = sliced.slice;
    if (sliced.tile) node.sliceTile = sliced.tile;
    // Rive resizes a sliced image by its scale, keeping the corners at their pixel size; here the box is resized instead (unless the scale is animated)
    const sx = get(o, 'scaleX');
    const sy = get(o, 'scaleY');
    const animated = ac.rab.anims.some((an) => an.keyed.some((k) => Number(k.obj.props.objectId ?? 0) === slot));
    if (!animated && sx > 0 && sy > 0 && (sx !== 1 || sy !== 1)) {
      w = size.width * sx;
      h = size.height * sy;
    }
  }
  placeAtOrigin(node, o, { x: -w * ox, y: -h * oy }, w, h);
  if (w !== size.width || h !== size.height) {
    node.scaleX = 1;
    node.scaleY = 1;
  }
  addTarget(ac, slot, transformTarget(node, { x: -w * ox, y: -h * oy }));
  // A mesh: its vertices sit in the image's own space (origin at the image's origin), so ours move by the same box offset
  const meshSlot = (ac.children.get(slot) ?? []).find((i) => ac.rab.slots[i].type === 'Mesh');
  if (meshSlot !== undefined) {
    const b = { x: -size.width * ox, y: -size.height * oy };
    const vslots = (ac.children.get(meshSlot) ?? []).filter((i) => ac.rab.slots[i].type === 'MeshVertex');
    const triangles = pathIds(ac.rab.slots[meshSlot].props.triangleIndexBytes).filter((i) => i < vslots.length);
    if (vslots.length >= 3 && triangles.length >= 3) {
      node.mesh = {
        vertices: vslots.map((vi) => {
          const v = ac.rab.slots[vi];
          return { x: r2(get(v, 'x') - b.x), y: r2(get(v, 'y') - b.y), u: Math.round(get(v, 'u') * 10000) / 10000, v: Math.round(get(v, 'v') * 10000) / 10000 };
        }),
        triangles: triangles.slice(0, triangles.length - (triangles.length % 3)),
        skin: null,
      };
      const skinSlot = (ac.children.get(meshSlot) ?? []).find((i) => ac.rab.slots[i].type === 'Skin');
      if (skinSlot !== undefined) ac.skins.push({ node, parts: [{ skinSlot, sub: 0, vslots, toRive: [1, 0, 0, 1, b.x, b.y] }] });
    }
  }
  return node;
}

// ---------------------------------------------------------------- layout (Rive layouts are Yoga flexbox)

const ALIGN3 = ['start', 'center', 'end'] as const;

/**
 * What percent values in a layout style resolve against. Rive resolves a percent padding, margin or gap against the
 * width of the layout that owns the node (its parent's inner width; the artboard's root layout uses its own width),
 * for both axes, and a percent inset against the parent's inner width or height. The file keeps a px size per layout,
 * so these are worked out once at import.
 */
interface LayoutBox {
  w: number;
  h: number;
  /** Padding plus border, in px. */
  pad: { top: number; right: number; bottom: number; left: number };
  innerW: number;
  innerH: number;
  /** The width percent values of this layout's own style resolve against. */
  ownerW: number;
  /** Its children flow along a row, or sit in a grid or stack (which size them per axis, with no flex basis). */
  row: boolean;
  grid: boolean;
}

const styleOfSlot = (ac: ArtboardCtx, slot: number): RObj | undefined => {
  const o = ac.rab.slots[slot];
  return o?.props.styleId !== undefined ? ac.rab.slots[Number(o.props.styleId)] : undefined;
};

/** The nearest layout (or the artboard) above a slot. */
function layoutParent(ac: ArtboardCtx, slot: number): number | undefined {
  let s = Number(ac.rab.slots[slot]?.props.parentId ?? 0);
  for (let guard = 0; guard < 200; guard++) {
    if (s === 0 || isA(ac.rab.slots[s]?.type ?? '', 'LayoutComponent')) return slot === 0 ? undefined : s;
    s = Number(ac.rab.slots[s]?.props.parentId ?? 0);
  }
  return undefined;
}

/** A style value in px: points as they are, percent of `owner`, anything else (not set, auto) as 0. */
function unitPx(style: RObj | undefined, key: string, owner: number): number {
  if (!style) return 0;
  const u = get(style, `${key}UnitsValue`);
  return u === 1 ? get(style, key) : u === 2 ? (get(style, key) / 100) * owner : 0;
}

function layoutBox(ac: ArtboardCtx, slot: number): LayoutBox {
  const o = ac.rab.slots[slot];
  const style = styleOfSlot(ac, slot);
  const parent = slot === 0 ? undefined : layoutParent(ac, slot);
  const po = parent === undefined ? undefined : layoutBox(ac, parent);
  // A layout's own size, when it is a percent of its parent's inner size
  const size = (key: 'width' | 'height', scale: string, owner: number | undefined) =>
    style && owner !== undefined && get(style, scale) === 0 && get(style, `${key}UnitsValue`) === 2 ? (get(o, key) / 100) * owner : get(o, key);
  const w = size('width', 'layoutWidthScaleType', po?.innerW);
  const h = size('height', 'layoutHeightScaleType', po?.innerH);
  const ownerW = po ? po.innerW : w;
  const pad = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const [side, k] of [['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left']] as const) pad[side] = unitPx(style, `padding${k}`, ownerW) + unitPx(style, `border${k}`, ownerW);
  const dir = style ? get(style, 'flexDirectionValue') : 2;
  return { w, h, pad, innerW: Math.max(0, w - pad.left - pad.right), innerH: Math.max(0, h - pad.top - pad.bottom), ownerW, row: dir === 2 || dir === 3, grid: !!style && get(style, 'layoutTypeValue') > 0 };
}

/** A Rive layout style as our auto layout. `tracks` are the GridTrack children of a grid layout. */
function autoLayoutOf(fc: FileCtx, style: RObj | undefined, box?: LayoutBox, tracks: RObj[] = []): AutoLayout {
  const dirValue = style ? get(style, 'flexDirectionValue') : 2;
  const row = dirValue === 2 || dirValue === 3;
  // column-reverse (1) and row-reverse (3) list the children from the other end
  const reversed = dirValue === 1 || dirValue === 3;
  const kind = style ? get(style, 'layoutTypeValue') : 0;
  if (reversed && kind === 0 && style && get(style, 'layoutAlignmentType') < 9) fc.warnings.add('Reversed layout directions reverse the order of the children; their start and end alignment stays on the same sides');
  const t = style ? get(style, 'layoutAlignmentType') : 0;
  let justify: AutoLayout['justify'];
  let align: AutoLayout['align'];
  if (t >= 9) {
    justify = 'space-between';
    align = ALIGN3[t - 9] ?? 'start';
  } else {
    // The 9 positions name screen directions, so they swap with the main axis
    const horizontal = ALIGN3[t % 3];
    const vertical = ALIGN3[Math.floor(t / 3)];
    justify = row ? horizontal : vertical;
    align = row ? vertical : horizontal;
  }
  const ownerW = box?.ownerW ?? 0;
  // Yoga ignores values without a unit; a layout's border takes room inside it like padding does
  const pad = box?.pad ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // Rive lays out with Yoga, which ignores negative gaps (negative margins still apply)
  const gapH = Math.max(0, unitPx(style, 'gapHorizontal', ownerW));
  const gapV = Math.max(0, unitPx(style, 'gapVertical', ownerW));
  const wrap = style ? get(style, 'flexWrapValue') === 1 && kind === 0 : false;
  const layout: AutoLayout = {
    direction: row ? 'row' : 'column',
    gap: r2(row ? gapH : gapV),
    padding: { top: r2(pad.top), right: r2(pad.right), bottom: r2(pad.bottom), left: r2(pad.left) },
    justify,
    align,
    wrap,
    hugWidth: !!style && (get(style, 'layoutWidthScaleType') === 2 || get(style, 'widthUnitsValue') === 3),
    hugHeight: !!style && (get(style, 'layoutHeightScaleType') === 2 || get(style, 'heightUnitsValue') === 3),
    // Rive lists children in layout order; ours are drawn back to front
    reverse: !reversed,
  };
  // The gap between wrapped lines is the other axis's
  if (wrap && gapH !== gapV) layout.crossGap = r2(row ? gapV : gapH);
  if (kind === 1 || kind === 2) {
    // Grid (1) and stack (2): the columns' gap is the horizontal one, the rows' the vertical one
    layout.direction = 'row';
    layout.gap = r2(gapH);
    layout.wrap = false;
    layout.reverse = true;
    if (gapH !== gapV) layout.crossGap = r2(gapV);
    else delete layout.crossGap;
    layout.grid = gridOf(fc, style!, tracks, kind === 2, t);
  }
  return layout;
}

const TRACK_TYPES = ['auto', 'px', 'percent', 'fr'] as const;

/**
 * A grid or stack layout's tracks and how it places what is in them. The alignment's 9 positions (and the 3 spread ones)
 * name where the stack puts its layers. A grid honours them only as far as the Rive runtime does: it centres the tracks
 * (and the layers in their rows) for "centre", spreads the columns for the spread ones, and leaves "end" at the start.
 */
function gridOf(fc: FileCtx, style: RObj, tracks: RObj[], stack: boolean, align: number): GridLayout {
  const track = (o: RObj): GridTrack => {
    if (get(o, 'trackMaxType') && (get(o, 'trackMaxType') !== get(o, 'trackType') || get(o, 'trackMaxValue') !== get(o, 'trackValue'))) fc.warnings.add('Grid tracks with a separate maximum size use their minimum size');
    const type = TRACK_TYPES[get(o, 'trackType')] ?? 'auto';
    return type === 'auto' ? { type } : { type, value: r2(get(o, 'trackValue')) };
  };
  const of = (collection: number) => tracks.filter((o) => get(o, 'collection') === collection).map(track);
  const grid: GridLayout = { columns: of(0), rows: of(1) };
  const spread = align >= 9;
  const h = spread ? 'space-between' : ALIGN3[align % 3];
  const v = spread ? ALIGN3[align - 9] : ALIGN3[Math.floor(align / 3)];
  if (stack) {
    grid.stack = true;
    if (h !== 'start' && h !== 'space-between') grid.justifyItems = h;
    if (v !== 'start') grid.alignItems = v;
    return grid;
  }
  if (h === 'center' || h === 'space-between') grid.justifyContent = h;
  if (v === 'center') {
    grid.alignContent = 'center';
    grid.alignItems = 'center';
  }
  // The style's own justify-items (how a layer sits in its cell across the columns): 1 is the centre, 9 the end
  const ji = get(style, 'justifyItemsValue');
  if (ji === 1) grid.justifyItems = 'center';
  else if (ji === 9) grid.justifyItems = 'end';
  return grid;
}

/** How a Rive layout node sits in its parent layout. `parent` is the box it sits in (for percent margins and insets). */
function layoutItemOf(style: RObj | undefined, size: { width: number; height: number }, scale?: { w: number; h: number; wu: number; hu: number }, parent?: LayoutBox, own?: { o: RObj; placement?: RObj }): LayoutItem {
  const it: LayoutItem = {};
  const sw = scale ? scale.w : style ? get(style, 'layoutWidthScaleType') : 0;
  const sh = scale ? scale.h : style ? get(style, 'layoutHeightScaleType') : 0;
  const wu = scale ? scale.wu : style ? get(style, 'widthUnitsValue') : 1;
  const hu = scale ? scale.hu : style ? get(style, 'heightUnitsValue') : 1;
  it.width = sw === 1 ? 'fill' : sw === 2 || wu === 3 ? 'hug' : wu === 2 ? 'percent' : 'fixed';
  it.height = sh === 1 ? 'fill' : sh === 2 || hu === 3 ? 'hug' : hu === 2 ? 'percent' : 'fixed';
  if (it.width === 'percent') it.widthPercent = size.width;
  if (it.height === 'percent') it.heightPercent = size.height;
  if (style) {
    // Margins: points, or a percent of the parent's inner width (either axis); auto takes the free space
    const ownerW = parent?.innerW ?? 0;
    const sides = [['top', 'Top'], ['right', 'Right'], ['bottom', 'Bottom'], ['left', 'Left']] as const;
    const m = { top: 0, right: 0, bottom: 0, left: 0 };
    const auto: NonNullable<LayoutItem['marginAuto']> = {};
    for (const [side, k] of sides) {
      m[side] = unitPx(style, `margin${k}`, ownerW);
      if (get(style, `margin${k}UnitsValue`) === 3) auto[side] = true;
    }
    if (m.top || m.right || m.bottom || m.left) it.margin = { top: r2(m.top), right: r2(m.right), bottom: r2(m.bottom), left: r2(m.left) };
    if (Object.keys(auto).length) it.marginAuto = auto;
    if (get(style, 'positionTypeValue') === 2) {
      it.position = 'absolute';
      const inset: NonNullable<LayoutItem['inset']> = {};
      for (const side of ['Left', 'Top', 'Right', 'Bottom'] as const) {
        // Units 0 = not set; points as they are, a percent of the parent's inner width (left, right) or height (top, bottom)
        const owner = (side === 'Left' || side === 'Right' ? parent?.innerW : parent?.innerH) ?? 0;
        if (get(style, `position${side}UnitsValue`) !== 0 && get(style, `position${side}UnitsValue`) !== 3) inset[side.toLowerCase() as 'left'] = r2(unitPx(style, `position${side}`, owner));
      }
      it.inset = inset;
    }
    if (own && parent && it.position !== 'absolute') {
      if (parent.grid) {
        const pl = own.placement;
        if (pl) {
          for (const [key, k] of [['gridColumn', 'gridColumn'], ['gridRow', 'gridRow']] as const) if (get(pl, k)) it[key] = get(pl, k);
          for (const [key, k] of [['gridColumnSpan', 'gridColumnSpan'], ['gridRowSpan', 'gridRowSpan']] as const) if (get(pl, k) > 1) it[key] = get(pl, k);
        }
      } else if ((parent.row ? it.width : it.height) === 'fill') {
        // A fill layer's weight, and what it starts from before the free space is shared (the flex basis; auto is its content)
        const weight = get(own.o, parent.row ? 'fractionalWidth' : 'fractionalHeight');
        if (weight !== 1) it.grow = Math.round(weight * 1000) / 1000;
        const units = get(style, 'flexBasisUnitsValue');
        if (units === 1) it.basis = r2(get(style, 'flexBasis'));
        else if (units === 2) it.basisPercent = r2(get(style, 'flexBasis'));
        else it.basis = 'content';
      }
    }
    // Aspect ratio (width over height): a hugging size follows the other one. With the height-only mode the width never does.
    const ratio = get(style, 'aspectRatio');
    if (ratio > 0 && (it.width === 'hug') !== (it.height === 'hug')) {
      const heightOnly = get(style, 'aspectRatioAxisValue') === 1;
      if (!(heightOnly && it.width === 'hug')) {
        it.aspectRatio = Math.round(ratio * 10000) / 10000;
        if (heightOnly) it.aspectDerive = 'height';
      }
    }
  }
  return it;
}

/** Rive layout participants: everything else inside a layout keeps its own position. */
function takesPart(t: string): boolean {
  // A plain nested artboard is a transform node in Rive's layout, not a layout item: it keeps its own x and y (leaf and layout nested artboards are sized by the layout)
  return isA(t, 'LayoutComponent') || t === 'ArtboardComponentList' || t === 'NestedArtboardLeaf' || t === 'NestedArtboardLayout' || t === 'Text';
}

/**
 * An artboard component list: a layer that shows one artboard per item of a view model list. Ours is a repeater: a frame
 * that repeats an instance of the item artboard once per item of the list variable, laid out along the parent's direction.
 * The items carry no data of their own here (the view model values the item artboards read are shared), so every item
 * starts as the artboard does.
 */
function convertList(ac: ArtboardCtx, fc: FileCtx, slot: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const name = String(o.props.name ?? 'List');
  const rules = (ac.children.get(slot) ?? []).filter((i) => ac.rab.slots[i].type === 'ArtboardListMapRule');
  const bind = ac.rab.binds.find((b) => (b.slot === slot || rules.includes(b.slot)) && b.obj.type === 'DataBindContext' && classProps('ArtboardComponentList').get(Number(b.obj.props.propertyKey))?.name === 'listSource');
  const source = bind ? vmVariable(fc, bind.obj) : null;
  if (!source || source.kind !== 'list') {
    fc.warnings.add(`The list "${name}" has no list property to repeat over; it was skipped`);
    return null;
  }
  const artboards = [...new Set(rules.map((i) => Number(ac.rab.slots[i].props.artboardId ?? -1)))].filter((a) => fc.file.artboards[a]);
  if (!artboards.length) {
    fc.warnings.add(`The list "${name}" has no artboard to show for its items; it was skipped`);
    return null;
  }
  if (artboards.length > 1) fc.warnings.add(`The list "${name}" shows different artboards for different kinds of items; every item shows the first (${String(fc.file.artboards[artboards[0]].obj.props.name ?? 'artboard')})`);
  fc.warnings.add(`The list "${name}" repeats its item artboard once per item; the values each item carries (its own view model) are not passed to the items`);
  const target = artboards[0];
  const tab = fc.file.artboards[target].obj;
  const w = Math.max(1, Math.round(get(tab, 'width')));
  const h = Math.max(1, Math.round(get(tab, 'height')));
  const inst = createNode('instance', { name: String(tab.props.name ?? 'Item'), artboardId: fc.abIds[target] ?? '', fit: 'contain' });
  inst.width = w;
  inst.height = h;
  inst.x = 0;
  inst.y = 0;
  inst.originX = 0;
  inst.originY = 0;
  // Along the parent's direction, with its gap
  const parentSlot = Number(o.props.parentId ?? 0);
  const parent = ac.nodeBySlot.get(parentSlot);
  const rootStyle = parentSlot === 0 && ac.rab.obj.props.styleId !== undefined ? ac.rab.slots[Number(ac.rab.obj.props.styleId)] : undefined;
  const parentLayout = parentSlot === 0 ? (rootStyle ? autoLayoutOf(fc, rootStyle, layoutBox(ac, 0)) : null) : parent?.type === 'frame' ? parent.layout : null;
  const flow = parentLayout && !parentLayout.grid ? parentLayout : null;
  const list = createNode('frame', {
    name,
    width: w,
    height: h,
    fill: null,
    stroke: null,
    cornerRadius: 0,
    clip: false,
    layout: { direction: flow?.direction ?? 'column', gap: flow?.gap ?? 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'start', align: 'start', wrap: false, hugWidth: true, hugHeight: true },
    repeat: { items: source.name, layout: 'none', gap: 0, columns: 1 },
    children: [inst],
  });
  list.x = r2(get(o, 'x'));
  list.y = r2(get(o, 'y'));
  list.originX = 0;
  list.originY = 0;
  list.rotation = r2(get(o, 'rotation') * DEG);
  list.scaleX = r2(get(o, 'scaleX'));
  list.scaleY = r2(get(o, 'scaleY'));
  list.opacity = r2(get(o, 'opacity'));
  addTarget(ac, slot, transformTarget(list, { x: 0, y: 0 }));
  return list;
}

function convertSlot(ac: ArtboardCtx, fc: FileCtx, slot: number, abIndex: number): SceneNode | null {
  const o = ac.rab.slots[slot];
  const t = o.type;
  let node: SceneNode | null = null;
  if (isA(t, 'Shape')) node = convertShape(ac, fc, slot);
  else if (t === 'Text') node = convertText(ac, fc, slot);
  else if (t === 'Image') node = convertImage(ac, fc, slot);
  else if (isA(t, 'NestedArtboard')) {
    // A nested artboard is an instance of that artboard: it runs on its own in the player
    const target = Number(get(o, 'artboardId'));
    const tab = fc.file.artboards[target]?.obj;
    const tw = tab ? get(tab, 'width') : 100;
    const th = tab ? get(tab, 'height') : 100;
    const fitMap: Record<number, 'fill' | 'contain' | 'cover' | 'none'> = { 0: 'fill', 1: 'contain', 2: 'cover', 5: 'none' };
    const fit = t === 'NestedArtboardLeaf' ? fitMap[get(o, 'fit')] ?? 'contain' : 'fill';
    const inst = createNode('instance', { name: String(o.props.name ?? tab?.props.name ?? 'Nested artboard'), artboardId: fc.abIds[target] ?? '', fit });
    // The nested artboard's origin sits on this node's origin
    const b = { x: -tw * (tab ? get(tab, 'originX') : 0), y: -th * (tab ? get(tab, 'originY') : 0) };
    placeAtOrigin(inst, o, b, tw, th);
    addTarget(ac, slot, transformTarget(inst, b));
    // Starting input values of the nested state machine
    for (const ci of ac.children.get(slot) ?? []) {
      const nsm = ac.rab.slots[ci];
      if (nsm.type === 'NestedSimpleAnimation' || nsm.type === 'NestedRemapAnimation') fc.warnings.add('Nested artboards set to play a single animation run their own state machine instead');
      if (nsm.type !== 'NestedStateMachine') continue;
      for (const ii of ac.children.get(ci) ?? []) {
        const inp = ac.rab.slots[ii];
        if (inp.type === 'NestedBool' || inp.type === 'NestedNumber')
          fc.pendingInputs.push({ node: inst, artboard: target, machine: Number(get(nsm, 'animationId')), input: Number(get(inp, 'inputId')), value: inp.type === 'NestedBool' ? !!get<boolean>(inp, 'nestedValue') : r2(get(inp, 'nestedValue')) });
      }
    }
    if (get<boolean>(o, 'isPaused')) fc.warnings.add('Paused nested artboards play in the player');
    if (t === 'NestedArtboardLeaf') {
      // A leaf fills its layout parent, fitted per its fit mode, and keeps its own offset from it (Rive moves it by x and y)
      const dx = r2(get(o, 'x'));
      const dy = r2(get(o, 'y'));
      inst.layoutItem = { position: 'absolute', width: 'fill', height: 'fill', inset: { left: dx, top: dy, right: -dx, bottom: -dy } };
    } else if (t === 'NestedArtboardLayout') {
      const iw = get(o, 'instanceWidth');
      const ih = get(o, 'instanceHeight');
      if (iw > 0) inst.width = r2(iw);
      if (ih > 0) inst.height = r2(ih);
      inst.layoutItem = layoutItemOf(undefined, { width: iw, height: ih }, { w: get(o, 'instanceWidthScaleType'), h: get(o, 'instanceHeightScaleType'), wu: get(o, 'instanceWidthUnitsValue'), hu: get(o, 'instanceHeightUnitsValue') });
      // Sized by the layout: stretch the artboard into the box Rive gives it
      inst.fit = 'fill';
    }
    node = inst;
  } else if (isA(t, 'LayoutComponent')) {
    // A layout box: our frame with auto layout from its style, a background from its paints
    const style = o.props.styleId !== undefined ? ac.rab.slots[Number(o.props.styleId)] : undefined;
    const w = get(o, 'width');
    const h = get(o, 'height');
    const bg = (ac.children.get(slot) ?? []).map((i) => ({ i, o: ac.rab.slots[i] }));
    const kids = (of: number, type: string) => (ac.children.get(of) ?? []).map((i) => ac.rab.slots[i]).filter((k) => k.type === type);
    const fillK = bg.find((k) => k.o.type === 'Fill' && get<boolean>(k.o, 'isVisible') !== false);
    const strokeK = bg.find((k) => k.o.type === 'Stroke' && get<boolean>(k.o, 'isVisible') !== false);
    const strokePaint = strokeK ? paintOf(ac, fc, strokeK.i, null).paint : null;
    const f = createNode('frame', {
      name: String(o.props.name ?? 'Layout'),
      fill: fillK ? paintOf(ac, fc, fillK.i, null).paint : null,
      stroke: strokeK && strokePaint ? { paint: strokePaint, width: r2(get(strokeK.o, 'thickness')), ...dashOf(ac, fc, strokeK.i, boxPerimeter(w, h, riveRadii(style) ?? Array<number>(4).fill(style ? get(style, 'cornerRadiusTL') : 0))) } : null,
      cornerRadius: style ? r2(get(style, 'cornerRadiusTL')) : 0,
      ...(riveRadii(style) ? { cornerRadii: riveRadii(style)! } : {}),
      clip: !!get<boolean>(o, 'clip'),
      layout: autoLayoutOf(fc, style, layoutBox(ac, slot), kids(slot, 'GridTrack')),
      layoutItem: layoutItemOf(style, { width: w, height: h }, undefined, (() => { const p = layoutParent(ac, slot); return p === undefined ? undefined : layoutBox(ac, p); })(), { o, placement: kids(slot, 'GridItemPlacement')[0] }),
    });
    placeAtOrigin(f, o, { x: 0, y: 0 }, w, h);
    f.originX = 0;
    f.originY = 0;
    if (strokeK) {
      const dashSlot = (ac.children.get(strokeK.i) ?? []).find((i) => ac.rab.slots[i]?.type === 'DashPath');
      if (dashSlot !== undefined) addTarget(ac, dashSlot, { nodeId: f.id, map: { offset: { prop: 'stroke.dashOffset', f: dashOffsetKey(ac, dashSlot, boxPerimeter(w, h, riveRadii(style) ?? Array<number>(4).fill(style ? get(style, 'cornerRadiusTL') : 0))) } } });
    }
    if (style && get(style, 'displayValue') === 1) f.visible = false;
    addTarget(ac, slot, transformTarget(f, { x: 0, y: 0 }));
    node = f;
  } else if (t === 'ArtboardComponentList') {
    node = convertList(ac, fc, slot);
  } else if (isA(t, 'Node')) {
    if (t === 'NSlicedNode') fc.warnings.add('N-sliced nodes (groups resized by slice axes) import as plain groups; their contents are not stretched');
    const g = createNode('group', { name: String(o.props.name ?? t) });
    placeAtOrigin(g, o, { x: 0, y: 0 }, 0, 0);
    g.originX = 0;
    g.originY = 0;
    addTarget(ac, slot, transformTarget(g, { x: 0, y: 0 }));
    node = g;
  } else if (isA(t, 'Bone')) {
    // A bone's base is its origin, and a child bone sits at its parent's tip (Rive stores no x or y for it)
    const parentSlot = Number(o.props.parentId ?? 0);
    const parent = ac.rab.slots[parentSlot];
    const underBone = !!parent && isA(parent.type, 'Bone');
    const bone = createNode('bone', { name: String(o.props.name ?? 'Bone') });
    bone.width = r2(get(o, 'length'));
    bone.height = 0;
    bone.originX = 0;
    bone.originY = 0;
    bone.rotation = r2(get(o, 'rotation') * DEG);
    bone.scaleX = r2(get(o, 'scaleX'));
    bone.scaleY = r2(get(o, 'scaleY'));
    if (underBone) {
      bone.x = r2(get(parent, 'length'));
      bone.y = 0;
      // The parent's length is what keeps the child at its tip, so a keyed length moves the child as well
      addTarget(ac, parentSlot, { nodeId: bone.id, map: { length: { prop: 'x', f: num() } } });
    } else {
      bone.x = r2(get(o, 'x'));
      bone.y = r2(get(o, 'y'));
    }
    // x and y keys only exist on a root bone; a child bone's position comes from its parent
    const t = transformTarget(bone, { x: 0, y: 0 });
    if (underBone) {
      delete t.map.x;
      delete t.map.y;
    }
    delete t.map.opacity;
    t.map.length = { prop: 'width', f: num() };
    addTarget(ac, slot, t);
    node = bone;
  } else if (isA(t, 'Constraint')) {
    // Translation and transform constraints are imported by importConstraints; the rest are reported there too
  } else if (t === 'ClippingShape' || t === 'DrawRules' || t === 'DrawTarget') {
    // Handled by the layer they belong to (clipWrap, drawRules)
  }
  if (!node) return null;
  ac.nodeBySlot.set(slot, node);
  if (node.type === 'group' || node.type === 'frame' || node.type === 'bone') {
    // Rive lists children front-most first; ours go back to front
    for (const ci of [...(ac.children.get(slot) ?? [])].reverse()) {
      if (isA(ac.rab.slots[ci].type, 'Path') || isA(ac.rab.slots[ci].type, 'ShapePaint')) continue;
      const c = convertSlot(ac, fc, ci, abIndex);
      if (!c) continue;
      if (node.type === 'frame' && node.layout && !takesPart(ac.rab.slots[ci].type)) c.layoutItem = { position: 'ignore' };
      // Text in a Rive layout takes the layout's width and wraps (unless the layout hugs its content, when the text sets the
      // width: it then wraps at the room its own parent has left and its box shrinks to its widest line), and its height
      // follows the lines
      if (c.type === 'text' && node.type === 'frame' && node.layout) {
        const hugW = node.layoutItem?.width === 'hug';
        c.layoutItem = { width: hugW ? 'hug' : 'fill', height: 'hug', ...(hugW && c.wrap !== false ? { wrapText: true } : {}) };
        c.autoSize = hugW ? 'width' : 'height';
        // Wrapped text keeps the file's line spacing
        if (!hugW && riveLineHeight.has(ci)) c.lineHeight = riveLineHeight.get(ci)!;
      }
      node.children.push(clipWrap(ac, fc, ci, c, slot, abIndex, !!(node.type === 'frame' && node.layout)));
    }
    applyDrawRules(ac, fc, slot, node);
    if (o.type === 'Solo') {
      // activeComponentId is a slot; our solo names the child layer by id
      node.solo = { active: entryOf(ac, Number(get(o, 'activeComponentId')))?.id ?? null };
      ac.solos.set(slot, (ac.children.get(slot) ?? []).filter((ci) => ac.nodeBySlot.has(ci)));
    }
  }
  return node;
}

/** The layer a slot appears as in its parent's list: its clip wrapper when it has one. */
function entryOf(ac: ArtboardCtx, slot: number): SceneNode | undefined {
  return ac.wrapBySlot.get(slot) ?? ac.nodeBySlot.get(slot);
}

/** Rive node transform (x, y, rotation, scale) as a matrix, in its parent's space. */
function riveMatrix(o: RObj): Matrix {
  return nodeMatrix({ x: get(o, 'x'), y: get(o, 'y'), width: 0, height: 0, rotation: get(o, 'rotation') * DEG, scaleX: get(o, 'scaleX'), scaleY: get(o, 'scaleY'), originX: 0, originY: 0 });
}

/** Maps a slot's own space to the artboard's, through its ancestors' transforms. */
function worldOf(ac: ArtboardCtx, slot: number): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  for (let s = slot, guard = 0; s > 0 && guard < 200; s = Number(ac.rab.slots[s].props.parentId ?? 0), guard++) m = multiply(riveMatrix(ac.rab.slots[s]), m);
  return m;
}

/** Whether `slot` is `ancestor` or sits somewhere under it. */
function within(ac: ArtboardCtx, slot: number, ancestor: number): boolean {
  for (let s = slot, guard = 0; s > 0 && guard < 200; s = Number(ac.rab.slots[s]?.props.parentId ?? 0), guard++) if (s === ancestor) return true;
  return false;
}

/**
 * Rive clips a layer (and everything under it) with a ClippingShape that points at another shape. Ours masks the layers
 * above a mask inside one parent, so the clipped layer goes into a small group of its own with a masking copy of the
 * clip shape in front of it. Several clips nest, one group each.
 */
function clipWrap(ac: ArtboardCtx, fc: FileCtx, slot: number, layer: SceneNode, parentSlot: number, abIndex: number, inLayout: boolean): SceneNode {
  // Layer masks are the same thing with any layer as the source (a group of shapes, an image); only their on / off switch differs
  const clips = (ac.children.get(slot) ?? []).filter((c) => {
    const o = ac.rab.slots[c];
    return (o.type === 'ClippingShape' && get<boolean>(o, 'isVisible')) || (o.type === 'LayerMask' && !!(get(o, 'maskFlags') & 4));
  });
  if (!clips.length) return layer;
  if (inLayout || takesPart(ac.rab.slots[slot].type)) {
    fc.warnings.add('Clipping shapes and layer masks on layers inside a layout are not imported; those layers show unclipped');
    return layer;
  }
  let out = layer;
  // Where the clipped layer's parent sits, to carry each clip shape's position over into it
  const toParent = invert(worldOf(ac, parentSlot));
  for (const cs of clips) {
    const src = Number(get(ac.rab.slots[cs], 'sourceId'));
    const srcSlot = ac.rab.slots[src];
    const isMask = ac.rab.slots[cs].type === 'LayerMask';
    if (isMask) {
      const flags = get(ac.rab.slots[cs], 'maskFlags');
      if (!srcSlot || src === 0 || within(ac, src, slot) || within(ac, slot, src) || isA(srcSlot.type, 'Constraint') || !(srcSlot.type === 'Node' || isA(srcSlot.type, 'Drawable'))) {
        fc.warnings.add('A layer mask whose source layer could not be found was skipped');
        continue;
      }
      if (flags & 1) {
        fc.warnings.add('Layer masks that invert the source are not imported; those layers show unmasked');
        continue;
      }
      if (flags & 2) fc.warnings.add('Luminance layer masks are imported as alpha masks (the shape covers, no matter its brightness)');
      if (flags & 16) fc.warnings.add('Layer masks with custom bounds are imported without the bounds');
      if (get(ac.rab.slots[cs], 'resolution') !== 1 && 'resolution' in ac.rab.slots[cs].props) fc.warnings.add('Layer mask resolution is ignored');
      if (!(flags & 8)) ac.maskHidden.push(src);
    } else if (!srcSlot || !isA(srcSlot.type, 'Shape')) {
      fc.warnings.add('A clipping shape that does not point at a shape was skipped');
      continue;
    }
    // Convert the clip shape on a scratch copy so the real layer keeps its animation targets
    const scratch: ArtboardCtx = { ...ac, targets: new Map(), nodeBySlot: new Map(), solos: new Map(), wrapBySlot: new Map(), drawRules: new Map() };
    const shape = convertSlot(scratch, fc, src, abIndex);
    if (!shape) continue;
    shape.visible = true;
    if (!isMask) shape.opacity = 1;
    ac.clones.set(src, [...(ac.clones.get(src) ?? []), shape]);
    // The clip shape's own animation (a morphing wave line, a moving rectangle) has to move the mask copy too; its
    // opacity does not matter to a clip
    for (const [tslot, list] of scratch.targets)
      for (const t of list) {
        const map = { ...t.map };
        if (!isMask) delete map.opacity;
        addTarget(ac, tslot, { ...t, map });
      }
    // Clip shape's space -> the parent's space, as a plain translate/rotate/scale
    const x = multiply(toParent, worldOf(ac, Number(ac.rab.slots[src].props.parentId ?? 0)));
    const sx = Math.hypot(x[0], x[1]) || 1;
    const sy = (x[0] * x[3] - x[1] * x[2]) / sx || 1;
    const mask = createNode('group', { name: `${shape.name} (mask)`, children: [shape] });
    mask.mask = true;
    mask.width = mask.height = 0.01;
    mask.originX = mask.originY = 0;
    mask.x = r2(x[4]);
    mask.y = r2(x[5]);
    mask.rotation = r2(Math.atan2(x[1], x[0]) * DEG);
    mask.scaleX = r2(sx);
    mask.scaleY = r2(sy);
    const wrap = createNode('group', { name: `${layer.name} (clipped)`, children: [mask, out] });
    wrap.width = wrap.height = 0.01;
    wrap.originX = wrap.originY = 0;
    out = wrap;
  }
  if (out !== layer) ac.wrapBySlot.set(slot, out);
  return out;
}

/**
 * DrawRules move the node they sit on (with everything under it) before or after another drawable, per active
 * DrawTarget. When that drawable is a sibling this is a draw order on the parent; elsewhere it can't be expressed.
 */
function applyDrawRules(ac: ArtboardCtx, fc: FileCtx, parentSlot: number, parent: ContainerLike): void {
  const rulesOn: { rules: number; owner: number }[] = [];
  for (const ci of ac.children.get(parentSlot) ?? []) for (const r of ac.children.get(ci) ?? []) if (ac.rab.slots[r].type === 'DrawRules') rulesOn.push({ rules: r, owner: ci });
  if (!rulesOn.length) return;
  const base = parent.children.map((c) => c.id);
  const slotOfEntry = new Map<string, number>();
  for (const ci of ac.children.get(parentSlot) ?? []) {
    const e = entryOf(ac, ci);
    if (e) slotOfEntry.set(e.id, ci);
  }
  const first = rulesOn[0];
  if (rulesOn.length > 1) fc.warnings.add('Several draw rules in one group: only the first is imported');
  const ownerEntry = entryOf(ac, first.owner);
  if (!ownerEntry) return;
  const orders = new Map<number, string[]>();
  for (const ti of ac.children.get(first.rules) ?? []) {
    const tgt = ac.rab.slots[ti];
    if (tgt.type !== 'DrawTarget') continue;
    const dest = entryOf(ac, Number(get(tgt, 'drawableId')));
    if (!dest || !base.includes(dest.id) || dest.id === ownerEntry.id) {
      fc.warnings.add('Draw rules that move a layer relative to a layer in another group are not imported');
      continue;
    }
    const list = base.filter((id) => id !== ownerEntry.id);
    // Rive's "before" is drawn behind the target, which is earlier in our back-to-front list
    list.splice(list.indexOf(dest.id) + (Number(get(tgt, 'placementValue')) === 1 ? 1 : 0), 0, ownerEntry.id);
    orders.set(ti, list);
  }
  if (!orders.size) return;
  ac.drawRules.set(first.rules, { nodeId: parent.id, base, orders });
  const active = orders.get(Number(get(ac.rab.slots[first.rules], 'drawTargetId')));
  if (active) parent.drawOrder = active;
}

type ContainerLike = Extract<SceneNode, { children: SceneNode[] }>;

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
  ac = { rab, children, targets: new Map(), nodeBySlot: new Map(), solos: new Map(), wrapBySlot: new Map(), clones: new Map(), maskHidden: [], drawRules: new Map(), skins: [] };
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
    if (n) out.push(clipWrap(ac, fc, ci, n, 0, index, false));
  }
  if ((ac.children.get(0) ?? []).some((ci) => (ac.children.get(ci) ?? []).some((r) => ac.rab.slots[r].type === 'DrawRules'))) fc.warnings.add('Draw rules on layers at the top level of an artboard are not imported');
  for (const m of ac.maskHidden) {
    const n = ac.nodeBySlot.get(m);
    if (n) n.visible = false;
  }
  if (ac.rab.slots.some((o, i) => o.type === 'LayerMask' && Number(o.props.parentId ?? 0) === 0 && i > 0)) fc.warnings.add('Layer masks on the artboard itself are not imported');
  importConstraints(ac, fc);
  resolveSkins(ac, fc);
  importDataBinds(ac, fc, out);
  fc.building.delete(index);
  fc.built.set(index, out);
  return out;
}

const COPY_CONSTRAINTS = ['TranslationConstraint', 'RotationConstraint', 'ScaleConstraint', 'TransformConstraint', 'FollowPathConstraint'];

/**
 * Translation, rotation, scale and transform constraints become copy constraints on the constrained layer (with the factor,
 * "offset" as add-to-own, limits and the source space); follow path constraints become follow path.
 */
function importConstraints(ac: ArtboardCtx, fc: FileCtx): void {
  ac.rab.slots.forEach((c, i) => {
    if (i === 0 || !isA(c.type, 'Constraint')) return;
    if (c.type === 'IKConstraint' || c.type === 'DistanceConstraint') {
      rigConstraint(ac, fc, i, c);
      return;
    }
    if (c.type === 'ScrollConstraint') {
      scrollConstraint(ac, fc, i, c);
      return;
    }
    if (c.type === 'ScrollBarConstraint') {
      fc.warnings.add('Scroll bars are not imported; the browser draws its own scroll bars on scrollable frames');
      return;
    }
    if (!COPY_CONSTRAINTS.includes(c.type)) {
      fc.warnings.add(`${c.type.replace(/Constraint$/, '')} constraints are not supported`);
      return;
    }
    const parent = Number(c.props.parentId ?? 0);
    const target = ac.nodeBySlot.get(Number(get(c, 'targetId')));
    // A clip shape that follows something (a mask over moving waves) has to carry that to the masking copies as well
    const nodes = [ac.nodeBySlot.get(parent), ...(ac.clones.get(parent) ?? [])];
    for (const node of nodes) {
      if (!node || !target || node === target) continue;
      const made = constrainNode(c, node, target, fc);
      // Keys on the strength (and the distance along a followed path) animate the first layer's constraints
      if (node === nodes[0] && made.length === 1) {
        const first = (node.constraints ?? []).length - made.length;
        const lastIndex = (node.constraints ?? []).length - 1;
        addTarget(ac, i, { nodeId: node.id, map: { strength: { prop: `constraints.${lastIndex}.strength`, f: num() }, ...(c.type === 'FollowPathConstraint' ? { distance: { prop: `constraints.${first}.distance`, f: num() } } : {}) } });
      }
    }
  });
}

/**
 * A scroll constraint makes its layout a scrollable viewport: the frame scrolls its content along the direction. What the
 * browser's own scrolling does not do (elastic bounce and momentum, snapping, endless and virtualised lists, drag speed,
 * an offset to start at) is reported.
 */
function scrollConstraint(ac: ArtboardCtx, fc: FileCtx, slot: number, c: RObj): void {
  const node = ac.nodeBySlot.get(Number(c.props.parentId ?? 0));
  if (!node || node.type !== 'frame') {
    fc.warnings.add('A scroll constraint that is not on a layout was skipped');
    return;
  }
  if (!get<boolean>(c, 'interactive')) fc.warnings.add('Scroll constraints that cannot be dragged or scrolled by the viewer are not imported (they only move from animations and data)');
  else {
    const dir = get(c, 'directionValue');
    node.scroll = dir === 0 ? 'horizontal' : dir === 2 ? 'both' : 'vertical';
    node.clip = true;
  }
  const physics = ac.rab.slots[Number(get(c, 'physicsId'))];
  if (physics?.type === 'ElasticScrollPhysics') fc.warnings.add('Elastic scroll physics (bounce past the ends, momentum) are not imported; scrolling stops at the ends');
  if (get<boolean>(c, 'snap')) fc.warnings.add('Scroll snapping is not imported');
  if (get<boolean>(c, 'infinite')) fc.warnings.add('Endless scrolling is not imported; the content scrolls once');
  if (get<boolean>(c, 'virtualize')) fc.warnings.add('Virtualised scroll lists are not imported; every item is drawn');
  if (Math.abs(get(c, 'dragMultiplier') - 1) > 1e-4) fc.warnings.add('The drag speed of scroll constraints is not imported');
  if (get(c, 'scrollOffsetX') || get(c, 'scrollOffsetY')) fc.warnings.add('A starting scroll offset is not imported; scroll frames start at the top left');
  void slot;
}

/**
 * IK (on the end bone: `parentBoneCount` parents turn with it) and distance constraints. Our IK counts the end bone too,
 * so a parent count of 1 is a two-bone limb. Rive's mode 0 is "closer" (no farther than the distance), 1 "further", 2 exact.
 */
function rigConstraint(ac: ArtboardCtx, fc: FileCtx, slot: number, c: RObj): void {
  const node = ac.nodeBySlot.get(Number(c.props.parentId ?? 0));
  const target = ac.nodeBySlot.get(Number(get(c, 'targetId')));
  if (!node || !target || node === target) return;
  const k: Constraint =
    c.type === 'IKConstraint'
      ? { id: uid('cn'), type: 'ik', target: target.id, strength: r2(get(c, 'strength')), bones: Math.max(1, Math.round(get(c, 'parentBoneCount')) + 1), ...(get<boolean>(c, 'invertDirection') ? { invertBend: true } : {}) }
      : { id: uid('cn'), type: 'distance', target: target.id, strength: r2(get(c, 'strength')), distance: r2(get(c, 'distance')), mode: (['within', 'outside', 'exact'] as const)[get(c, 'modeValue')] ?? 'exact' };
  if (c.type === 'IKConstraint' && node.type !== 'bone') {
    fc.warnings.add('An IK constraint on something that is not a bone was skipped');
    return;
  }
  node.constraints = [...(node.constraints ?? []), k];
  const index = node.constraints.length - 1;
  // Keys on the strength (and on a distance constraint's distance) animate the constraint
  addTarget(ac, slot, { nodeId: node.id, map: { strength: { prop: `constraints.${index}.strength`, f: num() }, ...(c.type === 'DistanceConstraint' ? { distance: { prop: `constraints.${index}.distance`, f: num() } } : {}) } });
}

// ---------------------------------------------------------------- skins

const r5 = (n: number) => Math.round(n * 100000) / 100000;

/** A Rive matrix object (Skin or Tendon: xx, xy, yx, yy, tx, ty, as in Rive's Mat2D) as ours. */
function riveMat(o: RObj): M {
  return [get(o, 'xx'), get(o, 'xy'), get(o, 'yx'), get(o, 'yy'), get(o, 'tx'), get(o, 'ty')];
}

/** Four influences packed a byte each: weights 0-255 over 255, and which tendon (0 is none, so tendon i is i + 1). */
function influences(values: number, indices: number, tendon: number[]): SkinInfluence[] {
  const out: SkinInfluence[] = [];
  for (let i = 0; i < 4; i++) {
    const w = ((values >>> (8 * i)) & 255) / 255;
    if (!w) continue;
    const idx = (indices >>> (8 * i)) & 255;
    out.push({ b: idx === 0 ? -1 : tendon[idx - 1] ?? -1, w: Math.round(w * 1000) / 1000 });
  }
  return out;
}

/**
 * Fills in `skin` on the paths and meshes that had one. Rive deforms a point as
 * `sum(weight * boneWorld * inverse(tendon) * skin * point)`, with `tendon` the bone's world at bind time and `skin` the
 * skinned object's world then; ours keeps `inverse(tendon) * skin * (our local -> its space)` as the bind of each bone.
 */
function resolveSkins(ac: ArtboardCtx, fc: FileCtx): void {
  for (const ps of ac.skins) {
    const bones: SkinBone[] = [];
    const seen = new Map<string, number>();
    const weights: SkinVertex[][] = [];
    for (const part of ps.parts) {
      const skin = ac.rab.slots[part.skinSlot];
      const S = riveMat(skin);
      // Tendon i of this skin -> an index into the node's bones (the same bone with the same bind is shared)
      const tendons = (ac.children.get(part.skinSlot) ?? []).map((i) => ac.rab.slots[i]).filter((o) => o.type === 'Tendon');
      const tendon = tendons.map((t) => {
        const bone = ac.nodeBySlot.get(Number(get(t, 'boneId')));
        if (!bone || bone.type !== 'bone') return -1;
        const bind = multiply(invert(riveMat(t)), multiply(S, part.toRive)).map(r5) as SkinBone['bind'];
        const key = `${bone.id}|${bind.join(',')}`;
        let at = seen.get(key);
        if (at === undefined) {
          at = bones.length;
          bones.push({ bone: bone.id, bind });
          seen.set(key, at);
        }
        return at;
      });
      while (weights.length <= part.sub) weights.push([]);
      part.vslots.forEach((vs, pi) => {
        const w = (ac.children.get(vs) ?? []).map((i) => ac.rab.slots[i]).find((o) => o.type === 'Weight' || o.type === 'CubicWeight');
        if (!w) return;
        const v: SkinVertex = { w: influences(get(w, 'values'), get(w, 'indices'), tendon) };
        if (w.type === 'CubicWeight') {
          v.in = influences(get(w, 'inValues'), get(w, 'inIndices'), tendon);
          v.out = influences(get(w, 'outValues'), get(w, 'outIndices'), tendon);
        }
        weights[part.sub][pi] = v;
      });
    }
    // Holes (points the file gave no weight) stay as they are
    for (const sp of weights) for (let i = 0; i < sp.length; i++) sp[i] ??= { w: [] };
    if (!bones.length) {
      fc.warnings.add('A skinned shape whose bones are missing is imported in its rest pose');
      continue;
    }
    const skin: PathSkin = { bones, weights };
    if (ps.node.type === 'path') (ps.node as PathNode).skin = skin;
    else if (ps.node.type === 'image' && (ps.node as ImageNode).mesh) (ps.node as ImageNode).mesh!.skin = skin;
  }
}

/** The constraints (as ours) a Rive constraint on `node` means; returns the ones added. */
function constrainNode(c: RObj, node: SceneNode, target: SceneNode, fc: FileCtx): Constraint[] {
  const strength = r2(get(c, 'strength'));
  const added: Constraint[] = [];
  const push = (k: Omit<Constraint, 'id' | 'target' | 'strength'>) => {
    const full: Constraint = { id: uid('cn'), target: target.id, strength, ...k } as Constraint;
    added.push(full);
    node.constraints = [...(node.constraints ?? []), full];
  };
  const local = get(c, 'sourceSpaceValue') === 1;
  if (c.type === 'FollowPathConstraint') {
    // Distance runs 0..1 along the outline; the layer turns to face along it unless told not to
    if (get<boolean>(c, 'offset')) fc.warnings.add('Follow path constraints that keep the layer\'s own position as an offset place it on the path itself');
    push({ type: 'followPath', distance: r2(get(c, 'distance')), orient: get<boolean>(c, 'orient') !== false });
    return added;
  }
  if (c.type === 'TransformConstraint') {
    // Takes the target's whole transform (a filled wave that follows its outline), as copy position + rotation + scale
    if (get(c, 'destSpaceValue')) fc.warnings.add('Transform constraints applied in local space are imported as world space');
    for (const type of ['copyPosition', 'copyRotation', 'copyScale'] as const) push({ type, ...(local ? { space: 'local' as const } : {}) });
    return added;
  }
  if (get(c, 'destSpaceValue') && c.type !== 'TranslationConstraint') fc.warnings.add('Rotation and scale constraints applied in local space are imported as world space');
  // The limits: a flag per bound and a value; Y has its own for translation and scale. Rotation is in radians
  const conv = c.type === 'RotationConstraint' ? DEG : 1;
  const bounds = (min: string, max: string, minV: string, maxV: string) => ({
    ...(get<boolean>(c, min) ? { min: r2(get(c, minV) * conv) } : {}),
    ...(get<boolean>(c, max) ? { max: r2(get(c, maxV) * conv) } : {}),
  });
  const xFactor = r2(get(c, 'copyFactor'));
  const common = {
    ...(xFactor !== 1 ? { factor: xFactor } : {}),
    ...(get<boolean>(c, 'offset') ? { additive: true } : {}),
    ...bounds('min', 'max', 'minValue', 'maxValue'),
  };
  if (c.type === 'RotationConstraint') {
    push({ type: 'copyRotation', ...(local ? { space: 'local' as const } : {}), ...(get<boolean>(c, 'doesCopy') === false ? { factor: 0, additive: true } : {}), ...common });
    return added;
  }
  const y = bounds('minY', 'maxY', 'minValueY', 'maxValueY');
  const yBounds = { ...(y.min !== undefined ? { minY: y.min } : {}), ...(y.max !== undefined ? { maxY: y.max } : {}) };
  if (r2(get(c, 'copyFactorY')) !== xFactor) fc.warnings.add('Constraints with a different factor for x and y use the x factor for both');
  if (c.type === 'ScaleConstraint') {
    push({ type: 'copyScale', space: local ? 'local' : 'world', copyX: get<boolean>(c, 'doesCopy') !== false, copyY: get<boolean>(c, 'doesCopyY') !== false, ...common, ...yBounds });
    return added;
  }
  push({
    type: 'copyPosition',
    ...(local ? { space: 'local' as const } : {}),
    copyX: get<boolean>(c, 'doesCopy') !== false,
    copyY: get<boolean>(c, 'doesCopyY') !== false,
    ...common,
    ...yBounds,
  });
  return added;
}

// ---------------------------------------------------------------- animations

/**
 * The easing of the segment that starts at key `k` (and ends at `next`). A cubic ease holds normalised control points,
 * while a cubic value curve (the graph editor's) holds its two handles as values in the property's own units, so they are
 * normalised against the segment's start and end values: the curve is the same one, so only the y numbers change.
 */
function easeOf(ac: ArtboardCtx, k: RObj, next?: RObj): Easing {
  const type = Number(k.props.interpolationType ?? 1);
  if (type === 0) return 'step';
  if (type === 1) return 'linear';
  const ip = k.props.interpolatorId;
  const interp = ip === undefined ? undefined : ac.rab.slots[Number(ip)];
  if (interp?.type === 'CubicValueInterpolator') {
    const from = Number(get(k, 'value') ?? 0);
    const to = next ? Number(get(next, 'value') ?? 0) : NaN;
    // No end to measure against, or a flat segment (the value stays put either way): a plain ease
    if (!Number.isFinite(to) || Math.abs(to - from) < 1e-9) return 'easeInOut';
    const norm = (y: number) => Math.round(((y - from) / (to - from)) * 1000) / 1000;
    return [r2(get(interp, 'x1')), norm(get(interp, 'y1')), r2(get(interp, 'x2')), norm(get(interp, 'y2'))];
  }
  if (interp && isA(interp.type, 'CubicInterpolator')) return [r2(get(interp, 'x1')), r2(get(interp, 'y1')), r2(get(interp, 'x2')), r2(get(interp, 'y2'))];
  if (interp?.type === 'ElasticInterpolator') return 'elasticOut';
  return 'easeInOut';
}

/** Keys on a path vertex (position and handles) as keys on the points of the path node it became. */
function vertexTracks(ac: ArtboardCtx, anim: RAnim, slot: number, nodeId: string, v: NonNullable<Target['vertex']>, ms: (frame: number) => number): Track[] {
  const type = ac.rab.slots[slot].type;
  const series: Record<string, { t: number; v: number }[]> = { x: [], y: [], 'in.x': [], 'in.y': [], 'out.x': [], 'out.y': [] };
  for (const smp of vertexSamples(ac, slot, anim)) {
    const t = ms(smp.frame);
    const q = vertexPoint(type, smp.g);
    const a = ap(v.m, q.x, q.y);
    series.x.push({ t, v: r2(a.x - v.minX) });
    series.y.push({ t, v: r2(a.y - v.minY) });
    for (const side of ['in', 'out'] as const) {
      const h = q[side] ? av(v.m, q[side]!.x, q[side]!.y) : null;
      if (!h) continue;
      series[`${side}.x`].push({ t, v: r2(h.x) });
      series[`${side}.y`].push({ t, v: r2(h.y) });
    }
  }
  const out: Track[] = [];
  for (const [key, list] of Object.entries(series)) {
    if (list.length < 2) continue;
    const vals = list.map((e) => e.v);
    if (Math.max(...vals) - Math.min(...vals) < 0.005) continue;
    out.push({ id: uid('tr'), nodeId, prop: `paths.${v.sub}.points.${v.index}.${key}`, keys: list.map((e) => ({ id: uid('k'), t: e.t, value: e.v, ease: 'linear' as Easing })) });
  }
  return out;
}

function buildTimeline(ac: ArtboardCtx, fc: FileCtx, anim: RAnim, offsetFor: (nodeId: string) => { x: number; y: number }): Timeline {
  const o = anim.obj;
  const fps = get(o, 'fps') || 60;
  const work = get<boolean>(o, 'enableWorkArea');
  const start = work ? Math.max(0, get(o, 'workStart')) : 0;
  const end = work && get(o, 'workEnd') > 0 ? get(o, 'workEnd') : get(o, 'duration');
  const ms = (frame: number) => Math.max(0, Math.round(((frame - start) / fps) * 1000));
  const tracks: Track[] = [];
  const markers: TimelineMarker[] = [];
  const events = new Map<string, number>();
  const nestedKeys: Omit<NestedKey, 'tl'>[] = [];
  for (const ko of anim.keyed) {
    const slot = Number(ko.obj.props.objectId ?? 0);
    const targets = ac.targets.get(slot);
    const vt = targets?.find((t) => t.vertex);
    if (vt?.vertex) {
      tracks.push(...vertexTracks(ac, anim, slot, vt.nodeId, vt.vertex, ms));
      continue;
    }
    for (const kp of ko.props) {
      const key = Number(kp.obj.props.propertyKey);
      const rprop = propNameByKey.get(key)?.name ?? String(key);
      if (rprop === 'drawTargetId' && ac.drawRules.has(slot)) {
        const dr = ac.drawRules.get(slot)!;
        tracks.push({ id: uid('tr'), nodeId: dr.nodeId, prop: 'drawOrder', keys: kp.keys.map((k) => ({ id: uid('k'), t: ms(Number(k.props.frame ?? 0)), value: dr.orders.get(Number(k.props.value ?? 0)) ?? dr.base, ease: 'step' as Easing })) });
        continue;
      }
      const slotType = ac.rab.slots[slot]?.type;
      if (slotType && isA(slotType, 'NestedInput')) {
        // A key on a nested input: a marker that sets it (or fires the trigger) on the instance
        const ref = nestedRef(ac, slot);
        if (!ref) {
          fc.warnings.add('Animated nested inputs whose nested artboard could not be found were skipped');
          continue;
        }
        if (ref.kind === 'number' && kp.keys.length > 1) fc.warnings.add('Animated nested numbers jump to each key value instead of tweening between keys');
        for (const k of kp.keys) {
          const frame = Number(k.props.frame ?? 0);
          if (frame < start || frame > end) continue;
          const value = ref.kind === 'bool' ? !!get<boolean>(k, 'value') : ref.kind === 'number' ? r2(get(k, 'value')) : true;
          // Keys that do the same thing share a marker name (and so one flow); the readable name comes once the input has one
          const marker: TimelineMarker = { id: uid('mk'), time: Math.min(ms(frame), ms(end)), name: `nested|${ref.inst.id}|${ref.machine}|${ref.input}|${String(value)}` };
          markers.push(marker);
          nestedKeys.push({ marker, ref, value });
        }
        continue;
      }
      if (slotType && isA(slotType, 'Event')) {
        // A callback keyframe fires the event: a timeline marker named after it (made unique if two events share a name)
        let marker = eventName(ac.rab.slots[slot]);
        const taken = events.get(marker);
        if (taken !== undefined && taken !== slot) {
          let n = 2;
          while (events.has(`${marker} (${n})`)) n++;
          marker = `${marker} (${n})`;
        }
        events.set(marker, slot);
        for (const k of kp.keys) {
          const frame = Number(k.props.frame ?? 0);
          if (frame < start || frame > end) continue;
          markers.push({ id: uid('mk'), time: Math.min(ms(frame), ms(end)), name: marker });
        }
        continue;
      }
      if (!targets?.length) {
        const ot = ac.rab.slots[slot]?.type ?? 'object';
        if (isA(ot, 'Vertex')) fc.warnings.add('Path vertex animation (shape morphing) is not supported; those paths stay in their rest shape');
        else if (ot === 'TrimPath') fc.warnings.add('Trim paths on shapes with several strokes, or on artboard backgrounds, are not imported');
        else if (ot === 'DashPath') fc.warnings.add('An animated dash offset could not be applied to its stroke; the dashes keep their starting offset');
        else if (ot === 'Dash') fc.warnings.add('Animated dash lengths are not imported; the dashes keep their starting lengths');
        else if (slot) fc.warnings.add(`Animated ${ot} properties (${rprop}) have no matching layer and were skipped`);
        continue;
      }
      if (rprop === 'activeComponentId' && ac.solos.has(slot)) {
        // The key value is the active child's slot; the group's solo wants that layer's id
        const solo = ac.nodeBySlot.get(slot)!;
        tracks.push({ id: uid('tr'), nodeId: solo.id, prop: 'solo.active', keys: kp.keys.map((k) => ({ id: uid('k'), t: ms(Number(k.props.frame ?? 0)), value: entryOf(ac, Number(k.props.value ?? 0))?.id ?? '', ease: 'step' as Easing })) });
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
        const keys: Keyframe[] = kp.keys.map((k, ki) => {
          let v = m.f(k.props.value ?? defaultOf(k.type, 'value'));
          if (typeof v === 'number' && m.prop === 'x') v = r2(v + off.x);
          if (typeof v === 'number' && m.prop === 'y') v = r2(v + off.y);
          return { id: uid('k'), t: ms(Number(k.props.frame ?? 0)), value: v, ease: easeOf(ac, k, kp.keys[ki + 1]) };
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
  const tl: Timeline = {
    id: uid('tl'),
    name: String(o.props.name ?? 'Animation'),
    duration: Math.max(1, ms(end)),
    loop: loop === 1 ? 'loop' : loop === 2 ? 'pingpong' : 'once',
    autoplay: false,
    speed: r2(get(o, 'speed') || 1),
    tracks,
  };
  if (markers.length) {
    tl.markers = markers.sort((a, b) => a.time - b.time);
    fc.timelineEvents.set(tl, events);
    for (const k of nestedKeys) fc.nestedKeys.push({ ...k, tl });
  }
  return tl;
}

/** Rive key codes (the ones keyboard listeners use) as the key or code names a browser reports. Letters and digits are the character itself. */
const RIVE_KEYS: Record<number, string> = (() => {
  const keys: Record<number, string> = { 32: 'Space', 39: "'", 44: ',', 45: '-', 46: '.', 47: '/', 59: ';', 61: '=', 91: '[', 92: '\\', 93: ']', 96: '`', 256: 'Escape', 257: 'Enter', 258: 'Tab', 259: 'Backspace', 260: 'Insert', 261: 'Delete', 262: 'ArrowRight', 263: 'ArrowLeft', 264: 'ArrowDown', 265: 'ArrowUp', 266: 'PageUp', 267: 'PageDown', 268: 'Home', 269: 'End', 280: 'CapsLock', 281: 'ScrollLock', 282: 'NumLock', 283: 'PrintScreen', 284: 'Pause', 330: 'NumpadDecimal', 331: 'NumpadDivide', 332: 'NumpadMultiply', 333: 'NumpadSubtract', 334: 'NumpadAdd', 335: 'NumpadEnter', 336: 'NumpadEqual', 340: 'ShiftLeft', 341: 'ControlLeft', 342: 'AltLeft', 343: 'MetaLeft', 344: 'ShiftRight', 345: 'ControlRight', 346: 'AltRight', 347: 'MetaRight', 348: 'ContextMenu' };
  for (let i = 0; i < 10; i++) {
    keys[48 + i] = String(i);
    keys[320 + i] = `Numpad${i}`;
  }
  for (let i = 0; i < 26; i++) keys[65 + i] = String.fromCharCode(97 + i);
  for (let i = 0; i < 25; i++) keys[290 + i] = `F${i + 1}`;
  return keys;
})();

/** An event's name (Rive events are found by name when the host listens for them). */
function eventName(o: RObj | undefined): string {
  return String(o?.props.name ?? '') || 'Event';
}

// ---------------------------------------------------------------- view models and data binds

/** A property's value as a plain JS value, for a list's items: an enum as its option, a nested view model as an object. */
function vmValue(fc: FileCtx, vm: RViewModel, instance: number, prop: number, depth = 0): unknown {
  const def = vm.props[prop];
  if (!def) return null;
  const inst = vm.all[instance] ?? vm.all[0];
  const raw = inst?.values.get(prop);
  switch (def.type) {
    case 'ViewModelPropertyBoolean':
      return !!raw;
    case 'ViewModelPropertyNumber':
      return r2(Number(raw ?? 0));
    case 'ViewModelPropertyColor':
      return argbCss(Number(raw ?? 0xff000000));
    case 'ViewModelPropertyEnumCustom':
      return fc.enums[Number(def.props.enumId ?? 0)]?.values[Number(raw ?? 0)] ?? '';
    case 'ViewModelPropertyViewModel': {
      const sub = fc.viewModels[Number(def.props.viewModelReferenceId ?? 0)];
      return sub && depth < 3 ? vmObject(fc, sub, Number(raw ?? 0), depth + 1) : null;
    }
    case 'ViewModelPropertyList':
      return depth < 3 ? (inst?.lists.get(prop) ?? []).map((it) => (fc.viewModels[it.vm] ? vmObject(fc, fc.viewModels[it.vm], it.instance, depth + 1) : null)) : [];
    case 'ViewModelPropertyTrigger':
      return 0;
    default:
      return String(raw ?? '');
  }
}

/** One view model instance as an object keyed by property name. */
function vmObject(fc: FileCtx, vm: RViewModel, instance: number, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  vm.props.forEach((p, i) => (out[String(p.props.name ?? `prop${i}`)] = vmValue(fc, vm, instance, i, depth)));
  return out;
}

/** A name not used yet, among the project's variables and everything imported so far. */
function uniqueName(fc: FileCtx, base: string): string {
  let n = identifier(base);
  let i = 2;
  while (fc.names.has(n)) n = `${identifier(base)}_${i++}`;
  fc.names.add(n);
  return n;
}

/**
 * A view model property (followed through nested view model properties from a DataBindContext's source path) as a
 * shared project variable, made on first use. Enums become choices, lists become list variables.
 */
function vmVariable(fc: FileCtx, ctx: RObj | undefined): VmVar | null {
  if (!ctx) return null;
  const ids = pathIds(ctx.props.sourcePathIds);
  let vmIndex = ids[0];
  let vm = fc.viewModels[vmIndex];
  for (let k = 1; vm && k < ids.length; k++) {
    const prop = vm.props[ids[k]];
    if (!prop) return null;
    if (prop.type === 'ViewModelPropertyViewModel' && k < ids.length - 1) {
      vmIndex = Number(prop.props.viewModelReferenceId ?? 0);
      vm = fc.viewModels[vmIndex];
      continue;
    }
    const key = `${vmIndex}/${ids[k]}`;
    let v = fc.vmVars.get(key);
    if (!v) {
      const enumDef = prop.type === 'ViewModelPropertyEnumCustom' ? fc.enums[Number(prop.props.enumId ?? 0)] : undefined;
      const kind: VmVar['kind'] =
        prop.type === 'ViewModelPropertyBoolean'
          ? 'boolean'
          : prop.type === 'ViewModelPropertyTrigger'
            ? 'trigger'
            : prop.type === 'ViewModelPropertyColor'
              ? 'color'
              : prop.type === 'ViewModelPropertyNumber'
                ? 'number'
                : enumDef
                  ? 'enum'
                  : prop.type === 'ViewModelPropertyList'
                    ? 'list'
                    : 'string';
      const name = uniqueName(fc, `${vm.name}_${String(prop.props.name ?? 'value')}`);
      const raw = vm.values.get(ids[k]);
      const options = enumDef?.values.length ? enumDef.values : undefined;
      const variable: Variable = {
        id: uid('v'),
        name,
        shared: true,
        type: kind === 'trigger' ? 'number' : kind,
        initial:
          kind === 'boolean'
            ? !!raw
            : kind === 'number'
              ? r2(Number(raw ?? 0))
              : kind === 'trigger'
                ? 0
                : kind === 'color'
                  ? argbCss(Number(raw ?? 0xff000000))
                  : kind === 'enum'
                    ? (options?.[Number(raw ?? 0)] ?? options?.[0] ?? '')
                    : kind === 'list'
                      ? JSON.stringify(vmValue(fc, vm, 0, ids[k]) ?? [])
                      : String(raw ?? ''),
      };
      if (kind === 'enum' && options) variable.options = options;
      fc.variables.push(variable);
      v = { id: variable.id, name, kind, options };
      fc.vmVars.set(key, v);
    }
    return v;
  }
  return null;
}

/** Rive's arithmetic operation codes (DataConverterOperation, formula tokens). */
const ARITH = ['+', '-', '*', '/', '%'];

/** What a data converter does to a value, as our converters; null for ones with no equivalent (the bind keeps the rest). */
function convertersOf(fc: FileCtx, index: number, out: Converter[] = [], depth = 0): boolean {
  const c = fc.converters[index];
  if (!c) return false;
  const t = c.obj.type;
  const num = (k: string) => Number(get(c.obj, k));
  switch (t) {
    case 'DataConverterGroup':
      return depth < 4 && c.items.every((i) => convertersOf(fc, i, out, depth + 1));
    case 'DataConverterToString': {
      const decimals = num('decimals');
      out.push(decimals > 0 ? { type: 'format', decimals } : { type: 'toText' });
      return true;
    }
    case 'DataConverterToNumber':
      out.push({ type: 'toNumber' });
      return true;
    case 'DataConverterRounder':
      out.push({ type: 'round', decimals: num('decimals') });
      return true;
    case 'DataConverterBooleanNegate':
      out.push({ type: 'invert' });
      return true;
    case 'DataConverterRangeMapper': {
      const flags = num('flags');
      // clamp lower (1) / clamp upper (2): both together keep the value inside the range
      out.push({ type: 'range', inMin: num('minInput'), inMax: num('maxInput'), outMin: num('minOutput'), outMax: num('maxOutput'), clamp: (flags & 3) === 3 });
      if ((flags & 3) !== 3 && flags & 3) fc.warnings.add('Range mappers that clamp on one side only clamp on neither');
      return true;
    }
    case 'DataConverterOperationValue':
    case 'DataConverterSystemDegsToRads':
    case 'DataConverterSystemNormalizer': {
      if (t === 'DataConverterSystemDegsToRads') {
        out.push({ type: 'expr', expr: `value * ${Math.PI / 180}` });
        return true;
      }
      const op = ARITH[num('operationType')];
      if (!op) return false;
      out.push({ type: 'expr', expr: `value ${op} ${r2(num('operationValue'))}` });
      return true;
    }
    case 'DataConverterStringPad': {
      const len = num('length');
      const text = JSON.stringify(String(get(c.obj, 'text') ?? ' ') || ' ');
      out.push({ type: 'expr', expr: Number(get(c.obj, 'padType')) === 1 ? `String(value).padEnd(${len}, ${text})` : `String(value).padStart(${len}, ${text})` });
      return true;
    }
    case 'DataConverterStringTrim': {
      const trim = Number(get(c.obj, 'trimType'));
      out.push({ type: 'expr', expr: trim === 0 ? 'String(value).trimStart()' : trim === 2 ? 'String(value).trim()' : 'String(value).trimEnd()' });
      return true;
    }
    case 'DataConverterStringRemoveZeros':
      out.push({ type: 'expr', expr: "String(value).replace(/(\\.\\d*?)0+$/, '$1').replace(/\\.$/, '')" });
      return true;
    case 'DataConverterListToLength':
      out.push({ type: 'expr', expr: 'value.length' });
      return true;
    case 'DataConverterInterpolator':
      fc.warnings.add('Interpolating converters (smooth changes over time) apply instantly');
      return true;
    case 'DataConverterFormula': {
      // Plain arithmetic only: the input, numbers, + - * / %, and parentheses
      const parts: string[] = [];
      for (const tok of c.tokens) {
        if (tok.type === 'FormulaTokenInput') parts.push('value');
        else if (tok.type === 'FormulaTokenValue') parts.push(String(r2(Number(get(tok, 'operationValue')))));
        else if (tok.type === 'FormulaTokenOperation') {
          const op = ARITH[Number(get(tok, 'operationType'))];
          if (!op) return false;
          parts.push(op);
        } else if (tok.type === 'FormulaTokenParenthesisOpen') parts.push('(');
        else if (tok.type === 'FormulaTokenParenthesisClose') parts.push(')');
        else return false;
      }
      if (!parts.length) return false;
      out.push({ type: 'expr', expr: parts.join(' ') });
      return true;
    }
    default:
      return false;
  }
}

/**
 * Data binds on layers: a view model property drives a property of a layer (position, rotation, scale, opacity, text,
 * colours, stroke width, ...). The property's variable is the binding's expression, the bind's data converters its
 * converters, and the unit change between Rive's property and ours (radians to degrees, the node's origin offset) a last
 * `expr` converter. Binds that only write to the view model, or have no source, are reported.
 */
function importDataBinds(ac: ArtboardCtx, fc: FileCtx, nodes: SceneNode[]): void {
  if (!ac.rab.binds.length) return;
  const byId = new Map<string, SceneNode>();
  walk(nodes, (n) => byId.set(n.id, n));
  for (const b of ac.rab.binds) {
    const o = ac.rab.slots[b.slot];
    const flags = Number(b.obj.props.flags ?? 0);
    // A list's source is read where the list is made (convertList)
    if (o.type === 'ArtboardComponentList' || o.type === 'ArtboardListMapRule') continue;
    if (b.obj.type !== 'DataBindContext') {
      fc.warnings.add('Data binds without a view model source were not imported');
      continue;
    }
    const prop = classProps(o.type).get(Number(b.obj.props.propertyKey))?.name;
    const target = prop ? (ac.targets.get(b.slot) ?? []).find((t) => prop in t.map) : undefined;
    const node = target ? byId.get(target.nodeId) : undefined;
    if (!prop || !target || !node) {
      fc.warnings.add(`Data binds on ${o.type === 'Artboard' ? 'the artboard' : `${prop ?? 'unknown'} of ${o.type}`} are not imported`);
      continue;
    }
    if (flags & 1) {
      fc.warnings.add('Data binds that write a layer value back to the view model are not imported (only view model to layer)');
      continue;
    }
    if (flags & 2) fc.warnings.add('Two-way data binds are imported one way: the view model value drives the layer');
    const v = vmVariable(fc, b.obj);
    if (!v) {
      fc.warnings.add('Some data binds point at view model properties that could not be found');
      continue;
    }
    const m = target.map[prop];
    if (!m) continue;
    const list: Converter[] = [];
    if (b.obj.props.converterId !== undefined && !convertersOf(fc, Number(b.obj.props.converterId), list)) {
      fc.warnings.add('Some data converters have no equivalent (functions in formulas, converters that read other view model values); those binds skip the converter');
      list.length = 0;
    }
    // Rive's number to our number: radians to degrees, the node's offset, ...
    const sample = (x: number) => m.f(x);
    if (typeof sample(0) === 'number' && typeof sample(1000) === 'number' && v.kind !== 'string') {
      const a = Math.round(((Number(sample(1000)) - Number(sample(0))) / 1000) * 1e6) / 1e6;
      const k = Number(sample(0));
      if (a !== 1 || k !== 0) list.push({ type: 'expr', expr: `value * ${a}${k ? ` + ${k}` : ''}`.replace('+ -', '- ') });
    }
    node.bindings = { ...(node.bindings ?? {}), [m.prop]: v.name };
    if (list.length) node.converters = { ...(node.converters ?? {}), [m.prop]: list };
  }
}

/** A root layer moved by the artboard's origin: position bindings move with it. */
function shiftBindings(n: SceneNode, ox: number, oy: number): SceneNode {
  if (!n.bindings || (!n.bindings.x && !n.bindings.y)) return n;
  const converters = { ...(n.converters ?? {}) };
  for (const [prop, by] of [['x', ox], ['y', oy]] as const) {
    if (n.bindings[prop] && by) converters[prop] = [...(converters[prop] ?? []), { type: 'expr', expr: `value + ${by}` }];
  }
  return { ...n, converters };
}

// ---------------------------------------------------------------- state machines

type InputVar = { kind: 'trigger' | 'bool' | 'number'; name: string; id: string };

/**
 * A Rive blend state as a blend. 1D states mix the two animations around the input (their `value`s are the positions).
 * Direct states give each animation a weight, from a number input (0 to 100, so the blend's range is 100) or a fixed mix value.
 */
function riveBlend(fc: FileCtx, st: RState, inputVars: InputVar[], timelines: Timeline[]): Blend | null {
  const entryTimeline = (o: RObj) => timelines[Number(o.props.animationId ?? -1)];
  const numberInput = (index: unknown): InputVar | undefined => {
    const v = inputVars[Number(index ?? -1)];
    return v?.kind === 'number' ? v : undefined;
  };
  const anims = st.blends.filter((o) => {
    if (entryTimeline(o)) return true;
    fc.warnings.add('Some blend state animations could not be found and were skipped');
    return false;
  });
  // States carry no names of their own: name the blend after what it mixes
  const name = String(st.obj.props.name ?? '') || `${st.obj.type === 'BlendStateDirect' ? 'Direct' : '1D'} blend: ${anims.map((o) => entryTimeline(o).name).join(' / ')}`;
  if (!anims.length) {
    fc.warnings.add(`Blend state "${name}" has no animations and was imported as an empty state`);
    return null;
  }
  const blend: Blend = { id: uid('bl'), name, mode: '1d', entries: [] };
  if (st.obj.type === 'BlendStateDirect') {
    blend.mode = 'direct';
    blend.range = 100;
    if (anims.length > 1) fc.warnings.add('Direct blend states average their animations by weight; Rive layers them one after another, so overlapping weights can look different');
    for (const o of anims) {
      const source = Number(o.props.blendSource ?? 0);
      const entry: Blend['entries'][number] = { timeline: entryTimeline(o).id };
      if (source === 0) {
        const input = numberInput(o.props.inputId);
        if (input) entry.weightVariable = input.id;
        else {
          fc.warnings.add('Some direct blend animations are driven by an input that is not a number and play at full weight');
          entry.weight = 1;
        }
      } else {
        if (source !== 1) fc.warnings.add('Direct blend animations driven by view model values are imported with their fixed mix value');
        entry.weight = Math.max(0, Math.min(1, Number(o.props.mixValue ?? 100) / 100));
      }
      blend.entries.push(entry);
    }
    return blend;
  }
  if (st.obj.type === 'BlendState1DInput') {
    const input = numberInput(st.obj.props.inputId);
    if (input) blend.variable = input.id;
    else fc.warnings.add(`Blend state "${name}" is driven by an input that is not a number, so it stays at its first animation`);
  } else fc.warnings.add(`Blend state "${name}" is driven by a view model value, which is not connected: it stays at its first animation`);
  blend.entries = anims.map((o) => ({ timeline: entryTimeline(o).id, value: r2(Number(o.props.value ?? 0)) }));
  return blend;
}

const identifier = (s: string) => s.replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || 'input';

function buildMachines(ac: ArtboardCtx, fc: FileCtx, ab: Artboard, timelines: Timeline[], names: Set<string>, variables: Variable[], abIndex: number): void {
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
  // A view model property (followed through nested view model properties) as a shared project variable
  const vmVar = (ctx: RObj | undefined) => vmVariable(fc, ctx);
  const contextOf = (o: RObj | undefined) => {
    const ctxs = (o?.parts ?? []).filter((x) => x.type === 'DataBindContext');
    return ctxs.find((x) => Number(x.props.flags ?? 0) & 1) ?? ctxs[0];
  };
  // A Rive event as nodes: a message with the event's name (its custom properties as the payload), then, for audio and
  // open-link events, the sound or the link
  const eventChain = (slot: number, from: LogicNode, port: string, x: number) => {
    const ev = ac.rab.slots[slot];
    if (!ev || !isA(ev.type, 'Event')) {
      fc.warnings.add('Some events fired by animations or state machines could not be found');
      return { last: from, port, x };
    }
    const props: Record<string, unknown> = {};
    for (const ci of ac.children.get(slot) ?? []) {
      const c = ac.rab.slots[ci];
      const key = String(c.props.name ?? '');
      if (!key || !isA(c.type, 'CustomProperty')) continue;
      const raw = get<unknown>(c, 'propertyValue');
      props[key] = c.type === 'CustomPropertyBoolean' ? !!raw : c.type === 'CustomPropertyString' ? String(raw ?? '') : r2(Number(raw ?? 0));
    }
    let last = from;
    let lastPort = port;
    const push = (n: LogicNode) => {
      link(last, n, lastPort);
      last = n;
      lastPort = 'out';
      x += 240;
    };
    const emit = add('action.emit', { name: eventName(ev), payload: Object.keys(props).length ? JSON.stringify(props) : '' }, x);
    emit.note = `Rive event: ${eventName(ev)}`;
    push(emit);
    if (ev.type === 'AudioEvent') {
      const asset = audioAsset(fc, Number(get(ev, 'assetId')));
      if (asset) push(add('action.sound', { asset: asset.id, volume: asset.volume, continue: 'start' }, x));
    } else if (ev.type === 'OpenUrlEvent') {
      const url = get<string>(ev, 'url');
      if (url) push(add('action.url', { url: JSON.stringify(url), target: ['_blank', '_parent', '_self', '_top'][Number(get(ev, 'targetValue'))] ?? '_blank' }, x));
    }
    return { last, port: lastPort, x };
  };
  // Setting a nested input (or firing a nested trigger) on the instance that holds it; the input's name is filled in at the end
  const nestedAction = (ref: NestedRef, value: number | boolean, x: number): LogicNode => {
    const n =
      ref.kind === 'trigger'
        ? add('action.instanceTrigger', { target: ref.inst.id, name: '' }, x)
        : add('action.instanceInput', { target: ref.inst.id, name: '', value: String(value) }, x);
    fc.pendingNested.push({ node: n, ref });
    return n;
  };
  // StateMachineFireEvent actions of a state or transition that happen at the start (0) or end (1)
  const fireNodes = (fires: RObj[], occurs: number, from: LogicNode, port: string, x: number) => {
    let r = { last: from, port, x };
    for (const f of fires) {
      if (f.type === 'StateMachineFireTrigger') fc.warnings.add('Fire trigger actions on states and transitions are not imported');
      if (f.type === 'StateMachineFireEvent' && Number(f.props.occursValue ?? 0) === occurs) r = eventChain(Number(f.props.eventId ?? 0), r.last, r.port, r.x);
    }
    return r;
  };
  // Events keyed on timelines: a marker plays them
  for (const tl of timelines) {
    for (const [marker, slot] of fc.timelineEvents.get(tl) ?? []) {
      const src = add('event.timelineMarker', { timeline: tl.id, marker }, 40);
      src.note = `${tl.name}: ${marker}`;
      eventChain(slot, src, 'out', 280);
      y += 120;
    }
  }
  // Nested inputs keyed on timelines: a marker plays them. The names of the input and of the marker come once every artboard is built.
  const nestedDone = new Map<string, LogicNode>();
  for (const nk of fc.nestedKeys) {
    if (!timelines.includes(nk.tl) || nestedDone.has(`${nk.tl.id}|${nk.marker.name}`)) continue;
    const src = add('event.timelineMarker', { timeline: nk.tl.id, marker: nk.marker.name }, 40);
    link(src, nestedAction(nk.ref, nk.value, 280));
    nestedDone.set(`${nk.tl.id}|${nk.marker.name}`, src);
    y += 120;
  }
  const machines = ac.rab.machines;
  if (!machines.length) {
    // No state machine: play the first animation, as Rive does
    if (timelines[0]) timelines[0].autoplay = true;
    return;
  }
  if (machines.length > 1) fc.warnings.add(`Artboard "${ab.name}" has ${machines.length} state machines; all were converted and run together`);
  for (const [smIndex, sm] of machines.entries()) {
    const smName = String(sm.obj.props.name ?? 'State Machine');
    const inputVars = sm.inputs.map((inp, inputIndex) => {
      const name = unique(String(inp.props.name ?? 'input'));
      fc.inputNames.set(`${abIndex}/${smIndex}/${inputIndex}`, name);
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
      // States are told apart by name in the layer's state variable, so two states showing the same animation get numbered
      const baseName = (st: RState) => String(st.obj.props.name ?? (st.obj.type === 'AnimationState' ? tlOf(st)?.name : st.obj.type) ?? 'state');
      const stateNames = new Map<RState, string>();
      const used = new Map<string, number>();
      for (const st of layer.states) {
        const b = baseName(st);
        const n = (used.get(b) ?? 0) + 1;
        used.set(b, n);
        stateNames.set(st, n > 1 ? `${b} (${n})` : b);
      }
      const stateName = (st: RState) => stateNames.get(st) ?? baseName(st);
      const layerTimelines = layer.states.map(tlOf).filter(Boolean) as Timeline[];
      // Blend states become blends on the artboard: entering the state plays its blend, leaving stops it
      const blendOf = new Map<RState, Blend>();
      for (const st of layer.states) {
        if (!isA(st.obj.type, 'BlendState')) continue;
        const b = riveBlend(fc, st, inputVars, timelines);
        if (!b) continue;
        (ab.blends ??= []).push(b);
        blendOf.set(st, b);
      }
      // The blend-in of a transition (Rive's mix): how long, its easing, whether the state left stands still (pause on exit)
      // and whether the next change may cut in (early exit)
      interface Mix {
        ms: number;
        ease: Easing;
        hold: boolean;
        early: boolean;
      }
      const mixParams = (m: Mix, outgoing: string) => ({ fade: String(m.ms), ...(m.ease !== 'linear' ? { fadeEase: m.ease } : {}), outgoing, ...(m.hold ? { hold: true } : {}), ...(m.early ? { earlyExit: true } : {}) });
      const goTo = (from: LogicNode, port: string, target: RState, x: number, mix?: Mix) => {
        let last = from;
        let lastPort = port;
        const others = layerTimelines.filter((o) => o !== tlOf(target)).map((o) => o.id);
        // With a blend-in, what is left keeps running under it and the player stops it when it is done; the target's
        // own blend still starts again from the top
        const mixing = !!mix && mix.ms > 0 && (!!tlOf(target) || blendOf.has(target));
        const outgoing = JSON.stringify([...others, ...[...blendOf.values()].filter((b) => b !== blendOf.get(target)).map((b) => b.id)]);
        if (others.length && !mixing) {
          // The layer's other states stop where they are; the target state's animation takes over
          const p = add('action.code', { code: `${JSON.stringify(others)}.forEach((id) => ix.timeline(id)?.pause());` }, x);
          p.note = 'Pause the layer’s other states';
          link(last, p, lastPort);
          last = p;
          lastPort = 'out';
          x += 240;
        }
        // The layer's blends stop (the target's own one starts again from the top below)
        for (const b of blendOf.values()) {
          if (mixing && b !== blendOf.get(target)) continue;
          const stop = add('action.blendStop', { blend: b.id }, x);
          link(last, stop, lastPort);
          last = stop;
          lastPort = 'out';
          x += 240;
        }
        const set = add('action.setVariable', { variable: stateVar.id, op: 'set', value: JSON.stringify(stateName(target)) }, x);
        link(last, set, lastPort);
        const entered = fireNodes(target.fires, 0, set, 'out', x + 240);
        const targetBlend = blendOf.get(target);
        if (targetBlend) {
          const play = add('action.blendPlay', { blend: targetBlend.id, ...(mixing ? mixParams(mix!, outgoing) : {}) }, entered.x);
          link(entered.last, play, entered.port);
          entered.last = play;
          entered.port = 'out';
          entered.x += 240;
        }
        const tl = tlOf(target);
        if (tl) {
          // A transition's blend time cross-fades the new state's pose in over the old one
          const play = add('action.timeline', { timeline: tl.id, op: 'restart', ...(mixing ? mixParams(mix!, outgoing) : {}) }, entered.x);
          link(entered.last, play, entered.port);
        }
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
      const trFlags = (tr: RTransition) => Number(tr.obj.props.flags ?? 0);
      const enabled = (st: RState) => st.transitions.filter((tr) => !(trFlags(tr) & 1) && layer.states[Number(tr.obj.props.stateToId ?? 0)] && layer.states[Number(tr.obj.props.stateToId ?? 0)].obj.type !== 'ExitState');
      // A transition's blend time in ms: given in ms, or a percentage of the animation it leaves (flag 2)
      const mixMs = (st: RState, tr: RTransition) => {
        const raw = get(tr.obj, 'duration');
        return trFlags(tr) & 2 ? Math.round(((tlOf(st)?.duration ?? 0) * raw) / 100) : raw;
      };
      // States that are entered by a transition with a blend time: leaving them waits for it (unless it allows leaving early)
      const mixedInto = new Set<RState>();
      for (const st of layer.states) for (const tr of enabled(st)) if (mixMs(st, tr) > 0) mixedInto.add(layer.states[Number(tr.obj.props.stateToId ?? 0)]);
      // Random transitions: a state where the valid transitions are told apart by weight (Rive's randomWeight, 1 if absent)
      const randomOf = new Map<RState, RTransition[]>();
      for (const st of layer.states) {
        const trs = enabled(st);
        if (trs.length < 2 || !trs.some((tr) => get(tr.obj, 'randomWeight') !== 1)) continue;
        if (trs.length > 6) fc.warnings.add('Random transitions out of a state with more than six transitions are not imported (the first one valid wins)');
        else if (trs.some((tr) => trFlags(tr) & 4)) fc.warnings.add('Random transitions that also use an exit time are not imported (the first one valid wins)');
        else randomOf.set(st, trs);
      }
      for (const [si, st] of layer.states.entries()) {
        if (st.obj.type === 'EntryState') continue;
        const group: { tr: RTransition; target: RState; condition: string; triggers: string[]; vmNames: string[]; specs: [string, Record<string, unknown>][]; mix: Mix }[] = [];
        for (const tr of st.transitions) {
          const target = layer.states[Number(tr.obj.props.stateToId ?? 0)];
          if (!target || target.obj.type === 'ExitState') continue;
          if (Number(tr.obj.props.flags ?? 0) & 1) continue; // disabled in the editor
          const conds: string[] = [];
          const triggers: string[] = [];
          const watched = new Set<string>();
          const vmTriggers: string[] = [];
          const vmNames: string[] = [];
          for (const c of tr.conditions) {
            if (c.type === 'TransitionViewModelCondition') {
              const comps = c.parts ?? [];
              const left = comps.find((x) => x.type === 'TransitionPropertyViewModelComparator');
              const right = comps.find((x) => x !== left);
              const lv = vmVar(contextOf(left));
              if (!lv) {
                fc.warnings.add('Some view model conditions point at properties that could not be found');
                continue;
              }
              if (lv.kind === 'trigger') {
                vmTriggers.push(lv.id);
                vmNames.push(lv.name);
                continue;
              }
              let rhs: string;
              if (right?.type === 'TransitionPropertyViewModelComparator') rhs = vmVar(contextOf(right))?.name ?? 'undefined';
              else if (right?.type === 'TransitionValueBooleanComparator') rhs = String(!!right.props.value);
              else if (right?.type === 'TransitionValueNumberComparator') rhs = String(r2(Number(right.props.value ?? 0)));
              else if (right?.type === 'TransitionValueColorComparator') rhs = JSON.stringify(argbCss(Number(right.props.value ?? 0)));
              else if (right?.type === 'TransitionValueEnumComparator') rhs = JSON.stringify(lv.options?.[Number(right.props.value ?? 0)] ?? '');
              else rhs = JSON.stringify(String(right?.props.value ?? ''));
              const ops = ['===', '!==', '<=', '>=', '<', '>'];
              conds.push(`${lv.name} ${ops[Number(c.props.opValue ?? 0)] ?? '==='} ${rhs}`);
              watched.add(lv.id);
              continue;
            }
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
          else if (watched.size) conds.push(`${stateVar.name} !== ${JSON.stringify(stateName(target))}`);
          // Rive checks conditions every frame: a condition that is already true when the layer enters a state (or
          // starts) must fire then too, so state changes re-check it
          if (watched.size) watched.add(stateVar.id);
          const condition = conds.join(' && ') || 'true';
          const specs: [string, Record<string, unknown>][] = [];
          // Exit time: Rive only takes the transition once the state's animation has played to that point (ms, or a share
          // of the animation with flag 8). One at the very end is the animation finishing; earlier ones are waited for
          // with a Wait for time in timeline node once the conditions hold
          const exitTl = trFlags(tr) & 4 ? tlOf(st) : undefined;
          const exitRaw = get(tr.obj, 'exitTime');
          const exitAt = exitTl ? Math.min(exitTl.duration, trFlags(tr) & 8 ? (exitTl.duration * exitRaw) / 100 : exitRaw) : 0;
          // (with a trigger there is no event for the animation finishing, so even an exit time at the end is waited for)
          const exitWait = !!exitTl && (exitAt < exitTl.duration - 0.5 || triggers.length > 0 || vmTriggers.length > 0);
          if (exitTl && !exitWait && !triggers.length && !vmTriggers.length) {
            watched.clear();
            if (exitTl.loop !== 'once') fc.warnings.add('Exit times on looping animations are checked when the animation first finishes');
          }
          for (const name of triggers) specs.push(['event.message', { name }]);
          // A view model trigger counts up when it fires: the transition runs on that change only
          for (const id of vmTriggers) specs.push(['event.variable', { variable: id }]);
          if (!triggers.length && !vmTriggers.length) {
            for (const id of watched) specs.push(['event.variable', { variable: id }]);
            // Rive checks Any state transitions every frame, starting with the first: one whose condition already holds
            // at the start (a loop that plays while a view model number is 0) has to run then, not on the first change
            if (st.obj.type === 'AnyState' && watched.size) specs.push(['event.start', {}]);
            // An Any state transition with nothing to wait for (the icons' "Loop ..." layers) is taken on the first frame
            if (st.obj.type === 'AnyState' && !watched.size) specs.push(['event.start', {}]);
            else if (!watched.size && exitWait) {
              // No inputs but an exit time part-way: look when the state is entered, the wait does the rest
              specs.push(['event.variable', { variable: stateVar.id }]);
            } else if (!watched.size) {
              // No inputs: leave when the state's animation finishes (exit time)
              const tl = tlOf(st);
              if (tl) {
                if (tl.loop !== 'once') fc.warnings.add('Transitions out of looping animations by exit time only happen once the animation is set to play once');
                specs.push(['event.timelineEnd', { timeline: tl.id }]);
              } else {
                if (blendOf.has(st)) fc.warnings.add('Transitions out of blend states by exit time only are not imported');
                continue;
              }
            }
          }
          const mix: Mix = { ms: mixMs(st, tr), ease: easeOf(ac, tr.obj), hold: !!(trFlags(tr) & 16), early: !!(trFlags(tr) & 32) };
          // Random transitions are picked between together, once every one of the state has been looked at
          if (randomOf.get(st)?.includes(tr)) {
            group.push({ tr, target, condition, triggers, vmNames, specs, mix });
            continue;
          }
          const sources = specs.map(([kind, params]) => add(kind, params, 40));
          const iff = add('logic.if', { condition }, 280);
          iff.note = `${stateName(st)} → ${stateName(target)}`;
          for (const s of sources) link(s, iff);
          let leave = { last: iff, port: 'true', x: 520 };
          // An exit time part-way through: wait for it, then make sure the transition still holds
          if (exitTl && exitWait) {
            const wait = add('action.waitTimeline', { timeline: exitTl.id, unit: 'ms', at: Math.round(exitAt) }, leave.x);
            link(leave.last, wait, leave.port);
            const again = add('logic.if', { condition }, leave.x + 240);
            link(wait, again);
            leave = { last: again, port: 'true', x: leave.x + 480 };
          }
          // Not while the state is still being blended into, unless that blend-in allows it
          if (mixedInto.has(st) && st.obj.type !== 'AnyState' && (tlOf(st) || blendOf.has(st))) {
            const drop = triggers.length > 0 || vmTriggers.length > 0;
            const gate = add('action.waitBlendIn', { ...(tlOf(st) ? { timeline: tlOf(st)!.id } : { blend: blendOf.get(st)!.id }), drop }, leave.x);
            link(leave.last, gate, leave.port);
            leave = { last: gate, port: 'out', x: leave.x + 240 };
            if (!drop) {
              const again = add('logic.if', { condition }, leave.x);
              link(gate, again);
              leave = { last: again, port: 'true', x: leave.x + 240 };
            }
          }
          // Leaving a state, the transition and entering the next one: their fire event actions, in that order
          if (st.obj.type !== 'AnyState') leave = fireNodes(st.fires, 1, leave.last, leave.port, leave.x);
          leave = fireNodes(tr.fires, 0, leave.last, leave.port, leave.x);
          leave = fireNodes(tr.fires, 1, leave.last, leave.port, leave.x);
          goTo(leave.last, leave.port, target, leave.x, mix);

          y += 120 + Math.max(0, sources.length - 1) * 100;
          void si;
        }
        if (group.length) {
          // One random pick among the valid transitions, by weight
          const seen = new Set<string>();
          const srcs: LogicNode[] = [];
          for (const g of group) {
            for (const [kind, params] of g.specs) {
              const key = kind + JSON.stringify(params);
              if (seen.has(key)) continue;
              seen.add(key);
              srcs.push(add(kind, params, 40));
            }
          }
          const valid = group.map((g) => {
            const fired = [...g.triggers.map((n) => `event.type === "message" && event.name === ${JSON.stringify(n)}`), ...g.vmNames.map((n) => `event.type === "variable" && event.name === ${JSON.stringify(n)}`)];
            const parts = [g.condition === 'true' ? '' : g.condition, fired.length ? fired.map((f) => `(${f})`).join(' && ') : ''].filter(Boolean);
            return `(${parts.join(' && ') || 'true'})`;
          });
          const pick = add('logic.random', { weights: `[${group.map((g) => get(g.tr.obj, 'randomWeight')).join(', ')}]`, valid: `[${valid.join(', ')}]` }, 280);
          pick.note = `${stateName(st)}: random transition`;
          // Not while the state is still being blended into, unless that blend-in allows it
          let into = pick;
          if (mixedInto.has(st) && st.obj.type !== 'AnyState' && (tlOf(st) || blendOf.has(st))) {
            const drop = group.some((g) => g.triggers.length > 0 || g.vmNames.length > 0);
            into = add('action.waitBlendIn', { ...(tlOf(st) ? { timeline: tlOf(st)!.id } : { blend: blendOf.get(st)!.id }), drop }, 280);
            link(into, pick);
          }
          for (const sn of srcs) link(sn, into);
          group.forEach((g, i) => {
            let leave = { last: pick, port: String(i + 1), x: 520 };
            if (st.obj.type !== 'AnyState') leave = fireNodes(st.fires, 1, leave.last, leave.port, leave.x);
            leave = fireNodes(g.tr.fires, 0, leave.last, leave.port, leave.x);
            leave = fireNodes(g.tr.fires, 1, leave.last, leave.port, leave.x);
            goTo(leave.last, leave.port, g.target, leave.x, g.mix);
          });
          y += 120 + group.length * 60;
        }
      }
    });
    // Listeners -> pointer, key and focus events setting inputs
    const keyEvents = (key: RObj): LogicNode[] => {
      const code = Number(key.props.keyType ?? -1);
      const name = code < 0 || code > 0xffff ? '' : RIVE_KEYS[code];
      if (code >= 0 && code <= 0xffff && !name) fc.warnings.add(`Keyboard listeners for the key with code ${code} react to any key`);
      const mods = Number(key.props.modifiers ?? 0);
      const phase = Number(key.props.keyPhase ?? 0) || 1;
      const base = { key: name ?? '', shift: !!(mods & 1), ctrl: !!(mods & 2), alt: !!(mods & 4), meta: !!(mods & 8) };
      const out: LogicNode[] = [];
      if (phase & 3) out.push(add('event.key', { ...base, type: 'keydown', repeat: !!(phase & 2) }, 40));
      if (phase & 4) out.push(add('event.key', { ...base, type: 'keyup' }, 40));
      return out;
    };
    for (const l of sm.listeners) {
      const pointer: Record<number, string> = { 0: 'pointerenter', 1: 'pointerleave', 2: 'pointerdown', 3: 'pointerup', 4: 'pointermove', 6: 'click', 9: 'dragstart', 10: 'dragend', 12: 'drag' };
      // Older files keep one trigger on the listener; newer ones list ListenerInputType objects (events are type 5)
      const triggers = l.inputTypes.length
        ? l.inputTypes.map((it) => ({ type: it.type === 'ListenerInputTypeEvent' ? 5 : it.type === 'ListenerInputTypeKeyboard' ? 15 : Number(it.props.listenerTypeValue ?? 0), eventId: it.props.eventId }))
        : [{ type: Number(l.obj.props.listenerTypeValue ?? 0), eventId: l.obj.props.eventId }];
      const sources: LogicNode[] = [];
      const targetNode = ac.nodeBySlot.get(Number(l.obj.props.targetId ?? 0));
      for (const trig of triggers) {
        if (trig.type === 5) {
          // Event listeners react to Rive events, which are messages here
          const ev = ac.rab.slots[Number(trig.eventId ?? -1)];
          if (ev && isA(ev.type, 'Event')) sources.push(add('event.message', { name: eventName(ev) }, 40));
          else fc.warnings.add('Event listeners whose events could not be found were skipped');
        } else if (trig.type in pointer) {
          sources.push(add('event.pointer', { target: targetNode?.id ?? '', type: pointer[trig.type] }, 40));
        } else if (trig.type === 13 || trig.type === 14) {
          sources.push(add('event.focus', { target: targetNode?.id ?? '', type: trig.type === 13 ? 'focus' : 'blur' }, 40));
        } else if (trig.type === 15) {
          if (targetNode) fc.warnings.add('Keyboard listeners on a layer react to the key wherever the focus is, not only while that layer has it');
          if (!l.keys.length) sources.push(add('event.key', { key: '', type: 'keydown' }, 40));
          for (const key of l.keys) sources.push(...keyEvents(key));
        } else fc.warnings.add(`Listener type ${trig.type} (only enter, exit, down, up, move, click, drag, focus, blur, keyboard and event listeners are imported)`);
      }
      if (!sources.length) continue;
      let last: LogicNode = sources[0];
      let x = 280;
      const firstAction = nodes.length;
      for (const a of l.actions) {
        if (a.type === 'ListenerFireEvent') {
          const r = eventChain(Number(a.props.eventId ?? 0), last, 'out', x);
          last = r.last;
          x = r.x;
          continue;
        }
        if (a.type === 'ListenerViewModelChange') {
          const target = vmVar(contextOf(a));
          const bindable = (a.parts ?? []).find((x) => isA(x.type, 'BindableProperty'));
          if (!target) {
            fc.warnings.add('Some listeners change view model properties that could not be found');
            continue;
          }
          const raw = bindable?.props.propertyValue;
          const value =
            target.kind === 'boolean'
              ? String(!!raw)
              : target.kind === 'number'
                ? String(r2(Number(raw ?? 0)))
                : target.kind === 'color'
                  ? JSON.stringify(argbCss(Number(raw ?? 0)))
                  : target.kind === 'enum'
                    ? JSON.stringify(target.options?.[Number(raw ?? 0)] ?? '')
                    : JSON.stringify(String(raw ?? ''));
          const n = target.kind === 'trigger' ? add('action.setVariable', { variable: target.id, op: 'add', value: '1' }, x) : add('action.setVariable', { variable: target.id, op: 'set', value }, x);
          link(last, n);
          last = n;
          x += 240;
          continue;
        }
        if (a.type === 'FocusActionTarget' || a.type === 'FocusActionClear') {
          const focusTarget = ac.nodeBySlot.get(Number(a.props.targetId ?? -1));
          if (a.type === 'FocusActionTarget' && !focusTarget) {
            fc.warnings.add('Focus actions whose layer could not be found were skipped');
            continue;
          }
          const n = add('action.focus', a.type === 'FocusActionClear' ? { op: 'clear' } : { op: 'focus', target: focusTarget!.id }, x);
          link(last, n);
          last = n;
          x += 240;
          continue;
        }
        if (a.type === 'FocusActionTraversal') {
          fc.warnings.add('Focus traversal actions (next / previous / direction) are not imported');
          continue;
        }
        if (a.type === 'ListenerAlignTarget') {
          // The target's origin follows the pointer: x and y set from the event's position, taken back into the target's parent
          const target = ac.nodeBySlot.get(Number(a.props.targetId ?? -1));
          const tSlot = Number(a.props.targetId ?? -1);
          if (!target) {
            fc.warnings.add('Align target actions whose layer could not be found were skipped');
            continue;
          }
          if (get<boolean>(a, 'preserveOffset')) fc.warnings.add('Align target actions that keep the offset put the layer on the pointer instead');
          const rab = fc.file.artboards[abIndex].obj;
          const ox = get(rab, 'width') * get(rab, 'originX');
          const oy = get(rab, 'height') * get(rab, 'originY');
          const parent = Number(ac.rab.slots[tSlot]?.props.parentId ?? 0);
          const inv = invert(worldOf(ac, parent));
          const k = (v: number) => String(Math.round(v * 10000) / 10000);
          const part = (m: number, n: number, c: number) => `${k(m)} * (event.x - ${k(ox)}) + ${k(n)} * (event.y - ${k(oy)}) + ${k(c)}`;
          // A layer at the top level of the artboard also sits the artboard's origin further along
          const shift = parent === 0 ? [ox, oy] : [0, 0];
          const dx = r2(shift[0] - target.originX * target.width);
          const dy = r2(shift[1] - target.originY * target.height);
          const sx = add('action.setProperty', { target: target.id, prop: 'x', value: `${part(inv[0], inv[2], inv[4])} + ${k(dx)}` }, x);
          const sy = add('action.setProperty', { target: target.id, prop: 'y', value: `${part(inv[1], inv[3], inv[5])} + ${k(dy)}` }, x + 240);
          link(last, sx);
          link(sx, sy);
          last = sy;
          x += 480;
          continue;
        }
        // An input of a nested artboard: set it on the instance
        const nestedSlot = a.props.nestedInputId;
        if (nestedSlot !== undefined && ac.rab.slots[Number(nestedSlot)] && isA(ac.rab.slots[Number(nestedSlot)].type, 'NestedInput')) {
          const ref = nestedRef(ac, Number(nestedSlot));
          if (!ref) {
            fc.warnings.add('Listener actions on nested inputs whose nested artboard could not be found were skipped');
            continue;
          }
          const bv = Number(a.props.value ?? 1);
          if (a.type === 'ListenerBoolChange' && bv === 2) fc.warnings.add('Toggling a nested bool is imported as setting it to true');
          const value = ref.kind === 'bool' ? bv !== 0 : ref.kind === 'number' ? r2(get(a, 'value')) : true;
          const n = nestedAction(ref, value, x);
          link(last, n);
          last = n;
          x += 240;
          continue;
        }
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
      // Several events trigger the same actions
      if (nodes.length > firstAction) for (const extra of sources.slice(1)) link(extra, nodes[firstAction]);
      y += 120;
    }
  }
}

/**
 * A Rive joystick positions an animation from x / y in -1..1: either set by hand, or read from where a handle layer sits
 * in the joystick's rectangle. Ours takes 0..1 expressions, with the handle's place in an area as `handle.x` / `handle.y`.
 */
function importJoysticks(ac: ArtboardCtx, fc: FileCtx, ab: Artboard, timelines: Timeline[], ox: number, oy: number): void {
  ac.rab.slots.forEach((j, i) => {
    if (i === 0 || j.type !== 'Joystick') return;
    const xTl = timelines[Number(get(j, 'xId'))];
    const yTl = timelines[Number(get(j, 'yId'))];
    if (!xTl && !yTl) return;
    const flags = get(j, 'joystickFlags');
    const handleSlot = 'handleSourceId' in j.props ? Number(get(j, 'handleSourceId')) : -1;
    const handle = handleSlot > 0 ? ac.nodeBySlot.get(handleSlot) : undefined;
    const name = String(j.props.name ?? '') || `Joystick ${(ab.joysticks?.length ?? 0) + 1}`;
    const axis = (v: string, invert: boolean) => (invert ? `1 - ${v}` : v);
    const out: Joystick = { id: uid('j'), name, xTimeline: xTl?.id ?? null, x: '0.5', yTimeline: yTl?.id ?? null, y: '0.5' };
    if (handle) {
      // The joystick's rectangle in the artboard: its parent's space, moved to its own position, around its origin
      const m = multiply(worldOf(ac, Number(j.props.parentId ?? 0)), [1, 0, 0, 1, get(j, 'posX'), get(j, 'posY')]);
      const w = get(j, 'width');
      const h = get(j, 'height');
      const x0 = -w * get(j, 'originX');
      const y0 = -h * get(j, 'originY');
      const corners = [ap(m, x0, y0), ap(m, x0 + w, y0), ap(m, x0 + w, y0 + h), ap(m, x0, y0 + h)];
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      if (Math.abs(m[1]) > 1e-4 || Math.abs(m[2]) > 1e-4) fc.warnings.add('Joysticks inside a rotated or skewed layer use the rectangle around it');
      out.handle = handle.id;
      out.area = { x: r2(Math.min(...xs) + ox), y: r2(Math.min(...ys) + oy), width: Math.max(1, r2(Math.max(...xs) - Math.min(...xs))), height: Math.max(1, r2(Math.max(...ys) - Math.min(...ys))) };
      out.x = axis('handle.x', !!(flags & 1));
      out.y = axis('handle.y', !!(flags & 2));
    } else {
      // Set by hand: -1..1 becomes the position from the start to the end of the animation
      const at = (v: number, invert: boolean) => String(r2((Math.max(-1, Math.min(1, invert ? -v : v)) + 1) / 2));
      out.x = at(get(j, 'x'), !!(flags & 1));
      out.y = at(get(j, 'y'), !!(flags & 2));
    }
    if (handleSlot > 0 && !handle) fc.warnings.add('A joystick whose handle layer could not be found keeps its set position');
    (ab.joysticks ??= []).push(out);
  });
}

// ---------------------------------------------------------------- entry point

export async function importRive(bytes: Uint8Array, name: string): Promise<RiveImport> {
  const { objects } = readObjects(bytes);
  const s = structure(objects);
  contexts.clear();
  const variables: Variable[] = [];
  const names = new Set<string>();
  const fc: FileCtx = {
    file: { artboards: s.artboards, assets: s.assets },
    warnings: s.warnings,
    assets: [],
    assetIdByIndex: new Map(),
    fonts: [],
    built: new Map(),
    building: new Set(),
    abIds: s.artboards.map(() => uid('ab')),
    pendingInputs: [],
    inputNames: new Map(),
    viewModels: s.viewModels,
    enums: s.enums,
    converters: s.converters,
    variables,
    names,
    vmVars: new Map(),
    timelineEvents: new Map(),
    nestedKeys: [],
    pendingNested: [],
  };
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
    let kids = buildArtboardNodes(fc, index).map((k) => shiftBindings({ ...k, x: r2(k.x + ox), y: r2(k.y + oy) } as SceneNode, ox, oy));
    const root = new Set(kids.map((k) => k.id));
    // Layout artboards: the artboard itself is the root layout box
    const rootSlots = [...(ac.children.get(0) ?? [])];
    // A root with only text (and shapes) is not laid out: the texts keep their positions. Rive lays the artboard out only
    // once a real layout item sits in it.
    if (rootSlots.some((i) => takesPart(rab.slots[i].type) && rab.slots[i].type !== 'Text')) {
      const style = rab.obj.props.styleId !== undefined ? rab.slots[Number(rab.obj.props.styleId)] : undefined;
      const participants = new Set(rootSlots.filter((i) => takesPart(rab.slots[i].type)).map((i) => ac.nodeBySlot.get(i)?.id));
      const wrap = createNode('frame', {
        name: 'Artboard layout',
        x: 0,
        y: 0,
        width: Math.round(w),
        height: Math.round(h),
        fill: null,
        stroke: null,
        cornerRadius: 0,
        clip: false,
        layout: { ...autoLayoutOf(fc, style, layoutBox(ac, 0), (ac.children.get(0) ?? []).map((i) => rab.slots[i]).filter((o) => o.type === 'GridTrack')), hugWidth: false, hugHeight: false },
        children: kids.map((k) => (participants.has(k.id) ? k : ({ ...k, layoutItem: { position: 'ignore' } } as SceneNode))),
      });
      wrap.originX = 0;
      wrap.originY = 0;
      kids = [wrap];
    }
    const bg = (ac.children.get(0) ?? []).map((i) => ({ i, o: rab.slots[i] })).find((k) => k.o.type === 'Fill');
    const background = bg ? paintOf(ac, fc, bg.i, null).paint : null;
    const ab = createArtboard({
      id: fc.abIds[index],
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
    importJoysticks(ac, fc, ab, timelines, ox, oy);
    buildMachines(ac, fc, ab, timelines, names, variables, index);
    artboards.push(ab);
  });
  // Instance inputs, now that every state machine input has a variable name
  // (a root layer was copied to sit relative to the artboard origin, so the instance is looked up by id in the finished artboards)
  const finished = new Map<string, SceneNode>();
  for (const ab of artboards) walk(ab.children, (n) => finished.set(n.id, n));
  for (const p of fc.pendingInputs) {
    const name = fc.inputNames.get(`${p.artboard}/${p.machine}/${p.input}`);
    const node = (finished.get(p.node.id) ?? p.node) as InstanceNode;
    if (name) node.inputs = { ...(node.inputs ?? {}), [name]: p.value };
  }
  // Nested input flows, now that every input has a name; a marker is named after the instance and input
  for (const p of fc.pendingNested) {
    const inputName = fc.inputNames.get(`${p.ref.artboard}/${p.ref.machine}/${p.ref.input}`);
    if (inputName) p.node.params.name = inputName;
  }
  const renamed = new Map<string, string>();
  const temps = fc.nestedKeys.map((nk) => nk.marker.name);
  fc.nestedKeys.forEach((nk, i) => {
    const key = `${nk.tl.id}|${temps[i]}`;
    if (renamed.has(key)) return;
    const inputName = fc.inputNames.get(`${nk.ref.artboard}/${nk.ref.machine}/${nk.ref.input}`) ?? `input ${nk.ref.input}`;
    const wanted = `${nk.ref.inst.name}: ${inputName}${nk.ref.kind === 'trigger' ? '' : ` = ${String(nk.value)}`}`;
    const taken = new Set((nk.tl.markers ?? []).map((m) => m.name));
    let name = wanted;
    for (let n = 2; taken.has(name); n++) name = `${wanted} (${n})`;
    renamed.set(key, name);
    for (const ab of artboards) for (const n of ab.logic.nodes) if (n.kind === 'event.timelineMarker' && n.params.timeline === nk.tl.id && n.params.marker === temps[i]) n.params.marker = name;
    for (const m of nk.tl.markers ?? []) if (m.name === temps[i]) m.name = name;
  });
  void name;
  const start = artboards.find((a) => a.name === String(s.artboards[0].obj.props.name)) ?? artboards[0];
  return { artboard: start, artboards, assets: fc.assets, variables, fonts: fc.fonts, warnings: [...fc.warnings] };
}

/** For tests and diagnostics: the raw object list. */
export function readRiveObjects(bytes: Uint8Array): { type: string; props: Record<string, unknown> }[] {
  return readObjects(bytes).objects;
}
