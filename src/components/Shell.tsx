/**
 * The editor's frames with nothing in them: what shows while a project opens. index.html carries the same markup as plain
 * html (test/shell.test.tsx keeps the two the same), so the first paint and this are one thing and nothing jumps between them.
 */
export function Shell({ label = 'Opening project…', plain = false }: { label?: string; plain?: boolean }) {
  return (
    <div className={plain ? 'ix-shell ix-plain' : 'ix-shell'} role="status" aria-label="Loading Interactives">
      <div className="ix-shell-top">Interactives</div>
      <div className="ix-shell-tools" />
      <div className="ix-shell-left" />
      <div className="ix-shell-stage">
        <p>{label}</p>
      </div>
      <div className="ix-shell-right" />
      <div className="ix-shell-bottom" />
    </div>
  );
}
