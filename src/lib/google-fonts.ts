import data from '../data/google-fonts.json';

/**
 * Every Google Fonts family name, so importers can tell a Google font from a local one and load it. It is the same list the font
 * picker searches (src/data/google-fonts.json); `node scripts/google-fonts.mjs` refreshes it from fonts.google.com/metadata/fonts.
 */
export const GOOGLE_FONT_FAMILIES: string[] = (data.fonts as unknown as [string, string, number[]][]).map((f) => f[0]);
