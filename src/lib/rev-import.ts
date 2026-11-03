/**
 * Rive editor project files (.rev). The format is not published, so this reader comes from the bytes of real files checked
 * against the .riv exported from them (research/rive/rev-format.md has the notes).
 *
 * A .rev is a flat list of editor objects: a small header, then for every object
 *   typeKey (varuint), client (varuint), id (varuint), property count (varuint), then count x (key varuint, byte length varuint, value bytes)
 * The type keys and the keys of every runtime property are the same ones a .riv uses (rive-defs.ts), so a property's meaning and
 * type come from there. What differs from a .riv: every value carries a byte length, the object tree is spelled out in ids instead of
 * file order (a reference is two varuints, client and id, where a .riv has an index into its own object list), and the editor adds
 * its own keys (lists, child order, the parent links of animations and state machines) and object types (folders, imported SVG
 * sources, built-in enums). Here the file is rewritten into the object list a .riv would hold, with every reference turned back
 * into an index, and handed to the .riv importer, so a .rev opens as the same project the .riv exported from it does, plus the
 * names the export strips and the artboards it leaves out.
 */
import { classProps, importRiveObjects, isA, propNameByKey, typeByKey, type RObj, type RiveImport } from './rive-import';

interface Id {
  client: number;
  id: number;
}

interface RevObj {
  /** Position in the file. */
  n: number;
  client: number;
  id: number;
  typeKey: number;
  type: string;
  raw: Map<number, Uint8Array>;
}

const idKey = (client: number, id: number) => `${client}:${id}`;

function varuintAt(b: Uint8Array, p: number): [number, number] | null {
  let r = 0;
  let s = 0;
  for (;;) {
    if (p >= b.length) return null;
    const x = b[p++];
    r += (x & 0x7f) * Math.pow(2, s);
    s += 7;
    if (x < 0x80) return [r, p];
    if (s > 49) return null;
  }
}

/** Walks the object records from one offset; returns the objects when they fill the file exactly. */
function readRecords(bytes: Uint8Array, start: number, count: number): RevObj[] | null {
  const out: RevObj[] = [];
  let p = start;
  const next = (): number => {
    const v = varuintAt(bytes, p);
    if (!v) throw new Error('end');
    p = v[1];
    return v[0];
  };
  try {
    for (let i = 0; i < count; i++) {
      const typeKey = next();
      const client = next();
      const id = next();
      const n = next();
      if (n > 4000) return null;
      const raw = new Map<number, Uint8Array>();
      for (let j = 0; j < n; j++) {
        const key = next();
        const len = next();
        if (p + len > bytes.length) return null;
        raw.set(key, bytes.subarray(p, p + len));
        p += len;
      }
      out.push({ n: i, client, id, typeKey, type: typeByKey.get(typeKey) ?? `#${typeKey}`, raw });
    }
  } catch {
    return null;
  }
  return p === bytes.length ? out : null;
}

/** major, minor, file id, then four bytes that read ' ART' in the sample, then the object count. */
function readRevHeader(bytes: Uint8Array): { start: number; count: number } | null {
  let p = 0;
  for (let i = 0; i < 3; i++) {
    const v = varuintAt(bytes, p);
    if (!v) return null;
    p = v[1];
  }
  p += 4;
  const c = varuintAt(bytes, p);
  if (!c || c[0] < 1 || c[0] > 5_000_000) return null;
  return { start: c[1], count: c[0] };
}

export function readRevObjects(bytes: Uint8Array): RevObj[] {
  if (bytes.length < 16 || bytes[0] !== 7) throw new Error('Not a Rive editor file (.rev)');
  // The four bytes after the file id are not understood yet, so if the count is not where the sample has it, look a little further on
  let found: RevObj[] | null = null;
  const h = readRevHeader(bytes);
  if (h) found = readRecords(bytes, h.start, h.count);
  if (!found) {
    for (let at = 4; at < 40 && !found; at++) {
      const c = varuintAt(bytes, at);
      if (c && c[0] > 0 && c[0] < 5_000_000) found = readRecords(bytes, c[1], c[0]);
    }
  }
  if (!found) throw new Error('This .rev file is laid out differently from the ones this importer was written against');
  return found;
}

// ---------------------------------------------------------------- values

function varuintOf(b: Uint8Array): number | null {
  const v = varuintAt(b, 0);
  return v && v[1] === b.length ? v[0] : null;
}

function idOf(b: Uint8Array): Id | null {
  const a = varuintAt(b, 0);
  if (!a) return null;
  const c = varuintAt(b, a[1]);
  return c && c[1] === b.length ? { client: a[0], id: c[0] } : null;
}

function floatOf(b: Uint8Array): number {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return b.length === 8 ? v.getFloat64(0, true) : b.length === 4 ? v.getFloat32(0, true) : 0;
}

/** A fractional index (child order): numerator then denominator. */
function fraction(b: Uint8Array | undefined): number {
  if (!b) return 0;
  const a = varuintAt(b, 0);
  if (!a) return 0;
  const d = varuintAt(b, a[1]);
  return d && d[0] ? a[0] / d[0] : a[0];
}

function idList(b: Uint8Array | undefined): Id[] {
  const out: Id[] = [];
  if (!b || !b.length) return out;
  const n = varuintAt(b, 0);
  if (!n) return out;
  let p = n[1];
  for (let i = 0; i < n[0]; i++) {
    const c = varuintAt(b, p);
    const d = c && varuintAt(b, c[1]);
    if (!c || !d) break;
    out.push({ client: c[0], id: d[0] });
    p = d[1];
  }
  return out;
}

const utf8 = new TextDecoder();

// Where an object's owner is written, by the base class the type derives from. The editor adds these keys on top of the runtime ones.
const OWNER_KEYS: [string, number][] = [
  ['KeyFrame', 72],
  ['KeyedProperty', 71],
  ['KeyedObject', 52],
  ['Animation', 54],
  ['StateMachineComponent', 137],
  ['LayerState', 146],
  ['StateMachineLayerComponent', 150],
  ['TransitionCondition', 153],
  ['StateMachineFireAction', 391],
  ['ListenerAction', 226],
  ['ListenerInputType', 961],
  ['Component', 5],
];
const ORDER_KEYS: [string, number][] = [
  ['Animation', 73],
  ['StateMachineComponent', 139],
  ['StateMachineLayerComponent', 159],
  ['TransitionCondition', 154],
  ['ListenerAction', 230],
  ['Component', 6],
];
const classKey = (type: string, table: [string, number][]): number | undefined => table.find(([c]) => isA(type, c))?.[1];
// Things the sample never had: where the owner's key is not known, the first reference to an object of this class is taken as the owner
const OWNER_CLASS: [string, string][] = [
  ['BlendAnimation', 'BlendState'],
  ['KeyboardInput', 'StateMachineListener'],
  ['DataConverterGroupItem', 'DataConverterGroup'],
  ['FormulaToken', 'DataConverterFormula'],
  ['ViewModelInstanceListItem', 'ViewModelInstanceList'],
];
// Editor-only objects (folders, imported vector sources, built-in enums): nothing to bring over
const EDITOR_ONLY = new Set([132, 140, 152, 595, 605, 624]);

// ---------------------------------------------------------------- conversion

export interface RevInfo {
  /** Object types and property keys this importer does not know, with how many there were. */
  unknown: Record<string, number>;
  objects: number;
}

/** Rewrites a .rev into the object list a .riv would hold. */
export function revToRiveObjects(bytes: Uint8Array): { objects: RObj[]; info: RevInfo } {
  const revs = readRevObjects(bytes);
  const byId = new Map<string, RevObj>();
  for (const o of revs) byId.set(idKey(o.client, o.id), o);
  const unknown: Record<string, number> = {};
  const note = (what: string) => (unknown[what] = (unknown[what] ?? 0) + 1);
  for (const o of revs) if (o.type.startsWith('#') && !EDITOR_ONLY.has(o.typeKey)) note(`type ${o.typeKey}`);

  const idProp = (o: RevObj, key: number): RevObj | undefined => {
    const b = o.raw.get(key);
    const i = b && idOf(b);
    return i ? byId.get(idKey(i.client, i.id)) : undefined;
  };
  const ownerOf = (o: RevObj): RevObj | undefined => {
    const key = classKey(o.type, OWNER_KEYS);
    const direct = key === undefined ? undefined : idProp(o, key);
    if (direct) return direct;
    const want = OWNER_CLASS.find(([c]) => isA(o.type, c))?.[1];
    if (!want) return undefined;
    for (const b of o.raw.values()) {
      const i = idOf(b);
      const t = i && byId.get(idKey(i.client, i.id));
      if (t && t !== o && isA(t.type, want)) return t;
    }
    return undefined;
  };
  const orderOf = (o: RevObj) => {
    const key = classKey(o.type, ORDER_KEYS);
    return key === undefined ? 0 : fraction(o.raw.get(key));
  };
  const byOrder = (a: RevObj, b: RevObj) => orderOf(a) - orderOf(b) || a.n - b.n;

  // Which artboard each object belongs to
  const artboards = revs.filter((o) => o.type === 'Artboard');
  const abOf = new Map<RevObj, RevObj | null>();
  const owner = new Map<RevObj, RevObj | undefined>();
  for (const o of revs) owner.set(o, ownerOf(o));
  const referrers = new Map<RevObj, RevObj[]>();
  const refer = (to: RevObj | undefined, from: RevObj) => {
    if (to) (referrers.get(to) ?? referrers.set(to, []).get(to)!).push(from);
  };
  for (const o of revs) {
    if (isA(o.type, 'KeyFrame')) refer(idProp(o, 69), o);
    if (isA(o.type, 'StateTransition')) refer(idProp(o, 350), o);
    if (isA(o.type, 'DataBind')) refer(idProp(o, 585), o);
    // The bindable property and comparators of a condition or listener action
    if (isA(o.type, 'TransitionViewModelCondition')) {
      refer(idProp(o, 648), o);
      refer(idProp(o, 649), o);
    }
    if (isA(o.type, 'TransitionPropertyViewModelComparator')) refer(idProp(o, 646), o);
    if (o.type === 'ListenerViewModelChange') refer(idProp(o, 657), o);
  }
  const abFor = (o: RevObj, seen = new Set<RevObj>()): RevObj | null => {
    if (abOf.has(o)) return abOf.get(o)!;
    if (o.type === 'Artboard') return o;
    if (seen.has(o)) return null;
    seen.add(o);
    let r: RevObj | null = null;
    const up = owner.get(o);
    if (up) r = abFor(up, seen);
    else {
      for (const from of referrers.get(o) ?? []) {
        r = abFor(from, seen);
        if (r) break;
      }
    }
    abOf.set(o, r);
    return r;
  };

  // File level: assets, converters, enums, view models
  const abIndex = new Map<RevObj, number>();
  const out: RObj[] = [];
  const assetIndex = new Map<RevObj, number>();
  const converterIndex = new Map<RevObj, number>();
  const enumIndex = new Map<RevObj, number>();
  const vmIndex = new Map<RevObj, number>();
  const vmPropIndex = new Map<RevObj, number>();

  // The backboard names the default artboard (the one a .riv puts first), then the file's own order
  const backboard = revs.find((o) => o.type === 'Backboard');
  const defaultAb = (backboard && idProp(backboard, 43)) ?? artboards[0];
  const ordered = [...artboards.filter((a) => a === defaultAb), ...artboards.filter((a) => a !== defaultAb)];
  ordered.forEach((a, i) => abIndex.set(a, i));

  // Decodes a value by the type the runtime definitions give its key
  type Pending = { name: string; target: RevObj };
  const decode = (o: RevObj, key: number, b: Uint8Array, pending: Pending[], props: Record<string, unknown>) => {
    const def = classProps(o.type).get(key) ?? propNameByKey.get(key);
    if (!def) {
      note(`key ${key}`);
      return;
    }
    switch (def.type) {
      case 'f':
        props[def.name] = floatOf(b);
        break;
      case 's':
        props[def.name] = utf8.decode(b);
        break;
      case 'y':
        props[def.name] = b.slice();
        break;
      case 'b':
        props[def.name] = b.length ? b[0] !== 0 : false;
        break;
      case 'c':
        props[def.name] = varuintOf(b) ?? 0;
        break;
      case 'i': {
        const z = varuintOf(b) ?? 0;
        props[def.name] = z % 2 ? -(z + 1) / 2 : z / 2;
        break;
      }
      default: {
        const n = varuintOf(b);
        if (n !== null) props[def.name] = n;
        else {
          const i = idOf(b);
          const t = i && byId.get(idKey(i.client, i.id));
          if (t) pending.push({ name: def.name, target: t });
        }
      }
    }
  };

  // Fonts, images and sounds that something uses (the editor keeps every file it was ever given)
  const used = new Set<RevObj>();
  for (const o of revs) {
    if (isA(o.type, 'FileAsset') || o.type === 'FileAssetContents') continue;
    for (const b of o.raw.values()) {
      const i = idOf(b);
      const t = i && byId.get(idKey(i.client, i.id));
      if (t && isA(t.type, 'FileAsset')) used.add(t);
    }
  }
  const contentsOf = new Map<RevObj, RevObj>();
  for (const o of revs) if (o.type === 'FileAssetContents') {
    const a = idProp(o, 213);
    if (a) contentsOf.set(a, o);
  }

  // Indices for the file-level things first, as the artboards refer back to them
  const assets = revs.filter((o) => isA(o.type, 'FileAsset') && used.has(o)).sort((a, b) => a.n - b.n);
  assets.forEach((a, i) => assetIndex.set(a, i));
  const converters = revs.filter((o) => isA(o.type, 'DataConverter') && !isA(o.type, 'FormulaToken')).sort((a, b) => a.n - b.n);
  converters.forEach((c, i) => converterIndex.set(c, i));
  const customEnums = revs.filter((o) => o.type === 'DataEnumCustom').sort((a, b) => a.n - b.n);
  customEnums.forEach((c, i) => enumIndex.set(c, i));
  const vms = revs.filter((o) => o.type === 'ViewModel').sort((a, b) => a.n - b.n);
  vms.forEach((v, i) => vmIndex.set(v, i));
  const vmProps = new Map<RevObj, RevObj[]>();
  for (const o of revs) if (isA(o.type, 'ViewModelProperty')) {
    const vm = idProp(o, 558);
    if (vm) (vmProps.get(vm) ?? vmProps.set(vm, []).get(vm)!).push(o);
  }
  for (const list of vmProps.values()) {
    list.sort((a, b) => fraction(a.raw.get(559)) - fraction(b.raw.get(559)) || a.n - b.n);
    list.forEach((p, i) => vmPropIndex.set(p, i));
  }

  // Turn a reference into the index a .riv holds for it
  const slotOf = new Map<RevObj, number>();
  const animOf = new Map<RevObj, number>();
  const machineOf = new Map<RevObj, number>();
  const inputOf = new Map<RevObj, number>();
  const stateOf = new Map<RevObj, number>();
  const resolve = (name: string, t: RevObj): number | undefined => {
    if (t.type === 'Artboard') return name === 'artboardId' ? abIndex.get(t) : 0;
    if (t.type === 'ViewModel') return vmIndex.get(t);
    if (isA(t.type, 'ViewModelProperty')) return vmPropIndex.get(t);
    if (isA(t.type, 'FileAsset')) return assetIndex.get(t);
    if (isA(t.type, 'DataConverter')) return converterIndex.get(t);
    if (isA(t.type, 'DataEnum')) return enumIndex.get(t);
    if (t.type === 'LinearAnimation' || isA(t.type, 'LinearAnimation')) return animOf.get(t);
    if (t.type === 'StateMachine') return machineOf.get(t);
    if (isA(t.type, 'StateMachineInput')) return inputOf.get(t);
    if (isA(t.type, 'LayerState')) return stateOf.get(t);
    if (isA(t.type, 'Component') || isA(t.type, 'KeyFrameInterpolator')) return slotOf.get(t);
    return undefined;
  };

  const build = (o: RevObj, extra?: Record<string, unknown>): RObj => {
    const props: Record<string, unknown> = {};
    const pending: Pending[] = [];
    for (const [key, b] of o.raw) decode(o, key, b, pending, props);
    for (const p of pending) {
      const v = resolve(p.name, p.target);
      if (v !== undefined) props[p.name] = v;
    }
    if (extra) Object.assign(props, extra);
    return { type: o.type, props };
  };
  // Path ids (data binds): view model index, then property indexes, as varuints
  const pathBytes = (b: Uint8Array | undefined): Uint8Array => {
    const bytes: number[] = [];
    for (const i of idList(b)) {
      const t = byId.get(idKey(i.client, i.id));
      const v = t ? resolve('path', t) : undefined;
      let n = v ?? 0;
      do {
        const low = n & 0x7f;
        n = Math.floor(n / 128);
        bytes.push(n ? low | 0x80 : low);
      } while (n);
    }
    return Uint8Array.from(bytes);
  };

  // Assets
  for (const a of assets) {
    out.push(build(a));
    const c = contentsOf.get(a);
    if (c) out.push(build(c));
  }
  // Data converters (and their items)
  const childrenOf = new Map<RevObj, RevObj[]>();
  for (const o of revs) {
    const up = owner.get(o);
    if (up) (childrenOf.get(up) ?? childrenOf.set(up, []).get(up)!).push(o);
  }
  for (const c of converters) {
    out.push(build(c));
    for (const k of (childrenOf.get(c) ?? []).sort(byOrder)) out.push(build(k));
  }
  // Enums
  for (const e of customEnums) {
    out.push(build(e));
    const vals = revs.filter((o) => o.type === 'DataEnumValue' && idProp(o, 580) === e).sort((a, b) => fraction(a.raw.get(581)) - fraction(b.raw.get(581)) || a.n - b.n);
    for (const v of vals) out.push(build(v));
  }
  // View models, their properties and instances
  for (const vm of vms) {
    out.push(build(vm));
    for (const p of vmProps.get(vm) ?? []) out.push(build(p));
  }
  for (const vm of vms) {
    const instances = revs.filter((o) => o.type === 'ViewModelInstance' && idProp(o, 566) === vm).sort((a, b) => a.n - b.n);
    for (const inst of instances) {
      out.push(build(inst));
      const values = revs.filter((o) => isA(o.type, 'ViewModelInstanceValue') && idProp(o, 553) === inst).sort(byOrder);
      for (const v of values) {
        out.push(build(v));
        if (v.type === 'ViewModelInstanceList') for (const li of revs.filter((x) => x.type === 'ViewModelInstanceListItem' && idProp(x, 553) === v).sort(byOrder)) out.push(build(li));
      }
    }
  }

  // Artboards
  const dataBindsOf = new Map<RevObj, RevObj[]>();
  for (const o of revs) if (isA(o.type, 'DataBind')) {
    const t = idProp(o, 585);
    if (t) (dataBindsOf.get(t) ?? dataBindsOf.set(t, []).get(t)!).push(o);
  }

  for (const ab of ordered) {
    const mine = (o: RevObj) => abFor(o) === ab;
    const members = revs.filter(mine);
    // Slots: the artboard, its components depth first in child order, then the interpolators
    const slots: RevObj[] = [ab];
    const kids = (o: RevObj) => (childrenOf.get(o) ?? []).filter((k) => isA(k.type, 'Component') && !isA(k.type, 'ViewModelInstanceValue')).sort(byOrder);
    const walk = (o: RevObj) => {
      for (const k of kids(o)) {
        if (k.type.startsWith('#')) continue;
        slots.push(k);
        walk(k);
      }
    };
    walk(ab);
    for (const o of members) if (isA(o.type, 'KeyFrameInterpolator')) slots.push(o);
    slots.forEach((o, i) => slotOf.set(o, i));

    const anims = members.filter((o) => o.type === 'LinearAnimation').sort(byOrder);
    anims.forEach((a, i) => animOf.set(a, i));
    const machines = members.filter((o) => o.type === 'StateMachine').sort(byOrder);
    machines.forEach((m, i) => machineOf.set(m, i));
    for (const m of machines) {
      const inputs = (childrenOf.get(m) ?? []).filter((c) => isA(c.type, 'StateMachineInput')).sort(byOrder);
      inputs.forEach((c, i) => inputOf.set(c, i));
      for (const layer of (childrenOf.get(m) ?? []).filter((c) => c.type === 'StateMachineLayer')) {
        const states = (childrenOf.get(layer) ?? []).filter((c) => isA(c.type, 'LayerState')).sort((a, b) => a.n - b.n);
        states.forEach((s, i) => stateOf.set(s, i));
      }
    }

    // Data binds and what hangs off a bindable property go right after the thing they belong to
    const bindsAfter = (o: RevObj) => (dataBindsOf.get(o) ?? []).sort((a, b) => a.n - b.n).map((d) => buildBind(d));
    const buildBind = (d: RevObj): RObj => {
      const r = build(d);
      const p = d.raw.get(588);
      if (p) r.props.sourcePathIds = pathBytes(p);
      return r;
    };

    slots.forEach((o, i) => {
      const r = build(o);
      if (o.type === 'NestedArtboard') {
        const p = o.raw.get(582);
        if (p) r.props.dataBindPathIds = pathBytes(p);
      }
      // A bare artboard (no parent) carries no parentId
      if (i === 0) delete r.props.parentId;
      out.push(r);
      for (const b of bindsAfter(o)) out.push(b);
    });

    // Animations
    for (const a of anims) {
      out.push(build(a));
      for (const ko of (childrenOf.get(a) ?? []).filter((c) => c.type === 'KeyedObject').sort((x, y) => x.n - y.n)) {
        out.push(build(ko));
        for (const kp of (childrenOf.get(ko) ?? []).filter((c) => c.type === 'KeyedProperty').sort((x, y) => x.n - y.n)) {
          out.push(build(kp));
          const frames = (childrenOf.get(kp) ?? []).filter((c) => isA(c.type, 'KeyFrame'));
          frames.sort((x, y) => (varuintOf(x.raw.get(67) ?? new Uint8Array()) ?? 0) - (varuintOf(y.raw.get(67) ?? new Uint8Array()) ?? 0) || x.n - y.n);
          for (const kf of frames) out.push(build(kf));
        }
      }
    }

    // State machines
    const bindableParts = (bp: RevObj | undefined): RObj[] => {
      if (!bp) return [];
      return [build(bp), ...bindsAfter(bp)];
    };
    const actionsOf = (o: RevObj): RObj[] => {
      const res: RObj[] = [];
      for (const a of (childrenOf.get(o) ?? []).filter((c) => isA(c.type, 'ListenerAction') || isA(c.type, 'StateMachineFireAction')).sort(byOrder)) {
        if (a.type === 'ListenerViewModelChange') res.push(...bindableParts(idProp(a, 657)));
        res.push(build(a));
      }
      return res;
    };
    for (const m of machines) {
      out.push(build(m));
      const inner = childrenOf.get(m) ?? [];
      for (const c of inner.filter((c) => isA(c.type, 'StateMachineInput')).sort(byOrder)) out.push(build(c));
      for (const layer of inner.filter((c) => c.type === 'StateMachineLayer').sort(byOrder)) {
        out.push(build(layer));
        const states = (childrenOf.get(layer) ?? []).filter((c) => isA(c.type, 'LayerState')).sort((a, b) => a.n - b.n);
        for (const s of states) {
          out.push(build(s));
          out.push(...actionsOf(s));
          for (const bl of (childrenOf.get(s) ?? []).filter((c) => isA(c.type, 'BlendAnimation')).sort(byOrder)) out.push(build(bl));
          for (const t of (childrenOf.get(s) ?? []).filter((c) => isA(c.type, 'StateTransition')).sort(byOrder)) {
            out.push(build(t));
            out.push(...actionsOf(t));
            for (const cond of (childrenOf.get(t) ?? []).filter((c) => isA(c.type, 'TransitionCondition')).sort(byOrder)) {
              if (isA(cond.type, 'TransitionViewModelCondition')) {
                const left = idProp(cond, 648);
                const right = idProp(cond, 649);
                out.push(build(cond));
                out.push(...bindableParts(left && idProp(left, 646)));
                if (left) out.push(build(left));
                if (right) out.push(build(right));
              } else out.push(build(cond));
            }
          }
        }
      }
      for (const l of inner.filter((c) => isA(c.type, 'StateMachineListener')).sort(byOrder)) {
        out.push(build(l));
        for (const it of (childrenOf.get(l) ?? []).filter((c) => isA(c.type, 'ListenerInputType')).sort((x, y) => x.n - y.n)) out.push(build(it));
        for (const k of (childrenOf.get(l) ?? []).filter((c) => c.type === 'KeyboardInput')) out.push(build(k));
        out.push(...actionsOf(l));
      }
    }
  }

  return { objects: out, info: { unknown, objects: revs.length } };
}

/** Opens a Rive editor project the same way as an exported .riv. */
export async function importRev(bytes: Uint8Array, name: string): Promise<RiveImport & { info: RevInfo }> {
  const { objects, info } = revToRiveObjects(bytes);
  const res = await importRiveObjects(objects, name);
  const types = Object.entries(info.unknown).filter(([k]) => k.startsWith('type '));
  if (types.length) res.warnings.push(`Some Rive editor objects were not understood and were skipped (${types.map(([k, n]) => `${k} x${n}`).join(', ')})`);
  return { ...res, info };
}
