import { useEffect, useState, useSyncExternalStore } from 'react';
import { cleanRoomSettings, cleanSharedSettings, dataKindOf, uid, type DataKind, type DataSource } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { isIdentifier, uniqueIdentifier } from '../store/doc';
import { dataCache } from '../lib/data';
import { insertFiles, pickFiles } from '../lib/insert';
import { IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { SplitColumns } from '../components/SplitColumns';
import { assetKind } from '../lib/assets';
import { addAssetOption, withQuickAdd } from '../lib/quick-add';
import { CONTEXT_ID, ContextPanel } from './ContextPanel';
import { SharedForm } from './SharedForm';
import { RoomForm } from './RoomForm';
import { DataFileEditor } from './DataFileEditor';
import { ShowOnPage } from '../components/ShowOnPage';
import { SectionBlurb } from '../components/SectionBlurb';

const KINDS: { value: DataKind; label: string }[] = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV (header row)' },
  { value: 'tsv', label: 'TSV (header row)' },
  { value: 'text', label: 'Plain text' },
];

/** Data sources: JSON/CSV/TSV/text files (as assets) or URLs, used by bindings, repeaters and expressions. */
export function DataPanel() {
  const s = useEditor((st) => ({ sources: st.project.dataSources, assets: st.project.assets, variables: st.project.variables }));
  useSyncExternalStore(
    (fn) => dataCache.subscribe(fn),
    () => dataCache.version,
  );
  const [activeId, setActiveId] = useState<string | null>(s.sources[0]?.id ?? CONTEXT_ID);
  // The built-in context is always in the list; it shows when picked, or when no source is
  const showContext = activeId === CONTEXT_ID;
  const active = showContext ? undefined : (s.sources.find((d) => d.id === activeId) ?? s.sources[0]);

  const setSource = (id: string, patch: Partial<DataSource>, coalesce?: string) =>
    store().update(
      (d) => {
        const ds = d.dataSources.find((x) => x.id === id);
        if (ds) Object.assign(ds, patch);
      },
      { coalesce },
    );
  const names = () => [...s.sources.map((d) => d.name), ...s.variables.map((v) => v.name), 'context'];
  const addUrl = () => {
    const ds: DataSource = { id: uid('ds'), name: uniqueIdentifier(names(), 'data'), kind: 'json', source: 'url', url: '', refresh: 0 };
    store().update((d) => {
      d.dataSources.push(ds);
    });
    setActiveId(ds.id);
  };
  const addShared = () => {
    const ds: DataSource = { id: uid('ds'), name: uniqueIdentifier(names(), 'responses'), kind: 'json', source: 'shared', shared: cleanSharedSettings({}) };
    store().update((d) => {
      d.dataSources.push(ds);
    });
    setActiveId(ds.id);
  };
  const addRoom = () => {
    const ds: DataSource = { id: uid('ds'), name: uniqueIdentifier(names(), 'chat'), kind: 'json', source: 'room', room: cleanRoomSettings({}) };
    store().update((d) => {
      d.dataSources.push(ds);
    });
    setActiveId(ds.id);
  };
  const addFiles = async () => {
    const files = await pickFiles('.json,.csv,.tsv,.txt,application/json,text/csv,text/plain');
    if (!files.length) return;
    const added = await insertFiles(files, null, null);
    const taken = names();
    const sources: DataSource[] = added.map((a) => {
      const base = a.name.replace(/\.[^.]+$/, '').replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || 'data';
      const name = uniqueIdentifier(taken, base);
      taken.push(name);
      return { id: uid('ds'), name, kind: dataKindOf(a.name || a.mime), source: 'asset', assetId: a.id };
    });
    store().update((d) => {
      d.dataSources.push(...sources);
    });
    if (sources[0]) setActiveId(sources[0].id);
  };

  // The canvas keeps the sources loaded, but the panel can be open without it (and a saved edit points at a new file)
  useEffect(() => dataCache.sync(store().get().project), [s.sources, s.assets]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataAssets = s.assets.filter((a) => assetKind(a.mime, a.name) === 'data');
  const loaded = active ? dataCache.get(active.id) : undefined;

  return (
    <SplitColumns id="data" columns={[{ width: 220, min: 140, max: 480 }, 'flex']} className="data-panel">
      <div className="script-list">
        <button className={`list-item${showContext || !active ? ' active' : ''}`} title="The course and the learner, built in and read only" onClick={() => setActiveId(CONTEXT_ID)}>
          <span className="dot ok" />
          <span className="mono">context</span>
          <span className="badge">built in</span>
        </button>
        {s.sources.map((d) => {
          const st = dataCache.get(d.id);
          return (
            <button key={d.id} className={`list-item${d.id === active?.id ? ' active' : ''}`} onClick={() => setActiveId(d.id)}>
              <span className={`dot ${st?.error ? 'bad' : st && 'value' in st ? 'ok' : ''}`} />
              <span className="mono">{d.name}</span>
              <span className="badge">{d.source === 'shared' ? 'shared' : d.source === 'room' ? 'room' : d.kind}</span>
            </button>
          );
        })}
        <button className="link-btn" title="Upload a JSON, CSV, TSV or text file" onClick={addFiles}>
          + From file
        </button>
        <button className="link-btn" title="Fetch JSON, CSV, TSV or text from a URL" onClick={addUrl}>
          + From URL
        </button>
        <button className="link-btn" title="Short answers people add (a word cloud, a poll), counted for the whole class or kept for each person" onClick={addShared}>
          + Shared responses
        </button>
        <button className="link-btn" title="A live message list for the people in the same class: a chat or a question wall. Works on the StudyDesk learner page; Preview has a pretend room" onClick={addRoom}>
          + Room
        </button>
      </div>
      {active ? (
        <SplitColumns id="data-main" columns={[{ width: 320, min: 220, max: 640 }, 'flex']} className="data-main">
          <div className="data-form">
            <TextField label="Name" mono value={active.name} commitOnBlur onChange={(v) => setSource(active.id, { name: v.trim() || active.name })} />
            {active.name === 'context' && <div className="error small">This hides the built-in context in expressions; pick another name.</div>}
            {!isIdentifier(active.name) && <div className="error small">Use letters, digits and _ only, so expressions can say {active.name.replace(/\W/g, '_')}.</div>}
            {s.variables.some((v) => v.name === active.name) && <div className="error small">A variable has the same name and wins in expressions; use data.{active.name}.</div>}
            {active.source === 'shared' || active.source === 'room' ? null : <SelectField<DataKind> label="Format" value={active.kind} options={KINDS} onChange={(v) => setSource(active.id, { kind: v })} />}
            <SelectField
              label="From"
              value={active.source}
              options={[
                { value: 'asset', label: 'Uploaded file' },
                { value: 'url', label: 'URL (fetched by the player)' },
                { value: 'shared', label: 'Shared responses (what people add)' },
                { value: 'room', label: 'Room (a live chat for the class)' },
              ]}
              onChange={(v) => setSource(active.id, v === 'shared' ? { source: v, kind: 'json', shared: active.shared ?? cleanSharedSettings({}) } : v === 'room' ? { source: v, kind: 'json', room: active.room ?? cleanRoomSettings({}) } : { source: v })}
            />
            {active.source === 'room' ? (
              <RoomForm source={active} setSource={(patch, coalesce) => setSource(active.id, patch, coalesce)} />
            ) : active.source === 'shared' ? (
              <SharedForm source={active} variables={s.variables} setSource={(patch, coalesce) => setSource(active.id, patch, coalesce)} />
            ) : active.source === 'url' ? (
              <>
                <TextField
                  label="URL"
                  title="The address is fetched as soon as you press Enter or leave the field"
                  value={active.url ?? ''}
                  commitOnBlur
                  placeholder="https://…/items.json"
                  onChange={(v) => {
                    setSource(active.id, { url: v.trim() });
                    // Committed (Enter or leaving the field): fetch it now rather than waiting for Reload
                    dataCache.sync(store().get().project);
                  }}
                />
                <NumberField label="Refresh" suffix="s" title="Re-fetch every n seconds; 0 loads once" value={active.refresh ?? 0} min={0} onChange={(v) => setSource(active.id, { refresh: Math.round(v) }, `ds-refresh-${active.id}`)} />
                <p className="hint">The server must allow cross-origin requests (CORS) from wherever the interactive is published.</p>
              </>
            ) : (
              <SelectField
                label="File"
                value={active.assetId ?? ''}
                options={[{ value: '', label: dataAssets.length ? 'Choose…' : 'No file yet' }, ...dataAssets.map((a) => ({ value: a.id, label: a.name })), addAssetOption('data')]}
                onChange={withQuickAdd(
                  (v) => {
                    const a = store().get().project.assets.find((x) => x.id === v);
                    setSource(active.id, { assetId: v || null, kind: a ? dataKindOf(a.name) : active.kind });
                  },
                  { asset: 'data' },
                )}
              />
            )}
            <div className="row">
              {active.source !== 'shared' && active.source !== 'room' && (
                <button className="btn" onClick={() => void dataCache.load(active)}>
                  Reload
                </button>
              )}
              <IconButton
                icon={<Icons.trash />}
                title="Delete data source"
                onClick={() =>
                  store().update((d) => {
                    d.dataSources = d.dataSources.filter((x) => x.id !== active.id);
                  })
                }
              />
            </div>
            <SectionBlurb
              hidden={active.source === 'shared' || active.source === 'room'}
              text={
                <>
                  Use it by name in text, bindings and scripts, like <code>{`{${active.name}.length}`}</code>.
                </>
              }
              name="data sources"
              help={['data-sources']}
            />
          </div>
          <div className="data-preview data-editor">
            {active.source === 'shared' || active.source === 'room' ? (
              <>
                {loaded?.loading && <p className="muted">Loading…</p>}
                {loaded?.error && <p className="error">{loaded.error}</p>}
                {loaded && 'value' in loaded && <Preview value={loaded.value} name={active.name} />}
              </>
            ) : (
              <>
                {loaded && 'value' in loaded && <Fields value={loaded.value} name={active.name} />}
                <DataFileEditor key={active.id} source={active} />
              </>
            )}
          </div>
        </SplitColumns>
      ) : (
        <div className="data-context">
          {!s.sources.length && (
            <SectionBlurb text="Feed bindings and repeated lists from a file or a web address. Add one with + From file or + From URL." name="data sources" help={['data-sources']} />
          )}
          <ContextPanel />
        </div>
      )}
    </SplitColumns>
  );
}

/**
 * The field names a list of rows (or an object) has, so people know what to write in an expression. Each is also a handle: drag it
 * onto the page to show it (the first row's, for a list), see lib/value-drag.ts.
 */
function Fields({ value, name }: { value: unknown; name: string }) {
  const list = Array.isArray(value) && value.length && value.every((r) => r && typeof r === 'object' && !Array.isArray(r));
  const record = !!value && typeof value === 'object' && !Array.isArray(value);
  if (!list && !record) return null;
  const cols = list ? [...new Set((value as object[]).slice(0, 200).flatMap((r) => Object.keys(r)))] : Object.keys(value as object).slice(0, 60);
  const plain = isIdentifier(name);
  return (
    <div className="muted small">
      {list ? `${(value as unknown[]).length} rows · item fields:` : 'fields:'}
      <span className="field-chip-row">
        {cols.map((c) =>
          plain && isIdentifier(c) ? (
            <span key={c} className="field-chip">
              <span className="mono">{c}</span>
              <ShowOnPage value={{ expr: list ? `${name}[0].${c}` : `${name}.${c}`, label: list ? `${name}, first row: ${c}` : `${name}: ${c}` }} />
            </span>
          ) : (
            <span key={c} className="mono">
              {c}
            </span>
          ),
        )}
      </span>
    </div>
  );
}

function Preview({ value, name }: { value: unknown; name: string }) {
  if (Array.isArray(value) && value.length && value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    const cols = [...new Set(value.slice(0, 200).flatMap((r) => Object.keys(r as object)))];
    return (
      <>
        <Fields value={value} name={name} />
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.slice(0, 100).map((r, i) => (
              <tr key={i}>
                <td className="muted">{i}</td>
                {cols.map((c) => (
                  <td key={c}>{fmt((r as Record<string, unknown>)[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return <pre className="api-ref data-raw">{text.length > 20000 ? `${text.slice(0, 20000)}\n…` : text}</pre>;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
