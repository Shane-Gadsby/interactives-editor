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
  it('puts a long single-line label above its box, and keeps a short one beside it', () => {
    act(() => root.render(<><TextField label="Text alternative" value="" onChange={() => undefined} /><TextField label="Name" value="" onChange={() => undefined} /></>));
    const [long, short] = [...host.querySelectorAll('.text-field')];
    expect(long.classList.contains('multiline')).toBe(true);
    expect(short.classList.contains('multiline')).toBe(false);
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
