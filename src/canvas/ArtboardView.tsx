import { useLayoutEffect, useRef } from 'react';
import { Renderer, prepareNodes, sampleArtboard, walk, type Artboard, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { previewScope } from '../lib/data';
import { editInstanceMount, instanceDepsKey } from './instances';
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
}

/** One artboard on the canvas, drawn by the player's own renderer in edit mode. */
export function ArtboardView({ artboard, project, timeline, time, active, assetVersion, dataVersion }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  // Instances draw other artboards, so they redraw when any artboard changes
  const depsKey = instanceDepsKey(project, artboard);

  // A layout effect, declared before the render one, so the renderer exists for the very first render.
  useLayoutEffect(() => {
    const r = new Renderer({ mode: 'edit', resolveAsset: assetUrls.resolve, mountInstance: editInstanceMount(() => store().get().project) });
    renderer.current = r;
    host.current!.appendChild(r.root);
    return () => {
      r.destroy();
      renderer.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const r = renderer.current;
    if (!r) return;
    const vars = previewScope(project);
    const sampled: SceneNode[] = timeline ? sampleArtboard(artboard.children, timeline, time) : artboard.children;
    // Same bindings and repeaters the player applies, against initial variable values and the loaded data.
    const nodes = prepareNodes(sampled, { vars });
    r.render(artboard, nodes, { vars });
    // Auto-sized text: measure and write the size back (no undo step).
    const updates: { id: string; width?: number; height?: number }[] = [];
    walk(artboard.children, (n) => {
      if (n.type !== 'text' || n.autoSize === 'none') return;
      const el = r.element(n.id);
      const span = el?.querySelector('.ix-text > span') as HTMLElement | null;
      if (!span) return;
      // The span is a stretched flex item, so its own width is the box's. The text's real extent comes from a
      // Range, scaled back out of the canvas zoom.
      const range = document.createRange();
      range.selectNodeContents(span);
      const rr = range.getBoundingClientRect();
      const scale = ((r.root.getBoundingClientRect().width / (artboard.width || 1)) || 1) * (Math.abs(n.scaleX) || 1);
      const h = Math.ceil(span.offsetHeight);
      if (n.autoSize === 'height') {
        if (h > 0 && Math.abs(h - n.height) > 1) updates.push({ id: n.id, height: h });
      } else {
        const w = Math.ceil(rr.width / scale) + 1;
        if (w > 1 && (Math.abs(w - n.width) > 1 || Math.abs(h - n.height) > 1)) updates.push({ id: n.id, width: w, height: h });
      }
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

  return (
    <div
      className={`artboard-view${active ? ' active' : ''}`}
      style={{ left: artboard.canvasX, top: artboard.canvasY, width: artboard.width, height: artboard.height }}
      data-artboard={artboard.id}
    >
      <div ref={host} className="artboard-host" />
    </div>
  );
}
