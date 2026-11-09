import { lazyModule } from '../lib/lazy-module';

/** CodeMirror and its languages (about 500 kB) come in with the first code box to open, not with the editor's first screen. */
export const codeMirror = lazyModule(() => import('./CodeEditorImpl'));

type Props = { value: string; onChange: (v: string) => void; language?: 'javascript' | 'html' | 'glsl'; height?: number | string; errorLines?: number[] };

/**
 * The code box: CodeMirror once it is in. Until then (a moment, the first time) a read-only copy of the text in the same
 * space, so nothing jumps when the real one replaces it.
 */
export function CodeEditor(props: Props) {
  const m = codeMirror.use();
  if (m) return <m.CodeEditor {...props} />;
  const h = props.height ?? 240;
  return (
    <div className="code-editor code-editor-loading" style={{ height: typeof h === 'number' ? `${h}px` : h }} onKeyDown={(e) => e.stopPropagation()}>
      <pre aria-label="Code (the editor is loading)" tabIndex={0}>{props.value}</pre>
    </div>
  );
}
