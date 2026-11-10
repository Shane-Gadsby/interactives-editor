import { useRef, useState } from 'react';
import { DataTable } from '../panels/DataTable';
import { gridToListText, listToGrid, parseList } from '../lib/list-table';
import { TextField } from './ui';

/**
 * A list's items as a table (a row per item, a column per field), with a switch to the JSON text underneath for people who
 * want it. Plain lists of text or numbers are a one-column table. Both views read and write the one text, so nothing is lost
 * going between them; a list with items inside items has no table, only the text.
 */
export function ListTable({ value, onChange, label, jsonTitle, placeholder }: { value: string; onChange: (text: string) => void; label: string; jsonTitle?: string; placeholder?: string }) {
  const [view, setView] = useState<'table' | 'json'>('table');
  const [note, setNote] = useState<string | null>(null);
  //The columns the list had when it last had rows, so emptying it out does not forget them
  const columns = useRef<string[]>([]);
  const lg = listToGrid(value, columns.current);
  if (lg && lg.grid.rows.length) columns.current = lg.grid.columns;
  const showing = view === 'table' && lg ? 'table' : 'json';
  const broken = !!value.trim() && !parseList(value);
  return (
    <div className="list-table">
      <div className="seg" role="group" aria-label={`How to show ${label}`}>
        <button
          type="button"
          className={`seg-btn${showing === 'table' ? ' on' : ''}`}
          aria-pressed={showing === 'table'}
          disabled={!lg}
          title={lg ? 'Edit the items as a table: a row for each, a column for each field' : broken ? 'Fix the JSON text first. A table needs a list that parses' : 'These items hold lists or groups of their own, so only the JSON text can show them'}
          onClick={() => setView('table')}
        >
          Table
        </button>
        <button type="button" className={`seg-btn${showing === 'json' ? ' on' : ''}`} aria-pressed={showing === 'json'} title="The list as JSON text, for people who prefer to type it" onClick={() => setView('json')}>
          JSON text
        </button>
      </div>
      {showing === 'table' && lg ? (
        <DataTable grid={lg.grid} label={label} onProblem={setNote} onChange={(g) => onChange(gridToListText(g, lg.plain))} />
      ) : (
        <TextField value={value} multiline mono rows={4} commitOnBlur title={jsonTitle ?? 'The items as JSON: an array, usually of objects'} placeholder={placeholder ?? '[{"name": "Ann"}, {"name": "Bo"}]'} onChange={onChange} />
      )}
      {note && showing === 'table' && <div className="error small">{note}</div>}
      {broken && <div className="error small">Not a JSON array, so the list starts empty.</div>}
    </div>
  );
}
