/**
 * Text modifier editing on a project draft: adding and removing modifiers (keeping the timelines' tracks that address
 * them by index in step), and the one-click presets that also set up a timeline.
 */
import { defaultModifier, uid, walk, type Artboard, type Keyframe, type Project, type SceneNode, type TextModifier, type Timeline } from 'interactives-player';
import { getArtboard, locate, uniqueName } from '../store/doc';

export type TextPresetId = 'typewriter' | 'wave';

export const TEXT_PRESETS: { id: TextPresetId; label: string; tip: string }[] = [
  { id: 'typewriter', label: 'Typewriter', tip: 'Letters appear one after another: adds a modifier and a timeline that plays on start' },
  { id: 'wave', label: 'Wave', tip: 'A hump of lift and colour that rolls through the letters, looping: adds a modifier and a timeline that plays on start' },
];

type TextLayer = Extract<SceneNode, { type: 'text' }>;

function textNode(ab: Artboard, id: string): TextLayer | null {
  const n = locate(ab, id)?.node;
  return n && n.type === 'text' ? n : null;
}

/** Add a modifier to a text layer; returns its index. */
export function addModifier(p: Project, artboardId: string, nodeId: string, patch: Partial<TextModifier> = {}): number {
  const ab = getArtboard(p, artboardId);
  const n = ab && textNode(ab, nodeId);
  if (!n) return -1;
  n.modifiers ??= [];
  // A new modifier does something visible right away: a hump over the first half that lifts its letters
  n.modifiers.push({ ...defaultModifier({ unit: 'letter', start: 0, end: 50, shape: 'triangle', y: -12 }), ...patch });
  return n.modifiers.length - 1;
}

/** Remove modifier `index`; tracks on it go, and tracks on later ones move down one. */
export function removeModifier(p: Project, artboardId: string, nodeId: string, index: number): void {
  const ab = getArtboard(p, artboardId);
  const n = ab && textNode(ab, nodeId);
  if (!ab || !n?.modifiers || index < 0 || index >= n.modifiers.length) return;
  n.modifiers.splice(index, 1);
  const re = /^modifiers\.(\d+)\.(.+)$/;
  for (const tl of ab.timelines) {
    tl.tracks = tl.tracks.filter((t) => {
      if (t.nodeId !== nodeId) return true;
      const m = re.exec(t.prop);
      if (!m) return true;
      const i = Number(m[1]);
      if (i === index) return false;
      if (i > index) t.prop = `modifiers.${i - 1}.${m[2]}`;
      return true;
    });
  }
}

const key = (t: number, value: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ id: uid('k'), t, value, ease });

/**
 * Typewriter or wave on a text layer: one new modifier plus a new timeline that animates its offset (and plays on start).
 * Returns the timeline's id, or null when the layer isn't text.
 */
export function applyPreset(p: Project, artboardId: string, nodeId: string, preset: TextPresetId): string | null {
  const ab = getArtboard(p, artboardId);
  const n = ab && textNode(ab, nodeId);
  if (!ab || !n) return null;
  let index: number;
  let tl: Timeline;
  const base = { id: uid('tl'), autoplay: true, speed: 1 as number, tracks: [] };
  if (preset === 'typewriter') {
    // Every letter fades out inside a window that covers the whole text; sliding the window off the end reveals them in order
    index = addModifier(p, artboardId, nodeId, { name: 'Typewriter', unit: 'letter', start: 0, end: 100, offset: 0, shape: 'square', opacity: 0 });
    const letters = n.text.replace(/\s/g, '').length;
    const duration = Math.min(10000, Math.max(800, letters * 60));
    tl = { ...base, name: 'Typewriter', duration, loop: 'once', tracks: [{ id: uid('tr'), nodeId, prop: `modifiers.${index}.offset`, keys: [key(0, 0), key(duration, 100)] }] };
  } else {
    // A smooth hump covering 40% of the text lifts the letters it passes over; the window starts and ends off the text, so it loops cleanly
    index = addModifier(p, artboardId, nodeId, { name: 'Wave', unit: 'letter', start: 0, end: 40, offset: -40, shape: 'smooth', y: -14, opacity: 1 });
    tl = { ...base, name: 'Wave', duration: 1800, loop: 'loop', tracks: [{ id: uid('tr'), nodeId, prop: `modifiers.${index}.offset`, keys: [key(0, -40), key(1800, 100)] }] };
  }
  tl.name = uniqueName(ab.timelines.map((t) => t.name), tl.name);
  ab.timelines.push(tl);
  return tl.id;
}

/** Layers of an artboard that are text with modifiers (for tools that need to find them). */
export function modifiedTexts(ab: Artboard): TextLayer[] {
  const out: TextLayer[] = [];
  walk(ab.children, (n) => {
    if (n.type === 'text' && n.modifiers?.length) out.push(n);
  });
  return out;
}
