//"Add page navigation": Back, Next, the page number, page dots and a progress bar generated in one go along the bottom of every page
//(or the selected ones), wired to the project's page order the way the starters' own navigation is (parts.ts pageNav: Go to
//artboard next/previous, Back hidden on the first page and Next on the last, "Page 3 of 8" from pageNumber and pageCount). The
//bottom bar is Back on the left, Next (the primary one) on the right and the counter, dots or bar between. All of it is ordinary
//layers, bindings and graph nodes the author can edit; the layers carry the tag `page-nav` so adding again with another style swaps
//them. A page that already has its own Next or Back button (a starter's) is left alone and reported.
import { createNode, DEFAULT_TRANSITION_MS, LIGHT_LOOK, pageInfo, type Artboard, type LookKey, type Project, type SceneNode } from 'interactives-player';
import { button, contentBox, solid, stroke, text, type BrandedCtx } from './branded/kit';
import { progressBar } from './branded/parts';
import { bind } from './branded/graph-kit';
import { writeClickFlow } from './click-flow';

export type NavStyle = 'back-next' | 'next' | 'dots' | 'progress' | 'number';

export const NAV_STYLES: { id: NavStyle; label: string; about: string }[] = [
	{ id: 'back-next', label: 'Back and Next', about: 'Back on the left, Next on the right and “Page 3 of 8” between them.' },
	{ id: 'next', label: 'Next only', about: 'A Next button on the right, and nothing else.' },
	{ id: 'dots', label: 'Back, Next and page dots', about: 'Back and Next with a row of dots between them, the current page filled.' },
	{ id: 'progress', label: 'Back, Next and a progress bar', about: 'Back, Next and the page number, with a thin bar along the bottom that fills as you go.' },
	{ id: 'number', label: 'Page number only', about: '“Page 3 of 8” along the bottom. No buttons.' },
];

const PARTS: Record<NavStyle, { back: boolean; next: boolean; counter: boolean; dots: boolean; bar: boolean }> = {
	'back-next': { back: true, next: true, counter: true, dots: false, bar: false },
	next: { back: false, next: true, counter: false, dots: false, bar: false },
	dots: { back: true, next: true, counter: false, dots: true, bar: false },
	progress: { back: true, next: true, counter: true, dots: false, bar: true },
	number: { back: false, next: false, counter: true, dots: false, bar: false },
};

/** Tag on every layer this makes. */
export const PAGE_NAV_TAG = 'page-nav';
const HEIGHT = 46;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The project's own colours (its `color/...` tokens, so the bar follows the theme and brand), or the toolbox look when it has none. */
function paletteOf(project: Project): BrandedCtx {
	const L = {} as Record<string, string>;
	for (const key of Object.keys(LIGHT_LOOK) as LookKey[]) {
		const token = project.themes?.tokens.find((t) => t.name === `color/${kebab(key)}`);
		L[key] = token ? `token:${token.id}` : LIGHT_LOOK[key];
	}
	return { project, colourway: undefined as never, L: L as BrandedCtx['L'], masters: new Map() };
}

const tagsOf = (n: SceneNode): string[] => (n as { tags?: string[] }).tags ?? [];
const hasTag = (n: SceneNode) => tagsOf(n).includes(PAGE_NAV_TAG);

function allNodes(list: SceneNode[], out: SceneNode[] = []): SceneNode[] {
	for (const n of list) {
		out.push(n);
		const kids = (n as { children?: SceneNode[] }).children;
		if (kids) allNodes(kids, out);
	}
	return out;
}

/** Take away what an earlier run made on this page: its layers, the clicks on them and the Go to nodes after those. */
export function removePageNav(page: Artboard): boolean {
	const ids = new Set(allNodes(page.children).filter(hasTag).map((n) => n.id));
	if (!ids.size) return false;
	const strip = (list: SceneNode[]) => {
		for (let i = list.length - 1; i >= 0; i--) {
			if (hasTag(list[i])) list.splice(i, 1);
			else {
				const kids = (list[i] as { children?: SceneNode[] }).children;
				if (kids) strip(kids);
			}
		}
	};
	strip(page.children);
	//The events on those layers, and everything that only they reach
	const gone = new Set(page.logic.nodes.filter((n) => typeof n.params.target === 'string' && ids.has(n.params.target)).map((n) => n.id));
	for (let grew = true; grew; ) {
		grew = false;
		for (const n of page.logic.nodes) {
			if (gone.has(n.id)) continue;
			const into = page.logic.edges.filter((e) => e.to === n.id);
			if (into.length && into.every((e) => gone.has(e.from))) {
				gone.add(n.id);
				grew = true;
			}
		}
	}
	page.logic.nodes = page.logic.nodes.filter((n) => !gone.has(n.id));
	page.logic.edges = page.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
	return true;
}

/** Whether a page has Next or Back buttons the author (or a starter) made, not this generator. */
export function hasOwnNavigation(page: Artboard): boolean {
	return allNodes(page.children).some((n) => n.type === 'button' && !hasTag(n) && /^(next|back|previous)\b/i.test(n.name ?? ''));
}

export interface NavResult {
	/** Pages that got the navigation. */
	added: string[];
	/** Pages left alone, with why. */
	skipped: { page: string; why: string }[];
}

/** The pages navigation can go on: every real page of the project (not masters, narrow or wide versions, hidden or library ones). */
export function navPages(project: Project): Artboard[] {
	return project.artboards.filter((a) => !a.variantOf && !a.canvasHidden && !a.isMaster && !a.library && !project.artboards.some((m) => m.master === a.id));
}

/**
 * Put the navigation on the pages named (a plain project or an immer draft). A page that has had it before gets it again in this
 * style, a page with its own Next/Back is skipped. Page dots need to know how many pages there are, so add again after adding or
 * removing pages to refresh them (the buttons, the number and the bar follow the page order by themselves). `transition` is how the
 * page changes when Next or Back is clicked (one of the page looks) and `duration` how long that takes in ms (Medium, as a Go to page
 * has always been, unless a speed is chosen).
 */
export function addPageNavigation(project: Project, pageIds: string[], style: NavStyle, transition = 'fade', duration = DEFAULT_TRANSITION_MS): NavResult {
	const parts = PARTS[style];
	const ctx = paletteOf(project);
	const result: NavResult = { added: [], skipped: [] };
	const pages = navPages(project).filter((a) => pageIds.includes(a.id));
	if (!parts) return result;
	for (const page of pages) {
		const mine = allNodes(page.children).some(hasTag);
		if (!mine && hasOwnNavigation(page)) {
			result.skipped.push({ page: page.name, why: 'it already has its own Next or Back button' });
			continue;
		}
		removePageNav(page);
		const info = pageInfo(project, page);
		if (info.list.length < 2 && (parts.back || parts.next)) {
			result.skipped.push({ page: page.name, why: 'it is the only page it could go to' });
			continue;
		}
		const box = project.brandLook ? contentBox(page) : { x: 32, y: 32, width: page.width - 64, height: page.height - 64 };
		const w = page.width < 560 ? 110 : 150;
		const y = box.y + box.height - HEIGHT;
		const layers: SceneNode[] = [];
		const tag = <T extends SceneNode>(n: T): T => Object.assign(n, { tags: [...tagsOf(n), PAGE_NAV_TAG] });
		const gap = 16;
		const from = box.x + (parts.back ? w + gap : 0);
		const room = box.width - (parts.back ? w + gap : 0) - (parts.next ? w + gap : 0);
		let back: SceneNode | null = null;
		let next: SceneNode | null = null;
		if (parts.back) layers.push((back = tag(bind(button(ctx, 'Back button', 'Back', box.x, y, w, false), { visible: 'pageNumber > 1' }))));
		if (parts.next) layers.push((next = tag(bind(button(ctx, 'Next button', 'Next', box.x + box.width - w, y, w), { visible: 'pageNumber < pageCount' }))));
		let counter = parts.counter;
		if (parts.dots) {
			const n = info.list.length;
			const here = info.index;
			const size = n * 20 <= room ? 10 : 8;
			const step = size === 10 ? 20 : 14;
			if (n * step <= room) {
				const left = from + (room - n * step + (step - size)) / 2;
				for (let i = 0; i < n; i++) {
					const on = i === here;
					layers.push(
						tag(
							createNode('ellipse', {
								name: `Page dot ${i + 1}`,
								x: left + i * step,
								y: y + (HEIGHT - size) / 2,
								width: size,
								height: size,
								fill: solid(on ? ctx.L.button : ctx.L.surfaceMuted),
								stroke: stroke(on ? ctx.L.onButton : ctx.L.border, 1.5),
								decorative: true,
							} as never),
						),
					);
				}
			} else counter = true;
		}
		if (counter) layers.push(tag(text(ctx, 'Page counter', 'Page {pageNumber} of {pageCount}', from, y + 11, room, { fontSize: 15, color: ctx.L.muted, align: 'center' })));
		if (parts.bar) layers.push(tag(progressBar(ctx, 'Page progress', box.x, y - 22, box.width, { value: 'pageNumber', max: 'pageCount', label: 'Progress through the pages', height: 8 })));
		page.children.push(...layers);
		if (next) writeClickFlow(page, next.id, [{ kind: 'action.artboard', params: { to: 'next', transition, duration } }], 'click', 'Next page');
		if (back) writeClickFlow(page, back.id, [{ kind: 'action.artboard', params: { to: 'previous', transition, duration } }], 'click', 'Previous page');
		result.added.push(page.name);
	}
	return result;
}
