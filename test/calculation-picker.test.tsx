import { afterEach, describe, expect, it } from 'vitest';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ExprField } from '../src/components/ExprField';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let committed: string[] = [];

function Harness({ start = '', calc = true }: { start?: string; calc?: boolean }) {
  const [v, setV] = useState(start);
  return (
    <ExprField
      label="Value"
      value={v}
      calc={calc}
      commitOnBlur
      onChange={(x) => {
        committed.push(x);
        setV(x);
      }}
    />
  );
}

function mount(props: React.ComponentProps<typeof Harness> = {}) {
  const p = createProject('T');
  p.variables.push(
    { id: 'v1', name: 'score', type: 'number', initial: 7 },
    { id: 'v2', name: 'total', type: 'number', initial: 20 },
    { id: 'v3', name: 'cards', type: 'list', initial: '[{"s":"up","n":1},{"s":"down","n":2},{"s":"up","n":3}]' },
  );
  setCurrentStore(new EditorStore(p));
  committed = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Harness {...props} />));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setCurrentStore(null);
});

const q = (sel: string) => host.querySelector<HTMLElement>(sel)!;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text)!;
const pick = (label: string, value: string) =>
  act(() => {
    const el = q(`select[aria-label="${label}"]`) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
const typeInto = (label: string, text: string) =>
  act(() => {
    const el = q(`input[aria-label="${label}"]`) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const wait = () => act(async () => void (await new Promise((r) => setTimeout(r, 260))));
const open = () => act(() => void button('Pick a calculation').click());
const written = () => q('.calc-formula code')?.textContent;
const kind = () => (q('select[aria-label="Which calculation"]') as HTMLSelectElement).value;

describe('Pick a calculation', () => {
  it('is only on a field that asks for it', () => {
    mount({ calc: false });
    expect(host.querySelector('.calc-open')).toBeNull();
  });

  it('starts closed and writes nothing until Use this calculation is pressed', () => {
    mount({ start: 'score * 3' });
    expect(host.querySelector('.calc')).toBeNull();
    open();
    expect(host.querySelector('.calc')).not.toBeNull();
    //a formula it can read opens already filled in
    expect(kind()).toBe('multiply');
    expect(written()).toBe('score * 3');
    act(() => void button('Cancel').click());
    expect(host.querySelector('.calc')).toBeNull();
    expect(committed).toEqual([]);
  });

  it('adds two values: choosing a calculation starts from the first number, and Use writes it', async () => {
    mount();
    open();
    expect(kind()).toBe('');
    pick('Which calculation', 'add');
    expect(written()).toBe('score + 1');
    typeInto('Second value: the number', '5');
    expect(written()).toBe('score + 5');
    await wait();
    expect(host.querySelector('.calc .expr-status.ok')!.textContent).toContain('12');
    act(() => void button('Use this calculation').click());
    expect(committed).toEqual(['score + 5']);
    expect(host.querySelector('.calc')).toBeNull();
    expect((q('input') as HTMLInputElement).value).toBe('score + 5');
  });

  it('how many items match: the list, the field it offers from the first item, how to compare', async () => {
    mount();
    open();
    pick('Which calculation', 'count');
    expect(written()).toBe('count(cards)');
    pick('Which items to count', 'some');
    expect(written()).toBe('count(cards, "")');
    expect([...host.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['s', 'n']);
    typeInto('Where the field', 's');
    typeInto('Compared with: the text', 'up');
    expect(written()).toBe('count(cards, "s", "up")');
    await wait();
    expect(host.querySelector('.calc .expr-status.ok')!.textContent).toContain('2');
    pick('How to compare the field', '!=');
    expect(written()).toBe('count(cards, "s", "!=", "up")');
  });

  it('an existing count reads back into the pickers', () => {
    mount({ start: 'count(cards, "n", ">=", 2)' });
    open();
    expect(kind()).toBe('count');
    expect((q('select[aria-label="Which items to count"]') as HTMLSelectElement).value).toBe('some');
    expect((q('input[aria-label="Where the field"]') as HTMLInputElement).value).toBe('n');
    expect((q('select[aria-label="How to compare the field"]') as HTMLSelectElement).value).toBe('>=');
    expect((q('input[aria-label="Compared with: the number"]') as HTMLInputElement).value).toBe('2');
  });

  it('a formula it cannot read stays as it is, and says so', () => {
    const text = 'cards.filter(c => c.s == "up").length';
    mount({ start: text });
    open();
    expect(kind()).toBe('');
    expect(host.querySelector('.calc .hint')!.textContent).toContain('more than the pickers can show');
    expect(button('Use this calculation').disabled).toBe(true);
    act(() => void button('Cancel').click());
    expect(committed).toEqual([]);
    expect((q('input') as HTMLInputElement).value).toBe(text);
  });

  it('percentage and round', () => {
    mount();
    open();
    pick('Which calculation', 'percent');
    expect(written()).toBe('10 > 0 ? Math.round(score / 10 * 100) : 0');
    act(() => void button('Use this calculation').click());
    expect(committed.at(-1)).toBe('10 > 0 ? Math.round(score / 10 * 100) : 0');
    open();
    expect(kind()).toBe('percent');
    pick('Which calculation', 'round');
    typeInto('Decimal places to round to', '2');
    expect(written()).toBe('Math.round(score * 100) / 100');
  });

  it('this if that otherwise the other uses the condition pickers, and join text takes pieces', () => {
    mount();
    open();
    pick('Which calculation', 'ifelse');
    expect(host.querySelector('.calc .cond-none')!.textContent).toContain('Pick the condition');
    expect(button('Use this calculation').disabled).toBe(true);
    act(() => void button('+ Add a condition').click());
    expect(written()).toMatch(/^.+ \? "" : ""$/);
    expect(button('Use this calculation').disabled).toBe(false);
    act(() => void button('Cancel').click());
    open();
    pick('Which calculation', 'join');
    expect(written()).toBe('`Score: ${score}`');
    act(() => void button('+ Text').click());
    typeInto('Piece 3: the text', ' points');
    expect(written()).toBe('`Score: ${score} points`');
    act(() => void q('button[aria-label="Remove piece 1"]').click());
    expect(written()).toBe('`${score} points`');
  });
});
