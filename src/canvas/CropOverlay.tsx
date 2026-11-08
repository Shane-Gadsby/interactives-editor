import { useEffect, useMemo, useRef } from 'react';
import { apply, invert, type Artboard, type ImageNode } from 'interactives-player';
import { store } from '../store/store';
import { drawnBox, locate, nodeToArtboard } from '../store/doc';
import { useNaturalSize } from '../lib/natural-size';
import { REST, clampCrop, cropOf, panBy, stored, zoomAt, type Size } from '../lib/crop';

/**
 * Crop mode on the canvas. The picture's frame is outlined; drag inside it to move the picture, scroll (or pull a corner, or
 * press + and -) to zoom, Enter or Done to finish, Reset to put it back as the fit draws it. Every change is a real edit of
 * the layer's `crop`, so it is live on the canvas and one undo step per gesture. Clicking outside the frame finishes too.
 */
export function CropOverlay({ ab, id, zoom, panX, panY }: { ab: Artboard; id: string; zoom: number; panX: number; panY: number }) {
  const loc = locate(ab, id);
  const node = loc?.node.type === 'image' ? (loc.node as ImageNode) : null;
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: 'pan' | 'zoom';
    x: number;
    y: number;
    crop: ReturnType<typeof cropOf>;
    dist: number;
  } | null>(null);
  const natural = useNaturalSize(node?.assetId);

  const frame = node ? drawnBox(ab, node) : null;
  const size: Size = { w: frame?.width ?? 1, h: frame?.height ?? 1 };
  const m = useMemo(() => nodeToArtboard(ab, id), [ab, id, node?.x, node?.y, node?.width, node?.height, node?.rotation, node?.scaleX, node?.scaleY]);
  const toScreen = (lx: number, ly: number) => {
    const a = apply(m, lx, ly);
    return {
      x: panX + (ab.canvasX + a.x) * zoom,
      y: panY + (ab.canvasY + a.y) * zoom,
    };
  };
  const done = () => {
    store().commit();
    store().set({ croppingId: null });
  };
  const write = (c: ReturnType<typeof cropOf>) => {
    if (!node) return;
    store().setProps([id], { crop: stored(clampCrop(c, node.fit, size, natural)) }, `crop-${id}`);
  };
  // What the keyboard and the wheel work from: always the layer as it is now
  const now = () => {
    const n = locate(store().artboard()!, id)?.node as ImageNode | undefined;
    return n ? cropOf(n) : REST;
  };
  // A pointer position as pixels from the middle of the frame, in the frame's own (unrotated, unscaled) space
  const frameSpace = (clientX: number, clientY: number) => {
    const r = layer.current!.getBoundingClientRect();
    const sx = clientX - r.left;
    const sy = clientY - r.top;
    const w = apply(invert(m), (sx - panX) / zoom - ab.canvasX, (sy - panY) / zoom - ab.canvasY);
    return { x: w.x - size.w / 2, y: w.y - size.h / 2 };
  };

  // The wheel has to be native: the canvas listens for it too, and a React handler can't stop that
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const at = frameSpace(e.clientX, e.clientY);
      const c = now();
      write(zoomAt(c, c.zoom * Math.exp(-e.deltaY * 0.0015), at, size));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });
  // Take the keyboard when it opens, so Enter, Escape and the arrows are ours until it closes
  useEffect(() => layer.current?.focus(), []);
  // Picking anything else, or the layer going away, ends it
  useEffect(() => {
    if (!node) done();
  });

  if (!node || !frame) return null;
  const corners = [toScreen(0, 0), toScreen(size.w, 0), toScreen(size.w, size.h), toScreen(0, size.h)];
  const centre = toScreen(size.w / 2, size.h / 2);
  const c = cropOf(node);
  const inside = (cx: number, cy: number) => {
    const p = frameSpace(cx, cy);
    return Math.abs(p.x) <= size.w / 2 && Math.abs(p.y) <= size.h / 2;
  };
  const down = (e: React.PointerEvent) => {
    e.stopPropagation();
    const corner = (e.target as HTMLElement).closest<HTMLElement>('[data-corner]');
    if (!corner && !inside(e.clientX, e.clientY)) {
      done();
      return;
    }
    layer.current!.setPointerCapture(e.pointerId);
    const p = frameSpace(e.clientX, e.clientY);
    drag.current = {
      kind: corner ? 'zoom' : 'pan',
      x: e.clientX,
      y: e.clientY,
      crop: now(),
      dist: Math.max(1, Math.hypot(p.x, p.y)),
    };
  };
  const move = (e: React.PointerEvent) => {
    e.stopPropagation();
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      // the screen move as a move in the frame's own space, so a turned or scaled layer still follows the pointer
      const a = invert(m);
      const w0 = apply(a, 0, 0);
      const w1 = apply(a, (e.clientX - d.x) / zoom, (e.clientY - d.y) / zoom);
      write(panBy(d.crop, w1.x - w0.x, w1.y - w0.y, size));
    } else {
      const p = frameSpace(e.clientX, e.clientY);
      write(zoomAt(d.crop, d.crop.zoom * (Math.hypot(p.x, p.y) / d.dist), { x: 0, y: 0 }, size));
    }
  };
  const up = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = null;
    store().commit();
  };
  const key = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'Enter' || k === 'Escape') {
      e.preventDefault();
      done();
    } else if (k === '+' || k === '=' || k === '-' || k === '_') {
      e.preventDefault();
      const cur = now();
      write(zoomAt(cur, cur.zoom * (k === '+' || k === '=' ? 1.1 : 1 / 1.1), { x: 0, y: 0 }, size));
      store().commit();
    } else if (k.startsWith('Arrow')) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
      const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
      write(panBy(now(), dx, dy, size));
      store().commit();
    } else if (k === '0') {
      e.preventDefault();
      write(REST);
      store().commit();
    }
    // nothing typed in here is a shortcut for the editor behind it
    e.stopPropagation();
  };
  const top = Math.min(...corners.map((p) => p.y));
  const bottom = Math.max(...corners.map((p) => p.y));
  const barAt = {
    left: centre.x,
    top: top > 56 ? top - 12 : bottom + 12,
    transform: `translate(-50%, ${top > 56 ? '-100%' : '0'})`,
  };
  return (
    <div
      ref={layer}
      className="crop-layer"
      tabIndex={0}
      role="application"
      aria-label="Crop picture. Arrow keys move the picture, plus and minus zoom, 0 resets, Enter finishes"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg className="crop-frame" aria-hidden="true">
        <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} />
        {corners.map((p, i) => (
          <rect key={i} x={p.x - 5} y={p.y - 5} width={10} height={10} data-corner={i} />
        ))}
      </svg>
      <div className="crop-bar" style={barAt} onPointerDown={(e) => e.stopPropagation()}>
        <span className="crop-zoom" aria-live="off">
          {Math.round(c.zoom * 100)}%
        </span>
        <button type="button" onClick={() => write(zoomAt(now(), now().zoom / 1.25, { x: 0, y: 0 }, size))} aria-label="Zoom out" title="Zoom out (minus, or scroll down)">
          −
        </button>
        <button type="button" onClick={() => write(zoomAt(now(), now().zoom * 1.25, { x: 0, y: 0 }, size))} aria-label="Zoom in" title="Zoom in (plus, or scroll up)">
          +
        </button>
        <button type="button" onClick={() => write(REST)} disabled={c.zoom === 1 && c.x === 0 && c.y === 0} title="Put the picture back as its Fit draws it (0)">
          Reset
        </button>
        <button type="button" className="crop-done" onClick={done} title="Finish cropping (Enter)">
          Done
        </button>
      </div>
    </div>
  );
}
