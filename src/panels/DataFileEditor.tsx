import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { DataKind, DataSource } from 'interactives-player';
import { dataCache } from '../lib/data';
import { csvToGrid, delimiterOf, gridToCsv, gridToJson, guiFor, hasError, indentOf, isFlatTable, jsonText, jsonToGrid, layoutOf, problemsOf, textOfValue, type Grid, type Json, type Path, type Problem, type Scalar } from '../lib/data-edit';
import { giveOwnFile, makeEditableCopy, readAssetText, saveDataText, sharersOf } from '../lib/data-save';
import { DataForm } from './DataForm';
import { DataRawEditor } from './DataRawEditor';
import { CodeThemeSwitch } from '../components/CodeThemeSwitch';
import { DataTable } from './DataTable';
import { DataTree } from './DataTree';

/** How long after the last change the file is saved. Each save is a new file on the server, so typing doesn't make one per key. */
const SAVE_AFTER = 700;

/** A draft that could not be saved (it has an error in it) kept for when the person comes back to the source. */
const stashed = new Map<string, { assetId: string; text: string }>();

/**
 * Edit the file behind a data source: a form (JSON opens in it), a table or tree of it, or its own text with highlighting
 * (Raw). Every view reads and writes the same text. A change is saved a moment after the last keystroke as a new version of the uploaded file (see
 * data-save.ts), so Undo, autosave and live editing work as for anything else; text that doesn't parse (JSON) isn't saved,
 * and the last version that did parse stays in use until it does. A URL source can be looked at but not changed here, and
 * offers a copy to edit.
 */
export function DataFileEditor({ source }: { source: DataSource }) {
  const kind: DataKind = source.kind;
  const asset = source.source === 'asset';
  const assetId = source.assetId ?? null;
  const [text, setText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // JSON opens as a form; CSV and TSV as a table
  const [view, setView] = useState<'form' | 'gui' | 'raw'>(kind === 'json' ? 'form' : 'gui');
  // Where the form sent the tree: which spot to open it at (n counts requests, so the same spot can be asked for again)
  const [reveal, setReveal] = useState<{ path: Path; n: number }>({ path: [], n: 0 });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [jump, setJump] = useState<{ offset: number; n: number }>({ offset: 0, n: 0 });

  const draft = useRef('');
  const committed = useRef<string | null>(null);
  const known = useRef(new Map<string, string>());
  const mine = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastGui = useRef<'table' | 'tree' | 'none'>('none');
  const alive = useRef(true);

  // The file's text: read when the file behind the source changes, other than by this editor's own save
  useEffect(() => {
    if (!asset || !assetId) {
      setText(null);
      return;
    }
    if (mine.current === assetId) {
      mine.current = null;
      return;
    }
    mine.current = null;
    clearTimeout(timer.current);
    const own = known.current.get(assetId);
    const use = (t: string, fromFile: boolean) => {
      if (!alive.current) return;
      known.current.set(assetId, t);
      committed.current = t;
      const back = fromFile ? stashed.get(source.id) : undefined;
      if (back && back.assetId === assetId) {
        draft.current = back.text;
        setText(back.text);
      } else {
        draft.current = t;
        setText(t);
      }
      setLoadError(null);
    };
    if (own !== undefined) return use(own, false);
    let stale = false;
    readAssetText(assetId).then(
      (t) => !stale && use(t, true),
      (e) => !stale && setLoadError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, asset]);

  // What a URL source loaded, shown as text it can't change
  const loaded = dataCache.get(source.id);
  const urlText = useMemo(() => (!asset && loaded && 'value' in loaded ? textOfValue(loaded.value, kind) : null), [asset, loaded, kind]);
  const shownText = asset ? text : urlText;

  const flush = () => {
    clearTimeout(timer.current);
    const t = draft.current;
    if (!asset || committed.current === null || t === committed.current) return;
    if (hasError(problemsOf(t, kind)) && kind === 'json') return;
    const before = committed.current;
    committed.current = t;
    setSaving(true);
    void saveDataText(source.id, t, (id) => {
      known.current.set(id, t);
      mine.current = id;
    }).then((id) => {
      if (!alive.current) return;
      setSaving(false);
      setSaveFailed(!id);
      if (!id) committed.current = before;
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Leaving the source: whatever is waiting is saved now, and a draft with an error is kept for when it is opened again
  useEffect(() => {
    alive.current = true;
    return () => {
      const t = draft.current;
      if (asset && committed.current !== null && t !== committed.current) {
        if (kind === 'json' && hasError(problemsOf(t, kind))) stashed.set(source.id, { assetId: assetId ?? '', text: t });
        else flushRef.current();
      }
      alive.current = false;
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edit = (next: string) => {
    draft.current = next;
    setText(next);
    setSaveFailed(false);
    stashed.delete(source.id);
    clearTimeout(timer.current);
    if (kind === 'json' && hasError(problemsOf(next, kind))) return;
    timer.current = setTimeout(() => flushRef.current(), SAVE_AFTER);
  };

  // Problems are worked out a beat behind the typing, so a long file stays quick
  const lazy = useDeferredValue(shownText);
  const problems: Problem[] = useMemo(() => (lazy === null ? [] : problemsOf(lazy, kind)), [lazy, kind]);
  const broken = shownText !== null && kind === 'json' && hasError(problemsOf(shownText, kind));

  const gui = useMemo(() => {
    if (shownText === null) return 'none' as const;
    const g = guiFor(shownText, kind);
    // Deleting the last row leaves [], which a table can still show
    if (g === 'tree' && lastGui.current === 'table' && shownText.trim().replace(/\s/g, '') === '[]') return 'table' as const;
    return g;
  }, [shownText, kind]);
  useEffect(() => {
    if (gui !== 'none') lastGui.current = gui;
  }, [gui]);

  const readOnly = !asset;
  const sharers = asset && assetId ? sharersOf(source.id) : [];
  const label = source.name;
  const showing: 'form' | 'raw' | 'gui' = gui === 'none' || broken ? 'raw' : kind === 'json' ? view : view === 'raw' ? 'raw' : 'gui';

  if (source.source === 'shared') return null;
  if (asset && !assetId) return <p className="hint">Choose a file, or upload one, to see and edit it here.</p>;
  if (asset && loadError) return <p className="error">{loadError}</p>;
  if (shownText === null) {
    if (!asset && loaded?.error) return <p className="error">{loaded.error}</p>;
    return <p className="muted">Loading…</p>;
  }

  const layout = layoutOf(shownText);
  const delimiter = delimiterOf(kind);

  let body: React.ReactNode;
  if (showing === 'raw') {
    body = <DataRawEditor value={shownText} kind={kind} readOnly={readOnly} problems={problems} onChange={edit} jump={jump} label={`${label}, the file's text${readOnly ? ' (read only)' : ''}`} />;
  } else if (kind === 'csv' || kind === 'tsv') {
    body = <GridView text={shownText} onText={edit} delimiter={delimiter} readOnly={readOnly} label={label} onProblem={setNote} />;
  } else {
    let value: Json | undefined;
    try {
      value = shownText.trim() ? (JSON.parse(shownText) as Json) : undefined;
    } catch {
      value = undefined;
    }
    const indent = indentOf(shownText);
    const write = (v: Json) => edit(jsonText(v, indent === 0 ? 0 : indent, layout.trailing || !shownText.trim()));
    if (showing === 'form') {
      body = (
        <DataForm
          value={value}
          readOnly={readOnly}
          label={label}
          treeName={gui === 'table' ? 'Table' : 'Tree'}
          onChange={write}
          openTree={(path) => {
            setView('gui');
            setReveal((r) => ({ path, n: r.n + 1 }));
          }}
        />
      );
    } else if (gui === 'table' && (isFlatTable(value) || (Array.isArray(value) && !value.length))) {
      const grid: Grid = jsonToGrid(value as Record<string, Scalar>[]);
      body = <DataTable grid={grid} readOnly={readOnly} label={label} onProblem={setNote} onChange={(g) => write(gridToJson(g))} />;
    } else body = <DataTree value={value} readOnly={readOnly} label={label} onProblem={setNote} onChange={write} reveal={reveal} />;
  }

  const status = readOnly
    ? 'Read only'
    : broken
      ? 'Not saved: fix the error. The interactive keeps using the last good version.'
      : saveFailed
        ? 'Could not save. Your change is still here; try editing again.'
        : saving
          ? 'Saving…'
          : committed.current !== null && shownText !== committed.current
            ? 'Changed, saving…'
            : 'Saved';

  return (
    <div className="data-file" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && flush()}>
      <div className="data-file-head">
        <div className="seg" role="group" aria-label="How to show the file">
          {kind === 'json' && (
            <button className={`seg-btn${showing === 'form' ? ' on' : ''}`} aria-pressed={showing === 'form'} disabled={broken} title={broken ? 'Fix the error in the text first; the form needs a file that parses' : 'Fill in the file as a form: labelled fields, and cards you can add to, copy, move and delete'} onClick={() => setView('form')}>
              Form
            </button>
          )}
          <button className={`seg-btn${showing === 'gui' ? ' on' : ''}`} aria-pressed={showing === 'gui'} disabled={gui === 'none' || broken} title={gui === 'none' ? 'Plain text has no table or tree, only the text' : broken ? 'Fix the error in the text first; the table and tree need a file that parses' : gui === 'table' ? 'Edit the rows and columns as a table' : 'Edit the file as a tree you can open and close'} onClick={() => {
              setView('gui');
              setReveal({ path: [], n: 0 });
            }}>
            {gui === 'tree' ? 'Tree' : 'Table'}
          </button>
          <button className={`seg-btn${showing === 'raw' ? ' on' : ''}`} aria-pressed={showing === 'raw'} title="The file's own text, with colours for its format" onClick={() => setView('raw')}>
            Raw text
          </button>
        </div>
        {kind === 'json' && !readOnly && !broken && (
          <button className="btn small" title="Lay the JSON out again with two-space indents. The values don't change" onClick={() => edit(jsonText(JSON.parse(shownText || 'null') as Json, 2, true))} disabled={!shownText.trim()}>
            Tidy up
          </button>
        )}
        {showing === 'raw' && <CodeThemeSwitch />}
        <span className={`data-file-status${broken || saveFailed ? ' bad' : ''}`} role="status" aria-live="polite">
          {status}
        </span>
      </div>
      {readOnly && (
        <div className="data-file-banner">
          <span>This data comes from a URL, so it isn&rsquo;t ours to change. Make a copy to edit it here.</span>
          <button className="btn small" title="Save what the URL gave as an uploaded file, and read that instead of the URL" disabled={!urlText} onClick={() => void makeEditableCopy(source.id)}>
            Make a copy to edit
          </button>
        </div>
      )}
      {sharers.length > 0 && (
        <div className="data-file-banner" role="note">
          <span>
            This file is also read by <strong>{sharers.map((d) => d.name).join(', ')}</strong>. Editing it changes {sharers.length === 1 ? 'that source' : 'those sources'} too.
          </span>
          <button className="btn small" title={`${source.name} gets a copy of the file that only it reads, so the others stay as they are`} onClick={() => void giveOwnFile(source.id)}>
            Give {source.name} its own copy
          </button>
        </div>
      )}
      {note && (
        <div className="error small" role="alert">
          {note}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="data-file-problems" aria-label="Problems in the file">
          {problems.slice(0, 3).map((p, i) => (
            <li key={i} className={p.severity === 'error' ? 'error' : 'warn'}>
              <button
                className="link-btn"
                title="Go to this spot in the text"
                onClick={() => {
                  setView('raw');
                  setJump((j) => ({ offset: p.offset, n: j.n + 1 }));
                }}
              >
                Line {p.line}, column {p.column}
              </button>
              {': '}
              {p.message}
            </li>
          ))}
          {problems.length > 3 && <li className="muted small">and {problems.length - 3} more</li>}
        </ul>
      )}
      <div className={`data-file-body${showing === 'raw' ? ' raw' : ''}${showing === 'form' ? ' form' : ''}`}>{body}</div>
    </div>
  );
}

function GridView({ text, onText, delimiter, readOnly, label, onProblem }: { text: string; onText: (t: string) => void; delimiter: string; readOnly: boolean; label: string; onProblem: (m: string | null) => void }) {
  const grid = useMemo(() => csvToGrid(text, delimiter), [text, delimiter]);
  return <DataTable grid={grid} readOnly={readOnly} label={label} onProblem={onProblem} onChange={(g) => onText(gridToCsv(g, delimiter, layoutOf(text)))} />;
}
