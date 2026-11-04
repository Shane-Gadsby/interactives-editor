import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { recordDrawnGeometry } from '../store/doc';
import { flushSync } from 'react-dom';
import { Renderer, paintToCss, drawnDifferently, isContainer, measureTextBox, prepareNodes, sampleArtboard, walk, textGrowShift, type Artboard, type ContainerNode, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { previewScope } from '../lib/data';
import { editInstanceMount, instanceDepsKey } from './instances';
import { canvasResolver, shownTheme } from '../lib/themes';
import { createEditorDraw, type EditorDraw } from '../lib/draw-edit';
import { createEditorShader, type EditorShader } from '../lib/shader-edit';
import { assetUrls } from '../lib/assets';
import { store } from '../store/store';
import { usePrefs } from '../lib/prefs';
import { ghostLayers, outsideClipPath, setGhostExtent } from './ghost';
import { cachedStill, isCachedUrl, saveStill, stillHash } from '../lib/still-cache';

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
  /**
   * Leave the live DOM for later: the artboard shows its background until the scheduler gets to it (see `scheduleView`), the nearest
   * to the viewport first. Without it (and always for the active artboard) it is drawn at once. Stills wait for the DOM.
   */
  deferred?: boolean;
  /** How far the artboard is from the viewport (0 when it is in it): the nearest deferred ones are drawn first. */
  rank?: number;
  /** The theme (id) whose colours theme tokens are drawn with; null is the project's default. */
  canvasTheme?: string | null;
}

/** A picture standing in for an artboard that isn't live (an SVG made of its DOM) */
interface Snap {
  url: string;
  key: string;
}

interface ViewJob {
  rank: number;
  /** Its picture is already showing (from a saved still), so drawing the live DOM is not urgent and goes in smaller bites */
  quiet?: boolean;
  run: () => void;
}
const jobs = new Set<ViewJob>();
let pumping = false;
// A frame's worth of drawing: one artboard at least, then more while this much time is left
const FRAME_BUDGET = 10;
// Artboards that already show a picture only need their live DOM in the background
const QUIET_BUDGET = 4;
// While the canvas is held back for the first fill (see `holdView`) nothing is on screen to stutter, so frames can be fuller
const OPENING_BUDGET = 24;
let holding = false;
const waiters = new Set<() => void>();
// Quiet ones always go after the rest
const QUIET_RANK = 1e9;

/**
 * Deferred artboards draw one at a time between frames, nearest the viewport first, so a project with dozens of artboards
 * opens on the active one and fills in around it instead of drawing everything in one long task.
 */
function scheduleView(job: ViewJob): () => void {
  jobs.add(job);
  if (!pumping) {
    pumping = true;
    nextFrame(pump);
  }
  return () => {
    jobs.delete(job);
    settle();
  };
}

/** Whether every artboard that is in view and has no picture yet has been drawn */
const inViewDone = () => !decoding.size && ![...jobs].some((j) => !j.quiet && j.rank < 1);
// Pictures that are on their way in (loading and decoding), so the canvas can wait for them too
const decoding = new Set<object>();
function settle(): void {
  if (!waiters.size || !inViewDone()) return;
  for (const w of [...waiters]) w();
}

/** Resolves once the artboards in view are drawn (or after `maxMs`): the canvas stays hidden until then, and fades in */
export function whenViewDrawn(maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      waiters.delete(done);
      resolve();
    };
    const t = setTimeout(done, maxMs);
    waiters.add(done);
    // Nothing to wait for (everything in view is drawn already): a couple of frames on says so (the zoom may still be settling)
    nextFrame(() => nextFrame(settle));
  });
}

/** Fuller frames while the canvas is held back */
export function holdView(on: boolean): void {
  holding = on;
}

function nextFrame(f: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => f());
  else setTimeout(f, 16);
}

function pump(): void {
  const t0 = performance.now();
  let ran = 0;
  while (jobs.size) {
    let best: ViewJob | null = null;
    for (const j of jobs) if (!best || j.rank + (j.quiet ? QUIET_RANK : 0) < best.rank + (best.quiet ? QUIET_RANK : 0)) best = j;
    const budget = holding && !best!.quiet ? OPENING_BUDGET : best!.quiet ? QUIET_BUDGET : FRAME_BUDGET;
    if (ran && performance.now() - t0 >= budget) break;
    jobs.delete(best!);
    ran++;
    try {
      best!.run();
    } catch (err) {
      console.warn('[interactives] artboard draw failed', err);
    }
  }
  settle();
  if (jobs.size) nextFrame(pump);
  else pumping = false;
}

// One still at a time, when the browser is idle, so making them never holds up editing
let queue: Promise<void> = Promise.resolve();
const idle = () => new Promise<void>((r) => ((window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 50)))(() => r(), { timeout: 2000 }));
let snapSeq = 0;

/** One artboard on the canvas, drawn by the player's own renderer in edit mode. */
export function ArtboardView({ artboard, project, timeline, time, active, assetVersion, dataVersion, live, deferred = false, rank = 0, canvasTheme = null }: Props) {
  // What theme tokens are drawn as (the same function while neither the themes nor the theme shown change)
  const resolver = canvasResolver(project, canvasTheme);
  const themeSig = `${project.themes ? snapKey(project.themes) : 0}|${shownTheme(project, canvasTheme)?.id ?? ''}`;
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  // The faint copy of the layers hanging outside a clipping artboard (see ghost.ts): a second renderer for just those layers
  const ghostEl = useRef<HTMLDivElement>(null);
  const ghostR = useRef<Renderer | null>(null);
  const { ghostOutside } = usePrefs();
  const draw = useRef<EditorDraw | null>(null);
  const shader = useRef<EditorShader | null>(null);
  // Instances draw other artboards, so they redraw when any artboard changes
  const depsKey = instanceDepsKey(project, artboard);

  // What the artboard looks like, as one image, while you work elsewhere (see the stills below). One saved from the last session
  // is here from the first render, so the artboard is never an empty background that fills in later.
  const key = `${snapKey(artboard)}|${depsKey}|${assetVersion}|${dataVersion}|${snapKey(project.variables)}|${snapKey(project.fonts)}|${themeSig}`;
  const [snap, setSnap] = useState<Snap | null>(() => {
    const url = active ? null : cachedStill(project.id, artboard.id, stillHash(project, artboard, shownTheme(project, canvasTheme)?.id ?? null));
    return url ? { url, key } : null;
  });

  // Whether the live DOM is being drawn. Once it is, it stays (stills are made from it, and switching back is instant)
  const [started, setStarted] = useState(!deferred || active);
  if (!started && (!deferred || active)) setStarted(true);
  const job = useRef<ViewJob>({ rank, run: () => undefined });
  job.current.rank = rank;
  job.current.run = () => flushSync(() => setStarted(true));
  useLayoutEffect(() => {
    if (started) return;
    return scheduleView(job.current);
  }, [started]);

  // What was drawn last, so a change to a few layers (a keystroke in a field, a timeline frame) redraws just those.
  // Tied to the renderer it was drawn into: a new renderer has drawn nothing, whatever the props say.
  // (Declared above the renderer effect, whose cleanup clears it.)
  const lastDraw = useRef<{ renderer: Renderer; resolver: unknown; artboard: Artboard; variables: unknown; dataSources: unknown; assetVersion: number; dataVersion: number; depsKey: string; nodes: SceneNode[]; plain: boolean } | null>(null);

  // A layout effect, declared before the render one, so the renderer exists for the very first render.
  useLayoutEffect(() => {
    // Script layers paint one still frame in the sandbox (loaded the first time a project has one)
    const d = createEditorDraw(() => store().get().project);
    // Shaders paint a still frame each (or run live when the layer asks to), on one shared WebGL context
    const sh = createEditorShader(() => store().get().project);
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve, mountInstance: editInstanceMount(() => store().get().project, 0, assetUrls.resolve, () => canvasResolver(store().get().project, store().get().canvasTheme)), mountDraw: d.mount, mountShader: sh.mount });
    renderer.current = r;
    draw.current = d;
    shader.current = sh;
    host.current!.appendChild(r.root);
    return () => {
      // What was drawn went with the renderer: its replacement (StrictMode's second mount, or any remount) starts empty
      lastDraw.current = null;
      r.destroy();
      d.dispose();
      sh.dispose();
      renderer.current = null;
      ghostR.current?.destroy();
      ghostR.current = null;
      setGhostExtent(artboard.id, null);
      draw.current = null;
      shader.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const r = renderer.current;
    if (!r || !started) return;
    r.setColorResolver(resolver);
    const last = lastDraw.current;
    const sampled: SceneNode[] = timeline ? sampleArtboard(artboard.children, timeline, time) : artboard.children;
    let drawn = false;
    // What got drawn (bindings, repeaters and layout applied), which the ghost layers are picked from
    let shown: SceneNode[] = sampled;
    // Nothing derived from the whole tree (bindings, repeaters, constraints, layout, script layers, instances) and nothing
    // else the drawing depends on changed: find the layers that did (immer shares the rest, so this only follows what
    // changed) and redraw just those. Any change in structure, or anything unusual, draws the whole artboard instead
    if (last?.plain && last.renderer === r && last.resolver === resolver && last.variables === project.variables && last.dataSources === project.dataSources && last.assetVersion === assetVersion && last.dataVersion === dataVersion && last.depsKey === depsKey && sameFrame(last.artboard, artboard)) {
      const changed = new Map<string, SceneNode>();
      if (diffTrees(last.nodes, sampled, changed)) {
        drawn = !changed.size || r.updateNodes(changed.keys(), changed);
        if (drawn) lastDraw.current = { ...last, artboard, nodes: sampled };
      }
    }
    if (!drawn) {
      const vars = previewScope(project, artboard);
      // Same bindings and repeaters the player applies, against initial variable values and the loaded data.
      const nodes = prepareNodes(sampled, { vars });
      // Script layers paint at the timeline's time (0 when none is showing), again when assets or data change
      draw.current?.configure(timeline ? time / 1000 : 0, `${assetVersion}|${dataVersion}`);
      shader.current?.configure(timeline ? time / 1000 : 0, assetVersion);
      r.render(artboard, nodes, { vars });
      shown = nodes;
      // Where layers ended up after bindings, repeaters and layout, for the selection outline and hit testing (only for the
      // design view: a timeline's pose is not where the document has the layer)
      if (!timeline) recordDrawnGeometry(artboard.id, artboard.children, nodes);
      let plain = nodes === sampled;
      if (plain) walk(sampled, (n) => void (plain &&= !drawnDifferently(n)));
      lastDraw.current = { renderer: r, resolver, artboard, variables: project.variables, dataSources: project.dataSources, assetVersion, dataVersion, depsKey, nodes: sampled, plain };
    }
    // Layers past the edge of an artboard that clips: a faint copy of just those, outside the artboard only
    const ghost = ghostOutside && artboard.clip ? ghostLayers(shown, artboard.width, artboard.height) : null;
    setGhostExtent(artboard.id, ghost?.extent ?? null);
    if (ghost && ghostEl.current) {
      if (!ghostR.current) {
        ghostR.current = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve });
        ghostEl.current.appendChild(ghostR.current.root);
      }
      ghostR.current.setColorResolver(resolver);
      ghostR.current.render({ ...artboard, clip: false, background: null }, ghost.nodes, { vars: previewScope(project, artboard) });
      // The ghost's box covers everything it draws, since the stripes (a css mask) only reach as far as its box
      const e = ghost.extent;
      const l = Math.min(0, Math.floor(e.x0)),
        t = Math.min(0, Math.floor(e.y0));
      const w = Math.max(artboard.width, Math.ceil(e.x1)) - l,
        h = Math.max(artboard.height, Math.ceil(e.y1)) - t;
      const gs = ghostEl.current.style;
      gs.left = `${l}px`;
      gs.top = `${t}px`;
      gs.width = `${w}px`;
      gs.height = `${h}px`;
      gs.clipPath = outsideClipPath(artboard.width, artboard.height, -l, -t);
      ghostR.current.root.style.left = `${-l}px`;
      ghostR.current.root.style.top = `${-t}px`;
    } else {
      ghostR.current?.destroy();
      ghostR.current = null;
      ghostEl.current?.removeAttribute('style');
    }
    // Auto-sized text: measure and write the size back (no undo step).
    const updates: { id: string; width?: number; height?: number; x?: number; y?: number }[] = [];
    // Only on the artboard being worked on: the others are drawn for their stills (and, off screen, whenever the scheduler gets
    // to them), and what they would measure there (at any zoom, as soon as fonts have loaded) is not a reason to change the
    // document. Their text is measured when the artboard becomes the active one.
    if (live)
      walk(artboard.children, (n, parent) => {
        if (n.type !== 'text' || n.autoSize === 'none') return;
        // Measuring forces a layout: only layers whose text, styling or width changed since they were last measured
        if (!r.textNeedsMeasure(n.id)) return;
        const el = r.element(n.id);
        const span = el?.querySelector('.ix-text > span') as HTMLElement | null;
        if (!span) return;
        // The span is a stretched flex item, so its own width is the box's. The text's real extent comes from a
        // Range, scaled back out of the canvas zoom.
        // Without text modifiers' offsets: the layout is measured, not how the units are moved
        // (a hugging text with a width limit is measured at the limit)
        const { box: rr, height: h } = measureTextBox(span, n.autoSize === 'width' ? n.maxWidth : undefined);
        const scale = ((r.root.getBoundingClientRect().width / (artboard.width || 1)) || 1) * (Math.abs(n.scaleX) || 1);
        const before = updates.length;
        if (n.autoSize === 'height') {
          if (h > 0 && Math.abs(h - n.height) > 1) updates.push({ id: n.id, height: h });
        } else {
          const w = Math.ceil(rr.width / scale) + 1;
          // The extent is only as precise as the screen pixels it was measured in (a quarter of a pixel, scaled back out of the
          // zoom): zoomed far out, a change smaller than that is noise, and writing it would measure differently the next time
          const slack = Math.max(1, 0.5 / scale);
          if (w > 1 && (Math.abs(w - n.width) > slack || Math.abs(h - n.height) > 1)) {
            // Centred and right-aligned text grows around its alignment point, so x moves with the width (not for a layer an
            // auto layout places: its x comes from the layout)
            const at = parent?.type === 'frame' && parent.layout ? null : textGrowShift(n, w);
            updates.push({ id: n.id, width: w, height: h, ...(at && (at.x !== n.x || at.y !== n.y) ? at : {}) });
          }
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
            if (u) Object.assign(n, u.width !== undefined ? { width: u.width } : {}, u.height !== undefined ? { height: u.height } : {}, u.x !== undefined ? { x: u.x } : {}, u.y !== undefined ? { y: u.y } : {});
          });
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artboard, project.variables, project.dataSources, timeline, time, assetVersion, dataVersion, depsKey, started, live, ghostOutside, resolver]);

  // ---- stills
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (live || !started || snap?.key === key) return;
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
        // For the next session (the key just confirmed this is the artboard as it is now)
        saveStill(store().get().project.id, artboard.id, stillHash(store().get().project, artboard, shownTheme(project, canvasTheme)?.id ?? null), url);
      } catch (err) {
        console.warn('[interactives] artboard still failed', mine, err);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, live, started]);
  // Each still's object URL is released when the next one replaces it, or the artboard goes
  useEffect(
    () => () => {
      if (snap && !isCachedUrl(snap.url)) URL.revokeObjectURL(snap.url);
    },
    [snap],
  );
  // The picture is only swapped in once the browser has decoded it: until then whatever is under it (the live DOM, or the
  // artboard's background) stays, so an artboard never flashes empty between the two
  const canDecode = typeof HTMLImageElement !== 'undefined' && typeof HTMLImageElement.prototype.decode === 'function';
  const [decoded, setDecoded] = useState<string | null>(null);
  const picture = !live && snap && (snap.key === key || !started) ? snap : null;
  const showStill = !!picture && (!canDecode || decoded === picture.url);
  job.current.quiet = !!picture;
  // Counts as drawn only once the picture is, so the first fill waits for it
  const waitingOnPicture = !!picture && !showStill;
  useLayoutEffect(() => {
    if (!waitingOnPicture) return;
    const token = {};
    decoding.add(token);
    return () => {
      decoding.delete(token);
      settle();
    };
  }, [waitingOnPicture, picture?.url]);

  return (
    <div
      className={`artboard-view${active ? ' active' : ''}`}
      style={{ left: artboard.canvasX, top: artboard.canvasY, width: artboard.width, height: artboard.height }}
      data-artboard={artboard.id}
    >
      {/* Layers hanging outside a clipping artboard, faintly, outside its edge only. Nothing in it takes the pointer. */}
      <div ref={ghostEl} className="artboard-ghost" />
      {/* The live DOM stays (hidden) under a still, so switching back is instant and stills can be remade from it */}
      <div ref={host} className="artboard-host" style={showStill ? { display: 'none' } : undefined} />
      {/* Not drawn yet: the artboard's own background, so it is where it will be */}
      {!started && <div className="artboard-pending" style={{ background: paintToCss(artboard.background, assetUrls.resolve) }} />}
      {picture && (
        <img
          key={picture.url}
          className={`artboard-still${showStill ? ' shown' : ''}${started ? '' : ' fade'}`}
          src={picture.url}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const url = picture.url;
            void e.currentTarget.decode().then(
              () => setDecoded(url),
              () => setDecoded(url),
            );
          }}
        />
      )}
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
