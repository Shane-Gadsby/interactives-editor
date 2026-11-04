import { Cmd, Lexer, Name, PdfStream, PdfString, num, type Dict, type PdfDoc, type PdfObj } from './pdf-parse';

/** PDF functions (types 0, 2, 3 and 4) and colour spaces, for the Illustrator / PDF importer. */

export type RGB = [number, number, number];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Approximate CMYK to RGB (a polynomial fit of how CMYK usually looks on a screen, so 100% cyan is not pure #00ffff). */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  c = clamp01(c);
  m = clamp01(m);
  y = clamp01(y);
  k = clamp01(k);
  const r = 255 + c * (-4.387332384609988 * c + 54.48615194189176 * m + 18.82290502165302 * y + 212.25662451639585 * k - 285.2331026137004) + m * (1.7149763477362134 * m - 5.6096736904047315 * y - 17.873870861415444 * k - 5.497006427196366) + y * (-2.5217340131683033 * y - 21.248923337353073 * k + 17.5119270841813) + k * (-21.86122147463605 * k - 189.48180835922747);
  const g = 255 + c * (8.841041422036149 * c + 60.118027045597366 * m + 6.871425592049007 * y + 31.159100130055922 * k - 79.2970844816548) + m * (-15.310361306967817 * m + 17.575251261109482 * y + 131.35250912493976 * k - 190.9453302588951) + y * (4.444339102852739 * y + 9.8632861493405 * k - 24.86741582555878) + k * (-20.737325471181034 * k - 187.80453709719578);
  const b = 255 + c * (0.8842522430003296 * c + 8.078677503112928 * m + 30.89978309703729 * y - 0.23883238689178934 * k - 14.183576799673286) + m * (10.49593273432072 * m + 63.02378494754052 * y + 50.606957656360734 * k - 112.23884253719248) + y * (0.03296041114873217 * y + 115.60384449646641 * k - 193.58209356861505) + k * (-22.33816807309886 * k - 180.12613974708367);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return [f(r), f(g), f(b)];
}

// ---------------------------------------------------------------- functions

type PsOp = string | number | PsOp[];

function parsePs(lex: Lexer): PsOp[] {
  const out: PsOp[] = [];
  for (;;) {
    const t = lex.next();
    if (t === undefined) return out;
    if (t instanceof Cmd) {
      if (t.cmd === '{') out.push(parsePs(lex));
      else if (t.cmd === '}') return out;
      else out.push(t.cmd);
    } else if (typeof t === 'number') out.push(t);
  }
}

function runPs(code: PsOp[], st: number[]): void {
  for (let i = 0; i < code.length; i++) {
    const op = code[i];
    if (typeof op === 'number') {
      st.push(op);
      continue;
    }
    if (Array.isArray(op)) {
      // a procedure: executed by the if / ifelse that follows
      const next = code[i + 1];
      if (next === 'if') {
        if (st.pop()) runPs(op, st);
        i++;
      } else if (Array.isArray(next) && code[i + 2] === 'ifelse') {
        if (st.pop()) runPs(op, st);
        else runPs(next, st);
        i += 2;
      }
      continue;
    }
    const pop = () => st.pop() ?? 0;
    switch (op) {
      case 'add': {
        const b = pop();
        st.push(pop() + b);
        break;
      }
      case 'sub': {
        const b = pop();
        st.push(pop() - b);
        break;
      }
      case 'mul': {
        const b = pop();
        st.push(pop() * b);
        break;
      }
      case 'div': {
        const b = pop();
        st.push(b ? pop() / b : (pop(), 0));
        break;
      }
      case 'idiv': {
        const b = pop();
        st.push(b ? Math.trunc(pop() / b) : (pop(), 0));
        break;
      }
      case 'mod': {
        const b = pop();
        st.push(b ? pop() % b : (pop(), 0));
        break;
      }
      case 'neg':
        st.push(-pop());
        break;
      case 'abs':
        st.push(Math.abs(pop()));
        break;
      case 'ceiling':
        st.push(Math.ceil(pop()));
        break;
      case 'floor':
        st.push(Math.floor(pop()));
        break;
      case 'round':
        st.push(Math.round(pop()));
        break;
      case 'truncate':
      case 'cvi':
        st.push(Math.trunc(pop()));
        break;
      case 'cvr':
        break;
      case 'sqrt':
        st.push(Math.sqrt(Math.max(0, pop())));
        break;
      case 'sin':
        st.push(Math.sin((pop() * Math.PI) / 180));
        break;
      case 'cos':
        st.push(Math.cos((pop() * Math.PI) / 180));
        break;
      case 'atan': {
        const d = pop();
        const n = pop();
        st.push(((Math.atan2(n, d) * 180) / Math.PI + 360) % 360);
        break;
      }
      case 'exp': {
        const e = pop();
        st.push(Math.pow(pop(), e));
        break;
      }
      case 'ln':
        st.push(Math.log(Math.max(1e-12, pop())));
        break;
      case 'log':
        st.push(Math.log10(Math.max(1e-12, pop())));
        break;
      case 'eq': {
        const b = pop();
        st.push(pop() === b ? 1 : 0);
        break;
      }
      case 'ne': {
        const b = pop();
        st.push(pop() !== b ? 1 : 0);
        break;
      }
      case 'gt': {
        const b = pop();
        st.push(pop() > b ? 1 : 0);
        break;
      }
      case 'ge': {
        const b = pop();
        st.push(pop() >= b ? 1 : 0);
        break;
      }
      case 'lt': {
        const b = pop();
        st.push(pop() < b ? 1 : 0);
        break;
      }
      case 'le': {
        const b = pop();
        st.push(pop() <= b ? 1 : 0);
        break;
      }
      case 'and': {
        const b = pop();
        st.push(pop() & b);
        break;
      }
      case 'or': {
        const b = pop();
        st.push(pop() | b);
        break;
      }
      case 'xor': {
        const b = pop();
        st.push(pop() ^ b);
        break;
      }
      case 'not': {
        const a = pop();
        st.push(a === 0 || a === 1 ? 1 - a : ~a);
        break;
      }
      case 'bitshift': {
        const s = pop();
        const a = pop();
        st.push(s >= 0 ? a << s : a >> -s);
        break;
      }
      case 'true':
        st.push(1);
        break;
      case 'false':
        st.push(0);
        break;
      case 'pop':
        st.pop();
        break;
      case 'exch': {
        const b = pop();
        const a = pop();
        st.push(b, a);
        break;
      }
      case 'dup': {
        const a = pop();
        st.push(a, a);
        break;
      }
      case 'copy': {
        const n = pop();
        if (n > 0 && n <= st.length) st.push(...st.slice(st.length - n));
        break;
      }
      case 'index': {
        const n = pop();
        st.push(st[st.length - 1 - n] ?? 0);
        break;
      }
      case 'roll': {
        const j = pop();
        const n = pop();
        if (n > 0 && n <= st.length) {
          const part = st.splice(st.length - n, n);
          const k = ((j % n) + n) % n;
          st.push(...part.slice(part.length - k), ...part.slice(0, part.length - k));
        }
        break;
      }
    }
  }
}

export interface PdfFunction {
  eval(input: number[]): number[];
  /** Input values where the function changes character (stitching bounds, sample points), within the domain. */
  breaks(): number[];
  outputs: number;
}

export function makeFunction(doc: PdfDoc, obj: PdfObj | undefined, depth = 0): PdfFunction | null {
  const o = doc.resolve(obj);
  if (depth > 8) return null;
  if (Array.isArray(o)) {
    // one function per output component
    const fns = o.map((x) => makeFunction(doc, x, depth + 1));
    if (fns.some((f) => !f)) return null;
    const list = fns as PdfFunction[];
    return {
      outputs: list.length,
      eval: (inp) => list.map((f) => f.eval(inp)[0] ?? 0),
      breaks: () => [...new Set(list.flatMap((f) => f.breaks()))].sort((a, b) => a - b),
    };
  }
  const dict = doc.dictOf(o);
  if (!dict) return null;
  const type = num(doc.resolve(dict.FunctionType), -1);
  const domain = doc.numbers(dict.Domain) ?? [0, 1];
  const range = doc.numbers(dict.Range);
  const clipOut = (out: number[]) => (range ? out.map((v, i) => Math.max(range[2 * i] ?? -Infinity, Math.min(range[2 * i + 1] ?? Infinity, v))) : out);
  const clipIn = (inp: number[]) => inp.map((v, i) => Math.max(domain[2 * i] ?? -Infinity, Math.min(domain[2 * i + 1] ?? Infinity, v)));
  if (type === 2) {
    const c0 = doc.numbers(dict.C0) ?? [0];
    const c1 = doc.numbers(dict.C1) ?? [1];
    const n = num(doc.resolve(dict.N), 1);
    const outs = Math.max(c0.length, c1.length);
    return {
      outputs: outs,
      eval: (inp) => {
        const x = clipIn(inp)[0] ?? 0;
        const t = n === 1 ? x : Math.pow(Math.max(0, x), n);
        return clipOut(Array.from({ length: outs }, (_, i) => (c0[i] ?? 0) + t * ((c1[i] ?? 1) - (c0[i] ?? 0))));
      },
      breaks: () => (n === 1 ? [] : Array.from({ length: 9 }, (_, i) => domain[0] + ((domain[1] - domain[0]) * (i + 1)) / 10)),
    };
  }
  if (type === 3) {
    const fns = (doc.arrayOf(dict.Functions) ?? []).map((f) => makeFunction(doc, f, depth + 1));
    if (!fns.length || fns.some((f) => !f)) return null;
    const list = fns as PdfFunction[];
    const bounds = doc.numbers(dict.Bounds) ?? [];
    const encode = doc.numbers(dict.Encode) ?? [];
    const edges = [domain[0], ...bounds, domain[1]];
    return {
      outputs: list[0].outputs,
      eval: (inp) => {
        const x = clipIn(inp)[0] ?? 0;
        let k = 0;
        while (k < list.length - 1 && x >= edges[k + 1]) k++;
        const lo = edges[k];
        const hi = edges[k + 1];
        const e0 = encode[2 * k] ?? 0;
        const e1 = encode[2 * k + 1] ?? 1;
        const t = hi === lo ? e0 : e0 + ((x - lo) * (e1 - e0)) / (hi - lo);
        return clipOut(list[k].eval([t]));
      },
      breaks: () => {
        const out: number[] = [...bounds];
        list.forEach((f, k) => {
          const lo = edges[k];
          const hi = edges[k + 1];
          const e0 = encode[2 * k] ?? 0;
          const e1 = encode[2 * k + 1] ?? 1;
          for (const b of f.breaks()) {
            const x = e1 === e0 ? lo : lo + ((b - e0) * (hi - lo)) / (e1 - e0);
            if (x > lo && x < hi) out.push(x);
          }
        });
        return [...new Set(out)].sort((a, b) => a - b);
      },
    };
  }
  if (type === 4 && o instanceof PdfStream) {
    const code = parsePs(new Lexer(doc.decode(o).data));
    const prog = (code[0] && Array.isArray(code[0]) ? code[0] : code) as PsOp[];
    const nOut = (range?.length ?? 2) / 2;
    return {
      outputs: nOut,
      eval: (inp) => {
        const st = clipIn(inp);
        runPs(prog, st);
        const out = st.slice(Math.max(0, st.length - nOut));
        while (out.length < nOut) out.unshift(0);
        return clipOut(out);
      },
      breaks: () => Array.from({ length: 15 }, (_, i) => domain[0] + ((domain[1] - domain[0]) * (i + 1)) / 16),
    };
  }
  if (type === 0 && o instanceof PdfStream) {
    const size = doc.numbers(dict.Size) ?? [2];
    const bps = num(doc.resolve(dict.BitsPerSample), 8);
    const nOut = (range?.length ?? 2) / 2;
    const encode = doc.numbers(dict.Encode) ?? size.flatMap((s) => [0, s - 1]);
    const decode = doc.numbers(dict.Decode) ?? range ?? [];
    const data = doc.decode(o).data;
    const sample = (idx: number, comp: number) => {
      const bit = (idx * nOut + comp) * bps;
      let v = 0;
      for (let i = 0; i < bps; i += 8) {
        const byte = data[(bit + i) >> 3] ?? 0;
        v = v * 256 + byte;
      }
      if (bps < 8) v = ((data[bit >> 3] ?? 0) >> (8 - bps - (bit & 7))) & ((1 << bps) - 1);
      const max = Math.pow(2, bps) - 1;
      return (decode[2 * comp] ?? 0) + (v / max) * ((decode[2 * comp + 1] ?? 1) - (decode[2 * comp] ?? 0));
    };
    return {
      outputs: nOut,
      eval: (inp) => {
        const x = clipIn(inp);
        // multilinear for one input, nearest sample otherwise
        const idx = size.map((s, i) => {
          const d0 = domain[2 * i] ?? 0;
          const d1 = domain[2 * i + 1] ?? 1;
          const e = (encode[2 * i] ?? 0) + (((x[i] ?? 0) - d0) * ((encode[2 * i + 1] ?? s - 1) - (encode[2 * i] ?? 0))) / (d1 - d0 || 1);
          return Math.max(0, Math.min(s - 1, e));
        });
        const flat = (ix: number[]) => {
          let f = 0;
          let mul = 1;
          for (let i = 0; i < ix.length; i++) {
            f += ix[i] * mul;
            mul *= size[i];
          }
          return f;
        };
        if (size.length === 1) {
          const lo = Math.floor(idx[0]);
          const hi = Math.min(size[0] - 1, lo + 1);
          const fr = idx[0] - lo;
          return clipOut(Array.from({ length: nOut }, (_, c) => sample(lo, c) * (1 - fr) + sample(hi, c) * fr));
        }
        const f = flat(idx.map(Math.round));
        return clipOut(Array.from({ length: nOut }, (_, c) => sample(f, c)));
      },
      breaks: () => (size.length === 1 ? Array.from({ length: Math.min(size[0], 24) - 2 }, (_, i) => domain[0] + ((domain[1] - domain[0]) * (i + 1)) / (Math.min(size[0], 24) - 1)) : []),
    };
  }
  return null;
}

// ---------------------------------------------------------------- colour spaces

export interface ColorSpace {
  name: string;
  n: number;
  initial: number[];
  toRgb(c: number[]): RGB;
  /** Pattern spaces carry the colour space the pattern is painted in. */
  isPattern?: boolean;
}

const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

export const DEVICE_GRAY: ColorSpace = { name: 'DeviceGray', n: 1, initial: [0], toRgb: ([g]) => [to255(g), to255(g), to255(g)] };
export const DEVICE_RGB: ColorSpace = { name: 'DeviceRGB', n: 3, initial: [0, 0, 0], toRgb: ([r, g, b]) => [to255(r), to255(g), to255(b)] };
export const DEVICE_CMYK: ColorSpace = { name: 'DeviceCMYK', n: 4, initial: [0, 0, 0, 1], toRgb: ([c, m, y, k]) => cmykToRgb(c, m, y, k) };
const PATTERN: ColorSpace = { name: 'Pattern', n: 0, initial: [], toRgb: () => [0, 0, 0], isPattern: true };

/** Resolve a colour space object (a name, or an array) into something that converts to RGB. `warn` hears about spaces approximated. */
export function makeColorSpace(doc: PdfDoc, obj: PdfObj | undefined, res: Dict | null, warn: (m: string) => void, depth = 0): ColorSpace {
  const o = doc.resolve(obj);
  if (depth > 6) return DEVICE_GRAY;
  if (o instanceof Name) {
    switch (o.name) {
      case 'DeviceGray':
      case 'G':
      case 'CalGray':
        return DEVICE_GRAY;
      case 'DeviceRGB':
      case 'RGB':
      case 'CalRGB':
        return DEVICE_RGB;
      case 'DeviceCMYK':
      case 'CMYK':
        return DEVICE_CMYK;
      case 'Pattern':
        return PATTERN;
      default: {
        const named = res ? doc.get(doc.get(res, 'ColorSpace'), o.name) : null;
        if (named && !(named instanceof Name && named.name === o.name)) return makeColorSpace(doc, named, res, warn, depth + 1);
        warn(`colour space ${o.name}`);
        return DEVICE_GRAY;
      }
    }
  }
  if (!Array.isArray(o) || !o.length) return DEVICE_GRAY;
  const kind = doc.resolve(o[0]);
  if (!(kind instanceof Name)) return DEVICE_GRAY;
  switch (kind.name) {
    case 'ICCBased': {
      const s = doc.resolve(o[1]);
      const n = s instanceof PdfStream ? num(doc.resolve(s.dict.N), 3) : 3;
      return n === 1 ? DEVICE_GRAY : n === 4 ? DEVICE_CMYK : DEVICE_RGB;
    }
    case 'CalGray':
      return DEVICE_GRAY;
    case 'CalRGB':
      return DEVICE_RGB;
    case 'Lab': {
      const d = doc.dictOf(o[1]);
      const wp = (d && doc.numbers(d.WhitePoint)) || [0.9505, 1, 1.089];
      const rng = (d && doc.numbers(d.Range)) || [-100, 100, -100, 100];
      return {
        name: 'Lab',
        n: 3,
        initial: [0, 0, 0],
        toRgb: ([L, a, b]) => {
          const m = (L + 16) / 116;
          const l = m + a / 500;
          const n = m - b / 200;
          const g = (x: number) => (x >= 6 / 29 ? x * x * x : (108 / 841) * (x - 4 / 29));
          const X = wp[0] * g(l);
          const Y = wp[1] * g(m);
          const Z = wp[2] * g(n);
          const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
          const enc = (v: number) => to255(v <= 0.0031308 ? 12.92 * Math.max(0, v) : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
          void rng;
          return [enc(lin[0]), enc(lin[1]), enc(lin[2])];
        },
      };
    }
    case 'Indexed':
    case 'I': {
      const base = makeColorSpace(doc, o[1], res, warn, depth + 1);
      const hival = num(doc.resolve(o[2]));
      const t = doc.resolve(o[3]);
      const table = t instanceof PdfStream ? doc.decode(t).data : t instanceof PdfString ? t.bytes : new Uint8Array(0);
      return {
        name: 'Indexed',
        n: 1,
        initial: [0],
        toRgb: ([i]) => {
          const idx = Math.max(0, Math.min(hival, Math.round(i)));
          const comps: number[] = [];
          for (let k = 0; k < base.n; k++) comps.push((table[idx * base.n + k] ?? 0) / 255);
          if (base.name === 'Lab') {
            comps[0] *= 100;
            comps[1] = comps[1] * 255 - 128;
            comps[2] = comps[2] * 255 - 128;
          }
          return base.toRgb(comps);
        },
      };
    }
    case 'Separation':
    case 'DeviceN': {
      const names = kind.name === 'Separation' ? [doc.resolve(o[1])] : (doc.arrayOf(o[1]) ?? []).map((x) => doc.resolve(x));
      const n = names.length || 1;
      const alt = makeColorSpace(doc, o[2], res, warn, depth + 1);
      const fn = makeFunction(doc, o[3]);
      const all = names.length === 1 && names[0] instanceof Name && names[0].name === 'All';
      return {
        name: kind.name,
        n,
        initial: new Array(n).fill(1),
        toRgb: (c) => {
          if (!fn) {
            const g = all ? 1 - (c[0] ?? 0) : 1 - (c[0] ?? 0);
            return DEVICE_GRAY.toRgb([g]);
          }
          return alt.toRgb(fn.eval(c));
        },
      };
    }
    case 'Pattern': {
      const under = o.length > 1 ? makeColorSpace(doc, o[1], res, warn, depth + 1) : DEVICE_GRAY;
      return { ...PATTERN, name: 'Pattern', initial: under.initial, toRgb: under.toRgb, n: under.n };
    }
    default:
      warn(`colour space ${kind.name}`);
      return DEVICE_GRAY;
  }
}
