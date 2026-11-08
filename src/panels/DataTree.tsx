import { useEffect, useRef, useState, type ReactNode } from 'react';
import { blankOf, convertTo, getAt, gridToJson, isContainer, isFlatTable, jsonToGrid, kindOf, pathKey, scalarFromText, summaryOf, treeOps, type Json, type Kind, type Path, type Scalar } from '../lib/data-edit';
import { Box, DataTable } from './DataTable';

const MORE = 100;

const KIND_LABEL: Record<Kind, string> = { text: 'Text', number: 'Number', yesno: 'Yes / no', empty: 'Empty', list: 'List', group: 'Group' };
const KIND_WORD: Record<Kind, string> = { text: 'text', number: 'number', yesno: 'yes/no', empty: 'empty', list: 'list', group: 'group' };

/** A new item shaped like an existing one: the same keys, each blank, so a new question or choice starts with the right fields. */
function blankLike(v: Json): Json {
  if (Array.isArray(v)) return [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)]));
  return blankOf(kindOf(v));
}

/** Every path that holds a list or a group, for Expand all and Collapse all. */
function containers(v: Json, path: Path = [], out: string[] = []): string[] {
  if (isContainer(v)) {
    out.push(pathKey(path));
    for (const [k, x] of Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v)) containers(x, [...path, k], out);
  }
  return out;
}

/**
 * A collapsible tree of a JSON file. Lists of flat objects open as a table (the Table / List switch on the row turns
 * that off). One row holds the cursor, and the buttons above work on it. Keys: Up and Down move, Right opens (or goes
 * in), Left closes (or goes out), Enter edits the row, Delete removes it, Alt+Up and Alt+Down move it among its
 * neighbours. The value of every row is edited in place, and each change writes the whole file back.
 */
export function DataTree({ value, onChange, readOnly, label, onProblem }: { value: Json | undefined; onChange: (v: Json) => void; readOnly?: boolean; label: string; onProblem?: (m: string | null) => void }) {
  const [cur, setCur] = useState<Path>([]);
  const [opened, setOpened] = useState<Map<string, boolean>>(new Map());
  const [asList, setAsList] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState<Map<string, number>>(new Map());
  const root = useRef<HTMLDivElement>(null);
  const focusRow = useRef<string | null>(null);

  useEffect(() => {
    const want = focusRow.current;
    if (want === null) return;
    focusRow.current = null;
    [...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((el) => el.dataset.row === want)?.focus();
  });

  if (value === undefined) {
    return (
      <div className="data-tree-empty">
        <p className="hint">This file is empty. Start it as a list or a group.</p>
        {!readOnly && (
          <div className="row">
            <button className="btn" title="Start the file as a list: [ ]" onClick={() => onChange([])}>
              Start a list
            </button>
            <button className="btn" title="Start the file as a group of named values: { }" onClick={() => onChange({})}>
              Start a group
            </button>
          </div>
        )}
      </div>
    );
  }

  const isOpen = (key: string, depth: number) => opened.get(key) ?? depth <= 1;
  const setOpen = (key: string, open: boolean) => setOpened((m) => new Map(m).set(key, open));
  const curValue = getAt(value, cur);
  // The cursor can point at something an undo or another person's edit removed
  const here = curValue === undefined ? { path: [] as Path, v: value } : { path: cur, v: curValue };
  const parentValue = here.path.length ? getAt(value, here.path.slice(0, -1)) : undefined;
  const hereKey = pathKey(here.path);

  const commit = (next: Json, at?: Path) => {
    onChange(next);
    if (at) {
      setCur(at);
      focusRow.current = pathKey(at);
      // Open what was added to, so it can be seen
      if (at.length) setOpen(pathKey(at.slice(0, -1)), true);
    }
  };
  const setValue = (path: Path, v: Json) => commit(treeOps.set(value, path, v));
  const rename = (path: Path, name: string) => {
    if (!name) return onProblem?.('A key needs a name.');
    const next = treeOps.rename(value, path, name);
    if (!next) return onProblem?.(`This group already has a key called “${name}”.`);
    onProblem?.(null);
    // The cursor follows the key to its new name
    const to = [...path.slice(0, -1), name];
    if (pathKey(cur) === pathKey(path)) setCur(to);
    onChange(next);
  };

  const addInside = () => {
    const v = here.v;
    if (!isContainer(v)) return;
    const blank = Array.isArray(v) ? (v.length ? blankLike(v[v.length - 1]) : '') : '';
    const r = treeOps.add(value, here.path, blank);
    commit(r.root, r.path);
  };
  const addNext = () => {
    if (!here.path.length || !isContainer(parentValue as Json)) return;
    const parent = here.path.slice(0, -1);
    const k = here.path[here.path.length - 1];
    const r = typeof k === 'number' ? treeOps.add(value, parent, blankLike(here.v), { at: k + 1 }) : treeOps.add(value, parent, '', {});
    commit(r.root, r.path);
  };
  const remove = (path: Path) => {
    if (!path.length) return;
    const k = path[path.length - 1];
    const parent = path.slice(0, -1);
    const siblings = getAt(value, parent);
    // Land on a neighbour, or the parent when it was the only one
    let at: Path = parent;
    if (Array.isArray(siblings) && siblings.length > 1) at = [...parent, Math.min(Number(k), siblings.length - 2)];
    else if (siblings && typeof siblings === 'object' && !Array.isArray(siblings)) {
      const keys = Object.keys(siblings).filter((x) => x !== k);
      if (keys.length) at = [...parent, keys[Math.min(Object.keys(siblings).indexOf(String(k)), keys.length - 1)]];
    }
    commit(treeOps.remove(value, path), at);
  };
  const move = (path: Path, by: number) => {
    const r = treeOps.move(value, path, by);
    if (r.root !== value) commit(r.root, r.path);
  };
  const copy = (path: Path) => {
    const r = treeOps.duplicate(value, path);
    if (r.root !== value) commit(r.root, r.path);
  };

  /** The tree row elements in the order they are on screen. */
  const rows = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])];

  const ctx: Ctx = { value, readOnly: !!readOnly, cur: here.path, hereKey, isOpen, setOpen, asList, setAsList, shown, setShown, setCur, setValue, rename, remove, move, rows, focusRow, label, onChange, onProblem };

  const kinds: Kind[] = ['text', 'number', 'yesno', 'empty', 'list', 'group'];
  const hereKind = kindOf(here.v);
  const canAddNext = here.path.length > 0 && isContainer(parentValue as Json);

  return (
    <div className="data-tree-wrap" ref={root}>
      {!readOnly && (
        <div className="data-grid-bar" role="toolbar" aria-label={`${label}: change the row you are on`}>
          <span className="data-grid-group" role="group" aria-label="Add">
            <span className="muted small">Add</span>
            <button className="btn small" title={hereKind === 'list' ? 'Add an item at the end of this list' : hereKind === 'group' ? 'Add a key at the end of this group' : 'Only a list or a group can have things added inside it'} disabled={!isContainer(here.v)} onClick={addInside}>
              Inside
            </button>
            <button className="btn small" title="Add one next to this row, after it" disabled={!canAddNext} onClick={addNext}>
              Next to
            </button>
          </span>
          <span className="data-grid-group" role="group" aria-label="Row">
            <span className="muted small">Row</span>
            <button className="btn small" title="Copy this row, next to it" disabled={!here.path.length} onClick={() => copy(here.path)}>
              Copy
            </button>
            <button className="btn small" title="Delete this row and everything inside it" disabled={!here.path.length} onClick={() => remove(here.path)}>
              Delete
            </button>
            <button className="btn small" aria-label="Move row up" title="Move this row up among its neighbours (Alt+Up)" disabled={!here.path.length} onClick={() => move(here.path, -1)}>
              Up
            </button>
            <button className="btn small" aria-label="Move row down" title="Move this row down among its neighbours (Alt+Down)" disabled={!here.path.length} onClick={() => move(here.path, 1)}>
              Down
            </button>
          </span>
          <label className="data-grid-group" title="What this row holds. Changing it keeps what can be kept: 12 and “12” swap, and a list of one thing becomes that thing">
            <span className="muted small">Holds</span>
            <select value={hereKind} onChange={(e) => setValue(here.path, convertTo(here.v, e.target.value as Kind))} onKeyDown={(e) => e.stopPropagation()}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <span className="data-grid-group" role="group" aria-label="Show">
            <button className="btn small" title="Open every list and group" onClick={() => setOpened(new Map(containers(value).map((k) => [k, true])))}>
              Open all
            </button>
            <button className="btn small" title="Close everything but the top" onClick={() => setOpened(new Map(containers(value).map((k) => [k, k === '[]'])))}>
              Close all
            </button>
          </span>
        </div>
      )}
      <div className="data-tree" role="tree" aria-label={label}>
        <Node ctx={ctx} path={[]} name="" value={value} depth={0} />
      </div>
    </div>
  );
}

interface Ctx {
  value: Json;
  readOnly: boolean;
  cur: Path;
  hereKey: string;
  isOpen: (key: string, depth: number) => boolean;
  setOpen: (key: string, open: boolean) => void;
  asList: Set<string>;
  setAsList: (s: Set<string>) => void;
  shown: Map<string, number>;
  setShown: (m: Map<string, number>) => void;
  setCur: (p: Path) => void;
  setValue: (path: Path, v: Json) => void;
  rename: (path: Path, name: string) => void;
  remove: (path: Path) => void;
  move: (path: Path, by: number) => void;
  rows: () => HTMLElement[];
  focusRow: { current: string | null };
  label: string;
  onChange: (v: Json) => void;
  onProblem?: (m: string | null) => void;
}

function Node({ ctx, path, name, value, depth }: { ctx: Ctx; path: Path; name: string | number; value: Json; depth: number }) {
  const key = pathKey(path);
  const kind = kindOf(value);
  const container = isContainer(value);
  const open = container && ctx.isOpen(key, depth);
  const selected = key === ctx.hereKey;
  const flat = Array.isArray(value) && isFlatTable(value);
  const asTable = flat && !ctx.asList.has(key);
  const parentIsList = typeof name === 'number';
  const ro = ctx.readOnly;
  const kids: [string | number, Json][] = container ? (Array.isArray(value) ? value.map((x, i) => [i, x]) : Object.entries(value)) : [];
  const limit = ctx.shown.get(key) ?? MORE;
  const nameText = path.length === 0 ? ctx.label : parentIsList ? `item ${name}` : String(name);

  const step = (el: HTMLElement, by: number) => {
    const all = ctx.rows();
    const at = all.indexOf(el);
    all[Math.min(Math.max(at + by, 0), all.length - 1)]?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const eat = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    switch (e.key) {
      case 'ArrowDown':
        eat();
        if (e.altKey && !ro && path.length) ctx.move(path, 1);
        else step(el, 1);
        break;
      case 'ArrowUp':
        eat();
        if (e.altKey && !ro && path.length) ctx.move(path, -1);
        else step(el, -1);
        break;
      case 'Home':
        eat();
        step(el, -1e9);
        break;
      case 'End':
        eat();
        step(el, 1e9);
        break;
      case 'ArrowRight':
        eat();
        if (container && !open) ctx.setOpen(key, true);
        else if (open) step(el, 1);
        break;
      case 'ArrowLeft':
        eat();
        if (open) ctx.setOpen(key, false);
        else el.parentElement?.closest<HTMLElement>('[role="treeitem"]')?.focus();
        break;
      case 'Enter':
      case 'F2':
        eat();
        if (!container || e.key === 'F2') el.querySelector<HTMLElement>(':scope > .tree-line input:not([readonly]), :scope > .tree-line textarea:not([readonly]), :scope > .tree-line select')?.focus();
        else ctx.setOpen(key, !open);
        break;
      case 'Delete':
        if (ro || !path.length) break;
        eat();
        ctx.remove(path);
        break;
    }
  };

  // What sits at the end of the row: the value itself for plain ones, a count for the rest
  let valueBox: ReactNode = null;
  if (!container) {
    if (kind === 'yesno') {
      valueBox = (
        <select className="tree-value" aria-label={`${nameText} value`} disabled={ro} tabIndex={selected ? 0 : -1} value={value ? 'yes' : 'no'} onChange={(e) => ctx.setValue(path, e.target.value === 'yes')} onKeyDown={(e) => e.stopPropagation()}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    } else if (kind === 'empty') {
      valueBox = <span className="muted tree-value">empty</span>;
    } else {
      valueBox = (
        <Box
          value={String(value)}
          cell="tree"
          c={0}
          tab={selected}
          readOnly={ro}
          label={`${nameText} value`}
          placeholder={kind === 'number' ? '0' : 'empty text'}
          kind={kind === 'number' ? 'number' : undefined}
          onFocus={() => ctx.setCur(path)}
          onCommit={(t) => ctx.setValue(path, scalarFromText(t, kind))}
          onMove={(dr) => {
            const el = ctx.rows().find((r) => r.dataset.row === key);
            if (el) {
              el.focus();
              step(el, dr);
            }
          }}
        />
      );
    }
  }

  return (
    <div
      role="treeitem"
      className={`tree-item${selected ? ' on' : ''}`}
      data-row={key}
      aria-level={depth + 1}
      aria-expanded={container ? open : undefined}
      aria-selected={selected}
      aria-label={`${nameText}, ${container ? summaryOf(value) : `${KIND_WORD[kind]}, ${summaryOf(value)}`}`}
      tabIndex={selected ? 0 : -1}
      onFocus={(e) => {
        if (e.target === e.currentTarget) ctx.setCur(path);
      }}
      onKeyDown={onKey}
    >
      <div className="tree-line" style={{ paddingLeft: depth * 16 }} onClick={() => ctx.setCur(path)}>
        {container ? (
          <button className="tree-twist" tabIndex={-1} aria-hidden="true" title={open ? 'Close' : 'Open'} onClick={(e) => (e.stopPropagation(), ctx.setCur(path), ctx.setOpen(key, !open))}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="tree-twist" />
        )}
        {path.length === 0 ? (
          <span className="tree-key root">{ctx.label}</span>
        ) : parentIsList ? (
          <span className="tree-key index" title="Its place in the list, counting from 0">
            {name}
          </span>
        ) : (
          <Box value={String(name)} cell="key" c={0} tab={selected} readOnly={ro} label={`${nameText} key`} header onFocus={() => ctx.setCur(path)} onCommit={(t) => ctx.rename(path, t)} onMove={() => undefined} />
        )}
        <span className="tree-kind muted small">{KIND_WORD[kind]}</span>
        {valueBox}
        {container && <span className="muted small tree-count">{summaryOf(value)}</span>}
        {flat && open && !ro && (
          <span className="seg tree-as" role="group" aria-label="Show this list as">
            <button className={`seg-btn${asTable ? ' on' : ''}`} aria-pressed={asTable} title="Show the items as a table" onClick={() => ctx.setAsList(new Set([...ctx.asList].filter((k) => k !== key)))}>
              Table
            </button>
            <button className={`seg-btn${!asTable ? ' on' : ''}`} aria-pressed={!asTable} title="Show the items one by one, as a list" onClick={() => ctx.setAsList(new Set([...ctx.asList, key]))}>
              List
            </button>
          </span>
        )}
      </div>
      {open && asTable && (
        <div className="tree-table" style={{ marginLeft: depth * 16 + 18 }} role="group">
          <DataTable
            grid={jsonToGrid(value as Record<string, Scalar>[])}
            readOnly={ro}
            label={`${nameText} as a table`}
            onProblem={ctx.onProblem}
            onChange={(g) => ctx.setValue(path, gridToJson(g))}
          />
        </div>
      )}
      {open && !asTable && (
        <div role="group">
          {kids.slice(0, limit).map(([k, v]) => (
            <Node key={`${typeof k}${k}`} ctx={ctx} path={[...path, k]} name={k} value={v} depth={depth + 1} />
          ))}
          {kids.length > limit && (
            <div className="tree-line" style={{ paddingLeft: (depth + 1) * 16 + 18 }}>
              <button className="btn small" onClick={() => ctx.setShown(new Map(ctx.shown).set(key, limit + MORE))}>
                Show {Math.min(MORE, kids.length - limit)} more of {kids.length - limit} left
              </button>
            </div>
          )}
          {!kids.length && (
            <div className="tree-line muted small" style={{ paddingLeft: (depth + 1) * 16 + 18 }}>
              {kind === 'list' ? 'No items.' : 'No keys.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
