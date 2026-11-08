//Dragging the tool rail: out to float, over an edge target to dock (left, right, bottom), refused over panel tabs, Esc leaves it floating
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DockDragLayer, FloatingTools, ToolsHead, toolsMenu } from '../src/components/Dock';
import { defaultLayout, getDock, setDock } from '../src/lib/dock';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

let root: Root;
let host: HTMLElement;
let under: Element[] = [];

beforeEach(() => {
  setCurrentStore(new EditorStore(createProject('T')));
  setDock(defaultLayout());
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  // jsdom has no hit testing: what is "under the pointer" is whatever the test says
  (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => under;
  under = [];
  act(() =>
    root.render(
      <>
        <main className="stage" />
        <ToolsHead />
        <DockDragLayer />
        <div data-dock-strip="" data-dock-zone="left" data-dock-tabs="layers" id="strip" />
      </>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.classList.remove('dock-dragging');
});

const grip = () => host.querySelector('.dock-tools-grip')!;
const fire = (el: Element | Window, type: string, x = 0, y = 0, extra: Record<string, unknown> = {}) =>
  act(async () => {
    const ev = type === 'keydown' ? new KeyboardEvent(type, { key: 'Escape', bubbles: true }) : new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.assign(ev, extra);
    el.dispatchEvent(ev);
  });
const edge = (z: string) => document.body.querySelector(`[data-dock-edge="${z}"]`)!;

describe('docking the tool rail by dragging', () => {
  it('a small move is not a drag, a long one lifts the rail out to float under the pointer', async () => {
    await fire(grip(), 'pointerdown', 20, 20);
    await fire(window, 'pointermove', 22, 21);
    expect(getDock().tools.place).toBe('left');
    await fire(window, 'pointermove', 300, 200);
    expect(getDock().tools.place).toBe('float');
    await fire(window, 'pointerup', 300, 200);
    expect(getDock().tools.place).toBe('float');
  });

  it.each(['left', 'right', 'bottom'] as const)('dropped on the %s edge it docks there, and the edge lights up while over it', async (zone) => {
    await fire(grip(), 'pointerdown', 20, 20);
    await fire(window, 'pointermove', 300, 200);
    // the edge targets show, labelled for the tools
    expect(edge('left').textContent).toBe('Dock tools left');
    expect(edge('bottom').textContent).toBe('Dock tools at the bottom');
    under = [edge(zone)];
    await fire(window, 'pointermove', 5, 5);
    expect(edge(zone).className).toContain('over');
    expect(document.body.querySelector('.dock-drag-tab')?.textContent).toContain(`dock ${zone}`);
    await fire(window, 'pointerup', 5, 5);
    expect(getDock().tools.place).toBe(zone);
    expect(document.body.querySelector('[data-dock-edge]')).toBeNull();
  });

  it('a panel\'s tab strip refuses it and says so, and letting go there leaves it floating', async () => {
    await fire(grip(), 'pointerdown', 20, 20);
    await fire(window, 'pointermove', 300, 200);
    under = [host.querySelector('#strip')!];
    await fire(window, 'pointermove', 310, 210);
    expect(document.body.querySelector('.dock-drag-tab')?.textContent).toContain("can't be a tab");
    expect(document.body.querySelectorAll('.dock-edge.over')).toHaveLength(0);
    await fire(window, 'pointerup', 310, 210);
    expect(getDock().tools.place).toBe('float');
  });

  it('Esc while dragging drops it where it is without docking', async () => {
    await fire(grip(), 'pointerdown', 20, 20);
    await fire(window, 'pointermove', 300, 200);
    under = [edge('right')];
    await fire(window, 'pointermove', 5, 5);
    await fire(window, 'keydown');
    await fire(window, 'pointerup', 5, 5);
    expect(getDock().tools.place).toBe('float');
    expect(document.body.querySelector('[data-dock-edge]')).toBeNull();
  });

  it('a floating rail docks by its own title bar the same way', async () => {
    setDock((l) => ({ ...l, tools: { place: 'float', x: 100, y: 100 } }));
    act(() =>
      root.render(
        <>
          <main className="stage" />
          <FloatingTools>
            <span />
          </FloatingTools>
          <DockDragLayer />
        </>,
      ),
    );
    const g = host.querySelector('.dock-tools-grip')!;
    await fire(g, 'pointerdown', 110, 110);
    await fire(window, 'pointermove', 200, 200);
    under = [edge('bottom')];
    await fire(window, 'pointermove', 50, 700);
    await fire(window, 'pointerup', 50, 700);
    expect(getDock().tools.place).toBe('bottom');
  });
});

describe('the rail\'s menu', () => {
  it('offers left, right, bottom, top and floating, with where it is now disabled', () => {
    const labels = () => toolsMenu().filter((i) => 'label' in i).map((i) => ('label' in i ? [i.label, 'disabled' in i && i.disabled] : null));
    expect(labels().slice(0, 5)).toEqual([['Dock on the left', true], ['Dock on the right', false], ['Dock at the bottom', false], ['Dock at the top', false], ['Floating', false]]);
    const bottom = toolsMenu().find((i) => 'label' in i && i.label === 'Dock at the bottom')!;
    act(() => ('onClick' in bottom ? bottom.onClick() : undefined));
    expect(getDock().tools.place).toBe('bottom');
    expect(labels()[2]).toEqual(['Dock at the bottom', true]);
    const floating = toolsMenu().find((i) => 'label' in i && i.label === 'Floating')!;
    act(() => ('onClick' in floating ? floating.onClick() : undefined));
    expect(getDock().tools).toEqual({ place: 'float', x: 90, y: 110 });
  });
});
