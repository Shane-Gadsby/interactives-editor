//Add accordion / Add tabs: a frame that knows what it is, with no interaction nodes behind it
import { describe, expect, it } from 'vitest';
import { Player, createProject, type ContainerNode, type FrameNode, type Project } from 'interactives-player';
import { addAccordion, addSection } from '../src/lib/accordion-kit';

const find = (p: Project, id: string): FrameNode => p.artboards[0].children.find((c) => c.id === id) as FrameNode;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;

describe('Add accordion', () => {
  it('builds three sections, each a header and a panel, with no graph nodes at all', () => {
    const p = createProject();
    const id = addAccordion(p, p.artboards[0].id)!;
    const frame = find(p, id);
    expect(frame.disclosure).toMatchObject({ open: 'one', toggle: true });
    expect(frame.children).toHaveLength(3);
    for (const section of frame.children as ContainerNode[]) {
      expect(section.children).toHaveLength(2);
      expect(section.children[0].type).toBe('button');
    }
    //the whole point: the frame does the work, so the page's graph is untouched
    expect(p.artboards[0].logic.nodes).toHaveLength(0);
  });

  it('makes the number variable that remembers what is open', () => {
    const p = createProject();
    const frame = find(p, addAccordion(p, p.artboards[0].id)!);
    const v = p.variables.find((x) => x.id === frame.disclosure!.variable)!;
    expect(v.type).toBe('number');
    expect(v.initial).toBe(0);
  });

  it('tabs put the panels in their own box, matched to the headers in order', () => {
    const p = createProject();
    const frame = find(p, addAccordion(p, p.artboards[0].id, 'tabs')!);
    const panels = frame.children.find((c) => c.id === frame.disclosure!.panels) as ContainerNode;
    expect(panels).toBeTruthy();
    expect(panels.children).toHaveLength(3);
    //the tabs sit in a tab list of their own (what lets a screen reader say "tab list, 3 tabs"), beside the panels box
    const list = frame.children.find((c) => c.id === frame.disclosure!.tabs) as ContainerNode;
    expect(frame.children.map((c) => c.name)).toEqual(['Tab list', 'Panels']);
    expect(list.children.map((c) => c.type)).toEqual(['button', 'button', 'button']);
    expect(frame.disclosure!.toggle).toBeUndefined();
  });

  it('a second accordion gets its own variable', () => {
    const p = createProject();
    const a = find(p, addAccordion(p, p.artboards[0].id)!);
    const b = find(p, addAccordion(p, p.artboards[0].id)!);
    expect(a.disclosure!.variable).not.toBe(b.disclosure!.variable);
    expect(new Set(p.variables.map((v) => v.name)).size).toBe(p.variables.length);
  });

  it('answers with null for a page that is not there', () => {
    expect(addAccordion(createProject(), 'nope')).toBeNull();
  });
});

describe('adding a section', () => {
  it('copies the last one with fresh ids', () => {
    const p = createProject();
    const id = addAccordion(p, p.artboards[0].id)!;
    addSection(p, p.artboards[0].id, id);
    const frame = find(p, id);
    expect(frame.children).toHaveLength(4);
    expect(frame.children[3].name).toBe('Section 4');
    const ids = new Set<string>();
    const walk = (n: ContainerNode) => {
      for (const c of n.children) {
        expect(ids.has(c.id)).toBe(false);
        ids.add(c.id);
        if ('children' in c) walk(c as ContainerNode);
      }
    };
    walk(frame as unknown as ContainerNode);
  });

  it('a tab strip gets a tab and a panel, with the panels box staying last', () => {
    const p = createProject();
    const id = addAccordion(p, p.artboards[0].id, 'tabs')!;
    addSection(p, p.artboards[0].id, id);
    const frame = find(p, id);
    const panels = frame.children.find((c) => c.id === frame.disclosure!.panels) as ContainerNode;
    const list = frame.children.find((c) => c.id === frame.disclosure!.tabs) as ContainerNode;
    expect(list.children).toHaveLength(4);
    expect(panels.children).toHaveLength(4);
    expect(frame.children[frame.children.length - 1].id).toBe(panels.id);
    //the new tab knows it is the fourth: its chosen look asks about its own place
    expect((list.children[3] as unknown as { states: { expr: string }[] }).states[0].expr).toMatch(/== 3$/);
  });
});

describe('what it builds actually runs', () => {
  it('clicking a heading opens that section', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const p = createProject();
    const id = addAccordion(p, p.artboards[0].id)!;
    const frame = find(p, id);
    const second = (frame.children[1] as ContainerNode);
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(el(second.children[1].id).style.display).toBe('none');
    el(second.children[0].id).querySelector('button')!.click();
    player.step(16);
    expect(el(second.children[1].id).style.display).not.toBe('none');
    player.destroy();
  });
});
