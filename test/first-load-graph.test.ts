import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// What the editor's first download is made of is whatever main.tsx reaches through static imports. The big, late-needed things
// (help topics, starter sets, the player's source as a string, CodeMirror, React Flow) are dynamic imports, and one careless
// `import` at the top of a file would pull any of them back in. This walks the static graph and says which file did it.

const SRC = resolve(__dirname, '../src');

const STATIC = [/\b(?:import|export)\s+(?!type\s)[^;'"]*?\sfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*['"]([^'"]+)['"]/g];

function resolveFile(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && /\.tsx?$/.test(c)) return c;
  return null;
}

/** Every file and package main.tsx reaches without a dynamic import, with the file that first imported it. */
function firstLoad(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [join(SRC, 'main.tsx')];
  seen.set(queue[0], 'entry');
  while (queue.length) {
    const file = queue.shift()!;
    const text = readFileSync(file, 'utf8');
    for (const re of STATIC) {
      for (const m of text.matchAll(re)) {
        const spec = m[m.length - 1];
        const via = relative(SRC, file);
        if (spec.startsWith('.')) {
          const next = resolveFile(file, spec);
          if (next && !seen.has(next)) {
            seen.set(next, via);
            queue.push(next);
          }
        } else if (!seen.has(spec)) seen.set(spec, via);
      }
    }
  }
  return seen;
}

describe('the first download', () => {
  const graph = firstLoad();
  const reached = (rel: string) => graph.get(join(SRC, rel));
  const files = (rel: string) => [...graph.keys()].filter((k) => k.startsWith(join(SRC, rel)));

  it('walks the real graph (a sanity check on the walk itself)', () => {
    expect(reached('App.tsx')).toBeDefined();
    expect(reached('Editor.tsx')).toBeDefined();
    expect(reached('store/store.ts')).toBeDefined();
    expect(graph.size).toBeGreaterThan(150);
  });

  it('leaves out the help topics and everything that reads them', () => {
    for (const f of ['help/topics.ts', 'help/tutorials.ts', 'help/HelpViews.tsx', 'help/search.ts', 'help/branded-help.ts']) expect(reached(f), `${f} is imported statically by ${reached(f)}`).toBeUndefined();
  });

  it('leaves out the starter sets (the pieces a starter is built from stay)', () => {
    expect(reached('lib/branded/index.ts'), `imported statically by ${reached('lib/branded/index.ts')}`).toBeUndefined();
    expect(files('lib/branded/sets'), 'a set file is imported statically').toEqual([]);
  });

  it('leaves out CodeMirror and its editors', () => {
    for (const f of ['components/CodeEditorImpl.tsx', 'panels/DataRawEditor.tsx', 'lib/code-theme.ts', 'lib/csv-lang.ts']) expect(reached(f), `${f} is imported statically by ${reached(f)}`).toBeUndefined();
    const cm = [...graph.keys()].filter((k) => k === 'codemirror' || k.startsWith('@codemirror/') || k.startsWith('@lezer/'));
    expect(cm).toEqual([]);
  });

  it('leaves out the interaction graph and React Flow', () => {
    for (const f of ['panels/LogicGraph.tsx', 'panels/GraphNoteNode.tsx']) expect(reached(f), `${f} is imported statically by ${reached(f)}`).toBeUndefined();
    expect([...graph.keys()].filter((k) => k.startsWith('@xyflow/'))).toEqual([]);
  });

  it("leaves out the player's own source as a string (Preview, Share and Export ask for it)", () => {
    expect([...graph.keys()].filter((k) => k.includes('player-iife'))).toEqual([]);
  });
});
