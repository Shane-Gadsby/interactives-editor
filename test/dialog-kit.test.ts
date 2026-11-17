//The dialog kit: what Add dialog builds, and that each one actually runs in the player
import { describe, expect, it } from 'vitest';
import { Player, createProject, type FrameNode, type Project } from 'interactives-player';
import { contentBottom } from '../../interactives-player/src/hug';
import { addDialog } from '../src/lib/dialog-kit';

const find = (p: Project, id: string): FrameNode => {
  const walk = (list: unknown[]): FrameNode | null => {
    for (const n of list as FrameNode[]) {
      if (n.id === id) return n;
      if (Array.isArray(n.children)) {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  const hit = walk(p.artboards[0].children);
  if (!hit) throw new Error(`no layer ${id}`);
  return hit;
};

describe('Add dialog', () => {
  it('builds a modal that is a dialog, starts hidden and closes from its button', () => {
    const p = createProject();
    const ab = p.artboards[0];
    const id = addDialog(p, ab.id, 'modal')!;
    const frame = find(p, id);
    expect(frame.type).toBe('frame');
    expect(frame.dialog?.modal).toBe(true);
    expect(frame.dialog?.closeOnEscape).toBe(true);
    expect(frame.dialog?.closeOnOutsideClick).toBe(true);
    expect(frame.visible).toBe(false);
    const openVar = p.variables.find((v) => v.name === frame.dialog!.openVariable)!;
    expect(openVar.type).toBe('boolean');
    expect(openVar.initial).toBe(false);
    expect(frame.bindings?.visible).toBe(openVar.name);
    //a heading, a message and a row of buttons
    expect(frame.children.map((c) => c.type)).toEqual(['text', 'text', 'frame']);
    expect(frame.children[0].role).toBe('heading');
    //the Close button turns the variable off
    const close = (frame.children[2] as FrameNode).children[0];
    const ev = ab.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === close.id)!;
    expect(ev.params.type).toBe('click');
    const edge = ab.logic.edges.find((e) => e.from === ev.id)!;
    const action = ab.logic.nodes.find((n) => n.id === edge.to)!;
    expect(action.kind).toBe('action.setVariable');
    expect(action.params.value).toBe('false');
    expect(action.params.variable).toBe(openVar.id);
  });

  it('builds a prompt whose buttons are a list, and keeps what was chosen', () => {
    const p = createProject();
    const ab = p.artboards[0];
    const frame = find(p, addDialog(p, ab.id, 'prompt')!);
    //a prompt waits for an answer, so a click outside doesn't dismiss it
    expect(frame.dialog?.closeOnOutsideClick).toBe(false);
    const row = frame.children[2] as FrameNode;
    expect(row.repeat?.items).toBe(p.variables.find((v) => v.type === 'list')!.name);
    expect(row.repeat?.select?.mode).toBe('one');
    expect(JSON.parse(String(p.variables.find((v) => v.type === 'list')!.initial))).toEqual([
      { label: 'Cancel', value: 'cancel' },
      { label: 'Yes, do it', value: 'yes' },
    ]);
    //one button, its words coming from the row it stands for
    expect(row.children).toHaveLength(1);
    expect(row.children[0].bindings?.label).toBe('item.label');
    //the pick is read once, the prompt closes, and the pick goes back to none
    const ev = ab.logic.nodes.find((n) => n.kind === 'event.variable')!;
    const chain: string[] = [];
    for (let from = ev.id; ; ) {
      const edge = ab.logic.edges.find((e) => e.from === from);
      if (!edge) break;
      chain.push(String(ab.logic.nodes.find((n) => n.id === edge.to)!.params.variable));
      from = edge.to;
    }
    expect(chain).toHaveLength(3);
    expect(chain[2]).toBe(String(ev.params.variable));
  });

  it('builds a tooltip wrapper that opens on hover and on focus, and never grows a fitted page', () => {
    const p = createProject();
    const ab = p.artboards[0];
    const wrap = find(p, addDialog(p, ab.id, 'tooltip')!);
    expect(wrap.dialog).toBeUndefined();
    expect(wrap.hugIgnore).toBe(true);
    const [tip, target] = wrap.children;
    expect(tip.hugIgnore).toBe(true);
    expect(tip.visible).toBe(false);
    //hover is watched on the wrapper, so moving from the target into the tip keeps it open
    const hovers = ab.logic.nodes.filter((n) => n.kind === 'event.pointer');
    expect(hovers.map((n) => n.params.type).sort()).toEqual(['pointerenter', 'pointerleave']);
    expect(hovers.every((n) => n.params.target === wrap.id)).toBe(true);
    //the keyboard gets the same, off the thing you tab to
    const focus = ab.logic.nodes.filter((n) => n.kind === 'event.focus');
    expect(focus).toHaveLength(2);
    expect(focus.every((n) => n.params.target === target.id)).toBe(true);
  });

  it('gives each one its own variables and names when several are added', () => {
    const p = createProject();
    const ab = p.artboards[0];
    addDialog(p, ab.id, 'modal');
    addDialog(p, ab.id, 'modal');
    const opens = p.variables.filter((v) => /Open$/.test(v.name)).map((v) => v.name);
    expect(new Set(opens).size).toBe(2);
    const names = ab.children.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('runs: a modal opens on its variable, closes from its button, and keeps the page height', async () => {
    const p = createProject();
    const ab = p.artboards[0];
    ab.hugHeight = true;
    const frame = find(p, addDialog(p, ab.id, 'modal')!);
    const openVar = frame.dialog!.openVariable!;
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const el = () => document.querySelector<HTMLElement>(`[data-ix-id="${frame.id}"]`)!;
    expect(el().style.display).toBe('none');
    player.setVariable(openVar, true);
    player.step(16);
    expect(el().style.display).not.toBe('none');
    //its own backdrop, in the slot right behind it
    const scrim = el().previousElementSibling as HTMLElement;
    expect(scrim?.dataset.ixScrim).toBe('');
    //an open dialog is not part of a fitted page's height: with nothing else on the page, nothing counts at all
    expect(contentBottom(ab.children)).toBeNull();
    const close = (frame.children[2] as FrameNode).children[0];
    document.querySelector<HTMLElement>(`[data-ix-id="${close.id}"] button`)!.click();
    player.step(16);
    expect(player.getVariable(openVar)).toBe(false);
    player.destroy();
  });

  it('runs: a prompt makes one button per row, and picking one records it and closes', async () => {
    const p = createProject();
    const ab = p.artboards[0];
    const frame = find(p, addDialog(p, ab.id, 'prompt')!);
    const openVar = frame.dialog!.openVariable!;
    const choice = p.variables.find((v) => /Choice$/.test(v.name))!;
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    player.setVariable(openVar, true);
    player.step(16);
    const row = frame.children[2] as FrameNode;
    const copies = document.querySelectorAll<HTMLElement>(`[data-ix-id^="${row.children[0].id}~"]`);
    expect(copies).toHaveLength(2);
    expect(copies[0].textContent).toContain('Cancel');
    expect(copies[1].textContent).toContain('Yes, do it');
    copies[1].querySelector('button')!.click();
    player.step(16);
    player.step(16);
    expect(player.getVariable(choice.name)).toBe('yes');
    expect(player.getVariable(openVar)).toBe(false);
    //the pick goes back to none, so opening it again starts clean
    expect(player.getVariable(p.variables.find((v) => /Pick$/.test(v.name))!.name)).toBe(-1);
    player.destroy();
  });

  it('runs: a tooltip opens while the pointer is anywhere in its wrapper', async () => {
    const p = createProject();
    const ab = p.artboards[0];
    const wrap = find(p, addDialog(p, ab.id, 'tooltip')!);
    const openVar = p.variables.find((v) => /Open$/.test(v.name))!.name;
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const tipEl = () => document.querySelector<HTMLElement>(`[data-ix-id="${wrap.children[0].id}"]`)!;
    expect(tipEl().style.display).toBe('none');
    const wrapEl = document.querySelector<HTMLElement>(`[data-ix-id="${wrap.id}"]`)!;
    //the player hears hover as a delegated pointerover from the artboard root, the way a browser sends it
    wrapEl.dispatchEvent(new Event('pointerover', { bubbles: true }));
    player.step(16);
    expect(player.getVariable(openVar)).toBe(true);
    expect(tipEl().style.display).not.toBe('none');
    wrapEl.dispatchEvent(new Event('pointerout', { bubbles: true }));
    player.step(16);
    expect(player.getVariable(openVar)).toBe(false);
    player.destroy();
  });

  it('answers with null for an artboard that is not there', () => {
    const p = createProject();
    expect(addDialog(p, 'nope', 'modal')).toBeNull();
  });
});
