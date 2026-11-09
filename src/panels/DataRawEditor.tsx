import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { useCodeThemeExtension } from '../lib/code-theme';
import type { DataKind } from 'interactives-player';
import { csvLanguage, tsvLanguage } from '../lib/csv-lang';
import type { Problem } from '../lib/data-edit';

/**
 * The file's own text in CodeMirror, highlighted for its format (JSON, CSV and TSV have it; plain text is as is) with the
 * problems marked on their lines. Uncontrolled after mount, like the Scripts editor: a `value` that differs from what is
 * typed (an undo, someone else's edit, the table view) replaces the text. `jump` moves the cursor to an offset when its
 * `n` changes. Keys stay in the editor, so the editor's own shortcuts don't fire while someone types here.
 */
export function DataRawEditor({ value, kind, readOnly, problems, onChange, jump, label }: { value: string; kind: DataKind; readOnly?: boolean; problems: Problem[]; onChange: (v: string) => void; jump?: { offset: number; n: number }; label: string }) {
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
          kind === 'json' ? json() : kind === 'csv' ? csvLanguage : kind === 'tsv' ? tsvLanguage : [],
          colours(),
          lintGutter(),
          EditorState.readOnly.of(!!readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label, ...(readOnly ? { 'aria-readonly': 'true' } : {}) }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changeRef.current(u.state.doc.toString());
          }),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px' },
            // A mistake is a solid band and an underline, not the thin squiggle, so it can be seen at a glance
            '.cm-lintRange-error': { backgroundImage: 'none', backgroundColor: 'rgba(244, 67, 54, 0.35)', borderBottom: '2px solid #f44336' },
            '.cm-lintRange-warning': { backgroundImage: 'none', backgroundColor: 'rgba(255, 180, 72, 0.3)', borderBottom: '2px solid #ffb448' },
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, readOnly]);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  const key = problems.map((p) => `${p.offset}:${p.severity}:${p.message}`).join('|');
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const len = v.state.doc.length;
    const list: Diagnostic[] = problems.map((p) => {
      const from = Math.min(p.offset, len);
      // Mark the token at the spot, or the rest of its line when it sits at a line break
      const line = v.state.doc.lineAt(from);
      const to = Math.max(from + 1 <= line.to ? from + 1 : line.to, from);
      return { from: Math.min(from, line.to), to: Math.min(Math.max(to, from), len), severity: p.severity, message: p.message };
    });
    v.dispatch(setDiagnostics(v.state, list));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, readOnly, value]);

  useEffect(() => {
    const v = view.current;
    if (!v || !jump) return;
    const at = Math.min(jump.offset, v.state.doc.length);
    v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    v.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n]);

  return <div className="data-raw-editor" ref={host} onKeyDown={(e) => e.stopPropagation()} />;
}
