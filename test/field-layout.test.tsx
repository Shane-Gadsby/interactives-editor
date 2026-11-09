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

  it('marks a field with no label so its control starts at the left edge', () => {
    act(() =>
      root.render(
        <>
          <NumberField label="X" value={0} onChange={noop} />
          <NumberField label="Rotation" value={0} onChange={noop} />
          <NumberField value={0} onChange={noop} />
        </>,
      ),
    );
    const f = [...host.querySelectorAll('.field')];
    expect(f.map((e) => e.classList.contains('unlabelled'))).toEqual([false, false, true]);
    expect(f[2].querySelector('.field-label')).toBeNull();
  });

  it('names every field kind with the same classes', () => {
    expect(fieldClass('number-field', 'Speed')).toBe('field number-field');
    expect(fieldClass('number-field', 'X')).toBe('field number-field');
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

/** The shapes a line in the panel can take. The stylesheet knows each of them, so a new one has to be added there too. */
describe('the lines of the properties panel', () => {
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
  const isField = (e: Element) => e.classList.contains('field') || e.classList.contains('keyed');
  const kind = (e: Element) => (e.classList.contains('keyed') ? [...e.children].map((c) => (c.classList.contains('field') ? (c.classList.contains('check-field') ? 'check' : 'field') : 'key')).join('+') : e.classList.contains('check-field') ? 'check' : e.classList.contains('field') ? 'field' : e.classList.contains('link-toggle') || e.classList.contains('link-gap') ? 'chain' : e.classList.contains('btn') || e.classList.contains('link-btn') ? 'button' : 'other');
  for (const type of TYPES) {
    it(`${type}: a pair is two fields, with the chain between them at most`, () => {
      mount(type);
      const rows = [...host.querySelectorAll<HTMLElement>('.inspector .row')];
      expect(rows.length).toBeGreaterThan(3);
      for (const r of rows) {
        const kids = [...r.children];
        const fields = kids.filter(isField);
        const chains = kids.filter((c) => kind(c) === 'chain');
        // the chain is between two fields and there is one of it at most
        if (chains.length) {
          expect(chains).toHaveLength(1);
          expect(fields).toHaveLength(2);
          expect(kids.indexOf(chains[0])).toBe(1);
        }
        // a keyed wrapper is the field and its diamond, in that order
        for (const k of kids.filter((c) => c.classList.contains('keyed'))) {
          expect(kind(k), r.textContent ?? '').toMatch(/^(field|check)(\+key)?$/);
        }
      }
    });
  }

  it('Layer: X Y, W H, Rotation Opacity and Scale are pair rows of two keyed number fields, W H and Scale with the chain', () => {
    mount('rect');
    const pairs = [...host.querySelectorAll<HTMLElement>('.inspector .row')].filter((r) => [...r.children].filter(isField).length === 2 && !r.querySelector('select, textarea, .unit-field, .check-field'));
    const labels = pairs.map((r) => [...r.querySelectorAll('.field-label')].map((l) => l.textContent?.replace(/\u00a0/g, ' ')).join('|'));
    for (const want of ['X|Y', 'W|H', 'Rotation|Opacity', 'Scale W|Scale H']) expect(labels).toContain(want);
    for (const r of pairs.filter((r) => /^(W\|H|Scale W\|Scale H)$/.test([...r.querySelectorAll('.field-label')].map((l) => l.textContent).join('|')))) {
      expect(r.querySelector(':scope > .link-toggle')).not.toBeNull();
    }
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(`${__dirname}/../src/styles.css`, 'utf8');
  const block = css.slice(css.indexOf('/* ---------------------------------------------------------------- field rows'), css.indexOf('/* ---------------------------------------------------------------- sections */'));
  const decl = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1];

  it('sets every width and spacing of the grid once on :root', () => {
    const root = /:root\s*\{([^}]*)\}/.exec(block)![1];
    for (const v of ['--label-w', '--label-w-2', '--field-trail', '--field-key', '--field-chain', '--field-gap', '--field-h', '--row-gap', '--group-gap']) expect(root).toContain(v + ':');
    // the old per-row label widths are gone
    expect(css).not.toMatch(/--label-w-(sm|xs)|--pair-channel|--ctl-min/);
  });

  it('is nine tracks: label, control, unit, key, chain, label, control, unit, key', () => {
    expect(decl('--cols-8')).toBe('var(--label-w) minmax(0, 1fr) var(--field-trail) var(--field-key) var(--field-chain) var(--label-w-2) minmax(0, 1fr) var(--field-trail)');
    expect(decl('--cols')).toBe('var(--cols-8) var(--field-key)');
    // the key slot goes with the field before it, so a panel with no keys (the node settings) has none
    expect(block).toMatch(/:is\(\.param-form, \.key-editor\)\s*\{\s*--field-key:\s*0px/);
  });

  it('hands the label, control and unit of a field the same tracks wherever the field is', () => {
    expect(block).toMatch(/\.field > \.field-label\s*\{\s*grid-column:\s*1;/);
    expect(block).toMatch(/\.field > :not\(\.field-label, \.field-trail, \.unit-toggle\)\s*\{\s*grid-column:\s*2 \/ -2;/);
    expect(block).toMatch(/\.field > \.field-trail\s*\{\s*grid-column:\s*-2 \/ -1;/);
    // a row of fields is the nine tracks, and its fields and keyed pairs are subgrids of them
    expect(block).toMatch(/grid-template-columns:\s*subgrid/);
    // the key diamond has its own slot, kept when it is not showing
    expect(block).toMatch(/\.keyed\s*\{[^}]*padding-right:\s*calc\(var\(--field-key\) \+ var\(--field-gap\)\)/);
    expect(block).toMatch(/\.keyed > \.key-btn\s*\{[^}]*width:\s*var\(--field-key\)/);
  });

  it('puts the second field of a pair in track six, and the chain in five, in every pair row', () => {
    const q = block.slice(block.indexOf('@container panel'));
    expect(q).toMatch(/@container panel \(min-width: \d+px\)/);
    // a plain field: 1-3 then 6-8 (a keyed one takes its key slot too: 1-4 then 6-9)
    expect(q).toMatch(/:is\(\.field:not\(\.check-field\)\)\s*\{\s*grid-column:\s*1 \/ 4;/);
    expect(q).toMatch(/:is\(\.field:not\(\.check-field\)\)\s*\{\s*grid-column:\s*6 \/ 9;/);
    expect(q).toMatch(/\{\s*grid-column:\s*1 \/ 5;/);
    expect(q).toMatch(/\{\s*grid-column:\s*6 \/ 10;/);
    expect(q).toMatch(/link-gap\)\s*\{[^}]*grid-column:\s*5;/);
    // checkboxes: under the first control, and under the second (two plain ones go side by side instead, see the flex line below)
    expect(q).toMatch(/\.check-field\)\s*\{\s*grid-column:\s*2 \/ 7;/);
    expect(q).toMatch(/\{\s*grid-column:\s*7 \/ -1;/);
    // only fields that fit half a row pair up
    expect(q).toContain(':not(:has(.select-field, .text-field, .unit-field, .color-field))');
  });

  it('starts a single checkbox under the controls and a button group at the left edge in equal cells', () => {
    expect(block).toMatch(/> \.check-field\s*\{\s*grid-column:\s*2 \/ -1;/);
    expect(block).toMatch(/> \.check-field\s*\{\s*padding-left:\s*calc\(var\(--label-w\) \+ var\(--field-gap\)\)/);
    expect(block).toMatch(/grid-template-columns:\s*repeat\(auto-fit, minmax\(\d+px, 1fr\)\)/);
  });

  it('has one height for the controls, one gap between lines and one between groups', () => {
    expect(block).toMatch(/:is\(input:not\(\[type='checkbox'\], \[type='color'\], \.alpha\), select\)\s*\{[^}]*height:\s*var\(--field-h\)/);
    expect(block).toMatch(/\.check-field\.field\s*\{[^}]*min-height:\s*var\(--field-h\)/);
    expect(block).toMatch(/row-gap:\s*var\(--row-gap\)/);
    expect(block).toMatch(/:is\(\.field-label\.block, \.q-sub\):not\(:first-child\)\s*\{\s*margin-top:\s*calc\(var\(--group-gap\) - var\(--row-gap\)\)/);
    expect(block).toMatch(/\.inspector \.section\s*\{\s*padding:\s*4px 12px 12px/);
  });

  it('has a line for a blend entry (timeline, value, remove button) of its own four tracks, with the dropdown taking what is left', () => {
    expect(block).toMatch(/\.row\.blend-entry\s*\{[^}]*grid-template-columns:\s*var\(--label-w\) minmax\(0, 1fr\) 56px var\(--field-h\)/);
    expect(block).toMatch(/\.row\.blend-entry > \.icon-btn\s*\{[^}]*grid-column:\s*4;[^}]*grid-row:\s*1;/);
    // the first box (the timeline) runs across the name and the room that is left, not the share of a pair
    expect(block).toMatch(/\.row\.blend-entry > \.field:first-child\s*\{\s*grid-column:\s*1 \/ 3;/);
    // a weight per timeline has its weight, a dropdown and a box, on a second line
    expect(block).toMatch(/\.row\.blend-entry\.direct > \.field:nth-child\(2\)\s*\{\s*grid-column:\s*2;\s*grid-row:\s*2;/);
    expect(readFileSync(`${__dirname}/../src/panels/Inspector.tsx`, 'utf8')).toContain("'blend-entry direct'");
  });

  it('puts two plain tick boxes side by side from the box edge, each as wide as its words, and drops the second to its own line when they do not fit', () => {
    const rule = /\.row:has\(> \.check-field:first-child\):has\(> \.check-field:nth-child\(2\)\):not\(:has\(> :nth-child\(3\)\)\)\s*\{([^}]*)\}/.exec(block)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/flex-wrap:\s*wrap/);
    expect(rule).toMatch(/padding-left:\s*calc\(var\(--label-w\) \+ var\(--field-gap\)\)/);
    expect(block).toMatch(/\.check-field\)? *\{[^}]*flex:\s*0 1 auto/);
  });

  it('says what a text box with a rule did not understand, quietly, starting under the box', () => {
    expect(block).toMatch(/\.inspector \.field-problem\s*\{[^}]*padding-left:\s*calc\(var\(--label-w\) \+ var\(--field-gap\)\)/);
  });

  it('keeps a block that is not a field (the picture quality slider) from wearing the field class', () => {
    expect(readFileSync(`${__dirname}/../src/panels/OptimiseOutput.tsx`, 'utf8')).not.toMatch(/className="field /);
  });

  it('gives dropdowns, text, number and colour boxes one height', () => {
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
