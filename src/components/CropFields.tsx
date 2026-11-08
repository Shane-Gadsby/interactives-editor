import type { ImageNode } from 'interactives-player';
import { isCropped } from 'interactives-player';
import { store } from '../store/store';
import { REST, clampCrop, cropOf, stored } from '../lib/crop';
import { useNaturalSize } from '../lib/natural-size';
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
