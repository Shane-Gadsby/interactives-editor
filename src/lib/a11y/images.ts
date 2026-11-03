/**
 * Pictures behind text. The checker can't see pixels, so the editor shrinks each picture it needs to a small grid of colours
 * and the checker asks the grid what is under a point. `colourAround` is the pure part (fit maths on a grid); `loadGrids`
 * decodes the project's picture files in the browser.
 */
import type { ImageFit, Project, SceneNode } from 'interactives-player';
import { isContainer } from 'interactives-player';
import type { ImageColours } from './backdrop';
import type { RGB } from './colour';

export interface ImageGrid {
  cols: number;
  rows: number;
  /** The picture's own size, for the fit. */
  width: number;
  height: number;
  /** RGBA per cell, row by row. */
  data: ArrayLike<number>;
}

/** The colours of the cells around a point of a layer showing the picture with `fit`; [] where the picture does not reach, null when the grid has nothing. */
export function colourAround(grid: ImageGrid | undefined, fit: ImageFit | 'none', boxW: number, boxH: number, x: number, y: number): RGB[] | null {
  if (!grid || !grid.width || !grid.height || boxW <= 0 || boxH <= 0) return null;
  let u: number;
  let v: number;
  if (fit === 'fill') {
    u = x / boxW;
    v = y / boxH;
  } else {
    const scale = fit === 'contain' ? Math.min(boxW / grid.width, boxH / grid.height) : Math.max(boxW / grid.width, boxH / grid.height);
    const dw = grid.width * scale;
    const dh = grid.height * scale;
    u = (x - (boxW - dw) / 2) / dw;
    v = (y - (boxH - dh) / 2) / dh;
  }
  if (u < 0 || v < 0 || u > 1 || v > 1) return [];
  const cx = Math.min(grid.cols - 1, Math.floor(u * grid.cols));
  const cy = Math.min(grid.rows - 1, Math.floor(v * grid.rows));
  const out: RGB[] = [];
  for (let j = Math.max(0, cy - 1); j <= Math.min(grid.rows - 1, cy + 1); j++) {
    for (let i = Math.max(0, cx - 1); i <= Math.min(grid.cols - 1, cx + 1); i++) {
      const k = (j * grid.cols + i) * 4;
      // Mostly see-through cells show what is under the picture, not their own colour
      if (grid.data[k + 3] >= 128) out.push([grid.data[k], grid.data[k + 1], grid.data[k + 2]]);
    }
  }
  return out;
}

export function imageColoursFrom(grids: ReadonlyMap<string, ImageGrid>): ImageColours {
  return (assetId, fit, w, h, x, y) => colourAround(grids.get(assetId), fit, w, h, x, y);
}

/** Ids of the picture assets that layers or fills show. */
export function pictureAssets(project: Project): Set<string> {
  const ids = new Set<string>();
  const known = new Set(project.assets.filter((a) => a.mime.startsWith('image/')).map((a) => a.id));
  const visit = (list: SceneNode[]) => {
    for (const n of list) {
      if (n.type === 'image' && n.assetId && known.has(n.assetId)) ids.add(n.assetId);
      const x = n as unknown as { fill?: { type: string; assetId?: string } | null; fills?: { type: string; assetId?: string }[] };
      for (const f of [x.fill, ...(x.fills ?? [])]) if (f?.type === 'image' && f.assetId && known.has(f.assetId)) ids.add(f.assetId);
      if (isContainer(n)) visit(n.children);
    }
  };
  for (const ab of project.artboards) {
    visit(ab.children);
    const bg = ab.background;
    if (bg?.type === 'image' && known.has(bg.assetId)) ids.add(bg.assetId);
  }
  return ids;
}

const SIZE = 32;
const cache = new Map<string, Promise<ImageGrid | null>>();

/** Decode a picture into a grid. Null when the browser can't read it. Cached by url. */
export function loadGrid(url: string): Promise<ImageGrid | null> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<ImageGrid | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = SIZE;
          canvas.height = SIZE;
          const g = canvas.getContext('2d', { willReadFrequently: true });
          if (!g) return resolve(null);
          g.drawImage(img, 0, 0, SIZE, SIZE);
          const data = g.getImageData(0, 0, SIZE, SIZE).data;
          resolve({ cols: SIZE, rows: SIZE, width: img.naturalWidth || SIZE, height: img.naturalHeight || SIZE, data });
        } catch {
          // a picture the canvas refuses to read (tainted)
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

/** Grids for the pictures a project shows, by asset id; pictures that won't decode are left out (the checker says it couldn't tell). */
export async function loadGrids(project: Project, urlFor: (assetId: string) => string | undefined): Promise<Map<string, ImageGrid>> {
  const out = new Map<string, ImageGrid>();
  await Promise.all(
    [...pictureAssets(project)].map(async (id) => {
      const url = urlFor(id);
      const grid = url ? await loadGrid(url) : null;
      if (grid) out.set(id, grid);
    }),
  );
  return out;
}
