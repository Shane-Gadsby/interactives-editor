import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { walk, type Artboard, type FrameNode, type GroupNode, type ImageNode, type PathNode, type RectNode, type SceneNode, type TextNode } from 'interactives-player';
import { importPptx, isPptx } from '../src/lib/pptx-import';
import { ANIMATION_ACCEPT, readAnimationFile } from '../src/lib/importers';
import { DESIGN_EXTENSIONS, KIND_LABEL, isDesignFile } from '../src/lib/links';

// importers.ts pulls in the built player bundle for exports, which a test run doesn't need
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (n: string) => n }));

const enc = new TextEncoder();
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const rels = (list: [string, string, string][]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

const THEME = `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements>
<a:clrScheme name="t"><a:dk1><a:sysClr val="windowText" lastClr="112233"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>
<a:accent1><a:srgbClr val="FF0000"/></a:accent1><a:accent2><a:srgbClr val="00FF00"/></a:accent2><a:accent3><a:srgbClr val="0000FF"/></a:accent3><a:accent4><a:srgbClr val="FFFF00"/></a:accent4><a:accent5><a:srgbClr val="00FFFF"/></a:accent5><a:accent6><a:srgbClr val="FF00FF"/></a:accent6><a:hlink><a:srgbClr val="0000EE"/></a:hlink><a:folHlink><a:srgbClr val="551A8B"/></a:folHlink></a:clrScheme>
<a:fontScheme name="f"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>
<a:fmtScheme name="x"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="50000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

const sp = (id: number, name: string, opts: { ph?: string; xfrm?: string; geom?: string; fill?: string; ln?: string; style?: string; text?: string; body?: string; bodyKids?: string }) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr>${opts.ph ? `<p:ph ${opts.ph}/>` : ''}</p:nvPr></p:nvSpPr><p:spPr>${opts.xfrm ?? ''}${opts.geom ?? ''}${opts.fill ?? ''}${opts.ln ?? ''}</p:spPr>${opts.style ?? ''}${opts.text !== undefined || opts.body ? `<p:txBody><a:bodyPr${opts.body ?? ''}>${opts.bodyKids ?? ''}</a:bodyPr><a:lstStyle/>${opts.text ?? '<a:p/>'}</p:txBody>` : ''}</p:sp>`;
const xf = (x: number, y: number, w: number, h: number, extra = '') => `<a:xfrm${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const prst = (n: string, av = '') => `<a:prstGeom prst="${n}"><a:avLst>${av}</a:avLst></a:prstGeom>`;
const solid = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
const para = (runs: string, ppr = '') => `<a:p>${ppr ? `<a:pPr ${ppr}/>` : ''}${runs}</a:p>`;
const run = (t: string, rpr = '', inner = '') => `<a:r><a:rPr lang="en-US" ${rpr}>${inner}</a:rPr><a:t>${t}</a:t></a:r>`;

const tree = (shapes: string) => `<p:cSld>__BG__<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>`;
const withBg = (cSld: string, bg: string) => cSld.replace('__BG__', bg);

interface Deck {
  slides: string[];
  /** extra files, and the relationships for slide N (1-based) */
  slideRels?: Record<number, [string, string, string][]>;
  layoutShapes?: string;
  masterShapes?: string;
  layoutBg?: string;
  masterBg?: string;
  slideBg?: Record<number, string>;
  layoutAttrs?: string;
  slideAttrs?: Record<number, string>;
  sldSz?: [number, number];
  extra?: Record<string, string | Uint8Array>;
  slideTail?: Record<number, string>;
}

function build(d: Deck): Uint8Array {
  const [cx, cy] = d.sldSz ?? [9144000, 6858000];
  const parts: Record<string, string | Uint8Array> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="1" r:id="rM"/></p:sldMasterIdLst><p:sldIdLst>${d.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rS${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels([['rM', 'slideMaster', 'slideMasters/slideMaster1.xml'], ...d.slides.map((_, i): [string, string, string] => [`rS${i + 1}`, 'slide', `slides/slide${i + 1}.xml`])]),
    'ppt/theme/theme1.xml': THEME,
    'ppt/slideMasters/slideMaster1.xml': `<?xml version="1.0"?><p:sldMaster ${NS}>${withBg(tree(d.masterShapes ?? ''), d.masterBg ?? '')}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buChar char="&#8226;"/><a:defRPr sz="2800"/></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="-"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([['rL', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rT', 'theme', '../theme/theme1.xml']]),
    'ppt/slideLayouts/slideLayout1.xml': `<?xml version="1.0"?><p:sldLayout ${NS}${d.layoutAttrs ?? ''}>${withBg(tree(d.layoutShapes ?? ''), d.layoutBg ?? '')}</p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rM', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
    ...d.extra,
  };
  d.slides.forEach((shapes, i) => {
    const n = i + 1;
    parts[`ppt/slides/slide${n}.xml`] = `<?xml version="1.0"?><p:sld ${NS}${d.slideAttrs?.[n] ?? ''}>${withBg(tree(shapes), d.slideBg?.[n] ?? '')}${d.slideTail?.[n] ?? ''}</p:sld>`;
    parts[`ppt/slides/_rels/slide${n}.xml.rels`] = rels([['rLay', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ...(d.slideRels?.[n] ?? [])]);
  });
  const files: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(parts)) files[k] = typeof v === 'string' ? enc.encode(v) : v;
  return zipSync(files);
}

const all = (ab: Artboard): SceneNode[] => {
  const out: SceneNode[] = [];
  walk(ab.children, (n) => out.push(n));
  return out;
};
const ofType = <T extends SceneNode['type']>(ab: Artboard, t: T) => all(ab).filter((n) => n.type === t) as Extract<SceneNode, { type: T }>[];
const named = (ab: Artboard, name: string): SceneNode => {
  const n = all(ab).find((x) => x.name === name);
  if (!n) throw new Error(`no layer called ${name}`);
  return n;
};

describe('slides and size', () => {
  it('makes one artboard per slide, sized from the slide size (914400 EMU to the inch, 96 px to the inch)', () => {
    const r = importPptx(build({ slides: ['', '', ''], sldSz: [12192000, 6858000] }), 'Deck');
    expect(r.artboards).toHaveLength(3);
    expect(r.artboards.map((a) => [a.width, a.height])).toEqual([[1280, 720], [1280, 720], [1280, 720]]);
    expect(r.artboards.map((a) => a.name)).toEqual(['Deck / Slide 1', 'Deck / Slide 2', 'Deck / Slide 3']);
    // laid out in a row, in slide order
    expect(r.artboards.map((a) => a.canvasX)).toEqual([0, 1380, 2760]);
    expect(r.artboard).toBe(r.artboards[0]);
  });

  it('names a single slide after the file and reads the 4:3 size', () => {
    const r = importPptx(build({ slides: [''] }), 'Lecture');
    expect(r.artboards[0].name).toBe('Lecture');
    expect([r.artboards[0].width, r.artboards[0].height]).toEqual([960, 720]);
  });

  it('follows the slide order in presentation.xml, not the file names', () => {
    const bytes = build({ slides: [sp(2, 'First', { xfrm: xf(0, 0, 9525, 9525), fill: solid('FF0000') }), sp(2, 'Second', { xfrm: xf(0, 0, 9525, 9525), fill: solid('00FF00') })] });
    const r = importPptx(bytes, 'Deck');
    expect(named(r.artboards[0], 'First')).toBeTruthy();
    expect(named(r.artboards[1], 'Second')).toBeTruthy();
  });
});

describe('text', () => {
  it('imports runs with font, size, bold, italic, colour and alignment, with EMU and points converted to px', () => {
    const text = para(run('Hello ', 'sz="2400" b="1"', solid('FF8800') + '<a:latin typeface="Verdana"/>') + run('world', 'sz="2400" i="1" u="sng"', solid('0000FF')), 'algn="ctr"');
    const r = importPptx(build({ slides: [sp(2, 'Box', { xfrm: xf(914400, 457200, 4572000, 914400), geom: prst('rect'), text })] }), 'D');
    const t = ofType(r.artboards[0], 'text')[0] as TextNode;
    // an inch in, half an inch down, plus the default 0.1in / 0.05in insets
    expect(t.x).toBeCloseTo(96 + 9.6, 1);
    expect(t.y).toBeCloseTo(48 + 4.8, 1);
    expect(t.width).toBeCloseTo(480 - 19.2, 1);
    expect(t.height).toBeCloseTo(96 - 9.6, 1);
    expect(t.text).toBe('Hello world');
    expect(t.align).toBe('center');
    expect(t.fontSize).toBeCloseTo(32, 1);
    expect(t.fontFamily).toBe('Verdana');
    expect(t.fontWeight).toBe(700);
    expect(t.color).toBe('#ff8800');
    expect(t.runs).toHaveLength(2);
    expect(t.runs![1]).toMatchObject({ text: 'world', italic: true, underline: true, color: '#0000ff', fontFamily: 'Arial', fontWeight: 400 });
  });

  it('joins paragraphs with line breaks and keeps a break inside a paragraph', () => {
    const text = para(run('One') + '<a:br/>' + run('Two')) + para(run('Three'));
    const r = importPptx(build({ slides: [sp(2, 'Box', { xfrm: xf(0, 0, 3000000, 1000000), text })] }), 'D');
    expect((ofType(r.artboards[0], 'text')[0] as TextNode).text).toBe('One\nTwo\nThree');
  });

  it('inherits position, size, alignment, font and colour for a placeholder the slide leaves bare', () => {
    const layout = sp(2, 'Layout title', { ph: 'type="title"', xfrm: xf(914400, 457200, 7315200, 1143000), body: ' anchor="b"' });
    const master = sp(2, 'Master title', { ph: 'type="title"', xfrm: xf(0, 0, 100, 100), body: ' anchor="ctr"' });
    const slide = sp(2, 'Title 1', { ph: 'type="title"', text: para(run('My title')) });
    const r = importPptx(build({ slides: [slide], layoutShapes: layout, masterShapes: master }), 'D');
    const t = named(r.artboards[0], 'Title 1') as TextNode;
    expect(t.type).toBe('text');
    expect(t.x).toBeCloseTo(96 + 9.6, 1);
    expect(t.y).toBeCloseTo(48 + 4.8, 1);
    expect(t.width).toBeCloseTo(768 - 19.2, 1);
    expect(t.height).toBeCloseTo(120 - 9.6, 1);
    // from the master's title style: centred, 44pt bold, the theme's heading font and its dark text colour
    expect(t.align).toBe('center');
    expect(t.fontSize).toBeCloseTo(58.67, 1);
    expect(t.fontWeight).toBe(700);
    expect(t.fontFamily).toBe('Georgia');
    expect(t.color).toBe('#112233');
    // the layout's anchor beats the master's
    expect(t.verticalAlign).toBe('bottom');
  });

  it('falls back to the master for a placeholder the layout does not have, and matches body text by idx', () => {
    const layout = sp(2, 'Content', { ph: 'idx="1"', xfrm: xf(914400, 1828800, 7315200, 3657600) });
    const master = sp(2, 'Master body', { ph: 'type="body" idx="1"', xfrm: xf(0, 0, 1, 1) }) + sp(3, 'Master footer', { ph: 'type="ftr" idx="3"', xfrm: xf(1905000, 6356350, 2895600, 365125) });
    const slide = sp(2, 'Body', { ph: 'idx="1"', text: para(run('First point')) + para(run('Second point')) }) + sp(3, 'Footer', { ph: 'type="ftr" idx="3"', text: para(run('Footer text')) });
    const r = importPptx(build({ slides: [slide], layoutShapes: layout, masterShapes: master }), 'D');
    const body = named(r.artboards[0], 'Body') as TextNode;
    expect(body.y).toBeCloseTo(192 + 4.8, 1);
    expect(body.fontSize).toBeCloseTo(37.33, 1);
    // the body style's 90% line spacing (of the 1.2 single spacing) and 10pt before a paragraph
    expect(body.lineHeight).toBeCloseTo(1.08, 2);
    expect(body.paragraphSpacing).toBeCloseTo(13.33, 1);
    // bullets are typed in
    expect(body.text).toBe('• First point\n• Second point');
    const footer = named(r.artboards[0], 'Footer') as TextNode;
    expect(footer.x).toBeCloseTo(200 + 9.6, 1);
    expect(footer.y).toBeCloseTo(667.5 + 4.8, 0);
  });

  it('applies a list level, numbering and the autofit font scale', () => {
    const master = sp(2, 'Master body', { ph: 'type="body" idx="1"', xfrm: xf(0, 0, 4000000, 4000000) });
    const slide = sp(2, 'Body', { ph: 'type="body" idx="1"', text: para(run('A'), 'lvl="0"') + para(run('B'), 'lvl="1"') });
    const scaled = sp(3, 'Small', { xfrm: xf(0, 0, 4000000, 1000000), bodyKids: '<a:normAutofit fontScale="50000"/>', text: para(run('Shrunk', 'sz="2000"')) });
    const r = importPptx(build({ slides: [slide + scaled], masterShapes: master }), 'D');
    const b = named(r.artboards[0], 'Body') as TextNode;
    // level 2 is indented with em spaces and gets its own bullet
    expect(b.text).toBe('• A\n  - B');
    const small = ofType(r.artboards[0], 'text').find((t) => t.text === 'Shrunk')!;
    expect(small.fontSize).toBeCloseTo((20 * 96) / 72 / 2, 1);
  });

  it('numbers paragraphs from buAutoNum', () => {
    const num = (t: string) => `<a:p><a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>${run(t)}</a:p>`;
    const r = importPptx(build({ slides: [sp(2, 'List', { xfrm: xf(0, 0, 3000000, 2000000), text: num('a') + num('b') + num('c') })] }), 'D');
    expect((ofType(r.artboards[0], 'text')[0] as TextNode).text).toBe('1. a\n2. b\n3. c');
  });

  it('reads the style reference colour for text in a shape, and theme colour modifiers', () => {
    const style = '<p:style><a:lnRef idx="0"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>';
    const tinted = run('Tinted', '', '<a:solidFill><a:schemeClr val="accent3"><a:lumMod val="50000"/></a:schemeClr></a:solidFill>');
    const r = importPptx(build({ slides: [sp(2, 'Plain', { xfrm: xf(0, 0, 3000000, 900000), geom: prst('rect'), style, text: para(run('White on red')) }) + sp(3, 'Mod', { xfrm: xf(0, 1000000, 3000000, 900000), text: para(tinted) })] }), 'D');
    const g = named(r.artboards[0], 'Plain') as GroupNode;
    expect(g.type).toBe('group');
    const rect = g.children[0] as RectNode;
    expect(rect.fill).toEqual({ type: 'solid', color: '#ff0000' });
    expect((g.children[1] as TextNode).color).toBe('#ffffff');
    // a quarter of the way: 0000ff at half lightness is 000080
    expect((named(r.artboards[0], 'Mod') as TextNode).color).toBe('#000080');
  });
});

describe('shapes', () => {
  it('draws rectangles, rounded rectangles and ellipses with fill and outline', () => {
    const shapes =
      sp(2, 'Rect', { xfrm: xf(95250, 190500, 952500, 476250), geom: prst('rect'), fill: solid('336699'), ln: `<a:ln w="19050">${solid('FFFFFF')}<a:prstDash val="dash"/></a:ln>` }) +
      sp(3, 'Round', { xfrm: xf(0, 0, 1905000, 952500), geom: prst('roundRect', '<a:gd name="adj" fmla="val 50000"/>'), fill: solid('000000') }) +
      sp(4, 'Oval', { xfrm: xf(0, 0, 952500, 952500), geom: prst('ellipse'), fill: '<a:noFill/>', ln: `<a:ln w="9525">${solid('FF0000')}</a:ln>` });
    const r = importPptx(build({ slides: [shapes] }), 'D');
    const rect = named(r.artboards[0], 'Rect') as RectNode;
    expect([rect.x, rect.y, rect.width, rect.height]).toEqual([10, 20, 100, 50]);
    expect(rect.fill).toEqual({ type: 'solid', color: '#336699' });
    expect(rect.stroke?.width).toBe(2);
    expect(rect.stroke?.paint).toEqual({ type: 'solid', color: '#ffffff' });
    expect(rect.stroke?.dash).toEqual([8, 6]);
    expect((named(r.artboards[0], 'Round') as RectNode).cornerRadius).toBe(50);
    const oval = named(r.artboards[0], 'Oval');
    expect(oval.type).toBe('ellipse');
    expect((oval as unknown as { fill: unknown }).fill).toBeNull();
  });

  it('turns a flipped line into a two point path, and keeps rotation', () => {
    const cxn = `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="5" name="Line"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xf(0, 0, 1905000, 952500, ' flipV="1"')}${prst('line')}<a:ln w="38100">${solid('00AA00')}<a:headEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>`;
    const r = importPptx(build({ slides: [cxn + sp(6, 'Turned', { xfrm: xf(0, 0, 952500, 952500, ' rot="5400000"'), geom: prst('rect'), fill: solid('000000') })] }), 'D');
    const line = named(r.artboards[0], 'Line') as PathNode;
    expect(line.type).toBe('path');
    expect(line.paths[0].points.map((p) => [p.x, p.y])).toEqual([[0, 100], [200, 0]]);
    expect(line.stroke?.width).toBe(4);
    expect(line.fill).toBeNull();
    expect(named(r.artboards[0], 'Turned').rotation).toBe(90);
    expect(r.warnings.some((w) => /Arrowheads/.test(w))).toBe(true);
  });

  it('reads a freeform path with curves and a gradient fill, and gives other presets a rectangle with a note', () => {
    const cust = '<a:custGeom><a:avLst/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="0"/></a:lnTo><a:cubicBezTo><a:pt x="100" y="50"/><a:pt x="50" y="100"/><a:pt x="0" y="100"/></a:cubicBezTo><a:close/></a:path></a:pathLst></a:custGeom>';
    const grad = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill>';
    const r = importPptx(build({ slides: [sp(2, 'Free', { xfrm: xf(0, 0, 952500, 952500), geom: cust, fill: grad }) + sp(3, 'Arrow', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rightArrow'), fill: solid('000000') }) + sp(4, 'Tri', { xfrm: xf(0, 0, 952500, 952500), geom: prst('triangle'), fill: solid('000000') })] }), 'D');
    const free = named(r.artboards[0], 'Free') as PathNode;
    expect(free.paths[0].closed).toBe(true);
    expect(free.paths[0].points).toHaveLength(3);
    // the first control point (100, 50) relative to the point it leaves (100, 0)
    expect(free.paths[0].points[1].out).toEqual({ x: 0, y: 50 });
    expect(free.paths[0].points[2].in).toBeTruthy();
    expect(free.fill).toMatchObject({ type: 'linear', angle: 90 });
    expect(named(r.artboards[0], 'Arrow').type).toBe('rect');
    expect(named(r.artboards[0], 'Tri').type).toBe('path');
    expect(r.warnings.some((w) => /presets/.test(w) && /slide 1/.test(w))).toBe(true);
  });

  it('reads a drop shadow', () => {
    const fx = '<a:effectLst><a:outerShdw blurRad="95250" dist="95250" dir="5400000"><a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr></a:outerShdw></a:effectLst>';
    const r = importPptx(build({ slides: [sp(2, 'Shadowed', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('FFFFFF') }).replace('</p:spPr>', `${fx}</p:spPr>`)] }), 'D');
    const s = named(r.artboards[0], 'Shadowed');
    expect(s.shadow).toMatchObject({ x: 0, y: 10, blur: 10, color: 'rgba(0, 0, 0, 0.4)' });
  });
});

describe('groups', () => {
  const grp = (inner: string, x: string) => `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="9" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${x}</p:grpSpPr>${inner}</p:grpSp>`;

  it('maps child coordinates through the group transform', () => {
    // children live in a 1000x1000 space and the group shows it at 2000x4000 EMU units, starting at (1905000, 952500)
    const inner = sp(2, 'Child', { xfrm: xf(500000, 250000, 100000, 100000), geom: prst('rect'), fill: solid('000000') });
    const g = grp(inner, '<a:xfrm><a:off x="1905000" y="952500"/><a:ext cx="1905000" cy="1905000"/><a:chOff x="400000" y="200000"/><a:chExt cx="952500" cy="476250"/></a:xfrm>');
    const r = importPptx(build({ slides: [g] }), 'D');
    const group = named(r.artboards[0], 'Group') as GroupNode;
    expect([group.x, group.y, group.width, group.height]).toEqual([200, 100, 200, 200]);
    const c = named(r.artboards[0], 'Child') as RectNode;
    // 100000 EMU into the child space is 2x wide, 4x tall
    expect(c.x).toBeCloseTo((100000 * 2) / 9525, 1);
    expect(c.y).toBeCloseTo((50000 * 4) / 9525, 1);
    expect(c.width).toBeCloseTo((100000 * 2) / 9525, 1);
    expect(c.height).toBeCloseTo((100000 * 4) / 9525, 1);
  });

  it('nests groups, and carries rotation and flips on the group', () => {
    const leaf = sp(2, 'Leaf', { xfrm: xf(0, 0, 952500, 952500), geom: prst('ellipse'), fill: solid('000000') });
    const inner = grp(leaf, '<a:xfrm><a:off x="952500" y="0"/><a:ext cx="952500" cy="952500"/><a:chOff x="0" y="0"/><a:chExt cx="952500" cy="952500"/></a:xfrm>').replace('name="Group"', 'name="Inner"');
    const outer = grp(inner, '<a:xfrm rot="2700000" flipH="1"><a:off x="0" y="0"/><a:ext cx="1905000" cy="952500"/><a:chOff x="0" y="0"/><a:chExt cx="1905000" cy="952500"/></a:xfrm>').replace('name="Group"', 'name="Outer"');
    const r = importPptx(build({ slides: [outer] }), 'D');
    const o = named(r.artboards[0], 'Outer') as GroupNode;
    expect(o.rotation).toBe(45);
    expect(o.scaleX).toBe(-1);
    const i = named(r.artboards[0], 'Inner') as GroupNode;
    expect(i.x).toBe(100);
    expect(named(r.artboards[0], 'Leaf').type).toBe('ellipse');
  });
});

describe('pictures', () => {
  const pic = (id: number, name: string, rid: string, x: number, y: number, w: number, h: number, extra = '') =>
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="Alt for ${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${extra}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xf(x, y, w, h)}${prst('rect')}</p:spPr></p:pic>`;

  it('adds pictures as assets once per file, with the alt text', () => {
    const slides = [pic(2, 'Photo A', 'rI', 952500, 0, 1905000, 952500), pic(2, 'Photo B', 'rI', 0, 0, 952500, 952500)];
    const r = importPptx(build({ slides, slideRels: { 1: [['rI', 'image', '../media/image1.png']], 2: [['rI', 'image', '../media/image1.png']] }, extra: { 'ppt/media/image1.png': PNG } }), 'D');
    expect(r.assets).toHaveLength(1);
    expect(r.assets[0]).toMatchObject({ mime: 'image/png', name: 'image1.png' });
    const a = named(r.artboards[0], 'Photo A') as ImageNode;
    expect(a.type).toBe('image');
    expect(a.assetId).toBe(r.assets[0].id);
    expect([a.x, a.y, a.width, a.height]).toEqual([100, 0, 200, 100]);
    expect(a.ariaLabel).toBe('Alt for Photo A');
    expect((named(r.artboards[1], 'Photo B') as ImageNode).assetId).toBe(r.assets[0].id);
  });

  it('keeps a crop as a clipped frame holding the whole picture', () => {
    const crop = '<a:srcRect l="25000" t="0" r="25000" b="50000"/>';
    const r = importPptx(build({ slides: [pic(2, 'Cropped', 'rI', 0, 0, 952500, 476250, crop)], slideRels: { 1: [['rI', 'image', '../media/image1.png']] }, extra: { 'ppt/media/image1.png': PNG } }), 'D');
    const f = named(r.artboards[0], 'Cropped') as FrameNode;
    expect(f.type).toBe('frame');
    expect(f.clip).toBe(true);
    expect([f.width, f.height]).toEqual([100, 50]);
    const img = f.children[0] as ImageNode;
    // half the width is visible, half the height: the picture is twice as wide and tall, shifted by the cropped part
    expect([img.width, img.height, img.x, img.y]).toEqual([200, 100, -50, 0]);
  });

  it('skips pictures it cannot use, and reports them', () => {
    const r = importPptx(build({ slides: [pic(2, 'Metafile', 'rI', 0, 0, 952500, 952500) + pic(3, 'Linked', 'rX', 0, 0, 952500, 952500)], slideRels: { 1: [['rI', 'image', '../media/image1.emf']] }, extra: { 'ppt/media/image1.emf': PNG } }), 'D');
    expect(ofType(r.artboards[0], 'image')).toHaveLength(0);
    expect(r.assets).toHaveLength(0);
    expect(r.warnings.some((w) => /EMF/.test(w) && /slide 1/.test(w))).toBe(true);
  });

  it('uses a picture fill on a shape', () => {
    const fill = '<a:blipFill><a:blip r:embed="rI"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>';
    const r = importPptx(build({ slides: [sp(2, 'Pic shape', { xfrm: xf(0, 0, 952500, 952500), geom: prst('ellipse'), fill })], slideRels: { 1: [['rI', 'image', '../media/image1.jpg']] }, extra: { 'ppt/media/image1.jpg': PNG } }), 'D');
    expect((named(r.artboards[0], 'Pic shape') as unknown as { fill: unknown }).fill).toEqual({ type: 'image', assetId: r.assets[0].id, fit: 'fill' });
    expect(r.assets[0].mime).toBe('image/jpeg');
  });
});

describe('backgrounds, layout and master', () => {
  const bg = (fill: string) => `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`;

  it('takes the slide background, else the layout one, else the master one', () => {
    const r = importPptx(build({ slides: ['', '', ''], slideBg: { 1: bg(solid('AA0000')) }, layoutBg: undefined, masterBg: bg(solid('0000AA')) }), 'D');
    expect(r.artboards[0].background).toEqual({ type: 'solid', color: '#aa0000' });
    expect(r.artboards[1].background).toEqual({ type: 'solid', color: '#0000aa' });
    const r2 = importPptx(build({ slides: ['', ''], slideBg: { 2: bg(solid('00AA00')) }, layoutBg: bg(solid('777777')), masterBg: bg(solid('0000AA')) }), 'D');
    expect(r2.artboards[0].background).toEqual({ type: 'solid', color: '#777777' });
    expect(r2.artboards[1].background).toEqual({ type: 'solid', color: '#00aa00' });
  });

  it('resolves a master background that points at the theme', () => {
    const ref = '<p:bg><p:bgRef idx="1002"><a:schemeClr val="accent3"/></p:bgRef></p:bg>';
    const r = importPptx(build({ slides: [''], masterBg: ref }), 'D');
    // accent3 is 0000ff, and the theme's second background style halves its lightness
    expect(r.artboards[0].background).toEqual({ type: 'solid', color: '#000080' });
  });

  it('is white with no background anywhere, and reads a picture background', () => {
    expect(importPptx(build({ slides: [''] }), 'D').artboards[0].background).toEqual({ type: 'solid', color: '#ffffff' });
    const pict = bg('<a:blipFill><a:blip r:embed="rI"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>');
    const r = importPptx(build({ slides: [''], slideBg: { 1: pict }, slideRels: { 1: [['rI', 'image', '../media/bg.png']] }, extra: { 'ppt/media/bg.png': PNG } }), 'D');
    expect(r.artboards[0].background).toMatchObject({ type: 'image', assetId: r.assets[0].id });
  });

  it('draws layout and master decoration locked, behind the slide, and honours showMasterSp', () => {
    const logo = sp(5, 'Logo', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('123456') });
    const stripe = sp(6, 'Stripe', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('654321') });
    const slide = sp(2, 'Mine', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('FFFFFF') });
    const r = importPptx(build({ slides: [slide], masterShapes: logo, layoutShapes: stripe }), 'D');
    expect(r.artboards[0].children.map((c) => c.name)).toEqual(['Master: Logo', 'Layout: Stripe', 'Mine']);
    expect(r.artboards[0].children.map((c) => !!c.locked)).toEqual([true, true, false]);
    const hidden = importPptx(build({ slides: [slide], masterShapes: logo, layoutShapes: stripe, slideAttrs: { 1: ' showMasterSp="0"' } }), 'D');
    expect(hidden.artboards[0].children.map((c) => c.name)).toEqual(['Mine']);
    const noMaster = importPptx(build({ slides: [slide], masterShapes: logo, layoutShapes: stripe, layoutAttrs: ' showMasterSp="0"' }), 'D');
    expect(noMaster.artboards[0].children.map((c) => c.name)).toEqual(['Layout: Stripe', 'Mine']);
  });

  it('does not draw layout and master placeholders (they are prompts)', () => {
    const prompt = sp(2, 'Title prompt', { ph: 'type="title"', xfrm: xf(0, 0, 952500, 952500), fill: solid('FF0000'), text: para(run('Click to edit')) });
    const r = importPptx(build({ slides: [''], layoutShapes: prompt, masterShapes: prompt }), 'D');
    expect(r.artboards[0].children).toHaveLength(0);
  });
});

describe('the skip report', () => {
  const frame = (uri: string, name = 'Frame') => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="${uri}"/></a:graphic></p:graphicFrame>`;
  const A = 'http://schemas.openxmlformats.org/drawingml/2006';

  it('lists charts, SmartArt, tables and objects with the slides they were on', () => {
    const r = importPptx(build({ slides: [frame(`${A}/chart`), frame(`${A}/table`), frame(`${A}/diagram`) + frame(`${A}/chart`), frame('http://schemas.openxmlformats.org/presentationml/2006/ole')] }), 'D');
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Charts were not imported \(slides 1, 3\)/);
    expect(w).toMatch(/Tables were not imported \(slide 2\)/);
    expect(w).toMatch(/SmartArt was not imported \(slide 3\)/);
    expect(w).toMatch(/Embedded objects were not imported \(slide 4\)/);
  });

  it('lists animations, transitions and speaker notes', () => {
    const timing = '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" nodeType="tmRoot"><p:childTnLst><p:par><p:cTn id="2" presetID="1" presetClass="entr" nodeType="clickEffect"/></p:par></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>';
    const noteXml = `<p:notes ${NS}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Say hello</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`;
    const r = importPptx(build({ slides: ['', ''], slideTail: { 1: `<p:transition spd="med"><p:fade/></p:transition>${timing}` }, slideRels: { 1: [['rN', 'notesSlide', '../notesSlides/notesSlide1.xml']] }, extra: { 'ppt/notesSlides/notesSlide1.xml': noteXml } }), 'D');
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Animations were not imported \(slide 1\)/);
    expect(w).toMatch(/Slide transitions were not imported \(slide 1\)/);
    expect(w).toMatch(/Speaker notes were not imported \(slide 1\)/);
    // a clean deck says nothing
    expect(importPptx(build({ slides: [''] }), 'D').warnings).toEqual([]);
  });

  it('keeps the poster picture of a video and reports the media', () => {
    const video = `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Clip"/><p:cNvPicPr/><p:nvPr><a:videoFile r:link="rV"/></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rI"/><a:stretch/></p:blipFill><p:spPr>${xf(0, 0, 952500, 952500)}</p:spPr></p:pic>`;
    const r = importPptx(build({ slides: [video], slideRels: { 1: [['rI', 'image', '../media/poster.png']] }, extra: { 'ppt/media/poster.png': PNG } }), 'D');
    expect(ofType(r.artboards[0], 'image')).toHaveLength(1);
    expect(r.warnings.join('\n')).toMatch(/Audio and video were not imported/);
  });

  it('takes the fallback of alternate content instead of failing on markup it does not know', () => {
    const alt = `<mc:AlternateContent><mc:Choice Requires="p14"><p:sp><p:nvSpPr><p:cNvPr id="2" name="Fancy"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></mc:Choice><mc:Fallback>${sp(3, 'Plain', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('000000') })}</mc:Fallback></mc:AlternateContent>`;
    const r = importPptx(build({ slides: [alt] }), 'D');
    expect(r.artboards[0].children.map((c) => c.name)).toEqual(['Plain']);
  });
});

describe('detecting and opening a deck', () => {
  it('recognises a pptx by its contents, not only its name', () => {
    expect(isPptx(build({ slides: [''] }))).toBe(true);
    expect(isPptx(zipSync({ 'manifest.json': enc.encode('{}') }))).toBe(false);
    expect(isPptx(enc.encode('not a zip'))).toBe(false);
  });

  it('refuses things that are not decks with a message a person can read', () => {
    expect(() => importPptx(enc.encode('hello world'), 'x')).toThrow(/not a PowerPoint file/);
    expect(() => importPptx(zipSync({ 'a.txt': enc.encode('x') }), 'x')).toThrow(/no ppt\/presentation\.xml/);
    expect(() => importPptx(build({ slides: [] }), 'x')).toThrow(/no slides/);
  });

  it('is offered by the Import button, links like other design files, and opens through readAnimationFile', async () => {
    expect(ANIMATION_ACCEPT.split(',')).toContain('.pptx');
    expect(DESIGN_EXTENSIONS).toContain('pptx');
    expect(KIND_LABEL.pptx).toBe('PowerPoint');
    expect(isDesignFile({ name: 'Week 1.PPTX' })).toBe(true);
    const bytes = build({ slides: [sp(2, 'Box', { xfrm: xf(0, 0, 952500, 952500), text: para(run('Hi')) })] });
    const file = { name: 'Week 1.pptx', size: bytes.length, lastModified: 1, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } as unknown as File;
    const imp = await readAnimationFile(file);
    expect(imp.source).toBe('PowerPoint');
    expect(imp.artboards![0].name).toBe('Week 1');
    expect(ofType(imp.artboards![0], 'text')).toHaveLength(1);
  });

  it('imports the same file the same way twice (ids differ, content does not)', () => {
    const bytes = build({ slides: [sp(2, 'Box', { xfrm: xf(0, 0, 952500, 952500), geom: prst('rect'), fill: solid('336699'), text: para(run('Hi')) })] });
    const strip = (ab: Artboard) => JSON.stringify(ab, (k, v) => (k === 'id' ? undefined : v));
    expect(strip(importPptx(bytes, 'D').artboard)).toBe(strip(importPptx(bytes, 'D').artboard));
  });
});
