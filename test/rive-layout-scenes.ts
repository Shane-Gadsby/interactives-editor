// Synthetic Rive layout scenes: each is one artboard (400 x 200, or 300 for the text ones) of layout boxes, written as
// .riv objects. They were rendered by the Rive runtime and by our player side by side while the importer was built, and
// rive-parity.test.ts holds the positions Rive gave them.
import { type Spec } from './rive-writer';
const C = { red: 0xffe53935, blue: 0xff1e88e5, green: 0xff43a047, yellow: 0xfffdd835, purple: 0xff8e24aa, grey: 0xff444444, white: 0xffffffff, orange: 0xfffb8c00 };
export type Doc = { name: string; specs: Spec[]; add: (s: Spec) => number };
function doc(name: string, w: number, h: number, rootStyle: Record<string, unknown>, bg = C.grey): Doc {
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
  return out;
}
