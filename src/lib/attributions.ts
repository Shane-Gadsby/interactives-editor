import { uid, type Asset, type Attribution, type AttributionKind, type CreditsSettings, type Project } from 'interactives-player';
import { assetKind } from './assets';

//Edits to the project's attributions and credits settings, written to work on an immer draft (store().update) or a plain project.

/** The entry's kind for a file: pictures are images, video and sound media, data files data, the rest other. */
export function kindForAsset(asset: Pick<Asset, 'mime' | 'name'>): AttributionKind {
  const k = assetKind(asset.mime, asset.name);
  return k === 'image' ? 'image' : k === 'video' || k === 'audio' ? 'media' : k === 'data' ? 'data' : 'other';
}

/** Drop the list (and the credits settings) from the document when they hold nothing, so a project that never used them carries nothing. */
export function tidy(p: Project): void {
  if (p.attributions && !p.attributions.length) delete p.attributions;
  const c = p.settings.credits;
  if (c && !c.button && !c.inExports && !c.heading) delete p.settings.credits;
}

/** Add an entry (at the end), returning its id. */
export function addAttribution(p: Project, init: Partial<Omit<Attribution, 'id'>> = {}): string {
  const entry: Attribution = { id: uid('at'), kind: 'image', title: '', ...init };
  (p.attributions ??= []).push(entry);
  return entry.id;
}

const TEXT_FIELDS = ['title', 'creator', 'url', 'licence', 'year', 'notes'] as const;
type TextField = (typeof TEXT_FIELDS)[number];

/** Change an entry. An optional text field set to nothing is taken out of the document; the title stays (as ''). */
export function setAttribution(p: Project, id: string, patch: Partial<Record<TextField, string>> & { kind?: AttributionKind }): void {
  const e = p.attributions?.find((x) => x.id === id);
  if (!e) return;
  if (patch.kind) e.kind = patch.kind;
  for (const k of TEXT_FIELDS) {
    const v = patch[k];
    if (v === undefined) continue;
    if (k === 'title') e.title = v;
    else if (v.trim()) e[k] = v;
    else delete e[k];
  }
}

export function removeAttribution(p: Project, id: string): void {
  if (!p.attributions) return;
  p.attributions = p.attributions.filter((x) => x.id !== id);
  tidy(p);
}

/** Move an entry one place up or down the list. */
export function moveAttribution(p: Project, id: string, by: -1 | 1): void {
  const list = p.attributions;
  const i = list?.findIndex((x) => x.id === id) ?? -1;
  if (!list || i < 0 || i + by < 0 || i + by >= list.length) return;
  const [e] = list.splice(i, 1);
  list.splice(i + by, 0, e);
}

export function linkAsset(p: Project, id: string, assetId: string): void {
  const e = p.attributions?.find((x) => x.id === id);
  if (!e || !p.assets.some((a) => a.id === assetId) || e.assetIds?.includes(assetId)) return;
  (e.assetIds ??= []).push(assetId);
}

export function unlinkAsset(p: Project, id: string, assetId: string): void {
  const e = p.attributions?.find((x) => x.id === id);
  if (!e?.assetIds) return;
  e.assetIds = e.assetIds.filter((a) => a !== assetId);
  if (!e.assetIds.length) delete e.assetIds;
}

/** An entry for one file, named after it. Returns its id, or the id of the entry that already covers the file. */
export function attributionForAsset(p: Project, assetId: string): string | null {
  const asset = p.assets.find((a) => a.id === assetId);
  if (!asset) return null;
  const have = p.attributions?.find((e) => e.assetIds?.includes(assetId));
  if (have) return have.id;
  return addAttribution(p, { kind: kindForAsset(asset), title: asset.name.replace(/\.[^.]+$/, ''), assetIds: [assetId] });
}

/** One entry per file that has none, returning how many were made. */
export function addForUncovered(p: Project): number {
  const covered = new Set<string>();
  for (const e of p.attributions ?? []) for (const id of e.assetIds ?? []) covered.add(id);
  let n = 0;
  for (const a of p.assets) {
    if (covered.has(a.id)) continue;
    addAttribution(p, { kind: kindForAsset(a), title: a.name.replace(/\.[^.]+$/, ''), assetIds: [a.id] });
    n++;
  }
  return n;
}

/** Take a deleted file's id off every entry. */
export function forgetAssets(p: Project, assetIds: string[]): void {
  for (const e of p.attributions ?? []) {
    if (!e.assetIds?.some((a) => assetIds.includes(a))) continue;
    e.assetIds = e.assetIds.filter((a) => !assetIds.includes(a));
    if (!e.assetIds.length) delete e.assetIds;
  }
}

/** Turn the Credits button or the exports option on or off. */
export function setCredits(p: Project, patch: Partial<CreditsSettings>): void {
  const next: CreditsSettings = { ...p.settings.credits };
  for (const [k, v] of Object.entries(patch) as [keyof CreditsSettings, unknown][]) {
    if (v === undefined || v === false || v === '') delete next[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  if (Object.keys(next).length) p.settings.credits = next;
  else delete p.settings.credits;
}

//Where the panel should scroll to and focus (the Assets panel's "Credit" button opens it on one entry). Read with
//useSyncExternalStore so it works whether the panel is already showing or only mounts afterwards
let wanted: string | null = null;
const listeners = new Set<() => void>();
export const focusEntryNext = (id: string | null): void => {
  wanted = id;
  for (const fn of listeners) fn();
};
export const peekFocusEntry = (): string | null => wanted;
export const subscribeFocusEntry = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
