import { useSyncExternalStore } from 'react';
import { ShaderLayer, shaderSpec, type ImageNode, type Project, type SceneNode, type ShaderMount, type ShaderNode, type ShaderProblem } from 'interactives-player';
import { assetUrls } from './assets';

/** What went wrong in each shader (by layer id), for the inspector. */
export interface ShaderEditProblem {
  message: string;
  kind: 'error' | 'warning';
  /** Lines in the layer's code, for the code editor to mark. */
  problems: ShaderProblem[];
}

const problems = new Map<string, ShaderEditProblem>();
const listeners = new Set<() => void>();
let version = 0;

function setProblem(id: string, p: ShaderEditProblem | null): void {
  const had = problems.get(id);
  if (!p && !had) return;
  if (p && had && had.message === p.message && had.kind === p.kind) return;
  if (p) problems.set(id, p);
  else problems.delete(id);
  version++;
  for (const l of listeners) l();
}

export function shaderProblem(id: string): ShaderEditProblem | undefined {
  return problems.get(id);
}

/** The current problem of a shader (a shader layer or an image's shader filter), updating when it changes. */
export function useShaderProblem(id: string): ShaderEditProblem | undefined {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  return problems.get(id);
}

// ---------------------------------------------------------------------------

export interface EditorShader {
  /** The renderer's `mountShader`. */
  mount: (node: ShaderNode | ImageNode, canvas: HTMLCanvasElement) => ShaderMount | null;
  /** The time to paint stills at (seconds into the active timeline, or 0) and a number that changes when loaded assets do. Set before rendering. */
  configure(time: number, epoch: string | number): void;
  dispose(): void;
}

/**
 * Shaders on the editor canvas. By default each paints one still frame, at the timeline's time (0 when none is showing),
 * whenever its code, uniforms, size or the time change: what you see is a function of the document and the time, which
 * keeps editing smooth and the GPU idle. A layer with "Animate while editing" on runs live instead, through one
 * shared animation loop that stops when no such layer is left.
 */
export function createEditorShader(getProject: () => Project): EditorShader {
  let time = 0;
  let epoch: string | number = 0;
  let disposed = false;
  const live = new Set<{ tick: (now: number) => void }>();
  let raf = 0;
  const loop = (now: number) => {
    raf = 0;
    for (const l of live) l.tick(now);
    if (live.size && !disposed) raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (!raf && live.size && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
  };

  return {
    configure(t, e) {
      time = t;
      epoch = e;
    },
    mount(node, canvas) {
      if (disposed) return null;
      let current: SceneNode = node;
      let lastKey = '';
      const id = node.id;
      const layer = new ShaderLayer({
        canvas,
        resolveImage: (key) => {
          const p = getProject();
          const a = p.assets.find((x) => x.id === key) ?? p.assets.find((x) => x.name === key);
          return a ? assetUrls.resolve(a.id) : undefined;
        },
        autoRatio: () => Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
        errorOnCanvas: true,
        onError: (message, kind, list) => setProblem(id, { message, kind, problems: list }),
      });
      const animated = (): boolean => !!shaderSpec(current)?.animateInEditor;
      const runner = {
        tick: (now: number) => {
          if (animated()) layer.tick(now);
        },
      };
      const paint = (): void => {
        const spec = shaderSpec(current);
        if (!spec) return;
        if (animated()) {
          lastKey = '';
          live.add(runner);
          wake();
          // Compile errors show up on the first frame
          if (layer.frameCount === 0) layer.tick(performance.now(), true);
          return;
        }
        live.delete(runner);
        // Variables only matter through bindings, which are applied before the node gets here; loaded assets are in the epoch
        const key = JSON.stringify([spec.code, spec.uniforms, spec.width, spec.height, spec.visible, spec.pixelRatio, spec.self, time, epoch]);
        if (key === lastKey) return;
        lastKey = key;
        // A change of code restarts the layer inside `update`, so a fixed shader draws here and clears its problem
        layer.renderAt(time);
        if (!layer.failed) setProblem(id, null);
      };
      layer.update(current);
      paint();
      return {
        update: (n) => {
          current = n;
          if (!layer.update(n)) {
            live.delete(runner);
            return false;
          }
          // The shader's own failure is shown by the layer; a filter keeps showing the plain picture meanwhile
          paint();
        },
        active: () => layer.active,
        onActiveChange: (cb) => void (layer.onActiveChange = cb),
        destroy: () => {
          live.delete(runner);
          layer.destroy();
          setProblem(id, null);
        },
      };
    },
    dispose() {
      disposed = true;
      live.clear();
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
