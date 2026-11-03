import { inflateSync, unzlibSync } from 'fflate';

/**
 * A small PDF reader, enough for Illustrator (.ai) and ordinary vector PDFs: objects, cross-reference tables and streams,
 * object streams, a rebuild by scanning when the cross-reference data is damaged, stream filters (Flate, LZW, ASCII85,
 * ASCIIHex, RunLength with PNG/TIFF predictors) and the page tree. Encrypted files are refused.
 */

export class Name {
  constructor(readonly name: string) {}
}
export class Ref {
  constructor(
    readonly num: number,
    readonly gen: number,
  ) {}
}
export class PdfString {
  constructor(readonly bytes: Uint8Array) {}
  get text(): string {
    return pdfText(this.bytes);
  }
}
export class Cmd {
  constructor(readonly cmd: string) {}
}
export type Dict = { [key: string]: PdfObj };
export class PdfStream {
  constructor(
    readonly dict: Dict,
    readonly raw: Uint8Array,
  ) {}
}
export type PdfObj = null | boolean | number | Name | Ref | PdfString | PdfObj[] | Dict | PdfStream;

export const isName = (o: unknown, n?: string): o is Name => o instanceof Name && (n === undefined || o.name === n);
export const isDict = (o: unknown): o is Dict => !!o && typeof o === 'object' && !Array.isArray(o) && !(o instanceof Name) && !(o instanceof Ref) && !(o instanceof PdfString) && !(o instanceof PdfStream) && !(o instanceof Cmd);

/** PDFDocEncoding / UTF-16BE text string. */
export function pdfText(b: Uint8Array): string {
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
    let s = '';
    for (let i = 2; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
    return s;
  }
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder().decode(b.subarray(3));
  let s = '';
  for (const c of b) s += String.fromCharCode(c);
  return s;
}

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const isWs = (c: number) => WS.has(c);
const isNumChar = (c: number) => (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e;

// ---------------------------------------------------------------- lexer

export class Lexer {
  constructor(
    readonly b: Uint8Array,
    public pos = 0,
    readonly end = b.length,
  ) {}

  skipWs(): void {
    const b = this.b;
    while (this.pos < this.end) {
      const c = b[this.pos];
      if (isWs(c)) this.pos++;
      else if (c === 0x25) {
        while (this.pos < this.end && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else break;
    }
  }

  /** Next token: a number, Name, PdfString or Cmd (keywords and the delimiters `[ ] << >> { }`), or undefined at the end. */
  next(): number | Name | PdfString | Cmd | undefined {
    this.skipWs();
    const b = this.b;
    if (this.pos >= this.end) return undefined;
    const c = b[this.pos];
    if (c === 0x2f) {
      this.pos++;
      let s = '';
      while (this.pos < this.end && !isWs(b[this.pos]) && !DELIM.has(b[this.pos])) {
        let ch = b[this.pos++];
        if (ch === 0x23 && this.pos + 1 < this.end) {
          const hex = parseInt(String.fromCharCode(b[this.pos], b[this.pos + 1]), 16);
          if (!Number.isNaN(hex)) {
            ch = hex;
            this.pos += 2;
          }
        }
        s += String.fromCharCode(ch);
      }
      return new Name(s);
    }
    if (c === 0x28) return this.literalString();
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return new Cmd('<<');
      }
      return this.hexString();
    }
    if (c === 0x3e) {
      if (b[this.pos + 1] === 0x3e) {
        this.pos += 2;
        return new Cmd('>>');
      }
      this.pos++;
      return new Cmd('>');
    }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) {
      this.pos++;
      return new Cmd(String.fromCharCode(c));
    }
    if (c === 0x29) {
      this.pos++;
      return new Cmd(')');
    }
    const start = this.pos;
    while (this.pos < this.end && !isWs(b[this.pos]) && !DELIM.has(b[this.pos])) this.pos++;
    const word = latin1(b, start, this.pos);
    if (isNumChar(b[start]) && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return parseFloat(word);
    // odd numbers like "--5" or "1.2.3" occur in the wild
    if (isNumChar(b[start]) && /^[+-.\d]+$/.test(word)) {
      const n = parseFloat(word.replace(/^-+/, '-').replace(/^\+/, ''));
      return Number.isNaN(n) ? 0 : n;
    }
    return new Cmd(word);
  }

  private literalString(): PdfString {
    const b = this.b;
    this.pos++;
    const out: number[] = [];
    let depth = 1;
    while (this.pos < this.end) {
      let c = b[this.pos++];
      if (c === 0x5c) {
        c = b[this.pos++];
        if (c === 0x6e) out.push(10);
        else if (c === 0x72) out.push(13);
        else if (c === 0x74) out.push(9);
        else if (c === 0x62) out.push(8);
        else if (c === 0x66) out.push(12);
        else if (c >= 0x30 && c <= 0x37) {
          let v = c - 0x30;
          for (let k = 0; k < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; k++) v = v * 8 + b[this.pos++] - 0x30;
          out.push(v & 255);
        } else if (c === 13) {
          if (b[this.pos] === 10) this.pos++;
        } else if (c === 10) {
          // line continuation
        } else out.push(c);
        continue;
      }
      if (c === 0x28) depth++;
      else if (c === 0x29 && --depth === 0) break;
      out.push(c);
    }
    return new PdfString(Uint8Array.from(out));
  }

  private hexString(): PdfString {
    const b = this.b;
    this.pos++;
    const out: number[] = [];
    let hi = -1;
    while (this.pos < this.end) {
      const c = b[this.pos++];
      if (c === 0x3e) break;
      const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x61 && c <= 0x66 ? c - 0x57 : c >= 0x41 && c <= 0x46 ? c - 0x37 : -1;
      if (v < 0) continue;
      if (hi < 0) hi = v;
      else {
        out.push(hi * 16 + v);
        hi = -1;
      }
    }
    if (hi >= 0) out.push(hi * 16);
    return new PdfString(Uint8Array.from(out));
  }
}

function latin1(b: Uint8Array, from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** Read one object; `refs` allows `n g R`. A stray keyword comes back as a Cmd. */
export function readObject(lex: Lexer, refs: boolean, tok = lex.next()): PdfObj | Cmd {
  if (tok === undefined) return null;
  if (typeof tok === 'number') {
    if (refs && Number.isInteger(tok) && tok >= 0) {
      const save = lex.pos;
      const g = lex.next();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = lex.next();
        if (r instanceof Cmd && r.cmd === 'R') return new Ref(tok, g);
      }
      lex.pos = save;
    }
    return tok;
  }
  if (tok instanceof Name || tok instanceof PdfString) return tok;
  switch (tok.cmd) {
    case 'true':
      return true;
    case 'false':
      return false;
    case 'null':
      return null;
    case '[': {
      const arr: PdfObj[] = [];
      for (;;) {
        const t = lex.next();
        if (t === undefined || (t instanceof Cmd && t.cmd === ']')) break;
        const v = readObject(lex, refs, t);
        if (!(v instanceof Cmd)) arr.push(v);
      }
      return arr;
    }
    case '<<': {
      const d: Dict = Object.create(null);
      for (;;) {
        const k = lex.next();
        if (k === undefined || (k instanceof Cmd && k.cmd === '>>')) break;
        if (!(k instanceof Name)) continue;
        const t = lex.next();
        if (t instanceof Cmd && t.cmd === '>>') {
          d[k.name] = null;
          break;
        }
        const v = readObject(lex, refs, t);
        d[k.name] = v instanceof Cmd ? null : v;
      }
      return d;
    }
    default:
      return tok;
  }
}

// ---------------------------------------------------------------- filters

function unpredict(data: Uint8Array, parms: Dict | null, doc: PdfDoc): Uint8Array {
  if (!parms) return data;
  const pred = num(doc.resolve(parms.Predictor), 1);
  if (pred <= 1) return data;
  const colors = num(doc.resolve(parms.Colors), 1);
  const bpc = num(doc.resolve(parms.BitsPerComponent), 8);
  const cols = num(doc.resolve(parms.Columns), 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowBytes = Math.ceil((colors * bpc * cols) / 8);
  if (pred === 2) {
    if (bpc === 8) {
      const out = data.slice();
      for (let r = 0; r + rowBytes <= out.length; r += rowBytes) for (let i = bpp; i < rowBytes; i++) out[r + i] = (out[r + i] + out[r + i - bpp]) & 255;
      return out;
    }
    return data;
  }
  const rows = Math.floor(data.length / (rowBytes + 1));
  const out = new Uint8Array(rows * rowBytes);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowBytes + 1)];
    const src = r * (rowBytes + 1) + 1;
    const dst = r * rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[dst - rowBytes + i] : 0;
      const c = i >= bpp && r > 0 ? out[dst - rowBytes + i - bpp] : 0;
      let v: number;
      switch (ft) {
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = x;
      }
      out[dst + i] = v & 255;
    }
  }
  return out;
}

function lzw(data: Uint8Array, early: number): Uint8Array {
  const out: number[] = [];
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < 256; i++) table.push([i]);
    table.push([], []);
  };
  reset();
  let bits = 9;
  let buf = 0;
  let nbits = 0;
  let prev: number[] | null = null;
  for (let i = 0; i < data.length; ) {
    while (nbits < bits && i < data.length) {
      buf = (buf << 8) | data[i++];
      nbits += 8;
    }
    if (nbits < bits) break;
    const code = (buf >> (nbits - bits)) & ((1 << bits) - 1);
    nbits -= bits;
    buf &= (1 << nbits) - 1;
    if (code === 256) {
      reset();
      bits = 9;
      prev = null;
      continue;
    }
    if (code === 257) break;
    let entry: number[];
    if (code < table.length) entry = table[code];
    else if (prev) entry = [...prev, prev[0]];
    else break;
    for (const v of entry) out.push(v);
    if (prev) table.push([...prev, entry[0]]);
    prev = entry;
    const n = table.length + early;
    bits = n >= 2048 ? 12 : n >= 1024 ? 11 : n >= 512 ? 10 : 9;
  }
  return Uint8Array.from(out);
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 0x7e) break;
    if (isWs(c)) continue;
    if (c === 0x7a && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

function asciiHex(data: Uint8Array): Uint8Array {
  const lex = new Lexer(new Uint8Array([0x3c, ...data, 0x3e]));
  const s = lex.next();
  return s instanceof PdfString ? s.bytes : new Uint8Array(0);
}

function runLength(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; ) {
    const n = data[i++];
    if (n === 128) break;
    if (n < 128) for (let k = 0; k <= n && i < data.length; k++) out.push(data[i++]);
    else {
      const v = data[i++];
      for (let k = 0; k < 257 - n; k++) out.push(v);
    }
  }
  return Uint8Array.from(out);
}

export const num = (o: unknown, d = 0): number => (typeof o === 'number' && Number.isFinite(o) ? o : d);

const FILTER_ALIASES: Record<string, string> = { Fl: 'FlateDecode', AHx: 'ASCIIHexDecode', A85: 'ASCII85Decode', LZW: 'LZWDecode', RL: 'RunLengthDecode', CCF: 'CCITTFaxDecode', DCT: 'DCTDecode' };
const IMAGE_FILTERS = new Set(['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode']);

export interface Decoded {
  data: Uint8Array;
  /** An image codec this reader leaves alone (the bytes are still compressed with it). */
  codec: string | null;
}

// ---------------------------------------------------------------- document

interface XrefEntry {
  /** Byte offset (type 1) or the object stream's number (type 2). */
  offset: number;
  index: number;
  inStream: boolean;
}

export interface PageInfo {
  dict: Dict;
  resources: Dict;
  mediaBox: number[];
  cropBox: number[] | null;
  trimBox: number[] | null;
  rotate: number;
}

export class PdfDoc {
  readonly bytes: Uint8Array;
  readonly base: number;
  private xref = new Map<number, XrefEntry>();
  private cache = new Map<number, PdfObj>();
  private objStreams = new Map<number, { objs: Map<number, PdfObj> }>();
  trailer: Dict = Object.create(null);
  warnings: string[] = [];

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    const head = indexOf(bytes, '%PDF-', 0, Math.min(bytes.length, 4096));
    if (head < 0) throw new NotPdfError();
    this.base = head;
    let ok = false;
    try {
      ok = this.readXrefChain();
    } catch {
      ok = false;
    }
    if (ok) {
      try {
        ok = !!this.root();
      } catch {
        ok = false;
      }
    }
    if (!ok) this.rebuild();
    if (this.trailer.Encrypt) throw new Error('This file is encrypted, so it cannot be imported. Remove the password and try again.');
    if (!this.root()) throw new Error('The PDF structure inside this file is damaged (no document catalog was found)');
  }

  // ---- objects

  resolve(o: PdfObj | undefined): PdfObj {
    let n = 0;
    while (o instanceof Ref && n++ < 32) o = this.getObject(o.num);
    return o === undefined || o instanceof Ref ? null : o;
  }

  /** `dict[key]`, resolved. */
  get(d: PdfObj | undefined, key: string): PdfObj {
    const dict = this.resolve(d);
    const src = dict instanceof PdfStream ? dict.dict : dict;
    if (!isDict(src)) return null;
    return this.resolve(src[key]);
  }

  dictOf(o: PdfObj | undefined): Dict | null {
    const r = this.resolve(o);
    if (r instanceof PdfStream) return r.dict;
    return isDict(r) ? r : null;
  }

  arrayOf(o: PdfObj | undefined): PdfObj[] | null {
    const r = this.resolve(o);
    return Array.isArray(r) ? r : null;
  }

  numbers(o: PdfObj | undefined): number[] | null {
    const a = this.arrayOf(o);
    if (!a) return null;
    return a.map((v) => num(this.resolve(v)));
  }

  getObject(n: number): PdfObj {
    if (this.cache.has(n)) return this.cache.get(n)!;
    const e = this.xref.get(n);
    let v: PdfObj = null;
    if (e) {
      try {
        v = e.inStream ? this.fromObjStream(e.offset, n) : this.parseAt(e.offset + this.base, n);
      } catch {
        v = null;
      }
    }
    this.cache.set(n, v);
    return v;
  }

  private parseAt(offset: number, expect?: number): PdfObj {
    const lex = new Lexer(this.bytes, offset);
    const n = lex.next();
    const g = lex.next();
    const k = lex.next();
    if (typeof n !== 'number' || typeof g !== 'number' || !(k instanceof Cmd) || k.cmd !== 'obj') throw new Error('bad object header');
    if (expect !== undefined && n !== expect) throw new Error('object number mismatch');
    const v = readObject(lex, true);
    if (v instanceof Cmd) return null;
    if (isDict(v)) {
      const save = lex.pos;
      const t = lex.next();
      if (t instanceof Cmd && t.cmd === 'stream') {
        let p = lex.pos;
        if (this.bytes[p] === 13) p++;
        if (this.bytes[p] === 10) p++;
        let len = num(this.resolveLength(v.Length), -1);
        let endAt = -1;
        if (len >= 0 && p + len <= this.bytes.length) {
          const probe = new Lexer(this.bytes, p + len);
          const e = probe.next();
          if (e instanceof Cmd && e.cmd === 'endstream') endAt = p + len;
        }
        if (endAt < 0) {
          const found = indexOf(this.bytes, 'endstream', p);
          endAt = found < 0 ? this.bytes.length : found;
          // drop the end-of-line that belongs to the keyword
          if (this.bytes[endAt - 1] === 10) endAt--;
          if (this.bytes[endAt - 1] === 13) endAt--;
          len = endAt - p;
        }
        return new PdfStream(v, this.bytes.subarray(p, p + len));
      }
      lex.pos = save;
    }
    return v;
  }

  private resolveLength(o: PdfObj | undefined): PdfObj {
    if (o instanceof Ref) {
      // the length object is plain, so a guard against loops through its own stream is enough
      const e = this.xref.get(o.num);
      if (!e || e.inStream) return this.resolve(o);
      const lex = new Lexer(this.bytes, e.offset + this.base);
      lex.next();
      lex.next();
      lex.next();
      const v = lex.next();
      return typeof v === 'number' ? v : null;
    }
    return o ?? null;
  }

  private fromObjStream(streamNum: number, objNum: number): PdfObj {
    let st = this.objStreams.get(streamNum);
    if (!st) {
      const s = this.getObject(streamNum);
      const objs = new Map<number, PdfObj>();
      if (s instanceof PdfStream) {
        const data = this.decode(s).data;
        const n = num(this.resolve(s.dict.N));
        const first = num(this.resolve(s.dict.First));
        const head = new Lexer(data, 0);
        const entries: [number, number][] = [];
        for (let i = 0; i < n; i++) {
          const a = head.next();
          const b = head.next();
          if (typeof a === 'number' && typeof b === 'number') entries.push([a, b]);
        }
        for (const [on, off] of entries) {
          const v = readObject(new Lexer(data, first + off), true);
          objs.set(on, v instanceof Cmd ? null : v);
        }
      }
      st = { objs };
      this.objStreams.set(streamNum, st);
    }
    return st.objs.get(objNum) ?? null;
  }

  // ---- cross-reference data

  private readXrefChain(): boolean {
    const b = this.bytes;
    const tail = Math.max(0, b.length - 2048);
    let sx = -1;
    for (let i = b.length - 9; i >= tail; i--) {
      if (b[i] === 0x73 && latin1(b, i, i + 9) === 'startxref') {
        sx = i;
        break;
      }
    }
    if (sx < 0) return false;
    const lex = new Lexer(b, sx + 9);
    let at = lex.next();
    if (typeof at !== 'number') return false;
    const seen = new Set<number>();
    let first = true;
    const queue: number[] = [at];
    while (queue.length) {
      at = queue.shift()!;
      if (typeof at !== 'number' || seen.has(at) || at < 0) continue;
      seen.add(at);
      const l = new Lexer(b, at + this.base);
      const t = l.next();
      let trailer: Dict | null = null;
      if (t instanceof Cmd && t.cmd === 'xref') {
        for (;;) {
          const save = l.pos;
          const s = l.next();
          if (s instanceof Cmd && s.cmd === 'trailer') {
            const d = readObject(l, true);
            if (isDict(d)) trailer = d;
            break;
          }
          if (typeof s !== 'number') {
            l.pos = save;
            return false;
          }
          const count = l.next();
          if (typeof count !== 'number') return false;
          for (let i = 0; i < count; i++) {
            const off = l.next();
            const gen = l.next();
            const kind = l.next();
            if (typeof off !== 'number' || typeof gen !== 'number' || !(kind instanceof Cmd)) return false;
            if (kind.cmd === 'n' && !this.xref.has(s + i)) this.xref.set(s + i, { offset: off, index: 0, inStream: false });
            else if (kind.cmd === 'f' && !this.xref.has(s + i)) this.xref.set(s + i, { offset: -1, index: 0, inStream: false });
          }
        }
        if (!trailer) return false;
        const xs = trailer.XRefStm;
        if (typeof xs === 'number') queue.unshift(xs);
      } else if (typeof t === 'number') {
        const o = this.parseAt(at + this.base);
        if (!(o instanceof PdfStream)) return false;
        trailer = o.dict;
        const data = this.decode(o).data;
        const w = (this.numbers(o.dict.W) ?? [1, 2, 1]).map((x) => x | 0);
        const size = num(o.dict.Size);
        const index = this.numbers(o.dict.Index) ?? [0, size];
        let p = 0;
        const rd = (n: number) => {
          let v = 0;
          for (let i = 0; i < n; i++) v = v * 256 + (data[p++] ?? 0);
          return v;
        };
        for (let k = 0; k + 1 < index.length; k += 2) {
          for (let i = 0; i < index[k + 1]; i++) {
            const type = w[0] ? rd(w[0]) : 1;
            const f2 = rd(w[1]);
            const f3 = rd(w[2]);
            const n = index[k] + i;
            if (this.xref.has(n)) continue;
            if (type === 1) this.xref.set(n, { offset: f2, index: 0, inStream: false });
            else if (type === 2) this.xref.set(n, { offset: f2, index: f3, inStream: true });
            else this.xref.set(n, { offset: -1, index: 0, inStream: false });
          }
        }
      } else return false;
      if (first) {
        this.trailer = trailer;
        first = false;
      } else for (const k of Object.keys(trailer)) if (!(k in this.trailer)) this.trailer[k] = trailer[k];
      if (typeof trailer.Prev === 'number') queue.push(trailer.Prev);
    }
    // free entries are not objects
    for (const [n, e] of [...this.xref]) if (!e.inStream && e.offset < 0) this.xref.delete(n);
    return !first;
  }

  /** Last resort for damaged files: find every `n g obj` by scanning, the later copy of an object winning. */
  private rebuild(): void {
    const b = this.bytes;
    this.xref.clear();
    this.cache.clear();
    this.objStreams.clear();
    this.trailer = Object.create(null);
    let i = 0;
    for (;;) {
      i = indexOf(b, 'obj', i);
      if (i < 0) break;
      const after = b[i + 3];
      let p = i - 1;
      if (isWs(b[p]) && (after === undefined || isWs(after) || DELIM.has(after))) {
        while (p >= 0 && isWs(b[p])) p--;
        const gEnd = p;
        while (p >= 0 && b[p] >= 0x30 && b[p] <= 0x39) p--;
        if (p < gEnd && isWs(b[p])) {
          while (p >= 0 && isWs(b[p])) p--;
          const nEnd = p;
          while (p >= 0 && b[p] >= 0x30 && b[p] <= 0x39) p--;
          if (p < nEnd) {
            const num = parseInt(latin1(b, p + 1, nEnd + 1), 10);
            this.xref.set(num, { offset: p + 1 - this.base, index: 0, inStream: false });
          }
        }
      }
      i += 3;
    }
    // trailers and cross-reference stream dictionaries carry the root
    let t = 0;
    for (;;) {
      t = indexOf(b, 'trailer', t);
      if (t < 0) break;
      const d = readObject(new Lexer(b, t + 7), true);
      if (isDict(d)) for (const k of Object.keys(d)) this.trailer[k] = d[k];
      t += 7;
    }
    const streams: number[] = [];
    for (const n of [...this.xref.keys()]) {
      const o = this.getObject(n);
      const d = o instanceof PdfStream ? o.dict : isDict(o) ? o : null;
      if (!d) continue;
      if (d.Type instanceof Name) {
        if (d.Type.name === 'XRef') for (const k of ['Root', 'Encrypt', 'Info']) if (d[k]) this.trailer[k] = d[k];
        if (d.Type.name === 'ObjStm') streams.push(n);
        if (d.Type.name === 'Catalog' && !this.trailer.Root) this.trailer.Root = new Ref(n, 0);
      }
    }
    for (const sn of streams) {
      const s = this.getObject(sn);
      if (!(s instanceof PdfStream)) continue;
      try {
        const data = this.decode(s).data;
        const n = num(this.resolve(s.dict.N));
        const head = new Lexer(data, 0);
        for (let k = 0; k < n; k++) {
          const a = head.next();
          head.next();
          if (typeof a === 'number' && !this.xref.has(a)) this.xref.set(a, { offset: sn, index: k, inStream: true });
        }
      } catch {
        /* skip */
      }
    }
  }

  root(): Dict | null {
    return this.dictOf(this.trailer.Root);
  }

  // ---- streams

  decode(s: PdfStream): Decoded {
    let data = s.raw;
    const f = this.resolve(s.dict.Filter ?? s.dict.F);
    const p = this.resolve(s.dict.DecodeParms ?? s.dict.DP);
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => this.resolve(x)).filter((x): x is Name => x instanceof Name);
    const parms = Array.isArray(p) ? p.map((x) => this.dictOf(x)) : [this.dictOf(p)];
    for (let i = 0; i < filters.length; i++) {
      const name = FILTER_ALIASES[filters[i].name] ?? filters[i].name;
      const pr = parms[i] ?? null;
      switch (name) {
        case 'FlateDecode':
          data = unpredict(inflate(data), pr, this);
          break;
        case 'LZWDecode':
          data = unpredict(lzw(data, pr ? num(this.resolve(pr.EarlyChange), 1) : 1), pr, this);
          break;
        case 'ASCII85Decode':
          data = ascii85(data);
          break;
        case 'ASCIIHexDecode':
          data = asciiHex(data);
          break;
        case 'RunLengthDecode':
          data = runLength(data);
          break;
        case 'Crypt':
          break;
        default:
          if (IMAGE_FILTERS.has(name)) return { data, codec: name };
          throw new Error(`unsupported stream filter ${name}`);
      }
    }
    return { data, codec: null };
  }

  // ---- pages

  pages(): PageInfo[] {
    const out: PageInfo[] = [];
    const root = this.root()!;
    const seen = new Set<unknown>();
    const walk = (node: PdfObj, inherit: Dict, depth: number) => {
      const d = this.dictOf(node);
      if (!d || seen.has(d) || depth > 40) return;
      seen.add(d);
      const inh: Dict = { ...inherit };
      for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) if (d[k] !== undefined) inh[k] = d[k];
      const kids = this.arrayOf(d.Kids);
      if (kids && !(d.Type instanceof Name && d.Type.name === 'Page')) {
        for (const k of kids) walk(k, inh, depth + 1);
        return;
      }
      out.push(this.pageInfo(d, inh));
    };
    walk(root.Pages ?? null, Object.create(null), 0);
    if (!out.length) {
      // damaged page tree: take every page object in file order
      for (const n of [...this.xref.keys()].sort((a, b) => a - b)) {
        const o = this.getObject(n);
        if (isDict(o) && o.Type instanceof Name && o.Type.name === 'Page') out.push(this.pageInfo(o, Object.create(null)));
      }
    }
    return out;
  }

  private pageInfo(d: Dict, inh: Dict): PageInfo {
    const val = (k: string) => (d[k] !== undefined ? d[k] : inh[k]);
    const box = (k: string) => {
      const a = this.numbers(d[k] !== undefined ? d[k] : k === 'CropBox' ? inh[k] : undefined);
      return a && a.length >= 4 ? [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])] : null;
    };
    const media = box('MediaBox') ?? (() => {
      const a = this.numbers(inh.MediaBox);
      return a && a.length >= 4 ? [Math.min(a[0], a[2]), Math.min(a[1], a[3]), Math.max(a[0], a[2]), Math.max(a[1], a[3])] : [0, 0, 612, 792];
    })();
    return {
      dict: d,
      resources: this.dictOf(val('Resources')) ?? Object.create(null),
      mediaBox: media,
      cropBox: box('CropBox'),
      trimBox: box('TrimBox'),
      rotate: ((((num(this.resolve(val('Rotate'))) / 90) | 0) % 4) + 4) % 4,
    };
  }

  /** The page's content as one byte string (its streams joined). */
  pageContent(page: PageInfo): Uint8Array {
    const c = this.resolve(page.dict.Contents);
    const list = Array.isArray(c) ? c.map((x) => this.resolve(x)) : [c];
    const parts: Uint8Array[] = [];
    for (const s of list) {
      if (!(s instanceof PdfStream)) continue;
      try {
        parts.push(this.decode(s).data);
      } catch (err) {
        this.warnings.push(`A page content stream could not be decoded (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    return concat(parts);
  }
}

export class NotPdfError extends Error {
  constructor() {
    super('This file has no PDF structure');
  }
}

function inflate(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    try {
      return inflateSync(data.subarray(2));
    } catch {
      return new Uint8Array(0);
    }
  }
}

export function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
    out[o++] = 10;
  }
  return out;
}

/** Position of an ASCII string in the bytes, or -1. */
export function indexOf(b: Uint8Array, s: string, from = 0, to = b.length): number {
  const first = s.charCodeAt(0);
  const n = s.length;
  const last = Math.min(to, b.length) - n;
  outer: for (let i = from; i <= last; i++) {
    if (b[i] !== first) continue;
    for (let k = 1; k < n; k++) if (b[i + k] !== s.charCodeAt(k)) continue outer;
    return i;
  }
  return -1;
}
