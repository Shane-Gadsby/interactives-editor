import type { Keyframe, Timeline } from 'interactives-player';

/*
 * "Stays in sync" dips: the keys a Swap text dip makes can carry `dipOf` (the id of the text key they were made around) and
 * `dipOff` (how far from it, in ms). Move that text key and they move with it; delete it and they go. Edit one of them by hand
 * (drag it on its own, type a new time or value) and that key lets go and is an ordinary key from then on.
 */

export const DIP_SYNC_PREF = 'ix.dipSync';

/** Whether new dips keep to their text key. On unless the person turned it off (a per-browser choice, like the other timeline toggles). */
export function dipSyncOn(): boolean {
  try {
    return localStorage.getItem(DIP_SYNC_PREF) !== '0';
  } catch {
    return true;
  }
}

export function setDipSync(on: boolean): void {
  try {
    localStorage.setItem(DIP_SYNC_PREF, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}

export const isDipKey = (k: Keyframe): boolean => typeof k.dipOf === 'string' && typeof k.dipOff === 'number';

export function letGo(k: Keyframe): void {
  delete k.dipOf;
  delete k.dipOff;
}

/** Every key tied to the text key `textKeyId`, with the track it is on. */
export function dipKeysOf(tl: Pick<Timeline, 'tracks'>, textKeyId: string): { trackId: string; key: Keyframe }[] {
  return tl.tracks.flatMap((tr) => tr.keys.filter((k) => k.dipOf === textKeyId).map((key) => ({ trackId: tr.id, key })));
}

/** Take away the keys tied to a text key (a dip made again, or the text key deleted). Tracks left empty go. */
export function dropDipOf(tl: Timeline, textKeyId: string): number {
  let n = 0;
  for (const tr of tl.tracks) {
    const before = tr.keys.length;
    tr.keys = tr.keys.filter((k) => k.dipOf !== textKeyId);
    n += before - tr.keys.length;
  }
  tl.tracks = tl.tracks.filter((tr) => tr.keys.length);
  return n;
}

/** Whether a key with this id is a text key that has a dip tied to it. */
export const hasDip = (tl: Pick<Timeline, 'tracks'>, keyId: string): boolean => tl.tracks.some((tr) => tr.keys.some((k) => k.dipOf === keyId));

const clamp = (tl: Pick<Timeline, 'duration'>, t: number) => Math.max(0, Math.min(tl.duration, Math.round(t)));

/**
 * The text key `textKeyId` just went from `from` to `to`: its dip keys shift by the same amount, except those in `skip` (keys
 * already moving in the same drag). Keys that would leave the timeline stop at its ends.
 */
export function followText(tl: Timeline, textKeyId: string, from: number, to: number, skip: Set<string> = new Set()): void {
  if (from === to) return;
  for (const { key } of dipKeysOf(tl, textKeyId)) if (!skip.has(key.id)) key.t = clamp(tl, key.t + (to - from));
  for (const tr of tl.tracks) tr.keys.sort((a, b) => a.t - b.t);
}

/** Delete keys by id, and with each text key its dip. Returns how many dip keys went with them. */
export function removeKeysAndDips(tl: Timeline, refs: Set<string>): number {
  const textIds = new Set<string>();
  for (const tr of tl.tracks) for (const k of tr.keys) if (refs.has(`${tr.id}:${k.id}`) && hasDip(tl, k.id)) textIds.add(k.id);
  for (const tr of tl.tracks) tr.keys = tr.keys.filter((k) => !refs.has(`${tr.id}:${k.id}`));
  let n = 0;
  for (const id of textIds) n += dropDipOf(tl, id);
  tl.tracks = tl.tracks.filter((tr) => tr.keys.length);
  return n;
}

/** What a drag of `starts` (key id to its time when the press began) has to do about dips, worked out once at the press. */
export interface DipDrag {
  /** Dip keys not in the drag whose text key is: they ride along, so where they began. */
  rides: { id: string; of: string; t0: number }[];
  /** Dip keys in the drag whose text key is not: dragging one on its own is a hand edit, so it lets go once it has moved. */
  lone: { id: string; t0: number }[];
}

export function planDipDrag(tl: Pick<Timeline, 'tracks'>, starts: Map<string, number>): DipDrag {
  const plan: DipDrag = { rides: [], lone: [] };
  for (const tr of tl.tracks) {
    for (const k of tr.keys) {
      if (!isDipKey(k)) continue;
      const mine = starts.has(k.id);
      if (!mine && starts.has(k.dipOf!)) plan.rides.push({ id: k.id, of: k.dipOf!, t0: k.t });
      else if (mine && !starts.has(k.dipOf!)) plan.lone.push({ id: k.id, t0: k.t });
    }
  }
  return plan;
}

/** Called after each step of the drag has put the dragged keys where they go (`moved`: key id to its new time). */
export function applyDipDrag(tl: Timeline, plan: DipDrag, starts: Map<string, number>, moved: Map<string, number>): void {
  if (!plan.rides.length && !plan.lone.length) return;
  const loose = new Set(plan.lone.filter((l) => moved.get(l.id) !== l.t0).map((l) => l.id));
  for (const tr of tl.tracks) {
    for (const k of tr.keys) {
      if (loose.has(k.id)) letGo(k);
      const ride = plan.rides.find((r) => r.id === k.id);
      if (ride) k.t = clamp(tl, ride.t0 + (moved.get(ride.of)! - starts.get(ride.of)!));
    }
    tr.keys.sort((a, b) => a.t - b.t);
  }
}
