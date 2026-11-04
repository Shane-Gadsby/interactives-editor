import type { AutoLayout, AutoLayoutUnits, LayoutItem, LayoutUnit } from 'interactives-player';
import { layoutInnerWidth } from 'interactives-player';
import type { ContainerNode, FrameNode } from 'interactives-player';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** The unit file only lists percents, so a missing entry is px. */
const unitOf = (u: LayoutUnit | undefined): LayoutUnit => (u === 'percent' ? 'percent' : 'px');

/** The units with the px ones taken out, or undefined when none is left. */
function tidy(u: AutoLayoutUnits): AutoLayoutUnits | undefined {
  const out: AutoLayoutUnits = {};
  if (u.gap === 'percent') out.gap = 'percent';
  if (u.crossGap === 'percent') out.crossGap = 'percent';
  const pad: NonNullable<AutoLayoutUnits['padding']> = {};
  for (const s of ['top', 'right', 'bottom', 'left'] as const) if (u.padding?.[s] === 'percent') pad[s] = 'percent';
  if (Object.keys(pad).length) out.padding = pad;
  return Object.keys(out).length ? out : undefined;
}

export const gapUnit = (L: AutoLayout): LayoutUnit => unitOf(L.units?.gap);
export const paddingUnit = (L: AutoLayout, side: Side): LayoutUnit => unitOf(L.units?.padding?.[side]);
/** The unit the line gap (Row gap in a grid) is in: the gap's own when it has none of its own. */
export const lineGapUnit = (L: AutoLayout): LayoutUnit => (L.crossGap === undefined ? gapUnit(L) : unitOf(L.units?.crossGap));

/** The layout change for a new gap. */
export function patchGap(L: AutoLayout, v: number, unit: LayoutUnit): Partial<AutoLayout> {
  const units = tidy({ ...L.units, gap: unit });
  // A line gap that followed the gap still follows it
  return { gap: v, units };
}

/** The layout change for a new line gap; the same as the gap (value and unit) means it follows the gap again. */
export function patchLineGap(L: AutoLayout, v: number, unit: LayoutUnit): Partial<AutoLayout> {
  if (v === L.gap && unit === gapUnit(L)) return { crossGap: undefined, units: tidy({ ...L.units, crossGap: undefined }) };
  return { crossGap: v, units: tidy({ ...L.units, crossGap: unit }) };
}

/** The layout change for one side of the padding. */
export function patchPadding(L: AutoLayout, side: Side, v: number, unit: LayoutUnit): Partial<AutoLayout> {
  return { padding: { ...L.padding, [side]: v }, units: tidy({ ...L.units, padding: { ...L.units?.padding, [side]: unit } }) };
}

export const marginUnit = (it: LayoutItem | null | undefined, side: Side): LayoutUnit => unitOf(it?.marginUnits?.[side]);

/** The layout item change for one side of the margin. */
export function patchMargin(it: LayoutItem | null | undefined, side: Side, v: number, unit: LayoutUnit): Partial<LayoutItem> {
  const margin = { top: 0, right: 0, bottom: 0, left: 0, ...it?.margin, [side]: v };
  const marginUnits = { ...it?.marginUnits, [side]: unit };
  for (const s of ['top', 'right', 'bottom', 'left'] as const) if (marginUnits[s] !== 'percent') delete marginUnits[s];
  return { margin, marginUnits: Object.keys(marginUnits).length ? marginUnits : undefined };
}

/**
 * The width a percent padding or gap of a frame is a share of: the inner width of the auto-layout frame it sits in, or its own
 * width. `parent` is the frame around it.
 */
export function paddingOwnerWidth(frame: FrameNode, parent: ContainerNode | null | undefined): number {
  return parent && parent.type === 'frame' && parent.layout ? layoutInnerWidth(parent as FrameNode) : frame.width;
}

/** The width a percent margin of a layer is a share of: the inner width of the frame that lays it out. */
export function marginOwnerWidth(parent: ContainerNode | null | undefined): number {
  return parent && parent.type === 'frame' && parent.layout ? layoutInnerWidth(parent as FrameNode) : 0;
}
