import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, uid, type LogicNode, type Project } from 'interactives-player';
import { analyzeUsage, unusedAssetIds, type UsageItem, type UsageReport } from '../src/lib/dependencies';

const logic = (kind: string, params: Record<string, unknown>): LogicNode => ({ id: uid('ln'), kind, x: 0, y: 0, params });
const find = (items: UsageItem[], name: string) => items.find((i) => i.name === name)!;
const how = (i: UsageItem) => i.usedBy.map((u) => u.how);

function base() {
  const p: Project = createProject('T');
  const home = p.artboards[0];
  const other = createArtboard({ name: 'Other' });
  const spare = createArtboard({ name: 'Spare' });
  p.artboards.push(other, spare);
  return { p, home, other, spare };
}

describe('analyzeUsage', () => {
  it('flags everything as unused in an empty project, except the start artboard', () => {
    const { p } = base();
    p.assets.push({ id: 'as1', name: 'pic.png', mime: 'image/png', size: 1 });
    p.variables.push({ id: 'v1', name: 'score', type: 'number', initial: 0 });
    const r = analyzeUsage(p);
    expect(r.artboards.map((a) => [a.name, a.unused])).toEqual([
      ['Home', false],
      ['Other', true],
      ['Spare', true],
    ]);
    expect(r.assets[0].unused).toBe(true);
    expect(r.variables[0].unused).toBe(true);
    expect(unusedAssetIds(r)).toEqual(['as1']);
    expect(r.unusedCount).toBe(4);
  });

  it('finds asset uses in images, fills, strokes, cursors, video, fonts, data sources and the artboard background', () => {
    const { p, home } = base();
    for (const id of ['img', 'fill', 'stroke', 'cur', 'vid', 'font', 'csv', 'bg', 'lonely']) p.assets.push({ id, name: id, mime: 'x/y', size: 1 });
    home.children.push(
      createNode('image', { name: 'Photo', assetId: 'img' }),
      createNode('rect', { name: 'Box', fill: { type: 'image', assetId: 'fill', fit: 'cover' }, stroke: { paint: { type: 'image', assetId: 'stroke', fit: 'fill' }, width: 1 }, cursorImage: 'cur' }),
      createNode('video', { name: 'Clip', assetId: 'vid' }),
    );
    home.background = { type: 'image', assetId: 'bg', fit: 'cover' };
    p.fonts.push({ family: 'Brand', source: 'asset', assetId: 'font' });
    p.dataSources.push({ id: 'd1', name: 'rows', kind: 'csv', source: 'asset', assetId: 'csv' });
    const r = analyzeUsage(p);
    const used = (id: string) => r.assets.find((a) => a.id === id)!;
    expect(how(used('img'))).toEqual(['image']);
    expect(how(used('fill'))).toEqual(['fill image']);
    expect(how(used('stroke'))).toEqual(['stroke image']);
    expect(how(used('cur'))).toEqual(['cursor image']);
    expect(how(used('vid'))).toEqual(['video']);
    expect(how(used('font'))).toEqual(['font file']);
    expect(how(used('csv'))).toEqual(['data file']);
    expect(how(used('bg'))).toEqual(['background image']);
    expect(unusedAssetIds(r)).toEqual(['lonely']);
    expect(used('img').usedBy[0].by).toMatchObject({ type: 'layer', name: 'Photo', artboardId: home.id });
  });

  it('counts instances, go-to actions and the start artboard as artboard uses', () => {
    const { p, home, other, spare } = base();
    home.children.push(createNode('instance', { name: 'Card', artboardId: other.id }));
    const r = analyzeUsage(p);
    expect(find(r.artboards, 'Other').usedBy[0]).toMatchObject({ how: 'instance of artboard', by: { type: 'layer', name: 'Card' } });
    expect(find(r.artboards, 'Spare').unused).toBe(true);
    home.logic.nodes.push(logic('action.artboard', { artboard: spare.id }));
    expect(find(analyzeUsage(p).artboards, 'Spare').unused).toBe(false);
  });

  it('finds variables in bindings, templates, repeaters, joysticks, graph params and inputs, and ignores strings and properties', () => {
    const { p, home } = base();
    for (const name of ['score', 'label', 'items', 'mx', 'cond', 'bound', 'inst', 'shadowed', 'inStr', 'lonely']) p.variables.push({ id: `v_${name}`, name, type: 'string', initial: '' });
    p.artboards.push(createArtboard({ name: 'Child' }));
    home.children.push(
      createNode('rect', { name: 'R', bindings: { x: 'score * 2' } }),
      createNode('text', { name: 'T', text: 'Hello {label} and {{shadowed}}' }),
      createNode('group', { name: 'G', repeat: { items: 'items.filter(i => i)', layout: 'vertical', gap: 0, columns: 1 }, children: [] }),
      createNode('input', { name: 'In', bindings: { value: 'bound' }, bindingModes: { value: 'both' } }),
      createNode('instance', { name: 'Inst', artboardId: p.artboards[3].id, inputs: { inst: 1 } }),
      createNode('rect', { name: 'S', bindings: { x: 'foo.inStr + "inStr"' } }),
    );
    home.joysticks = [{ id: 'j1', name: 'Stick', xTimeline: null, x: 'pointer.x / mx' }];
    home.logic.nodes.push(logic('logic.if', { condition: 'cond > 1' }));
    const r = analyzeUsage(p);
    const v = (n: string) => r.variables.find((x) => x.name === n)!;
    expect(how(v('score'))).toEqual(['binding on x']);
    expect(how(v('label'))).toEqual(['text template']);
    expect(how(v('items'))).toEqual(['repeater items']);
    expect(v('mx').usedBy[0].by.type).toBe('joystick');
    expect(v('cond').usedBy[0].by).toMatchObject({ type: 'logic', name: 'Check a condition' });
    expect(how(v('bound'))).toEqual(['binding on value']);
    expect(how(v('inst'))).toEqual(['instance input']);
    expect(v('shadowed').unused).toBe(true); // escaped braces are literal text
    expect(v('inStr').unused).toBe(true); // a property name and a string, not a variable
    expect(v('lonely').unused).toBe(true);
  });

  it('finds timelines in graph nodes, joysticks and autoplay, and the layers tracks and constraints point at', () => {
    const { p, home } = base();
    const a = createNode('rect', { name: 'A' });
    const b = createNode('rect', { name: 'B' });
    b.constraints = [{ id: 'c1', type: 'copyPosition', target: a.id, strength: 1 }];
    home.children.push(a, b);
    const mk = (name: string, extra = {}) => ({ id: uid('tl'), name, duration: 1000, loop: 'once' as const, autoplay: false, speed: 1, tracks: [] as never[], ...extra });
    const t1 = mk('FromGraph');
    const t2 = mk('FromJoystick');
    const t3 = mk('Auto', { autoplay: true });
    const t4 = mk('Orphan', { tracks: [{ id: 'tr', nodeId: b.id, prop: 'x', keys: [] }] });
    home.timelines.push(t1, t2, t3, t4);
    home.logic.nodes.push(logic('action.timeline', { timeline: t1.id, op: 'play' }), logic('event.pointer', { target: a.id, type: 'click' }));
    home.joysticks = [{ id: 'j', name: 'J', xTimeline: t2.id, x: '0.5' }];
    const r = analyzeUsage(p);
    expect(find(r.timelines, 'FromGraph').usedBy[0].by).toMatchObject({ type: 'logic', name: 'Play or stop an animation' });
    expect(how(find(r.timelines, 'FromJoystick'))).toEqual(['joystick x']);
    expect(how(find(r.timelines, 'Auto'))).toEqual(['autoplays']);
    expect(find(r.timelines, 'Orphan').unused).toBe(true);
    // layer A is a constraint target and an event target; B is driven by a track
    const layerA = find(r.layers, 'A');
    expect(how(layerA).sort()).toEqual(['When clicked or hovered', 'copyPosition constraint target'].sort());
    expect(how(find(r.layers, 'B'))).toEqual(['track x']);
    expect(r.layers.every((l) => !l.unused)).toBe(true);
  });

  it('finds scripts by id and run-on-start, and loosely finds what code mentions', () => {
    const { p, home } = base();
    p.variables.push({ id: 'v1', name: 'score', type: 'number', initial: 0 }, { id: 'v2', name: 'idle', type: 'number', initial: 0 });
    p.dataSources.push({ id: 'd1', name: 'products', kind: 'json', source: 'url', url: 'x' });
    const tl = { id: 'tl1', name: 'Intro fade', duration: 1, loop: 'once' as const, autoplay: false, speed: 1, tracks: [] };
    home.timelines.push(tl);
    p.scripts.push(
      { id: 's1', name: 'Starter', code: 'ix.vars.score += 1; ix.timeline("Intro fade").play(); ix.data.products', runOnStart: true },
      { id: 's2', name: 'Called', code: '', runOnStart: false },
      { id: 's3', name: 'Dead', code: '', runOnStart: false },
    );
    home.logic.nodes.push(logic('action.script', { script: 's2' }), logic('action.code', { code: 'idle = 3' }));
    const r = analyzeUsage(p);
    expect(how(find(r.scripts, 'Starter'))).toEqual(['runs on start']);
    expect(find(r.scripts, 'Called').unused).toBe(false);
    expect(find(r.scripts, 'Dead').unused).toBe(true);
    expect(find(r.variables, 'score').usedBy[0]).toMatchObject({ loose: true, by: { type: 'script', name: 'Starter' } });
    expect(find(r.variables, 'idle').usedBy[0]).toMatchObject({ loose: true, how: 'inline code' });
    expect(find(r.dataSources, 'products').usedBy[0].loose).toBe(true);
    expect(find(r.timelines, 'Intro fade').unused).toBe(false);
  });

  it('finds data sources by name in expressions and by id or name in graph nodes', () => {
    const { p, home } = base();
    p.dataSources.push({ id: 'd1', name: 'products', kind: 'json', source: 'url', url: 'x' }, { id: 'd2', name: 'people', kind: 'json', source: 'url', url: 'x' }, { id: 'd3', name: 'old', kind: 'json', source: 'url', url: 'x' });
    home.children.push(createNode('text', { name: 'T', text: '{products.length} items' }));
    home.logic.nodes.push(logic('action.loadData', { source: 'people' }));
    const r = analyzeUsage(p);
    expect(find(r.dataSources, 'products').unused).toBe(false);
    expect(find(r.dataSources, 'people').unused).toBe(false);
    expect(find(r.dataSources, 'old').unused).toBe(true);
  });

  it('reports references to things that no longer exist', () => {
    const { p, home } = base();
    home.children.push(createNode('image', { name: 'Gone', assetId: 'nope' }), createNode('input', { name: 'In', bindings: { value: 'nov' }, bindingModes: { value: 'both' } }));
    home.logic.nodes.push(logic('event.pointer', { target: 'nolayer', type: 'click' }), logic('action.artboard', { artboard: 'Nowhere' }));
    const r = analyzeUsage(p);
    expect(r.missing.map((m) => [m.what, m.ref]).sort()).toEqual([
      ['artboard', 'Nowhere'],
      ['asset', 'nope'],
      ['layer', 'nolayer'],
      ['variable', 'nov'],
    ]);
  });

  it('keeps an asset that is only mentioned in odd places (e.g. a keyframed value) out of the unused list', () => {
    const { p, home } = base();
    p.assets.push({ id: 'as_keyed', name: 'keyed', mime: 'image/png', size: 1 }, { id: 'as_free', name: 'free', mime: 'image/png', size: 1 });
    const n = createNode('image', { name: 'I' });
    home.children.push(n);
    home.timelines.push({ id: 't', name: 'T', duration: 1, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'tr', nodeId: n.id, prop: 'assetId', keys: [{ id: 'k', t: 0, value: 'as_keyed', ease: 'linear' }] }] });
    const r: UsageReport = analyzeUsage(p);
    expect(unusedAssetIds(r)).toEqual(['as_free']);
    expect(find(r.assets, 'keyed').usedBy[0].loose).toBe(true);
  });

  it('counts a converter expression as a use of the variables it reads', () => {
    const { p, home } = base();
    p.variables.push({ id: 'v1', name: 'rate', type: 'number', initial: 1 }, { id: 'v2', name: 'idle', type: 'number', initial: 1 });
    home.children.push(createNode('rect', { name: 'Bar', bindings: { width: 'level' }, converters: { width: [{ type: 'expr', expr: 'value * rate' }] } }));
    const r = analyzeUsage(p);
    expect(find(r.variables, 'rate').unused).toBe(false);
    expect(how(find(r.variables, 'rate'))).toContain('converter on width');
    expect(find(r.variables, 'idle').unused).toBe(true);
  });
});

describe('a repeater selection', () => {
  it('counts as a use of the variable it writes', () => {
    const { p, home } = base();
    p.variables.push({ id: 'vs', name: 'picked', type: 'number', initial: -1 });
    home.children.push(createNode('group', { name: 'Cards', repeat: { items: '[1, 2]', layout: 'vertical', gap: 4, columns: 1, select: { mode: 'one', variable: 'vs' } }, children: [createNode('rect', {})] } as never));
    expect(how(find(analyzeUsage(p).variables, 'picked'))).toEqual(['repeater selection']);
  });
});

