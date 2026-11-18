import type { ImageNode } from 'interactives-player';
import { isCropped } from 'interactives-player';
import { store } from '../store/store';
import { REST, clampCrop, cropOf, focalOf, shownPart, stored, withFocal, zoomAt, type Size } from '../lib/crop';
import { assetUrls } from '../lib/assets';
import { useNaturalSize } from '../lib/natural-size';
import type { ImageCrop } from 'interactives-player';
import { NumberField } from './ui';
import { PropRow } from '../lib/prop-search';

/**
 * The Crop part of a picture's settings: the button that starts crop mode on the canvas, Reset, and the three numbers behind
 * it (Zoom, and how far the picture is moved across and down, as percents of the frame). The numbers are the same `crop`
 * the canvas edits, kept so the picture still fills its frame.
 */
export function CropFields({ node }: { node: ImageNode }) {
  const natural = useNaturalSize(node.assetId);
  const c = cropOf(node);
  const frame = { w: node.width, h: node.height };
  const write = (next: typeof c) => store().setProps([node.id], { crop: stored(clampCrop(next, node.fit, frame, natural)) }, `crop-${node.id}`);
  return (
    <>
      <PropRow
        k="crop"
        label="Crop"
        tip="Move and zoom the picture inside its frame. Double-click the picture, or press Enter on it, to crop on the canvas"
        words={['crop picture', 'reposition', 'move picture', 'focal point', 'focus', 'pan', 'zoom picture', 'cut off', 'face']}
        className="crop-row"
      >
        <div className="crop-buttons">
          <button
            type="button"
            className="crop-start"
            onClick={() => store().set({ croppingId: node.id })}
            title="Crop on the canvas: drag the picture inside its frame, scroll to zoom, Enter to finish (or double-click the picture)"
          >
            Crop picture…
          </button>
          <button type="button" disabled={!isCropped(node.crop)} onClick={() => write(REST)} title="Put the picture back as its Fit draws it">
            Reset crop
          </button>
        </div>
      </PropRow>
      {natural && node.assetId && <FocalSpot node={node} crop={c} frame={frame} natural={natural} write={write} />}
      <PropRow k="crop-zoom" label="Zoom" tip="How far the picture is zoomed in its frame. Drag for a rough zoom, or type it in the box below" words={['zoom', 'magnify', 'closer', 'crop picture']}>
        <input
          className="crop-zoom-slider"
          type="range"
          min={100}
          max={Math.max(400, Math.ceil(c.zoom * 100))}
          step={1}
          value={Math.round(c.zoom * 100)}
          aria-label="Zoom"
          aria-valuetext={`${Math.round(c.zoom * 100)} percent`}
          title="Zoom: drag to bring the picture closer. It zooms about the focal spot, which stays in the middle of the frame"
          //(about the middle of the frame, so the focal spot stays where it is as the picture comes closer)
          onChange={(e) => write(zoomAt(c, Number(e.target.value) / 100, { x: 0, y: 0 }, frame))}
          onPointerUp={() => store().commit()}
          onKeyUp={() => store().commit()}
          onBlur={() => store().commit()}
        />
      </PropRow>
      <NumberField
        label="Zoom"
        title="How far the picture is zoomed in its frame, as a percent: 100% is as Fit draws it, 200% shows the middle quarter"
        value={c.zoom}
        scale={100}
        suffix="%"
        step={5}
        min={100}
        max={2000}
        onChange={(v) => write({ ...c, zoom: v })}
        onCommit={() => store().commit()}
      />
      <NumberField
        label="Picture X"
        title="How far the picture is moved across inside its frame, as a percent of the frame's width. Positive moves it right"
        value={c.x}
        scale={100}
        suffix="%"
        step={1}
        min={-1000}
        max={1000}
        onChange={(v) => write({ ...c, x: v })}
        onCommit={() => store().commit()}
      />
      <NumberField
        label="Picture Y"
        title="How far the picture is moved down inside its frame, as a percent of the frame's height. Positive moves it down"
        value={c.y}
        scale={100}
        suffix="%"
        step={1}
        min={-1000}
        max={1000}
        onChange={(v) => write({ ...c, y: v })}
        onCommit={() => store().commit()}
      />
    </>
  );
}

/**
 * The focal spot: a small map of the whole picture with a dot on the point that sits in the middle of the frame, and an
 * outline of the part the frame shows. Click or drag on the map to put the dot there; the arrow keys nudge it. It is the
 * same `crop` the canvas edits, said the way a person thinks of it ("keep her face in the middle").
 */
function FocalSpot({ node, crop, frame, natural, write }: { node: ImageNode; crop: ImageCrop; frame: Size; natural: Size; write: (c: ImageCrop) => void }) {
  const url = assetUrls.resolve(node.assetId!);
  const spot = focalOf(crop, node.fit, frame, natural);
  const part = shownPart(crop, node.fit, frame, natural);
  const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10}%`;
  const to = (u: number, v: number) => write(withFocal(crop, { u: Math.min(1, Math.max(0, u)), v: Math.min(1, Math.max(0, v)) }, node.fit, frame, natural));
  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    to((e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1));
  };
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    to(spot.u + m[0], spot.v + m[1]);
  };
  return (
    <PropRow k="crop-focal" label="Focal spot" tip="The part of the picture that stays in the middle of the frame. Click it on the small picture" words={['focal point', 'focus', 'face', 'centre', 'subject', 'position', 'crop picture']} className="focal-row">
      <div className="focal-wrap">
        <div className="field-label block">Focal spot</div>
        <div
          className="focal-map"
          tabIndex={0}
          role="slider"
          aria-label="Focal spot"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(spot.u * 100)}
          aria-valuetext={`${Math.round(spot.u * 100)}% across, ${Math.round(spot.v * 100)}% down`}
          title="Click the part of the picture to keep in the middle of the frame, or drag the dot. Arrow keys nudge it, Shift for bigger steps. The outline is what the frame shows"
          //(as wide as the panel, but never so tall it takes it over: a tall picture's map is narrower instead of squashed)
          style={{ aspectRatio: `${natural.w} / ${natural.h}`, width: `min(100%, ${Math.round((180 * natural.w) / natural.h)}px)` }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            fromPointer(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons & 1) fromPointer(e);
          }}
          onPointerUp={() => store().commit()}
          onKeyDown={key}
          onBlur={() => store().commit()}
        >
          {url && <img src={url} alt="" draggable={false} />}
          <span className="focal-part" style={{ left: pct(part.u), top: pct(part.v), width: pct(part.w), height: pct(part.h) }} />
          <span className="focal-dot" style={{ left: pct(spot.u), top: pct(spot.v) }} />
        </div>
        <div className="hint">Click what matters most. With no zoom, the picture can only move the way it overflows its frame.</div>
      </div>
    </PropRow>
  );
}
