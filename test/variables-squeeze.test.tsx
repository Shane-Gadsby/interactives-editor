//A wide list table or a long textarea in the Variables tab must not squeeze the Name and Type columns.
//jsdom has no layout, so this checks the structure and the CSS rules that do the work.
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { VariablesPanel } from '../src/panels/ScriptsVariables';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
//every declaration block whose selector list includes this selector
const blocks = (sel: string) => {
  const out: string[] = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) if (m[1].split(',').some((s) => s.trim() === sel)) out.push(m[2]);
  return out.join('\n');
};

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = null;
});

describe('Variables tab layout', () => {
  it('uses a fixed layout so a wide value cannot widen the table, and the value cell scrolls on its own', () => {
    const p = createProject('T');
    p.variables.push({ id: 'vl', name: 'words', type: 'list', initial: JSON.stringify([{ word: 'x'.repeat(200) }]) });
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<VariablesPanel />));
    const table = host.querySelector('table.var-table')!;
    expect(table.classList.contains('var-main')).toBe(true);
    expect(table.querySelectorAll('tbody > tr')[0].children).toHaveLength(4);

    expect(blocks('.var-main')).toMatch(/table-layout:\s*fixed/);
    expect(blocks('.var-main')).toMatch(/min-width:\s*\d+px/);
    expect(blocks('.var-main th:nth-child(1)')).toMatch(/width:\s*\d+px/);
    expect(blocks('.var-main th:nth-child(2)')).toMatch(/width:\s*\d+px/);
    const value = blocks('.var-main td:nth-child(3)');
    expect(value).toMatch(/overflow-x:\s*auto/);
    expect(value).toMatch(/min-width:\s*0/);
    expect(blocks('.var-main td:nth-child(3) textarea')).toMatch(/max-width:\s*100%/);
  });
});
