import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GridTrack } from 'interactives-player';
import { SelectField, TrackField, fullName } from '../src/components/ui';
import { trackProblems } from '../src/lib/grid-tracks';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let saved: GridTrack[][] = [];
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  saved = [];
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** What the Inspector does: the saved tracks come back in as the box's value */
function Harness({ start = [] as GridTrack[] }) {
  const [tracks, setTracks] = useState<GridTrack[]>(start);
  return (
    <TrackField
      label="Columns"
      tracks={tracks}
      onChange={(t) => {
        saved.push(t);
        setTracks(t);
      }}
    />
  );
}
const input = () => host.querySelector('input')!;
const typeKey = (text: string) =>
  act(() => {
    const el = input();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const focus = () => act(() => input().focus());
const blur = () => act(() => input().blur());
const key = (k: string) => act(() => void input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
const problem = () => host.querySelector('.field-problem')?.textContent ?? null;

describe('trackProblems', () => {
  it('lists the words that are not sizes, and leaves out the one still being typed', () => {
    expect(trackProblems('100px 25% 1fr auto')).toEqual([]);
    expect(trackProblems('100px wide 12q')).toEqual(['wide', '12q']);
    expect(trackProblems('1f')).toEqual(['1f']);
    expect(trackProblems('1f', true)).toEqual([]);
    expect(trackProblems('1f ', true)).toEqual(['1f']);
    expect(trackProblems('')).toEqual([]);
  });
});

describe('the grid Columns and Rows box', () => {
  it('lets a list be typed one key at a time without rewriting it under the cursor', () => {
    act(() => root.render(<Harness />));
    focus();
    for (const text of ['1', '12', '120', '120p', '120px', '120px ', '120px 1', '120px 1f', '120px 1fr']) {
      typeKey(text);
      expect(input().value).toBe(text);
    }
    // nothing is saved while typing
    expect(saved).toEqual([]);
    expect(problem()).toBeNull();
  });

  it('reads it and writes it back tidily on leaving the box', () => {
    act(() => root.render(<Harness />));
    focus();
    typeKey('120  1fr,auto  50%');
    blur();
    expect(saved).toEqual([[{ type: 'px', value: 120 }, { type: 'fr', value: 1 }, { type: 'auto' }, { type: 'percent', value: 50 }]]);
    expect(input().value).toBe('120px 1fr auto 50%');
    expect(problem()).toBeNull();
  });

  it('saves on Enter', () => {
    act(() => root.render(<Harness />));
    focus();
    typeKey('2fr 1fr');
    key('Enter');
    expect(saved).toHaveLength(1);
    expect(input().value).toBe('2fr 1fr');
  });

  it('keeps a half-typed word quiet, then says which word is not a size and saves nothing', () => {
    act(() => root.render(<Harness start={[{ type: 'fr', value: 1 }]} />));
    focus();
    typeKey('1fr wide');
    expect(problem()).toBeNull();
    typeKey('1fr wide ');
    expect(problem()).toContain('"wide" is not a size');
    blur();
    expect(saved).toEqual([]);
    expect(input().value).toBe('1fr wide ');
    expect(problem()).toContain('Not saved yet');
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('puts back what was saved on Escape', () => {
    act(() => root.render(<Harness start={[{ type: 'px', value: 40 }]} />));
    focus();
    typeKey('40px 99px');
    key('Escape');
    expect(saved).toEqual([]);
    expect(input().value).toBe('40px');
  });

  it('does not save again when the tidy text is what it already was', () => {
    act(() => root.render(<Harness start={[{ type: 'px', value: 40 }]} />));
    focus();
    typeKey('40');
    blur();
    expect(saved).toEqual([]);
    expect(input().value).toBe('40px');
  });

  it('can be emptied (no tracks)', () => {
    act(() => root.render(<Harness start={[{ type: 'px', value: 40 }]} />));
    focus();
    typeKey('');
    blur();
    expect(saved).toEqual([[]]);
  });
});

describe('a dropdown with a long choice', () => {
  it('has the whole choice (and the field tip) as its own tooltip, and a short one has none', () => {
    expect(fullName('Fixed', 'tip')).toBeUndefined();
    expect(fullName('Example idle pose', undefined)).toBe('Example idle pose');
    expect(fullName('Example idle pose', 'Pick one')).toBe('Example idle pose (Pick one)');
    act(() =>
      root.render(
        <>
          <SelectField label="A" value="a" options={[{ value: 'a', label: 'Direct (weight per timeline)' }]} onChange={() => undefined} />
          <SelectField label="B" value="b" options={[{ value: 'b', label: 'Start' }]} onChange={() => undefined} />
        </>,
      ),
    );
    const [a, b] = [...host.querySelectorAll('select')];
    expect(a.getAttribute('data-tip')).toBe('Direct (weight per timeline)');
    expect(a.hasAttribute('title')).toBe(false);
    expect(b.hasAttribute('data-tip')).toBe(false);
  });
});

describe('the Auto layout section of a grid frame', () => {
  it('keeps what is typed in Columns and saves the tidy tracks into the frame when you leave', async () => {
    const { createNode, createProject } = await import('interactives-player');
    const { EditorStore, setCurrentStore } = await import('../src/store/store');
    const { Inspector } = await import('../src/panels/Inspector');
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    const p = createProject('T');
    const n = createNode('frame', { name: 'Box' } as never) as never as { id: string; layout: unknown };
    p.artboards[0].children.push(n as never);
    const s = new EditorStore(p);
    s.update((d) => {
      (d.artboards[0].children[0] as never as { layout: unknown }).layout = { direction: 'column', gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'start', align: 'start', wrap: false, hugWidth: false, hugHeight: false, grid: { columns: [{ type: 'fr', value: 1 }], rows: [] } };
    });
    setCurrentStore(s);
    s.select([n.id]);
    act(() => root.render(<Inspector />));
    const cols = [...host.querySelectorAll<HTMLInputElement>('.track-field input')][0];
    expect(cols.value).toBe('1fr');
    act(() => cols.focus());
    for (const text of ['1', '12', '120', '120px', '120px 1fr']) {
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cols, text);
        cols.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(cols.value).toBe(text);
    }
    act(() => cols.blur());
    const frame = s.get().project.artboards[0].children[0] as never as { layout: { grid: { columns: unknown[] } } };
    expect(frame.layout.grid.columns).toEqual([{ type: 'px', value: 120 }, { type: 'fr', value: 1 }]);
    setCurrentStore(null);
  });
});
