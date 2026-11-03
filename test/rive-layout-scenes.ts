// Synthetic Rive layout scenes: each is one artboard (400 x 200, or 300 for the text ones) of layout boxes, written as
// .riv objects. They were rendered by the Rive runtime and by our player side by side while the importer was built, and
// rive-parity.test.ts holds the positions Rive gave them.
import { type Spec } from './rive-writer';
const C = { red: 0xffe53935, blue: 0xff1e88e5, green: 0xff43a047, yellow: 0xfffdd835, purple: 0xff8e24aa, grey: 0xff444444, white: 0xffffffff, orange: 0xfffb8c00 };
export type Doc = { name: string; specs: Spec[]; add: (s: Spec) => number };
export function doc(name: string, w: number, h: number, rootStyle: Record<string, unknown>, bg = C.grey): Doc {
  const specs: Spec[] = [['Artboard', { name, width: w, height: h, styleId: 1 }]]; // 0
  const add = (s: Spec) => (specs.push(s), specs.length - 1);
  add(['LayoutComponentStyle', { parentId: 0, ...withUnits(rootStyle) }]); // 1
  const f = add(['Fill', { parentId: 0 }]);
  add(['SolidColor', { parentId: f, colorValue: bg }]);
  return { name, specs, add };
}
/** Adds the px unit to every padding/margin/gap/border/position value that has none, as the editor does */
function withUnits(style: Record<string, unknown>): Record<string, unknown> {
  const out = { ...style };
  for (const k of Object.keys(style)) if (/^(padding|margin|gap|border|position)[A-Za-z]*$/.test(k) && !k.endsWith('UnitsValue') && !(`${k}UnitsValue` in out) && !/Type/.test(k)) out[`${k}UnitsValue`] = 1;
  return out;
}
const U = (names: string[], u: number) => Object.fromEntries(names.map((n) => [`${n}UnitsValue`, u]));
export function box(d: Doc, parent: number, name: string, w: number, h: number, color: number, style: Record<string, unknown> = {}, paints: 'fill' | 'none' = 'fill'): number {
  const st = d.add(['LayoutComponentStyle', { parentId: 0, ...withUnits(style) }]);
  const slot = d.add(['LayoutComponent', { name, parentId: parent, width: w, height: h, styleId: st }]);
  if (paints === 'fill') {
    const f = d.add(['Fill', { parentId: slot }]);
    d.add(['SolidColor', { parentId: f, colorValue: color }]);
  }
  return slot;
}
export const colors = [C.red, C.blue, C.green, C.yellow, C.purple, C.orange];
/** A text in a layout: as Rive writes it, a hugging layout with the Text inside (and its style + run). Returns the wrapper. */
export function text(d: Doc, parent: number, name: string, str: string, wrapper: Record<string, unknown>, props: Record<string, unknown> = {}, fontSize = 16): number {
  const { width = 0, ...style } = wrapper as { width?: number };
  const w = box(d, parent, name, width, 0, 0, { intrinsicallySizedValue: true, layoutHeightScaleType: 2, ...style }, 'none');
  const t = d.add(['Text', { name: `${name}-text`, parentId: w, alignValue: 2, fitFontSizeResizesBox: false, ...props }]);
  const st = d.add(['TextStylePaint', { parentId: t, fontSize, fontAssetId: 0 }]);
  const f = d.add(['Fill', { parentId: st }]);
  d.add(['SolidColor', { parentId: f, colorValue: C.white }]);
  d.add(['TextValueRun', { parentId: t, text: str, styleId: st }]);
  return w;
}
const LONG = 'The quick brown fox jumps over the lazy dog and keeps running along the river bank';
export function scenes(): Doc[] {
  const out: Doc[] = [];
  // 1: padding + gap in px
  {
    const d = doc('pad', 400, 200, { paddingLeft: 20, paddingTop: 20, paddingRight: 20, paddingBottom: 20, gapHorizontal: 10, gapVertical: 10 });
    for (let i = 0; i < 3; i++) box(d, 0, `b${i}`, 60, 60, colors[i]);
    out.push(d);
  }
  // 2: percent padding and gap, percent child width
  {
    const d = doc('percent', 400, 200, { paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10, ...U(['paddingLeft', 'paddingTop', 'paddingRight', 'paddingBottom'], 2), gapHorizontal: 5, gapHorizontalUnitsValue: 2 });
    for (let i = 0; i < 3; i++) box(d, 0, `b${i}`, 20, 50, colors[i], { widthUnitsValue: 2, heightUnitsValue: 1 });
    out.push(d);
  }
  // 3: margins: px, percent, negative
  {
    const d = doc('margin', 400, 200, { paddingLeft: 10, paddingTop: 10 });
    box(d, 0, 'm1', 60, 60, colors[0], { marginLeft: 10, marginTop: 10, marginRight: 10, marginBottom: 10, ...U(['marginLeft', 'marginTop', 'marginRight', 'marginBottom'], 1) });
    box(d, 0, 'm2', 60, 60, colors[1], { marginLeft: 10, marginLeftUnitsValue: 2 });
    box(d, 0, 'm3', 60, 60, colors[2], { marginLeft: -20, marginTop: 40, marginLeftUnitsValue: 1, marginTopUnitsValue: 1 });
    out.push(d);
  }
  // 4: wrapping rows
  {
    const d = doc('wrap', 400, 200, { flexWrapValue: 1, gapHorizontal: 10, gapVertical: 10, paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10 });
    for (let i = 0; i < 5; i++) box(d, 0, `w${i}`, 110, 50, colors[i]);
    out.push(d);
  }
  // 5: alignment: centre, bottom-right
  for (const [label, t] of [['alignC', 4], ['alignBR', 8], ['alignSB', 9]] as [string, number][]) {
    const d = doc(label, 400, 200, { layoutAlignmentType: t, gapHorizontal: 10 });
    for (let i = 0; i < 3; i++) box(d, 0, `a${i}`, 50, 40 + i * 20, colors[i]);
    out.push(d);
  }
  // 6: column with fill height child and hug
  {
    const d = doc('column', 400, 200, { flexDirectionValue: 0, gapVertical: 8, paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10 });
    box(d, 0, 'c1', 100, 30, colors[0]);
    box(d, 0, 'c2', 100, 30, colors[1], { layoutHeightScaleType: 1 });
    box(d, 0, 'c3', 100, 30, colors[2], { layoutWidthScaleType: 1 });
    out.push(d);
  }
  // 7: borders and per-corner radii
  {
    const d = doc('border', 400, 200, { paddingLeft: 10, paddingTop: 10, gapHorizontal: 10 });
    const b = box(d, 0, 'bd', 120, 100, colors[1], { borderLeft: 10, borderTop: 10, borderRight: 10, borderBottom: 10, ...U(['borderLeft', 'borderTop', 'borderRight', 'borderBottom'], 1), cornerRadiusTL: 30, cornerRadiusTR: 0, cornerRadiusBL: 0, cornerRadiusBR: 30, paddingLeft: 10, paddingTop: 10 });
    box(d, b, 'inner', 40, 40, colors[3]);
    out.push(d);
  }
  // 8: dashed stroke on a layout
  {
    const d = doc('dash', 400, 200, { paddingLeft: 20, paddingTop: 20 });
    const b = box(d, 0, 'dashed', 200, 120, colors[1]);
    const s = d.add(['Stroke', { parentId: b, thickness: 6 }]);
    d.add(['SolidColor', { parentId: s, colorValue: C.white }]);
    const dp = d.add(['DashPath', { parentId: s, offset: 0 }]);
    d.add(['Dash', { parentId: dp, length: 20 }]);
    d.add(['Dash', { parentId: dp, length: 10 }]);
    out.push(d);
  }
  // 9: auto margins
  {
    const d = doc('auto', 400, 200, { paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10 });
    box(d, 0, 'x1', 60, 60, colors[0]);
    box(d, 0, 'x2', 60, 60, colors[1], { marginLeft: 0, marginLeftUnitsValue: 3 });
    box(d, 0, 'x3', 60, 60, colors[2]);
    out.push(d);
  }
  // 10: absolute with px and percent insets
  {
    const d = doc('inset', 400, 200, { paddingLeft: 40, paddingTop: 20 });
    box(d, 0, 'i1', 60, 60, colors[0], { positionTypeValue: 2, positionLeft: 10, positionLeftUnitsValue: 2, positionTop: 10, positionTopUnitsValue: 2 });
    box(d, 0, 'i2', 60, 60, colors[1], { positionTypeValue: 2, positionRight: 20, positionRightUnitsValue: 1, positionBottom: 10, positionBottomUnitsValue: 2 });
    box(d, 0, 'i3', 60, 60, colors[2]);
    out.push(d);
  }
  // 11: wrap with different gaps (horizontal 10, vertical 30)
  {
    const d = doc('wrapgap', 400, 200, { flexWrapValue: 1, gapHorizontal: 10, gapVertical: 30, paddingLeft: 10, paddingTop: 10 });
    for (let i = 0; i < 5; i++) box(d, 0, `w${i}`, 110, 40, colors[i]);
    out.push(d);
  }
  // 12: nested: a padded, margined child layout with percent padding inside a percent-sized parent
  {
    const d = doc('nested', 400, 200, { paddingLeft: 20, paddingTop: 20, gapHorizontal: 10 });
    const p = box(d, 0, 'p', 50, 150, colors[1], { widthUnitsValue: 2, paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10, paddingLeftUnitsValue: 2, paddingTopUnitsValue: 2, flexDirectionValue: 0, gapVertical: 6, gapVerticalUnitsValue: 2 });
    box(d, p, 'k1', 40, 30, colors[0], { marginLeft: 10, marginLeftUnitsValue: 2 });
    box(d, p, 'k2', 40, 30, colors[2]);
    box(d, 0, 'q', 60, 60, colors[3]);
    out.push(d);
  }
  // 13..: text in layouts
  const col = { flexDirectionValue: 0, paddingLeft: 20, paddingTop: 20, paddingRight: 20, paddingBottom: 20, gapVertical: 10 };
  for (const [label, wrapper, props] of [
    ['t_fill', { layoutWidthScaleType: 1 }, {}],
    ['t_fixed', { width: 200 }, {}],
    ['t_hug', { layoutWidthScaleType: 2 }, {}],
    ['t_fillh', { layoutWidthScaleType: 1 }, { sizingValue: 1 }],
  ] as [string, Record<string, unknown>, Record<string, unknown>][]) {
    const d = doc(label, 400, 300, col);
    box(d, 0, 'hdr', 100, 24, colors[0]);
    text(d, 0, 'txt', LONG, wrapper, props);
    box(d, 0, 'ftr', 100, 24, colors[1]);
    out.push(d);
  }
  {
    const d = doc('t_card', 400, 300, { paddingLeft: 20, paddingTop: 20, gapHorizontal: 10 });
    const p = box(d, 0, 'card', 220, 100, colors[4], { flexDirectionValue: 0, paddingLeft: 15, paddingTop: 15, paddingRight: 15, paddingBottom: 15, layoutHeightScaleType: 2, gapVertical: 8 });
    text(d, p, 'in', LONG, { layoutWidthScaleType: 1 });
    box(d, p, 'chip', 60, 20, colors[3]);
    box(d, 0, 'side', 60, 60, colors[2]);
    out.push(d);
  }
  // dashed borders: percent lengths, rounded corners, offset, on a layout and on a plain shape
  const dashed = (d: Doc, parent: number, thickness: number, dashes: [number, boolean][], dp: Record<string, unknown> = {}, color = C.white) => {
    const st = d.add(['Stroke', { parentId: parent, thickness }]);
    d.add(['SolidColor', { parentId: st, colorValue: color }]);
    const p = d.add(['DashPath', { parentId: st, ...dp }]);
    for (const [length, pct] of dashes) d.add(['Dash', { parentId: p, length, ...(pct ? { lengthIsPercentage: true } : {}) }]);
  };
  {
    const d = doc('dashpct', 400, 200, { paddingLeft: 20, paddingTop: 20 });
    const b = box(d, 0, 'pct', 200, 120, colors[1]);
    dashed(d, b, 6, [[0.05, true], [0.025, true]]);
    out.push(d);
  }
  {
    const d = doc('dashround', 400, 200, { paddingLeft: 20, paddingTop: 20 });
    const b = box(d, 0, 'round', 200, 120, colors[1], { cornerRadiusTL: 40, linkCornerRadius: true });
    dashed(d, b, 6, [[16, false], [10, false]], { offset: 8 });
    out.push(d);
  }
  {
    const d = doc('dashshape', 400, 200, {});
    let sh = d.add(['Shape', { name: 'e', parentId: 0, x: 110, y: 100 }]);
    d.add(['Ellipse', { parentId: sh, width: 160, height: 100 }]);
    let f = d.add(['Fill', { parentId: sh }]);
    d.add(['SolidColor', { parentId: f, colorValue: colors[1] }]);
    dashed(d, sh, 6, [[14, false], [8, false]]);
    sh = d.add(['Shape', { name: 'r', parentId: 0, x: 300, y: 100 }]);
    d.add(['Rectangle', { parentId: sh, width: 130, height: 100 }]);
    f = d.add(['Fill', { parentId: sh }]);
    d.add(['SolidColor', { parentId: f, colorValue: colors[2] }]);
    dashed(d, sh, 6, [[10, true], [5, true]]);
    out.push(d);
  }
  {
    const d = doc('corners', 400, 200, { paddingLeft: 20, paddingTop: 20, gapHorizontal: 20 });
    box(d, 0, 'c', 160, 120, colors[1], { linkCornerRadius: false, cornerRadiusTL: 40, cornerRadiusTR: 0, cornerRadiusBL: 0, cornerRadiusBR: 40 });
    box(d, 0, 'c2', 160, 120, colors[2], { linkCornerRadius: false, cornerRadiusTL: 0, cornerRadiusTR: 50, cornerRadiusBL: 10, cornerRadiusBR: 0 });
    out.push(d);
  }
  // grid layouts: tracks (px, percent, fr, auto), gaps, explicit and automatic placement, spans, alignment, justify-items, stacks.
  // GridTrack collection 0 is the columns and 1 the rows; types 0 auto, 1 px, 2 percent, 3 fr.
  const track = (d: Doc, col: number, type: number, value: number) => d.add(['GridTrack', { parentId: 0, collection: col, trackType: type, trackValue: value }]);
  const grid = (label: string, style: Record<string, unknown>, cols: [number, number][], rows: [number, number][]) => {
    const d = doc(label, 400, 200, { layoutTypeValue: 1, ...style });
    for (const [t, v] of cols) track(d, 0, t, v);
    for (const [t, v] of rows) track(d, 1, t, v);
    out.push(d);
    return d;
  };
  const fillItem = { layoutWidthScaleType: 1, layoutHeightScaleType: 1 };
  {
    const d = grid('grid_basic', { gapHorizontal: 10, gapVertical: 10, paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10 }, [[2, 25], [1, 80], [3, 1], [3, 2]], [[1, 60], [3, 1]]);
    for (let i = 0; i < 6; i++) box(d, 0, `g${i}`, 30, 30, colors[i], fillItem);
  }
  {
    const d = grid('grid_auto', { gapHorizontal: 10, gapVertical: 20, paddingLeft: 10, paddingTop: 10 }, [[0, 0], [0, 0], [3, 1]], [[0, 0], [0, 0]]);
    for (const [i, [w, h]] of ([[30, 30], [60, 20], [40, 50], [20, 20], [30, 30], [50, 30]] as [number, number][]).entries()) box(d, 0, `g${i}`, w, h, colors[i], i === 4 ? { layoutWidthScaleType: 1 } : {});
  }
  {
    // Layers that name their cell and span, and ones that are placed in the next free cell around them
    const d = grid('grid_place', { gapHorizontal: 10, gapVertical: 10, paddingLeft: 10, paddingTop: 10, paddingRight: 10, paddingBottom: 10 }, [[1, 80], [1, 80], [1, 80]], [[1, 50], [1, 50]]);
    const add = (i: number, c: number, r: number, cs: number, rs: number) => {
      const b = box(d, 0, `g${i}`, 30, 30, colors[i], fillItem);
      d.add(['GridItemPlacement', { parentId: b, gridColumn: c, gridRow: r, gridColumnSpan: cs, gridRowSpan: rs }]);
    };
    add(0, 2, 1, 1, 1);
    add(1, 0, 0, 2, 1);
    add(2, 1, 2, 1, 1);
    add(3, -1, 1, 1, 1);
  }
  {
    // Alignment: centre moves the tracks (and the layers in their rows), a spread one spreads the columns, end changes nothing
    const items = (d: Doc) => {
      box(d, 0, 'g0', 30, 30, colors[0]);
      box(d, 0, 'g1', 60, 20, colors[1]);
      box(d, 0, 'g2', 30, 30, colors[2]);
      box(d, 0, 'g3', 30, 30, colors[3]);
    };
    for (const [label, align, extra] of [['grid_center', 4, { gapHorizontal: 20, gapVertical: 20 }], ['grid_spread', 10, {}], ['grid_end', 8, {}], ['grid_topcenter', 1, {}]] as [string, number, Record<string, unknown>][])
      items(grid(label, { layoutAlignmentType: align, ...extra }, [[1, 100], [1, 100]], [[1, 60], [1, 60]]));
    for (const [label, ji] of [['grid_just', 1], ['grid_justend', 9]] as [string, number][]) {
      const d = grid(label, { justifyItemsValue: ji }, [[1, 150], [1, 150]], [[1, 100]]);
      box(d, 0, 'g0', 30, 30, colors[0]);
      box(d, 0, 'g1', 30, 30, colors[1], { layoutWidthScaleType: 1 });
    }
    for (const [label, align] of [['stack_center', 4], ['stack_end', 8], ['stack_top', 0]] as [string, number][]) {
      const d = doc(label, 400, 200, { layoutTypeValue: 2, layoutAlignmentType: align });
      box(d, 0, 'g0', 30, 30, colors[0]);
      box(d, 0, 'g1', 60, 20, colors[1]);
      out.push(d);
    }
  }
  // dashed ellipses that are not plain boxes: moved inside the shape, rotated, with the origin elsewhere, and a rotated shape
  {
    const d = doc('dashell', 600, 200, {});
    const ell = (name: string, x: number, shape: Record<string, unknown>, path: Record<string, unknown>) => {
      const sh = d.add(['Shape', { name, parentId: 0, x, y: 100, ...shape }]);
      d.add(['Ellipse', { parentId: sh, width: 140, height: 80, ...path }]);
      const f = d.add(['Fill', { parentId: sh }]);
      d.add(['SolidColor', { parentId: f, colorValue: colors[1] }]);
      const st = d.add(['Stroke', { parentId: sh, thickness: 6 }]);
      d.add(['SolidColor', { parentId: st, colorValue: C.white }]);
      const dp = d.add(['DashPath', { parentId: st }]);
      d.add(['Dash', { parentId: dp, length: 14 }]);
      d.add(['Dash', { parentId: dp, length: 8 }]);
    };
    ell('ea', 80, {}, { x: 0.01 });
    ell('eb', 240, {}, { rotation: Math.PI / 2 });
    ell('ec', 400, {}, { originX: 0, originY: 0 });
    ell('ed', 540, { rotation: Math.PI / 2 }, {});
    out.push(d);
  }
  {
    const d = doc('dashell2', 600, 200, {});
    const ell = (name: string, x: number, dash: [number, boolean][], dp: Record<string, unknown>) => {
      const sh = d.add(['Shape', { name, parentId: 0, x, y: 100 }]);
      d.add(['Ellipse', { parentId: sh, width: 140, height: 80 }]);
      const f = d.add(['Fill', { parentId: sh }]);
      d.add(['SolidColor', { parentId: f, colorValue: colors[1] }]);
      const st = d.add(['Stroke', { parentId: sh, thickness: 6 }]);
      d.add(['SolidColor', { parentId: st, colorValue: C.white }]);
      const dpo = d.add(['DashPath', { parentId: st, ...dp }]);
      for (const [length, pct] of dash) d.add(['Dash', { parentId: dpo, length, ...(pct ? { lengthIsPercentage: true } : {}) }]);
    };
    ell('o1', 80, [[14, false], [8, false]], { offset: 10 });
    ell('o2', 240, [[0.05, true], [0.025, true]], {});
    ell('o3', 400, [[0.05, true], [0.025, true]], { offset: 0.1, offsetIsPercentage: true });
    ell('o4', 540, [[30, false]], { offset: -15 });
    out.push(d);
  }
  // flex basis (px, percent, with fill) in a row and in a column
  {
    const d = doc('basis', 400, 200, { paddingLeft: 10, paddingTop: 10, paddingRight: 10, gapHorizontal: 10 });
    box(d, 0, 'f0', 60, 40, colors[0], { flexBasis: 100, flexBasisUnitsValue: 1 });
    box(d, 0, 'f1', 60, 40, colors[1], { flexBasis: 25, flexBasisUnitsValue: 2 });
    box(d, 0, 'f2', 60, 40, colors[2], { flexBasis: 50, flexBasisUnitsValue: 1, layoutWidthScaleType: 1 });
    box(d, 0, 'f3', 60, 40, colors[3], { layoutWidthScaleType: 1 });
    out.push(d);
  }
  {
    const d = doc('basiscol', 400, 200, { flexDirectionValue: 0, paddingLeft: 10, paddingTop: 10, paddingBottom: 10, gapVertical: 10 });
    box(d, 0, 'f0', 60, 20, colors[0], { flexBasis: 50, flexBasisUnitsValue: 1 });
    box(d, 0, 'f1', 60, 20, colors[1], { flexBasis: 25, flexBasisUnitsValue: 2 });
    box(d, 0, 'f2', 60, 20, colors[2], { flexBasis: 10, flexBasisUnitsValue: 1, layoutHeightScaleType: 1 });
    out.push(d);
  }
  // fill items weigh by fractionalWidth, and start from their content when the basis is auto
  {
    const d = doc('fraction', 400, 200, { paddingLeft: 10, paddingTop: 10, paddingRight: 10, gapHorizontal: 10 });
    for (const [i, f] of [1, 2, 1].entries()) {
      const b = box(d, 0, `r${i}`, 60, 40, colors[i], { layoutWidthScaleType: 1 });
      d.specs[b][1].fractionalWidth = f;
    }
    out.push(d);
  }
  {
    const d = doc('basisauto', 400, 200, { paddingLeft: 10, paddingTop: 10, paddingRight: 10, gapHorizontal: 10 });
    for (const [i, w] of [100, 40, 0].entries()) {
      const b = box(d, 0, `r${i}`, 60, 60, colors[i], { layoutWidthScaleType: 1 });
      if (w) box(d, b, `in${i}`, w, 20, colors[i + 3]);
    }
    out.push(d);
  }
  // text in a row: hugging, filling and fixed, with neighbours on both sides
  const row = { paddingLeft: 20, paddingTop: 20, paddingRight: 20, paddingBottom: 20, gapHorizontal: 10 };
  for (const [label, wrapper, str] of [
    ['tr_hug', { layoutWidthScaleType: 2 }, LONG],
    ['tr_fill', { layoutWidthScaleType: 1 }, LONG],
    ['tr_fixed', { width: 160 }, LONG],
    ['tr_short', { layoutWidthScaleType: 2 }, 'Hello there'],
    ['tr_hug2', { layoutWidthScaleType: 2 }, 'The quick brown fox jumps over the lazy dog and runs'],
  ] as [string, Record<string, unknown>, string][]) {
    const d = doc(label, 400, 200, row);
    box(d, 0, 'hdr', 60, 24, colors[0]);
    text(d, 0, 'txt', str, wrapper);
    box(d, 0, 'ftr', 60, 24, colors[1]);
    out.push(d);
  }
  // where a hugging text in a row wraps, by the neighbours it has
  for (const [label, before, after] of [['tr_p1', 0, 0], ['tr_p2', 60, 0], ['tr_p3', 60, 60], ['tr_p4', 120, 120]] as [string, number, number][]) {
    const d = doc(label, 400, 200, row);
    if (before) box(d, 0, 'hdr', before, 24, colors[0]);
    text(d, 0, 'txt', Array.from({ length: 16 }, () => '0000').join(' '), { layoutWidthScaleType: 2 });
    if (after) box(d, 0, 'ftr', after, 24, colors[1]);
    out.push(d);
  }
  for (const [label, gap, pad, before] of [['tr_g0', 0, 20, 60], ['tr_g30', 30, 20, 60], ['tr_pad0', 10, 0, 60], ['tr_pad50', 10, 50, 60], ['tr_big', 10, 20, 150]] as [string, number, number, number][]) {
    const d = doc(label, 400, 200, { ...row, gapHorizontal: gap, paddingLeft: pad, paddingRight: pad, paddingTop: 20 });
    box(d, 0, 'hdr', before, 24, colors[0]);
    text(d, 0, 'txt', Array.from({ length: 16 }, () => '0000').join(' '), { layoutWidthScaleType: 2 });
    out.push(d);
  }
  for (const before of [20, 40, 80, 100, 120, 200, 250]) {
    const d = doc(`tr_s${before}`, 400, 200, { ...row, paddingTop: 20 });
    box(d, 0, 'hdr', before, 24, colors[0]);
    text(d, 0, 'txt', Array.from({ length: 16 }, () => '0000').join(' '), { layoutWidthScaleType: 2 });
    out.push(d);
  }
  // a hugging wrapped text in a centred column
  for (const [label, str] of [['tw_center', LONG], ['tw_center2', 'The quick brown fox jumps over the lazy dog']] as [string, string][]) {
    const d = doc(label, 400, 300, { flexDirectionValue: 0, layoutAlignmentType: 1, paddingLeft: 20, paddingTop: 20, paddingRight: 20, paddingBottom: 20, gapVertical: 10 });
    box(d, 0, 'hdr', 100, 24, colors[0]);
    text(d, 0, 'txt', str, { layoutWidthScaleType: 2 });
    box(d, 0, 'ftr', 100, 24, colors[1]);
    out.push(d);
  }
  // aspect ratio
  for (const [label, axis, ratio, wst, hst] of [['ar0', 0, 3, 0, 2], ['ar1', 1, 2, 2, 0], ['ar2', 0, 1.5, 1, 2], ['ar3', 0, 0.5, 2, 0], ['ar4', 1, 3, 0, 2], ['ar5', 1, 0.5, 2, 0], ['ar6', 0, 2, 0, 0]] as [string, number, number, number, number][]) {
    const d = doc(label, 400, 200, { paddingLeft: 10, paddingTop: 10, gapHorizontal: 10 });
    box(d, 0, 'a0', 120, 60, colors[0], { aspectRatio: ratio, aspectRatioAxisValue: axis, layoutWidthScaleType: wst, layoutHeightScaleType: hst });
    box(d, 0, 'a1', 50, 50, colors[1]);
    out.push(d);
  }
  return out;
}
