import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { createNode, createProject, type NodeType, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Inspector } from '../src/panels/Inspector';
import { CheckField, ColorField, FieldTrail, NumberField, SelectField, TextField, UnitField, fieldClass, unbroken } from '../src/components/ui';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

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

const noop = () => undefined;
const kids = (el: Element) => [...el.children].map((c) => c.className.split(' ')[0]);

/** The layout contract of every field: label column, then the control, then the trailing slot. */
describe('field markup', () => {
  it('lays a labelled single line field out as label, control, trailing slot', () => {
    act(() =>
      root.render(
        <>
          <NumberField label="Speed" value={1} onChange={noop} suffix="x" />
          <NumberField label="Radius" value={1} onChange={noop} />
          <SelectField<string> label="Fit" value="a" options={['a', 'b']} onChange={noop} />
          <TextField label="Link" value="" onChange={noop} />
          <UnitField label="Gap" value={4} unit="px" onChange={noop} />
        </>,
      ),
    );
    const fields = [...host.querySelectorAll('.field')];
    expect(fields).toHaveLength(5);
    for (const f of fields) {
      const k = kids(f);
      expect(k[0]).toBe('field-label');
      expect(k[k.length - 1]).toBe('field-trail');
      expect(f.querySelectorAll('.field-trail')).toHaveLength(1);
    }
    // a unit goes in the slot, and the slot is still there (empty) when there is none
    expect(host.querySelector('.number-field .field-trail')!.textContent).toBe('x');
    expect(fields[1].querySelector('.field-trail')!.textContent).toBe('');
    expect(fields[2].querySelector('.field-trail')!.textContent).toBe('');
  });

  it('puts the label of a long name in the label column like any other', () => {
    act(() => root.render(<TextField label="Text when empty" value="" onChange={noop} />));
    const f = host.querySelector('.field')!;
    expect(f.classList.contains('stacked')).toBe(false);
    expect(f.querySelector('input')).not.toBeNull();
    expect(f.querySelector('.field-trail')).not.toBeNull();
  });

  it('puts the label above only for a text area', () => {
    act(() =>
      root.render(
        <>
          <TextField label="Text" value="" onChange={noop} multiline />
          <TextField label="Text" value="" onChange={noop} />
        </>,
      ),
    );
    const [area, line] = [...host.querySelectorAll('.field')];
    expect(area.classList.contains('stacked')).toBe(true);
    expect(kids(area)).toEqual(['field-label', '']);
    expect(area.querySelector('textarea')).not.toBeNull();
    expect(line.classList.contains('stacked')).toBe(false);
  });

  it('marks a one or two letter label so a pair row can give it the narrow column', () => {
    act(() =>
      root.render(
        <>
          <NumberField label="X" value={0} onChange={noop} />
          <NumberField label="Sx" value={0} onChange={noop} />
          <NumberField label="Rotation" value={0} onChange={noop} />
          <NumberField value={0} onChange={noop} />
        </>,
      ),
    );
    const f = [...host.querySelectorAll('.field')];
    expect(f.map((e) => e.classList.contains('lbl-xs'))).toEqual([true, true, false, false]);
    expect(f[3].classList.contains('unlabelled')).toBe(true);
    expect(f[3].querySelector('.field-label')).toBeNull();
    expect(f[2].classList.contains('unlabelled')).toBe(false);
  });

  it('names every field kind with the same classes', () => {
    expect(fieldClass('number-field', 'Speed')).toBe('field number-field');
    expect(fieldClass('number-field', 'X')).toBe('field number-field lbl-xs');
    expect(fieldClass('select-field', undefined)).toBe('field select-field unlabelled');
    expect(fieldClass('text-field', 'Text', true, 'multiline stacked')).toBe('field text-field multiline stacked ps-hide');
    expect(unbroken('V-align')).toBe('V‑align');
    // a long start may break after the hyphen (the label column is narrow)
    expect(unbroken('Bottom-right')).toBe('Bottom-right');
  });

  it('keeps real labels: the colour field label is a label for its hex box, the others wrap their control', () => {
    act(() =>
      root.render(
        <>
          <ColorField label="Colour" value="#ff0000" onChange={noop} />
          <CheckField label="Muted" value={false} onChange={noop} />
          <SelectField<string> label="Fit" value="a" options={['a']} onChange={noop} />
        </>,
      ),
    );
    const color = host.querySelector('.color-field')!;
    const lab = color.querySelector('label.field-label') as HTMLLabelElement;
    expect(lab.htmlFor).toBeTruthy();
    expect(document.getElementById(lab.htmlFor)!.tagName).toBe('INPUT');
    expect(color.querySelector('.field-control')).not.toBeNull();
    expect(kids(color)).toEqual(['field-label', 'field-control', 'field-trail']);
    for (const sel of ['.check-field', '.select-field']) expect(host.querySelector(sel)!.tagName).toBe('LABEL');
  });

  it('renders the trailing slot as a plain empty span', () => {
    act(() => root.render(<FieldTrail />));
    expect(host.innerHTML).toBe('<span class="field-trail"></span>');
  });
});

describe('every field in the properties panel', () => {
  const TYPES: NodeType[] = ['rect', 'text', 'video', 'input', 'button', 'frame', 'image', 'ellipse'];
  function mount(type: NodeType) {
    const p = createProject('T');
    const n = createNode(type, { name: 'one' } as never) as SceneNode;
    p.artboards[0].children.push(n);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([n.id]);
    act(() => root.render(<Inspector />));
    for (let i = 0; i < 5; i++) {
      const closed = [...host.querySelectorAll<HTMLElement>('.section-title[aria-expanded="false"]')];
      if (!closed.length) break;
      act(() => closed.forEach((b) => b.click()));
    }
  }
  for (const type of TYPES) {
    it(`${type}: one structure, trailing slot present, label above only for a text area`, () => {
      mount(type);
      const fields = [...host.querySelectorAll<HTMLElement>('.inspector .field')];
      expect(fields.length).toBeGreaterThan(5);
      for (const f of fields) {
        if (f.classList.contains('check-field')) continue;
        const k = kids(f);
        const last = k[k.length - 1];
        if (f.classList.contains('stacked')) {
          // label above: a text area, and nothing else
          expect(f.querySelector('textarea'), f.textContent ?? '').not.toBeNull();
          continue;
        }
        if (f.classList.contains('li-picker-field')) continue;
        expect(last, `${f.className} / ${f.textContent}`).toBe('field-trail');
        expect(f.querySelectorAll(':scope > .field-label').length).toBeLessThanOrEqual(1);
        if (f.classList.contains('unlabelled')) expect(f.querySelector(':scope > .field-label')).toBeNull();
        else expect(k[0], `${f.className} / ${f.textContent}`).toBe('field-label');
      }
    });
  }
});

describe('the stylesheet', () => {
  const css = readFileSync(`${__dirname}/../src/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('/* ---------------------------------------------------------------- field rows'), css.indexOf('/* ---------------------------------------------------------------- sections'));

  it('has one label column width, a narrow one for pairs and a trailing slot, all set once on :root', () => {
    const root = /:root\s*\{([^}]*)\}/.exec(block)![1];
    for (const v of ['--label-w', '--label-w-sm', '--label-w-xs', '--field-trail', '--field-key', '--field-h']) expect(root).toContain(v + ':');
  });

  it('lays a field out on a grid of label, control and trailing slot', () => {
    expect(block).toMatch(/grid-template-columns:\s*var\(--fl, var\(--label-w\)\) minmax\(var\(--ctl-min, \d+px\), 1fr\) var\(--field-trail\)/);
    // the key diamond has its own slot, kept when it is not showing
    expect(block).toMatch(/\.keyed\s*\{[^}]*padding-right:\s*var\(--field-key\)/);
    expect(block).toMatch(/\.key-btn\s*\{[^}]*width:\s*var\(--field-key\)/);
  });

  it('gives dropdowns, text, number and colour boxes one height', () => {
    expect(block).toMatch(/\{[^}]*height:\s*var\(--field-h\)/);
    expect(css).toMatch(/\.field input:not\(\[type='checkbox'\]\):not\(\[type='color'\]\),\s*\.field select,\s*\.field textarea\s*\{[^}]*height:\s*26px/);
  });

  it('has no one-off label widths left', () => {
    expect(css).not.toMatch(/labels-\d+/);
    // no rule narrows or widens a label with a fixed width outside the shared block (a label's width is the column's)
    const outside = css.replace(block, '');
    const rules = [...outside.matchAll(/([^{}]*\.field-label[^{}]*)\{([^}]*)\}/g)].filter(([, sel]) => /\.(inspector|param-form|key-editor)\b/.test(sel));
    expect(rules.filter(([, , body]) => /(^|[;\s])(width|min-width|max-width|flex-basis)\s*:/.test(body)).map(([, sel]) => sel.trim())).toEqual([]);
  });

  it('keeps hand-rolled width classes and inline widths off the panels', () => {
    const dirs = ['../src/panels/', '../src/components/'];
    const found: string[] = [];
    for (const d of dirs) {
      for (const f of readdirSync(`${__dirname}/${d}`)) {
        if (!f.endsWith('.tsx')) continue;
        const text = readFileSync(`${__dirname}/${d}${f}`, 'utf8');
        if (/labels-\d+/.test(text)) found.push(f + ': labels-N');
        if (/<(NumberField|TextField|SelectField|UnitField|ColorField)\b[^>]*style=\{\{/.test(text)) found.push(f + ': inline style on a field');
      }
    }
    expect(found).toEqual([]);
  });

  it('says what stacks: only text areas (and block labels for code, lists and paint editors)', () => {
    expect(block).toContain('.field.stacked');
    expect(css).toMatch(/\.field-label\.block\s*\{[^}]*margin:\s*6px 0 3px/);
  });
});
