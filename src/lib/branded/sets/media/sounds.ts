//Placeholder sounds for the listen and capture starters: short tones made here, as tiny WAV files, so a starter plays something the
//moment it opens. They are assets like any other (the author swaps each for a real clip with the arrow on the asset). The starter
//carries them as data: addresses, and the editor uploads them when the project is made (see takeInlineAssets in ../../index.ts).
import { uid, type Asset, type Project } from 'interactives-player';

const RATE = 8000;

/** One note: a sine at `hz` for `ms`, with a quick fade in and a fade out so it does not click. `wobble` makes it buzz (a tremolo, in Hz). */
export interface Note {
  hz: number;
  ms: number;
  /** Silence (ms) after the note. */
  gap?: number;
  /** Tremolo speed in Hz: 0 or missing is a clean tone. */
  wobble?: number;
  /** Quieter or louder, 0 to 1. */
  level?: number;
}

/** The samples of a run of notes, 8 bit, centred on 128. */
export function renderNotes(notes: Note[]): Uint8Array {
  const parts: number[] = [];
  for (const n of notes) {
    const len = Math.round((n.ms / 1000) * RATE);
    const fade = Math.min(Math.round(RATE * 0.02), len >> 1);
    for (let i = 0; i < len; i++) {
      const edge = Math.min(1, i / fade, (len - i) / fade);
      const decay = 1 - 0.5 * (i / len);
      const trem = n.wobble ? 0.55 + 0.45 * Math.sin((2 * Math.PI * n.wobble * i) / RATE) : 1;
      const v = Math.sin((2 * Math.PI * n.hz * i) / RATE) * edge * decay * trem * (n.level ?? 0.7);
      parts.push(Math.round(128 + v * 120));
    }
    for (let i = 0; i < Math.round(((n.gap ?? 0) / 1000) * RATE); i++) parts.push(128);
  }
  return Uint8Array.from(parts);
}

/** A mono 8 bit WAV file around the samples. */
export function wavBytes(samples: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + samples.length);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples.length, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  tag(36, 'data');
  v.setUint32(40, samples.length, true);
  out.set(samples, 44);
  return out;
}

const base64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * Adds a placeholder sound to the project's assets and returns its id, for a Play sound node. The record carries the file as a
 * `data:` address until the editor uploads it.
 */
export function addPlaceholderSound(project: Project, name: string, notes: Note[]): string {
  const bytes = wavBytes(renderNotes(notes));
  const asset: Asset = { id: uid('as'), name, mime: 'audio/wav', size: bytes.length, src: `data:audio/wav;base64,${base64(bytes)}` };
  project.assets.push(asset);
  return asset.id;
}
