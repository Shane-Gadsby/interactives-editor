import { vi } from 'vitest';
import { setShaderContextFactory } from 'interactives-player';

/** A WebGL context that records what it is asked to do, for shader layer tests (jsdom has no WebGL). */
export interface MockGL {
  version: 1 | 2;
  /** Every call: [method, ...args]. */
  log: [string, ...unknown[]][];
  /** Sources handed to shaderSource, in order. */
  sources: string[];
  /** Latest value uploaded for a uniform name (arrays for vectors). */
  uniforms: Record<string, unknown>;
  /** Make the next compiles fail with this log (null: succeed). */
  compileLog: string | null;
  linkLog: string | null;
  /** Picture uploads throw (a picture from another site). */
  failTex: boolean;
  lost: boolean;
  gl: Record<string, unknown>;
  canvas: HTMLCanvasElement | null;
  count(method: string): number;
  draws(): number;
}

export function mockGL(version: 1 | 2 = 2): MockGL {
  const log: MockGL['log'] = [];
  const sources: string[] = [];
  const uniforms: Record<string, unknown> = {};
  const shaderLogs = new Map<unknown, string | null>();
  let n = 0;
  const m = { version, log, sources, uniforms, compileLog: null as string | null, linkLog: null as string | null, failTex: false, lost: false, canvas: null as HTMLCanvasElement | null } as unknown as MockGL;
  const rec = (name: string) => (...args: unknown[]) => {
    log.push([name, ...args]);
    return undefined;
  };
  const programs = new Map<unknown, string[]>();
  const impl: Record<string, (...a: any[]) => unknown> = {
    createBuffer: () => ({ buffer: n++ }),
    createTexture: () => ({ texture: n++ }),
    createShader: (kind: number) => ({ shader: n++, kind }),
    createProgram: () => ({ program: n++ }),
    shaderSource: (_sh: unknown, src: string) => void sources.push(src),
    compileShader: (sh: any) => {
      // The vertex shader (kind 35633) always compiles
      shaderLogs.set(sh, sh.kind === 35633 ? null : m.compileLog);
    },
    getShaderParameter: (sh: unknown) => !shaderLogs.get(sh),
    getShaderInfoLog: (sh: unknown) => shaderLogs.get(sh) ?? '',
    attachShader: () => undefined,
    linkProgram: () => undefined,
    getProgramParameter: () => !m.linkLog,
    getProgramInfoLog: () => m.linkLog ?? '',
    getUniformLocation: (p: unknown, name: string) => {
      programs.set(p, [...(programs.get(p) ?? []), name]);
      return { name };
    },
    uniform1f: (l: any, a: number) => void (uniforms[l.name] = a),
    uniform2f: (l: any, a: number, b: number) => void (uniforms[l.name] = [a, b]),
    uniform3f: (l: any, a: number, b: number, c: number) => void (uniforms[l.name] = [a, b, c]),
    uniform4f: (l: any, a: number, b: number, c: number, d: number) => void (uniforms[l.name] = [a, b, c, d]),
    uniform1i: (l: any, a: number) => void (uniforms[l.name] = a),
    texImage2D: (...a: unknown[]) => {
      // The six-argument form is a picture upload (the blank texture uses the nine-argument one)
      if (a.length === 6 && m.failTex) throw new DOMException('tainted', 'SecurityError');
    },
    getExtension: () => ({ loseContext: () => undefined }),
    isContextLost: () => m.lost,
  };
  const target: Record<string, unknown> = {};
  const gl = new Proxy(target, {
    get(_t, k: string) {
      if (k in impl) {
        return (...args: unknown[]) => {
          log.push([k, ...args]);
          return impl[k](...args);
        };
      }
      // Constants: any upper-case name gets a stable number (the vertex / fragment shader kinds matter to the mock)
      if (k === 'VERTEX_SHADER') return 35633;
      if (k === 'FRAGMENT_SHADER') return 35632;
      if (/^[A-Z0-9_]+$/.test(k)) return k.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 60000, 7);
      return rec(k);
    },
  });
  m.gl = gl;
  m.count = (name) => log.filter((c) => c[0] === name).length;
  m.draws = () => m.count('drawArrays');
  return m;
}

export interface Canvas2D {
  /** Per canvas: the calls its 2D context received. */
  calls: WeakMap<HTMLCanvasElement, [string, ...unknown[]][]>;
  log(c: HTMLCanvasElement): [string, ...unknown[]][];
}

/** Route getContext: '2d' to a recording context per canvas, webgl to the mock (or null when `gl` is null). */
export function installCanvas(gl: MockGL | null): Canvas2D {
  const calls = new WeakMap<HTMLCanvasElement, [string, ...unknown[]][]>();
  const ctxs = new WeakMap<HTMLCanvasElement, unknown>();
  setShaderContextFactory((canvas) => {
    if (!gl) return null;
    gl.canvas = canvas;
    return { gl: gl.gl as never, version: gl.version };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, type: string) {
    if (type !== '2d') return null;
    let ctx = ctxs.get(this);
    if (!ctx) {
      const list: [string, ...unknown[]][] = [];
      calls.set(this, list);
      const props: Record<string, unknown> = {};
      ctx = new Proxy({} as Record<string, unknown>, {
        // Plain properties (fillStyle...) behave like properties; everything else records the call
        get: (_t, k: string) =>
          k in props
            ? props[k]
            : (...args: unknown[]) => {
                list.push([k, ...args]);
                return k === 'measureText' ? { width: 10 } : undefined;
              },
        set: (_t, k: string, v) => {
          props[k] = k === 'fillStyle' && typeof v === 'string' && !/^#|^rgb/.test(v) ? '#000000' : v;
          return true;
        },
      });
      ctxs.set(this, ctx);
    }
    return ctx as never;
  } as never);
  return { calls, log: (c) => calls.get(c) ?? [] };
}

export function uninstallCanvas(): void {
  setShaderContextFactory(null);
  vi.restoreAllMocks();
}
