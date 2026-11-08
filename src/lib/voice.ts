import { createNode, defaultParams, uid, type Artboard, type Asset, type FrameNode, type LogicNode, type Project, type Question, type QuestionVoice } from 'interactives-player';
import { locate, nodeNames, uniqueName } from '../store/doc';
import { questionFrames, setKitOptions } from './question-kit';
import { lookFor } from './themes';

/**
 * The synthesised voice for the Spelling test. The word is turned into speech on the server while someone is authoring (voice.js), comes
 * back as a wav and is stored as an ordinary sound asset picked in the word's Play sound node, so the page a learner is served has the
 * sound and never the word. Everything here is the editor's side: asking the server, working out what to say, and writing the result into
 * the document.
 */

export interface VoiceInfo {
  id: string;
  name: string;
  gender: string;
  accent: string;
}

export interface VoiceStatus {
  /** `ready`, `missing` (not downloaded yet), `installing`, `failed`, `unsupported` (no speech engine on this server) */
  state: 'ready' | 'missing' | 'installing' | 'failed' | 'unsupported';
  voices: VoiceInfo[];
  defaultVoice: string;
  model: { name: string; licence: string; megabytes: number };
  error?: string;
  done?: number;
  total?: number;
}

export class VoiceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export const DEFAULT_SPEED = 0.9;
export const SPEED_RANGE = { min: 0.6, max: 1.3 } as const;

const API = () => new URL('api/voice', document.baseURI).href;

export async function voiceStatus(): Promise<VoiceStatus> {
  const res = await fetch(API(), { credentials: 'same-origin' });
  if (!res.ok) throw new VoiceError('Could not ask the server about the voice.', 'failed');
  return (await res.json()) as VoiceStatus;
}

export async function installVoice(): Promise<VoiceStatus> {
  const res = await fetch(`${API()}/install`, { method: 'POST', credentials: 'same-origin' });
  if (!res.ok) throw new VoiceError('Could not start setting up the voice.', 'failed');
  return (await res.json()) as VoiceStatus;
}

/** What the voice says, as a wav. Throws a VoiceError with the server's plain-English reason. */
export async function speak(parts: string[], voice: string | undefined, speed: number | undefined): Promise<Blob> {
  const res = await fetch(`${API()}/speak`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts, voice, speed }),
  });
  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new VoiceError(body.error || 'The voice failed to make that. Try again.', body.code || 'failed');
  }
  return await res.blob();
}

// ---------------------------------------------------------------------------
// What to say

/** The word of a spelling question: its first accepted spelling. Empty when nothing is typed yet. */
export function wordOf(q: Question): string {
  const blank = q.blanks.find((b) => b.spelling) ?? q.blanks[0];
  return (blank?.answers.find((a) => a.trim()) ?? '').trim();
}

/** The pieces the voice reads, in order: the word (or how it sounds), the sentence, the word again. Never empty text. */
export function partsFor(q: Question): string[] {
  const v = q.voice ?? {};
  const word = (v.say?.trim() || wordOf(q)).trim();
  if (!word) return [];
  const parts = [word];
  if (v.sentence?.trim()) parts.push(v.sentence.trim());
  if (v.twice) parts.push(word);
  return parts;
}

/** A question that has a word to say: a spelling blank with something typed in it. */
export const isWord = (q: Question | undefined | null): q is Question => !!q && q.kind === 'blank' && q.blanks.some((b) => b.spelling) && !!wordOf(q);

/** Every spelling word in the project, in page order, with the page each is on. */
export function wordsIn(p: Project): { ab: Artboard; frame: FrameNode }[] {
  const out: { ab: Artboard; frame: FrameNode }[] = [];
  for (const ab of p.artboards) for (const frame of questionFrames(ab)) if (isWord(frame.question)) out.push({ ab, frame });
  return out;
}

/** The words whose audio the voice makes: the ones set to the author's own audio are left out. */
export const voiceWordsIn = (p: Project): { ab: Artboard; frame: FrameNode }[] => wordsIn(p).filter((w) => !w.frame.question?.voice?.own);

/** The word's audio is the author's own file or recording, not the made voice. */
export const usesOwnAudio = (q: Question | undefined | null): boolean => !!q?.voice?.own && !q.voice.device;

/**
 * The file's name gives the word away: Preview and an exported file keep an asset's name where a learner can read it (the share link renames
 * audio to a plain one), and the word is only meant to be in the audio. Letters only, so `Colour_1.mp3` and `colour` meet. A word under three letters is not worth
 * warning about (every file name has a, an or it in it).
 */
export function ownAudioNameProblem(q: Question, fileName: string): string | null {
  const word = wordOf(q).toLowerCase().replace(/[^\p{L}]+/gu, '');
  if (word.length < 3) return null;
  const name = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^\p{L}]+/gu, '');
  return name.includes(word) ? `The file is called "${fileName}", which has the word in it. The share link renames audio to a plain name, but Preview and an exported file keep it, so rename the file (to a number, say) before you use it.` : null;
}

// ---------------------------------------------------------------------------
// Writing it into the document (every one of these runs inside a store update)

const SOUND = 'action.sound';
const SPEAK = 'action.speak';

/** The nodes a word's audio can go into: Play sound nodes, and the Read aloud node practice mode turns one into. */
export const soundNodes = (ab: Artboard): LogicNode[] => ab.logic.nodes.filter((n) => n.kind === SOUND || (n.kind === SPEAK && n.params.op === 'text'));

/** The Play sound node for a word: the one it remembers, else the only one on the page. Null when there is none or it is not clear. */
export function targetNode(ab: Artboard, q: Question): LogicNode | null {
  const all = soundNodes(ab);
  const own = q.voice?.node && all.find((n) => n.id === q.voice!.node);
  if (own) return own;
  return all.length === 1 ? all[0] : null;
}

/** The expression a Read aloud node says for practice mode: the word, as text. */
export const speakText = (q: Question): string => JSON.stringify(wordOf(q));

const withVoice = (q: Question, patch: Partial<QuestionVoice>): QuestionVoice => {
  const merged: Record<string, unknown> = { ...(q.voice ?? {}), ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined || merged[k] === '' || merged[k] === false) delete merged[k];
  return merged as QuestionVoice;
};

/** Change the word's voice settings (an empty one is dropped, and with it the whole record when nothing is left). */
export function setVoice(d: Project, abId: string, frameId: string, patch: Partial<QuestionVoice>): void {
  const frame = frameOf(d, abId, frameId);
  if (!frame) return;
  const next = withVoice(frame.question!, patch);
  const q = { ...frame.question! };
  if (Object.keys(next).length) q.voice = next;
  else delete q.voice;
  frame.question = q;
}

function frameOf(d: Project, abId: string, frameId: string): FrameNode | null {
  const ab = d.artboards.find((a) => a.id === abId);
  const f = ab && locate(ab, frameId)?.node;
  return f && f.type === 'frame' && f.question ? f : null;
}

/** Does anything in the project but the asset list name this asset (as a whole id, also inside a list variable's JSON text)? */
const stillUsed = (d: Project, id: string): boolean => {
  const text = JSON.stringify({ ...d, assets: [] });
  return text.includes(`"${id}"`) || text.includes(`\\"${id}\\"`);
};

/**
 * Put the made audio in the word's Play sound node, and remember the node and the asset on the question. A word that already had audio from
 * the voice gives it up: its record goes when nothing else in the project uses it (a duplicated page can share one), though the file stays
 * on the server until Remove unused assets, so an undo brings it back.
 */
export function applyAudio(d: Project, abId: string, frameId: string, asset: Asset, nodeId: string): boolean {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  const node = ab?.logic.nodes.find((n) => n.id === nodeId);
  if (!ab || !frame || !node) return false;
  //A word on its own audio is not made again: the made file would take the node over
  if (usesOwnAudio(frame.question)) return false;
  const old = frame.question!.voice?.asset;
  if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
  if (node.kind === SOUND) node.params = { ...node.params, asset: asset.id };
  setVoice(d, abId, frameId, { node: nodeId, asset: asset.id });
  if (old && old !== asset.id && !stillUsed(d, old)) d.assets = d.assets.filter((a) => a.id !== old);
  return true;
}

/**
 * Choose where the word's audio comes from: the made voice, or the author's own file. The Play sound node is the same either way, so
 * the page's wiring does not change; it just gets the other file. Neither file is ever deleted by this, and the voice settings stay.
 */
export function setAudioSource(d: Project, abId: string, frameId: string, own: boolean): boolean {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  if (!ab || !frame) return false;
  setVoice(d, abId, frameId, { own });
  const q = frameOf(d, abId, frameId)!.question!;
  const node = targetNode(ab, q);
  if (node && node.kind === SOUND) node.params = { ...node.params, asset: (own ? q.voice?.ownAsset : q.voice?.asset) ?? '' };
  return true;
}

/** The author's own audio for a word: put in the word's Play sound node, and remembered on the question apart from the made audio. */
export function setOwnAudio(d: Project, abId: string, frameId: string, asset: Asset, nodeId: string): boolean {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  const node = ab?.logic.nodes.find((n) => n.id === nodeId);
  if (!ab || !frame || !node) return false;
  if (!d.assets.some((a) => a.id === asset.id)) d.assets.push(asset);
  if (node.kind === SOUND) node.params = { ...node.params, asset: asset.id };
  setVoice(d, abId, frameId, { own: true, ownAsset: asset.id, node: nodeId });
  return true;
}

/** Practice mode on or off: the Play node reads the word aloud with the learner's device, or goes back to playing the made audio. */
export function setPractice(d: Project, abId: string, frameId: string, on: boolean): boolean {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  if (!ab || !frame) return false;
  const node = targetNode(ab, frame.question!);
  const q = { ...frame.question! };
  if (on) {
    //The word is in the page then, so the server cannot keep it back: marked in the page, no grade sent
    delete q.serverMarked;
    q.voice = withVoice(q, { device: true, node: node?.id ?? q.voice?.node });
    frame.question = q;
    if (node) {
      node.kind = SPEAK;
      node.params = { ...defaultParams(SPEAK), op: 'text', text: speakText(q), wait: false };
    }
  } else {
    const next = withVoice(q, { device: false });
    if (Object.keys(next).length) q.voice = next;
    else delete q.voice;
    frame.question = q;
    if (node && node.kind === SPEAK) {
      node.kind = SOUND;
      node.params = { ...defaultParams(SOUND), asset: (q.voice?.own ? q.voice.ownAsset : q.voice?.asset) ?? '', volume: 1 };
    }
  }
  return true;
}

/** Practice mode says the word typed in the question, so it follows the word when that is edited. */
export function syncPractice(d: Project, abId: string, frameId: string): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  if (!ab || !frame?.question?.voice?.device) return;
  const node = ab.logic.nodes.find((n) => n.id === frame.question!.voice!.node && n.kind === SPEAK);
  if (node) node.params = { ...node.params, text: speakText(frame.question) };
}

/**
 * A Play the word button for a word that has none: a button in the question card at the right of the prompt (the kit's prompt row,
 * ahead of the Hint pill), and the click that plays a Play sound node (the audio goes into it when it is made). Returns the node's id.
 */
export function addPlayButton(d: Project, abId: string, frameId: string): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = frameOf(d, abId, frameId);
  if (!ab || !frame) return null;
  const L = lookFor(d.themes);
  const names = nodeNames(ab);
  const button = createNode('button', {
    name: uniqueName(names, 'Play word button'),
    label: 'Play the word',
    x: frame.x,
    y: Math.max(0, frame.y - 64),
    width: 170,
    height: 40,
    cornerRadius: 20,
    fill: { type: 'solid', color: L.surfaceMuted },
    color: L.text,
    ariaLabel: 'Play the word',
  });
  //In the card beside the prompt, the same place the Spelling test starter puts its own; a frame with no prompt to sit beside
  //(an odd hand-built one) gets it above instead, as before
  setKitOptions(d, abId, frameId, { titleControls: [button] });
  if (!locate(ab, button.id)) ab.children.push(button);
  const y = ab.logic.nodes.length ? Math.max(...ab.logic.nodes.map((n) => n.y)) + 160 : 40;
  const mk = (kind: string, x: number, params: Record<string, unknown>, note?: string): LogicNode => ({ id: uid('l'), kind, x, y, params: { ...defaultParams(kind), ...params }, ...(note ? { note } : {}) });
  const click = mk('event.pointer', 0, { target: button.id, type: 'click' }, 'Say the word');
  const play = mk(SOUND, 300, { asset: '', volume: 1 });
  ab.logic.nodes.push(click, play);
  ab.logic.edges.push({ id: uid('e'), from: click.id, fromPort: 'out', to: play.id, toPort: 'in' });
  setVoice(d, abId, frameId, { node: play.id });
  return play.id;
}
