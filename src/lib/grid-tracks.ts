import type { GridTrack } from 'interactives-player';

/** A grid's tracks as the text you edit them in: `100px 25% 1fr auto`. */
export function formatTracks(tracks: GridTrack[]): string {
  return tracks.map((t) => (t.type === 'auto' ? 'auto' : `${Math.round((t.value ?? 0) * 100) / 100}${t.type === 'percent' ? '%' : t.type}`)).join(' ');
}

/** Tracks from text like `100px 25% 1fr auto`. A bare number is px; anything else that doesn't read as a size is left out. */
export function parseTracks(text: string): GridTrack[] {
  const out: GridTrack[] = [];
  for (const word of text.trim().split(/[\s,]+/)) {
    if (!word) continue;
    if (/^auto$/i.test(word)) {
      out.push({ type: 'auto' });
      continue;
    }
    const m = /^(\d+(?:\.\d+)?)(px|%|fr)?$/i.exec(word);
    if (!m) continue;
    const unit = (m[2] ?? 'px').toLowerCase();
    out.push({ type: unit === '%' ? 'percent' : (unit as 'px' | 'fr'), value: Number(m[1]) });
  }
  return out;
}

/** The words of a track list that are not a size, so the box can say what it did not understand. `ignoreLast` leaves out a last word that is still being typed ("1f" on its way to "1fr"). */
export function trackProblems(text: string, ignoreLast = false): string[] {
  const words = text.trim().split(/[\s,]+/).filter(Boolean);
  if (ignoreLast && words.length && !/[\s,]$/.test(text)) words.pop();
  return words.filter((w) => parseTracks(w).length === 0);
}
