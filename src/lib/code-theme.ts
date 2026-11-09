import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { tags as t } from '@lezer/highlight';
import { usePrefs, type Prefs } from './prefs';

/**
 * The colours of every code editor (Scripts, the Data tab's raw text, the Inspector's code boxes). One per-person
 * preference, `codeTheme`: follow the editor's own light/dark theme (the default), or stay light or dark whatever it is.
 * Each editor keeps the theme in a Compartment, so a change reaches open editors without rebuilding them.
 */
export type CodeTheme = 'follow' | 'light' | 'dark';

export const CODE_THEMES: { value: CodeTheme; label: string; tip: string }[] = [
  { value: 'follow', label: 'Follow the editor', tip: 'Code is drawn light when the editor is light and dark when the editor is dark, and switches with it' },
  { value: 'light', label: 'Light', tip: 'Dark code on a light page, whatever the editor looks like' },
  { value: 'dark', label: 'Dark', tip: 'Light code on a dark page, whatever the editor looks like' },
];

/** The light palette. The page and gutter are the toolbox greys; every colour below is at least 4.5:1 on all of the backgrounds (test/code-theme.test.ts checks it). */
export const LIGHT = {
  page: '#fefefe',
  gutter: '#f4f4f4',
  activeLine: '#f1f1f1',
  selection: '#f6e6ac',
  text: '#333333',
  muted: '#595959',
  keyword: '#7a2fa8',
  string: '#0b6a3a',
  number: '#9a4a00',
  atom: '#9a4a00',
  comment: '#505a64',
  fn: '#0a58a8',
  type: '#8a3d00',
  property: '#1b5f8c',
  variable: '#333333',
  operator: '#45515c',
  punctuation: '#4a5560',
  tag: '#a02424',
  attribute: '#8a3d00',
  regexp: '#0a6666',
  link: '#0a58a8',
  invalid: '#b00020',
};

const lightHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: LIGHT.keyword },
  { tag: [t.string, t.special(t.string), t.character], color: LIGHT.string },
  { tag: [t.number, t.integer, t.float], color: LIGHT.number },
  { tag: [t.bool, t.null, t.atom, t.self], color: LIGHT.atom },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: LIGHT.comment, fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: LIGHT.fn },
  { tag: [t.typeName, t.className, t.namespace, t.macroName], color: LIGHT.type },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: LIGHT.property },
  { tag: [t.variableName, t.name], color: LIGHT.variable },
  { tag: [t.definition(t.variableName), t.standard(t.variableName)], color: LIGHT.fn },
  { tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.updateOperator, t.derefOperator], color: LIGHT.operator },
  { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket, t.squareBracket, t.paren, t.brace], color: LIGHT.punctuation },
  { tag: [t.tagName], color: LIGHT.tag },
  { tag: [t.attributeName], color: LIGHT.attribute },
  { tag: [t.regexp, t.escape], color: LIGHT.regexp },
  { tag: [t.link, t.url], color: LIGHT.link, textDecoration: 'underline' },
  { tag: [t.meta, t.processingInstruction, t.documentMeta], color: LIGHT.muted },
  { tag: t.heading, fontWeight: 'bold', color: LIGHT.fn },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.invalid, color: LIGHT.invalid },
]);

const lightTheme = EditorView.theme(
  {
    '&': { color: LIGHT.text, backgroundColor: LIGHT.page },
    '.cm-content': { caretColor: LIGHT.text },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: LIGHT.text },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: LIGHT.selection },
    '.cm-activeLine': { backgroundColor: LIGHT.activeLine },
    '.cm-gutters': { backgroundColor: LIGHT.gutter, color: LIGHT.muted, border: 'none', borderRight: '1px solid #dfdfdf' },
    '.cm-activeLineGutter': { backgroundColor: '#e8e8e8', color: LIGHT.text },
    '.cm-foldPlaceholder': { backgroundColor: '#e8e8e8', color: LIGHT.muted, border: 'none' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: LIGHT.selection, outline: 'none' },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: '#f6d5d5' },
    '.cm-searchMatch': { backgroundColor: '#fbe9a8', outline: '1px solid #c9a227' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#f3dd91' },
    '.cm-panels': { backgroundColor: LIGHT.gutter, color: LIGHT.text },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #dfdfdf' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #dfdfdf' },
    '.cm-tooltip': { backgroundColor: LIGHT.page, color: LIGHT.text, border: '1px solid #c8c8c8' },
  },
  { dark: false },
);

/** oneDark's cursor, find matches and matching brackets are blue; the editor's chosen things are gold, so those are put right. The token colours stay as they are. */
const darkGold = EditorView.theme(
  {
    '.cm-content': { caretColor: '#ffb448' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#ffb448' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#4d3a17' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: '#ffb44840', outline: 'none' },
    '.cm-searchMatch': { backgroundColor: '#ffb44840', outline: '1px solid #ffb448' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#ffb44880' },
  },
  { dark: true },
);

/** What an editor gets for the colours: the light theme, or oneDark (a theme and its highlight style together) with the gold touches. */
export function codeThemeExtension(dark: boolean): Extension {
  return dark ? [oneDark, darkGold] : [lightTheme, syntaxHighlighting(lightHighlight)];
}

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** True while the system asks for a light scheme (what the editor's Auto theme follows; it is dark otherwise). */
function systemLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
}
function subscribeSystem(f: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener?.('change', f);
  return () => mq.removeEventListener?.('change', f);
}

/** Is the editor itself drawn dark right now? Preferences > Theme, with Auto resolved against the system. */
export function editorIsDark(p: Pick<Prefs, 'theme'>, light: boolean = systemLight()): boolean {
  return p.theme === 'dark' || (p.theme === 'auto' && !light);
}

/** Are code editors drawn dark right now? The Code editor colours choice, with Follow the editor resolved against the editor's theme. */
export function codeIsDark(p: Pick<Prefs, 'theme' | 'codeTheme'>, light: boolean = systemLight()): boolean {
  return p.codeTheme === 'dark' || (p.codeTheme !== 'light' && editorIsDark(p, light));
}

/** Live: re-renders when the preference, the editor theme or (for Auto) the system scheme changes. */
export function useCodeIsDark(): boolean {
  const p = usePrefs();
  const light = useSyncExternalStore(subscribeSystem, systemLight, () => false);
  return codeIsDark(p, light);
}

/**
 * For a CodeMirror editor: call it before the effect that builds the view, put what it returns (call it) in the extensions,
 * and the colours then follow the preference live without the view being rebuilt.
 */
export function useCodeThemeExtension(view: RefObject<EditorView | null>): () => Extension {
  const dark = useCodeIsDark();
  const compartment = useRef(new Compartment());
  const darkNow = useRef(dark);
  darkNow.current = dark;
  useEffect(() => {
    view.current?.dispatch({ effects: compartment.current.reconfigure(codeThemeExtension(dark)) });
  }, [dark, view]);
  return useCallback(() => compartment.current.of(codeThemeExtension(darkNow.current)), []);
}
