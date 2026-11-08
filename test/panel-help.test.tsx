import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DockZone, openHeaderHelp, panelHelpTopic, trackPanelFocus, useDockSync, lastPanelWorkedIn } from '../src/components/Dock';
import { ALL_PANELS } from '../src/lib/dock';
import { closeHelp, HelpHost } from '../src/help/Help';
import { getTopic } from '../src/help/topics';
import { DialogHost } from '../src/components/dialogs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

function Shell() {
  useDockSync();
  return (
    <>
      <header className="topbar">
        <button id="top-help" onClick={openHeaderHelp}>
          Help
        </button>
      </header>
      <DockZone zone="left" />
      <DockZone zone="right" />
      <main className="canvas" id="canvas" tabIndex={0} />
      <HelpHost />
      <DialogHost />
    </>
  );
}

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  setCurrentStore(new EditorStore(createProject('T')));
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Shell />));
});
afterEach(() => {
  act(() => closeHelp());
  act(() => root.unmount());
  host.remove();
});

const press = (el: Element) => act(() => void el.dispatchEvent(new Event('pointerdown', { bubbles: true })));
const drawer = () => document.querySelector('.help-drawer h1, .help-drawer .help-title')?.textContent ?? document.querySelector('.help-drawer')?.textContent ?? '';

describe('help from the dock', () => {
  it('has no ? in any tab row', () => {
    expect(document.querySelectorAll('.dock-tabs .help-link').length).toBe(0);
    expect(document.querySelectorAll('.dock-tabs').length).toBeGreaterThan(0);
  });
  it('every panel names a help topic that exists', () => {
    for (const p of ALL_PANELS) expect(getTopic(panelHelpTopic(p).split('#')[0]), p).toBeTruthy();
  });
  it('puts Help for this panel in the tab menu', () => {
    const tab = document.querySelector<HTMLElement>('[data-dock-tab="assets"]')!;
    act(() => void tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
    const item = [...document.querySelectorAll<HTMLElement>('.ctx-menu [role="menuitem"]')].find((b) => b.textContent?.startsWith('Help for this panel'))!;
    expect(item).toBeTruthy();
    act(() => item.click());
    expect(document.querySelector('.help-drawer')).toBeTruthy();
    expect(drawer()).toContain('Assets');
  });
  it('opens the panel last worked in from the header button, and the general help otherwise', () => {
    const body = document.querySelector<HTMLElement>('.dock-properties, [data-panel="inspector"]')!;
    expect(body).toBeTruthy();
    press(body);
    expect(lastPanelWorkedIn()).toBe('inspector');
    act(() => document.getElementById('top-help')!.click());
    expect(drawer()).toContain('Properties panel');
    act(() => closeHelp());
    // the header button itself doesn't count as leaving the panel
    press(document.getElementById('top-help')!);
    expect(lastPanelWorkedIn()).toBe('inspector');
    // clicking the canvas does
    press(document.getElementById('canvas')!);
    expect(lastPanelWorkedIn()).toBeNull();
    act(() => document.getElementById('top-help')!.click());
    expect(drawer()).toContain('Welcome');
  });
  it('treats tabbing into a panel the same as clicking it', () => {
    const tab = document.querySelector<HTMLElement>('[data-dock-tab="layers"]')!;
    act(() => void tab.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    trackPanelFocus({ target: tab } as unknown as Event);
    expect(lastPanelWorkedIn()).toBe('layers');
  });
});
