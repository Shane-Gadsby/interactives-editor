/**
 * Fuzz the importers with corrupted copies of real files: every run must end (no hangs) and either import or fail
 * with an Error that has a message, never a crash from inside the parser (TypeError, RangeError and friends).
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importPsd } from '../src/lib/psd-import';
import { importAi } from '../src/lib/ai-import';
import { importRive } from '../src/lib/rive-import';
import { importSvg } from '../src/lib/svg-import';
import { importLottie } from '../src/lib/lottie-import';

const RUNS = Number(process.env.FUZZ_RUNS ?? 40);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function mutate(src: Uint8Array, r: () => number): Uint8Array {
  const b = new Uint8Array(src);
  const kind = Math.floor(r() * 5);
  const at = Math.floor(r() * b.length);
  if (kind === 0) {
    // flip a few bytes
    for (let i = 0; i < 1 + r() * 16; i++) b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
    return b;
  }
  if (kind === 1) return b.subarray(0, at); // truncate
  if (kind === 2) {
    // overwrite a run with 0xff (huge lengths) or 0x00
    const v = r() < 0.5 ? 0xff : 0;
    for (let i = at; i < Math.min(b.length, at + 4 + r() * 12); i++) b[i] = v;
    return b;
  }
  if (kind === 3) {
    // splice a chunk from elsewhere
    const from = Math.floor(r() * b.length);
    const n = Math.floor(r() * 64);
    b.set(src.subarray(from, from + n).subarray(0, b.length - at), at);
    return b;
  }
  // insert garbage
  const g = new Uint8Array(Math.floor(r() * 32)).map(() => Math.floor(r() * 256));
  const out = new Uint8Array(b.length + g.length);
  out.set(b.subarray(0, at));
  out.set(g, at);
  out.set(b.subarray(at), at + g.length);
  return out;
}

/** Fine: imported, or a deliberate Error. Not fine: an engine error from a bug, or a non-Error throw. */
function judge(err: unknown, label: string): string | null {
  if (err === undefined) return null;
  if (!(err instanceof Error)) return `${label}: threw a non-Error ${String(err)}`;
  if (err instanceof TypeError || err instanceof RangeError || err instanceof ReferenceError || err instanceof SyntaxError) {
    // A RangeError from a typed array or DataView read past the end is the parser trusting a length it shouldn't
    return `${label}: ${err.name}: ${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n')}`;
  }
  return err.message ? null : `${label}: Error without a message`;
}

async function fuzz(name: string, bytes: Uint8Array, run: (b: Uint8Array) => unknown) {
  const r = rng(name.length * 7919 + bytes.length);
  const problems: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const b = mutate(bytes, r);
    if (process.env.FUZZ_TRACE) require('node:fs').writeFileSync(`/tmp/claude-1000/-mnt-109313D2109313D2-sync-projects-interactives/b3e68f15-1ec5-4db3-b76b-2e725073c29d/scratchpad/fuzz-last-${name}.bin`, b);
    const t0 = performance.now();
    let err: unknown;
    try {
      await run(b);
    } catch (e) {
      err = e;
    }
    const ms = performance.now() - t0;
    const p = judge(err, `${name} #${i}`);
    if (p) problems.push(p);
    if (ms > 8000) problems.push(`${name} #${i}: took ${Math.round(ms)} ms`);
  }
  expect(problems.slice(0, 5).join('\n\n')).toBe('');
}

const R = '../research';
const files = {
  psd: `${R}/psd/Untitled-1.psd`,
  rive: `${R}/rive/breathing_for_calm_TEST1.riv`,
};

const PDF = new TextEncoder().encode(
  [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    '4 0 obj << /Length 120 >> stream',
    '1 0 0 rg 10 10 80 40 re f 0 0 1 RG 2 w 20 60 m 120 90 l 180 20 160 80 150 50 c S BT /F1 12 Tf 30 70 Td (Hello) Tj ET',
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref 0 6',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref 0',
    '%%EOF',
  ].join('\n'),
);

const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><g transform="translate(5 5) rotate(10)"><rect x="1" y="2" width="50" height="20" rx="4" fill="#f00"/><path d="M10 10 C 20 40 60 40 80 10 Z M 5 5 L 30 30" stroke="blue"/><circle cx="100" cy="50" r="20"/><text x="10" y="90">Hi</text></g><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></svg>',
);

const LOTTIE = new TextEncoder().encode(
  JSON.stringify({
    v: '5.7.0', fr: 30, ip: 0, op: 60, w: 200, h: 200, layers: [
      { ty: 4, nm: 'Shape', ip: 0, op: 60, ks: { o: { a: 0, k: 100 }, p: { a: 1, k: [{ t: 0, s: [50, 50, 0], o: { x: [0.3], y: [0] }, i: { x: [0.7], y: [1] } }, { t: 60, s: [150, 150, 0] }] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 } },
        shapes: [{ ty: 'gr', it: [{ ty: 'rc', s: { a: 0, k: [40, 40] }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 4 } }, { ty: 'fl', c: { a: 0, k: [1, 0, 0, 1] }, o: { a: 0, k: 100 } }, { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] },
    ],
  }),
);

describe('importer fuzzing', () => {
  it.skipIf(!existsSync(files.psd))('PSD', async () => {
    await fuzz('psd', new Uint8Array(readFileSync(files.psd)), (b) => importPsd(b, 'f'));
  }, 120000);
  it.skipIf(!existsSync(files.rive))('Rive', async () => {
    await fuzz('rive', new Uint8Array(readFileSync(files.rive)), (b) => importRive(b, 'f'));
  }, 120000);
  it('PDF / Illustrator', async () => {
    await fuzz('pdf', PDF, (b) => importAi(b, 'f'));
  }, 120000);
  it('SVG', async () => {
    await fuzz('svg', SVG, (b) => importSvg(new TextDecoder().decode(b)));
  }, 120000);
  it('Lottie', async () => {
    await fuzz('lottie', LOTTIE, (b) => {
      let json: unknown;
      try {
        json = JSON.parse(new TextDecoder().decode(b));
      } catch {
        return; // not JSON any more: the importer is never called with it
      }
      return importLottie(json as Parameters<typeof importLottie>[0]);
    });
  }, 120000);
});

/** Swap random values in a JSON tree for values of the wrong type or size. */
function mutateJson(src: unknown, r: () => number): unknown {
  const weird = [null, undefined, -1, 0, 1e9, -1e9, NaN, 'x', '', [], {}, true, [1], [null, 'a'], { k: 1 }];
  const copy = JSON.parse(JSON.stringify(src));
  const paths: [Record<string, unknown> | unknown[], string | number][] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    for (const k of Object.keys(v)) {
      paths.push([v as Record<string, unknown>, Array.isArray(v) ? Number(k) : k]);
      walk((v as Record<string, unknown>)[k]);
    }
  };
  walk(copy);
  for (let n = 0; n < 1 + Math.floor(r() * 4) && paths.length; n++) {
    const [obj, key] = paths[Math.floor(r() * paths.length)];
    const w = weird[Math.floor(r() * weird.length)];
    if (r() < 0.15) delete (obj as Record<string, unknown>)[key as string];
    else (obj as Record<string, unknown>)[key as string] = typeof w === 'object' && w ? JSON.parse(JSON.stringify(w)) : w;
  }
  return copy;
}

async function fuzzJson(name: string, src: unknown, run: (v: unknown) => unknown) {
  const r = rng(name.length * 104729 + 17);
  const problems: string[] = [];
  for (let i = 0; i < RUNS; i++) {
    const v = mutateJson(src, r);
    let err: unknown;
    try {
      await run(v);
    } catch (e) {
      err = e;
    }
    const p = judge(err, `${name} #${i}`);
    if (p) problems.push(p);
  }
  expect(problems.slice(0, 5).join('\n\n')).toBe('');
}

describe('structured fuzzing', () => {
  it('Lottie values of the wrong type', async () => {
    await fuzzJson('lottie-json', JSON.parse(new TextDecoder().decode(LOTTIE)), (v) => importLottie(v as Parameters<typeof importLottie>[0]));
  }, 120000);
});
