import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { TextField } from '../src/components/ui';
import { tokenSummary } from '../src/components/TokenPicker';
import { starterThemes } from '../src/lib/themes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('inspector polish', () => {
  it('keeps a long single-line label beside its box (it wraps in the label column), and puts only a text area label above', () => {
    act(() => root.render(<><TextField label="Text alternative" value="" onChange={() => undefined} /><TextField label="Name" value="" onChange={() => undefined} /><TextField label="Text" value="" multiline onChange={() => undefined} /></>));
    const [long, short, area] = [...host.querySelectorAll('.text-field')];
    expect(long.classList.contains('stacked')).toBe(false);
    expect(short.classList.contains('stacked')).toBe(false);
    expect(area.classList.contains('stacked')).toBe(true);
  });

  it('sums a token up as one line of text, a value for each theme', () => {
    const p = createProject('T');
    p.themes = starterThemes();
    const token = p.themes.tokens[0];
    const line = tokenSummary(p, token);
    for (const th of p.themes.list) expect(line).toContain(th.name);
    expect(line.split(', ').length).toBe(p.themes.list.length);
  });
});
