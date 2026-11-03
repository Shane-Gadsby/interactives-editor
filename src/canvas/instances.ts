import { Renderer, prepareNodes, type InstanceMount, type InstanceNode, type Project } from 'interactives-player';
import { assetUrls } from '../lib/assets';
import { previewScope } from '../lib/data';

/** Scale and offset that fit an artboard of size aw x ah into a box, per an instance's fit mode. */
export function fitInBox(fit: InstanceNode['fit'], bw: number, bh: number, aw: number, ah: number): { sx: number; sy: number; ox: number; oy: number } {
  let sx = 1;
  let sy = 1;
  if (fit === 'fill') {
    sx = bw / Math.max(1, aw);
    sy = bh / Math.max(1, ah);
  } else if (fit === 'contain' || fit === 'cover') {
    sx = sy = (fit === 'contain' ? Math.min : Math.max)(bw / Math.max(1, aw), bh / Math.max(1, ah));
  }
  return { sx, sy, ox: (bw - aw * sx) / 2, oy: (bh - ah * sy) / 2 };
}

/**
 * Instances on the editor canvas: the referenced artboard drawn statically (bindings and repeaters against
 * initial values), with nested instances down to a few levels.
 */
export function editInstanceMount(getProject: () => Project, depth = 0): (node: InstanceNode, host: HTMLElement) => InstanceMount {
  return (node, host) => {
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve, mountInstance: depth < 4 ? editInstanceMount(getProject, depth + 1) : undefined });
    Object.assign(r.root.style, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
    host.appendChild(r.root);
    const draw = (n: InstanceNode) => {
      const project = getProject();
      const ab = project.artboards.find((a) => a.id === n.artboardId);
      if (!ab) return;
      const vars = previewScope(project);
      for (const [k, v] of Object.entries(n.inputs ?? {})) vars[k] = v;
      r.render(ab, prepareNodes(ab.children, { vars }), { vars });
      const f = fitInBox(n.fit, n.width, n.height, ab.width, ab.height);
      r.root.style.transform = `translate(${f.ox}px, ${f.oy}px) scale(${f.sx}, ${f.sy})`;
    };
    draw(node);
    return { update: draw, destroy: () => r.destroy() };
  };
}
