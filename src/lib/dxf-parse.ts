/**
 * A reader for AutoCAD DXF files (ASCII and binary): group-code pairs, sections, and the tables, blocks and entities in them.
 * It only tokenizes and groups; `dxf-import.ts` turns the result into layers.
 */

export class DxfError extends Error {}

type Val = string | number;

/** What a group code holds (DXF reference, "Group Code Value Types"). */
type Kind = 's' | 'f' | 'i' | 'b' | 'x';
function kindOf(code: number): Kind {
  if (code < 10) return 's';
  if (code < 60) return 'f';
  if (code < 100) return 'i';
  if (code < 110) return 's';
  if (code < 160) return 'f';
  if (code < 210) return 'i';
  if (code < 240) return 'f';
  if (code < 270) return 'f';
  if (code < 290) return 'i';
  if (code < 300) return 'b';
  if (code < 310) return 's';
  if (code < 320) return 'x';
  if (code < 370) return 's';
  if (code < 390) return 'i';
  if (code < 400) return 's';
  if (code < 410) return 'i';
  if (code < 420) return 's';
  if (code < 430) return 'i';
  if (code < 440) return 's';
  if (code < 460) return 'i';
  if (code < 470) return 'f';
  if (code < 1000) return 's';
  if (code < 1004) return 's';
  if (code === 1004) return 'x';
  if (code < 1010) return 's';
  if (code < 1060) return 'f';
  return 'i';
}

/** Byte size of a binary integer value for a group code. */
function intSize(code: number): number {
  if (code >= 90 && code < 100) return 4;
  if (code >= 160 && code < 170) return 8;
  if ((code >= 420 && code < 430) || (code >= 440 && code < 460) || code === 1071) return 4;
  return 2;
}

/** One record: a table entry, a block header or an entity, as its group codes in file order. */
export class Ent {
  codes: number[] = [];
  vals: Val[] = [];
  /** VERTEX and ATTRIB records that follow a POLYLINE or INSERT. */
  kids: Ent[] = [];
  constructor(public type: string) {}
  push(code: number, v: Val): void {
    this.codes.push(code);
    this.vals.push(v);
  }
  has(code: number): boolean {
    return this.codes.includes(code);
  }
  str(code: number, def = ''): string {
    const i = this.codes.indexOf(code);
    return i < 0 ? def : String(this.vals[i]);
  }
  num(code: number, def = 0): number {
    const i = this.codes.indexOf(code);
    if (i < 0) return def;
    const n = Number(this.vals[i]);
    return Number.isFinite(n) ? n : def;
  }
  /** Every value for a code, in file order. */
  all(code: number): Val[] {
    const out: Val[] = [];
    for (let i = 0; i < this.codes.length; i++) if (this.codes[i] === code) out.push(this.vals[i]);
    return out;
  }
  allNum(code: number): number[] {
    return this.all(code).map((v) => Number(v) || 0);
  }
}

export interface DxfLayer {
  name: string;
  /** ACI colour; negative means the layer is off. */
  color: number;
  trueColor: number | null;
  ltype: string;
  /** Hundredths of a mm; negative values mean "default". */
  lineweight: number;
  off: boolean;
  frozen: boolean;
}

export interface DxfBlock {
  name: string;
  base: { x: number; y: number };
  flags: number;
  ents: Ent[];
}

export interface DxfDoc {
  /** AC1009, AC1015, ... when the HEADER says. */
  version: string;
  header: Map<string, Ent>;
  layers: Map<string, DxfLayer>;
  /** Dash patterns by upper-case linetype name: positive = dash, negative = gap, 0 = dot. */
  ltypes: Map<string, number[]>;
  blocks: Map<string, DxfBlock>;
  /** Model space entities. */
  model: Ent[];
  /** Paper space entities (group code 67 = 1). */
  paper: Ent[];
  binary: boolean;
}

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

export function isBinaryDxf(bytes: Uint8Array): boolean {
  if (bytes.length < 22) return false;
  for (let i = 0; i < BINARY_SENTINEL.length; i++) if (bytes[i] !== BINARY_SENTINEL.charCodeAt(i)) return false;
  return true;
}

/** True when the bytes start like an ASCII DXF file (a "0 / SECTION" pair, possibly after comments). */
export function isAsciiDxf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 2048)));
  return /^﻿?\s*(?:999\r?\n[^\r\n]*\r?\n\s*)*0\r?\nSECTION\r?\n/.test(head);
}

function decodeText(bytes: Uint8Array): string {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const body = start ? bytes.subarray(start) : bytes;
  // R2007 and later are UTF-8; older files use the ANSI code page (almost always Windows-1252)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(body);
    } catch {
      return new TextDecoder('latin1').decode(body);
    }
  }
}

type Pair = [number, Val];

function* asciiPairs(text: string): Generator<Pair> {
  let pos = 0;
  const n = text.length;
  const line = (): string | null => {
    if (pos >= n) return null;
    let e = text.indexOf('\n', pos);
    if (e < 0) e = n;
    let s = text.slice(pos, e);
    pos = e + 1;
    if (s.endsWith('\r')) s = s.slice(0, -1);
    return s;
  };
  for (;;) {
    const c = line();
    if (c === null) return;
    const code = parseInt(c.trim(), 10);
    const raw = line();
    if (raw === null) return;
    if (!Number.isFinite(code)) throw new DxfError('This does not look like a DXF file (a group code line is not a number).');
    switch (kindOf(code)) {
      case 'f': {
        const f = parseFloat(raw);
        yield [code, Number.isFinite(f) ? f : 0];
        break;
      }
      case 'i':
      case 'b': {
        const i = parseInt(raw, 10);
        yield [code, Number.isFinite(i) ? i : 0];
        break;
      }
      default:
        yield [code, kindOf(code) === 's' ? raw : raw.trim()];
    }
  }
}

function* binaryPairs(bytes: Uint8Array): Generator<Pair> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder('utf-8');
  let p = 22;
  const n = bytes.length;
  // R12 files write the code as one byte (255 escapes a two byte code); R13+ always use two bytes. A 2-byte first record
  // "0, SECTION" tells which: the code 0 is followed by "SECTION" directly in R12 and by a zero byte in R13+.
  const twoByte = bytes[p + 1] === 0 && !(bytes[p] === 0 && bytes[p + 1] === 0x53);
  while (p < n) {
    let code: number;
    if (twoByte) {
      if (p + 2 > n) return;
      code = dv.getUint16(p, true);
      p += 2;
    } else {
      code = bytes[p++];
      if (code === 255) {
        if (p + 2 > n) return;
        code = dv.getInt16(p, true);
        p += 2;
      }
    }
    const k = kindOf(code);
    if (k === 's') {
      let e = p;
      while (e < n && bytes[e] !== 0) e++;
      yield [code, dec.decode(bytes.subarray(p, e))];
      p = e + 1;
    } else if (k === 'f') {
      if (p + 8 > n) return;
      yield [code, dv.getFloat64(p, true)];
      p += 8;
    } else if (k === 'b') {
      yield [code, bytes[p++]];
    } else if (k === 'x') {
      const len = bytes[p++];
      p += len; // binary chunks (thumbnails, extended data) are not used
      yield [code, ''];
    } else {
      const size = intSize(code);
      if (p + size > n) return;
      yield [code, size === 2 ? dv.getInt16(p, true) : size === 4 ? dv.getInt32(p, true) : Number(dv.getBigInt64(p, true))];
      p += size;
    }
  }
}

/** Group the flat record list of ENTITIES or a block body: VERTEX / ATTRIB records attach to the POLYLINE / INSERT before them. */
function link(list: Ent[]): Ent[] {
  const out: Ent[] = [];
  let parent: Ent | null = null;
  for (const e of list) {
    if (parent && (e.type === 'VERTEX' || e.type === 'ATTRIB')) parent.kids.push(e);
    else if (e.type === 'SEQEND') parent = null;
    else {
      out.push(e);
      parent = e.type === 'POLYLINE' || (e.type === 'INSERT' && e.num(66) === 1) ? e : null;
    }
  }
  return out;
}

export function parseDxf(bytes: Uint8Array): DxfDoc {
  const binary = isBinaryDxf(bytes);
  if (!binary && !isAsciiDxf(bytes)) throw new DxfError('This does not look like a DXF file.');
  const pairs = binary ? binaryPairs(bytes) : asciiPairs(decodeText(bytes));
  const doc: DxfDoc = { version: '', header: new Map(), layers: new Map(), ltypes: new Map(), blocks: new Map(), model: [], paper: [], binary };

  // sections: split into records (a record starts at every 0 code)
  let section = '';
  let cur: Ent | null = null;
  let inSectionName = false;
  const recs: Ent[] = [];
  let headerVar: Ent | null = null;
  const flush = () => {
    if (section === 'TABLES') {
      for (const e of recs) {
        if (e.type === 'LAYER') {
          const name = e.str(2);
          const color = e.num(62, 7);
          doc.layers.set(name.toLowerCase(), {
            name,
            color,
            trueColor: e.has(420) ? e.num(420) : null,
            ltype: e.str(6, 'Continuous'),
            lineweight: e.num(370, -3),
            off: color < 0,
            frozen: (e.num(70) & 1) === 1,
          });
        } else if (e.type === 'LTYPE') {
          doc.ltypes.set(e.str(2).toUpperCase(), e.allNum(49));
        }
      }
    } else if (section === 'BLOCKS') {
      let block: DxfBlock | null = null;
      let body: Ent[] = [];
      const close = () => {
        if (block) {
          block.ents = link(body);
          doc.blocks.set(block.name.toLowerCase(), block);
        }
        block = null;
        body = [];
      };
      for (const e of recs) {
        if (e.type === 'BLOCK') {
          close();
          block = { name: e.str(2) || e.str(3), base: { x: e.num(10), y: e.num(20) }, flags: e.num(70), ents: [] };
        } else if (e.type === 'ENDBLK') close();
        else if (block) body.push(e);
      }
      close();
    } else if (section === 'ENTITIES') {
      for (const e of link(recs)) (e.num(67) === 1 ? doc.paper : doc.model).push(e);
    }
    recs.length = 0;
  };

  for (const [code, v] of pairs) {
    if (section === 'HEADER') {
      if (code === 9) {
        headerVar = new Ent(String(v));
        doc.header.set(String(v), headerVar);
        continue;
      }
      if (code === 0) {
        section = '';
        headerVar = null;
        cur = null;
        continue;
      }
      headerVar?.push(code, v);
      continue;
    }
    if (code === 0) {
      const t = String(v).trim().toUpperCase();
      if (t === 'EOF') break;
      if (t === 'SECTION') {
        flush();
        section = '';
        inSectionName = true;
        cur = null;
        continue;
      }
      if (t === 'ENDSEC') {
        flush();
        section = '';
        cur = null;
        continue;
      }
      cur = new Ent(t);
      if (section) recs.push(cur);
      continue;
    }
    if (inSectionName && code === 2) {
      section = String(v).trim().toUpperCase();
      inSectionName = false;
      continue;
    }
    cur?.push(code, v);
  }
  flush();
  doc.version = String(doc.header.get('$ACADVER')?.str(1) ?? '');
  return doc;
}
