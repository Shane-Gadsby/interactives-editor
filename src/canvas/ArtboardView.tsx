import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer, drawnDifferently, isContainer, measureTextExtent, prepareNodes, sampleArtboard, walk, type Artboard, type ContainerNode, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { previewScope } from '../lib/data';
import { editInstanceMount, instanceDepsKey } from './instances';
import { createEditorDraw, type EditorDraw } from '../lib/draw-edit';
import { createEditorShader, type EditorShader } from '../lib/shader-edit';
import { assetUrls } from '../lib/assets';
import { store } from '../store/store';

interface Props {
  artboard: Artboard;
  project: Project;
  /** Timeline to preview at `time` (active artboard only). */
  timeline: Timeline | null;
  time: number;
  active: boolean;
  assetVersion: number;
  dataVersion: number;
  /** Keep the live DOM showing. Otherwise, once a still has been made, the artboard shows as that picture. */
  live: boolean;
}

// One still at a time, when the browser is idle, so making them never holds up editing
let queue: Promise<void> = Promise.resolve();
const idle = () => new Promise<void>((r) => ((window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 50)))(() => r(), { timeout: 2000 }));
let snapSeq = 0;

/** One artboard on the canvas, drawn by the player's own renderer in edit mode. */
export function ArtboardView({ artboard, project, timeline, time, active, assetVersion, dataVersion, live }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const draw = useRef<EditorDraw | null>(null);
  const shader = useRef<EditorShader | null>(null);
  // Instances draw other artboards, so they redraw when any artboard changes
  const depsKey = instanceDepsKey(project, artboard);

  // A layout effect, declared before the render one, so the renderer exists for the very first render.
  useLayoutEffect(() => {
    // Script layers paint one still frame in the sandbox (loaded the first time a project has one)
    const d = createEditorDraw(() => store().get().project);
    // Shaders paint a still frame each (or run live when the layer asks to), on one shared WebGL context
    const sh = createEditorShader(() => store().get().project);
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve, mountInstance: editInstanceMount(() => store().get().project), mountDraw: d.mount, mountShader: sh.mount });
    renderer.current = r;
    draw.current = d;
    shader.current = sh;
    host.current!.appendChild(r.root);
    return () => {
      r.destroy();
      d.dispose();
      sh.dispose();
      renderer.current = null;
      draw.current = null;
      shader.current = null;
    };
  }, []);

  // What was drawn last, so a change to a few layers (a keystroke in a field, a timeline frame) redraws just those
  const lastDraw = useRef<{ artboard: Artboard; variables: unknown; dataSources: unknown; assetVersion: number; dataVersion: number; depsKey: string; nodes: SceneNode[]; plain: boolean } | null>(null);

  useLayoutEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const last = lastDraw.current;
    const sampled: SceneNode[] = timeline ? sampleArtboard(artboard.children, timeline, time) : artboard.children;
    let drawn = false;
    // Nothing derived from the whole tree (bindings, repeaters, constraints, layout, script layers, instances) and nothing
    // else the drawing depends on changed: find the layers that did (immer shares the rest, so this only follows what
    // changed) and redraw just those. Any change in structure, or anything unusual, draws the whole artboard instead
    if (last?.plain && last.variables === project.variables && last.dataSources === project.dataSources && last.assetVersion === assetVersion && last.dataVersion === dataVersion && last.depsKey === depsKey && sameFrame(last.artboard, artboard)) {
      const changed = new Map<string, SceneNode>();
      if (diffTrees(last.nodes, sampled, changed)) {
        drawn = !changed.size || r.updateNodes(changed.keys(), changed);
        if (drawn) lastDraw.current = { ...last, artboard, nodes: sampled };
      }
    }
    if (!drawn) {
      const vars = previewScope(project);
      // Same bindings and repeaters the player applies, against initial variable values and the loaded data.
      const nodes = prepareNodes(sampled, { vars });
      // Script layers paint at the timeline's time (0 when none is showing), again when assets or data change
      draw.current?.configure(timeline ? time / 1000 : 0, `${assetVersion}|${dataVersion}`);
      shader.current?.configure(timeline ? time / 1000 : 0, assetVersion);
      r.render(artboard, nodes, { vars });
      let plain = nodes === sampled;
      if (plain) walk(sampled, (n) => void (plain &&= !drawnDifferently(n)));
      lastDraw.current = { artboard, variables: project.variables, dataSources: project.dataSources, assetVersion, dataVersion, depsKey, nodes: sampled, plain };
    }
    // Auto-sized text: measure and write the size back (no undo step).
    const updates: { id: string; width?: number; height?: number }[] = [];
    walk(artboard.children, (n) => {
      if (n.type !== 'text' || n.autoSize === 'none') return;
      // Measuring forces a layout: only layers whose text, styling or width changed since they were last measured
      if (!r.textNeedsMeasure(n.id)) return;
      const el = r.element(n.id);
      const span = el?.querySelector('.ix-text > span') as HTMLElement | null;
      if (!span) return;
      // The span is a stretched flex item, so its own width is the box's. The text's real extent comes from a
      // Range, scaled back out of the canvas zoom.
      // Without text modifiers' offsets: the layout is measured, not how the units are moved
      const rr = measureTextExtent(span);
      const scale = ((r.root.getBoundingClientRect().width / (artboard.width || 1)) || 1) * (Math.abs(n.scaleX) || 1);
      const h = Math.ceil(span.offsetHeight);
      const before = updates.length;
      if (n.autoSize === 'height') {
        if (h > 0 && Math.abs(h - n.height) > 1) updates.push({ id: n.id, height: h });
      } else {
        const w = Math.ceil(rr.width / scale) + 1;
        if (w > 1 && (Math.abs(w - n.width) > 1 || Math.abs(h - n.height) > 1)) updates.push({ id: n.id, width: w, height: h });
      }
      // Done with this layer, unless it was not laid out yet (hidden, or not attached) or its new size can't be written
      // now (a timeline frame is showing): then it is measured again on a later render
      if ((h > 0 || rr.width > 0) && (updates.length === before || !timeline)) r.textMeasured(n.id);
    });
    if (updates.length && !timeline) {
      queueMicrotask(() =>
        store().patchSilently((d) => {
          const ab = d.artboards.find((a) => a.id === artboard.id);
          if (!ab) return;
          walk(ab.children as SceneNode[], (n) => {
            const u = updates.find((x) => x.id === n.id);
            if (u) Object.assign(n, u.width !== undefined ? { width: u.width } : {}, u.height !== undefined ? { height: u.height } : {});
          });
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artboard, project.variables, project.dataSources, timeline, time, assetVersion, dataVersion, depsKey]);

  // ---- stills: what the artboard looks like, as one image, while you work elsewhere
  const [snap, setSnap] = useState<{ url: string; key: string } | null>(null);
  const key = `${snapKey(artboard)}|${depsKey}|${assetVersion}|${dataVersion}|${snapKey(project.variables)}|${snapKey(project.fonts)}`;
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (live || snap?.key === key) return;
    let cancelled = false;
    const mine = ++snapSeq;
    queue = queue.then(async () => {
      await idle();
      const r = renderer.current;
      if (cancelled || !r || keyRef.current !== key) return;
      try {
        const { snapshotFromDom } = await import('../lib/image-export');
        const url = await snapshotFromDom(store().get().project, artboard, r.root, assetUrls.resolve);
        if (cancelled || keyRef.current !== key) {
          URL.revokeObjectURL(url);
          return;
        }
        setSnap({ url, key });
      } catch (err) {
        console.warn('[interactives] artboard still failed', mine, err);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, live]);
  // Each still's object URL is released when the next one replaces it, or the artboard goes
  useEffect(
    () => () => {
      if (snap) URL.revokeObjectURL(snap.url);
    },
    [snap],
  );
  const showStill = !live && snap?.key === key;

  return (
    <div
      className={`artboard-view${active ? ' active' : ''}`}
      style={{ left: artboard.canvasX, top: artboard.canvasY, width: artboard.width, height: artboard.height }}
      data-artboard={artboard.id}
    >
      {/* The live DOM stays (hidden) under a still, so switching back is instant and stills can be remade from it */}
      <div ref={host} className="artboard-host" style={showStill ? { display: 'none' } : undefined} />
      {showStill && <img className="artboard-still" src={snap!.url} alt="" draggable={false} />}
    </div>
  );
}

/** Whether two versions of an artboard draw the same outside its layers (its size, background and clipping). */
function sameFrame(a: Artboard, b: Artboard): boolean {
  return a.width === b.width && a.height === b.height && a.background === b.background && a.clip === b.clip;
}

/**
 * The layers that differ between two versions of a tree, by reference, into `out` (a changed group counts, and so do the
 * changed layers inside it). False when the tree changed shape (a layer added, removed, moved or retyped) or a changed layer
 * is drawn differently from what it is, which needs the whole artboard drawn again.
 */
function diffTrees(a: SceneNode[], b: SceneNode[], out: Map<string, SceneNode>): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x.id !== y.id || x.type !== y.type || drawnDifferently(y)) return false;
    out.set(y.id, y);
    if (isContainer(x) && isContainer(y) && !diffTrees(x.children, (y as ContainerNode).children, out)) return false;
  }
  return true;
}

// Identity keys for document objects: immer keeps unchanged objects, so a new key means something changed
const keys = new WeakMap<object, number>();
let nextKey = 1;
function snapKey(o: object): number {
  let k = keys.get(o);
  if (!k) keys.set(o, (k = nextKey++));
  return k;
}
