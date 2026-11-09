import { useDeferredValue, useMemo, useState } from 'react';
import { store, useEditor } from '../store/store';
import { deleteAsset } from '../lib/db';
import { confirmDialog } from '../components/dialogs';
import { analyzeUsage, unusedAssetIds, type UsageItem, type UsageReport, type UsageSource } from '../lib/dependencies';
import { SplitColumns } from '../components/SplitColumns';

type Cat = 'artboards' | 'assets' | 'variables' | 'dataSources' | 'scripts' | 'timelines' | 'layers' | 'missing';

const CATS: { id: Cat; label: string; tip: string }[] = [
  { id: 'artboards', label: 'Artboards', tip: 'Artboards, and what shows or switches to them' },
  { id: 'assets', label: 'Assets', tip: 'Images, video, audio, fonts and data files, and what uses them' },
  { id: 'variables', label: 'Variables', tip: 'Variables, and the layers, expressions and interactions that read them' },
  { id: 'dataSources', label: 'Data', tip: 'Data sources, and what reads them' },
  { id: 'scripts', label: 'Scripts', tip: 'Scripts, and what runs them' },
  { id: 'timelines', label: 'Timelines', tip: 'Timelines, and what plays them' },
  { id: 'layers', label: 'Layers', tip: 'Layers that interactions, constraints or timeline tracks point at' },
  { id: 'missing', label: 'Broken', tip: 'References that point at something that no longer exists' },
];

const KIND_LABEL: Record<string, string> = { artboard: 'artboard', asset: 'asset', variable: 'variable', data: 'data source', script: 'script', timeline: 'timeline', layer: 'layer' };

/** Short text for who is using something. */
export function sourceLabel(s: UsageSource, multi: boolean): { kind: string; name: string; where: string } {
  const where = 'artboardName' in s && multi ? s.artboardName : '';
  switch (s.type) {
    case 'layer':
      return { kind: s.nodeType, name: s.name, where };
    case 'logic':
      return { kind: 'interaction', name: s.name, where };
    case 'joystick':
      return { kind: 'joystick', name: s.name, where };
    case 'blend':
      return { kind: 'blend', name: s.name, where };
    case 'timeline':
      return { kind: 'timeline', name: s.name, where };
    case 'artboard':
      return { kind: 'artboard', name: s.name, where: '' };
    case 'script':
      return { kind: 'script', name: s.name, where: '' };
    case 'data':
      return { kind: 'data source', name: s.name, where: '' };
    case 'font':
      return { kind: 'font', name: s.name, where: '' };
    default:
      return { kind: 'project', name: s.name, where: '' };
  }
}

/** Jump to where a source lives: select the layer or artboard, or open the tab that edits it. */
export function go(s: UsageSource): boolean {
  const st = store();
  switch (s.type) {
    case 'layer':
      st.select([s.id], { artboardId: s.artboardId });
      return true;
    case 'logic':
      st.set({ activeArtboardId: s.artboardId, selection: [], artboardSelected: false, bottomTab: 'logic', logicSelection: s.id });
      return true;
    case 'joystick':
    case 'blend':
      st.set({ activeArtboardId: s.artboardId, selection: [], artboardSelected: false, bottomTab: 'timeline' });
      return true;
    case 'timeline':
      st.set({ activeArtboardId: s.artboardId, selection: [], artboardSelected: false, activeTimelineId: s.id, playhead: 0, bottomTab: 'timeline' });
      return true;
    case 'artboard':
      st.set({ activeArtboardId: s.id, selection: [], artboardSelected: true });
      return true;
    case 'script':
      st.set({ bottomTab: 'scripts' });
      return true;
    case 'data':
      st.set({ bottomTab: 'data' });
      return true;
    default:
      return false;
  }
}

/** Where to go for the item itself (the thing being used), if the editor has a place for it. */
function itemSource(i: UsageItem): UsageSource | null {
  switch (i.kind) {
    case 'artboard':
      return { type: 'artboard', id: i.id, name: i.name };
    case 'timeline':
      return { type: 'timeline', artboardId: i.artboardId!, artboardName: i.artboardName ?? '', id: i.id, name: i.name };
    case 'layer':
      return { type: 'layer', artboardId: i.artboardId!, artboardName: i.artboardName ?? '', id: i.id, name: i.name, nodeType: 'layer' };
    case 'script':
      return { type: 'script', id: i.id, name: i.name };
    case 'data':
      return { type: 'data', id: i.id, name: i.name };
    case 'variable':
      return null;
    default:
      return null;
  }
}

/** Remove assets nothing uses, after asking. Same clean-up as the assets panel's remove button. */
export async function removeUnusedAssets(report: UsageReport, projectId: string) {
  const ids = unusedAssetIds(report);
  if (!ids.length) return;
  const names = report.assets.filter((a) => a.unused).map((a) => a.name);
  const list = names.slice(0, 12).join('\n') + (names.length > 12 ? `\n... and ${names.length - 12} more` : '');
  const n = `${ids.length} unused asset${ids.length === 1 ? '' : 's'}`;
  if (!(await confirmDialog({ title: 'Remove unused assets', message: `Remove ${n}? This deletes the files too.\n\n${list}`, confirmLabel: 'Remove', danger: true }))) return;
  const gone = new Set(ids);
  store().update((d) => {
    d.assets = d.assets.filter((a) => !gone.has(a.id));
    d.fonts = d.fonts.filter((f) => !f.assetId || !gone.has(f.assetId));
  });
  for (const id of ids) {
    try {
      await deleteAsset(projectId, id);
    } catch {
      /* already gone */
    }
  }
  store().toast(`Removed ${ids.length} unused asset${ids.length === 1 ? '' : 's'}`);
}

/** What uses what: every artboard, asset, variable, data source, script and timeline with the places it is used, and a flag on the ones nothing uses. */
export function UsagePanel() {
  const project = useEditor((st) => st.project);
  // The analysis walks the whole document: while changes keep coming (typing in a field) it waits for a pause
  const analysed = useDeferredValue(project);
  const report = useMemo(() => analyzeUsage(analysed), [analysed]);
  const [cat, setCat] = useState<Cat>('assets');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const multi = project.artboards.length > 1;

  const items: UsageItem[] = cat === 'missing' ? [] : report[cat];
  const shown = onlyUnused ? items.filter((i) => i.unused) : items;
  const active = shown.find((i) => i.id === activeId) ?? shown[0];
  const unusedAssets = unusedAssetIds(report).length;

  const countOf = (c: Cat) => (c === 'missing' ? report.missing.length : report[c].filter((i) => i.unused).length);

  return (
    <div className="usage">
      <div className="usage-bar">
        {CATS.map((c) => {
          const n = countOf(c.id);
          return (
            <button key={c.id} className={`usage-cat${cat === c.id ? ' active' : ''}`} title={c.tip} onClick={() => setCat(c.id)}>
              {c.label}
              {c.id !== 'layers' && n > 0 && (
                <span className={`badge usage-flag${c.id === 'missing' ? ' bad' : ''}`} title={c.id === 'missing' ? `${n} broken reference${n === 1 ? '' : 's'}` : `${n} unused`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
        <div className="spacer" />
        {cat !== 'missing' && cat !== 'layers' && (
          <label className="usage-only" title="Show only the items nothing uses">
            <input type="checkbox" checked={onlyUnused} onChange={(e) => setOnlyUnused(e.target.checked)} /> Unused only
          </label>
        )}
        <button
          className="btn small-btn"
          disabled={!unusedAssets}
          title={unusedAssets ? `Delete the ${unusedAssets} asset${unusedAssets === 1 ? '' : 's'} that nothing uses (asks first)` : 'Every asset is in use'}
          onClick={() => void removeUnusedAssets(report, project.id)}
        >
          Remove unused assets{unusedAssets ? ` (${unusedAssets})` : ''}
        </button>
      </div>
      {cat === 'missing' ? (
        <div className="usage-missing">
          {report.missing.length === 0 && <div className="panel-empty">No broken references. Everything points at something that exists.</div>}
          {report.missing.map((m, i) => {
            const l = sourceLabel(m.by, multi);
            return (
              <button key={i} className="usage-row" title={`Go to ${l.name}`} onClick={() => go(m.by)}>
                <span className="badge">{l.kind}</span> <strong>{l.name}</strong>
                {l.where && <span className="muted"> in {l.where}</span>}
                <span className="muted">
                  {' '}
                  {m.problem ? (
                    m.problem
                  ) : (
                    <>
                      points at a missing {KIND_LABEL[m.what]} ({m.how}): <code>{m.ref}</code>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <SplitColumns id="usage" columns={[{ width: 260, min: 160, max: 520 }, 'flex']} className="usage-body">
          <div className="usage-list">
            {shown.length === 0 && <div className="hint">{items.length === 0 ? `No ${CATS.find((c) => c.id === cat)!.label.toLowerCase()} in this project.` : 'Nothing unused here.'}</div>}
            {shown.map((i) => (
              <button key={i.id} className={`list-item${i.id === active?.id ? ' active' : ''}`} title={i.unused ? `${i.name}: nothing uses this` : `${i.name}: used ${i.usedBy.length} time${i.usedBy.length === 1 ? '' : 's'}`} onClick={() => setActiveId(i.id)}>
                <span className="usage-name">
                  {i.name}
                  {i.artboardName && multi && <span className="muted"> · {i.artboardName}</span>}
                </span>
                {i.unused ? <span className="badge usage-flag">unused</span> : <span className="badge">{i.usedBy.length}</span>}
              </button>
            ))}
          </div>
          <div className="usage-detail">
            {!active ? (
              <div className="panel-empty">
                <p>Pick an item to see where it is used.</p>
              </div>
            ) : (
              <>
                <div className="usage-head">
                  <strong>{active.name}</strong>
                  <span className="muted">{KIND_LABEL[active.kind]}</span>
                  {active.unused && <span className="badge usage-flag">unused</span>}
                  <div className="spacer" />
                  {itemSource(active) && (
                    <button className="btn small-btn" title={`Select ${active.name} in the editor`} onClick={() => go(itemSource(active)!)}>
                      Go to {KIND_LABEL[active.kind]}
                    </button>
                  )}
                </div>
                {active.usedBy.length === 0 ? (
                  <p className="hint">Nothing uses this{active.kind === 'asset' ? '. Use "Remove unused assets" to delete it with the others.' : '.'}</p>
                ) : (
                  <>
                    <div className="hint">Used by, click to jump there{active.usedBy.some((u) => u.loose) ? ' (a "?" may be a false hit)' : ''}:</div>
                    {active.usedBy.map((u, n) => {
                      const l = sourceLabel(u.by, multi);
                      const can = u.by.type !== 'font' && u.by.type !== 'project';
                      return (
                        <button key={n} className="usage-row" disabled={!can} title={can ? `Go to ${l.name}` : 'Nothing to jump to'} onClick={() => go(u.by)}>
                          <span className="badge">{l.kind}</span> <strong>{l.name}</strong>
                          {l.where && <span className="muted"> in {l.where}</span>}
                          <span className="muted"> · {u.how}</span>
                          {u.loose && (
                            <span className="badge" title="Found by reading code or text, so it may be a false hit">
                              ?
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </SplitColumns>
      )}
    </div>
  );
}
