/**
 * A ring that pulses round the layer a click landed on while Preview runs (the player's `flow` event, lib/run-flow.ts): green when
 * the click started something, red when it started nothing. Editor-only, drawn over the canvas and never part of the document.
 */
import type { Project } from 'interactives-player';
import { getArtboard, locate, selectionBounds } from '../store/doc';
import { currentHits, useFlowVersion } from '../lib/run-flow';

export function HitPulse({ project, zoom, panX, panY }: { project: Project; zoom: number; panX: number; panY: number }) {
	useFlowVersion();
	const rings = currentHits().flatMap((h) => {
		const ab = getArtboard(project, h.artboard);
		if (!ab || ab.canvasHidden || !h.layer || !locate(ab, h.layer)) return [];
		const r = selectionBounds(ab, [h.layer]);
		if (!r) return [];
		return [{ h, x: panX + (ab.canvasX + r.x) * zoom, y: panY + (ab.canvasY + r.y) * zoom, w: Math.max(6, r.width * zoom), height: Math.max(6, r.height * zoom) }];
	});
	if (!rings.length) return null;
	return (
		<div className="hit-pulses" aria-hidden="true">
			{rings.map(({ h, x, y, w, height }) => (
				<div key={h.n} className={`hit-pulse ${h.ran > 0 ? 'ran' : 'quiet'}`} style={{ left: x - 4, top: y - 4, width: w + 8, height: height + 8 }} />
			))}
		</div>
	);
}
