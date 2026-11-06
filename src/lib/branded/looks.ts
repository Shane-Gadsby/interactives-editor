/**
 * The colourways of the branded starter packs, from the UniSQ PowerPoint templates (purple #3C2D4D, gold #FFB448, red
 * #CC3B40, peach #FFE9DD, the warm greys; the type is Open Sans, the suite's font, not their Arial) and the shared palette's gradient pairs (--gold-gradient-1/2 and the rest).
 *
 * Every branded project carries all of them as themes, so the author (Themes tab) or a learner (a "Set theme" toggle) can
 * swap the whole piece from gold to purple to blue live: each colourway sets the same tokens, and every layer paints with
 * tokens. Content pages stay white or warm grey in every colourway; the colourway is the hero pages, the sweeps, the
 * header bar, the buttons and the accents.
 */
import type { LookKey } from 'interactives-player';

export type BrandKey = 'gradientStart' | 'gradientEnd' | 'onGradient' | 'deep' | 'onDeep' | 'accent' | 'warm' | 'logoMark' | 'logoText' | 'logoMarkOnLight' | 'logoTextOnLight';

export interface Colourway {
  id: string;
  name: string;
  /** One line for the picker. */
  description: string;
  /** The starter tokens this colourway changes. */
  tokens: Partial<Record<LookKey, string>>;
  brand: Record<BrandKey, string>;
}

const PURPLE = '#3c2d4d';
const GOLD = '#ffb448';
const INK = '#2d2d2d';
const WHITE = '#ffffff';
const PEACH = '#ffe9dd';

/** What every colourway shares: the content pages, from the PowerPoint template's light theme. */
export const CONTENT_TOKENS: Partial<Record<LookKey, string>> = {
  background: WHITE,
  surface: '#f4f3f0',
  surfaceMuted: '#dddcd7',
  text: INK,
  muted: '#6e6964',
  border: '#b4aea7',
  divider: '#dddcd7',
  link: '#0563c1',
  success: '#3e8521',
  successSurface: '#e6f0e1',
  error: '#cc3b40',
  errorSurface: '#f8e1e2',
  warning: '#ed6a21',
  warningSurface: '#fdeadf',
};

const way = (id: string, name: string, description: string, start: string, end: string, button: string, onButton: string, onGradient: string, accent: string, logoMark: string, logoText: string): Colourway => ({
  id,
  name,
  description,
  tokens: { primary: button, button, onButton, focus: accent === GOLD ? '#fb9400' : button, onPrimary: onButton },
  brand: { gradientStart: start, gradientEnd: end, onGradient, deep: PURPLE, onDeep: WHITE, accent, warm: PEACH, logoMark, logoText, logoMarkOnLight: GOLD, logoTextOnLight: PURPLE },
});

/** In the order the picker shows them. The first is the default. */
export const COLOURWAYS: Colourway[] = [
  way('gold', 'Gold', 'Gold gradient with purple, like the UniSQ title slides.', '#f58220', GOLD, PURPLE, WHITE, PURPLE, PURPLE, PURPLE, PURPLE),
  way('purple', 'Purple', 'Deep purple with gold, the UniSQ dark slides.', PURPLE, '#775d94', GOLD, INK, WHITE, GOLD, GOLD, WHITE),
  way('blue', 'Blue', 'The palette blue gradient, gold accents.', '#00497d', '#0080a8', '#00497d', WHITE, WHITE, GOLD, GOLD, WHITE),
  way('green', 'Green', 'The palette green gradient, for science and health.', '#0e6a6f', '#3e8521', '#0e6a6f', WHITE, WHITE, GOLD, GOLD, WHITE),
  way('orange', 'Orange', 'The palette orange gradient, warm and bold.', '#d0372b', '#ed6a21', '#b52f24', WHITE, WHITE, GOLD, GOLD, WHITE),
  way('red', 'Red', 'The template red, for feature pieces.', '#cc3b40', '#eb6559', '#cc3b40', WHITE, WHITE, GOLD, GOLD, WHITE),
];

/** The extra theme every branded project has, for viewers who ask for more contrast. */
export const HIGH_CONTRAST: Colourway = {
  id: 'high-contrast',
  name: 'High contrast',
  description: 'Black and white with gold, for viewers who ask for more contrast.',
  tokens: { background: '#000000', surface: '#000000', surfaceMuted: '#1e1e1e', text: WHITE, muted: WHITE, border: WHITE, divider: WHITE, primary: GOLD, button: GOLD, onButton: '#000000', onPrimary: '#000000', focus: WHITE, link: '#9fd1ff' },
  brand: { gradientStart: '#000000', gradientEnd: '#000000', onGradient: WHITE, deep: '#000000', onDeep: WHITE, accent: GOLD, warm: '#000000', logoMark: GOLD, logoText: WHITE, logoMarkOnLight: GOLD, logoTextOnLight: WHITE },
};

export const colourwayById = (id: string): Colourway | undefined => [...COLOURWAYS, HIGH_CONTRAST].find((c) => c.id === id);

/** Open Sans everywhere (the suite's font), not the PowerPoint templates' Arial. */
export const BRAND_FONT = 'Open Sans';
