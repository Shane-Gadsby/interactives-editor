//Add dialog: each one is an overlay page of its own, pointed at by a layer, not a pile of layers dropped on the page
import { describe, expect, it } from 'vitest';
import { Player, createNode, createProject, type Artboard, type FrameNode, type Project } from 'interactives-player';
import { overlayId, overlayUses } from '../../interactives-player/src/overlays';
import { addDialog, linkOverlay, overlayTargets } from '../src/lib/dialog-kit';

const withTarget = (): { p: Project; targetId: string } => {
  const p = createProject();
  p.artboards[0].width = 800;
  p.artboards[0].height = 600;
  const btn = createNode('button', { id: 'btn', x: 300, y: 300, width: 120, height: 40, label: 'Help' });
  p.artboards[0].children.push(btn);
  return { p, targetId: btn.id };
};

const pageOf = (p: Project, id: string): Artboard => p.artboards.find((a) => a.id === id)!;

describe('Add dialog makes an overlay page', () => {
  it('a tooltip is a page of its own, marked as an overlay, not a layer on the open page', () => {
    const { p } = withTarget();
    const before = p.artboards[0].children.length;
    const { overlayId: id } = addDialog(p, 'tooltip');
    const page = pageOf(p, id);
    expect(page.overlay).toMatchObject({ kind: 'tooltip' });
    expect(page.children.map((c) => c.name)).toEqual(['Tip text']);
    //nothing was added to the page you were on
    expect(p.artboards[0].children).toHaveLength(before);
  });

  it('points the layer you had picked at it, and says so', () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'tooltip', { targetId, artboardId: p.artboards[0].id });
    expect(made.linked).toBe(targetId);
    expect(p.artboards[0].children.find((c) => c.id === targetId)!.overlay).toEqual({ overlayId: made.overlayId });
  });

  it('with nothing picked it still makes the page, and links nothing', () => {
    const { p } = withTarget();
    const made = addDialog(p, 'tooltip');
    expect(made.linked).toBeNull();
    expect(pageOf(p, made.overlayId)).toBeTruthy();
  });

  it('a modal gets an open variable and a Close button that turns it off', () => {
    const { p } = withTarget();
    const { overlayId: id } = addDialog(p, 'modal');
    const page = pageOf(p, id);
    expect(page.overlay!.kind).toBe('modal');
    const openVar = p.variables.find((v) => v.id === page.overlay!.openVariable)!;
    expect(openVar.type).toBe('boolean');
    expect(openVar.initial).toBe(false);
    const close = (page.children[2] as FrameNode).children[0];
    const ev = page.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === close.id)!;
    const edge = page.logic.edges.find((e) => e.from === ev.id)!;
    const action = page.logic.nodes.find((n) => n.id === edge.to)!;
    expect(action.params.variable).toBe(openVar.id);
    expect(action.params.value).toBe('false');
  });

  it('a prompt keeps its buttons as a list, so adding one is adding a row', () => {
    const { p } = withTarget();
    const { overlayId: id } = addDialog(p, 'prompt');
    const row = pageOf(p, id).children[2] as FrameNode;
    const list = p.variables.find((v) => v.type === 'list')!;
    expect(row.repeat?.items).toBe(list.name);
    expect(row.children).toHaveLength(1);
    expect(row.children[0].bindings?.label).toBe('item.label');
    expect(JSON.parse(String(list.initial))).toHaveLength(2);
  });

  it('several overlays get their own names and variables', () => {
    const { p } = withTarget();
    addDialog(p, 'modal');
    addDialog(p, 'modal');
    const names = p.artboards.filter((a) => a.overlay).map((a) => a.name);
    expect(new Set(names).size).toBe(2);
    const vars = p.variables.filter((v) => /Open$/.test(v.name));
    expect(new Set(vars.map((v) => v.id)).size).toBe(2);
  });
});

describe('linking a layer to an overlay', () => {
  it('points a layer at one and takes it off again, keeping the other settings', () => {
    const { p, targetId } = withTarget();
    const { overlayId: id } = addDialog(p, 'tooltip');
    linkOverlay(p, targetId, id);
    const node = () => p.artboards[0].children.find((c) => c.id === targetId)!;
    expect(node().overlay!.overlayId).toBe(id);
    node().overlay!.trigger = 'somewhere';
    linkOverlay(p, targetId, id);
    expect(node().overlay!.trigger).toBe('somewhere');
    linkOverlay(p, targetId, null);
    expect(node().overlay).toBeUndefined();
  });

  it('lists what points at an overlay, across pages', () => {
    const { p, targetId } = withTarget();
    const { overlayId: id } = addDialog(p, 'tooltip');
    linkOverlay(p, targetId, id);
    const second = createProject('other').artboards[0];
    second.id = 'ab2';
    second.children = [createNode('rect', { id: 'r2', overlay: { overlayId: id } })];
    p.artboards.push(second);
    const used = overlayTargets(p, id);
    expect(used.map((u) => u.node.id).sort()).toEqual(['btn', 'r2']);
  });
});

describe('what the editor builds actually runs', () => {
  it('a tooltip page shows beside its target when the target is hovered', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'tooltip', { targetId, artboardId: p.artboards[0].id });
    //the player sees the link and knows where it goes
    expect(overlayUses(p.artboards[0].children, p.artboards)).toHaveLength(1);
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const drawn = () => document.querySelector(`[data-ix-id="${overlayId(made.overlayId, targetId)}"]`);
    expect(drawn()).toBeNull();
    document.querySelector(`[data-ix-id="${targetId}"]`)!.dispatchEvent(new Event('pointerover', { bubbles: true }));
    player.step(16);
    expect(drawn()!.textContent).toContain('What this is for');
    player.destroy();
  });
});
