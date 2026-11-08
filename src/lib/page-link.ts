//Link a layer to a page without opening the graph. A link is the ordinary thing the graph would hold: an On pointer click on the
//layer wired to a Go to artboard node that names the page. These helpers find that pair, change the page it names (or add it, or
//take it away), and read every page-to-page route in a project for the arrows drawn between pages on the canvas.
import { DEFAULT_TRANSITION_MS, neighbourPage, pageInfo, setBase, type Artboard, type LogicNode, type Project } from 'interactives-player';
import { appendStep, writeClickFlow } from './click-flow';

type Logic = Pick<Artboard, 'logic'>;

export interface PageLink {
	event: LogicNode;
	go: LogicNode;
	/** The artboard id it goes to ('' when it names none yet). */
	to: string;
}

/**
 * The plain clicks on a layer (no "Only if", not "children only") that go straight to a chosen page. A click with a condition is
 * the author's own logic and is never rewritten from here.
 */
export function pageLinksOf(ab: Logic, layerId: string): PageLink[] {
	const out: PageLink[] = [];
	for (const ev of ab.logic.nodes) {
		if (ev.kind !== 'event.pointer' || ev.params.target !== layerId || (ev.params.type ?? 'click') !== 'click') continue;
		if ((typeof ev.params.onlyIf === 'string' && ev.params.onlyIf.trim()) || ev.params.childrenOnly) continue;
		for (const e of ab.logic.edges) {
			if (e.from !== ev.id || e.fromPort !== 'out') continue;
			const go = ab.logic.nodes.find((n) => n.id === e.to);
			if (go?.kind === 'action.artboard' && (go.params.to ?? 'picked') === 'picked') out.push({ event: ev, go, to: String(go.params.artboard ?? '') });
		}
	}
	return out;
}

/** The page a layer's click goes to, or null when it has no such link. */
export const linkedPage = (ab: Logic, layerId: string): string | null => pageLinksOf(ab, layerId)[0]?.to || null;

/** How the page changes when a layer's link is followed (a link written without one fades). The first link's, when there are several. */
export const linkTransition = (ab: Logic, layerId: string): string => String(pageLinksOf(ab, layerId)[0]?.go.params.transition ?? 'fade');

/** Set how every link on the layer changes page. Returns whether there was a link to set it on. */
export function setLinkTransition(ab: Logic, layerId: string, transition: string): boolean {
	const links = pageLinksOf(ab, layerId);
	for (const l of links) {
		const node = ab.logic.nodes.find((n) => n.id === l.go.id);
		if (node) node.params = { ...node.params, transition };
	}
	return links.length > 0;
}

/** How long the page change of a layer's link takes, in ms (a link written without one is Medium). The first link's, when there are several. */
export const linkDuration = (ab: Logic, layerId: string): number => Number(pageLinksOf(ab, layerId)[0]?.go.params.duration ?? DEFAULT_TRANSITION_MS);

/** Set how long every link on the layer takes to change page. Returns whether there was a link to set it on. */
export function setLinkDuration(ab: Logic, layerId: string, duration: number): boolean {
	const links = pageLinksOf(ab, layerId);
	for (const l of links) {
		const node = ab.logic.nodes.find((n) => n.id === l.go.id);
		if (node) node.params = { ...node.params, duration };
	}
	return links.length > 0;
}

/** What a Go to node reads as in the graph's chip: "Go to Results". */
export const goLabel = (project: Pick<Project, 'artboards'>, id: string): string => `Go to ${project.artboards.find((a) => a.id === id)?.name ?? 'a page'}`;

/**
 * Make clicking the layer go to this page: change the page an existing link names, hang a Go to node off a click the layer already
 * has, or write a fresh click and Go to. Null takes the link away (and a click that has nothing left to do). Works on a plain
 * artboard or an immer draft. Returns what it did.
 */
export function linkToPage(ab: Logic, layerId: string, target: string | null): 'added' | 'changed' | 'removed' | 'same' | 'none' {
	const links = pageLinksOf(ab, layerId);
	if (target === null) {
		if (!links.length) return 'none';
		for (const l of links) {
			ab.logic.nodes = ab.logic.nodes.filter((n) => n.id !== l.go.id);
			ab.logic.edges = ab.logic.edges.filter((e) => e.from !== l.go.id && e.to !== l.go.id);
			//The click that only went there goes too
			if (!ab.logic.edges.some((e) => e.from === l.event.id)) {
				ab.logic.nodes = ab.logic.nodes.filter((n) => n.id !== l.event.id);
				ab.logic.edges = ab.logic.edges.filter((e) => e.to !== l.event.id);
			}
		}
		return 'removed';
	}
	if (links.length) {
		if (links.every((l) => l.to === target)) return 'same';
		for (const l of links) {
			const node = ab.logic.nodes.find((n) => n.id === l.go.id);
			if (node) node.params = { ...node.params, artboard: target };
		}
		return 'changed';
	}
	//A plain click the layer already has (it plays a sound, say): the page change follows it
	const click = ab.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === layerId && (n.params.type ?? 'click') === 'click' && !(typeof n.params.onlyIf === 'string' && n.params.onlyIf.trim()) && !n.params.childrenOnly);
	if (click) {
		appendStep(ab, click, { kind: 'action.artboard', params: { to: 'picked', artboard: target } });
		return 'added';
	}
	writeClickFlow(ab, layerId, [{ kind: 'action.artboard', params: { to: 'picked', artboard: target } }]);
	return 'added';
}

// ------------------------------------------------------------------ routes

export interface PageRoute {
	from: string;
	to: string;
	/** The layers whose clicks start it (names), when the graph says; empty for a route from the page's own start. */
	via: string[];
	/** Next or previous (the project's order) rather than a page picked by name. */
	order: boolean;
}

/**
 * Every page-to-page jump the graphs make: Go to a chosen page, and Next or Previous (resolved the way the player does, by page
 * order). One route per pair of pages, with the names of the layers that start it. Expressions and Back go nowhere you could
 * draw, so they are left out.
 */
export function pageRoutes(project: Project): PageRoute[] {
	const out = new Map<string, PageRoute>();
	for (const ab of project.artboards) {
		if (ab.canvasHidden || ab.variantOf || !ab.logic.nodes.length) continue;
		const from = setBase(project.artboards, ab).id;
		const mine = pageInfo(project, ab).list.includes(setBase(project.artboards, ab));
		for (const n of ab.logic.nodes) {
			if (n.kind !== 'action.artboard') continue;
			const mode = String(n.params.to ?? 'picked');
			let to: string | undefined;
			let order = false;
			if (mode === 'picked') to = typeof n.params.artboard === 'string' ? setBase(project.artboards, project.artboards.find((a) => a.id === n.params.artboard) ?? ab).id : undefined;
			else if ((mode === 'next' || mode === 'previous') && mine) {
				to = neighbourPage(project, ab, mode === 'next' ? 1 : -1)?.id;
				order = true;
			}
			if (!to || to === from || !project.artboards.some((a) => a.id === to)) continue;
			const key = `${from}>${to}`;
			const r = out.get(key) ?? { from, to, via: [], order };
			r.order = r.order && order;
			for (const name of startedBy(ab, n)) if (!r.via.includes(name)) r.via.push(name);
			out.set(key, r);
		}
	}
	return [...out.values()];
}

//The names of the layers whose pointer events lead to a node (walking the wires back)
function startedBy(ab: Logic & { children?: unknown }, node: LogicNode): string[] {
	const names: string[] = [];
	const seen = new Set<string>();
	const walk = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		const n = ab.logic.nodes.find((x) => x.id === id);
		if (n?.kind === 'event.pointer' && typeof n.params.target === 'string') {
			const layer = findName((ab as unknown as Artboard).children, n.params.target);
			if (layer) names.push(layer);
		}
		for (const e of ab.logic.edges) if (e.to === id) walk(e.from);
	};
	walk(node.id);
	return names;
}

function findName(list: Artboard['children'], id: string): string | undefined {
	for (const n of list) {
		if (n.id === id) return n.name;
		const kids = (n as { children?: Artboard['children'] }).children;
		if (kids) {
			const hit = findName(kids, id);
			if (hit) return hit;
		}
	}
	return undefined;
}

/** The pages a layer can be linked to from this artboard: the pages of the project in order, but not this one, with the page master and responsive variants left out. */
export function pagesToLinkTo(project: Project, from: Artboard): { id: string; name: string }[] {
	const base = setBase(project.artboards, from);
	const masters = new Set(project.artboards.filter((a) => a.master).map((a) => a.master));
	return project.artboards.filter((a) => a.id !== base.id && !a.variantOf && !a.canvasHidden && !a.isMaster && !masters.has(a.id)).map((a) => ({ id: a.id, name: a.name }));
}
