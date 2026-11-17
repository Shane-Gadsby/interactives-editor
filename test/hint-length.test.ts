import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ts from 'typescript';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getTopic, topicBody } from '../src/help/topics';
import { slug } from '../src/help/markdown';
import { helpHistory } from '../src/help/Help';
import { SectionBlurb } from '../src/components/SectionBlurb';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The explainer under an Inspector section or field group is a line or two and a link into the help, not a paragraph.
 * This reads the panels' source (the text is often built from conditions, so it can't just render them all) and holds each
 * one to a character budget: about two lines of a side panel. Longer detail belongs in the help topic the link names.
 */
const BUDGET = 120;
const ROOT = join(__dirname, '..', 'src');
const SCAN = [join(ROOT, 'panels'), join(ROOT, 'components', 'ProjectModals.tsx'), join(ROOT, 'Home.tsx')];
// Status and warning messages that are not explainers, and so are not held to the budget. Keyed by file and the start of the text.
const EXCEPTIONS: Record<string, string> = {
  // says plainly what the guard cannot do, in the section itself (test/word-audio-own.test.tsx holds it to that)
  'panels/GuardSection.tsx: Keeps spell check, Grammarly and other w': 'honest limits',
  // the steps shown once Edit in Frameling has downloaded the file, a status after an action rather than an explainer
  'panels/AnimationInspector.tsx: is in your downloads. Open it in Frameli': 'round trip steps',
};

function walk(dir: string, out: string[] = []): string[] {
  if (dir.endsWith('.tsx')) return [...out, dir];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** The most text a node can show: JSX text and string pieces, the longest side of a condition. Values that are only known at run time count for nothing. */
function textOf(n: ts.Node | undefined): string {
  if (!n) return '';
  if (ts.isJsxText(n)) return n.text.replace(/\s+/g, ' ');
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => s.literal.text).join('');
  if (ts.isParenthesizedExpression(n) || ts.isJsxExpression(n)) return textOf(n.expression);
  if (ts.isConditionalExpression(n)) {
    const a = textOf(n.whenTrue);
    const b = textOf(n.whenFalse);
    return a.length >= b.length ? a : b;
  }
  if (ts.isBinaryExpression(n)) {
    const op = n.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return textOf(n.right);
    if (op === ts.SyntaxKind.PlusToken) return textOf(n.left) + textOf(n.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      const a = textOf(n.left);
      const b = textOf(n.right);
      return a.length >= b.length ? a : b;
    }
    return '';
  }
  if (ts.isJsxElement(n)) return n.children.map(textOf).join('');
  if (ts.isJsxFragment(n)) return n.children.map(textOf).join('');
  return '';
}
const measure = (n: ts.Node | undefined) => textOf(n).replace(/\s+/g, ' ').trim();

const attr = (el: ts.JsxOpeningLikeElement, name: string) => el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === name);
const classTokens = (el: ts.JsxOpeningLikeElement) => {
  const a = attr(el, 'className');
  const t = a?.initializer ? (ts.isStringLiteral(a.initializer) ? a.initializer.text : textOf(a.initializer)) : '';
  return t.split(/\s+/).filter(Boolean);
};
const EXPLAINER_TAGS = new Set(['p', 'div', 'span', 'li', 'small', 'ul']);
const NOTE_CLASSES = new Set(['hint', 'q-part-note', 'data-formview-note', 'cr-empty', 'sandbox-note']);

interface Found {
  file: string;
  line: number;
  kind: 'hint' | 'blurb';
  text: string;
  help: { topic: string; anchor?: string }[];
  named: boolean;
}

/** Every [topic, anchor] pair of string literals inside an expression (a condition can choose between two). */
function pairs(n: ts.Node, out: { topic: string; anchor?: string }[] = []) {
  if (ts.isArrayLiteralExpression(n) && n.elements.length && ts.isStringLiteral(n.elements[0])) {
    out.push({ topic: n.elements[0].text, anchor: n.elements[1] && ts.isStringLiteral(n.elements[1]) ? n.elements[1].text : undefined });
    return out;
  }
  ts.forEachChild(n, (c) => void pairs(c, out));
  return out;
}

function scan(): { found: Found[]; opens: { file: string; line: number; topic: string; anchor?: string }[] } {
  const found: Found[] = [];
  const opens: { file: string; line: number; topic: string; anchor?: string }[] = [];
  for (const dir of SCAN) {
    for (const f of walk(dir)) {
      if (/PrefsModal|ShortcutsModal/.test(f)) continue;
      //forward slashes so the EXCEPTIONS keys match on Windows too
      const file = relative(ROOT, f).split('\\').join('/');
      const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'openHelp' && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) {
          const a = n.arguments[1];
          opens.push({ file, line: lineOf(n), topic: n.arguments[0].text, anchor: a && ts.isStringLiteral(a) ? a.text : undefined });
        }
        if (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'SectionBlurb') {
          const text = attr(n, 'text')?.initializer;
          const help = attr(n, 'help')?.initializer;
          const name = attr(n, 'name')?.initializer;
          found.push({
            file,
            line: lineOf(n),
            kind: 'blurb',
            text: text ? (ts.isStringLiteral(text) ? text.text : measure(text)) : '',
            help: help ? pairs(help) : [],
            named: !!name && (!ts.isStringLiteral(name) || !!name.text),
          });
        } else if (ts.isJsxElement(n) && EXPLAINER_TAGS.has(n.openingElement.tagName.getText())) {
          const tokens = classTokens(n.openingElement);
          const note = tokens.some((t) => NOTE_CLASSES.has(t)) || (tokens.includes('muted') && tokens.includes('small'));
          if (note) found.push({ file, line: lineOf(n), kind: 'hint', text: measure(n), help: [], named: false });
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return { found, opens };
}

const anchorsOf = (id: string) => new Set([...topicBody(getTopic(id)!).matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));
const problem = (topic: string, anchor?: string): string | null => {
  if (!getTopic(topic)) return `no help topic "${topic}"`;
  if (anchor && !anchorsOf(topic).has(anchor)) return `topic "${topic}" has no heading #${anchor}`;
  return null;
};

const { found, opens } = scan();
const blurbs = found.filter((f) => f.kind === 'blurb');

describe('Inspector and side panel explainers stay short', () => {
  it('finds the explainers, so the checks below are not passing on nothing', () => {
    expect(blurbs.length).toBeGreaterThan(80);
    expect(found.filter((f) => f.kind === 'hint').length).toBeGreaterThan(50);
  });

  it(`holds every hint and note to ${BUDGET} characters unless it is listed as an exception`, () => {
    const long = found.filter((f) => f.text.length > BUDGET && !(`${f.file}: ${f.text.slice(0, 40)}` in EXCEPTIONS));
    expect(long.map((f) => `${f.file}:${f.line} (${f.text.length}) ${f.text.slice(0, 70)}`)).toEqual([]);
  });

  it('has no exception that no longer applies', () => {
    const live = new Set(found.filter((f) => f.text.length > BUDGET).map((f) => `${f.file}: ${f.text.slice(0, 40)}`));
    expect(Object.keys(EXCEPTIONS).filter((k) => !live.has(k))).toEqual([]);
  });

  it('gives every More about link a name and a real help topic and heading', () => {
    const bad: string[] = [];
    for (const b of blurbs) {
      const where = `${b.file}:${b.line}`;
      if (!b.named) bad.push(`${where} has no name`);
      for (const h of b.help) {
        const p = problem(h.topic, h.anchor);
        if (p) bad.push(`${where} ${p}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('points every openHelp call in the panels at a real topic and heading', () => {
    expect(opens.length).toBeGreaterThan(0);
    const bad = opens.map((o) => ({ o, p: problem(o.topic, o.anchor) })).filter((x) => x.p).map((x) => `${x.o.file}:${x.o.line} ${x.p}`);
    expect(bad).toEqual([]);
  });
});

describe('SectionBlurb', () => {
  it('says its line and opens the help at the anchor from a labelled link', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(SectionBlurb, { text: 'One short line.', name: 'Blends', help: ['blends', 'modes'] })));
    expect(host.textContent).toContain('One short line.');
    const link = host.querySelector('button.link-btn') as HTMLButtonElement;
    expect(link.textContent).toBe('More about Blends →');
    expect(link.getAttribute('aria-label')).toBe('More about Blends, in the help');
    await act(async () => link.click());
    expect(helpHistory.current).toMatchObject({ id: 'blends', anchor: 'modes' });
    await act(async () => root.unmount());
    host.remove();
  });

  it('has no link when it has nowhere to point', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(SectionBlurb, { text: 'Just a line.', name: 'x' })));
    expect(host.querySelector('button')).toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});
