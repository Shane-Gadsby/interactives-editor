import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// The editor and the player never call the browser's own alert/confirm/prompt: everything goes through
// src/components/dialogs.tsx (confirmDialog, promptDialog, alertDialog). beforeunload's native prompt can't be
// replaced and is not a call, so it doesn't show up here.
const roots = [join(__dirname, '../src'), join(__dirname, '../../interactives-player/src'), join(__dirname, '../shared'), join(__dirname, '../mcp')];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    if (f === 'dist' || f === 'node_modules') return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mjs|js)$/.test(f) ? [p] : [];
  });

const NATIVE = /(?:\b(?:window|globalThis|self|top|parent)\s*\.\s*(?:alert|confirm|prompt)\s*\(|(?<![\w.$'"`])(?:alert|confirm|prompt)\s*\()/;

describe('no browser dialogs', () => {
  it('has no window.alert, confirm or prompt calls in the editor, player, shared ops or MCP server', () => {
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of files(root)) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
            if (NATIVE.test(code) && !/^\s*(\*|\/\*)/.test(line)) hits.push(`${file}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it('the matcher itself catches the forms it is meant to', () => {
    for (const bad of ['window.confirm("x")', 'if (confirm("x")) go()', 'const n = prompt("name")', 'globalThis.alert(1)', 'alert ("hi")']) expect(NATIVE.test(bad), bad).toBe(true);
    for (const ok of ['await confirmDialog({})', 'promptDialog({})', 'alertDialog({})', 'x.confirm()', 'const confirmed = 1', 'form.prompt(1)']) expect(NATIVE.test(ok), ok).toBe(false);
  });
});
