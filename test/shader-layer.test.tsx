import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  SHADER_PRESETS,
  buildFragmentSource,
  createArtboard,
  createNode,
  createProject,
  prepareNodes,
  Renderer,
  sampleArtboard,
  shaderStats,
  normalizeProject,
  type ImageNode,
  type SceneNode,
  type ShaderNode,
} from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { addShaderFilter, addUniform, applyShaderPreset, freshUniformName, removeShaderFilter, removeUniform, retypeUniform } from '../src/lib/shader-uniform-edit';
import { createEditorShader, shaderProblem } from '../src/lib/shader-edit';
import { assetUrls } from '../src/lib/assets';
import { analyzeUsage } from '../src/lib/dependencies';
import { artboardSvg } from '../src/lib/image-export';
import { ShaderFilterFields, ShaderSection } from '../src/panels/ShaderInspector';
import { getTopic, TOPICS, topicBody } from '../src/help/topics';
import { searchHelp } from '../src/help/search';
import { installCanvas, mockGL, uninstallCanvas, type MockGL } from './gl-mock';

// export.ts embeds the player's IIFE build (`@player-iife?raw`), which needs a built player; pictures only use two of its helpers
vi.mock('../src/lib/export', () => ({ download: vi.fn(), fileSafe: (s: string) => s }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TRIVIAL = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.0);\n}\n';

function editor(...nodes: SceneNode[]) {
  const p = createProject('T');
  p.artboards[0].children.push(...nodes);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return s;
}
const shaderOf = (s: EditorStore, i = 0) => s.artboard()!.children[i] as ShaderNode;
const imageOf = (s: EditorStore, i = 0) => s.artboard()!.children[i] as ImageNode;

let gl: MockGL;
beforeEach(() => {
  gl = mockGL(2);
  installCanvas(gl);
});
afterEach(() => {
  expect(shaderStats().layers).toBe(0);
  uninstallCanvas();
  vi.unstubAllGlobals();
});

describe('shader layer: creating and editing', () => {
  it('is a normal layer that starts with a working shader', () => {
    const n = createNode('shader');
    expect(n).toMatchObject({ type: 'shader', name: 'Shader layer', fps: 0, pixelRatio: 'auto', animateInEditor: false, width: 320, height: 200 });
    expect(n.code).toContain('mainImage');
    expect(n.uniforms.length).toBeGreaterThan(0);
  });

  it('is added, edited and undone like other layers', () => {
    const n = createNode('shader');
    const s = editor();
    s.addNodes([n], { artboardId: s.get().activeArtboardId });
    expect(s.artboard()!.children.map((c) => c.type)).toEqual(['shader']);
    s.setProps([n.id], { fps: 30, pixelRatio: 2, animateInEditor: true, code: TRIVIAL });
    expect([shaderOf(s).fps, shaderOf(s).pixelRatio, shaderOf(s).animateInEditor, shaderOf(s).code]).toEqual([30, 2, true, TRIVIAL]);
    s.undo();
    expect(shaderOf(s).fps).toBe(0);
  });

  it('survives normalisation with its settings and uniforms', () => {
    const n = createNode('shader', { fps: 24, pixelRatio: 1.5 });
    const p = createProject('T');
    p.artboards[0].children.push(n);
    expect(normalizeProject(p).artboards[0].children[0]).toMatchObject({ type: 'shader', fps: 24, pixelRatio: 1.5, uniforms: n.uniforms });
  });

  it('has a tool, in the toolbar types and the Tool union', () => {
    const s = editor();
    s.set({ tool: 'shader' });
    expect(s.get().tool).toBe('shader');
  });
});

describe('shader presets', () => {
  it('offers the library the brief names', () => {
    const ids = SHADER_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['clouds', 'plasma', 'ripples', 'glow', 'grain', 'wave', 'crt', 'halftone', 'voronoi']));
  });

  it('replaces the code and uniforms in one undo step, and drops animation aimed at the old uniforms', () => {
    const n = createNode('shader', { bindings: { 'uniforms.0.value': 'x' } });
    const s = editor(n);
    s.keyCurrent(n.id, 'uniforms.0.value');
    const before = shaderOf(s).code;
    applyShaderPreset(n.id, '', 'plasma');
    const got = shaderOf(s);
    expect(got.code).toContain('Plasma');
    expect(got.uniforms.map((u) => u.name)).toEqual(['speed', 'scale', 'hue']);
    expect(got.bindings).toBeUndefined();
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(0);
    s.undo();
    expect(shaderOf(s).code).toBe(before);
    expect(shaderOf(s).bindings).toBeDefined();
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(1);
  });

  it('gives a picture preset on a shader layer an image uniform to choose the picture with', () => {
    const n = createNode('shader');
    const s = editor(n);
    applyShaderPreset(n.id, '', 'halftone');
    expect(shaderOf(s).uniforms.at(-1)).toEqual({ name: 'u_image', type: 'image', value: '' });
    applyShaderPreset(n.id, '', 'unknown-preset');
    expect(shaderOf(s).code).toContain('Halftone');
  });

  it('every preset applies to a layer and to a filter', () => {
    const n = createNode('shader');
    const img = createNode('image', { shaderFilter: { code: TRIVIAL, uniforms: [] } });
    const s = editor(n, img);
    for (const p of SHADER_PRESETS) {
      applyShaderPreset(n.id, '', p.id);
      expect(shaderOf(s).code, p.id).toBe(p.code);
      applyShaderPreset(img.id, 'shaderFilter.', p.id);
      expect(imageOf(s, 1).shaderFilter!.code, p.id).toBe(p.code);
      expect(imageOf(s, 1).shaderFilter!.preset).toBe(p.id);
      expect(imageOf(s, 1).shaderFilter!.uniforms.some((u) => u.name === 'u_image')).toBe(false);
    }
  });
});

describe('shader uniforms', () => {
  it('adds uniforms with fresh names and each type\'s default value', () => {
    const n = createNode('shader', { uniforms: [] });
    const s = editor(n);
    for (const t of ['float', 'vec2', 'vec3', 'vec4', 'color', 'image'] as const) addUniform(n.id, '', t);
    expect(shaderOf(s).uniforms).toEqual([
      { name: 'value1', type: 'float', value: 0 },
      { name: 'value2', type: 'vec2', value: [0, 0] },
      { name: 'value3', type: 'vec3', value: [0, 0, 0] },
      { name: 'value4', type: 'vec4', value: [0, 0, 0, 1] },
      { name: 'color1', type: 'color', value: '#ffffff' },
      { name: 'image1', type: 'image', value: '' },
    ]);
    expect(freshUniformName([{ name: 'value1', type: 'float', value: 0 }])).toBe('value2');
  });

  it('edits a value by its path, a vector one part at a time', () => {
    const n = createNode('shader', { uniforms: [{ name: 'p', type: 'vec2', value: [1, 2] }, { name: 'k', type: 'float', value: 0 }] });
    const s = editor(n);
    s.setProps([n.id], { 'uniforms.0.value.1': 9, 'uniforms.1.value': 0.5 });
    expect(shaderOf(s).uniforms.map((u) => u.value)).toEqual([[1, 9], 0.5]);
    s.undo();
    expect(shaderOf(s).uniforms.map((u) => u.value)).toEqual([[1, 2], 0]);
  });

  it('keeps tracks and bindings pointing at the right uniform when one is removed, and drops the ones aimed at it', () => {
    const n = createNode('shader', {
      uniforms: [
        { name: 'a', type: 'float', value: 1 },
        { name: 'b', type: 'vec2', value: [0, 0] },
        { name: 'c', type: 'color', value: '#ff0000' },
      ],
      bindings: { 'uniforms.0.value': 'one', 'uniforms.2.value': 'tint' },
    });
    const s = editor(n);
    s.keyCurrent(n.id, 'uniforms.0.value');
    s.keyCurrent(n.id, 'uniforms.1.value.1');
    s.keyCurrent(n.id, 'uniforms.2.value');
    s.keyCurrent(n.id, 'x');
    removeUniform(n.id, '', 1);
    expect(shaderOf(s).uniforms.map((u) => u.name)).toEqual(['a', 'c']);
    expect(s.artboard()!.timelines[0].tracks.map((t) => t.prop).sort()).toEqual(['uniforms.0.value', 'uniforms.1.value', 'x']);
    expect(shaderOf(s).bindings).toEqual({ 'uniforms.0.value': 'one', 'uniforms.1.value': 'tint' });
    s.undo();
    expect(shaderOf(s).uniforms).toHaveLength(3);
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(4);
  });

  it('changing a uniform\'s type starts its value over and drops animation of the old type', () => {
    const n = createNode('shader', { uniforms: [{ name: 'a', type: 'float', value: 4 }] });
    const s = editor(n);
    s.keyCurrent(n.id, 'uniforms.0.value');
    retypeUniform(n.id, '', 0, 'color');
    expect(shaderOf(s).uniforms[0]).toEqual({ name: 'a', type: 'color', value: '#ffffff' });
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(0);
  });
});

describe('shader uniform keys and bindings', () => {
  it('◆ keys a float, a vector part, a colour and an image, and the timeline plays them', () => {
    const n = createNode('shader', {
      uniforms: [
        { name: 'k', type: 'float', value: 0 },
        { name: 'p', type: 'vec2', value: [0, 0] },
        { name: 'tint', type: 'color', value: '#000000' },
        { name: 'pic', type: 'image', value: '' },
      ],
    });
    const s = editor(n);
    s.set({ bottomTab: 'timeline', playhead: 0 });
    for (const prop of ['uniforms.0.value', 'uniforms.1.value.0', 'uniforms.2.value', 'uniforms.3.value']) s.keyCurrent(n.id, prop);
    s.set({ playhead: 1000 });
    s.setProps([n.id], { 'uniforms.0.value': 10, 'uniforms.1.value.0': 4, 'uniforms.2.value': '#ffffff', 'uniforms.3.value': 'asset2' });
    // Not recording: the base values changed, so key them at 1000 too
    for (const prop of ['uniforms.0.value', 'uniforms.1.value.0', 'uniforms.2.value', 'uniforms.3.value']) s.keyCurrent(n.id, prop);
    const tl = s.artboard()!.timelines[0];
    expect(tl.tracks.map((t) => t.prop)).toEqual(['uniforms.0.value', 'uniforms.1.value.0', 'uniforms.2.value', 'uniforms.3.value']);
    const at = (t: number) => sampleArtboard(s.artboard()!.children, tl, t)[0] as ShaderNode;
    const mid = at(500);
    expect(mid.uniforms[0].value).toBe(5);
    expect(mid.uniforms[1].value).toEqual([2, 0]);
    expect(mid.uniforms[2].value).toBe('#808080');
    expect(mid.uniforms[3].value).toBe('');
    expect(at(1000).uniforms[3].value).toBe('asset2');
    // The document's own node was not touched by sampling
    expect(shaderOf(s).uniforms[1].value).toEqual([4, 0]);
  });

  it('records a uniform change as a key while recording', () => {
    const n = createNode('shader', { uniforms: [{ name: 'k', type: 'float', value: 0 }] });
    const s = editor(n);
    s.keyCurrent(n.id, 'uniforms.0.value');
    s.set({ recording: true, playhead: 400, bottomTab: 'timeline' });
    s.setProps([n.id], { 'uniforms.0.value': 7 });
    const track = s.artboard()!.timelines[0].tracks[0];
    expect(track.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [400, 7]]);
    expect(shaderOf(s).uniforms[0].value).toBe(0);
  });

  it('binds uniforms to variables with the right type', () => {
    const n = createNode('shader', {
      uniforms: [
        { name: 'k', type: 'float', value: 0 },
        { name: 'tint', type: 'color', value: '#000' },
        { name: 'p', type: 'vec2', value: [0, 0] },
      ],
      bindings: { 'uniforms.0.value': 'level * 2', 'uniforms.1.value': 'colour', 'uniforms.2.value.1': '"0.75"' },
    });
    const out = prepareNodes([n], { vars: { level: 3, colour: 'rgb(10, 20, 30)' } })[0] as ShaderNode;
    expect(out.uniforms.map((u) => u.value)).toEqual([6, 'rgb(10, 20, 30)', [0, 0.75]]);
    expect(n.uniforms[2].value).toEqual([0, 0]);
  });
});

describe('shader filter on image layers', () => {
  it('is added and removed in one step each, with its animation', () => {
    const img = createNode('image');
    const s = editor(img);
    addShaderFilter(img.id);
    expect(imageOf(s).shaderFilter).toMatchObject({ preset: 'wave', code: expect.stringContaining('mainImage') });
    s.keyCurrent(img.id, 'shaderFilter.uniforms.0.value');
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(1);
    removeShaderFilter(img.id);
    expect(imageOf(s).shaderFilter).toBeNull();
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(0);
    s.undo();
    expect(imageOf(s).shaderFilter).toBeTruthy();
    expect(s.artboard()!.timelines[0].tracks).toHaveLength(1);
  });

  it('edits uniforms through the filter\'s paths', () => {
    const img = createNode('image');
    const s = editor(img);
    addShaderFilter(img.id);
    addUniform(img.id, 'shaderFilter.', 'float');
    const i = imageOf(s).shaderFilter!.uniforms.length - 1;
    s.setProps([img.id], { [`shaderFilter.uniforms.${i}.value`]: 3 });
    expect(imageOf(s).shaderFilter!.uniforms[i].value).toBe(3);
  });
});

describe('shader on the editor canvas', () => {
  const getProject = () => store.get().project;
  let store: EditorStore;

  function setup(node: SceneNode) {
    store = editor(node);
    const sh = createEditorShader(getProject);
    const r = new Renderer({ mode: 'edit', resolveAsset: () => undefined, mountShader: sh.mount });
    document.body.appendChild(r.root);
    return { sh, r, render: () => r.render(store.artboard()!, store.artboard()!.children, { vars: {} }) };
  }

  it('paints one still frame at the timeline time, again only when something changed', () => {
    const n = createNode('shader', { pixelRatio: 1, code: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(sin(u_time)); }', uniforms: [{ name: 'k', type: 'float', value: 1 }] });
    const { sh, r, render } = setup(n);
    sh.configure(0, 0);
    render();
    expect(gl.draws()).toBe(1);
    expect(gl.uniforms.u_time).toBe(0);
    render();
    expect(gl.draws()).toBe(1);
    sh.configure(2.5, 0);
    render();
    expect(gl.draws()).toBe(2);
    expect(gl.uniforms.u_time).toBe(2.5);
    store.setProps([n.id], { 'uniforms.0.value': 3 });
    render();
    expect(gl.uniforms.k).toBe(3);
    expect(gl.count('linkProgram')).toBe(1); // values don't recompile
    r.destroy();
    sh.dispose();
  });

  it('keeps compile errors with their line numbers for the inspector, and clears them once fixed', () => {
    const n = createNode('shader', { pixelRatio: 1, code: 'void mainImage(out vec4 c, in vec2 f) {\n  c = nope;\n}\n', uniforms: [] });
    const { sh, r, render } = setup(n);
    const { headerLines } = buildFragmentSource(n.code, [], 2);
    gl.compileLog = `ERROR: 0:${headerLines + 2}: 'nope' : undeclared identifier`;
    sh.configure(1, 0);
    render();
    const p = shaderProblem(n.id)!;
    expect(p.kind).toBe('error');
    expect(p.problems).toEqual([{ line: 2, message: "'nope' : undeclared identifier" }]);
    expect(p.message).toBe("Line 2: 'nope' : undeclared identifier");
    gl.compileLog = null;
    store.setProps([n.id], { code: TRIVIAL });
    render();
    expect(shaderProblem(n.id)).toBeUndefined();
    expect(gl.draws()).toBe(1);
    r.destroy();
    sh.dispose();
    expect(shaderProblem(n.id)).toBeUndefined();
  });

  it('runs live (one shared loop) only for a layer that asks to animate while editing', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => frames.push(f));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const n = createNode('shader', { pixelRatio: 1, animateInEditor: true, code: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(sin(u_time)); }', uniforms: [] });
    const { sh, r, render } = setup(n);
    sh.configure(0, 0);
    render();
    expect(gl.draws()).toBe(1);
    expect(frames).toHaveLength(1);
    frames.shift()!(performance.now() + 16);
    frames.shift()?.(performance.now() + 32);
    expect(gl.draws()).toBeGreaterThanOrEqual(2);
    // Turned off: back to stills, and the loop stops asking for frames
    store.setProps([n.id], { animateInEditor: false });
    render();
    const d = gl.draws();
    const pending = frames.splice(0);
    for (const f of pending) f(performance.now() + 64);
    expect(frames).toHaveLength(0);
    expect(gl.draws()).toBeLessThanOrEqual(d + 1);
    r.destroy();
    sh.dispose();
  });

  it('paints an image layer\'s shader filter over its picture once the picture has loaded', () => {
    const loads: (() => void)[] = [];
    vi.stubGlobal(
      'Image',
      class {
        crossOrigin = '';
        naturalWidth = 40;
        naturalHeight = 20;
        width = 40;
        height = 20;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_v: string) {
          loads.push(() => this.onload?.());
        }
      },
    );
    vi.spyOn(assetUrls, 'resolve').mockImplementation((id: string) => (id === 'a' ? 'blob:a' : undefined));
    const img = createNode('image', { assetId: 'a', width: 100, height: 50, shaderFilter: { code: TRIVIAL, uniforms: [], pixelRatio: 1 } });
    const { sh, r, render } = setup(img);
    store.update((d) => void d.assets.push({ id: 'a', name: 'a.png', mime: 'image/png', size: 1 }));
    sh.configure(0, 0);
    render();
    const canvas = r.element(img.id)!.querySelector('canvas.ix-shader') as HTMLCanvasElement;
    expect(gl.draws()).toBe(1);
    // Until the picture is there the plain picture shows
    expect(canvas.style.display).toBe('none');
    loads[0]();
    expect(canvas.style.display).toBe('block');
    expect(gl.draws()).toBe(2);
    r.destroy();
    sh.dispose();
  });
});

describe('pictures of an artboard', () => {
  it('shows the layer\'s current frame as an image, not an empty canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,SHADERFRAME');
    const n = createNode('shader', { pixelRatio: 1, width: 80, height: 40 });
    const p = createProject('T');
    p.artboards[0] = createArtboard({ name: 'A', width: 200, height: 100, children: [n] });
    const { svg, warnings } = await artboardSvg(p, p.artboards[0], null, 0, { fonts: false });
    expect(svg).toContain('SHADERFRAME');
    expect(svg).not.toContain('<canvas');
    expect(warnings).toEqual([]);
    expect(gl.draws()).toBe(1);
  });

  it('warns when WebGL is not available, and still produces a picture with the placeholder', async () => {
    uninstallCanvas();
    installCanvas(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,PLACEHOLDER');
    const n = createNode('shader', { pixelRatio: 1, width: 80, height: 40 });
    const p = createProject('T');
    p.artboards[0] = createArtboard({ name: 'A', width: 200, height: 100, children: [n] });
    const { svg, warnings } = await artboardSvg(p, p.artboards[0], null, 0, { fonts: false });
    expect(svg).toContain('PLACEHOLDER');
    expect(warnings.join(' ')).toMatch(/shader layers could not be drawn/i);
  });
});

describe('shader inspector', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const change = (el: Element, value: string) =>
    act(() => {
      (el as HTMLSelectElement).value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

  it('lists the presets, applies one from the dropdown, and lists uniforms with ◆ buttons on the timeline tab', () => {
    const n = createNode('shader');
    const s = editor(n);
    s.set({ bottomTab: 'timeline' });
    act(() => root.render(<ShaderSection node={shaderOf(s)} project={s.get().project} />));
    const select = host.querySelector('select')!;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(expect.arrayContaining(['Choose a preset…', 'Plasma', 'Voronoi cells', 'CRT / scanlines (image)']));
    // One ◆ per number and colour: speed, scale, skyColor, cloudColor
    expect(host.querySelectorAll('.key-btn')).toHaveLength(4);
    expect(Array.from(host.querySelectorAll('input')).some((i) => (i as HTMLInputElement).value === 'speed')).toBe(true);
    change(select, 'plasma');
    expect(shaderOf(s).code).toContain('Plasma');
    act(() => root.render(<ShaderSection node={shaderOf(s)} project={s.get().project} />));
    expect(host.querySelectorAll('.uniform-item')).toHaveLength(3);
  });

  it('adds and removes uniforms, and shows a vector as one key button per part', () => {
    const n = createNode('shader', { uniforms: [] });
    const s = editor(n);
    s.set({ bottomTab: 'timeline' });
    const render = () => act(() => root.render(<ShaderSection node={shaderOf(s)} project={s.get().project} />));
    render();
    expect(host.textContent).toContain('No uniforms');
    const add = Array.from(host.querySelectorAll('select')).find((x) => Array.from(x.options).some((o) => o.textContent === '+ Add a uniform…'))!;
    // Plain words for the types, the stored value is still the GLSL one
    expect(Array.from(add.options).map((o) => o.textContent)).toEqual(['+ Add a uniform…', 'Number', 'Vector 2', 'Vector 3', 'Vector 4', 'Colour', 'Image']);
    change(add, 'vec3');
    render();
    expect(shaderOf(s).uniforms[0].type).toBe('vec3');
    expect(host.textContent).toContain('Vector 3');
    expect(shaderOf(s).uniforms).toHaveLength(1);
    expect(host.querySelectorAll('.key-btn')).toHaveLength(3);
    act(() => (host.querySelector('button[title="Remove value1"]') as HTMLElement).click());
    expect(shaderOf(s).uniforms).toHaveLength(0);
  });

  it('flags an unusable name and lists compile problems with their lines', () => {
    const n = createNode('shader', { uniforms: [{ name: 'u_time', type: 'float', value: 0 }] });
    const s = editor(n);
    act(() => root.render(<ShaderSection node={shaderOf(s)} project={s.get().project} />));
    expect(host.textContent).toContain('u_time is built in');
  });

  it('edits an image layer\'s filter in place', () => {
    const img = createNode('image', { shaderFilter: { code: TRIVIAL, uniforms: [{ name: 'k', type: 'float', value: 1 }] } });
    const s = editor(img);
    act(() => root.render(<ShaderFilterFields node={imageOf(s)} project={s.get().project} />));
    const select = host.querySelector('select')!;
    // Only picture presets are offered for a filter
    expect(Array.from(select.options).map((o) => o.textContent)).not.toContain('Plasma');
    change(select, 'grain');
    expect(imageOf(s).shaderFilter!.code).toContain('Film grain');
  });
});

describe('shader usage', () => {
  it('counts pictures in image uniforms (of a layer or a filter) as used, so they are not offered for deletion', () => {
    const p = createProject('T');
    p.assets.push({ id: 'as_picture_one', name: 'one.png', mime: 'image/png' } as never, { id: 'as_picture_two', name: 'two.png', mime: 'image/png' } as never, { id: 'as_picture_three', name: 'three.png', mime: 'image/png' } as never);
    p.artboards[0].children.push(
      createNode('shader', { uniforms: [{ name: 'pic', type: 'image', value: 'as_picture_one' }] }),
      createNode('image', { assetId: null, shaderFilter: { code: TRIVIAL, uniforms: [{ name: 'tex', type: 'image', value: 'as_picture_two' }] } }),
    );
    const report = analyzeUsage(p);
    expect(report.assets.map((a) => [a.id, a.unused])).toEqual([['as_picture_one', false], ['as_picture_two', false], ['as_picture_three', true]]);
  });
});

describe('shader help', () => {
  it('has a Shader layers topic that lists the presets and the built-ins, and the effects topic points at it', () => {
    const t = getTopic('shader-layers')!;
    expect(t).toBeTruthy();
    const body = topicBody(t);
    for (const p of SHADER_PRESETS) expect(body).toContain(p.name);
    for (const u of ['u_time', 'u_resolution', 'u_mouse', 'u_frame']) expect(body).toContain(u);
    expect(topicBody(getTopic('fill-stroke')!)).toContain('(shader-layers');
    expect(TOPICS.filter((x) => x.id === 'shader-layers')).toHaveLength(1);
    expect(searchHelp('glsl shader').some((h) => h.topic.id === 'shader-layers')).toBe(true);
  });
});
