import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { boundFieldKeys } from '../src/panels/BindingsSection';
import { BoundProvider } from '../src/lib/prop-search';
import { CheckField, NumberField, TextField } from '../src/components/ui';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});
function mount(el: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
}

describe('bound property marker', () => {
  it('lists the keys of properties bound in or both ways, not out only', () => {
    const p = createProject('T');
    const node = createNode('rect', { id: 'r1', bindings: { opacity: 'a', x: 'b', rotation: 'c' }, bindingModes: { rotation: 'out', x: 'both' } });
    const keys = boundFieldKeys(node, p);
    expect(keys.has('opacity')).toBe(true);
    expect(keys.has('x-position')).toBe(true);
    expect(keys.has('rotation')).toBe(false);
    expect(boundFieldKeys(createNode('rect', { id: 'r2' }), p).size).toBe(0);
  });

  it('marks the field of a bound property and leaves the others alone', () => {
    const keys = boundFieldKeys(createNode('rect', { id: 'r1', bindings: { opacity: 'a', visible: 'b' } }), createProject('T'));
    mount(
      <BoundProvider value={keys}>
        <NumberField label="Opacity" value={1} onChange={() => undefined} />
        <NumberField label="Y" value={1} onChange={() => undefined} />
        <CheckField label="Visible" value={true} onChange={() => undefined} />
        <TextField label="Text" value="" onChange={() => undefined} />
      </BoundProvider>,
    );
    const bound = [...document.querySelectorAll('.field.is-bound')].map((f) => f.getAttribute('data-prop'));
    expect(bound).toEqual(['opacity', 'visible']);
    const mark = document.querySelector('.field.is-bound .bound-mark')!;
    expect(mark.getAttribute('aria-label')).toBe('Set by a data binding');
    expect(document.querySelectorAll('.bound-mark').length).toBe(2);
  });

  it('shows nothing without a provider', () => {
    mount(<NumberField label="Opacity" value={1} onChange={() => undefined} />);
    expect(document.querySelector('.bound-mark')).toBeNull();
  });
});
