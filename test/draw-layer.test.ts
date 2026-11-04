import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createNode, createProject, Renderer, DRAW_TEMPLATES, normalizeProject, type DrawNode, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { applyDrawTemplate, hasScriptLayers } from '../src/lib/draw-templates';
import { createEditorDraw, drawProblem } from '../src/lib/draw-edit';
import { analyzeUsage } from '../src/lib/dependencies';
import { getTopic, TOPICS, topicBody } from '../src/help/topics';

function editor(...nodes: ReturnType<typeof createNode>[]) {
  const p = createProject('T');
  p.artboards[0].children.push(...nodes);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return s;
}

describe('script layer: creating and editing', () => {
  it('is a normal layer with a script that already runs', () => {
    const n = createNode('draw');
    expect(n.type).toBe('draw');
    expect(n.name).toBe('Script layer');
    expect(n.code).toContain('function draw(g');
    expect(n).toMatchObject({ fps: 0, pixelRatio: 'auto', runInEditor: true, width: 320, height: 200 });
    // the first starter is what a new layer gets
    expect(n.code).toBe(DRAW_TEMPLATES[0].code);
  });

  it('is added, edited and undone like other layers', () => {
    const s = editor();
    const n = createNode('draw', { x: 10, y: 20 });
    s.addNodes([n], { artboardId: s.get().activeArtboardId });
    expect(s.artboard()!.children.map((c) => c.type)).toEqual(['draw']);
    s.setProps([n.id], { fps: 30, pixelRatio: 2, runInEditor: false, code: 'function draw(g) {}' });
    const got = s.artboard()!.children[0] as DrawNode;
    expect([got.fps, got.pixelRatio, got.runInEditor, got.code]).toEqual([30, 2, false, 'function draw(g) {}']);
    s.undo();
    expect((s.artboard()!.children[0] as DrawNode).fps).toBe(0);
  });

  it('survives normalisation with its settings', () => {
    const n = createNode('draw', { fps: 24, pixelRatio: 1.5, runInEditor: false });
    const p = createProject('T');
    p.artboards[0].children.push(n);
    expect(normalizeProject(p).artboards[0].children[0]).toMatchObject({ type: 'draw', fps: 24, pixelRatio: 1.5, runInEditor: false });
  });
});

describe('script layer starter templates', () => {
  it('has the templates the brief names, each with working-looking code', () => {
    const names = DRAW_TEMPLATES.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['Particles', 'Bar chart from a variable', 'Sine waves']));
    for (const t of DRAW_TEMPLATES) expect(t.code, t.name).toMatch(/function draw\(g/);
  });

  it('puts a template into the layer and adds the variable it reads, once, in one undo step', () => {
    const n = createNode('draw');
    const s = editor(n);
    const added = applyDrawTemplate([n.id], 'bar-chart');
    expect(added).toEqual(['chartValues']);
    expect((s.artboard()!.children[0] as DrawNode).code).toBe(DRAW_TEMPLATES.find((t) => t.id === 'bar-chart')!.code);
    expect(s.get().project.variables.find((v) => v.name === 'chartValues')).toMatchObject({ type: 'list', initial: '[12, 19, 7, 15, 24, 10]' });
    // picking it again doesn't duplicate the variable
    expect(applyDrawTemplate([n.id], 'bar-chart')).toEqual([]);
    expect(s.get().project.variables.filter((v) => v.name === 'chartValues')).toHaveLength(1);
    s.undo();
    s.undo();
    expect(s.get().project.variables).toHaveLength(0);
    expect((s.artboard()!.children[0] as DrawNode).code).toBe(DRAW_TEMPLATES[0].code);
  });

  it('does nothing for an unknown template and ignores layers that are not script layers', () => {
    const n = createNode('draw');
    const r = createNode('rect');
    const s = editor(n, r);
    expect(applyDrawTemplate([n.id], 'nope')).toEqual([]);
    applyDrawTemplate([r.id], 'particles');
    expect(s.artboard()!.children.find((c) => c.id === r.id)!.type).toBe('rect');
  });
});

describe('script layers in the project', () => {
  it('are noticed so exports carry the sandbox', () => {
    const p: Project = createProject('T');
    expect(hasScriptLayers(p)).toBe(false);
    const ab = createArtboard({ name: 'Second' });
    ab.children.push(createNode('group', { children: [createNode('draw')] }));
    p.artboards.push(ab);
    expect(hasScriptLayers(p)).toBe(true);
  });

  it('count as users of the variables and assets their code names', () => {
    const p = createProject('T');
    p.variables.push({ id: 'v1', name: 'chartValues', type: 'list', initial: '[]' }, { id: 'v2', name: 'spare', type: 'number', initial: 0 });
    p.artboards[0].children.push(createNode('draw', { code: 'function draw(g) { g.text(String(ix.vars.chartValues.length), 0, 0); }' }));
    const report = analyzeUsage(p);
    expect(report.variables.find((v) => v.name === 'chartValues')!.unused).toBe(false);
    expect(report.variables.find((v) => v.name === 'spare')!.unused).toBe(true);
  });

  it('have a help topic, linked from the scripts topic, that documents the API', () => {
    const t = getTopic('script-layers')!;
    expect(t).toBeTruthy();
    const body = topicBody(t);
    for (const word of ['function draw(g, t, dt)', 'g.circle', 'g.pointer', 'FPS', 'Paint while editing', 'sandbox']) expect(body).toContain(word);
    expect(topicBody(getTopic('scripts')!)).toContain('(script-layers)');
    expect(TOPICS.filter((x) => x.id === 'script-layers')).toHaveLength(1);
  });
});

describe('script layers on the editor canvas', () => {
  let arcs: unknown[][];
  let texts: unknown[][];
  beforeEach(() => {
    arcs = [];
    texts = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (...args: unknown[]) => {
        if (k === 'arc') arcs.push(args);
        if (k === 'fillText') texts.push(args);
        return k === 'measureText' ? { width: 5 } : undefined;
      }),
      set: (t, k: string, v) => ((t[k] = v), true),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
  });
  afterEach(() => vi.restoreAllMocks());

  const wait = async (until: () => boolean) => {
    for (let i = 0; i < 100 && !until(); i++) await new Promise((r) => setTimeout(r, 20));
  };

  function setup(node: DrawNode, project = createProject('T')) {
    project.artboards[0].children.push(node);
    const draw = createEditorDraw(() => project);
    const r = new Renderer({ mode: 'edit', resolveAsset: () => undefined, mountDraw: draw.mount });
    const show = (time = 0, epoch: string | number = 0) => {
      draw.configure(time, epoch);
      r.render(project.artboards[0], project.artboards[0].children, { vars: {} });
    };
    document.body.appendChild(r.root);
    return { project, draw, r, show, canvas: () => r.root.querySelector('canvas') as HTMLCanvasElement };
  }

  it('paints one still frame in the sandbox at the timeline time, and again when the time or a variable changes', async () => {
    const project = createProject('T');
    project.variables.push({ id: 'v', name: 'size', type: 'number', initial: 5 });
    const node = createNode('draw', { pixelRatio: 1, width: 100, height: 50, code: 'function draw(g, t) { g.circle(50, 25, ix.vars.size + t * 10); }' });
    const { show, draw, r } = setup(node, project);
    show(0);
    await wait(() => arcs.length > 0);
    expect(arcs.at(-1)!.slice(0, 3)).toEqual([50, 25, 5]);
    const n = arcs.length;
    show(0); // same document, same time: not painted again
    expect(arcs.length).toBe(n);
    show(0.5);
    await wait(() => arcs.length > n);
    expect(arcs.at(-1)![2]).toBe(10); // t = 0.5 s
    project.variables[0].initial = 20;
    project.variables = [...project.variables];
    show(0.5);
    expect(arcs.at(-1)![2]).toBe(25);
    r.destroy();
    draw.dispose();
  });

  it('shows a placeholder, and runs nothing, when painting while editing is off', async () => {
    const node = createNode('draw', { runInEditor: false, code: 'function draw(g) { g.circle(1, 1, 1); }' });
    const { show, canvas, r, draw } = setup(node);
    show();
    await new Promise((res) => setTimeout(res, 50));
    expect(arcs).toHaveLength(0);
    expect(texts.some((t) => t[0] === 'Script layer')).toBe(true);
    expect(canvas().parentElement!.style.background).toContain('repeating-linear-gradient');
    r.destroy();
    draw.dispose();
  });

  it('stops a failing script and reports it for the inspector, then recovers when the code is fixed', async () => {
    const node = createNode('draw', { code: 'function draw(g) { missing(); }' });
    const { show, project, r, draw } = setup(node);
    show();
    await wait(() => !!drawProblem(node.id));
    expect(drawProblem(node.id)).toMatchObject({ kind: 'error', message: expect.stringContaining('missing') });
    expect(texts.some((t) => String(t[0]).includes('Script error') || String(t[0]).includes('missing'))).toBe(true);
    (project.artboards[0].children[0] as DrawNode).code = 'function draw(g) { g.circle(1, 2, 3); }';
    show(0, 'fixed');
    await wait(() => arcs.length > 0);
    expect(drawProblem(node.id)).toBeUndefined();
    expect(arcs.at(-1)!.slice(0, 3)).toEqual([1, 2, 3]);
    r.destroy();
    draw.dispose();
  });
});
