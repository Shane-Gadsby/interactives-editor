import { useEffect, useRef, useState } from 'react';
import { cellFromText, cellText, cellTypeOf, gridOps, retypeScalar, type CellType, type Grid } from '../lib/data-edit';

const PAGE = 100;

/**
 * A table of a data file's rows, edited in place. One cell holds the cursor (a roving tab stop, so Tab passes through the
 * whole table in one go): arrow keys move between cells (left and right only at the ends of the text), Enter commits and
 * goes down, Escape puts the cell back. The buttons above work on the cell the cursor is in. Rows are shown a page at a time
 * so a long file stays quick; the Raw view has no such limit.
 */
export function DataTable({ grid, onChange, readOnly, label, onProblem }: { grid: Grid; onChange: (g: Grid) => void; readOnly?: boolean; label: string; onProblem?: (message: string | null) => void }) {
  // The cursor: row -1 is the header
  const [cur, setCur] = useState({ r: 0, c: 0 });
  const [page, setPage] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const focusNext = useRef<{ r: number; c: number } | null>(null);

  const pages = Math.max(1, Math.ceil(grid.rows.length / PAGE));
  const shownPage = Math.min(page, pages - 1);
  const from = shownPage * PAGE;
  const to = Math.min(grid.rows.length, from + PAGE);
  const row = Math.min(Math.max(cur.r, -1), grid.rows.length - 1);
  const col = Math.min(Math.max(cur.c, 0), Math.max(grid.columns.length - 1, 0));

  useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    root.current?.querySelector<HTMLInputElement>(`[data-cell="${want.r},${want.c}"]`)?.focus();
  });

  const go = (r: number, c: number) => {
    const rr = Math.min(Math.max(r, -1), grid.rows.length - 1);
    const cc = Math.min(Math.max(c, 0), Math.max(grid.columns.length - 1, 0));
    if (rr >= 0) setPage(Math.floor(rr / PAGE));
    setCur({ r: rr, c: cc });
    focusNext.current = { r: rr, c: cc };
  };

  const change = (g: Grid, at?: { r: number; c: number }) => {
    onChange(g);
    if (at) go(at.r, at.c);
  };

  const rename = (c: number, name: string) => {
    if (grid.typed && name === '') return onProblem?.('A column needs a name.');
    if (grid.typed && grid.columns.some((x, i) => i !== c && x === name)) return onProblem?.(`Another column is already called “${name}”.`);
    onProblem?.(null);
    if (name !== grid.columns[c]) onChange(gridOps.renameColumn(grid, c, name));
  };

  const empty = !grid.columns.length;
  const types: { value: CellType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'yesno', label: 'Yes / no' },
    { value: 'empty', label: 'Empty' },
  ];
  const here = row >= 0 ? grid.rows[row]?.[col] : undefined;

  return (
    <div className="data-grid-wrap" ref={root}>
      {!readOnly && (
        <div className="data-grid-bar" role="toolbar" aria-label={`${label}: change rows and columns`}>
          <span className="data-grid-group" role="group" aria-label="Row">
            <span className="muted small">Row</span>
            <button className="btn small" title="Add a blank row below the one you are in" onClick={() => change(gridOps.addRow(grid, row), { r: row + 1, c: col })} disabled={empty}>
              Add
            </button>
            <button className="btn small" title="Copy the row you are in, just below it" onClick={() => change(gridOps.duplicateRow(grid, row), { r: row + 1, c: col })} disabled={row < 0}>
              Copy
            </button>
            <button className="btn small" title="Delete the row you are in" onClick={() => change(gridOps.deleteRow(grid, row), { r: Math.min(row, grid.rows.length - 2), c: col })} disabled={row < 0}>
              Delete
            </button>
            <button className="btn small" aria-label="Move row up" title="Move the row you are in up" onClick={() => change(gridOps.moveRow(grid, row, row - 1), { r: row - 1, c: col })} disabled={row <= 0}>
              Up
            </button>
            <button className="btn small" aria-label="Move row down" title="Move the row you are in down" onClick={() => change(gridOps.moveRow(grid, row, row + 1), { r: row + 1, c: col })} disabled={row < 0 || row >= grid.rows.length - 1}>
              Down
            </button>
          </span>
          <span className="data-grid-group" role="group" aria-label="Column">
            <span className="muted small">Column</span>
            <button className="btn small" title="Add a column after the one you are in" onClick={() => change(gridOps.addColumn(grid, empty ? -1 : col), { r: row, c: col + 1 })}>
              Add
            </button>
            <button className="btn small" title="Delete the column you are in, with everything in it" onClick={() => change(gridOps.deleteColumn(grid, col), { r: row, c: Math.min(col, grid.columns.length - 2) })} disabled={empty}>
              Delete
            </button>
            <button className="btn small" aria-label="Move column left" title="Move the column you are in to the left" onClick={() => change(gridOps.moveColumn(grid, col, col - 1), { r: row, c: col - 1 })} disabled={empty || col <= 0}>
              Left
            </button>
            <button className="btn small" aria-label="Move column right" title="Move the column you are in to the right" onClick={() => change(gridOps.moveColumn(grid, col, col + 1), { r: row, c: col + 1 })} disabled={empty || col >= grid.columns.length - 1}>
              Right
            </button>
          </span>
          {grid.typed && (
            <label className="data-grid-group" title="What the cell you are in holds. A number or yes/no is written without quotes, so expressions can count and compare with it">
              <span className="muted small">Cell holds</span>
              <select
                value={row >= 0 && here !== undefined ? cellTypeOf(here) : 'text'}
                disabled={row < 0 || empty}
                onChange={(e) => change(gridOps.setCell(grid, row, col, retypeScalar(here, e.target.value as CellType)))}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {empty ? (
        <p className="hint">This file has no columns yet.{!readOnly && ' Use Column, Add to start one.'}</p>
      ) : (
        <div className="data-grid-scroll">
          <table className="data-table data-grid" role="grid" aria-label={label} aria-rowcount={grid.rows.length + 1} aria-colcount={grid.columns.length + 1}>
            <thead>
              <tr role="row">
                <th scope="col" title="Row number, counting from 0 like expressions do: data[0] is the first row" className="data-grid-num">
                  #
                </th>
                {grid.columns.map((c, i) => (
                  <th key={i} scope="col" role="columnheader">
                    <Box
                      value={c}
                      cell="-1"
                      c={i}
                      tab={row === -1 && col === i}
                      readOnly={readOnly}
                      label={`Column ${i + 1} name`}
                      placeholder={`col${i + 1}`}
                      header
                      onFocus={() => setCur({ r: -1, c: i })}
                      onCommit={(v) => rename(i, v)}
                      onMove={(dr, dc) => go(-1 + dr, i + dc)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.slice(from, to).map((cells, k) => {
                const r = from + k;
                return (
                  <tr key={r} role="row" aria-rowindex={r + 2} className={r === row ? 'on' : undefined}>
                    <th scope="row" className="data-grid-num muted">
                      {r}
                    </th>
                    {grid.columns.map((name, c) => {
                      const v = cells[c];
                      return (
                        <td key={c} role="gridcell" aria-colindex={c + 2}>
                          <Box
                            value={cellText(v)}
                            cell={String(r)}
                            c={c}
                            tab={row === r && col === c}
                            readOnly={readOnly}
                            label={`${name || `column ${c + 1}`}, row ${r}`}
                            placeholder={v === null ? 'empty' : v === undefined ? 'not set' : ''}
                            kind={grid.typed ? cellTypeOf(v) : undefined}
                            onFocus={() => setCur({ r, c })}
                            onCommit={(text) => {
                              const next = cellFromText(text, v, grid.typed);
                              if (next !== v) onChange(gridOps.setCell(grid, r, c, next));
                            }}
                            onMove={(dr, dc) => go(r + dr, c + dc)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="data-grid-pager" role="group" aria-label="Pages of rows">
          <button className="btn small" disabled={shownPage === 0} onClick={() => go(from - PAGE, col)}>
            Previous {PAGE}
          </button>
          <span className="muted small" aria-live="polite">
            Rows {from}–{to - 1} of {grid.rows.length}
          </span>
          <button className="btn small" disabled={shownPage >= pages - 1} onClick={() => go(from + PAGE, col)}>
            Next {PAGE}
          </button>
        </div>
      )}
      {!empty && !grid.rows.length && <p className="hint">No rows yet.{!readOnly && ' Use Row, Add to start one.'}</p>}
    </div>
  );
}

/** One cell's text box. It keeps what is typed until Enter, Tab or leaving it, then hands it over. */
export function Box({ value, cell, c, tab, readOnly, label, placeholder, kind, header, onFocus, onCommit, onMove }: { value: string; cell: string; c: number; tab: boolean; readOnly?: boolean; label: string; placeholder?: string; kind?: CellType; header?: boolean; onFocus: () => void; onCommit: (v: string) => void; onMove: (dr: number, dc: number) => void }) {
  const [text, setText] = useState(value);
  // Typed in and not handed over yet. While it isn't, the box follows its value (a row inserted above moves this one's cell along)
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setText(value);
  }, [value]);
  // A cell with line breaks in it needs a box that can hold them: Enter adds one there, Ctrl+Enter commits
  const multiline = value.includes('\n') || text.includes('\n');
  const props = {
    className: `data-cell${header ? ' head' : ''}${kind && kind !== 'text' ? ` ${kind}` : ''}${multiline ? ' multi' : ''}`,
    'data-cell': `${cell},${c}`,
    value: text,
    readOnly,
    placeholder,
    'aria-label': label,
    tabIndex: tab ? 0 : -1,
    spellCheck: false,
    onFocus,
    onBlur: () => {
      if (!readOnly && dirty.current && text !== value) onCommit(text);
      dirty.current = false;
      setText(value);
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true;
      setText(e.target.value);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // The editor's own shortcuts (Delete, Ctrl+Z, arrows that nudge layers) are not for a text box
      e.stopPropagation();
      const el = e.currentTarget;
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
      const go = (dr: number, dc: number) => {
        e.preventDefault();
        if (!readOnly && dirty.current && text !== value) onCommit(text);
        dirty.current = false;
        onMove(dr, dc);
      };
      if (e.key === 'Escape') {
        dirty.current = false;
        setText(value);
        e.preventDefault();
      } else if (multiline) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(1, 0);
      } else if (e.key === 'Enter') go(e.shiftKey ? -1 : 1, 0);
      else if (e.key === 'ArrowDown') go(1, 0);
      else if (e.key === 'ArrowUp') go(-1, 0);
      else if (e.key === 'ArrowLeft' && atStart) go(0, -1);
      else if (e.key === 'ArrowRight' && atEnd) go(0, 1);
    },
  };
  return multiline ? <textarea {...props} rows={Math.min(6, text.split('\n').length)} /> : <input {...props} />;
}
