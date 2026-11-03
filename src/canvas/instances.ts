import { Renderer, prepareNodes, walk, type Artboard, type InstanceMount, type InstanceNode, type Project } from 'interactives-player';
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

// Identity keys for objects: immer keeps unchanged artboards as the same object, so a key changes only on edits.
const ids = new WeakMap<object, number>();
let nextId = 1;
function refKey(o: object): number {
  let k = ids.get(o);
  if (!k) ids.set(o, (k = nextId++));
  return k;
}

const targetsCache = new WeakMap<Artboard, string[]>();
function instanceTargets(ab: Artboard): string[] {
  let t = targetsCache.get(ab);
  if (!t) {
    const set = new Set<string>();
    walk(ab.children, (n) => {
      if (n.type === 'instance' && n.artboardId) set.add(n.artboardId);
    });
    t = [...set];
    targetsCache.set(ab, t);
  }
  return t;
}

/**
 * A key that changes when any artboard drawn through this artboard's instances (directly or nested) changes.
 * Lets the canvas skip redrawing instances whose content is the same.
 */
export function instanceDepsKey(project: Project, ab: Artboard, depth = 0, seen = new Set<string>()): string {
  const parts: string[] = [];
  for (const id of instanceTargets(ab)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const t = project.artboards.find((a) => a.id === id);
    if (!t) continue;
    parts.push(String(refKey(t)));
    if (depth < 4) parts.push(instanceDepsKey(project, t, depth + 1, seen));
  }
  return parts.join(',');
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
    let last = '';
    const draw = (n: InstanceNode) => {
      const project = getProject();
      const ab = project.artboards.find((a) => a.id === n.artboardId);
      if (!ab) return;
      // Same artboard (and nested ones), same box, same inputs: nothing to redraw
      const key = `${refKey(ab)}|${instanceDepsKey(project, ab)}|${n.width}x${n.height}|${n.fit}|${JSON.stringify(n.inputs ?? null)}|${refKey(project.variables)}`;
      if (key === last) return;
      last = key;
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
