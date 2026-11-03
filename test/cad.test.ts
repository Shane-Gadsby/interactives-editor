import { describe, expect, it } from 'vitest';
import type { GroupNode, PathNode, SceneNode, TextNode } from 'interactives-player';
import { aciColor, importDxf, mtextToPlain, trueColor } from '../src/lib/dxf-import';
import { isAsciiDxf, isBinaryDxf, parseDxf } from '../src/lib/dxf-parse';
import { detectDwg, dwgMessage, importDwg } from '../src/lib/dwg-import';
import { KIND_LABEL, designKind, isDesignFile } from '../src/lib/links';

// ---------------------------------------------------------------- tiny DXF writers

type Kv = string | number;
const lines = (kv: Kv[]) => kv.map(String).join('\n') + '\n';
/** A record: `rec('LINE', 8, 'A', 10, 0, ...)` writes "0 / LINE / 8 / A / 10 / 0 ...". */
const rec = (type: string, ...kv: Kv[]) => lines([0, type, ...kv]);
const hv = (name: string, ...kv: Kv[]) => lines([9, name, ...kv]);
const section = (name: string, body: string) => `0\nSECTION\n2\n${name}\n${body}0\nENDSEC\n`;
const table = (name: string, body: string) => rec('TABLE', 2, name, 70, 0) + body + rec('ENDTAB');
const layer = (name: string, color = 7, flags = 0, extra: Kv[] = []) => rec('LAYER', 2, name, 70, flags, 62, color, 6, 'Continuous', ...extra);
const block = (name: string, body: string, bx = 0, by = 0) => rec('BLOCK', 8, '0', 2, name, 70, 0, 10, bx, 20, by, 3, name) + body + rec('ENDBLK', 8, '0');

interface Doc {
  header?: string;
  tables?: string;
  blocks?: string;
  entities: string;
}
const dxf = (d: Doc): Uint8Array =>
  new TextEncoder().encode(
    section('HEADER', hv('$ACADVER', 1, 'AC1027') + (d.header ?? '')) +
      (d.tables ? section('TABLES', d.tables) : '') +
      (d.blocks ? section('BLOCKS', d.blocks) : '') +
      section('ENTITIES', d.entities) +
      '0\nEOF\n',
  );

// ---------------------------------------------------------------- reading the result back

const abOf = (bytes: Uint8Array, name = 'plan') => importDxf(bytes, name);
const groups = (kids: SceneNode[]) => kids.filter((n): n is GroupNode => n.type === 'group');
const layerNamed = (imp: ReturnType<typeof abOf>, name: string): GroupNode => {
  const g = groups(imp.artboard.children).find((x) => x.name === name);
  if (!g) throw new Error(`no layer ${name}: ${groups(imp.artboard.children).map((x) => x.name).join(', ')}`);
  return g;
};
const paths = (g: GroupNode) => g.children.filter((n): n is PathNode => n.type === 'path');
/** The points of a path node, in artboard px. */
const abs = (g: GroupNode, p: PathNode) => p.paths.map((s) => s.points.map((q) => ({ x: g.x + p.x + q.x, y: g.y + p.y + q.y, in: q.in, out: q.out })));
/** px to drawing units for a drawing whose extents are x0..x0+size (the longest side fitted to 1600 with a 20 px margin). */
const unit = (size: number) => (px: number) => ((px - 20) * size) / 1600;

describe('dxf parser', () => {
  it('reads sections, layers, blocks and entities', () => {
    const doc = parseDxf(
      dxf({
        header: hv('$INSUNITS', 70, 4),
        tables: table('LAYER', layer('WALLS', 1)),
        blocks: block('B', rec('LINE', 8, '0', 10, 0, 20, 0, 11, 1, 21, 1), 5, 6),
        entities: rec('LINE', 8, 'WALLS', 10, 0, 20, 0, 11, 10, 21, 0) + rec('POLYLINE', 8, 'WALLS', 70, 1) + rec('VERTEX', 8, 'WALLS', 10, 0, 20, 0) + rec('VERTEX', 8, 'WALLS', 10, 1, 20, 0) + rec('SEQEND'),
      }),
    );
    expect(doc.version).toBe('AC1027');
    expect(doc.header.get('$INSUNITS')?.num(70)).toBe(4);
    expect(doc.layers.get('walls')?.color).toBe(1);
    expect(doc.blocks.get('b')?.base).toEqual({ x: 5, y: 6 });
    expect(doc.blocks.get('b')?.ents).toHaveLength(1);
    expect(doc.model.map((e) => e.type)).toEqual(['LINE', 'POLYLINE']);
    expect(doc.model[1].kids).toHaveLength(2);
  });

  it('rejects things that are not DXF', () => {
    expect(() => importDxf(new TextEncoder().encode('hello world'), 'x')).toThrow(/DXF/);
    expect(isAsciiDxf(new TextEncoder().encode('0\nSECTION\n2\nHEADER\n'))).toBe(true);
    expect(isAsciiDxf(new TextEncoder().encode('AC1032'))).toBe(false);
  });

  it('reads CRLF files and comments before the first section', () => {
    const text = '999\nmade by a test\n' + new TextDecoder().decode(dxf({ entities: rec('LINE', 8, '0', 10, 0, 20, 0, 11, 5, 21, 5) }));
    const imp = importDxf(new TextEncoder().encode(text.replace(/\n/g, '\r\n')), 'x');
    expect(paths(layerNamed(imp, '0'))).toHaveLength(1);
  });

  it('reads binary DXF', () => {
    const out: number[] = [];
    for (const c of 'AutoCAD Binary DXF\r\n\x1a\0') out.push(c.charCodeAt(0));
    const dv = new DataView(new ArrayBuffer(8));
    const str = (code: number, s: string) => {
      out.push(code & 255, code >> 8);
      for (const c of s) out.push(c.charCodeAt(0));
      out.push(0);
    };
    const dbl = (code: number, v: number) => {
      out.push(code & 255, code >> 8);
      dv.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) out.push(dv.getUint8(i));
    };
    const i16 = (code: number, v: number) => {
      out.push(code & 255, code >> 8, v & 255, (v >> 8) & 255);
    };
    str(0, 'SECTION');
    str(2, 'ENTITIES');
    str(0, 'LINE');
    str(8, 'BIN');
    i16(62, 3);
    dbl(10, 0);
    dbl(20, 0);
    dbl(11, 100);
    dbl(21, 50);
    str(0, 'ENDSEC');
    str(0, 'EOF');
    const bytes = new Uint8Array(out);
    expect(isBinaryDxf(bytes)).toBe(true);
    const imp = importDxf(bytes, 'bin');
    const g = layerNamed(imp, 'BIN');
    const p = paths(g)[0];
    expect(p.stroke?.paint).toEqual({ type: 'solid', color: '#00ff00' });
    expect(imp.artboard.width).toBe(1640);
  });
});

describe('dxf geometry', () => {
  it('draws a line on a named layer, fitted and flipped', () => {
    const imp = abOf(dxf({ tables: table('LAYER', layer('WALLS', 1)), entities: rec('LINE', 8, 'WALLS', 10, 0, 20, 0, 11, 100, 21, 50) }), 'house');
    expect(imp.artboard.name).toBe('house');
    // longest side (100) is 1600 px, plus a 20 px margin each side
    expect(imp.artboard.width).toBe(1640);
    expect(imp.artboard.height).toBe(840);
    const g = layerNamed(imp, 'WALLS');
    const p = paths(g)[0];
    expect(p.stroke?.paint).toEqual({ type: 'solid', color: '#ff0000' });
    expect(p.stroke?.width).toBe(1);
    const [a, b] = abs(g, p)[0];
    expect(a.x).toBeCloseTo(20);
    expect(a.y).toBeCloseTo(820); // y up in CAD, down on screen: (0,0) is at the bottom
    expect(b.x).toBeCloseTo(1620);
    expect(b.y).toBeCloseTo(20);
  });

  it('turns a bulge into an arc', () => {
    // a bulge of 1 is a half circle: 10 wide, 5 high, bulging to the right of the direction of travel for a negative sign
    const imp = abOf(dxf({ entities: rec('LWPOLYLINE', 8, '0', 90, 2, 70, 0, 10, 0, 20, 0, 42, 1, 10, 10, 20, 0) + rec('LINE', 8, '0', 10, 0, 20, -5, 11, 10, 21, -5) }));
    const g = layerNamed(imp, '0');
    const poly = paths(g).find((p) => p.name === 'Polyline')!;
    const pts = abs(g, poly)[0];
    expect(pts.length).toBeGreaterThan(2); // more than the two vertices: the arc has its own points
    expect(pts[0].x).toBeCloseTo(20);
    expect(pts[pts.length - 1].x).toBeCloseTo(1620);
    // positive bulge: counter-clockwise from (0,0) to (10,0) goes below the chord in CAD (y down on screen = larger y)
    const lowest = Math.max(...pts.map((q) => q.y));
    expect(lowest).toBeGreaterThan(pts[0].y + 700);
    // the bezier handles are present
    expect(pts.some((q) => q.out)).toBe(true);
  });

  it('closes polylines, with a closing bulge', () => {
    const imp = abOf(dxf({ entities: rec('LWPOLYLINE', 8, '0', 90, 4, 70, 1, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 10, 10, 0, 20, 10) }));
    const p = paths(layerNamed(imp, '0'))[0];
    expect(p.paths[0].closed).toBe(true);
    expect(p.paths[0].points).toHaveLength(4);
  });

  it('draws circles and arcs', () => {
    const imp = abOf(dxf({ entities: rec('CIRCLE', 8, '0', 10, 0, 20, 0, 40, 50) + rec('ARC', 8, '0', 10, 0, 20, 0, 40, 50, 50, 0, 51, 90) }));
    const g = layerNamed(imp, '0');
    const circle = paths(g).find((p) => p.name === 'Circle')!;
    const arc = paths(g).find((p) => p.name === 'Arc')!;
    expect(circle.paths[0].closed).toBe(true);
    expect(circle.paths[0].points).toHaveLength(4);
    expect(circle.width).toBeCloseTo(1600, 0);
    expect(circle.height).toBeCloseTo(1600, 0);
    // the quarter arc from east to north is the top right quarter
    expect(arc.width).toBeCloseTo(800, 0);
    expect(arc.height).toBeCloseTo(800, 0);
    expect(g.x + arc.x).toBeCloseTo(820, 0);
    expect(g.y + arc.y).toBeCloseTo(20, 0);
  });

  it('draws an elliptical arc', () => {
    const imp = abOf(dxf({ entities: rec('ELLIPSE', 8, '0', 10, 0, 20, 0, 11, 100, 21, 0, 40, 0.5, 41, 0, 42, Math.PI * 2) }));
    const p = paths(layerNamed(imp, '0'))[0];
    expect(p.width).toBeCloseTo(1600, 0);
    expect(p.height).toBeCloseTo(800, 0);
    expect(p.paths[0].closed).toBe(true);
  });

  it('approximates a cubic spline with one bezier per span', () => {
    const imp = abOf(
      dxf({
        entities: rec('SPLINE', 8, '0', 70, 8, 71, 3, 72, 8, 73, 4, 40, 0, 40, 0, 40, 0, 40, 0, 40, 1, 40, 1, 40, 1, 40, 1, 10, 0, 20, 0, 10, 10, 20, 20, 10, 30, 20, 20, 10, 40, 20, 0),
      }),
    );
    const g = layerNamed(imp, '0');
    const p = paths(g)[0];
    const pts = abs(g, p)[0];
    expect(pts).toHaveLength(2);
    const k = 1600 / 40; // 40 wide
    // a cubic span is exactly one bezier whose handles are the inner control points: (10, 20) from the start, (30, 20) from the end
    expect(pts[0].out!.x).toBeCloseTo(10 * k, 1);
    expect(pts[0].out!.y).toBeCloseTo(-20 * k, 1);
    expect(pts[1].in!.x).toBeCloseTo(-10 * k, 1);
    expect(pts[1].in!.y).toBeCloseTo(-20 * k, 1);
    expect(pts[1].x).toBeCloseTo(1620, 3);
  });

  it('puts a point and a solid in', () => {
    const imp = abOf(dxf({ entities: rec('POINT', 8, '0', 10, 5, 20, 5) + rec('SOLID', 8, '0', 62, 5, 10, 0, 20, 0, 11, 10, 21, 0, 12, 0, 22, 10, 13, 10, 23, 10) }));
    const g = layerNamed(imp, '0');
    const solid = paths(g).find((p) => p.name === 'Solid')!;
    expect(solid.fill).toEqual({ type: 'solid', color: '#0000ff' });
    expect(solid.stroke).toBeNull();
    // corners are taken in the order 1, 2, 4, 3: a square, not a bow tie
    expect(solid.paths[0].points.map((q) => [q.x, q.y])).toEqual([
      [0, 1600],
      [1600, 1600],
      [1600, 0],
      [0, 0],
    ]);
    expect(g.children.some((n) => n.type === 'ellipse')).toBe(true);
  });

  it('flips a circle drawn with a negative extrusion', () => {
    const imp = abOf(dxf({ entities: rec('CIRCLE', 8, '0', 10, 10, 20, 0, 210, 0, 220, 0, 230, -1, 40, 1) + rec('LINE', 8, '0', 10, -20, 20, 0, 11, 20, 21, 0) }));
    const g = layerNamed(imp, '0');
    const c = paths(g).find((p) => p.name === 'Circle')!;
    // the centre (10, 0) in the mirrored OCS is (-10, 0) in the world
    expect(g.x + c.x + c.width / 2).toBeCloseTo(20 + ((-10 + 20) / 40) * 1600, 0);
  });
});

describe('dxf text', () => {
  it('strips MTEXT formatting', () => {
    expect(mtextToPlain('{\\fArial|b0|i0;Hello} \\C1;world\\Pnext\\~line')).toBe('Hello world\nnext line');
    expect(mtextToPlain('\\S1/2;in and 12%%d')).toBe('1/2in and 12\u00b0');
    expect(mtextToPlain('\\U+00B1 5 \\L under\\l \\\\ \\{')).toBe('\u00b1 5  under \\ {');
  });

  it('places TEXT with height and rotation', () => {
    const imp = abOf(dxf({ entities: rec('TEXT', 8, '0', 10, 50, 20, 0, 40, 5, 50, 90, 1, 'Room %%c12') + rec('LINE', 8, '0', 10, 0, 20, 0, 11, 100, 21, 100) }));
    const g = layerNamed(imp, '0');
    const t = g.children.find((n): n is TextNode => n.type === 'text')!;
    expect(t.text).toBe('Room \u00d812');
    expect(t.rotation).toBeCloseTo(-90); // counter-clockwise in CAD is anticlockwise on screen
    // cap height 5 of 100 is 80 px; the font is a little larger than that
    expect(t.fontSize).toBeCloseTo(80 * 1.35, 0);
    expect(t.autoSize).toBe('width');
  });

  it('centres aligned TEXT on its alignment point and keeps MTEXT lines', () => {
    const imp = abOf(
      dxf({
        entities:
          rec('TEXT', 8, '0', 10, 0, 20, 0, 11, 50, 21, 50, 40, 4, 72, 1, 73, 2, 1, 'Mid') +
          rec('MTEXT', 8, '0', 10, 10, 20, 90, 40, 4, 41, 30, 71, 1, 1, 'line one\\Pline two') +
          rec('LINE', 8, '0', 10, 0, 20, 0, 11, 100, 21, 100),
      }),
    );
    const texts = layerNamed(imp, '0').children.filter((n): n is TextNode => n.type === 'text');
    const mid = texts.find((t) => t.text === 'Mid')!;
    const g = layerNamed(imp, '0');
    expect(g.x + mid.x + mid.width / 2).toBeCloseTo(20 + 800, 0);
    expect(mid.align).toBe('center');
    const ml = texts.find((t) => t.text.includes('\n'))!;
    expect(ml.text).toBe('line one\nline two');
    expect(ml.width).toBeCloseTo(30 * 16, 0);
    expect(ml.align).toBe('left');
  });

  it('escapes braces so text is not read as an expression', () => {
    const imp = abOf(dxf({ entities: rec('TEXT', 8, '0', 10, 0, 20, 0, 40, 2, 1, 'a {b}') + rec('LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 10) }));
    expect(layerNamed(imp, '0').children.find((n): n is TextNode => n.type === 'text')!.text).toBe('a {{b}}');
  });
});

describe('dxf blocks', () => {
  const line = rec('LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0);

  it('inserts a block with rotation and scale', () => {
    const imp = abOf(
      dxf({
        blocks: block('B', line),
        // a frame so the extents are known: 0..100 on both axes, 16 px per unit
        entities: rec('LINE', 8, 'FRAME', 10, 0, 20, 0, 11, 100, 21, 100) + rec('INSERT', 8, 'PARTS', 2, 'B', 10, 50, 20, 20, 41, 2, 42, 2, 50, 90),
      }),
    );
    const g = layerNamed(imp, 'PARTS');
    const p = paths(g)[0];
    const [a, b] = abs(g, p)[0];
    const u = unit(100);
    // (0,0)-(10,0) scaled by 2 and turned 90 degrees ccw is (50,20)-(50,40)
    expect(u(a.x)).toBeCloseTo(50);
    expect(u(b.x)).toBeCloseTo(50);
    expect(100 - u(a.y)).toBeCloseTo(20);
    expect(100 - u(b.y)).toBeCloseTo(40);
  });

  it('honours the block base point and nested inserts', () => {
    const imp = abOf(
      dxf({
        blocks: block('INNER', line, 5, 0) + block('OUTER', rec('INSERT', 8, '0', 2, 'INNER', 10, 0, 20, 10, 41, 1, 42, 1, 50, 0)),
        entities: rec('LINE', 8, 'FRAME', 10, 0, 20, 0, 11, 100, 21, 100) + rec('INSERT', 8, 'A', 2, 'OUTER', 10, 30, 20, 30),
      }),
    );
    const g = layerNamed(imp, 'A');
    const [a, b] = abs(g, paths(g)[0])[0];
    const u = unit(100);
    // INNER's base point (5,0) lands on the insert point (0,10), then OUTER moves by (30,30): the line starts at (25,40)
    expect(u(a.x)).toBeCloseTo(25);
    expect(u(b.x)).toBeCloseTo(35);
    expect(100 - u(a.y)).toBeCloseTo(40);
  });

  it('makes arrays of rows and columns', () => {
    const imp = abOf(
      dxf({
        blocks: block('B', line),
        entities: rec('LINE', 8, 'FRAME', 10, 0, 20, 0, 11, 100, 21, 100) + rec('INSERT', 8, 'A', 2, 'B', 10, 0, 20, 0, 70, 3, 71, 2, 44, 20, 45, 30),
      }),
    );
    const g = layerNamed(imp, 'A');
    expect(paths(g)).toHaveLength(6);
  });

  it('takes layer 0 and BYBLOCK from the insert, other layers as they are', () => {
    const imp = abOf(
      dxf({
        tables: table('LAYER', layer('0', 7) + layer('SHOWN', 2) + layer('LIGHT', 4)),
        blocks: block('B', rec('LINE', 8, '0', 62, 0, 10, 0, 20, 0, 11, 10, 21, 0) + rec('LINE', 8, 'LIGHT', 10, 0, 20, 5, 11, 10, 21, 5) + rec('LINE', 8, '0', 62, 256, 10, 0, 20, 8, 11, 10, 21, 8)),
        entities: rec('INSERT', 8, 'SHOWN', 62, 3, 2, 'B', 10, 0, 20, 0),
      }),
    );
    const shown = paths(layerNamed(imp, 'SHOWN'));
    expect(shown).toHaveLength(2);
    // BYBLOCK takes the insert's colour (green), BYLAYER on layer 0 takes the layer of the insert (yellow)
    expect(shown[0].stroke?.paint).toEqual({ type: 'solid', color: '#00ff00' });
    expect(shown[1].stroke?.paint).toEqual({ type: 'solid', color: '#ffff00' });
    expect(paths(layerNamed(imp, 'LIGHT'))).toHaveLength(1);
  });

  it('does not loop on a block that contains itself', () => {
    const imp = abOf(dxf({ blocks: block('LOOP', line + rec('INSERT', 8, '0', 2, 'LOOP', 10, 1, 20, 1)), entities: rec('INSERT', 8, '0', 2, 'LOOP', 10, 0, 20, 0) }));
    expect(paths(layerNamed(imp, '0'))).toHaveLength(1);
    expect(imp.warnings.join(' ')).toMatch(/circular/);
  });

  it('draws a dimension from its block', () => {
    const imp = abOf(
      dxf({
        blocks: block('*D1', rec('LINE', 8, 'DIMS', 10, 0, 20, 0, 11, 40, 21, 0) + rec('TEXT', 8, 'DIMS', 10, 20, 20, 2, 40, 2, 72, 1, 11, 20, 21, 2, 1, '40')),
        entities: rec('DIMENSION', 8, 'DIMS', 2, '*D1', 70, 0) + rec('LINE', 8, 'X', 10, 0, 20, 0, 11, 100, 21, 100),
      }),
    );
    const g = layerNamed(imp, 'DIMS');
    expect(paths(g)).toHaveLength(1);
    expect(g.children.some((n) => n.type === 'text' && (n as TextNode).text === '40')).toBe(true);
  });

  it('turns attributes into text', () => {
    const imp = abOf(
      dxf({
        blocks: block('TAG', rec('LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0) + rec('ATTDEF', 8, '0', 10, 0, 20, 0, 40, 2, 1, 'default', 2, 'NUM')),
        entities: rec('INSERT', 8, '0', 66, 1, 2, 'TAG', 10, 5, 20, 5) + rec('ATTRIB', 8, '0', 10, 5, 20, 7, 40, 2, 1, 'A-101', 2, 'NUM', 70, 0) + rec('SEQEND'),
      }),
    );
    const texts = layerNamed(imp, '0').children.filter((n): n is TextNode => n.type === 'text');
    expect(texts.map((t) => t.text)).toEqual(['A-101']);
  });
});

describe('dxf layers, colours and line styles', () => {
  it('hides layers that are off or frozen, and keeps the table order', () => {
    const imp = abOf(
      dxf({
        tables: table('LAYER', layer('B-first', 1) + layer('Off', -3) + layer('Frozen', 4, 1) + layer('Shown', 5)),
        entities:
          rec('LINE', 8, 'Shown', 10, 0, 20, 0, 11, 10, 21, 0) +
          rec('LINE', 8, 'Off', 10, 0, 20, 1, 11, 10, 21, 1) +
          rec('LINE', 8, 'Frozen', 10, 0, 20, 2, 11, 10, 21, 2) +
          rec('LINE', 8, 'B-first', 10, 0, 20, 3, 11, 10, 21, 3),
      }),
    );
    expect(groups(imp.artboard.children).map((g) => [g.name, g.visible])).toEqual([
      ['B-first', true],
      ['Off', false],
      ['Frozen', false],
      ['Shown', true],
    ]);
    expect(imp.warnings.join(' ')).toMatch(/2 layers are off or frozen/);
    // hidden layers do not take part in the fitting: the visible lines span y 0..3
    expect(imp.artboard.height).toBe(Math.ceil(1600 * (3 / 10)) + 40);
  });

  it('converts ACI colours', () => {
    expect(aciColor(1)).toBe('#ff0000');
    expect(aciColor(2)).toBe('#ffff00');
    expect(aciColor(3)).toBe('#00ff00');
    expect(aciColor(4)).toBe('#00ffff');
    expect(aciColor(5)).toBe('#0000ff');
    expect(aciColor(6)).toBe('#ff00ff');
    expect(aciColor(7)).toBe('#000000'); // white on black screens, black on white: the artboard is white
    expect(aciColor(8)).toBe('#808080');
    expect(aciColor(9)).toBe('#c0c0c0');
    expect(aciColor(10)).toBe('#ff0000');
    expect(aciColor(11)).toBe('#ff7f7f');
    expect(aciColor(12)).toBe('#cc0000');
    expect(aciColor(14)).toBe('#990000');
    expect(aciColor(20)).toBe('#ff3f00');
    expect(aciColor(30)).toBe('#ff7f00');
    expect(aciColor(50)).toBe('#ffff00');
    expect(aciColor(250)).toBe('#333333');
    expect(aciColor(255)).toBe('#000000');
    expect(aciColor(-5)).toBe('#0000ff');
    expect(trueColor(0x112233)).toBe('#112233');
    expect(trueColor(0xffffff)).toBe('#000000');
  });

  it('resolves BYLAYER, ACI and true colours on entities', () => {
    const imp = abOf(
      dxf({
        tables: table('LAYER', layer('L', 1) + layer('T', 7, 0, [420, 0x00aa55])),
        entities:
          rec('LINE', 8, 'L', 10, 0, 20, 0, 11, 10, 21, 0) +
          rec('LINE', 8, 'L', 62, 5, 10, 0, 20, 1, 11, 10, 21, 1) +
          rec('LINE', 8, 'L', 62, 5, 420, 0x112233, 10, 0, 20, 2, 11, 10, 21, 2) +
          rec('LINE', 8, 'T', 10, 0, 20, 3, 11, 10, 21, 3),
      }),
    );
    const col = (g: GroupNode) => paths(g).map((p) => (p.stroke?.paint as { color: string }).color);
    expect(col(layerNamed(imp, 'L'))).toEqual(['#ff0000', '#0000ff', '#112233']);
    expect(col(layerNamed(imp, 'T'))).toEqual(['#00aa55']);
  });

  it('turns line weights into stroke widths and linetypes into dashes', () => {
    const imp = abOf(
      dxf({
        header: hv('$LTSCALE', 40, 1),
        tables: table('LTYPE', rec('LTYPE', 2, 'DASHED', 70, 0, 73, 2, 40, 19.05, 49, 12.7, 74, 0, 49, -6.35, 74, 0)) + table('LAYER', layer('H', 7, 0, [370, 50])),
        entities:
          rec('LINE', 8, 'H', 10, 0, 20, 0, 11, 1000, 21, 0) +
          rec('LINE', 8, 'H', 370, 100, 10, 0, 20, 10, 11, 1000, 21, 10) +
          rec('LINE', 8, 'H', 370, -3, 10, 0, 20, 20, 11, 1000, 21, 20) +
          rec('LINE', 8, 'H', 6, 'DASHED', 10, 0, 20, 30, 11, 1000, 21, 30),
      }),
    );
    const [layerWeight, thick, dflt, dashed] = paths(layerNamed(imp, 'H'));
    expect(layerWeight.stroke?.width).toBe(2); // 0.5 mm on the layer = 2 px
    expect(thick.stroke?.width).toBe(4); // 1.00 mm
    expect(dflt.stroke?.width).toBe(1); // default weight: the hairline
    expect(layerWeight.stroke?.dash).toBeUndefined();
    // 12.7 and 6.35 units at 1.6 px per unit, but never below 6 px in all: dashes keep their ratio
    expect(dashed.stroke?.dash).toHaveLength(2);
    expect(dashed.stroke!.dash![0]).toBeCloseTo(2 * dashed.stroke!.dash![1], 0);
  });
});

describe('dxf hatches', () => {
  const square = (extra: Kv[]) => [91, 1, 92, 7, 72, 0, 73, 1, 93, 4, 10, 0, 20, 0, 10, 10, 20, 0, 10, 10, 20, 10, 10, 0, 20, 10, 97, 0, ...extra];

  it('fills a solid hatch with its boundary', () => {
    const imp = abOf(dxf({ entities: rec('HATCH', 8, '0', 62, 1, 2, 'SOLID', 70, 1, 71, 0, ...square([75, 0, 76, 1, 98, 0])) }));
    const h = paths(layerNamed(imp, '0'))[0];
    expect(h.name).toBe('Hatch');
    expect(h.fill).toEqual({ type: 'solid', color: '#ff0000' });
    expect(h.fillRule).toBe('evenodd');
    expect(h.stroke).toBeNull();
    expect(h.paths[0].points).toHaveLength(4);
  });

  it('reads edge boundaries (a line and an arc) and holes', () => {
    const edges = [91, 2, 92, 1, 93, 2, 72, 1, 10, 0, 20, 0, 11, 10, 21, 0, 72, 2, 10, 5, 20, 0, 40, 5, 50, 0, 51, 180, 73, 1, 97, 0, 92, 7, 72, 0, 73, 1, 93, 4, 10, 2, 20, 1, 10, 4, 20, 1, 10, 4, 20, 3, 10, 2, 20, 3, 97, 0, 75, 0, 76, 1];
    const imp = abOf(dxf({ entities: rec('HATCH', 8, '0', 2, 'SOLID', 70, 1, ...edges) }));
    const h = paths(layerNamed(imp, '0'))[0];
    expect(h.paths).toHaveLength(2);
    expect(h.paths[0].closed).toBe(true);
    // the first loop: a line (0,0)-(10,0) and a semicircle back to (0,0) through (5,5)
    expect(h.height).toBeCloseTo(1600 / 2, -1);
  });

  it('tints pattern hatches and says so', () => {
    const imp = abOf(dxf({ entities: rec('HATCH', 8, '0', 62, 5, 2, 'ANSI31', 70, 0, 71, 0, ...square([75, 0, 76, 1, 52, 0, 41, 1, 77, 0, 78, 0, 98, 0])) }));
    const h = paths(layerNamed(imp, '0'))[0];
    expect((h.fill as { color: string }).color).toBe('rgba(0, 0, 255, 0.18)');
    expect(imp.warnings.join(' ')).toMatch(/pattern hatch/);
  });

  it('makes gradient hatches linear gradients', () => {
    const imp = abOf(dxf({ entities: rec('HATCH', 8, '0', 2, 'LINEAR', 70, 1, 71, 0, ...square([75, 0, 76, 1, 98, 0, 450, 1, 451, 0, 460, 0, 461, 0, 452, 0, 462, 1, 453, 2, 463, 0, 63, 5, 421, 0xff0000, 463, 1, 63, 7, 421, 0x0000ff, 470, 'LINEAR'])) }));
    const h = paths(layerNamed(imp, '0'))[0];
    expect(h.fill).toMatchObject({ type: 'linear', angle: 90 });
    expect((h.fill as { stops: { color: string }[] }).stops.map((s) => s.color)).toEqual(['#ff0000', '#0000ff']);
  });
});

describe('dxf extents, paper space and reports', () => {
  it('reports the units and the scale', () => {
    const imp = abOf(dxf({ header: hv('$INSUNITS', 70, 4), entities: rec('LINE', 8, '0', 10, 0, 20, 0, 11, 8000, 21, 0) }));
    expect(imp.warnings.join(' ')).toMatch(/millimetres/);
    expect(imp.warnings.join(' ')).toMatch(/1 px = 5 mm/);
  });

  it('skips paper space with a warning, and lists what it cannot import', () => {
    const imp = abOf(dxf({ entities: rec('LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0) + rec('LINE', 8, '0', 67, 1, 10, 0, 20, 0, 11, 500, 21, 0) + rec('VIEWPORT', 8, '0', 67, 1) + rec('3DSOLID', 8, '0') + rec('IMAGE', 8, '0') }));
    expect(paths(layerNamed(imp, '0'))).toHaveLength(1);
    const w = imp.warnings.join(' ');
    expect(w).toMatch(/Paper space layouts are not imported \(2 objects skipped\)/);
    expect(w).toMatch(/Not imported: 3DSOLID, IMAGE/);
  });

  it('imports the paper space when the model space is empty', () => {
    const imp = abOf(dxf({ entities: rec('LINE', 8, '0', 67, 1, 10, 0, 20, 0, 11, 10, 21, 0) }));
    expect(paths(layerNamed(imp, '0'))).toHaveLength(1);
    expect(imp.warnings.join(' ')).toMatch(/paper space layout was imported/);
  });

  it('fails clearly on an empty drawing', () => {
    expect(() => abOf(dxf({ entities: '' }))).toThrow(/model space is empty/);
  });

  it('uses the header extents when a stray object is far away', () => {
    const imp = abOf(dxf({ header: hv('$EXTMIN', 10, 0, 20, 0, 30, 0) + hv('$EXTMAX', 10, 100, 20, 100, 30, 0), entities: rec('LINE', 8, '0', 10, 0, 20, 0, 11, 100, 21, 100) + rec('POINT', 8, '0', 10, 1e7, 20, 1e7) }));
    expect(imp.artboard.width).toBe(1640);
    expect(imp.warnings.join(' ')).toMatch(/far outside/);
  });

  it('merges big piles of plain lines per layer', () => {
    let body = '';
    for (let i = 0; i < 600; i++) body += rec('LINE', 8, 'MANY', 10, i, 20, 0, 11, i, 21, 10);
    const imp = abOf(dxf({ entities: body }));
    const g = layerNamed(imp, 'MANY');
    // 600 lines of one style: three paths of 250, 250 and 100 lines
    expect(g.children).toHaveLength(3);
    expect((g.children[0] as PathNode).paths).toHaveLength(250);
  });

  it('produces a document the player can use: unique ids, finite numbers', () => {
    const imp = abOf(dxf({ tables: table('LAYER', layer('A', 1)), blocks: block('B', rec('CIRCLE', 8, '0', 10, 0, 20, 0, 40, 1)), entities: rec('INSERT', 8, 'A', 2, 'B', 10, 3, 20, 3, 70, 2, 44, 5) + rec('TEXT', 8, 'A', 10, 0, 20, 0, 40, 1, 1, 'x') }));
    const ids = new Set<string>();
    const walk = (list: SceneNode[]) => {
      for (const n of list) {
        expect(ids.has(n.id)).toBe(false);
        ids.add(n.id);
        for (const k of ['x', 'y', 'width', 'height'] as const) expect(Number.isFinite(n[k])).toBe(true);
        if (n.type === 'group') walk(n.children);
      }
    };
    walk(imp.artboard.children);
    expect(ids.size).toBeGreaterThan(3);
  });
});

describe('dwg', () => {
  const header = (code: string) => {
    const b = new Uint8Array(128);
    for (let i = 0; i < code.length; i++) b[i] = code.charCodeAt(i);
    return b;
  };

  it('detects the version', () => {
    expect(detectDwg(header('AC1032'))).toEqual({ code: 'AC1032', name: 'AutoCAD 2018 and later' });
    expect(detectDwg(header('AC1015'))?.name).toBe('AutoCAD 2000');
    expect(detectDwg(header('AC1018'))?.name).toBe('AutoCAD 2004');
    expect(detectDwg(header('AC1021'))?.name).toBe('AutoCAD 2007');
    expect(detectDwg(header('AC1024'))?.name).toBe('AutoCAD 2010');
    expect(detectDwg(header('AC1027'))?.name).toBe('AutoCAD 2013');
    expect(detectDwg(header('AC1099'))).toEqual({ code: 'AC1099', name: '' });
    expect(detectDwg(header('PK\u0003\u0004'))).toBeNull();
    expect(detectDwg(new Uint8Array(3))).toBeNull();
  });

  it('answers with a friendly message that names the version', () => {
    expect(() => importDwg(header('AC1032'), 'plan')).toThrow(/DWG version AC1032 \(AutoCAD 2018 and later\).*Save As > DXF/);
    expect(dwgMessage({ code: 'AC1099', name: '' })).toMatch(/^DWG version AC1099:/);
    expect(() => importDwg(header('hello'), 'plan')).toThrow(/doesn't look like a DWG/);
  });

  it('reads a .dwg that is really a DXF', () => {
    const imp = importDwg(dxf({ entities: rec('LINE', 8, '0', 10, 0, 20, 0, 11, 5, 21, 5) }), 'plan');
    expect(paths(layerNamed(imp, '0'))).toHaveLength(1);
  });
});

describe('linking', () => {
  it('treats dxf and dwg as design files', () => {
    expect(isDesignFile({ name: 'Plan.DXF' })).toBe(true);
    expect(isDesignFile({ name: 'plan.dwg' })).toBe(true);
    expect(isDesignFile({ name: 'plan.dxf.txt' })).toBe(false);
    expect(designKind('plan.dxf')).toBe('dxf');
    expect(KIND_LABEL.dxf).toBe('AutoCAD DXF');
    expect(KIND_LABEL.dwg).toBe('AutoCAD DWG');
  });
});
