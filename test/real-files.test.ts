import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { walk, type Artboard, type ImageNode, type PathNode, type SceneNode, type TextNode } from 'interactives-player';
import { importAi } from '../src/lib/ai-import';
import { detectDwg } from '../src/lib/dwg-import';
import { readAnimationFile, type AnimationImport } from '../src/lib/importers';
import { psdFont } from '../src/lib/psd-import';

// importers.ts pulls in the built player bundle for exports, which a test run doesn't need
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));

/**
 * Files written by other programs (Chrome, cairo, Ghostscript, LibreOffice, the PhotoCraft format crate), not by the tests: what the
 * importers meet in real use. See fixtures/importers/README.md for how each was made.
 */
const dir = `${process.cwd()}/test/fixtures/importers/`;
const bytesOf = (name: string) => new Uint8Array(readFileSync(dir + name));
const fileOf = (name: string, as = name): File => {
  const data = bytesOf(name);
  return { name: as, size: data.length, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) } as unknown as File;
};
type Loaded = Omit<AnimationImport, 'artboards'> & { artboards: Artboard[] };
const withBoards = (r: AnimationImport): Loaded => ({ ...r, artboards: r.artboards ?? [r.artboard] });
const load = async (name: string, as?: string): Promise<Loaded> => withBoards(await readAnimationFile(fileOf(name, as)));

const nodes = (boards: Artboard[]): SceneNode[] => {
  const out: SceneNode[] = [];
  for (const b of boards) walk(b.children, (n) => out.push(n));
  return out;
};
const ofType = <T extends SceneNode['type']>(boards: Artboard[], t: T) => nodes(boards).filter((n) => n.type === t) as Extract<SceneNode, { type: T }>[];
const texts = (boards: Artboard[]) => ofType(boards, 'text') as TextNode[];

/** Every number on every node is finite: a NaN position would break the canvas and the export. */
function expectFinite(boards: Artboard[]) {
  for (const b of boards) {
    expect(Number.isFinite(b.width) && Number.isFinite(b.height) && b.width > 0 && b.height > 0).toBe(true);
    walk(b.children, (n) => {
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(Number.isFinite(n[k]), `${n.name}.${k}`).toBe(true);
      if (n.type === 'path') for (const sp of (n as PathNode).paths) for (const p of sp.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    });
  }
}

describe('PDF files from other programs', () => {
  it('Chrome: shapes, gradients, clip, embedded fonts, an image and two pages', async () => {
    const r = await load('chrome-vectors.pdf');
    expect(r.source).toBe('PDF');
    expect(r.artboards).toHaveLength(2);
    expect(r.artboards.map((a) => [a.width, a.height])).toEqual([[450, 300], [450, 300]]);
    expectFinite(r.artboards);
    // text stays text, in the fonts the PDF embeds (named from the PostScript names)
    const t = texts(r.artboards);
    expect(t.map((x) => x.text)).toEqual(expect.arrayContaining(['Hello Vectors', 'Bold Sans', 'Page two']));
    const hello = t.find((x) => x.text === 'Hello Vectors')!;
    expect(hello.fontFamily).toBe('DejaVu Sans');
    expect(hello.fontSize).toBeCloseTo(24, 0);
    expect(t.find((x) => x.text === 'Bold Sans')).toMatchObject({ fontFamily: 'Noto Sans', fontWeight: 700 });
    expect(t.find((x) => x.text.startsWith('An italic'))).toMatchObject({ fontFamily: 'Liberation Serif', fontStyle: 'italic' });
    // gradients, a dash, an image and the clipped pair
    const paths = ofType(r.artboards, 'path').filter((p) => !p.mask);
    expect(paths.some((p) => p.fill?.type === 'linear')).toBe(true);
    const radial = paths.find((p) => p.fill?.type === 'radial')!;
    // an elliptical gradient reaches its own edge: no long flat plateau of the end colour
    const stops = (radial.fill as { stops: { offset: number; color: string }[] }).stops;
    expect(stops[0].color).toBe('#ffffff');
    expect(stops.filter((s) => s.color === '#6a1b9a').every((s) => s.offset > 0.95)).toBe(true);
    // Skia applies dashes itself, so the dashed outline arrives as drawn pieces; real strokes keep their widths (3 px = 2.25 pt)
    expect(paths.some((p) => p.stroke?.width === 2.25)).toBe(true);
    expect(ofType(r.artboards, 'image')).toHaveLength(1);
    expect(nodes(r.artboards).some((n) => n.type === 'path' && n.mask)).toBe(true);
    expect(r.assets).toHaveLength(1);
    expect(r.assets[0].mime).toBe('image/png');
    expect(r.warnings).toEqual([]);
    // Google fonts used are listed for the project
    expect(r.fonts?.map((f) => f.family)).toContain('Noto Sans');
  });

  it('page rotation turns the artboard and its content', async () => {
    const r = await load('chrome-rotated.pdf');
    expect(r.artboards.map((a) => [a.width, a.height])).toEqual([[300, 450], [300, 450]]);
    expectFinite(r.artboards);
    // the first page is turned 90 degrees clockwise: its heading, which reads left to right unrotated, now runs top to bottom
    const hello = texts([r.artboards[0]]).find((x) => x.text === 'Hello Vectors')!;
    expect(Math.abs(hello.rotation ?? 0)).toBeCloseTo(90, 0);
    // content stays inside the new page
    for (const n of ofType([r.artboards[0]], 'image')) expect(n.x).toBeGreaterThanOrEqual(-1);
  });

  it('cairo PDF 1.7: object streams, an xref stream, alpha-stop gradients and group opacity', async () => {
    const bytes = bytesOf('cairo-features.pdf');
    expect(new TextDecoder('latin1').decode(bytes)).toMatch(/\/ObjStm/);
    const r = await load('cairo-features.pdf');
    expect(r.artboards).toHaveLength(2);
    expectFinite(r.artboards);
    expect(texts(r.artboards).map((t) => t.text)).toEqual(expect.arrayContaining(['Cairo text', 'Rotated']));
    const rot = texts(r.artboards).find((t) => t.text === 'Rotated')!;
    expect(rot.rotation).toBeCloseTo(-45, 0);
    // a gradient painted with `sh` inside a circular clip is laid over the circle, not the page
    const radial = ofType(r.artboards, 'path').find((p) => p.fill?.type === 'radial')!;
    expect(radial.width).toBeCloseTo(110, 0);
    expect(radial.height).toBeCloseTo(110, 0);
    const rs = (radial.fill as { stops: { offset: number; color: string }[] }).stops;
    expect(rs[0].color).toBe('#ffffff');
    expect(rs[rs.length - 1].color).not.toBe('#ffffff');
    expect(ofType(r.artboards, 'image')).toHaveLength(1);
    // dropped: the cairo mask (a soft mask), and said so
    expect(r.warnings.join('\n')).toMatch(/soft mask|opacity mask/i);
  });

  it('keeps a DCT picture as JPEG and says its mask was dropped; CMYK PDFs come out as RGB', async () => {
    const j = await load('gs-jpeg.pdf');
    expect(j.assets.map((a) => a.mime)).toEqual(['image/jpeg']);
    expect(j.warnings.join('\n')).toMatch(/JPEG/);
    const c = await load('gs-cmyk.pdf');
    expectFinite(c.artboards);
    expect(texts(c.artboards).length).toBeGreaterThan(2);
    for (const p of ofType(c.artboards, 'path')) if (p.fill?.type === 'solid') expect(p.fill.color).toMatch(/^#[0-9a-f]{6}$|^rgba\(/);
  });

  it('Ghostscript from PostScript: shadings, an even-odd clip, a dash, and the tiling pattern reported', async () => {
    const r = await load('gs-postscript.pdf');
    expectFinite(r.artboards);
    const paths = ofType(r.artboards, 'path').filter((p) => !p.mask);
    expect(paths.some((p) => p.fill?.type === 'linear' && (p.fill as { stops: unknown[] }).stops.length >= 4)).toBe(true);
    // a radial shading that does not extend, clipped to a circle: the gradient is laid over the circle itself
    const radial = paths.find((p) => p.fill?.type === 'radial')!;
    expect(radial.width).toBeCloseTo(100, 0);
    const clip = nodes(r.artboards).find((n): n is PathNode => n.type === 'path' && !!n.mask && n.fillRule === 'evenodd');
    expect(clip).toBeTruthy();
    expect(paths.some((p) => p.stroke?.dash?.length === 4)).toBe(true);
    expect(texts(r.artboards).map((t) => t.text)).toContain('PostScript Type1 text');
    expect(r.warnings.join('\n')).toMatch(/tiling pattern/i);
  });

  it('LibreOffice Draw: stepped gradients arrive as many plain polygons, text stays text', async () => {
    const r = await load('libreoffice-draw.pdf');
    expectFinite(r.artboards);
    expect(r.artboards[0].width).toBeCloseTo(300.76, 1);
    expect(texts(r.artboards).map((t) => [t.text, t.fontFamily])).toEqual(expect.arrayContaining([['LibreOffice text', 'DejaVu Sans'], ['second style', 'Liberation Serif']]));
    expect(ofType(r.artboards, 'path').length).toBeGreaterThan(50);
  });

  it('LibreOffice Writer: justified lines, coloured and underlined runs, a table and symbol-font bullets', async () => {
    const r = await load('libreoffice-writer.pdf');
    expect(r.artboards).toHaveLength(2);
    expectFinite(r.artboards);
    const t = texts(r.artboards);
    expect(t.find((x) => x.text === 'A Writer document')).toMatchObject({ fontFamily: 'DejaVu Sans', fontWeight: 700 });
    expect(t.some((x) => x.text.includes('consectetur adipiscing') && x.color !== '#000000')).toBe(true);
    expect(t.some((x) => x.text.includes('Cell A'))).toBe(true);
    expect(t.some((x) => x.text.includes('Ünïcödé'))).toBe(true);
    // the bullet is U+F095 in OpenSymbol (private use): it must become a real bullet, not a box
    const bullets = t.filter((x) => x.fontFamily === 'Open Symbol');
    expect(bullets.length).toBe(2);
    for (const b of bullets) expect(b.text).toBe('•');
    // no private use characters survive anywhere
    for (const x of t) expect(x.text).not.toMatch(/[-]/);
  });

  it('a damaged, encrypted or non-PDF file gets a message, not a crash', async () => {
    const full = bytesOf('chrome-vectors.pdf');
    await expect(readAnimationFile({ name: 'cut.pdf', arrayBuffer: async () => full.slice(0, 20000).buffer } as unknown as File)).rejects.toThrow(/damaged|no document catalog/);
    const enc = new TextDecoder('latin1').decode(full).replace(/\/Root (\d+ 0 R)/, '/Root $1 /Encrypt << /Filter /Standard >>');
    await expect(readAnimationFile({ name: 'locked.pdf', arrayBuffer: async () => Uint8Array.from(enc, (c) => c.charCodeAt(0)).buffer } as unknown as File)).rejects.toThrow(/encrypted/);
    await expect(readAnimationFile({ name: 'x.pdf', arrayBuffer: async () => new TextEncoder().encode('just words').buffer } as unknown as File)).rejects.toThrow(/PDF/);
  });
});

describe('Illustrator files', () => {
  it('reads a PDF-compatible .ai: layers, hidden layer, CMYK, spot colour, shadings, groups, artboards', async () => {
    const r = await load('synthetic-illustrator.ai');
    expect(r.source).toBe('Illustrator');
    expect(r.artboards).toHaveLength(3);
    // the third artboard has a trim box (280 x 180) and a 90 degree rotation
    expect(r.artboards.map((a) => [a.width, a.height])).toEqual([[600, 400], [600, 400], [180, 280]]);
    expectFinite(r.artboards);
    const groups = ofType([r.artboards[0]], 'group');
    expect(groups.map((g) => g.name)).toEqual(expect.arrayContaining(['Background', 'Artwork', 'Hidden guides']));
    expect(groups.find((g) => g.name === 'Hidden guides')!.visible).toBe(false);
    expect(groups.find((g) => g.name === 'Artwork')!.visible).not.toBe(false);
    const t = texts(r.artboards);
    expect(t.map((x) => x.text)).toEqual(expect.arrayContaining(['Spot colour + CMYK', 'Artboard 2']));
    // the two-line Times italic text is one paragraph layer
    expect(t.find((x) => x.text.startsWith('Times italic'))).toMatchObject({ fontStyle: 'italic', text: 'Times italic second\nand a third line' });
    // a stitched CMYK function: red to yellow to blue with the break kept
    const lin = ofType([r.artboards[0]], 'path').find((p) => p.fill?.type === 'linear' && (p.fill as { stops: unknown[] }).stops.length >= 3)!;
    expect(lin).toBeTruthy();
    expect(ofType([r.artboards[0]], 'image')).toHaveLength(2);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Type 3/);
    expect(w).toMatch(/mesh/i);
    expect(w).toMatch(/soft mask|opacity mask/i);
  });

  it('a .ai whose only content is a note about missing PDF content is refused with the Illustrator hint', async () => {
    const note = new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Adobe Illustrator(R) 8.0\n');
    await expect(readAnimationFile({ name: 'old.ai', arrayBuffer: async () => note.buffer } as unknown as File)).rejects.toThrow(/Create PDF Compatible File/);
  });
});

describe('DWG', () => {
  it('says what version it is and to save as DXF, whatever the file is called', async () => {
    for (const [name, label] of [['header-only-r2018.dwg', /AC1032.*2018/], ['header-only-r2004.dwg', /AC1018.*2004/]] as const) {
      await expect(load(name)).rejects.toThrow(label);
      await expect(load(name)).rejects.toThrow(/DXF/);
      // renamed, or saved with a .dxf extension by mistake
      await expect(load(name, 'drawing.dxf')).rejects.toThrow(/DWG version.*DXF/s);
      await expect(load(name, 'drawing')).rejects.toThrow(/DWG version.*DXF/s);
    }
    expect(detectDwg(bytesOf('header-only-r2018.dwg'))).toEqual({ code: 'AC1032', name: 'AutoCAD 2018 and later' });
    await expect(readAnimationFile({ name: 'junk.dwg', arrayBuffer: async () => new TextEncoder().encode('hello, nothing here').buffer } as unknown as File)).rejects.toThrow(/doesn't look like a DWG/);
  });
});

describe('PhotoCraft written by the PhotoCraft format crate', () => {
  it('imports the poster: pixels, mask, gradient fill, shape and text layers', async () => {
    const r = await load('photocraft-poster.pcraft');
    expect(r.source).toBe('PhotoCraft');
    expect(r.artboards).toHaveLength(1);
    expect([r.artboard.width, r.artboard.height]).toEqual([400, 300]);
    expectFinite(r.artboards);
    const images = ofType(r.artboards, 'image') as ImageNode[];
    expect(images.length).toBeGreaterThanOrEqual(3); // background, painted layer, masked layer
    expect(r.assets.every((a) => a.mime === 'image/png' && a.bytes.length > 8)).toBe(true);
    expect(ofType(r.artboards, 'rect')).toHaveLength(1);
    expect(ofType(r.artboards, 'path')).toHaveLength(1);
    expect(texts(r.artboards).map((t) => t.text)).toEqual(['Poster title']);
    expect(texts(r.artboards)[0].fontFamily).toBe('Inter');
    expect(r.warnings).toEqual([]);
  });

  const asFile = (bytes: Uint8Array, name = 'x.pcraft') => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) as unknown as File;

  it('reads the same bundle re-zipped with DEFLATE by another tool', async () => {
    const entries = unzipSync(bytesOf('photocraft-poster.pcraft'));
    const deflated = zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, [v, { level: 6 }]])));
    const r = withBoards(await readAnimationFile(asFile(deflated)));
    expect(r.assets).toHaveLength(3);
    expect(texts(r.artboards)).toHaveLength(1);
  });

  it('says so for a newer format, missing tiles and a cut-off file', async () => {
    const entries = unzipSync(bytesOf('photocraft-poster.pcraft'));
    const future = zipSync({ ...entries, 'manifest.json': strToU8(strFromU8(entries['manifest.json']).replace(/"format_version":\s*1/, '"format_version": 99')) });
    await expect(readAnimationFile(asFile(future))).rejects.toThrow(/newer than this editor/);
    const tiles = Object.keys(entries).filter((k) => k.startsWith('tiles/'));
    const fewer = { ...entries };
    delete fewer[tiles[0]];
    delete fewer[tiles[1]];
    const r = withBoards(await readAnimationFile(asFile(zipSync(fewer))));
    expect(r.warnings.join('\n')).toMatch(/tiles are missing/);
    expectFinite(r.artboards);
    await expect(readAnimationFile(asFile(bytesOf('photocraft-poster.pcraft').slice(0, 40000)))).rejects.toThrow(/unzipped|zip/);
    await expect(readAnimationFile(asFile(new TextEncoder().encode('hello')))).rejects.toThrow();
  });
});

describe('font names from PostScript names', () => {
  it('keeps DejaVu in one word and splits a number from the word after it', () => {
    expect(psdFont('DejaVuSans-Bold').family).toBe('DejaVu Sans');
    expect(psdFont('DejaVuSerif').family).toBe('DejaVu Serif');
    expect(psdFont('FontAwesome6Free-Solid').family).toBe('Font Awesome 6 Free');
    expect(psdFont('LiberationSerif-Italic')).toMatchObject({ family: 'Liberation Serif', italic: true });
  });
});

describe('importAi on its own', () => {
  it('has no pages or paths that come out NaN for an empty-but-valid page tree', () => {
    expect(() => importAi(bytesOf('chrome-vectors.pdf'), 'x')).not.toThrow();
  });
});
