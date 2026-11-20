import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { useCodeThemeExtension } from '../lib/code-theme';

/**
 * The story script's colours: a speaker's name, choices, jumps, scene titles, cues in square brackets, values and tags in
 * curly brackets, if/else/set, and notes. Line by line; nothing carries from one line to the next.
 */
const storyParser: StreamParser<{ start: boolean }> = {
  startState: () => ({ start: true }),
  token(stream, st) {
    if (stream.sol()) st.start = true;
    if (st.start) {
      stream.eatSpace();
      st.start = false;
      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match(/^#.*/)) return 'heading';
      if (stream.match(/^->.*/)) return 'link';
      if (stream.match('?')) return 'operator';
      if (stream.match(/^(else\s+if|if|else|set)\b/)) return 'keyword';
      if (stream.match(/^\[[^\]]*\]\s*$/)) return 'meta';
      if (stream.match(/^>/)) return 'operator';
      if (stream.match(/^[\p{L}\p{N}][\p{L}\p{N}'’.\- ]{0,40}?(?=\s*(\([^()]*\))?\s*:\s)/u)) return 'typeName';
    }
    if (stream.match(/^\([^()]*\)(?=\s*:)/)) return 'attributeName';
    if (stream.match(/^\{[^{}]*\}/)) return 'variableName';
    if (stream.match(/^\[(if|once)[^\]]*\]/)) return 'meta';
    stream.next();
    return null;
  },
};
const story = StreamLanguage.define(storyParser);

const setErrorLines = StateEffect.define<number[]>();
const errorLine = Decoration.line({ class: 'cm-error-line' });

/** Lines (1-based) to mark as having a problem: a red band behind them. */
const errorLines = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setErrorLines)) continue;
      const b = new RangeSetBuilder<Decoration>();
      for (const n of [...new Set(e.value)].sort((x, y) => x - y)) if (n >= 1 && n <= tr.state.doc.lines) b.add(tr.state.doc.line(n).from, tr.state.doc.line(n).from, errorLine);
      deco = b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * CodeMirror 6 editor. Uncontrolled after mount: external `value` changes replace the doc only when they differ.
 * `glsl` uses the C-like highlighting of the JavaScript mode (comments, numbers, keywords like `if` and `for`), which is
 * close enough for shader code; `errorLines` marks lines (1-based) a compiler complained about.
 */
export function CodeEditor({ value, onChange, language = 'javascript', height = 240, errorLines: marked, onCursorLine, goToLine, label }: { value: string; onChange: (v: string) => void; language?: 'javascript' | 'html' | 'glsl' | 'story'; height?: number | string; errorLines?: number[]; onCursorLine?: (line: number) => void; goToLine?: { line: number; n: number } | null; label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const cursorRef = useRef(onCursorLine);
  cursorRef.current = onCursorLine;
  const colours = useCodeThemeExtension(view);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          language === 'html' ? html() : language === 'story' ? [story, EditorView.lineWrapping] : javascript(),
          ...(label ? [EditorView.contentAttributes.of({ 'aria-label': label })] : []),
          colours(),
          errorLines,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
            if ((u.selectionSet || u.docChanged) && cursorRef.current) cursorRef.current(u.state.doc.lineAt(u.state.selection.main.head).number);
          }),
          EditorView.theme({ '&': { height: typeof height === 'number' ? `${height}px` : height }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px' }, '.cm-error-line': { backgroundColor: 'rgba(224, 72, 72, 0.28)' } }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  //Somewhere else asked for a line (a problem in the list was clicked): the caret goes there and it scrolls into view
  useEffect(() => {
    const v = view.current;
    if (!v || !goToLine || goToLine.line < 1 || goToLine.line > v.state.doc.lines) return;
    const at = v.state.doc.line(goToLine.line).from;
    v.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    v.focus();
  }, [goToLine?.n]);

  const markKey = (marked ?? []).join(',');
  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLines.of(marked ?? []) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markKey, value, language]);

  return <div className="code-editor" ref={host} onKeyDown={(e) => e.stopPropagation()} />;
}
