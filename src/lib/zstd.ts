/**
 * A small Zstandard decoder (RFC 8878), written for the `.pcraft` reader: tiles and blobs in a PhotoCraft file are zstd
 * frames and browsers have no zstd decoder. Supports every block type (raw, RLE, compressed with Huffman literals and
 * FSE sequences), repeat offsets, repeated tables, several frames and skippable frames. Not supported: dictionaries and
 * the checksum (it is skipped, not verified).
 */

export class ZstdError extends Error {}

const fail = (msg: string): never => {
  throw new ZstdError(`zstd: ${msg}`);
};

// ---------------------------------------------------------------- tables from the spec

const LL_BASE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
const LL_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const ML_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 39, 41, 43, 47, 51, 59, 67, 83, 99, 131, 259, 515, 1027, 2051, 4099, 8195, 16387, 32771, 65539,
];
const ML_BITS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const LL_DEFAULT = [4, 3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 2, 1, 1, 1, 1, 1, -1, -1, -1, -1];
const ML_DEFAULT = [1, 4, 3, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1];
const OF_DEFAULT = [1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1];

const highBit = (v: number): number => 31 - Math.clz32(v);

// ---------------------------------------------------------------- bit readers

/** Reads a stream forwards, least significant bit first (used for FSE table descriptions). */
class ForwardBits {
  pos = 0; // bit position
  constructor(readonly buf: Uint8Array, readonly start: number, readonly end: number) {}
  read(n: number): number {
    if (n === 0) return 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const p = this.pos + i;
      const byte = this.buf[this.start + (p >> 3)] ?? 0;
      v |= ((byte >> (p & 7)) & 1) << i;
    }
    this.pos += n;
    return v;
  }
  /** Bytes used so far, rounded up. */
  bytes(): number {
    return (this.pos + 7) >> 3;
  }
}

/** Reads a stream backwards from its last bit: the last byte holds a 1 marker bit, which is not data. */
class BackwardBits {
  /** Bit index just above the next bit to read; a negative value means more bits were asked for than the stream has. */
  pos: number;
  constructor(readonly buf: Uint8Array, readonly start: number, readonly end: number) {
    const last = buf[end - 1];
    if (end <= start || !last) fail('empty or unterminated bit stream');
    this.pos = (end - 1 - start) * 8 + highBit(last);
  }
  /** The next `n` (at most 25) bits without consuming them; bits before the start of the stream read as zero. */
  peek(n: number): number {
    if (n === 0) return 0;
    const lo = this.pos - n;
    if (lo >= 0) return this.window(lo, n);
    if (this.pos <= 0) return 0;
    return (this.window(0, this.pos) << -lo) >>> 0;
  }
  private window(lo: number, n: number): number {
    const i = this.start + (lo >> 3);
    const b = this.buf;
    const word = ((b[i] | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24)) >>> 0) >>> (lo & 7);
    return (word & ((1 << n) - 1)) >>> 0;
  }
  skip(n: number): void {
    this.pos -= n;
  }
  read(n: number): number {
    if (n <= 25) {
      const v = this.peek(n);
      this.pos -= n;
      return v;
    }
    // wide reads (offsets up to 31 bits): high part first
    const hi = this.read(n - 16);
    return hi * 65536 + this.read(16);
  }
  get overflow(): boolean {
    return this.pos < 0;
  }
}

// ---------------------------------------------------------------- FSE

interface Fse {
  accuracy: number;
  symbol: Uint8Array;
  nbBits: Uint8Array;
  baseline: Uint16Array;
}

/** Reads a table description (normalised counts) from `buf[start, end)`; gives the table and how many bytes it used. */
function readFseTable(buf: Uint8Array, start: number, end: number, maxAccuracy: number, maxSymbol: number): { table: Fse; used: number } {
  const bits = new ForwardBits(buf, start, end);
  const accuracy = 5 + bits.read(4);
  if (accuracy > maxAccuracy) fail('FSE accuracy log too large');
  const counts: number[] = [];
  let remaining = (1 << accuracy) + 1;
  let threshold = 1 << accuracy;
  let nbBits = accuracy + 1;
  while (remaining > 1 && counts.length <= maxSymbol) {
    const max = 2 * threshold - 1 - remaining;
    let count: number;
    const low = bits.read(nbBits - 1);
    if (low < max) count = low;
    else {
      const high = low | (bits.read(1) << (nbBits - 1));
      count = high >= threshold ? high - max : high;
    }
    count--;
    remaining -= count < 0 ? -count : count;
    counts.push(count);
    if (count === 0) {
      for (;;) {
        const rep = bits.read(2);
        for (let i = 0; i < rep; i++) counts.push(0);
        if (rep !== 3) break;
      }
    }
    while (remaining < threshold) {
      nbBits--;
      threshold >>= 1;
    }
  }
  if (remaining !== 1 || counts.length > maxSymbol + 1) fail('bad FSE table');
  const used = bits.bytes();
  if (start + used > end) fail('FSE table runs past its data');
  return { table: buildFse(counts, accuracy), used };
}

function buildFse(counts: number[], accuracy: number): Fse {
  const size = 1 << accuracy;
  const symbol = new Uint8Array(size);
  const nbBits = new Uint8Array(size);
  const baseline = new Uint16Array(size);
  const next = new Uint16Array(counts.length);
  let high = size - 1;
  for (let s = 0; s < counts.length; s++) {
    if (counts[s] === -1) {
      symbol[high--] = s;
      next[s] = 1;
    } else next[s] = counts[s];
  }
  const step = (size >> 1) + (size >> 3) + 3;
  const mask = size - 1;
  let pos = 0;
  for (let s = 0; s < counts.length; s++) {
    for (let i = 0; i < counts[s]; i++) {
      symbol[pos] = s;
      do pos = (pos + step) & mask;
      while (pos > high);
    }
  }
  for (let i = 0; i < size; i++) {
    const s = symbol[i];
    const n = next[s]++;
    const nb = accuracy - highBit(n);
    nbBits[i] = nb;
    baseline[i] = (n << nb) - size;
  }
  return { accuracy, symbol, nbBits, baseline };
}

function rleFse(sym: number): Fse {
  return { accuracy: 0, symbol: Uint8Array.of(sym), nbBits: Uint8Array.of(0), baseline: Uint16Array.of(0) };
}

// ---------------------------------------------------------------- Huffman

interface Huf {
  maxBits: number;
  symbol: Uint8Array;
  nbBits: Uint8Array;
}

function buildHuf(weights: number[]): Huf {
  let sum = 0;
  for (const w of weights) if (w > 0) sum += 1 << (w - 1);
  if (sum === 0) fail('empty Huffman tree');
  const maxBits = highBit(sum) + 1;
  const need = (1 << maxBits) - sum;
  if (need <= 0 || (need & (need - 1)) !== 0) fail('bad Huffman weights');
  const all = [...weights, highBit(need) + 1];
  if (maxBits > 11) fail('Huffman tree too deep');
  const size = 1 << maxBits;
  const symbol = new Uint8Array(size);
  const nbBits = new Uint8Array(size);
  let at = 0;
  for (let w = 1; w <= maxBits; w++) {
    for (let s = 0; s < all.length; s++) {
      if (all[s] !== w) continue;
      const span = 1 << (w - 1);
      symbol.fill(s, at, at + span);
      nbBits.fill(maxBits + 1 - w, at, at + span);
      at += span;
    }
  }
  return { maxBits, symbol, nbBits };
}

function readHufTree(buf: Uint8Array, start: number, end: number): { huf: Huf; used: number } {
  const head = buf[start];
  if (head === undefined) fail('missing Huffman tree');
  const weights: number[] = [];
  let used: number;
  if (head >= 128) {
    const n = head - 127;
    used = 1 + ((n + 1) >> 1);
    if (start + used > end) fail('Huffman tree runs past its data');
    for (let i = 0; i < n; i++) {
      const b = buf[start + 1 + (i >> 1)];
      weights.push(i & 1 ? b & 15 : b >> 4);
    }
  } else {
    used = 1 + head;
    if (start + used > end) fail('Huffman tree runs past its data');
    const { table, used: tableBytes } = readFseTable(buf, start + 1, start + used, 6, 255);
    const bits = new BackwardBits(buf, start + 1 + tableBytes, start + used);
    let s1 = bits.read(table.accuracy);
    let s2 = bits.read(table.accuracy);
    for (;;) {
      weights.push(table.symbol[s1]);
      s1 = table.baseline[s1] + bits.read(table.nbBits[s1]);
      if (bits.overflow) {
        weights.push(table.symbol[s2]);
        break;
      }
      weights.push(table.symbol[s2]);
      s2 = table.baseline[s2] + bits.read(table.nbBits[s2]);
      if (bits.overflow) {
        weights.push(table.symbol[s1]);
        break;
      }
      if (weights.length > 255) fail('too many Huffman weights');
    }
  }
  if (weights.length > 255) fail('too many Huffman weights');
  return { huf: buildHuf(weights), used };
}

function decodeHufStream(huf: Huf, buf: Uint8Array, start: number, end: number, out: Uint8Array, outStart: number, count: number): void {
  const bits = new BackwardBits(buf, start, end);
  const { maxBits, symbol, nbBits } = huf;
  for (let i = 0; i < count; i++) {
    const v = bits.peek(maxBits);
    out[outStart + i] = symbol[v];
    bits.skip(nbBits[v]);
  }
  if (bits.pos < 0) fail('Huffman stream overrun');
}

// ---------------------------------------------------------------- frames and blocks

interface State {
  out: Uint8Array;
  outLen: number;
  huf: Huf | null;
  ll: Fse | null;
  of: Fse | null;
  ml: Fse | null;
  rep: [number, number, number];
}

function ensure(st: State, extra: number): void {
  const need = st.outLen + extra;
  if (need <= st.out.length) return;
  let size = Math.max(st.out.length * 2, 1024);
  while (size < need) size *= 2;
  const next = new Uint8Array(size);
  next.set(st.out.subarray(0, st.outLen));
  st.out = next;
}

function readLiterals(st: State, buf: Uint8Array, at: number, end: number): { lits: Uint8Array; next: number } {
  const b0 = buf[at];
  const type = b0 & 3;
  const format = (b0 >> 2) & 3;
  if (type <= 1) {
    let size: number;
    let head: number;
    if (format === 0 || format === 2) {
      size = b0 >> 3;
      head = 1;
    } else if (format === 1) {
      size = (b0 >> 4) | (buf[at + 1] << 4);
      head = 2;
    } else {
      size = (b0 >> 4) | (buf[at + 1] << 4) | (buf[at + 2] << 12);
      head = 3;
    }
    if (type === 0) {
      if (at + head + size > end) fail('literals run past the block');
      return { lits: buf.subarray(at + head, at + head + size), next: at + head + size };
    }
    if (at + head + 1 > end) fail('literals run past the block');
    return { lits: new Uint8Array(size).fill(buf[at + head]), next: at + head + 1 };
  }
  // compressed or treeless
  let head: number;
  let streams: number;
  let sizeBits: number;
  if (format === 0) [head, streams, sizeBits] = [3, 1, 10];
  else if (format === 1) [head, streams, sizeBits] = [3, 4, 10];
  else if (format === 2) [head, streams, sizeBits] = [4, 4, 14];
  else [head, streams, sizeBits] = [5, 4, 18];
  let h = 0;
  for (let i = 0; i < head; i++) h += buf[at + i] * 2 ** (8 * i);
  const regen = Math.floor(h / 16) % 2 ** sizeBits;
  const comp = Math.floor(h / 2 ** (4 + sizeBits)) % 2 ** sizeBits;
  let p = at + head;
  const litEnd = p + comp;
  if (litEnd > end) fail('literals run past the block');
  if (type === 2) {
    const { huf, used } = readHufTree(buf, p, litEnd);
    st.huf = huf;
    p += used;
  } else if (!st.huf) fail('literals reuse a tree that was never sent');
  const huf = st.huf as Huf;
  const lits = new Uint8Array(regen);
  if (streams === 1) decodeHufStream(huf, buf, p, litEnd, lits, 0, regen);
  else {
    if (p + 6 > litEnd) fail('missing Huffman stream sizes');
    const s1 = buf[p] | (buf[p + 1] << 8);
    const s2 = buf[p + 2] | (buf[p + 3] << 8);
    const s3 = buf[p + 4] | (buf[p + 5] << 8);
    const s4 = litEnd - (p + 6) - s1 - s2 - s3;
    if (s4 < 1) fail('bad Huffman stream sizes');
    const per = (regen + 3) >> 2;
    let q = p + 6;
    const sizes = [s1, s2, s3, s4];
    for (let i = 0; i < 4; i++) {
      const count = i < 3 ? per : regen - 3 * per;
      if (count < 0) fail('bad literal count');
      decodeHufStream(huf, buf, q, q + sizes[i], lits, i * per, count);
      q += sizes[i];
    }
  }
  return { lits, next: litEnd };
}

function pickTable(mode: number, buf: Uint8Array, p: number, end: number, prev: Fse | null, defaults: number[], defaultAccuracy: number, maxAccuracy: number, maxSymbol: number): { table: Fse; next: number } {
  if (mode === 0) return { table: buildFse(defaults, defaultAccuracy), next: p };
  if (mode === 1) {
    if (p >= end) fail('missing RLE symbol');
    return { table: rleFse(buf[p]), next: p + 1 };
  }
  if (mode === 2) {
    const { table, used } = readFseTable(buf, p, end, maxAccuracy, maxSymbol);
    return { table, next: p + used };
  }
  if (!prev) fail('sequence table repeated before it was sent');
  return { table: prev as Fse, next: p };
}

function compressedBlock(st: State, buf: Uint8Array, at: number, end: number): void {
  const { lits, next } = readLiterals(st, buf, at, end);
  let p = next;
  if (p >= end) fail('block has no sequence section');
  let n = buf[p++];
  if (n === 0) {
    ensure(st, lits.length);
    st.out.set(lits, st.outLen);
    st.outLen += lits.length;
    return;
  }
  if (n >= 128) {
    if (n < 255) n = ((n - 128) << 8) + buf[p++];
    else {
      n = buf[p] + (buf[p + 1] << 8) + 0x7f00;
      p += 2;
    }
  }
  const modes = buf[p++];
  const llm = pickTable(modes >> 6, buf, p, end, st.ll, LL_DEFAULT, 6, 9, 35);
  st.ll = llm.table;
  const ofm = pickTable((modes >> 4) & 3, buf, llm.next, end, st.of, OF_DEFAULT, 5, 8, 31);
  st.of = ofm.table;
  const mlm = pickTable((modes >> 2) & 3, buf, ofm.next, end, st.ml, ML_DEFAULT, 6, 9, 52);
  st.ml = mlm.table;
  const ll = st.ll;
  const of = st.of;
  const ml = st.ml;
  const bits = new BackwardBits(buf, mlm.next, end);
  let sLl = bits.read(ll.accuracy);
  let sOf = bits.read(of.accuracy);
  let sMl = bits.read(ml.accuracy);
  let litPos = 0;
  let [r0, r1, r2] = st.rep;
  for (let i = 0; i < n; i++) {
    const ofCode = of.symbol[sOf];
    const mlCode = ml.symbol[sMl];
    const llCode = ll.symbol[sLl];
    if (llCode > 35 || mlCode > 52) fail('bad sequence code');
    const ofValue = 2 ** ofCode + bits.read(ofCode);
    const matchLen = ML_BASE[mlCode] + bits.read(ML_BITS[mlCode]);
    const litLen = LL_BASE[llCode] + bits.read(LL_BITS[llCode]);
    if (i < n - 1) {
      sLl = ll.baseline[sLl] + bits.read(ll.nbBits[sLl]);
      sMl = ml.baseline[sMl] + bits.read(ml.nbBits[sMl]);
      sOf = of.baseline[sOf] + bits.read(of.nbBits[sOf]);
    }
    if (bits.overflow) fail('sequence stream overrun');
    let offset: number;
    if (ofValue > 3) {
      offset = ofValue - 3;
      r2 = r1;
      r1 = r0;
      r0 = offset;
    } else {
      const idx = litLen === 0 ? ofValue + 1 : ofValue;
      if (idx === 1) offset = r0;
      else if (idx === 2) {
        offset = r1;
        r1 = r0;
        r0 = offset;
      } else if (idx === 3) {
        offset = r2;
        r2 = r1;
        r1 = r0;
        r0 = offset;
      } else {
        offset = r0 - 1;
        r2 = r1;
        r1 = r0;
        r0 = offset;
      }
    }
    if (litPos + litLen > lits.length) fail('sequence uses more literals than the block has');
    ensure(st, litLen + matchLen);
    const out = st.out;
    let o = st.outLen;
    for (let k = 0; k < litLen; k++) out[o++] = lits[litPos + k];
    litPos += litLen;
    if (offset <= 0 || offset > o) fail('match offset is outside the output');
    for (let k = 0; k < matchLen; k++, o++) out[o] = out[o - offset];
    st.outLen = o;
  }
  st.rep = [r0, r1, r2];
  const rest = lits.length - litPos;
  ensure(st, rest);
  st.out.set(lits.subarray(litPos), st.outLen);
  st.outLen += rest;
}

/** Decode zstd data (one or more frames) into bytes. `sizeHint` is the expected output length, used to size the buffer. */
export function zstdDecompress(data: Uint8Array, sizeHint = 0): Uint8Array {
  const st: State = { out: new Uint8Array(Math.max(sizeHint, 1024)), outLen: 0, huf: null, ll: null, of: null, ml: null, rep: [1, 4, 8] };
  let p = 0;
  const u32 = (i: number) => (data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24)) >>> 0;
  while (p < data.length) {
    if (p + 4 > data.length) fail('truncated frame');
    const magic = u32(p);
    if ((magic & 0xfffffff0) >>> 0 === 0x184d2a50) {
      p += 8 + u32(p + 4);
      continue;
    }
    if (magic !== 0xfd2fb528) fail('not a zstd frame');
    p += 4;
    const fd = data[p++];
    const single = (fd >> 5) & 1;
    const checksum = (fd >> 2) & 1;
    const dictFlag = fd & 3;
    if (!single) p += 1; // window descriptor
    if (dictFlag) {
      const id = dictFlag === 3 ? 4 : dictFlag;
      for (let i = 0; i < id; i++) if (data[p + i]) fail('dictionaries are not supported');
      p += id;
    }
    const fcs = fd >> 6;
    p += fcs === 0 ? (single ? 1 : 0) : fcs === 1 ? 2 : fcs === 2 ? 4 : 8;
    st.huf = st.ll = st.of = st.ml = null;
    st.rep = [1, 4, 8];
    for (let last = false; !last; ) {
      if (p + 3 > data.length) fail('truncated block header');
      const h = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16);
      p += 3;
      last = (h & 1) === 1;
      const type = (h >> 1) & 3;
      const size = h >> 3;
      if (type === 0) {
        if (p + size > data.length) fail('truncated raw block');
        ensure(st, size);
        st.out.set(data.subarray(p, p + size), st.outLen);
        st.outLen += size;
        p += size;
      } else if (type === 1) {
        if (p >= data.length) fail('truncated RLE block');
        ensure(st, size);
        st.out.fill(data[p], st.outLen, st.outLen + size);
        st.outLen += size;
        p += 1;
      } else if (type === 2) {
        if (p + size > data.length) fail('truncated block');
        compressedBlock(st, data, p, p + size);
        p += size;
      } else fail('reserved block type');
    }
    if (checksum) p += 4;
  }
  return st.out.slice(0, st.outLen);
}

/** Does this look like the start of a zstd frame? */
export const isZstd = (b: Uint8Array): boolean => b.length >= 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
