import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface SectionTag {
  file: string;
  line: number;
  /** The literal text of title="..." when it is one, else null. */
  title: string | null;
  id: string | null;
  help: string | null;
  /** help={...} that is an expression rather than a string. */
  helpExpr: boolean;
  tag: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Every `<Section ...>` opening tag in the editor's source, with its literal props (braces are tracked so `actions={<X />}` doesn't end the tag early). */
export function sectionTags(): SectionTag[] {
  const found: SectionTag[] = [];
  for (const file of walk(join(__dirname, '../../src'))) {
    const s = readFileSync(file, 'utf8');
    for (const m of s.matchAll(/<Section\b/g)) {
      let depth = 0;
      let j = m.index! + m[0].length;
      for (; j < s.length; j++) {
        const c = s[j];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) break;
      }
      const tag = s.slice(m.index!, j + 1);
      found.push({
        file: file.replace(/.*\/src\//, 'src/'),
        line: s.slice(0, m.index).split('\n').length,
        title: /\btitle="([^"]*)"/.exec(tag)?.[1] ?? null,
        id: /\sid="([^"]*)"/.exec(tag)?.[1] ?? null,
        help: /\shelp="([^"]*)"/.exec(tag)?.[1] ?? null,
        helpExpr: /\shelp=\{/.test(tag),
        tag,
      });
    }
  }
  return found;
}
