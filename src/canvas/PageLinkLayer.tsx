/**
 * Two editor-only things drawn over the canvas, never part of the document, Preview or an export:
 *
 * - the Go to page handle: a round handle at the right edge of the selected layer. Drag it onto another page (the page lights up
 *   as you pass over it) and letting go links the layer to it; press Enter or click without dragging and it offers the list of
 *   pages. The link is the ordinary On pointer click and Go to artboard nodes (lib/page-link.ts), so the graph shows it.
 * - faint arrows between pages for every route the graphs make (Go to a page, Next, Previous), a map of the whole piece.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Artboard, Project } from 'interactives-player';
import { selectionBounds } from '../store/doc';
import { store } from '../store/store';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { Icons } from '../components/icons';
import { linkedPage, linkToPage, pageRoutes, pagesToLinkTo } from '../lib/page-link';
import { useShowRoutes } from '../lib/page-routes-pref';

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Where the line from the middle of one box to the middle of another leaves the first box. */
export function edgePoint(b: Box, toward: { x: number; y: number }): { x: number; y: number } {
	const cx = b.x + b.w / 2;
	const cy = b.y + b.h / 2;
	const dx = toward.x - cx;
	const dy = toward.y - cy;
	if (!dx && !dy) return { x: cx, y: cy };
	const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
	return { x: cx + dx * t, y: cy + dy * t };
}

/** The path of an arrow from one page's box to another's: a gentle curve (the way back bows the other side), clear of both boxes. */
export function arrowPath(a: Box, b: Box, gap = 8): { d: string; mid: { x: number; y: number } } {
	const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
	const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
	const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1;
	//Control point off the middle, sideways by a share of the length
	const nx = -(cb.y - ca.y) / len;
	const ny = (cb.x - ca.x) / len;
	const c = { x: (ca.x + cb.x) / 2 + nx * len * 0.12, y: (ca.y + cb.y) / 2 + ny * len * 0.12 };
	const p0 = edgePoint(a, c);
	const p1 = edgePoint(b, c);
	const back = (p: { x: number; y: number }, q: { x: number; y: number }) => {
		const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
		return { x: p.x + ((q.x - p.x) / l) * gap, y: p.y + ((q.y - p.y) / l) * gap };
	};
	const s = back(p0, c);
	const e = back(p1, c);
	return { d: `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`, mid: { x: (s.x + 2 * c.x + e.x) / 4, y: (s.y + 2 * c.y + e.y) / 4 } };
}

export function PageLinkLayer({ project, zoom, panX, panY, active, selection, tool, hidden }: { project: Project; zoom: number; panX: number; panY: number; active: Artboard | undefined; selection: string[]; tool: string; hidden?: boolean }) {
	const box = useRef<HTMLDivElement>(null);
	const routesOn = useShowRoutes();
	const [drag, setDrag] = useState<{ x: number; y: number; over: string | null } | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
	const live = useRef<{ over: string | null } | null>(null);

	const onCanvas = useMemo(() => project.artboards.filter((a) => !a.canvasHidden), [project.artboards]);
	const routes = useMemo(() => (routesOn && onCanvas.length > 1 ? pageRoutes(project) : []), [routesOn, onCanvas.length, project]);
	const screen = (a: Artboard): Box => ({ x: panX + a.canvasX * zoom, y: panY + a.canvasY * zoom, w: a.width * zoom, h: a.height * zoom });
	const byId = (id: string) => onCanvas.find((a) => a.id === id);

	// The one selected layer the handle belongs to
	const layerId = selection.length === 1 ? selection[0] : null;
	const layer = layerId && active ? selectionBounds(active, [layerId]) : null;
	const pages = active ? pagesToLinkTo(project, active) : [];
	const canLink = !hidden && !!layer && !!active && !active.library && tool === 'select' && pages.length > 0;
	const handle = canLink && layer && active ? { x: panX + (active.canvasX + layer.x + layer.width) * zoom + 22, y: panY + (active.canvasY + layer.y + layer.height / 2) * zoom } : null;
	const current = layerId && active ? linkedPage(active, layerId) : null;

	const apply = (to: string | null) => {
		if (!layerId || !active) return;
		store().update((d) => {
			const a = d.artboards.find((x) => x.id === active.id);
			if (a) linkToPage(a, layerId, to);
		});
	};

	//The page under a point of the screen (not the one the layer is on): the topmost one that holds it
	const pageAt = (clientX: number, clientY: number): string | null => {
		const r = box.current?.getBoundingClientRect();
		if (!r || !active) return null;
		const wx = (clientX - r.left - panX) / zoom;
		const wy = (clientY - r.top - panY) / zoom;
		const ids = new Set(pages.map((p) => p.id));
		const hit = [...onCanvas].reverse().find((a) => wx >= a.canvasX && wy >= a.canvasY && wx <= a.canvasX + a.width && wy <= a.canvasY + a.height);
		if (!hit) return null;
		//A responsive page's narrow and wide versions are the same page
		const base = hit.variantOf ?? hit.id;
		return ids.has(base) ? base : null;
	};

	const openMenu = (x: number, y: number) =>
		setMenu({
			x,
			y,
			items: [
				{ heading: 'Go to page' },
				...pages.map((p): MenuItem => ({ label: p.id === current ? `${p.name} (now)` : p.name, onClick: () => apply(p.id) })),
				...(current ? [{ separator: true } as MenuItem, { label: 'No page (remove the link)', onClick: () => apply(null) } as MenuItem] : []),
			],
		});

	const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const el = e.currentTarget;
		el.setPointerCapture(e.pointerId);
		const x0 = e.clientX;
		const y0 = e.clientY;
		let moved = false;
		const r0 = box.current!.getBoundingClientRect();
		const upd = (ev: PointerEvent) => {
			if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
			moved = true;
			const over = pageAt(ev.clientX, ev.clientY);
			live.current = { over };
			setDrag({ x: ev.clientX - r0.left, y: ev.clientY - r0.top, over });
		};
		const finish = (ev: PointerEvent, ok: boolean) => {
			el.removeEventListener('pointermove', upd);
			el.removeEventListener('pointerup', up);
			el.removeEventListener('pointercancel', cancel);
			window.removeEventListener('keydown', esc, true);
			const over = moved ? pageAt(ev.clientX, ev.clientY) : null;
			live.current = null;
			setDrag(null);
			if (!ok) return;
			if (!moved) openMenu(ev.clientX, ev.clientY);
			else if (over) apply(over);
		};
		const up = (ev: PointerEvent) => finish(ev, true);
		const cancel = (ev: PointerEvent) => finish(ev, false);
		const esc = (ev: KeyboardEvent) => {
			if (ev.key !== 'Escape') return;
			ev.stopPropagation();
			finish(new PointerEvent('pointerup'), false);
		};
		el.addEventListener('pointermove', upd);
		el.addEventListener('pointerup', up);
		el.addEventListener('pointercancel', cancel);
		window.addEventListener('keydown', esc, true);
	};
	const key = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		e.stopPropagation();
		const r = e.currentTarget.getBoundingClientRect();
		openMenu(r.right + 4, r.top);
	};
	//The page being aimed at lights up
	useEffect(() => {
		if (!drag) return;
		document.body.classList.add('page-link-dragging');
		return () => document.body.classList.remove('page-link-dragging');
	}, [!!drag]); // eslint-disable-line react-hooks/exhaustive-deps

	const src = layerId && active && layer ? { x: panX + (active.canvasX + layer.x + layer.width) * zoom, y: panY + (active.canvasY + layer.y + layer.height / 2) * zoom } : null;
	const overBox = drag?.over ? byId(drag.over) : null;
	const overName = drag?.over ? byId(drag.over)?.name : null;
	return (
		<div className="page-link-layer" ref={box}>
			{!hidden && routes.length > 0 && (
				<svg className="page-routes" aria-hidden="true">
					<defs>
						<marker id="route-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
							<path d="M0 0L10 5L0 10z" fill="currentColor" />
						</marker>
					</defs>
					{routes.map((r) => {
						const a = byId(r.from);
						const b = byId(r.to);
						if (!a || !b) return null;
						const p = arrowPath(screen(a), screen(b));
						return (
							<path key={`${r.from}>${r.to}`} d={p.d} className={`route${r.order ? ' order' : ''}`} markerEnd="url(#route-head)" data-from={r.from} data-to={r.to}>
								<title>{`${a.name} to ${b.name}${r.via.length ? ` (${r.via.join(', ')})` : ''}`}</title>
							</path>
						);
					})}
				</svg>
			)}
			{routes.length > 0 && !hidden && (
				<ul className="sr-only" aria-label="Page routes">
					{routes.map((r) => (
						<li key={`${r.from}>${r.to}`}>
							{byId(r.from)?.name} goes to {byId(r.to)?.name}
							{r.via.length ? ` from ${r.via.join(', ')}` : ''}
						</li>
					))}
				</ul>
			)}
			{overBox && (
				<div className="page-link-target" style={{ left: screen(overBox).x, top: screen(overBox).y, width: screen(overBox).w, height: screen(overBox).h }}>
					<span>Go to {overName}</span>
				</div>
			)}
			{drag && src && (
				<svg className="page-routes drag">
					<line x1={src.x} y1={src.y} x2={drag.x} y2={drag.y} className={drag.over ? 'live over' : 'live'} />
				</svg>
			)}
			{handle && (
				<button
					type="button"
					className={`page-link-handle${current ? ' linked' : ''}`}
					style={{ left: handle.x, top: handle.y }}
					aria-label={current ? `Go to page: ${byId(current)?.name ?? 'a page'}. Press Enter to choose another page` : 'Go to page. Press Enter to choose a page, or drag onto a page'}
					title={current ? `Goes to ${byId(current)?.name ?? 'a page'}. Drag onto another page to change it, or click to choose from a list` : 'Go to page: drag onto a page on the canvas, or click to choose from a list'}
					onPointerDown={down}
					onKeyDown={key}
				>
					<Icons.arrowRight width={14} height={14} />
				</button>
			)}
			{handle && src && <div className="page-link-stem" style={{ left: src.x, top: src.y - 0.5, width: 22 }} aria-hidden="true" />}
			{menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
		</div>
	);
}
