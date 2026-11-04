import { noteLayerFault } from './analytics';
import { useSyncExternalStore } from 'react';
import { DrawLayer, type DrawFrameInput, type DrawFrameResult, type DrawMount, type DrawNode, type DrawRunner, type Project, type ScriptApi, type ScriptHost } from 'interactives-player';
import { assetUrls } from './assets';
import { previewScope } from './data';

/** What went wrong in each script layer (by layer id), for the inspector and the canvas. */
export interface DrawProblem {
  message: string;
  kind: 'error' | 'warning';
}

const problems = new Map<string, DrawProblem>();
const listeners = new Set<() => void>();
let version = 0;

function setProblem(id: string, p: DrawProblem | null): void {
  const had = problems.get(id);
  if (!p && !had) return;
  if (p && had && had.message === p.message && had.kind === p.kind) return;
  if (p) problems.set(id, p);
  else problems.delete(id);
  version++;
  for (const l of listeners) l();
}

export function drawProblem(id: string): DrawProblem | undefined {
  return problems.get(id);
}

/** The current problem of a script layer, updating when it changes. */
export function useDrawProblem(id: string): DrawProblem | undefined {
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

type SandboxHost = ScriptHost & { release(ix: ScriptApi): void };

/** The script sandbox is about 1 MB: fetched the first time a project has a script layer to paint. Always the sandbox, whatever the project's setting, so project code never runs in the editor's own page. */
let sandbox: Promise<SandboxHost> | null = null;
function loadSandbox(): Promise<SandboxHost> {
  sandbox ??= import('@player-sandbox').then((m) => m.createSandboxHost());
  return sandbox;
}

/** The editor's script host for painting: the sandbox, loaded on demand; frames report `pending` until it is. */
class EditorDrawHost implements ScriptHost {
  private host: SandboxHost | null = null;
  private failed: string | null = null;
  private readonly waiting = new Set<() => void>();

  constructor() {
    loadSandbox().then(
      (h) => {
        this.host = h;
        for (const w of [...this.waiting]) w();
      },
      (err) => {
        this.failed = `The script sandbox could not be loaded: ${String(err instanceof Error ? err.message : err)}`;
        for (const w of [...this.waiting]) w();
      },
    );
  }

  run(): unknown {
    return undefined;
  }

  /** Called once the sandbox is ready (or has failed). */
  whenReady(fn: () => void): () => void {
    this.waiting.add(fn);
    if (this.host || this.failed) queueMicrotask(() => this.waiting.has(fn) && fn());
    return () => this.waiting.delete(fn);
  }

  release(ix: ScriptApi): void {
    this.host?.release(ix);
  }

  createDraw(code: string, ix: ScriptApi, label: string, seed: number): DrawRunner {
    let inner: DrawRunner | null = null;
    return {
      frame: (input: DrawFrameInput): DrawFrameResult => {
        if (this.failed) return { error: this.failed };
        if (!this.host) return { pending: true };
        inner ??= this.host.createDraw!(code, ix, label, seed);
        return inner.frame(input);
      },
      dispose: () => {
        inner?.dispose();
        inner = null;
      },
    };
  }
}

// Identity keys for objects: immer keeps unchanged objects, so a key changes only on edits.
const ids = new WeakMap<object, number>();
let nextId = 1;
const refKey = (o: object): number => {
  let k = ids.get(o);
  if (!k) ids.set(o, (k = nextId++));
  return k;
};

export interface EditorDraw {
  /** The renderer's `mountDraw`. */
  mount: (node: DrawNode, canvas: HTMLCanvasElement) => DrawMount | null;
  /** The time to paint at (seconds into the active timeline, or 0) and a number that changes when loaded data or assets do. Set before rendering. */
  configure(time: number, epoch: string | number): void;
  dispose(): void;
}

/**
 * Script layers on the editor canvas: each paints one frame (at the timeline's time, 0 when it isn't playing),
 * in the sandbox, whenever its code, size, the variables or the time change. The script starts over for each paint,
 * so what you see is a pure function of the document and the time, not of how long you have been editing.
 */
export function createEditorDraw(getProject: () => Project): EditorDraw {
  // The sandbox is only fetched when the first script layer shows up
  let host: EditorDrawHost | null = null;
  let stopWaiting: (() => void) | null = null;
  const mounts = new Set<{ retry: () => void }>();
  let time = 0;
  let epoch: string | number = 0;
  let disposed = false;

  // The script's view of the project: variables at their starting values and the loaded data, read-only; no pointer.
  const ix = {
    get vars() {
      return previewScope(getProject());
    },
    get: (name: string) => previewScope(getProject())[name],
    set: () => undefined,
    node: () => null,
    nodes: () => [],
    timeline: () => null,
    goTo: () => undefined,
    emit: () => undefined,
    on: () => () => undefined,
    onFrame: () => () => undefined,
    pointer: { x: 0, y: 0, down: false },
    get artboard() {
      const a = getProject().artboards[0];
      return { id: a?.id ?? '', name: a?.name ?? '', width: a?.width ?? 0, height: a?.height ?? 0 };
    },
    log: (...args: unknown[]) => console.log('[script layer]', ...args),
    get data() {
      return previewScope(getProject()).data as Record<string, unknown>;
    },
    loadData: async () => undefined,
    setData: () => undefined,
    setCursor: () => undefined,
    setInstanceInput: () => false,
    getInstanceInput: () => undefined,
    fireInstanceTrigger: () => false,
  } as unknown as ScriptApi;
  const hostFor = (): EditorDrawHost => {
    if (!host) {
      host = new EditorDrawHost();
      stopWaiting = host.whenReady(() => {
        for (const m of mounts) m.retry();
      });
    }
    return host;
  };

  return {
    configure(t, e) {
      time = t;
      epoch = e;
    },
    mount(node, canvas) {
      if (node.runInEditor === false || disposed) return null;
      let current = node;
      let lastKey = '';
      const layer = new DrawLayer({
        canvas,
        host: hostFor(),
        ix,
        resolveImage: (key) => {
          const p = getProject();
          const a = p.assets.find((x) => x.id === key) ?? p.assets.find((x) => x.name === key);
          return a ? assetUrls.resolve(a.id) : undefined;
        },
        autoRatio: () => Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
        errorOnCanvas: true,
        onError: (message, kind) => (noteLayerFault('draw', message, kind === 'error' ? 'error' : 'warning'), setProblem(node.id, { message, kind })),
      });
      const paint = (): void => {
        const p = getProject();
        const key = JSON.stringify([current.code, current.width, current.height, current.visible, current.pixelRatio, time, epoch, refKey(p.variables), refKey(p.dataSources)]);
        if (key === lastKey) return;
        // The picture is a function of the document and the time: start the script over for each paint
        layer.restart(current);
        setProblem(node.id, null);
        if (layer.tick(time * 1000, true, 0) || layer.failed) lastKey = key;
        // Otherwise the sandbox is still loading: `retry` paints once it is here
      };
      const mount = { retry: paint };
      mounts.add(mount);
      layer.update(current);
      paint();
      return {
        update: (n) => {
          if (n.runInEditor === false) return false;
          current = n;
          layer.update(n);
          paint();
        },
        destroy: () => {
          mounts.delete(mount);
          layer.destroy();
          setProblem(node.id, null);
        },
      };
    },
    dispose() {
      disposed = true;
      stopWaiting?.();
      mounts.clear();
      host?.release(ix);
    },
  };
}
