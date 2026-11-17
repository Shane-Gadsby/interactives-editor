//The ready-made overlays (Tooltip, Modal, Confirmation, Prompt in the Web tools): each one is an overlay page of its own, pointed at by a layer, not a pile of layers dropped on the page
import { describe, expect, it } from 'vitest';
import { Player, createNode, createProject, type Artboard, type FrameNode, type Project } from 'interactives-player';
import { overlayId, overlayUses } from '../../interactives-player/src/overlays';
import { sanitizeProject } from '../../interactives-player/src/sanitize';
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

describe('adding a ready-made overlay makes an overlay page', () => {
  it('a tooltip is a page of its own, marked as an overlay, not a layer on the open page', () => {
    const { p } = withTarget();
    const before = p.artboards[0].children.length;
    const { overlayId: id } = addDialog(p, 'tooltip');
    const page = pageOf(p, id);
    expect(page.overlay).toMatchObject({ kind: 'tooltip' });
    //one card on the page, and the words inside it
    expect(page.children.map((c) => c.name)).toEqual(['Tooltip']);
    expect((page.children[0] as FrameNode).children.map((c) => c.name)).toEqual(['Tip text']);
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
    const card = page.children[0] as FrameNode;
    const close = (card.children[2] as FrameNode).children[0];
    const ev = page.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === close.id)!;
    const edge = page.logic.edges.find((e) => e.from === ev.id)!;
    const action = page.logic.nodes.find((n) => n.id === edge.to)!;
    expect(action.params.variable).toBe(openVar.id);
    expect(action.params.value).toBe('false');
  });

  it('a confirmation keeps its buttons as a list, so adding one is adding a row', () => {
    const { p } = withTarget();
    const { overlayId: id } = addDialog(p, 'confirm');
    const row = (pageOf(p, id).children[0] as FrameNode).children[2] as FrameNode;
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

describe('an overlay is drawn as its card', () => {
  const run = async (p: Project) => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    return player;
  };

  it("a confirmation's buttons are repeated from the list, labelled, and the main one looks it", async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'confirm', { targetId, artboardId: p.artboards[0].id });
    const page = pageOf(p, made.overlayId);
    const player = await run(p);
    player.setVariable(p.variables.find((v) => v.id === page.overlay!.openVariable)!.name, true);
    player.step(16);
    const frame = document.querySelector(`[data-ix-id="${overlayId(made.overlayId, targetId)}"]`)!;
    const buttons = [...frame.querySelectorAll<HTMLElement>('[data-ix-type="button"]')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Cancel', 'Yes, do it']);
    //the main answer takes the button colour, the way out stays plain
    const paint = (b: HTMLElement) => b.querySelector('button')!.style.background;
    expect(paint(buttons[0])).not.toBe(paint(buttons[1]));
    expect(paint(buttons[1])).not.toBe('');
    player.destroy();
  });

  it('is the size of its card, not of the page it was designed on', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'modal', { targetId, artboardId: p.artboards[0].id });
    const page = pageOf(p, made.overlayId);
    const card = page.children[0] as FrameNode;
    const player = await run(p);
    player.setVariable(p.variables.find((v) => v.id === page.overlay!.openVariable)!.name, true);
    player.step(16);
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${overlayId(made.overlayId, targetId)}"]`)!;
    expect(el.style.width).toBe(`${card.width}px`);
    expect(page.width).toBeGreaterThan(card.width);
    player.destroy();
  });

  it('a longer message pushes the buttons down instead of running into them', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'modal', { targetId, artboardId: p.artboards[0].id });
    const page = pageOf(p, made.overlayId);
    const card = page.children[0] as FrameNode;
    const message = card.children[1] as { text: string; height: number };
    const row = card.children[2] as FrameNode;
    const rowYShort = row.y;
    //three lines' worth, as the editor would measure it
    message.text = 'A much longer message that goes on for a while. '.repeat(3);
    message.height = 66;
    const player = await run(p);
    player.setVariable(p.variables.find((v) => v.id === page.overlay!.openVariable)!.name, true);
    player.step(16);
    const rowEl = document.querySelector<HTMLElement>(`[data-ix-id="${row.id}"]`)!;
    const rowY = Number(/translate\(\s*[-\d.]+px,\s*([-\d.]+)px/.exec(rowEl.style.transform)![1]);
    expect(rowY).toBeGreaterThan(rowYShort);
    player.destroy();
  });
});

describe("an overlay's own interactions run while it is shown", () => {
  const start = async (p: Project) => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    return player;
  };
  const press = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"] button`)!.click();

  it("a modal opens from its trigger and its Close button closes it", async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'modal', { targetId, artboardId: p.artboards[0].id });
    const page = pageOf(p, made.overlayId);
    const open = p.variables.find((v) => v.id === page.overlay!.openVariable)!;
    const close = ((page.children[0] as FrameNode).children[2] as FrameNode).children[0];
    const player = await start(p);
    press(targetId);
    player.step(16);
    expect(player.getVariable(open.name)).toBe(true);
    //the button is wired on the overlay's own page, which has to be listening while it is shown over this one
    press(close.id);
    player.step(16);
    expect(player.getVariable(open.name)).toBe(false);
    player.destroy();
  });

  it('a confirmation records which button was picked, then closes', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'confirm', { targetId, artboardId: p.artboards[0].id });
    const page = pageOf(p, made.overlayId);
    const open = p.variables.find((v) => v.id === page.overlay!.openVariable)!;
    const choice = p.variables.find((v) => /Choice$/.test(v.name))!;
    const player = await start(p);
    press(targetId);
    player.step(16);
    const frame = document.querySelector(`[data-ix-id="${overlayId(made.overlayId, targetId)}"]`)!;
    const yes = [...frame.querySelectorAll<HTMLElement>('[data-ix-type="button"] button')].find((b) => b.textContent?.includes('Yes'))!;
    yes.click();
    player.step(16);
    player.step(16);
    expect(player.getVariable(choice.name)).toBe('yes');
    expect(player.getVariable(open.name)).toBe(false);
    player.destroy();
  });

  it('a modal shared by two layers is drawn once, not once for each', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'modal', { targetId, artboardId: p.artboards[0].id });
    p.artboards[0].children.push(createNode('button', { id: 'btn2', x: 40, y: 40, width: 120, height: 40, label: 'Also opens it', overlay: { overlayId: made.overlayId } }));
    const player = await start(p);
    press('btn2');
    player.step(16);
    const shown = [...document.querySelectorAll<HTMLElement>('[data-ix-id^="ixov~"]')].filter((e) => !e.dataset.ixId!.endsWith('~tail') && e.style.display !== 'none');
    expect(shown).toHaveLength(1);
    player.destroy();
  });
});

describe('the prompt that takes typing', () => {
  const start = async (p: Project) => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    return player;
  };
  const press = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"] button`)!.click();
  const named = (p: Project, end: string) => p.variables.find((v) => v.name.endsWith(end))!;

  it('is kind input in the file, with a box bound to a variable and Cancel and OK', () => {
    const { p } = withTarget();
    const page = pageOf(p, addDialog(p, 'input').overlayId);
    expect(page.overlay!.kind).toBe('input');
    const card = page.children[0] as FrameNode;
    expect(card.children.map((c) => c.name)).toEqual(['Title', 'Message', 'Answer box', 'Buttons']);
    const box = card.children[2];
    expect(box.bindings?.value).toBe(named(p, 'Value').name);
    expect(box.bindingModes?.value).toBe('both');
    expect((card.children[3] as FrameNode).children.map((c) => c.name)).toEqual(['Cancel', 'OK']);
  });

  it('OK keeps what was typed as the answer, closes, and clears the box', async () => {
    const { p, targetId } = withTarget();
    const page = pageOf(p, addDialog(p, 'input', { targetId, artboardId: p.artboards[0].id }).overlayId);
    const card = page.children[0] as FrameNode;
    const [cancel, ok] = (card.children[3] as FrameNode).children;
    const player = await start(p);
    press(targetId);
    player.step(16);
    expect(player.getVariable(named(p, 'Open').name)).toBe(true);
    //typed for real, in the box on screen: the box is on the overlay's page, which is what once left it unheard
    const typed = document.querySelector<HTMLInputElement>(`[data-ix-id="${card.children[2].id}"] input`)!;
    typed.value = 'Field trip';
    typed.dispatchEvent(new Event('input', { bubbles: true }));
    player.step(16);
    expect(player.getVariable(named(p, 'Value').name)).toBe('Field trip');
    press(ok.id);
    player.step(16);
    expect(player.getVariable(named(p, 'Answer').name)).toBe('Field trip');
    expect(player.getVariable(named(p, 'Open').name)).toBe(false);
    expect(player.getVariable(named(p, 'Value').name)).toBe('');
    //and the box itself is empty the next time it opens
    press(targetId);
    player.step(16);
    expect(document.querySelector<HTMLInputElement>(`[data-ix-id="${card.children[2].id}"] input`)!.value).toBe('');
    player.setVariable(named(p, 'Open').name, false);
    player.step(16);
    //Cancel closes without touching the last answer
    press(targetId);
    player.step(16);
    player.setVariable(named(p, 'Value').name, 'Something else');
    press(cancel.id);
    player.step(16);
    expect(player.getVariable(named(p, 'Answer').name)).toBe('Field trip');
    expect(player.getVariable(named(p, 'Open').name)).toBe(false);
    player.destroy();
  });
});

describe('one overlay, many layers', () => {
  it('each of the three that cover the page says what it takes, so a layer gets fields for it', () => {
    const { p } = withTarget();
    const label = (kind: 'modal' | 'confirm' | 'input') => pageOf(p, addDialog(p, kind).overlayId).props!.map((x) => x.label);
    expect(label('modal')).toEqual(['Heading', 'Message']);
    expect(label('confirm')).toEqual(['Heading', 'Message', 'For']);
    expect(label('input')).toEqual(['Heading', 'Message', 'For']);
  });

  it('two layers open the same confirmation, each with its own words and its own For', async () => {
    const { p, targetId } = withTarget();
    const made = addDialog(p, 'confirm', { targetId, artboardId: p.artboards[0].id });
    const v = (end: string) => p.variables.find((x) => x.name.endsWith(end))!.name;
    const first = p.artboards[0].children.find((c) => c.id === targetId)!;
    first.overlay!.inputs = { [v('Title')]: 'Delete the photo?', [v('For')]: 'photo' };
    p.artboards[0].children.push(
      createNode('button', { id: 'btn2', x: 40, y: 40, width: 120, height: 40, label: 'Leave', overlay: { overlayId: made.overlayId, inputs: { [v('Title')]: 'Leave the group?', [v('For')]: 'group' } } }),
    );
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const heading = () => document.querySelector(`[data-ix-id^="ixov~"]`)!.textContent;

    document.querySelector<HTMLElement>(`[data-ix-id="${targetId}"] button`)!.click();
    player.step(16);
    expect(heading()).toContain('Delete the photo?');
    expect(player.getVariable(v('For'))).toBe('photo');
    player.setVariable(v('Open'), false);
    player.step(16);

    document.querySelector<HTMLElement>('[data-ix-id="btn2"] button')!.click();
    player.step(16);
    expect(heading()).toContain('Leave the group?');
    expect(player.getVariable(v('For'))).toBe('group');
    player.destroy();
  });

  it('a file saved when a confirmation was still called a prompt opens as a confirmation', () => {
    const { p } = withTarget();
    const id = addDialog(p, 'confirm').overlayId;
    const raw = JSON.parse(JSON.stringify(p)) as Project;
    (raw.artboards.find((a) => a.id === id)!.overlay as unknown as { kind: string }).kind = 'prompt';
    const clean = sanitizeProject(raw);
    expect(clean.artboards.find((a) => a.id === id)!.overlay!.kind).toBe('confirm');
    //and a kind nobody knows is no overlay at all, rather than a broken one
    (raw.artboards.find((a) => a.id === id)!.overlay as unknown as { kind: string }).kind = 'banner';
    expect(sanitizeProject(raw).artboards.find((a) => a.id === id)!.overlay).toBeUndefined();
  });
});


describe('the toast', () => {
  it('is a page of its own with one card, whose words come from a variable the toast names as its message', () => {
    const { p } = withTarget();
    const { overlayId: id, linked } = addDialog(p, 'toast');
    const page = pageOf(p, id);
    expect(linked).toBeNull();
    expect(page.name).toBe('Toast');
    expect(page.overlay).toMatchObject({ kind: 'toast', place: 'bottom-right', motion: 'slide' });
    const v = p.variables.find((x) => x.name === 'toast1Message')!;
    expect(page.overlay!.message).toBe(v.id);
    expect(page.props).toEqual([{ variable: v.id, label: 'Message' }]);
    const card = page.children[0] as FrameNode;
    expect(page.children).toHaveLength(1);
    expect((card.children[0] as { text: string }).text).toBe('{toast1Message}');
    //nothing was wired, since nothing was picked
    expect(p.artboards[0].logic.nodes).toHaveLength(0);
  });

  it('with a layer picked, clicking that layer shows it, and nothing points at the toast', () => {
    const { p, targetId } = withTarget();
    const { overlayId: id, linked } = addDialog(p, 'toast', { targetId, artboardId: p.artboards[0].id });
    expect(linked).toBe(targetId);
    expect(p.artboards[0].children[0].overlay).toBeUndefined();
    const [ev, act] = p.artboards[0].logic.nodes;
    expect(ev).toMatchObject({ kind: 'event.pointer', params: { target: targetId, type: 'click' } });
    expect(act).toMatchObject({ kind: 'action.toast', params: { toast: id } });
    expect(p.artboards[0].logic.edges).toMatchObject([{ from: ev.id, to: act.id }]);
  });

  it('a second one gets its own name and its own message', () => {
    const { p } = withTarget();
    addDialog(p, 'toast');
    const second = pageOf(p, addDialog(p, 'toast').overlayId);
    expect(second.name).toBe('Toast 2');
    expect(p.variables.map((v) => v.name)).toEqual(['toast1Message', 'toast2Message']);
  });

  it('what the editor builds runs: the click shows it with its words, and it goes by itself', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const { p, targetId } = withTarget();
    const { overlayId: id } = addDialog(p, 'toast', { targetId, artboardId: p.artboards[0].id });
    pageOf(p, id).overlay = { ...pageOf(p, id).overlay!, fade: 0, duration: 1000 };
    const player = new Player(document.getElementById('stage')!, sanitizeProject(structuredClone(p)), { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    const drawn = () => document.querySelector<HTMLElement>(`[data-ix-id="${overlayId(id, '')}"]`);
    expect(drawn()).toBeNull();
    document.querySelector<HTMLElement>('[data-ix-id="btn"] button')!.click();
    await new Promise((r) => setTimeout(r, 0));
    player.step(16);
    expect(drawn()!.textContent).toContain('Saved');
    for (let i = 0; i < 80; i++) player.step(16);
    expect(drawn()).toBeNull();
    player.destroy();
  });
});
