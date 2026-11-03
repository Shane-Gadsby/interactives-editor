import { useState, useSyncExternalStore } from 'react';
import { dataKindOf, uid, type DataKind, type DataSource } from 'interactives-player';
import { store, useEditor } from '../store/store';
import { isIdentifier, uniqueName } from '../store/doc';
import { dataCache } from '../lib/data';
import { insertFiles, pickFiles } from '../lib/insert';
import { IconButton, NumberField, SelectField, TextField } from '../components/ui';
import { Icons } from '../components/icons';
import { assetKind } from '../lib/assets';

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
  const [activeId, setActiveId] = useState<string | null>(s.sources[0]?.id ?? null);
  const active = s.sources.find((d) => d.id === activeId) ?? s.sources[0];

  const setSource = (id: string, patch: Partial<DataSource>, coalesce?: string) =>
    store().update(
      (d) => {
        const ds = d.dataSources.find((x) => x.id === id);
        if (ds) Object.assign(ds, patch);
      },
      { coalesce },
    );
  const names = () => [...s.sources.map((d) => d.name), ...s.variables.map((v) => v.name)];
  const addUrl = () => {
    const ds: DataSource = { id: uid('ds'), name: uniqueName(names(), 'data').replace(/\s+/g, ''), kind: 'json', source: 'url', url: '', refresh: 0 };
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
      const name = uniqueName(taken, base).replace(/\s+/g, '');
      taken.push(name);
      return { id: uid('ds'), name, kind: dataKindOf(a.name || a.mime), source: 'asset', assetId: a.id };
    });
    store().update((d) => {
      d.dataSources.push(...sources);
    });
    if (sources[0]) setActiveId(sources[0].id);
  };

  const dataAssets = s.assets.filter((a) => assetKind(a.mime, a.name) === 'data');
  const loaded = active ? dataCache.get(active.id) : undefined;

  return (
    <div className="data-panel">
      <div className="script-list">
        {s.sources.map((d) => {
          const st = dataCache.get(d.id);
          return (
            <button key={d.id} className={`list-item${d.id === active?.id ? ' active' : ''}`} onClick={() => setActiveId(d.id)}>
              <span className={`dot ${st?.error ? 'bad' : st && 'value' in st ? 'ok' : ''}`} />
              <span className="mono">{d.name}</span>
              <span className="badge">{d.kind}</span>
            </button>
          );
        })}
        <button className="link-btn" onClick={addFiles}>
          + From file (JSON / CSV / TSV / text)
        </button>
        <button className="link-btn" onClick={addUrl}>
          + From URL
        </button>
      </div>
      {active ? (
        <div className="data-main">
          <div className="data-form">
            <TextField label="Name" mono value={active.name} commitOnBlur onChange={(v) => setSource(active.id, { name: v.trim() || active.name })} />
            {!isIdentifier(active.name) && <div className="error small">Use letters, digits and _ only, so expressions can say {active.name.replace(/\W/g, '_')}.</div>}
            {s.variables.some((v) => v.name === active.name) && <div className="error small">A variable has the same name and wins in expressions; use data.{active.name}.</div>}
            <SelectField<DataKind> label="Format" value={active.kind} options={KINDS} onChange={(v) => setSource(active.id, { kind: v })} />
            <SelectField
              label="From"
              value={active.source}
              options={[
                { value: 'asset', label: 'Uploaded file' },
                { value: 'url', label: 'URL (fetched by the player)' },
              ]}
              onChange={(v) => setSource(active.id, { source: v })}
            />
            {active.source === 'url' ? (
              <>
                <TextField label="URL" value={active.url ?? ''} commitOnBlur placeholder="https://…/items.json" onChange={(v) => setSource(active.id, { url: v.trim() })} />
                <NumberField label="Refresh" suffix="s (0 = once)" value={active.refresh ?? 0} min={0} onChange={(v) => setSource(active.id, { refresh: Math.round(v) }, `ds-refresh-${active.id}`)} />
                <p className="hint">The server must allow cross-origin requests (CORS) from wherever the interactive is published.</p>
              </>
            ) : (
              <SelectField
                label="File"
                value={active.assetId ?? ''}
                options={[{ value: '', label: dataAssets.length ? 'Choose…' : 'Upload a data file' }, ...dataAssets.map((a) => ({ value: a.id, label: a.name }))]}
                onChange={(v) => setSource(active.id, { assetId: v || null, kind: v ? dataKindOf(s.assets.find((a) => a.id === v)?.name ?? active.kind) : active.kind })}
              />
            )}
            <div className="row">
              <button className="btn" onClick={() => void dataCache.load(active)}>
                Reload
              </button>
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
            <p className="hint">
              Use it by name in bindings, text slots (<code>{`{${active.name}.length}`}</code>), Repeat on a group or frame, and scripts (<code>ix.data.{active.name}</code>, <code>ix.loadData</code>).
            </p>
          </div>
          <div className="data-preview">
            {loaded?.loading && <p className="muted">Loading…</p>}
            {loaded?.error && <p className="error">{loaded.error}</p>}
            {loaded && 'value' in loaded && <Preview value={loaded.value} />}
          </div>
        </div>
      ) : (
        <div className="panel-empty">
          <p>Data sources feed bindings, repeated lists and expressions from JSON, CSV, TSV or text, uploaded as files or fetched from a URL.</p>
          <div className="row">
            <button className="btn primary" onClick={addFiles}>
              + From file
            </button>
            <button className="btn" onClick={addUrl}>
              + From URL
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Preview({ value }: { value: unknown }) {
  if (Array.isArray(value) && value.length && value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    const cols = [...new Set(value.slice(0, 200).flatMap((r) => Object.keys(r as object)))];
    return (
      <>
        <div className="muted small">
          {value.length} rows · item fields: {cols.join(', ')}
        </div>
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
