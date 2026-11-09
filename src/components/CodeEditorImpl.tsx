import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, keymap, type DecorationSet } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { useCodeThemeExtension } from '../lib/code-theme';

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
export function CodeEditor({ value, onChange, language = 'javascript', height = 240, errorLines: marked }: { value: string; onChange: (v: string) => void; language?: 'javascript' | 'html' | 'glsl'; height?: number | string; errorLines?: number[] }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const colours = useCodeThemeExtension(view);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          language === 'html' ? html() : javascript(),
          colours(),
          errorLines,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
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

  const markKey = (marked ?? []).join(',');
  useEffect(() => {
    view.current?.dispatch({ effects: setErrorLines.of(marked ?? []) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markKey, value, language]);

  return <div className="code-editor" ref={host} onKeyDown={(e) => e.stopPropagation()} />;
}
