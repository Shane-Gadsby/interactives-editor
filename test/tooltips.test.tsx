import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { adoptTitle, installTooltips, placeTip } from '../src/components/tooltips';
import { CheckField, IconButton, NumberField, SelectField } from '../src/components/ui';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
});
function mount(node: React.ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
const hover = (el: Element) => el.dispatchEvent(new Event('pointerover', { bubbles: true }));

describe('tooltips keep the label for assistive technology', () => {
  beforeAll(() => installTooltips());

  it('an arrow-only button gets its title as aria-label, and a data-tip', () => {
    const h = mount(
      <button type="button" className="mini" title="Move fill 2 up (in front)">
        ↑
      </button>,
    );
    const b = h.querySelector('button')!;
    hover(b);
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.dataset.tip).toBe('Move fill 2 up (in front)');
    expect(b.getAttribute('aria-label')).toBe('Move fill 2 up (in front)');
  });

  it('an icon button keeps the aria-label it was given', () => {
    const h = mount(<IconButton icon={<svg />} title="Add fill" />);
    const b = h.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('Add fill');
    hover(b);
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.getAttribute('aria-label')).toBe('Add fill');
    expect(b.dataset.tip).toBe('Add fill');
  });

  it('a button with its own words keeps them as its name and gets the tip as a description', () => {
    const h = mount(
      <button type="button" title="Turns the path into an editable shape">
        Convert to path
      </button>,
    );
    const b = h.querySelector('button')!;
    hover(b);
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(b.getAttribute('aria-description')).toBe('Turns the path into an editable shape');
  });

  it('a field label hands its tip to the control inside it', () => {
    const h = mount(
      <>
        <NumberField label="Sx" value={1} onChange={() => {}} />
        <SelectField label="Blend" title="How the layer mixes with what is under it" value="normal" options={['normal', 'screen'] as const} onChange={() => {}} />
        <CheckField label="Muted" title="No sound" value={false} onChange={() => {}} />
      </>,
    );
    const labels = Array.from(h.querySelectorAll('label'));
    for (const l of labels) hover(l);
    expect(labels.every((l) => !l.hasAttribute('title'))).toBe(true);
    expect(h.querySelector('select')!.getAttribute('aria-description')).toBe('How the layer mixes with what is under it');
    expect(h.querySelector('input[type="checkbox"]')!.getAttribute('aria-description')).toBe('No sound');
    expect(h.querySelector('.number-field input')!.getAttribute('aria-description')).toMatch(/Horizontal scale/);
    expect(labels[1].dataset.tip).toBe('How the layer mixes with what is under it');
  });

  it('an unlabelled input is named by its tip', () => {
    const h = mount(<input title="Opacity %" />);
    const i = h.querySelector('input')!;
    adoptTitle(i);
    expect(i.getAttribute('aria-label')).toBe('Opacity %');
  });

  it('adopting twice, or an element without a title, changes nothing', () => {
    const h = mount(
      <button type="button" title="Next">
        →
      </button>,
    );
    const b = h.querySelector('button')!;
    expect(adoptTitle(b)).toBe('Next');
    expect(adoptTitle(b)).toBe('Next');
    expect(b.getAttribute('aria-label')).toBe('Next');
    const plain = document.createElement('div');
    expect(adoptTitle(plain)).toBeNull();
  });

  it('a hyphenated label does not break after the hyphen, and still finds its tip', () => {
    const h = mount(<SelectField label="V-align" value="top" options={['top', 'middle'] as const} onChange={() => {}} />);
    expect(h.querySelector('.field-label')!.textContent).toBe('V\u2011align');
    expect(h.querySelector('label')!.getAttribute('title')).toBe('Vertical alignment inside the box');
  });

  it('keyboard focus adopts the title as well, with no hover', () => {
    const h = mount(
      <button type="button" title="Show fill 1">
        ◆
      </button>,
    );
    const b = h.querySelector('button')!;
    act(() => b.focus());
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.getAttribute('aria-label')).toBe('Show fill 1');
  });
});

describe('where a tooltip goes', () => {
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

  it('goes underneath by default, above when there is no room, and beside the tool bar', () => {
    expect(placeTip(box(100, 100, 40, 20), 80, 24, 1000, 800)).toEqual({ x: 80, y: 126 });
    expect(placeTip(box(100, 770, 40, 20), 80, 24, 1000, 800)).toEqual({ x: 80, y: 740 });
    expect(placeTip(box(10, 100, 30, 30), 80, 24, 1000, 800, { beside: true })).toEqual({ x: 48, y: 103 });
  });

  it('a button that asks for it gets the tip above with a tail pointing down at it', () => {
    expect(placeTip(box(500, 700, 48, 48), 200, 26, 1000, 800, { above: true })).toEqual({ x: 424, y: 664, tail: 'down', tailX: 100 });
  });

  it('keeps the tail on the button when the bubble is pushed in from the edge, and flips below when there is no room above', () => {
    // hard against the right edge: the bubble stops 4px short and the tail moves right to stay over the button
    const edge = placeTip(box(940, 700, 48, 48), 200, 26, 1000, 800, { above: true });
    expect(edge).toMatchObject({ x: 796, tail: 'down', tailX: 168 });
    expect(placeTip(box(500, 10, 48, 48), 200, 26, 1000, 800, { above: true })).toMatchObject({ y: 68, tail: 'up' });
  });
});
