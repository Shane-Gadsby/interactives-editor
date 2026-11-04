import { BLEND_MODES, PAINT_BLEND_MODES, type BlendMode } from 'interactives-player';

/** What the blend pickers call each mode. */
export const BLEND_LABEL: Record<BlendMode, string> = {
  normal: 'Normal',
  dissolve: 'Dissolve',
  darken: 'Darken',
  multiply: 'Multiply',
  'color-burn': 'Colour burn',
  lighten: 'Lighten',
  screen: 'Screen',
  'color-dodge': 'Colour dodge',
  'plus-lighter': 'Add (linear dodge)',
  overlay: 'Overlay',
  'soft-light': 'Soft light',
  'hard-light': 'Hard light',
  difference: 'Difference',
  exclusion: 'Exclusion',
  hue: 'Hue',
  saturation: 'Saturation',
  color: 'Colour',
  luminosity: 'Luminosity',
};

export const LAYER_BLEND_OPTIONS = BLEND_MODES.map((value) => ({ value, label: BLEND_LABEL[value] }));
export const PAINT_BLEND_OPTIONS = PAINT_BLEND_MODES.map((value) => ({ value, label: BLEND_LABEL[value] }));

/**
 * Design apps' PascalCase blend names (PDF / Illustrator `/BM`, VectorCraft and PhotoCraft files) as ours. Dissolve is
 * only meant for layers; a paint that asks for it gets normal.
 */
export const PASCAL_BLENDS: Record<string, BlendMode> = {
  Multiply: 'multiply',
  Screen: 'screen',
  Overlay: 'overlay',
  Darken: 'darken',
  Lighten: 'lighten',
  ColorDodge: 'color-dodge',
  ColorBurn: 'color-burn',
  HardLight: 'hard-light',
  SoftLight: 'soft-light',
  Difference: 'difference',
  Exclusion: 'exclusion',
  Hue: 'hue',
  Saturation: 'saturation',
  Color: 'color',
  Luminosity: 'luminosity',
  LinearDodge: 'plus-lighter',
  Add: 'plus-lighter',
  Dissolve: 'dissolve',
};
/** The same, for paints. */
export const PASCAL_PAINT_BLENDS: Record<string, BlendMode> = Object.fromEntries(Object.entries(PASCAL_BLENDS).filter(([, m]) => m !== 'dissolve'));
