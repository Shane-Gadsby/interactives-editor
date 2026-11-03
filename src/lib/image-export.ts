import { Renderer, createStillShaders, prepareNodes, sampleArtboard, type Artboard, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { assetBytes } from './db';
import { download, fileSafe } from './export';
import { previewScope } from './data';
import { editInstanceMount } from '../canvas/instances';

/** A small JPEG of the start artboard, for the projects page. */
export async function projectThumbnail(project: Project, width = 400): Promise<Blob | null> {
  const ab = project.artboards.find((a) => a.id === project.settings.startArtboardId) ?? project.artboards[0];
  if (!ab) return null;
  const { svg } = await artboardSvg(project, ab, null, 0, { fonts: false });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const scale = Math.min(1, width / ab.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ab.width * scale));
  canvas.height = Math.max(1, Math.round(ab.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
}

/**
 * Pictures of an artboard: the same renderer the player uses, drawn into an SVG <foreignObject> with every image
 * and font inlined, so the file stands alone. PNG rasterises that SVG.
 */

const toDataUrl = (bytes: Uint8Array, mime: string) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
  });

// Font CSS per project font list (Google stylesheets and their files are fetched once)
const fontCssCache = new Map<string, Promise<string>>();
function fontCssCached(project: Project): Promise<string> {
  const key = JSON.stringify(project.fonts);
  let p = fontCssCache.get(key);
  if (!p) {
    p = fontCss(project);
    fontCssCache.set(key, p);
  }
  return p;
}

/**
 * A still of an artboard that's already drawn on the canvas: its DOM serialised into an SVG image, with assets and
 * fonts inlined. The canvas shows these for artboards you aren't working on, so the browser has far fewer live
 * elements to manage while you pan and zoom. Returns an object URL.
 */
export async function snapshotFromDom(project: Project, ab: Artboard, root: HTMLElement, resolve: (id: string) => string | undefined): Promise<string> {
  let html = new XMLSerializer().serializeToString(withCanvasesAsImages(root));
  for (const a of project.assets) {
    if (!/^image\//.test(a.mime)) continue;
    const url = resolve(a.id);
    if (!url || !html.includes(url.replace(/&/g, '&amp;'))) continue;
    const data = await dataUrlOf(project, a);
    if (data) html = html.split(url.replace(/&/g, '&amp;')).join(data);
  }
  const css = await fontCssCached(project);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ab.width}" height="${ab.height}" viewBox="0 0 ${ab.width} ${ab.height}">` +
    (css ? `<defs><style>${css.replace(/]]>/g, '')}</style></defs>` : '') +
    `<foreignObject x="0" y="0" width="${ab.width}" height="${ab.height}">${html}</foreignObject></svg>`;
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
}

/** Canvas pixels don't survive serialising: a copy of the tree where each canvas (script layers) is the picture it shows. */
function withCanvasesAsImages(root: HTMLElement): HTMLElement {
  const live = root.querySelectorAll('canvas');
  if (!live.length) return root;
  const copy = root.cloneNode(true) as HTMLElement;
  const copies = copy.querySelectorAll('canvas');
  live.forEach((c, i) => {
    try {
      const img = document.createElement('img');
      img.src = c.toDataURL();
      img.className = c.className;
      img.style.cssText = c.style.cssText;
      copies[i].replaceWith(img);
    } catch {
      /* a canvas the browser won't read: it is left out of the picture */
    }
  });
  return copy;
}

async function fontCss(project: Project): Promise<string> {
  const parts: string[] = [];
  for (const f of project.fonts) {
    try {
      if (f.source === 'asset' && f.assetId) {
        const a = project.assets.find((x) => x.id === f.assetId);
        const bytes = a && (await assetBytes(project.id, a));
        if (bytes) parts.push(`@font-face{font-family:${JSON.stringify(f.family)};src:url("${await toDataUrl(bytes, a!.mime || 'font/woff2')}")}`);
      } else if (f.source === 'google') {
        const weights = (f.weights?.length ? f.weights : [400, 700]).slice().sort((a, b) => a - b).join(';');
        let css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${weights}`)).text();
        // Inline each font file the stylesheet points at
        for (const m of [...css.matchAll(/url\((https:[^)]+)\)/g)]) {
          const bytes = new Uint8Array(await (await fetch(m[1])).arrayBuffer());
          css = css.replace(m[1], await toDataUrl(bytes, 'font/woff2'));
        }
        parts.push(css);
      }
    } catch {
      /* offline or blocked: the text falls back to a system font */
    }
  }
  return parts.join('\n');
}

// Data URLs per project asset, so repeated pictures (thumbnails) don't fetch every image again
const dataUrlCache = new Map<string, Promise<string | null>>();
function dataUrlOf(project: Project, a: Project['assets'][number]): Promise<string | null> {
  const key = `${project.id}/${a.id}`;
  let p = dataUrlCache.get(key);
  if (!p) {
    p = assetBytes(project.id, a).then((b) => (b ? toDataUrl(b, a.mime) : null));
    dataUrlCache.set(key, p);
  }
  return p;
}

export async function artboardSvg(project: Project, ab: Artboard, timeline: Timeline | null, time: number, opts: { fonts?: boolean } = {}): Promise<{ svg: string; warnings: string[] }> {
  const warnings: string[] = [];
  const urls = new Map<string, string>();
  for (const a of project.assets) {
    if (!/^image\//.test(a.mime)) continue;
    const u = await dataUrlOf(project, a);
    if (u) urls.set(a.id, u);
  }
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', width: `${ab.width}px`, height: `${ab.height}px` });
  document.body.appendChild(host);
  let still: ReturnType<typeof createStillShaders> | null = null;
  try {
    const resolve = (id: string) => urls.get(id);
    // Shader layers are painted once, at the timeline's time, and end up in the picture as the image of their canvas
    const shaders = (still = createStillShaders({
      resolveImage: (key) => {
        const a = project.assets.find((x) => x.id === key) ?? project.assets.find((x) => x.name === key);
        return a ? urls.get(a.id) : undefined;
      },
      time: timeline ? time / 1000 : 0,
      ratio: opts.fonts === false ? 1 : 2,
    }));
    const r = new Renderer({ mode: 'play', placeholderEmbeds: true, resolveAsset: resolve, mountInstance: editInstanceMount(() => project, 0, resolve), mountShader: shaders.mount });
    host.appendChild(r.root);
    const vars = previewScope(project, ab);
    const sampled: SceneNode[] = timeline ? sampleArtboard(ab.children, timeline, time) : ab.children;
    r.render(ab, prepareNodes(sampled, { vars }), { vars });
    if (r.root.querySelector('iframe, video, [data-ix-embed]')) warnings.push('Embeds and video show as empty boxes in pictures.');
    if (r.root.querySelector('canvas.ix-draw')) warnings.push('Script layers show as empty boxes in pictures.');
    if (r.root.querySelector('canvas.ix-shader')) {
      await shaders.settled();
      // A canvas's pixels don't survive serialising: each shader canvas becomes the picture it shows
      for (const c of Array.from(r.root.querySelectorAll<HTMLCanvasElement>('canvas.ix-shader'))) {
        try {
          const img = document.createElement('img');
          img.src = c.toDataURL();
          img.className = c.className;
          img.style.cssText = c.style.cssText;
          c.replaceWith(img);
        } catch {
          /* a canvas the browser won't read: it is left out of the picture */
        }
      }
      if (shaders.problems.length) warnings.push('Some shader layers could not be drawn (WebGL is unavailable or the shader has errors) and show as placeholders in pictures.');
    }
    const html = new XMLSerializer().serializeToString(r.root);
    const css = opts.fonts === false ? '' : await fontCssCached(project);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${ab.width}" height="${ab.height}" viewBox="0 0 ${ab.width} ${ab.height}">` +
      (css ? `<defs><style>${css.replace(/]]>/g, '')}</style></defs>` : '') +
      `<foreignObject x="0" y="0" width="${ab.width}" height="${ab.height}">${html}</foreignObject></svg>`;
    return { svg, warnings };
  } finally {
    still?.dispose();
    host.remove();
  }
}

export async function downloadArtboardSvg(project: Project, ab: Artboard, timeline: Timeline | null, time: number): Promise<string[]> {
  const { svg, warnings } = await artboardSvg(project, ab, timeline, time);
  download(new Blob([svg], { type: 'image/svg+xml' }), `${fileSafe(ab.name)}.svg`);
  return warnings;
}

export async function downloadArtboardPng(project: Project, ab: Artboard, timeline: Timeline | null, time: number, scale = 2): Promise<string[]> {
  const { svg, warnings } = await artboardSvg(project, ab, timeline, time);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ab.width * scale);
  canvas.height = Math.round(ab.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, ab.width, ab.height);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('The browser could not make the PNG.');
  download(blob, `${fileSafe(ab.name)}${scale !== 1 ? `@${scale}x` : ''}.png`);
  return warnings;
}
