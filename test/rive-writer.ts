import { RIVE_CLASSES } from '../src/lib/rive-defs';

export type Spec = [string, Record<string, unknown>];

/** A minimal .riv writer: header, an empty property table, then objects as typeKey + key/value pairs. */
export function writeRiv(objects: Spec[]): Uint8Array {
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
  varuint(0); // no extra properties
  for (const [cls, rawProps] of objects) {
    // A key that does not say how it interpolates holds, which is the runtime default and what the importer now reads. The tests
    // mostly want a ramp, so keys written here are linear unless they say otherwise.
    let props = rawProps;
    try {
      find(cls, 'interpolationType');
      if (!('interpolationType' in props)) props = { ...props, interpolationType: 1 };
    } catch {
      /* not an interpolating key */
    }
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
        for (const x of b) out.push(x); // not a spread: a font is bigger than the argument limit
      } else if (type === 'c') out.push(...new Uint8Array(new Uint32Array([Number(v)]).buffer));
      else if (type === 'i') varuint(Number(v) >= 0 ? Number(v) * 2 : -Number(v) * 2 - 1); // signed ints are zigzag varints
      else varuint(typeof v === 'boolean' ? Number(v) : Number(v));
    }
    varuint(0);
  }
  return new Uint8Array(out);
}

export function propKey(cls: string, prop: string): number {
  for (let c: string | undefined = cls; c && RIVE_CLASSES[c]; c = RIVE_CLASSES[c][1]) {
    const p = RIVE_CLASSES[c][2][prop];
    if (p) return p[0];
  }
  throw new Error(`${cls}.${prop} is not defined`);
}
