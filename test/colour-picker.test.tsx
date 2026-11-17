//The colour picker that opens from a swatch: hue, the square, and the alpha strip that the browser's own picker lacks
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ColorField } from '../src/components/ui';
import { PickerButton } from '../src/components/ColourPicker';
import { colourOf, hsvToRgb, readColour, rgbToHsv, swatchBackground } from '../src/lib/colour-pick';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the sums', () => {
  it('goes to hue, saturation and brightness and back without drifting', () => {
    for (const rgb of [[255, 0, 0], [0, 128, 255], [18, 52, 86], [255, 201, 74], [0, 0, 0], [255, 255, 255], [128, 128, 128]] as [number, number, number][]) {
      expect(hsvToRgb(rgbToHsv(...rgb)), rgb.join()).toEqual(rgb);
    }
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
    expect(Math.round(rgbToHsv(0, 0, 255).h)).toBe(240);
  });

  it('writes hex for a solid colour and rgba for a see-through one', () => {
    expect(colourOf({ h: 0, s: 1, v: 1 }, 1)).toBe('#ff0000');
    expect(colourOf({ h: 0, s: 1, v: 1 }, 0.4)).toBe('rgba(255, 0, 0, 0.4)');
  });

  it('keeps the hue it had when the colour goes to black or grey, which have none of their own', () => {
    const blue = readColour('#0000ff').hsv;
    expect(readColour('#000000', blue).hsv.h).toBe(240);
    expect(readColour('#808080', blue).hsv.h).toBe(240);
    //a colour that really is another one is read afresh
    expect(Math.round(readColour('#00ff00', blue).hsv.h)).toBe(120);
  });

  it('shows a see-through colour over squares, and a solid one alone', () => {
    expect(swatchBackground('#ff0000')).toBe('#ff0000');
    expect(swatchBackground('rgba(255, 0, 0, 0.5)')).toContain('repeating-conic-gradient');
  });
});

describe('in a colour field', () => {
  let host: HTMLElement;
  let root: Root;
  let value = '';
  const commits = vi.fn();
  const Field = ({ start }: { start: string }) => {
    const [v, setV] = useState(start);
    value = v;
    return <ColorField label="Fill" value={v} onChange={setV} onCommit={commits} />;
  };
  const mount = async (start: string) => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    commits.mockClear();
    await act(async () => root.render(<Field start={start} />));
  };
  const swatch = () => host.querySelector<HTMLButtonElement>('button.swatch')!;
  const open = async () => act(async () => swatch().click());
  const pick = () => document.querySelector<HTMLElement>('.colour-pick');
  const strip = (name: string) => document.querySelector<HTMLInputElement>(`.colour-pick-strip.${name}`)!;
  const slide = async (el: HTMLInputElement, to: number) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, String(to));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  beforeEach(() => undefined);

  it('the swatch opens our picker, not the browser\'s, and Escape closes it and hands the focus back', async () => {
    await mount('#3366cc');
    expect(host.querySelector('.swatch input[type=color]')).toBeNull();
    expect(swatch().getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(pick()).not.toBeNull();
    expect(pick()!.getAttribute('role')).toBe('dialog');
    expect(swatch().getAttribute('aria-expanded')).toBe('true');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(pick()).toBeNull();
    expect(document.activeElement).toBe(swatch());
  });

  it('has an alpha strip that is a slider with a spoken value, and it is the same number as the box beside the colour', async () => {
    await mount('#3366cc');
    await open();
    const alpha = strip('alpha');
    expect(alpha.type).toBe('range');
    expect(alpha.getAttribute('aria-label')).toBe('Opacity');
    expect(alpha.value).toBe('100');
    expect(alpha.getAttribute('aria-valuetext')).toBe('Solid');
    await slide(alpha, 40);
    expect(value).toBe('rgba(51, 102, 204, 0.4)');
    expect(strip('alpha').getAttribute('aria-valuetext')).toBe('40% solid');
    expect(host.querySelector<HTMLInputElement>('input.alpha')!.value).toBe('40');
    //and the other way: the number box moves the strip
    const box = host.querySelector<HTMLInputElement>('input.alpha')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, '75');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(strip('alpha').value).toBe('75');
  });

  it('picking another colour keeps the alpha it had: it never snaps back to 100', async () => {
    await mount('rgba(51, 102, 204, 0.4)');
    await open();
    expect(strip('alpha').value).toBe('40');
    await slide(strip('hue'), 0);
    expect(value).toMatch(/^rgba\(204, 51, 51, 0\.4\)$/);
    expect(strip('alpha').value).toBe('40');
  });

  it('the square nudges with the arrow keys, and says where it is', async () => {
    await mount('#ff0000');
    await open();
    const sq = document.querySelector<HTMLElement>('.colour-pick-square')!;
    expect(sq.getAttribute('aria-valuetext')).toBe('Saturation 100%, brightness 100%');
    await act(async () => sq.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true })));
    expect(document.querySelector('.colour-pick-square')!.getAttribute('aria-valuetext')).toBe('Saturation 100%, brightness 90%');
    expect(value).toBe('#e60000');
  });

  it('the swatch shows a see-through colour over squares', async () => {
    await mount('rgba(51, 102, 204, 0.4)');
    expect(swatch().classList.contains('see-through')).toBe(true);
    expect(swatch().style.getPropertyValue('--swatch')).toBe('rgba(51, 102, 204, 0.4)');
    await mount('#3366cc');
    expect(swatch().classList.contains('see-through')).toBe(false);
  });

  it('the browser\'s own picker is still there inside it, and keeps the alpha too', async () => {
    await mount('rgba(51, 102, 204, 0.4)');
    await open();
    const native = document.querySelector<HTMLInputElement>('.colour-pick-native input[type=color]')!;
    expect(native.value).toBe('#3366cc');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(native, '#00ff00');
      native.dispatchEvent(new Event('input', { bubbles: true }));
      native.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(value).toBe('rgba(0, 255, 0, 0.4)');
  });
});

describe('a button that opens the picker (the text toolbar\'s A, a style\'s swatch)', () => {
  it('opens it, sends what is picked, and keeps the focus where it was when pressed', async () => {
    document.body.innerHTML = '<input id="typing" />';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picked = vi.fn();
    const root = createRoot(host);
    await act(async () => root.render(<PickerButton label="Text colour" value="#ff0000" onChange={picked} className="tt-swatch">A</PickerButton>));
    const typing = document.getElementById('typing') as HTMLInputElement;
    typing.focus();
    const btn = host.querySelector('button')!;
    //a press on it doesn't take the focus from the text being edited
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    btn.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await act(async () => btn.click());
    expect(document.querySelector('.colour-pick')).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const alpha = document.querySelector<HTMLInputElement>('.colour-pick-strip.alpha')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(alpha, '50');
      alpha.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(picked).toHaveBeenLastCalledWith('rgba(255, 0, 0, 0.5)');
    await act(async () => root.unmount());
  });
});
