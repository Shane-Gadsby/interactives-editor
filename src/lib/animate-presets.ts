//Fade in, Slide in, Pop, Pulse, Shake, Fade out on any layer. A preset writes what you would write by hand: one timeline named for
//the layer ("Title: fade in") with ordinary keyframes, and the event that starts it (On start, or On pointer click) wired to a
//Control timeline step. Nothing hidden: the Timeline and Interactions tabs show and edit all of it.
import { defaultParams, getPath, uid, walk, type Artboard, type Easing, type Keyframe, type Project, type SceneNode, type Timeline, type Track } from 'interactives-player';
import { getArtboard, uniqueName } from '../store/doc';
import { writeFlow } from './click-flow';

export type AnimPresetId = 'fadeIn' | 'slideIn' | 'pop' | 'pulse' | 'shake' | 'fadeOut';
export type AnimWhen = 'start' | 'click';
export type AnimSide = 'left' | 'right' | 'top' | 'bottom';

export interface AnimOptions {
	/** The page opens (default) or the layer is clicked. */
	when?: AnimWhen;
	/** Slide in: the side it arrives from (default left). */
	from?: AnimSide;
	/** Milliseconds the animation takes (each preset has its own default). */
	duration?: number;
	/** Milliseconds to wait before it starts (default 0). */
	delay?: number;
}

export interface AnimPreset {
	id: AnimPresetId;
	label: string;
	tip: string;
	/** The name suffix of its timeline ("Title: fade in"). */
	slug: string;
	duration: number;
}

export const ANIM_PRESETS: AnimPreset[] = [
	{ id: 'fadeIn', label: 'Fade in', slug: 'fade in', duration: 600, tip: 'The layer starts clear and fades up to how it is now' },
	{ id: 'slideIn', label: 'Slide in', slug: 'slide in', duration: 600, tip: 'The layer glides in from a side while it fades up' },
	{ id: 'pop', label: 'Pop', slug: 'pop', duration: 450, tip: 'The layer springs up from small, with a little overshoot' },
	{ id: 'pulse', label: 'Pulse', slug: 'pulse', duration: 600, tip: 'The layer swells a little and settles back, to catch the eye' },
	{ id: 'shake', label: 'Shake', slug: 'shake', duration: 500, tip: 'The layer shakes side to side and settles, for "not quite"' },
	{ id: 'fadeOut', label: 'Fade out', slug: 'fade out', duration: 600, tip: 'The layer fades away (it stays on the page, clear)' },
];

export const presetById = (id: AnimPresetId): AnimPreset => ANIM_PRESETS.find((p) => p.id === id)!;

const key = (t: number, value: number | string | boolean, ease: Easing = 'linear'): Keyframe => ({ id: uid('k'), t: Math.round(t), value, ease });
const track = (nodeId: string, prop: string, keys: Keyframe[]): Track => ({ id: uid('tr'), nodeId, prop, keys });

/** Where the layer sits: auto layout or a repeater owns its x and y, so a preset has to move it some other way. */
function placement(ab: Artboard, nodeId: string): { node: SceneNode; ownsPosition: boolean } | null {
	let found: { node: SceneNode; ownsPosition: boolean } | null = null;
	walk(ab.children, (n, parent) => {
		if (n.id !== nodeId) return;
		const flow = !!parent && parent.type === 'frame' && !!parent.layout && (n.layoutItem?.position ?? 'flow') === 'flow';
		found = { node: n, ownsPosition: flow || !!(n as { repeat?: unknown }).repeat };
	});
	return found;
}

/** How far a slide travels: a fifth of the artboard along that way, kept between 60 and 400 px. */
export function slideDistance(ab: Pick<Artboard, 'width' | 'height'>, side: AnimSide): number {
	const span = side === 'left' || side === 'right' ? ab.width : ab.height;
	return Math.round(Math.min(400, Math.max(60, span * 0.2)));
}

/**
 * The tracks of a preset for this layer, every one of them ending at the layer's own values (Fade out ends clear). The first pose
 * is held through `delay`, so the layer is already in its starting pose when the animation starts.
 */
export function presetTracks(preset: AnimPresetId, ab: Artboard, node: SceneNode, ownsPosition: boolean, o: AnimOptions = {}): { tracks: Track[]; duration: number; plainer: boolean } {
	const d = Math.max(100, o.duration ?? presetById(preset).duration);
	const delay = Math.max(0, o.delay ?? 0);
	const id = node.id;
	const op = node.opacity ?? 1;
	const sx = node.scaleX ?? 1;
	const sy = node.scaleY ?? 1;
	//A property moving through poses: [share of the duration from 0 to 1, value, easing to the next pose]
	const move = (prop: string, poses: [number, number, Easing][]): Track => {
		const keys = poses.map(([at, v, ease]) => key(delay + at * d, v, ease));
		return track(id, prop, delay > 0 ? [key(0, poses[0][1], 'linear'), ...keys] : keys);
	};
	const ramp = (prop: string, from: number, to: number, ease: Easing) => move(prop, [[0, from, ease], [1, to, ease]]);
	let plainer = false;
	let tracks: Track[];
	if (preset === 'fadeIn') {
		tracks = [ramp('opacity', 0, op, 'easeOut')];
	} else if (preset === 'fadeOut') {
		tracks = [ramp('opacity', op, 0, 'easeIn')];
	} else if (preset === 'slideIn') {
		const side = o.from ?? 'left';
		const dist = slideDistance(ab, side);
		const prop = side === 'left' || side === 'right' ? 'x' : 'y';
		const home = Number(getPath(node, prop));
		if (ownsPosition) {
			//Auto layout would put it straight back, so it grows in from a bit smaller instead
			plainer = true;
			tracks = [ramp('opacity', 0, op, 'easeOut'), ramp('scaleX', sx * 0.85, sx, 'easeOut'), ramp('scaleY', sy * 0.85, sy, 'easeOut')];
		} else tracks = [ramp(prop, home + (side === 'left' || side === 'top' ? -dist : dist), home, 'easeOut'), ramp('opacity', 0, op, 'easeOut')];
	} else if (preset === 'pop') {
		tracks = [ramp('opacity', 0, op, 'easeOut'), ramp('scaleX', sx * 0.5, sx, 'backOut'), ramp('scaleY', sy * 0.5, sy, 'backOut')];
	} else if (preset === 'pulse') {
		const beat = (prop: string, base: number) => move(prop, [[0, base, 'easeOut'], [0.4, base * 1.12, 'easeInOut'], [1, base, 'easeInOut']]);
		tracks = [beat('scaleX', sx), beat('scaleY', sy)];
	} else {
		//Shake swings and settles. Where layout owns x it rocks (rotation) instead
		const prop = ownsPosition ? 'rotation' : 'x';
		const home = Number(getPath(node, prop));
		const amp = ownsPosition ? 4 : 12;
		plainer = ownsPosition;
		const swing = [0, -1, 1, -0.7, 0.7, -0.3, 0];
		tracks = [move(prop, swing.map((m, i): [number, number, Easing] => [i / (swing.length - 1), home + m * amp, 'easeInOut']))];
	}
	return { tracks, duration: delay + d, plainer };
}

const SLUGS = ANIM_PRESETS.map((p) => p.slug);

/** The timeline a preset made for this layer earlier, found by its name ("Title: fade in"). */
const presetTimelineName = (node: SceneNode, preset: AnimPresetId): string => `${node.name}: ${presetById(preset).slug}`;

/** Take out what an earlier run of this preset wrote for the timeline: the Control timeline steps and any event left with nothing to start. */
function clearFlow(ab: Artboard, timelineId: string): void {
	const steps = new Set(ab.logic.nodes.filter((n) => n.kind === 'action.timeline' && n.params.timeline === timelineId).map((n) => n.id));
	if (!steps.size) return;
	const feeders = new Set(ab.logic.edges.filter((e) => steps.has(e.to)).map((e) => e.from));
	ab.logic.edges = ab.logic.edges.filter((e) => !steps.has(e.to) && !steps.has(e.from));
	const gone = new Set(steps);
	for (const f of feeders) {
		const fn = ab.logic.nodes.find((n) => n.id === f);
		if (fn && fn.kind.startsWith('event.') && !ab.logic.edges.some((e) => e.from === f)) gone.add(f);
	}
	ab.logic.nodes = ab.logic.nodes.filter((n) => !gone.has(n.id));
}

export interface AnimResult {
	timelineId: string;
	timelineName: string;
	/** Layout or a repeater owns the layer's position, so the preset used a plainer move. */
	plainer: boolean;
	/** The event node that starts it. */
	eventId: string;
}

/**
 * Write a preset for a layer into the project (an immer draft or a plain object). Doing it again for the same layer and preset
 * replaces its timeline and its trigger rather than stacking another. Returns null when the layer isn't there.
 */
export function applyAnimation(p: Project, artboardId: string, nodeId: string, preset: AnimPresetId, o: AnimOptions = {}): AnimResult | null {
	const ab = getArtboard(p, artboardId);
	const at = ab && placement(ab, nodeId);
	if (!ab || !at) return null;
	const when = o.when ?? 'start';
	const made = presetTracks(preset, ab, at.node, at.ownsPosition, o);
	const name = presetTimelineName(at.node, preset);
	let tl = ab.timelines.find((t) => t.name === name);
	const body: Omit<Timeline, 'id' | 'name'> = { duration: made.duration, loop: 'once', autoplay: false, speed: 1, calm: true, tracks: made.tracks };
	if (tl) {
		clearFlow(ab, tl.id);
		Object.assign(tl, body);
		delete tl.holdsEnd;
	} else {
		tl = { id: uid('tl'), name: uniqueName(ab.timelines.map((t) => t.name), name), ...body };
		ab.timelines.push(tl);
	}
	//Both triggers are ordinary nodes: On start or On pointer, then Control timeline (restart)
	const step = { kind: 'action.timeline', params: { ...defaultParams('action.timeline'), timeline: tl.id, op: 'restart' } };
	const { event } = when === 'click' ? writeFlow(ab, { kind: 'event.pointer', params: { target: nodeId, type: 'click' } }, [step]) : writeFlow(ab, { kind: 'event.start', params: {} }, [step]);
	return { timelineId: tl.id, timelineName: tl.name, plainer: made.plainer, eventId: event.id };
}

/** Whether a timeline is one of the presets' (named "<layer>: <slug>"), for the Timeline tab to say so. */
export const isPresetTimeline = (tl: Pick<Timeline, 'name'>): boolean => SLUGS.some((s) => tl.name.endsWith(`: ${s}`));

//What the Animate section and the right-click menu share: the last choices made, so a preset from the menu does what the section shows
let lastOptions: Required<Pick<AnimOptions, 'when' | 'from'>> & { delay: number; duration: number | null } = { when: 'start', from: 'left', delay: 0, duration: null };
export const animChoices = () => lastOptions;
export function setAnimChoices(patch: Partial<typeof lastOptions>): void {
	lastOptions = { ...lastOptions, ...patch };
}
/** The choices as options for `applyAnimation` (no duration means each preset's own). */
export const animOptions = (): AnimOptions => ({ when: lastOptions.when, from: lastOptions.from, delay: lastOptions.delay, ...(lastOptions.duration ? { duration: lastOptions.duration } : {}) });
