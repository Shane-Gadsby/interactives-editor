//What the running Preview reports about the interaction graph (the player's `flow` event), kept for a moment so the Interactions
//graph and the canvas can light up: nodes that ran, an "Only if" that said no, the wires followed, the layer a click landed on.
//Editor-only and never saved: nothing here reaches the document, an export or another person editing.
import { useSyncExternalStore } from 'react';

export type FlowItem =
	| { k: 'node'; a: string; id: string; s: 'ran' | 'blocked' }
	| { k: 'edge'; a: string; id: string }
	| { k: 'hit'; a: string; layer: string; name?: string; ran: number; blocked: number };

export interface Flash {
	kind: 'ran' | 'blocked' | 'wire';
	//Changes every time the same thing flashes again, so the animation can start over
	n: number;
	until: number;
}
export interface Hit {
	artboard: string;
	layer: string;
	name?: string;
	ran: number;
	blocked: number;
	n: number;
	at: number;
}

/** How long a node or wire stays lit, and how long the ring round a hit layer shows. */
export const FLASH_MS = 1100;
export const HIT_MS = 700;
//A node that fires every few milliseconds re-lights at most this often (the page's own redraws are what this protects)
const NOTIFY_MS = 80;

const flashes = new Map<string, Flash>();
let hits: Hit[] = [];
let version = 0;
let counter = 0;
const subs = new Set<() => void>();
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;
let lastNotify = 0;
//The newest hit that ran nothing, for the "Why did nothing happen?" line
let lastQuiet: (Hit & { reason: string }) | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function bump(): void {
	version++;
	lastNotify = now();
	subs.forEach((f) => f());
}

function notify(): void {
	if (notifyTimer) return;
	const wait = Math.max(0, NOTIFY_MS - (now() - lastNotify));
	notifyTimer = setTimeout(() => {
		notifyTimer = undefined;
		bump();
	}, wait);
}

//Drop what has run out, and come back when the next thing will
function expire(): void {
	if (expiryTimer) clearTimeout(expiryTimer);
	expiryTimer = undefined;
	const t = now();
	let changed = false;
	let next = Infinity;
	for (const [id, f] of flashes) {
		if (f.until <= t) {
			flashes.delete(id);
			changed = true;
		} else next = Math.min(next, f.until);
	}
	const keep = hits.filter((h) => h.at + HIT_MS > t);
	if (keep.length !== hits.length) {
		hits = keep;
		changed = true;
	}
	for (const h of hits) next = Math.min(next, h.at + HIT_MS);
	if (changed) bump();
	if (next < Infinity) expiryTimer = setTimeout(expire, Math.max(20, next - t + 5));
}

/** Take what the preview sent. */
export function pushFlow(items: FlowItem[]): void {
	if (!Array.isArray(items) || !items.length) return;
	const t = now();
	for (const it of items) {
		if (!it || typeof it !== 'object') continue;
		if (it.k === 'node' || it.k === 'edge') {
			if (typeof it.id !== 'string') continue;
			const kind = it.k === 'edge' ? 'wire' : it.s === 'blocked' ? 'blocked' : 'ran';
			//A node that ran this time and was held back another keeps the newer word; the wire never overrides a node
			flashes.set(it.id, { kind, n: ++counter, until: t + FLASH_MS });
		} else if (it.k === 'hit' && typeof it.layer === 'string') {
			const hit: Hit = { artboard: String(it.a ?? ''), layer: it.layer, name: it.name, ran: Number(it.ran) || 0, blocked: Number(it.blocked) || 0, n: ++counter, at: t };
			hits = [...hits.slice(-4), hit];
			if (hit.ran === 0) lastQuiet = { ...hit, reason: whyNothing(hit) };
			else lastQuiet = null;
		}
	}
	notify();
	if (!expiryTimer) expiryTimer = setTimeout(expire, FLASH_MS + 20);
}

/** The plain-words answer to "I clicked and nothing happened". */
export function whyNothing(h: Pick<Hit, 'layer' | 'name' | 'blocked'>): string {
	if (!h.layer) return 'The click landed on empty space, not on a layer. Nothing is under the pointer there.';
	const who = h.name ? `“${h.name}”` : 'that layer';
	if (h.blocked > 0) return `The click reached ${who} and its event ran, but its “Only if” said no. Check the condition on the event.`;
	return `Nothing listens for a click on ${who}. Select it and use “+ On click” in Interactions, or check the click is on the layer you meant (an upper layer may be in the way).`;
}

/** The newest click that started nothing, with the reason (null once a later click did something). */
export const lastQuietHit = (): (Hit & { reason: string }) | null => lastQuiet;

export const flashOf = (id: string): Flash | null => {
	const f = flashes.get(id);
	return f && f.until > now() ? f : null;
};
/** The class a wire of the graph takes while it is lit (empty when it is not). The two names alternate so a wire that fires again starts over. */
export const wireClass = (id: string): string => {
	const f = flashOf(id);
	return f ? `flash-wire flash-${f.n % 2}` : '';
};
export const currentHits = (): Hit[] => hits.filter((h) => h.at + HIT_MS > now());

export function clearFlow(): void {
	if (notifyTimer) clearTimeout(notifyTimer);
	if (expiryTimer) clearTimeout(expiryTimer);
	notifyTimer = expiryTimer = undefined;
	flashes.clear();
	hits = [];
	lastQuiet = null;
	bump();
}

const subscribe = (f: () => void) => {
	subs.add(f);
	return () => subs.delete(f);
};
/** A number that changes when anything lit or went out: components read `flashOf` and `currentHits` after it. */
export const useFlowVersion = (): number => useSyncExternalStore(subscribe, () => version);
//Tests
export const flowVersion = () => version;
