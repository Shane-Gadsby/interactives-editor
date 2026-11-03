import { Cmd, Lexer, Name, PdfStream, PdfString, num, type Dict, type PdfDoc, type PdfObj } from './pdf-parse';
import { psdFont } from './psd-import';

/** PDF fonts, for text in the Illustrator / PDF importer: how bytes in a text string become characters and how wide they are. */

export interface Glyph {
  text: string;
  /** Advance in 1/1000 of the font size. */
  width: number;
  /** A single-byte code 32, which word spacing applies to. */
  space: boolean;
}

export interface PdfFont {
  /** PostScript name without a subset prefix. */
  baseName: string;
  family: string;
  weight: number;
  italic: boolean;
  google: boolean;
  type3: boolean;
  /** Some characters could not be mapped to Unicode. */
  guessed: boolean;
  decode(bytes: Uint8Array): Glyph[];
}

const WIN_1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
const MAC_ROMAN = 'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

function baseEncoding(name: string): string[] {
  const t: string[] = [];
  for (let c = 0; c < 256; c++) {
    let ch: string;
    if (c < 32) ch = '';
    else if (c < 127) ch = String.fromCharCode(c);
    else if (c < 160) ch = name === 'MacRomanEncoding' ? (MAC_ROMAN[c - 128] ?? '') : name === 'StandardEncoding' ? '' : WIN_1252[c - 128] ?? '';
    else ch = name === 'MacRomanEncoding' ? (MAC_ROMAN[c - 128] ?? '') : name === 'StandardEncoding' ? '' : String.fromCharCode(c);
    if (name === 'StandardEncoding') {
      if (c === 39) ch = '’';
      else if (c === 96) ch = '‘';
    }
    t.push(ch);
  }
  return t;
}

const GLYPH_NAMES: Record<string, string> = {
  space: ' ', exclam: '!', quotedbl: '"', numbersign: '#', dollar: '$', percent: '%', ampersand: '&', quotesingle: "'", parenleft: '(', parenright: ')', asterisk: '*', plus: '+', comma: ',', hyphen: '-', minus: '−', period: '.', slash: '/',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', colon: ':', semicolon: ';', less: '<', equal: '=', greater: '>', question: '?', at: '@',
  bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~',
  quoteright: '’', quoteleft: '‘', quotedblleft: '“', quotedblright: '”', quotesinglbase: '‚', quotedblbase: '„', endash: '–', emdash: '—', bullet: '•', ellipsis: '…',
  fi: 'ﬁ', fl: 'ﬂ', Euro: '€', copyright: '©', registered: '®', trademark: '™', degree: '°', plusminus: '±', multiply: '×', divide: '÷', section: '§', paragraph: '¶',
  germandbls: 'ß', AE: 'Æ', ae: 'æ', OE: 'Œ', oe: 'œ', Oslash: 'Ø', oslash: 'ø', Eth: 'Ð', eth: 'ð', Thorn: 'Þ', thorn: 'þ', dotlessi: 'ı', florin: 'ƒ',
  exclamdown: '¡', questiondown: '¿', cent: '¢', sterling: '£', yen: '¥', currency: '¤', guillemotleft: '«', guillemotright: '»', guilsinglleft: '‹', guilsinglright: '›',
  dagger: '†', daggerdbl: '‡', perthousand: '‰', periodcentered: '·', brokenbar: '¦', logicalnot: '¬', mu: 'µ', onesuperior: '¹', twosuperior: '²', threesuperior: '³',
  onequarter: '¼', onehalf: '½', threequarters: '¾', ordfeminine: 'ª', ordmasculine: 'º', macron: '¯', acute: '´', dieresis: '¨', cedilla: '¸', circumflex: 'ˆ', tilde: '˜', nbspace: ' ', fraction: '⁄',
};
const ACCENTS: Record<string, string> = { grave: '̀', acute: '́', circumflex: '̂', tilde: '̃', macron: '̄', breve: '̆', dotaccent: '̇', dieresis: '̈', ring: '̊', hungarumlaut: '̋', caron: '̌', cedilla: '̧', ogonek: '̨' };

/** Adobe glyph name to the character it stands for (best effort), or '' when unknown. */
export function glyphChar(name: string): string {
  const n = name.replace(/\..*$/, '');
  if (n.length === 1) return n;
  if (GLYPH_NAMES[n]) return GLYPH_NAMES[n];
  let m = /^uni([0-9A-Fa-f]{4})/.exec(n);
  if (m) return String.fromCharCode(parseInt(m[1], 16));
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(n);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  m = /^([A-Za-z])([a-z]+)$/.exec(n);
  if (m && ACCENTS[m[2]]) return (m[1] + ACCENTS[m[2]]).normalize('NFC');
  return '';
}

// ---------------------------------------------------------------- ToUnicode

interface CMap {
  map: Map<number, string>;
  codeLen: number;
}

function utf16(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  if (b.length === 1) s = String.fromCharCode(b[0]);
  return s;
}
const code = (b: Uint8Array) => b.reduce((n, v) => n * 256 + v, 0);

function parseCMap(data: Uint8Array): CMap {
  const lex = new Lexer(data);
  const map = new Map<number, string>();
  let codeLen = 0;
  let mode = '';
  const toks: (number | Name | PdfString | Cmd)[] = [];
  for (;;) {
    const t = lex.next();
    if (t === undefined) break;
    if (t instanceof Cmd && /^(begin|end)/.test(t.cmd)) {
      mode = t.cmd.startsWith('begin') ? t.cmd.slice(5) : '';
      toks.length = 0;
      continue;
    }
    if (!mode) continue;
    if (mode === 'codespacerange') {
      if (t instanceof PdfString && !codeLen) codeLen = t.bytes.length;
      continue;
    }
    toks.push(t);
    if (mode === 'bfchar' && toks.length === 2) {
      const [a, b] = toks;
      if (a instanceof PdfString && b instanceof PdfString) map.set(code(a.bytes), utf16(b.bytes));
      toks.length = 0;
    } else if (mode === 'bfrange') {
      // <lo> <hi> <dst>  or  <lo> <hi> [ <d1> <d2> ... ]
      if (toks.length === 3 && !(toks[2] instanceof Cmd && toks[2].cmd === '[')) {
        const [a, b, c] = toks;
        if (a instanceof PdfString && b instanceof PdfString && c instanceof PdfString) {
          const lo = code(a.bytes);
          const hi = code(b.bytes);
          const dst = utf16(c.bytes);
          for (let k = lo; k <= hi && k - lo < 65536; k++) map.set(k, dst.slice(0, -1) + String.fromCharCode(dst.charCodeAt(dst.length - 1) + (k - lo)));
        }
        toks.length = 0;
      } else if (toks.length > 3 && toks[toks.length - 1] instanceof Cmd && (toks[toks.length - 1] as Cmd).cmd === ']') {
        const lo = toks[0] instanceof PdfString ? code((toks[0] as PdfString).bytes) : 0;
        let k = lo;
        for (const x of toks.slice(3, -1)) if (x instanceof PdfString) map.set(k++, utf16(x.bytes));
        toks.length = 0;
      }
    }
  }
  return { map, codeLen };
}

// ---------------------------------------------------------------- fonts

export function loadFont(doc: PdfDoc, fontObj: PdfObj | undefined): PdfFont {
  const dict = doc.dictOf(fontObj) ?? (Object.create(null) as Dict);
  const subtype = doc.get(dict, 'Subtype');
  const sub = subtype instanceof Name ? subtype.name : '';
  const baseObj = doc.get(dict, 'BaseFont');
  const baseName = (baseObj instanceof Name ? baseObj.name : 'Arial').replace(/^[A-Z]{6}\+/, '');
  const descFont = sub === 'Type0' ? doc.dictOf((doc.arrayOf(dict.DescendantFonts) ?? [])[0]) : null;
  const descriptor = doc.dictOf(sub === 'Type0' ? descFont?.FontDescriptor : dict.FontDescriptor);
  const flags = descriptor ? num(doc.resolve(descriptor.Flags)) : 0;
  const ps = psdFont(baseName.replace(/,/g, '-').replace(/\s+/g, ''), false, false);
  let weight = ps.weight;
  const fw = descriptor ? num(doc.resolve(descriptor.FontWeight)) : 0;
  if (weight === 400 && fw > 400) weight = fw;
  if (weight === 400 && flags & 0x40000) weight = 700;
  const italic = ps.italic || !!(flags & 0x40) || (descriptor ? num(doc.resolve(descriptor.ItalicAngle)) !== 0 : false);

  const tu = doc.get(dict, 'ToUnicode');
  const cmap = tu instanceof PdfStream ? safeCMap(doc, tu) : null;
  const font: PdfFont = { baseName, family: ps.family, weight, italic, google: ps.google, type3: sub === 'Type3', guessed: false, decode: () => [] };

  if (sub === 'Type0') {
    const df = descFont ?? (Object.create(null) as Dict);
    const dw = num(doc.resolve(df.DW), 1000);
    const widths = new Map<number, number>();
    const w = doc.arrayOf(df.W) ?? [];
    for (let i = 0; i < w.length; ) {
      const c = num(doc.resolve(w[i]));
      const nx = doc.resolve(w[i + 1]);
      if (Array.isArray(nx)) {
        nx.forEach((x, k) => widths.set(c + k, num(doc.resolve(x))));
        i += 2;
      } else {
        const hi = num(nx);
        const wd = num(doc.resolve(w[i + 2]));
        for (let k = c; k <= hi && k - c < 65536; k++) widths.set(k, wd);
        i += 3;
      }
    }
    const len = cmap?.codeLen || 2;
    font.decode = (bytes) => {
      const out: Glyph[] = [];
      for (let i = 0; i + len <= bytes.length; i += len) {
        const c = code(bytes.subarray(i, i + len));
        let text = cmap?.map.get(c);
        if (text === undefined) {
          text = cmap ? '' : String.fromCodePoint(c > 0x10ffff ? 0xfffd : c);
          if (!cmap) font.guessed = true;
        }
        out.push({ text, width: widths.get(c) ?? dw, space: false });
      }
      return out;
    };
    return font;
  }

  // simple fonts: a base table, then the Differences
  const enc = doc.get(dict, 'Encoding');
  let baseName2 = flags & 4 && !(enc instanceof Name) ? 'StandardEncoding' : 'WinAnsiEncoding';
  const diffs = new Map<number, string>();
  if (enc instanceof Name) baseName2 = enc.name;
  else if (doc.dictOf(enc)) {
    const e = doc.dictOf(enc)!;
    const be = doc.resolve(e.BaseEncoding);
    if (be instanceof Name) baseName2 = be.name;
    let at = 0;
    for (const x of doc.arrayOf(e.Differences) ?? []) {
      const r = doc.resolve(x);
      if (typeof r === 'number') at = r;
      else if (r instanceof Name) diffs.set(at++, r.name);
    }
  }
  const table = baseEncoding(baseName2);
  const first = num(doc.resolve(dict.FirstChar));
  const wl = doc.numbers(dict.Widths);
  const missing = descriptor ? num(doc.resolve(descriptor.MissingWidth)) : 0;
  font.decode = (bytes) => {
    const out: Glyph[] = [];
    for (const c of bytes) {
      let text = cmap?.map.get(c);
      if (text === undefined) {
        const dn = diffs.get(c);
        text = dn !== undefined ? glyphChar(dn) : table[c];
        if (!text && dn === undefined && !cmap && c >= 32) font.guessed = true;
      }
      const width = wl && c >= first && c - first < wl.length ? wl[c - first] : missing || (c === 32 ? 278 : 500);
      out.push({ text: text ?? '', width, space: c === 32 });
    }
    return out;
  };
  return font;
}

function safeCMap(doc: PdfDoc, s: PdfStream): CMap | null {
  try {
    return parseCMap(doc.decode(s).data);
  } catch {
    return null;
  }
}
