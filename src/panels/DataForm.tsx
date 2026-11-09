import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gridToJson, isContainer, isFlatTable, jsonToGrid, kindOf, scalarFromText, treeOps, type Json, type Kind, type Path, type Scalar } from '../lib/data-edit';
import { cardTitle, fillFor, idOf, labelOf, newItemFor, nounOf, outlineOf, siblingKind } from '../lib/data-form';
import { DataTable } from './DataTable';

/** Cards shown for a list before "Show more", so a long file stays quick. */
const MORE = 50;
/** Text longer than this, or with a line break in it, gets a growing text box instead of a line. */
const SHORT = 60;
const KIND_NAME: Record<Kind, string> = { text: 'text', number: 'number', yesno: 'yes/no', empty: 'empty', list: 'list', group: 'group' };

const isLong = (s: string) => s.length > SHORT || s.includes('\n');

interface Ctx {
  value: Json;
  readOnly: boolean;
  uid: string;
  /** What leads to Tree for structure changes: "Tree", or "Table" when that is the file's other view. */
  treeName: string;
  isOpen: (key: string, def: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
  table: Map<string, boolean>;
  setTable: (key: string, on: boolean) => void;
  limit: (key: string) => number;
  showMore: (key: string) => void;
  set: (path: Path, v: Json) => void;
  addTo: (list: Path) => void;
  move: (path: Path, by: number) => void;
  copy: (path: Path) => void;
  remove: (path: Path) => void;
  toTree: (path: Path) => void;
}

/**
 * A JSON file as a form: every group is a card of labelled fields, every list of groups a stack of cards you can add to,
 * copy, move and delete, with an outline at the side to jump between them. The shape comes from the file itself. Changing
 * what is in a field and keeping its place in the file is all it does; adding a new kind of field, renaming a key or
 * changing what a value holds is Tree's job, and the form says so and opens it at the spot. Every change writes the
 * whole file back through `onChange`, so saving, Undo and read-only sources work as they do in the other views.
 */
export function DataForm({ value, onChange, readOnly, label, openTree, treeName = 'Tree' }: { value: Json | undefined; onChange: (v: Json) => void; readOnly?: boolean; label: string; openTree: (path: Path) => void; treeName?: string }) {
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Map<string, boolean>>(new Map());
  const [table, setTables] = useState<Map<string, boolean>>(new Map());
  const [shown, setShown] = useState<Map<string, number>>(new Map());
  // Where focus goes after the next draw: the first of these that exists, so a delete can fall back to a neighbour
  const wanted = useRef<string[] | null>(null);

  useEffect(() => {
    const want = wanted.current;
    if (!want) return;
    wanted.current = null;
    const els = [...(root.current?.querySelectorAll<HTMLElement>('[data-focus]') ?? [])];
    for (const w of want) {
      const el = els.find((e) => e.dataset.focus === w && !(e as HTMLButtonElement).disabled);
      if (el) return el.focus();
    }
  });

  const outline = useMemo(() => outlineOf(value, label), [value, label]);

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

  const keyOf = idOf;
  const ctx: Ctx = {
    value,
    readOnly: !!readOnly,
    uid,
    treeName,
    isOpen: (key, def) => opened.get(key) ?? def,
    setOpen: (key, open) => setOpened((m) => new Map(m).set(key, open)),
    table,
    setTable: (key, on) => setTables((m) => new Map(m).set(key, on)),
    limit: (key) => shown.get(key) ?? MORE,
    showMore: (key) => setShown((m) => new Map(m).set(key, (m.get(key) ?? MORE) + MORE)),
    set: (path, v) => onChange(treeOps.set(value, path, v)),
    addTo: (list) => {
      const r = treeOps.add(value, list, newItemFor(getList(value, list) ?? []));
      onChange(r.root);
      const key = keyOf(r.path);
      setOpened((m) => new Map(m).set(key, true));
      const at = r.path[r.path.length - 1];
      if (typeof at === 'number' && at >= (shown.get(keyOf(list)) ?? MORE)) setShown((m) => new Map(m).set(keyOf(list), at + 1));
      wanted.current = [`${key}|head`, `${key}|field`];
    },
    move: (path, by) => {
      const r = treeOps.move(value, path, by);
      if (r.root === value) return;
      onChange(r.root);
      const key = keyOf(r.path);
      // The card that moved is open where it lands, so it can be seen
      setOpened((m) => new Map(m).set(key, true));
      wanted.current = [`${key}|${by < 0 ? 'up' : 'down'}`, `${key}|${by < 0 ? 'down' : 'up'}`, `${key}|head`];
    },
    copy: (path) => {
      const r = treeOps.duplicate(value, path);
      if (r.root === value) return;
      onChange(r.root);
      const key = keyOf(r.path);
      setOpened((m) => new Map(m).set(key, true));
      wanted.current = [`${key}|head`, `${key}|field`];
    },
    remove: (path) => {
      const k = path[path.length - 1];
      const parent = path.slice(0, -1);
      onChange(treeOps.remove(value, path));
      // Land on the item that took its place, or the one before it, or the list's own Add another
      const n = typeof k === 'number' ? k : 0;
      wanted.current = [n > 0 ? `${keyOf([...parent, n - 1])}|head` : '', `${keyOf([...parent, n])}|head`, `${keyOf([...parent, n])}|field`, n > 0 ? `${keyOf([...parent, n - 1])}|field` : '', `${keyOf(parent)}|add`];
    },
    toTree: openTree,
  };

  const jump = (path: Path, kind: 'list' | 'card') => {
    // Open every card the target sits inside, and show it if it is past the cards drawn so far
    const open = new Map(opened);
    const more = new Map(shown);
    for (let i = 1; i <= path.length; i++) {
      open.set(keyOf(path.slice(0, i)), true);
      const next = path[i - 1];
      if (typeof next === 'number' && next >= (more.get(keyOf(path.slice(0, i - 1))) ?? MORE)) more.set(keyOf(path.slice(0, i - 1)), (Math.floor(next / MORE) + 1) * MORE);
    }
    setOpened(open);
    setShown(more);
    wanted.current = [`${keyOf(path)}|${kind === 'list' ? 'list' : 'head'}`];
  };

  const cards = outline.filter((o) => o.kind === 'card');
  const setAll = (open: boolean) => setOpened(new Map(cards.map((c) => [c.key, open])));

  let main: ReactNode;
  if (Array.isArray(value)) main = <ListBlock ctx={ctx} path={[]} items={value} name={label} noun="Item" level={3} fileLabel />;
  else if (value && typeof value === 'object') {
    main = (
      <div className="form-root">
        <h3 className="form-root-title">{label}</h3>
        <Fields ctx={ctx} path={[]} group={value} level={4} title={label} />
      </div>
    );
  } else main = <ScalarField ctx={ctx} path={[]} label={label} rawKey="" value={value} hint="text" />;

  return (
    <div className="data-formview" ref={root}>
      <div className="data-formview-note">
        <span>
          Change what is in each field, and add or delete list items. To add or rename a field, use <strong>{treeName}</strong>.
        </span>
        <button className="btn small" title={`Open ${treeName} at the top of the file`} onClick={() => openTree([])}>
          Open {treeName}
        </button>
        {cards.length > 1 && (
          <span className="data-grid-group" role="group" aria-label="Show cards">
            <button className="btn small" title="Open every card" onClick={() => setAll(true)}>
              Open all
            </button>
            <button className="btn small" title="Close every card, so only their titles show" onClick={() => setAll(false)}>
              Close all
            </button>
          </span>
        )}
      </div>
      <div className={`data-formview-layout${outline.length ? ' has-outline' : ''}`}>
        {outline.length > 0 && (
          <nav className="data-formview-outline" aria-label={`Outline of ${label}`}>
            <ul>
              {outline.map((o) => (
                <li key={o.key} style={{ paddingLeft: o.depth * 12 }}>
                  <button className={`link-btn${o.kind === 'list' ? ' list' : ''}`} title={`Jump to ${o.trail}`} onClick={() => jump(o.path, o.kind)}>
                    {o.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="data-formview-main">{main}</div>
      </div>
    </div>
  );
}

function getList(root: Json, path: Path): Json[] | undefined {
  let cur: Json | undefined = root;
  for (const k of path) cur = cur && typeof cur === 'object' ? (cur as Record<string | number, Json>)[k] : undefined;
  return Array.isArray(cur) ? cur : undefined;
}

const heading = (level: number) => `h${Math.min(6, Math.max(3, level))}` as 'h3';

/** A group's fields in the order the file has them: plain values in a fieldset, lists and groups as their own blocks between. */
function Fields({ ctx, path, group, level, title }: { ctx: Ctx; path: Path; group: { [key: string]: Json }; level: number; title: string }) {
  const entries = Object.entries(group);
  const blocks: ReactNode[] = [];
  let run: [string, Json][] = [];
  const flush = (at: number) => {
    if (!run.length) return;
    const rows = run;
    run = [];
    blocks.push(
      <fieldset className="form-fields" key={`f${at}`}>
        <legend className="sr-only">{title}: fields</legend>
        {rows.map(([k, v]) => (
          <ScalarField key={k} ctx={ctx} path={[...path, k]} label={labelOf(k)} rawKey={k} value={v} hint={siblingHint(ctx, path, k)} />
        ))}
      </fieldset>,
    );
  };
  entries.forEach(([k, v], i) => {
    if (!isContainer(v)) return void run.push([k, v]);
    flush(i);
    const p = [...path, k];
    blocks.push(
      Array.isArray(v) ? (
        <ListBlock key={k} ctx={ctx} path={p} items={v} name={labelOf(k)} noun={nounOf(k)} level={level} />
      ) : (
        <Card key={k} ctx={ctx} path={p} title={labelOf(k)} level={level} def>
          <Fields ctx={ctx} path={p} group={v} level={level + 1} title={labelOf(k)} />
        </Card>
      ),
    );
  });
  flush(entries.length);
  if (!entries.length)
    blocks.push(
      <p className="muted small" key="none">
        No fields yet.{!ctx.readOnly && ` Add them in ${ctx.treeName}.`}
      </p>,
    );
  return <>{blocks}</>;
}

/** What an empty field can be filled in as: what the same field holds in the other items of its list. */
function siblingHint(ctx: Ctx, path: Path, key: string): Kind {
  const parent = path.slice(0, -1);
  const list = getList(ctx.value, parent);
  return siblingKind(list, key);
}

interface CardProps {
  ctx: Ctx;
  path: Path;
  title: string;
  level: number;
  def: boolean;
  /** Set for the item of a list: the actions that work on it. */
  item?: { index: number; count: number };
  children: ReactNode;
}

/** A group (or a list in a list) as a card: its title is a button that closes and opens it. */
function Card({ ctx, path, title, level, def, item, children }: CardProps) {
  const key = idOf(path);
  const open = ctx.isOpen(key, def);
  const hid = `${ctx.uid}-h-${key}`;
  const bid = `${ctx.uid}-b-${key}`;
  const H = heading(level);
  const ro = ctx.readOnly;
  return (
    <div className={`form-card${open ? ' open' : ''}`} role="group" aria-labelledby={hid}>
      <div className="form-card-head">
        <H className="form-card-title" id={hid}>
          <button className="form-card-toggle" data-focus={`${key}|head`} aria-expanded={open} aria-controls={bid} title={open ? 'Close this card, leaving just its title' : 'Open this card'} onClick={() => ctx.setOpen(key, !open)}>
            <span className="form-twist" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            {title}
          </button>
        </H>
        <span className="form-card-actions" role="group" aria-label={`Actions for ${title}`}>
          {item && !ro && <ItemButtons ctx={ctx} path={path} index={item.index} count={item.count} title={title} />}
          <button className="btn small" title={`Open ${ctx.treeName} at this spot, to add or rename fields or change what a field holds`} aria-label={`Open ${title} in ${ctx.treeName}`} onClick={() => ctx.toTree(path)}>
            In {ctx.treeName}
          </button>
        </span>
      </div>
      <div className="form-card-body" id={bid} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}

/** Move up, Move down, Copy and Delete for one item of a list. */
function ItemButtons({ ctx, path, index, count, title }: { ctx: Ctx; path: Path; index: number; count: number; title: string }) {
  const key = idOf(path);
  return (
    <>
      <button className="btn small" data-focus={`${key}|up`} aria-label={`Move ${title} up`} title="Move this one up, before the one above it" disabled={index === 0} onClick={() => ctx.move(path, -1)}>
        Up
      </button>
      <button className="btn small" data-focus={`${key}|down`} aria-label={`Move ${title} down`} title="Move this one down, after the one below it" disabled={index >= count - 1} onClick={() => ctx.move(path, 1)}>
        Down
      </button>
      <button className="btn small" aria-label={`Copy ${title}`} title="Copy this one, just after itself, with everything in it" onClick={() => ctx.copy(path)}>
        Copy
      </button>
      <button className="btn small" aria-label={`Delete ${title}`} title="Delete this one and everything in it. Undo brings it back" onClick={() => ctx.remove(path)}>
        Delete
      </button>
    </>
  );
}

/** A list: a heading, then its items as a stack of cards (or fields, for plain values), or as a table when the rows are simple and there are many. */
function ListBlock({ ctx, path, items, name, noun, level, fileLabel }: { ctx: Ctx; path: Path; items: Json[]; name: string; noun: string; level: number; fileLabel?: boolean }) {
  const key = idOf(path);
  const hid = `${ctx.uid}-l-${key}`;
  const H = heading(level);
  const flat = isFlatTable(items);
  // Many short rows read better as a table; a few, or rows with sentences in them, as cards
  const wide = flat && items.length > 6 && items.every((r) => Object.values(r as Record<string, Json>).every((v) => typeof v !== 'string' || !isLong(v)));
  const asTable = flat && (ctx.table.get(key) ?? wide);
  const limit = ctx.limit(key);
  const ro = ctx.readOnly;
  return (
    <div className="form-list" role="group" aria-labelledby={hid}>
      <div className="form-list-head">
        <H className="form-list-title" id={hid} tabIndex={-1} data-focus={`${key}|list`}>
          {name}
          <span className="muted small form-count">
            {' '}
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </H>
        {flat && (
          <span className="seg" role="group" aria-label={`Show ${name} as`}>
            <button className={`seg-btn${!asTable ? ' on' : ''}`} aria-pressed={!asTable} title="Show each one as a card of fields" onClick={() => ctx.setTable(key, false)}>
              Cards
            </button>
            <button className={`seg-btn${asTable ? ' on' : ''}`} aria-pressed={asTable} title="Show them all as one table of rows and columns" onClick={() => ctx.setTable(key, true)}>
              Table
            </button>
          </span>
        )}
        {fileLabel ? null : (
          <button className="btn small" title={`Open ${ctx.treeName} at this list`} aria-label={`Open ${name} in ${ctx.treeName}`} onClick={() => ctx.toTree(path)}>
            In {ctx.treeName}
          </button>
        )}
      </div>
      {asTable ? (
        <div className="tree-table">
          <DataTable grid={jsonToGrid(items as Record<string, Scalar>[])} readOnly={ro} label={`${name} as a table`} onChange={(g) => ctx.set(path, gridToJson(g))} />
        </div>
      ) : (
        <div className="form-stack">
          {items.slice(0, limit).map((it, i) => {
            const p = [...path, i];
            const title = cardTitle(it, noun, i);
            if (!isContainer(it)) {
              return (
                <ScalarField key={i} ctx={ctx} path={p} label={`${noun} ${i + 1}`} rawKey="" value={it} hint="text" item={{ index: i, count: items.length }} />
              );
            }
            return (
              <Card key={i} ctx={ctx} path={p} title={title} level={level + 1} def={items.length <= 4 || i === 0} item={{ index: i, count: items.length }}>
                {Array.isArray(it) ? <ListBlock ctx={ctx} path={p} items={it} name={`${title}, items`} noun="Item" level={level + 2} fileLabel /> : <Fields ctx={ctx} path={p} group={it} level={level + 2} title={title} />}
              </Card>
            );
          })}
          {items.length > limit && (
            <button className="btn small form-more" onClick={() => ctx.showMore(key)}>
              Show {Math.min(MORE, items.length - limit)} more of {items.length - limit} left
            </button>
          )}
          {!items.length && <p className="muted small">No items yet.</p>}
        </div>
      )}
      {!ro && !asTable && (
        <div className="form-list-add">
          <button
            className="btn small"
            data-focus={`${key}|add`}
            title={items.length ? 'Add one more at the end, with the same fields as the others, left empty' : 'Add a first item, as a line of text. For a group or a number, start it in Tree'}
            onClick={() => ctx.addTo(path)}
          >
            {items.length ? 'Add another' : 'Add an item'}
          </button>
        </div>
      )}
    </div>
  );
}

/** One plain value with its label: a line or a growing box for text, a number box, a yes/no switch, or "empty" with a way to fill it. */
function ScalarField({ ctx, path, label, rawKey, value, hint, item }: { ctx: Ctx; path: Path; label: string; rawKey: string; value: Json; hint: Kind; item?: { index: number; count: number } }) {
  const key = idOf(path);
  const id = `${ctx.uid}-f-${key}`;
  const kind = kindOf(value);
  const ro = ctx.readOnly;
  const tip = rawKey ? `${label}: called “${rawKey}” in the file` : label;
  let control: ReactNode;
  if (kind === 'yesno') {
    const on = value === true;
    control = (
      <button id={id} role="switch" aria-checked={on} className={`form-switch${on ? ' on' : ''}`} data-focus={`${key}|field`} disabled={ro} title={`${label}: ${on ? 'yes' : 'no'}. Click to change`} onClick={() => ctx.set(path, !on)}>
        <span className="form-switch-knob" aria-hidden="true" />
        <span className="form-switch-text">{on ? 'Yes' : 'No'}</span>
      </button>
    );
  } else if (kind === 'number') {
    control = <NumberBox id={id} label={label} focusKey={key} value={value as number} readOnly={ro} onSet={(n) => ctx.set(path, n)} />;
  } else if (kind === 'empty') {
    const fill = hint === 'number' || hint === 'yesno' ? hint : 'text';
    control = (
      <span className="form-empty">
        <span className="muted" id={id}>
          empty
        </span>
        {!ro && (
          <button className="btn small" data-focus={`${key}|field`} aria-label={`Fill in ${label}`} title={`Give ${label} a ${KIND_NAME[fill]} value. Another kind of value is set in ${ctx.treeName}`} onClick={() => ctx.set(path, fillFor(fill))}>
            Fill in
          </button>
        )}
      </span>
    );
  } else {
    control = <TextBox id={id} label={label} focusKey={key} value={String(value)} readOnly={ro} onSet={(t) => ctx.set(path, scalarFromText(t, 'text'))} />;
  }
  return (
    <div className={`form-field${item ? ' has-actions' : ''}`}>
      {kind === 'empty' ? (
        <span className="form-label" title={tip}>
          {label}
        </span>
      ) : (
        <label className="form-label" htmlFor={id} title={tip}>
          {label}
        </label>
      )}
      <div className="form-control">{control}</div>
      {item && !ro && (
        <span className="form-card-actions" role="group" aria-label={`Actions for ${label}`}>
          <ItemButtons ctx={ctx} path={path} index={item.index} count={item.count} title={label} />
        </span>
      )}
    </div>
  );
}

/** A line, or a text box that grows with what is in it. Which one is decided when it is drawn and when it loses focus, never mid-typing. */
function TextBox({ id, label, focusKey, value, readOnly, onSet }: { id: string; label: string; focusKey: string; value: string; readOnly: boolean; onSet: (t: string) => void }) {
  const [multi, setMulti] = useState(isLong(value));
  const focused = useRef(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focused.current) setMulti(isLong(value));
  }, [value]);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
  }, [value, multi]);
  //the label beside it names it already; the aria-label is for readers and checkers that do not follow the for/id pair
  const common = {
    id,
    'aria-label': label,
    value,
    readOnly,
    className: 'form-text',
    'data-focus': `${focusKey}|field`,
    spellCheck: true,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setMulti(isLong(value));
    },
    // The editor's own shortcuts (Delete, Ctrl+Z, arrows that nudge layers) are not for a text box
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  return multi ? <textarea ref={area} rows={2} {...common} onChange={(e) => onSet(e.target.value)} /> : <input type="text" {...common} onChange={(e) => onSet(e.target.value)} />;
}

/** A number box. What is typed is kept as typed until it reads as a number, and that is what is written; a half-typed "-" or "1e" waits. */
function NumberBox({ id, label, focusKey, value, readOnly, onSet }: { id: string; label: string; focusKey: string; value: number; readOnly: boolean; onSet: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    // Follow the file (Undo, someone else's edit) unless the box already says this number
    const typed = scalarFromText(text, 'number');
    if (typed !== value) {
      setText(String(value));
      setBad(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <>
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="decimal"
        className="form-text number"
        data-focus={`${focusKey}|field`}
        value={text}
        readOnly={readOnly}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-bad` : undefined}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          setText(e.target.value);
          const n = scalarFromText(e.target.value, 'number');
          if (typeof n === 'number') {
            setBad(false);
            if (n !== value) onSet(n);
          } else setBad(true);
        }}
        onBlur={() => {
          setText(String(value));
          setBad(false);
        }}
      />
      {bad && (
        <span className="form-bad" id={`${id}-bad`} role="alert">
          Not a number yet. The last number stays until this is one.
        </span>
      )}
    </>
  );
}
