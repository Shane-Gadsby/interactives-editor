import { uid, type CastExpression } from 'interactives-player';
import { encodePng, parsePsd, type PsdLayer, type PsdNode } from './psd-import';
import type { ImportedAsset } from './lottie-import';

/**
 * One drop of a character's PSD gives them their faces. The PSD is read the way character art is usually drawn: a group
 * called Faces (or Expressions, or Face) holds a layer or group per face, and everything else is the body that every face
 * sits on. Without such a group, the bottom layer is the body and each layer above it is a face. Layers named "<face> blink"
 * and "<face> talk" (or "eyes shut", "mouth open") become that face's blinking and talking pictures.
 *
 * Each face is flattened onto the body as one picture, and all of them are cropped to the same box, so swapping faces never
 * moves the character. Blend modes and masks are drawn as plain layers: character art rarely needs them, and the PSD import
 * on the Assets tab is there for anything that does.
 */

const FACES = /^(faces?|expressions?|emotions?)$/i;
const EXTRA = /^(.*?)[\s_-]*(blink|eyes shut|eyes closed|closed|talk|talking|mouth open)$/i;

interface Canvas {
  w: number;
  h: number;
  px: Uint8Array;
}

function blank(w: number, h: number): Canvas {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

/** Lay `layer`'s pixels over `c` (normal blending, its opacity times the groups' above it). */
function over(c: Canvas, layer: PsdLayer, alpha: number): void {
  if (!layer.width || !layer.height) return;
  const src = layer.getPixels();
  const a0 = Math.max(0, Math.min(1, alpha * layer.opacity));
  for (let y = 0; y < layer.height; y++) {
    const cy = layer.top + y;
    if (cy < 0 || cy >= c.h) continue;
    for (let x = 0; x < layer.width; x++) {
      const cx = layer.left + x;
      if (cx < 0 || cx >= c.w) continue;
      const s = (y * layer.width + x) * 4;
      const sa = (src[s + 3] / 255) * a0;
      if (sa <= 0) continue;
      const d = (cy * c.w + cx) * 4;
      const da = c.px[d + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let k = 0; k < 3; k++) c.px[d + k] = Math.round((src[s + k] * sa + c.px[d + k] * da * (1 - sa)) / oa);
      c.px[d + 3] = Math.round(oa * 255);
    }
  }
}

/** Every visible pixel layer under `nodes`, bottom first, with the opacity the groups above give it. */
function flatten(nodes: PsdNode[], alpha = 1, out: { layer: PsdLayer; alpha: number }[] = []): { layer: PsdLayer; alpha: number }[] {
  // painting order: the first is the bottom
  for (const n of nodes) {
    if (!n.visible) continue;
    if (n.kind === 'group') flatten(n.children, alpha * n.opacity, out);
    else if (!n.adjustment && !n.text) out.push({ layer: n, alpha });
  }
  return out;
}

const all = (n: PsdNode): { layer: PsdLayer; alpha: number }[] => (n.kind === 'group' ? flatten(n.children, n.opacity) : n.adjustment ? [] : [{ layer: n, alpha: 1 }]);

export interface CastPsd {
  faces: CastExpression[];
  assets: ImportedAsset[];
  warnings: string[];
}

export function castFromPsd(bytes: Uint8Array, who: string): CastPsd {
  const doc = parsePsd(bytes);
  const warnings = [...doc.warnings];
  const top = doc.nodes;
  const group = top.find((n) => n.kind === 'group' && FACES.test(n.name.trim()));
  let body: { layer: PsdLayer; alpha: number }[];
  let faceNodes: PsdNode[];
  if (group && group.kind === 'group') {
    body = flatten(top.filter((n) => n !== group));
    // in the order the Layers panel lists them, top first
    faceNodes = [...group.children].reverse();
  } else {
    // the bottom layer is the body, the rest are faces
    body = top.length > 1 ? all(top[0]) : [];
    faceNodes = top.length > 1 ? top.slice(1).reverse() : top;
  }
  if (!faceNodes.length) {
    warnings.push('No faces found: name a group Faces, with a layer for each face in it');
    return { faces: [], assets: [], warnings };
  }
  //each face as a full-size picture: the body, then the face
  const pics = faceNodes.map((n) => {
    const c = blank(doc.width, doc.height);
    for (const b of body) over(c, b.layer, b.alpha);
    for (const f of all(n)) over(c, f.layer, f.alpha);
    return { name: n.name.trim() || 'face', c };
  });
  //one box round everything drawn in any of them, so they all line up
  let x0 = doc.width;
  let y0 = doc.height;
  let x1 = -1;
  let y1 = -1;
  for (const { c } of pics)
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++)
        if (c.px[(y * c.w + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
  if (x1 < 0) {
    warnings.push('The faces are empty');
    return { faces: [], assets: [], warnings };
  }
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const crop = (c: Canvas) => {
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(c.px.subarray(((y + y0) * c.w + x0) * 4, ((y + y0) * c.w + x0 + w) * 4), y * w * 4);
    return out;
  };
  const assets: ImportedAsset[] = [];
  const faces = new Map<string, CastExpression>();
  const extras: { face: string; kind: 'blink' | 'talk'; id: string }[] = [];
  for (const { name, c } of pics) {
    const id = uid('as');
    assets.push({ id, name: `${who} ${name}.png`, mime: 'image/png', bytes: encodePng(w, h, crop(c)) });
    const extra = EXTRA.exec(name);
    if (extra) extras.push({ face: (extra[1].trim() || 'neutral').toLowerCase(), kind: /blink|eyes|closed/i.test(extra[2]) ? 'blink' : 'talk', id });
    else if (!faces.has(name.toLowerCase())) faces.set(name.toLowerCase(), { name: name.toLowerCase(), assetId: id });
  }
  for (const x of extras) {
    const f = faces.get(x.face) ?? (faces.size === 1 ? [...faces.values()][0] : undefined);
    if (f && !f[x.kind]) f[x.kind] = x.id;
  }
  // a face called neutral (or normal, default) goes first, as the one they come on with
  const list = [...faces.values()].sort((a, b) => Number(/^(neutral|normal|default)$/.test(b.name)) - Number(/^(neutral|normal|default)$/.test(a.name)));
  return { faces: list, assets, warnings };
}
