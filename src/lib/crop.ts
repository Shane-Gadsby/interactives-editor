import { MAX_CROP_ZOOM, isCropped, type ImageCrop, type ImageFit, type ImageNode } from 'interactives-player';

/**
 * The maths of cropping a picture inside its frame. A crop is `{x, y, zoom}`: the picture drawn the way its fit draws it,
 * scaled about the middle of the frame, then moved by `x` and `y` (fractions of the frame's width and height). Everything
 * here is in the frame's own pixels, and the picture's own size is only needed to keep the frame filled.
 */

export interface Size {
  w: number;
  h: number;
}

export const REST: ImageCrop = { x: 0, y: 0, zoom: 1 };

/** The picture as the fit lays it out in the frame, before any zoom. */
export function fittedSize(fit: ImageFit, frame: Size, natural: Size): Size {
  if (fit === 'fill') return { w: frame.w, h: frame.h };
  const k = fit === 'contain' ? Math.min(frame.w / natural.w, frame.h / natural.h) : Math.max(frame.w / natural.w, frame.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/**
 * Keep the crop in bounds: a zoom of 1 to the most there is, and a move that never uncovers the frame (the picture's edge
 * never comes inside it). A picture smaller than the frame in one direction (a contain fit) only moves as far as it has room
 * to, which is not at all until it is zoomed past the frame. Without the picture's size the move is only kept sane.
 */
export function clampCrop(c: ImageCrop, fit: ImageFit, frame: Size, natural: Size | null): ImageCrop {
  const zoom = Math.min(MAX_CROP_ZOOM, Math.max(1, Number.isFinite(c.zoom) ? c.zoom : 1));
  let { x, y } = c;
  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;
  if (natural && natural.w > 0 && natural.h > 0 && frame.w > 0 && frame.h > 0) {
    const p = fittedSize(fit, frame, natural);
    const room = (picture: number, box: number) => Math.max(0, (picture * zoom - box) / 2) / box;
    const mx = room(p.w, frame.w);
    const my = room(p.h, frame.h);
    x = Math.min(mx, Math.max(-mx, x));
    y = Math.min(my, Math.max(-my, y));
  } else {
    x = Math.min(10, Math.max(-10, x));
    y = Math.min(10, Math.max(-10, y));
  }
  return { x: round(x), y: round(y), zoom: round(zoom) };
}

/** Move the picture by a distance in the frame's own pixels. */
export function panBy(c: ImageCrop, dx: number, dy: number, frame: Size): ImageCrop {
  return {
    ...c,
    x: c.x + dx / Math.max(1, frame.w),
    y: c.y + dy / Math.max(1, frame.h),
  };
}

/**
 * Zoom to a new level keeping the point under `at` (frame pixels from the frame's middle) where it is, the way a map zooms
 * under the pointer. `at` of 0, 0 zooms about the middle.
 */
export function zoomAt(c: ImageCrop, zoom: number, at: { x: number; y: number }, frame: Size): ImageCrop {
  const z = Math.min(MAX_CROP_ZOOM, Math.max(1, zoom));
  const k = z / c.zoom;
  // the picture's offset from the middle, in pixels, grows by k about the point that stays still
  const tx = at.x - (at.x - c.x * frame.w) * k;
  const ty = at.y - (at.y - c.y * frame.h) * k;
  return {
    x: tx / Math.max(1, frame.w),
    y: ty / Math.max(1, frame.h),
    zoom: z,
  };
}

/** A spot on the picture itself: 0, 0 is its top left corner and 1, 1 its bottom right. */
export interface Spot {
  u: number;
  v: number;
}

/**
 * The focal spot: the point of the picture that sits in the middle of the frame. 0.5, 0.5 (the picture's own middle) for
 * a picture that hasn't been moved.
 */
export function focalOf(c: ImageCrop, fit: ImageFit, frame: Size, natural: Size): Spot {
  const p = fittedSize(fit, frame, natural);
  const along = (move: number, box: number, picture: number) => 0.5 - (move * box) / Math.max(1, picture * c.zoom);
  return { u: along(c.x, frame.w, p.w), v: along(c.y, frame.h, p.h) };
}

/**
 * The crop that puts this spot of the picture in the middle of the frame, at the zoom it has. The spot is only reached as
 * far as the picture can move without uncovering the frame, so near an edge it comes as close as it can (`clampCrop`).
 */
export function withFocal(c: ImageCrop, spot: Spot, fit: ImageFit, frame: Size, natural: Size): ImageCrop {
  const p = fittedSize(fit, frame, natural);
  const move = (at: number, box: number, picture: number) => ((0.5 - at) * picture * c.zoom) / Math.max(1, box);
  return clampCrop({ zoom: c.zoom, x: move(spot.u, frame.w, p.w), y: move(spot.v, frame.h, p.h) }, fit, frame, natural);
}

/** The part of the picture the frame shows, as fractions of the picture: what a small map of the whole picture outlines. */
export function shownPart(c: ImageCrop, fit: ImageFit, frame: Size, natural: Size): { u: number; v: number; w: number; h: number } {
  const p = fittedSize(fit, frame, natural);
  const mid = focalOf(c, fit, frame, natural);
  const w = Math.min(1, frame.w / Math.max(1, p.w * c.zoom));
  const h = Math.min(1, frame.h / Math.max(1, p.h * c.zoom));
  return { u: mid.u - w / 2, v: mid.v - h / 2, w, h };
}

/** What gets stored: nothing at all for a crop that is back at rest. */
export function stored(c: ImageCrop): ImageCrop | undefined {
  return isCropped(c) ? c : undefined;
}

/** The crop a layer has now, or the resting one. */
export const cropOf = (n: { crop?: ImageCrop | null }): ImageCrop => (n.crop && isCropped(n.crop) ? n.crop : REST);

const round = (v: number) => Math.round(v * 10000) / 10000;

/** A picture can be cropped when it has a file and draws as one plain picture (not 9-sliced, not on a mesh). */
export function canCrop(n: ImageNode): boolean {
  return !!n.assetId && !n.slice && !(n.mesh?.vertices.length && n.mesh.triangles.length >= 3);
}
