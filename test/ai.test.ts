import { zlibSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { GroupNode, ImageNode, PathNode, SceneNode, TextNode } from 'interactives-player';
import { hasPdf, importAi } from '../src/lib/ai-import';
import { cmykToRgb } from '../src/lib/pdf-color';

// ---------------------------------------------------------------- a tiny PDF writer

const enc = new TextEncoder();
const bytesOf = (s: string | Uint8Array) => (typeof s === 'string' ? enc.encode(s) : s);

class Pdf {
  /** objs[i] is object i + 1; objects 1 and 2 are the catalog and the page tree. */
  private objs: Uint8Array[] = [new Uint8Array(), new Uint8Array()];
  private kids: number[] = [];
  catalogExtra = '';

  add(body: string | Uint8Array): number {
    this.objs.push(bytesOf(body));
    return this.objs.length;
  }

  stream(dict: string, data: string | Uint8Array): number {
    const d = bytesOf(data);
    const head = enc.encode(`<< ${dict} /Length ${d.length} >>\nstream\n`);
    const tail = enc.encode('\nendstream');
    const out = new Uint8Array(head.length + d.length + tail.length);
    out.set(head);
    out.set(d, head.length);
    out.set(tail, head.length + d.length);
    return this.add(out);
  }

  page(content: string | Uint8Array, res = '', box = [0, 0, 200, 100], extra = '', contentDict = ''): number {
    const c = this.stream(contentDict, content);
    const n = this.add(`<< /Type /Page /Parent 2 0 R /MediaBox [${box.join(' ')}] /Resources << ${res} >> /Contents ${c} 0 R ${extra} >>`);
    this.kids.push(n);
    return n;
  }

  build(opts: { startxref?: number } = {}): Uint8Array {
    this.objs[0] = enc.encode(`<< /Type /Catalog /Pages 2 0 R ${this.catalogExtra} >>`);
    this.objs[1] = enc.encode(`<< /Type /Pages /Kids [${this.kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${this.kids.length} >>`);
    const chunks: Uint8Array[] = [enc.encode('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
    let pos = chunks[0].length;
    const offsets: number[] = [];
    this.objs.forEach((o, i) => {
      offsets.push(pos);
      const a = enc.encode(`${i + 1} 0 obj\n`);
      const b = enc.encode('\nendobj\n');
      chunks.push(a, o, b);
      pos += a.length + o.length + b.length;
    });
    let xref = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`;
    xref += `trailer\n<< /Size ${this.objs.length + 1} /Root 1 0 R >>\nstartxref\n${opts.startxref ?? pos}\n%%EOF\n`;
    chunks.push(enc.encode(xref));
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

const one = (content: string, res = '', box?: number[]) => {
  const p = new Pdf();
  p.page(content, res, box);
  return p.build();
};

const flat = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap((n) => (n.type === 'group' || n.type === 'frame' ? [n, ...flat((n as GroupNode).children)] : [n]));
const paths = (nodes: SceneNode[]) => flat(nodes).filter((n): n is PathNode => n.type === 'path' && !n.mask);

describe('Illustrator / PDF import', () => {
  it('turns a filled rectangle into a path layer, flipping y and naming the artboard after the file', () => {
    const r = importAi(one('1 0 0 rg 10 10 100 50 re f'), 'Logo');
    expect(r.artboards).toHaveLength(1);
    const ab = r.artboard;
    expect(ab.name).toBe('Logo');
    expect(ab.width).toBe(200);
    expect(ab.height).toBe(100);
    const [n] = paths(ab.children);
    expect(n.fill).toEqual({ type: 'solid', color: '#ff0000' });
    expect(n.stroke).toBeNull();
    expect(n.x).toBe(10);
    expect(n.y).toBe(40); // 100 - (10 + 50)
    expect(n.width).toBe(100);
    expect(n.height).toBe(50);
    expect(n.paths[0].closed).toBe(true);
    expect(n.paths[0].points).toHaveLength(4);
  });

  it('reads strokes: width, cap, join, dash, and stroke opacity from ExtGState', () => {
    const r = importAi(one('/G0 gs 0 0 1 RG 4 w 1 J 2 j [5 3] 2 d 20 20 m 120 20 l S', '/ExtGState << /G0 << /CA 0.5 >> >>'), 'S');
    const [n] = paths(r.artboard.children);
    expect(n.fill).toBeNull();
    expect(n.stroke?.paint).toEqual({ type: 'solid', color: 'rgba(0, 0, 255, 0.5)' });
    expect(n.stroke?.width).toBe(4);
    expect(n.stroke?.dash).toEqual([5, 3]);
    expect(n.stroke?.dashOffset).toBe(2);
    expect(n.lineCap).toBe('round');
    expect(n.lineJoin).toBe('bevel');
  });

  it('applies cm matrices and keeps bezier handles; fill and stroke together make one layer', () => {
    const r = importAi(one('q 2 0 0 2 10 10 cm 0 0.5 0 rg 1 0 0 RG 0 0 m 10 0 20 10 20 20 c 0 20 l h B Q'));
    const [n] = paths(r.artboard.children);
    expect(n.fill).toEqual({ type: 'solid', color: '#008000' });
    expect(n.stroke?.paint).toEqual({ type: 'solid', color: '#ff0000' });
    expect(n.stroke?.width).toBe(2); // 1 * scale 2
    // absolute points: (10,10) (50,50) (10,50) in PDF space -> y flipped on a 100 high page
    expect(n.x).toBe(10);
    expect(n.y).toBe(50);
    expect(n.width).toBe(40);
    const p = n.paths[0].points;
    expect(p).toHaveLength(3);
    expect(p[0].out).toEqual({ x: 20, y: 0 }); // (10,0)*2 -> relative handle (20, 0) (y flip leaves 0)
    expect(p[1].in).toEqual({ x: 0, y: 20 }); // control (20,10)*2 relative to end (20,20)*2: 20 below in PDF, so 20 down after the flip
  });

  it('converts gray, RGB, CMYK, indexed and separation colours', () => {
    const p = new Pdf();
    const fn = p.add('<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 1 0] /N 1 >>');
    p.page(
      ['0.5 g 0 0 10 10 re f', '0 0 0 1 k 20 0 10 10 re f', '1 0 0 0 k 40 0 10 10 re f', '/Sp cs 1 scn 60 0 10 10 re f', '/Ix cs 1 sc 80 0 10 10 re f'].join('\n'),
      `/ColorSpace << /Sp [/Separation /Spot /DeviceCMYK ${fn} 0 R] /Ix [/Indexed /DeviceRGB 1 <ff0000 0000ff>] >>`,
    );
    const r = importAi(p.build());
    const fills = paths(r.artboard.children).map((n) => (n.fill as { color: string }).color);
    expect(fills[0]).toBe('#808080');
    const k = cmykToRgb(0, 0, 0, 1);
    expect(fills[1]).toBe(`#${k.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    expect(k[0]).toBeLessThan(80);
    const cyan = cmykToRgb(1, 0, 0, 0);
    expect(cyan[2]).toBeGreaterThan(cyan[0] + 100);
    // spot at full tint maps through its alternate (0 1 1 0 = red)
    expect(fills[3]).toBe(`#${cmykToRgb(0, 1, 1, 0).map((v) => v.toString(16).padStart(2, '0')).join('')}`);
    expect(fills[4]).toBe('#0000ff');
  });

  it('turns clipping into a mask layer in front of a group, and drops clips that change nothing', () => {
    const r = importAi(
      one(
        [
          'q 0 0 50 50 re W n 1 0 0 rg 20 20 100 100 re f Q', // really clips
          'q 0 0 200 100 re W n 0 1 0 rg 0 0 10 10 re f Q', // the whole artboard: no clip
          'q 0 0 150 90 re W n 0 0 1 rg 60 10 20 20 re f Q', // a rectangle that holds its content: no clip
        ].join('\n'),
      ),
    );
    const kids = r.artboard.children;
    expect(kids).toHaveLength(3);
    const g = kids[0] as GroupNode;
    expect(g.type).toBe('group');
    expect(g.children[0].mask).toBe(true);
    expect(g.children[0].type).toBe('path');
    expect(g.children).toHaveLength(2);
    expect(g.children[1].type).toBe('path');
    expect(kids[1].type).toBe('path');
    expect(kids[2].type).toBe('path');
    expect(r.artboard.children.every((c, i) => i === 0 || !(c as GroupNode).children)).toBe(true);
  });

  it('clips with even-odd and curved paths as a mask with that fill rule', () => {
    const r = importAi(one('q 10 10 m 60 10 l 35 60 l h 20 20 m 40 20 l 30 40 l h W* n 1 0 0 rg 0 0 100 100 re f Q'));
    const g = r.artboard.children[0] as GroupNode;
    const mask = g.children[0] as PathNode;
    expect(mask.mask).toBe(true);
    expect(mask.fillRule).toBe('evenodd');
    expect(mask.paths).toHaveLength(2);
  });

  it('reads text: font, size, colour, position, joined pieces and following lines', () => {
    const p = new Pdf();
    const font = p.add('<< /Type /Font /Subtype /Type1 /BaseFont /ABCDEF+Roboto-Bold /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [' + Array.from({ length: 95 }, () => 500).join(' ') + '] >>');
    p.page('BT /F1 12 Tf 0 0 1 rg 1 0 0 1 10 70 Tm 14 TL (Hello) Tj [(Wo) -300 (rld)] TJ T* (Second line) Tj ET', `/Font << /F1 ${font} 0 R >>`);
    const r = importAi(p.build());
    const t = flat(r.artboard.children).filter((n): n is TextNode => n.type === 'text');
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe('HelloWo rld\nSecond line') // the TJ gap of -300 is a space, the Tj before it joins directly;
    expect(t[0].fontSize).toBe(12);
    expect(t[0].fontFamily).toBe('Roboto');
    expect(t[0].fontWeight).toBe(700);
    expect(t[0].color).toBe('#0000ff');
    expect(t[0].x).toBe(10);
    // first baseline at y = 30 (flipped); the box starts above it
    expect(t[0].y).toBeLessThan(30);
    expect(t[0].y).toBeGreaterThan(10);
    expect(t[0].lineHeight).toBeCloseTo(14 / 12, 1);
    expect(r.fonts.some((f) => f.family === 'Roboto')).toBe(true);
  });

  it('decodes text through a ToUnicode map', () => {
    const p = new Pdf();
    const tu = p.stream('', '/CIDInit /ProcSet findresource begin 12 dict begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <0048> <0002> <0069> endbfchar endcmap');
    const cid = p.add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /MyFont /DW 600 >>');
    const font = p.add(`<< /Type /Font /Subtype /Type0 /BaseFont /MyFont /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    p.page('BT /F1 20 Tf 10 50 Td <00010002> Tj ET', `/Font << /F1 ${font} 0 R >>`);
    const t = flat(importAi(p.build()).artboard.children).find((n): n is TextNode => n.type === 'text')!;
    expect(t.text).toBe('Hi');
  });

  it('makes one artboard per page, named after the file and the page', () => {
    const p = new Pdf();
    p.page('1 0 0 rg 0 0 10 10 re f', '', [0, 0, 300, 200]);
    p.page('0 0 1 rg 0 0 10 10 re f', '', [0, 0, 100, 400]);
    const r = importAi(p.build(), 'Deck');
    expect(r.artboards).toHaveLength(2);
    expect(r.artboards[0].name).toBe('Deck / Artboard 1');
    expect(r.artboards[1].name).toBe('Deck / Artboard 2');
    expect(r.artboards[0].width).toBe(300);
    expect(r.artboards[1].height).toBe(400);
    expect(r.artboards[1].canvasX).toBeGreaterThan(r.artboards[0].canvasX + 300);
    expect(r.artboard).toBe(r.artboards[0]);
  });

  it('uses the trim box and rotation of a page', () => {
    const p = new Pdf();
    p.page('1 0 0 rg 50 50 20 20 re f', '', [0, 0, 300, 200], '/TrimBox [40 40 140 140] /Rotate 90');
    const ab = importAi(p.build(), 'R').artboard;
    expect(ab.width).toBe(100);
    expect(ab.height).toBe(100);
    const [n] = paths(ab.children);
    // (50,50)-(70,70) in a trim box starting at (40,40), turned a quarter clockwise on a 100 box
    expect(n.width).toBe(20);
    expect(n.x).toBe(10);
    expect(n.y).toBe(10);
  });

  it('maps axial and radial shadings from patterns and sh to linear and radial gradients', () => {
    const p = new Pdf();
    const fn = p.add('<< /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >>');
    const axial = p.add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 100 0] /Function ${fn} 0 R /Extend [true true] >>`);
    const radial = p.add(`<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [50 50 0 50 50 50] /Function ${fn} 0 R >>`);
    const pa = p.add(`<< /PatternType 2 /Shading ${axial} 0 R >>`);
    const pr = p.add(`<< /PatternType 2 /Shading ${radial} 0 R >>`);
    p.page(
      '/Pattern cs /P1 scn 0 0 100 100 re f\n/Pattern cs /P2 scn 100 0 100 100 re f\nq 0 0 100 100 re W n /S1 sh Q',
      `/Pattern << /P1 ${pa} 0 R /P2 ${pr} 0 R >> /Shading << /S1 ${axial} 0 R >>`,
      [0, 0, 200, 100],
    );
    const r = importAi(p.build());
    const [a, b, c] = paths(r.artboard.children);
    expect(a.fill?.type).toBe('linear');
    const la = a.fill as { angle: number; stops: { offset: number; color: string }[] };
    expect(la.angle).toBe(90); // left to right
    expect(la.stops[0]).toEqual({ offset: 0, color: '#ff0000' });
    expect(la.stops.at(-1)).toEqual({ offset: 1, color: '#0000ff' });
    expect(b.fill?.type).toBe('radial');
    const rb = b.fill as { stops: { offset: number; color: string }[] };
    expect(rb.stops[0].color).toBe('#ff0000');
    expect(rb.stops.at(-1)!.color).toBe('#0000ff');
    expect(c.fill?.type).toBe('linear');
  });

  it('gives a stitched gradient its inner stops', () => {
    const p = new Pdf();
    const f1 = p.add('<< /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 1 0] /N 1 >>');
    const f2 = p.add('<< /FunctionType 2 /Domain [0 1] /C0 [0 1 0] /C1 [0 0 1] /N 1 >>');
    const st = p.add(`<< /FunctionType 3 /Domain [0 1] /Functions [${f1} 0 R ${f2} 0 R] /Bounds [0.25] /Encode [0 1 0 1] >>`);
    const sh = p.add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 0 100] /Function ${st} 0 R >>`);
    const pat = p.add(`<< /PatternType 2 /Shading ${sh} 0 R >>`);
    p.page('/Pattern cs /P scn 0 0 100 100 re f', `/Pattern << /P ${pat} 0 R >>`, [0, 0, 100, 100]);
    const [n] = paths(importAi(p.build()).artboard.children);
    const g = n.fill as { type: string; angle: number; stops: { offset: number; color: string }[] };
    // PDF y is up, so a gradient from y=0 to y=100 runs from the bottom up: "to top" is 0 degrees
    expect(g.angle).toBe(0);
    expect(g.stops).toHaveLength(3);
    expect(g.stops[1].offset).toBeCloseTo(0.25, 2);
    expect(g.stops[1].color).toBe('#00ff00');
  });

  it('puts Illustrator layers (optional content) in named groups and hides the ones that are off', () => {
    const p = new Pdf();
    const on = p.add('<< /Type /OCG /Name (Background) >>');
    const off = p.add('<< /Type /OCG /Name (Guides) >>');
    p.catalogExtra = `/OCProperties << /OCGs [${on} 0 R ${off} 0 R] /D << /OFF [${off} 0 R] >> >>`;
    p.page('/OC /MC0 BDC 1 0 0 rg 0 0 10 10 re f EMC\n/OC /MC1 BDC 0 0 1 rg 20 0 10 10 re f EMC', `/Properties << /MC0 ${on} 0 R /MC1 ${off} 0 R >>`);
    const kids = importAi(p.build()).artboard.children as GroupNode[];
    expect(kids.map((k) => k.name)).toEqual(['Background', 'Guides']);
    expect(kids[0].visible).toBe(true);
    expect(kids[1].visible).toBe(false);
    expect(kids[0].children[0].type).toBe('path');
  });

  it('plays form XObjects in place and wraps transparency groups that have opacity', () => {
    const p = new Pdf();
    const form = p.stream('/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Group << /S /Transparency >>', '1 0 0 rg 0 0 10 10 re f');
    const plain = p.stream('/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Matrix [1 0 0 1 100 0]', '0 1 0 rg 0 0 10 10 re f');
    p.page('/G gs /Fm Do /Pl Do', `/ExtGState << /G << /ca 0.5 >> >> /XObject << /Fm ${form} 0 R /Pl ${plain} 0 R >>`);
    const kids = importAi(p.build()).artboard.children;
    expect(kids).toHaveLength(2);
    const g = kids[0] as GroupNode;
    expect(g.type).toBe('group');
    expect(g.opacity).toBe(0.5);
    const inner = g.children[0] as PathNode;
    expect(inner.fill).toEqual({ type: 'solid', color: '#ff0000' }); // no double opacity inside
    const pl = kids[1] as PathNode;
    expect(pl.type).toBe('path');
    expect(pl.x).toBe(100);
    expect(pl.fill).toEqual({ type: 'solid', color: 'rgba(0, 255, 0, 0.5)' });
  });

  it('imports pictures as assets: raw/Flate samples as PNG, JPEG untouched, stencils in the fill colour', () => {
    const p = new Pdf();
    const raw = zlibSync(Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]));
    const img = p.stream('/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode', raw);
    const jpg = p.stream('/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]));
    const stencil = p.stream('/Type /XObject /Subtype /Image /Width 8 /Height 1 /ImageMask true /BitsPerComponent 1', Uint8Array.from([0b01010101]));
    p.page('q 40 0 0 20 10 10 cm /Im Do Q q 20 0 0 20 100 10 cm /Jp Do Q 0 0 1 rg q 16 0 0 2 150 10 cm /St Do Q', `/XObject << /Im ${img} 0 R /Jp ${jpg} 0 R /St ${stencil} 0 R >>`);
    const r = importAi(p.build());
    const imgs = flat(r.artboard.children).filter((n): n is ImageNode => n.type === 'image');
    expect(imgs).toHaveLength(3);
    expect(imgs[0].x).toBe(10);
    expect(imgs[0].y).toBe(70);
    expect(imgs[0].width).toBe(40);
    expect(imgs[0].height).toBe(20);
    const a0 = r.assets.find((a) => a.id === imgs[0].assetId)!;
    expect(a0.mime).toBe('image/png');
    expect([...a0.bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const a1 = r.assets.find((a) => a.id === imgs[1].assetId)!;
    expect(a1.mime).toBe('image/jpeg');
    expect(a1.bytes[0]).toBe(0xff);
    expect(r.assets.find((a) => a.id === imgs[2].assetId)!.mime).toBe('image/png');
  });

  it('reads Flate-compressed content streams and rebuilds a damaged cross-reference table', () => {
    const p = new Pdf();
    p.page(zlibSync(enc.encode('0 1 0 rg 5 5 20 20 re f')), '', [0, 0, 200, 100], '', '/Filter /FlateDecode');
    const good = importAi(p.build());
    expect(paths(good.artboard.children)).toHaveLength(1);
    const broken = importAi(p.build({ startxref: 7 }));
    expect(paths(broken.artboard.children)[0].fill).toEqual({ type: 'solid', color: '#00ff00' });
  });

  it('warns about what it leaves out', () => {
    const p = new Pdf();
    const tile = p.stream('/PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 4 4] /XStep 4 /YStep 4 /Resources << >>', '0 0 2 2 re f');
    p.page('/Pattern cs /T scn 0 0 50 50 re f /G gs 1 0 0 rg 60 0 10 10 re f', `/Pattern << /T ${tile} 0 R >> /ExtGState << /G << /SMask << /S /Luminosity >> /BM /Hue >> >>`);
    const r = importAi(p.build());
    expect(r.warnings.join('\n')).toMatch(/tiling/i);
    expect(r.warnings.join('\n')).toMatch(/soft mask|opacity mask/i);
    expect(r.warnings.join('\n')).toMatch(/Hue/);
  });

  it('explains a file that has no PDF part', () => {
    const ps = enc.encode('%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Adobe Illustrator(R) 8.0\n%%BoundingBox: 0 0 100 100\n');
    expect(hasPdf(ps)).toBe(false);
    expect(() => importAi(ps, 'old')).toThrow(/Create PDF Compatible File/);
    expect(() => importAi(new Uint8Array([1, 2, 3]), 'x')).toThrow(/Create PDF Compatible File/);
  });

  it('explains an Illustrator file saved without PDF content (an empty page)', () => {
    expect(() => importAi(one(''), 'empty')).toThrow(/Create PDF Compatible File/);
  });

  it('recognises the note Illustrator puts on the page when a file was saved without PDF compatibility', () => {
    const p = new Pdf();
    const font = p.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    p.page('BT /F1 12 Tf 10 50 Td (This is an Adobe Illustrator File that was saved without PDF Content.) Tj ET', `/Font << /F1 ${font} 0 R >>`);
    expect(() => importAi(p.build(), 'note')).toThrow(/Create PDF Compatible File/);
  });

  it('refuses encrypted files', () => {
    const p = new Pdf();
    p.page('0 0 1 1 re f');
    const bytes = p.build();
    const text = new TextDecoder('latin1').decode(bytes).replace('/Root 1 0 R', '/Root 1 0 R /Encrypt << >>');
    expect(() => importAi(Uint8Array.from(text, (c) => c.charCodeAt(0)), 'e')).toThrow(/encrypted/);
  });
  it('keeps hairlines (width 0 or a hundredth of a point) visible', () => {
    const r = importAi(one('0 0 0 RG 0 w 10 10 m 100 10 l S 0.02 w 10 20 m 100 20 l S 2 w 10 30 m 100 30 l S'));
    expect(paths(r.artboard.children).map((n) => n.stroke?.width)).toEqual([0.25, 0.25, 2]);
  });

  it('lays a shading painted through a clip over the clip, and a radial one that does not extend over its own circle', () => {
    const p = new Pdf();
    const fn = p.add('<< /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [0 0 0] /N 1 >>');
    const sh = p.add(`<< /ShadingType 3 /ColorSpace /DeviceRGB /Coords [150 50 0 150 50 40] /Function ${fn} 0 R /Extend [false false] >>`);
    const ax = p.add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [10 0 60 0] /Function ${fn} 0 R /Extend [true true] >>`);
    // a stray line makes the clip's bounds bigger than the circle; the radial gradient still sits on the circle
    p.page('q 0 0 m 190 90 l 190 10 l 110 10 l 110 90 l h W n /S1 sh Q q 10 10 50 50 re W n /S2 sh Q', `/Shading << /S1 ${sh} 0 R /S2 ${ax} 0 R >>`, [0, 0, 200, 100]);
    const g = paths(importAi(p.build()).artboard.children);
    const radial = g.find((n) => n.fill?.type === 'radial')!;
    expect(radial.width).toBeCloseTo(80, 0);
    expect(radial.height).toBeCloseTo(80, 0);
    const lin = g.find((n) => n.fill?.type === 'linear')!;
    expect([lin.x, lin.y, lin.width, lin.height]).toEqual([10, 40, 50, 50]);
  });
});
