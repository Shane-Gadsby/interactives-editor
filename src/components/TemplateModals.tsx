import { useEffect, useMemo, useState } from 'react';
import { produce } from 'immer';
import type { Asset, Project } from 'interactives-player';
import { track } from '../lib/analytics';
import { assetUrls } from '../lib/assets';
import { getTemplateAsset, getTemplateFull, listTemplates, putAsset, saveAsTemplate } from '../lib/db';
import { liveSession } from '../lib/live';
import { noteIfStale } from '../lib/stale-build';
import { applyTemplateUpdate, markReviewed, planTemplateUpdate, reviewReport, type TemplateChange, type TemplateInfo, type UpdatePlan } from '../lib/templates';
import { store, useEditor } from '../store/store';
import { ChecklistEditor, type DraftItem } from './ChecklistEditor';
import { Modal } from './ProjectModals';

/** Wait (a few seconds at most) for the open project to reach the server, so a template is made of what is on screen. */
async function settle(): Promise<void> {
  if (liveSession()) return; // the live room has the newest copy and the server reads that
  for (let i = 0; i < 20 && store().get().saveState !== 'saved'; i++) await new Promise((r) => setTimeout(r, 150));
}

/**
 * Share > Save as template. A title, a description, who can use it, and the checklist of things to change that the person who uses it
 * is walked through. Saving over one of your own templates makes its next version, which projects made from it can pull in.
 */
export function SaveTemplateModal({ onClose }: { onClose: () => void }) {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const artboardId = useEditor((s) => s.activeArtboardId);
  const [mine, setMine] = useState<TemplateInfo[] | null>(null);
  const [target, setTarget] = useState('');
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState('');
  const [everyone, setEveryone] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillFrom = (t: TemplateInfo) => {
    setName(t.name);
    setDescription(t.description);
    setEveryone(t.everyone);
    setItems(t.checklist);
  };
  useEffect(() => {
    listTemplates().then(
      (list) => {
        const own = list.filter((t) => t.mine);
        setMine(own);
        // This project already made a template: saving again is most likely meant as its next version
        const made = own.find((t) => t.source === project.id);
        if (made) {
          setTarget(made.id);
          fillFrom(made);
        }
      },
      () => setMine([]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = mine?.find((t) => t.id === target);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await settle();
      const r = await saveAsTemplate(project.id, { name, description, everyone, checklist: items.filter((i) => i.text.trim()), templateId: target || undefined, note });
      track('feature', 'template-save', { thing: target ? 'version' : 'new', detail: { everyone } });
      store().toast(r.unchanged ? `Template details saved (version ${r.version}, the project has not changed since).` : `Saved as a template, version ${r.version}. Find it under Templates on the projects page.`);
      onClose();
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Save as template" help="templates#save-as-template" onClose={() => !busy && onClose()} className="share-modal template-modal">
      <div className="share-body">
        <p className="muted">A template is a copy of this whole project that other people (or you) start new projects from. Say what is meant to be changed, so nobody ships your sample text.</p>
        {mine && mine.length > 0 && (
          <label className="field">
            <span>Save as</span>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                const t = mine.find((x) => x.id === e.target.value);
                if (t) fillFrom(t);
              }}
            >
              <option value="">A new template</option>
              {mine.map((t) => (
                <option key={t.id} value={t.id}>
                  The next version of "{t.name}" (now v{t.version})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Title</span>
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} rows={3} maxLength={1000} placeholder="What it is for, and what makes a good use of it" onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="check-row" title="Off: only you see it on the Templates tab. On: everybody who signs in to the editor can use it (they get their own copy; yours is not changed).">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone can use this template
        </label>
        <strong>Checklist: what to change</strong>
        <p className="small muted">Shown to whoever uses the template as a checklist beside their project. Select a layer first to point an item at it; clicking the item later selects that layer.</p>
        <ChecklistEditor items={items} onChange={setItems} project={project as Project} selection={{ ids: selection, artboardId }} />
        {chosen && (
          <label className="field">
            <span>What changed in this version (optional)</span>
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || !name.trim() || mine === null} onClick={() => void save()}>
            {busy ? 'Saving…' : chosen ? `Save as version ${chosen.version + 1}` : 'Save template'}
          </button>
          <button className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

const PART_WORD: Record<TemplateChange['part'], string> = { artboard: 'artboard', layer: 'layer', timeline: 'timeline', graph: 'interaction node', edge: 'connection', variable: 'variable' };

/** Pull a newer version of the template into the project: the parts nobody here touched, and what the template added. */
export function UpdateFromTemplateModal({ onClose }: { onClose: () => void }) {
  const use = useEditor((s) => s.project.template);
  const [data, setData] = useState<{ plan: UpdatePlan; snapshot: Project; info: TemplateInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!use?.id) return;
    getTemplateFull(use.id).then(
      (r) => setData({ plan: planTemplateUpdate(store().get().project, r.snapshot), snapshot: r.snapshot, info: r.template }),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const groups = useMemo(() => {
    const out = new Map<string, TemplateChange[]>();
    for (const c of data?.plan.changes ?? []) out.set(c.where || 'Project', [...(out.get(c.where || 'Project') ?? []), c]);
    return [...out.entries()];
  }, [data]);
  const keys = (data?.plan.changes ?? []).filter((c) => !off.has(c.key)).map((c) => c.key);
  const apply = async () => {
    if (!data || !use?.id) return;
    setBusy(true);
    setError(null);
    try {
      const info = { version: data.info.version, checklist: data.info.checklist };
      // Which pictures the update brings, found on a throwaway copy; they are uploaded before the project names them
      let needs: Asset[] = [];
      produce(store().get().project, (d) => {
        needs = applyTemplateUpdate(d, data.snapshot, keys, info);
      });
      const pid = store().get().project.id;
      for (const a of needs) {
        const blob = await getTemplateAsset(use.id, a.id);
        await putAsset(pid, a.id, blob);
        assetUrls.register(a.id, blob);
      }
      store().update((d) => {
        applyTemplateUpdate(d, data.snapshot, keys, info);
      });
      track('feature', 'template-update', { sum: { parts: keys.length } });
      store().toast(keys.length ? `Updated from "${data.info.name}" to version ${data.info.version}: ${keys.length} part${keys.length === 1 ? '' : 's'}.` : `Now on version ${data.info.version} of "${data.info.name}".`);
      onClose();
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Update from template" help="templates#update-from-template" onClose={() => !busy && onClose()} className="share-modal template-modal">
      <div className="share-body">
        {!data && !error && <p className="muted">Looking at the newer version…</p>}
        {error && <p className="error">{error}</p>}
        {data && (
          <>
            <p>
              "{data.info.name}" is now version {data.info.version}; this project was made from version {use?.version}.
            </p>
            {data.info.history[0]?.note && <p className="muted small">The author's note: {data.info.history[0].note}</p>}
            {data.plan.changes.length === 0 ? (
              <p className="muted">Nothing here needs to change. Every part you have not edited already matches the template.</p>
            ) : (
              <>
                <strong>Parts you have not touched, and what is new</strong>
                <p className="small muted">Untick anything you do not want. You can undo the update afterwards with Ctrl+Z.</p>
                {groups.map(([where, list]) => (
                  <div key={where} className="update-group">
                    <div className="muted small">{where}</div>
                    {list.map((c) => (
                      <label key={c.key} className="check-row">
                        <input
                          type="checkbox"
                          checked={!off.has(c.key)}
                          onChange={(e) =>
                            setOff((o) => {
                              const next = new Set(o);
                              if (e.target.checked) next.delete(c.key);
                              else next.add(c.key);
                              return next;
                            })
                          }
                        />{' '}
                        {c.label} <span className="badge">{c.kind === 'add' ? `new ${PART_WORD[c.part]}` : 'changed'}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </>
            )}
            {data.plan.kept.length > 0 && (
              <div className="update-kept">
                <strong>Kept as you have them</strong>
                <p className="small muted">The template changed these too, but so did you, so yours stay.</p>
                <ul>
                  {data.plan.kept.map((c) => (
                    <li key={c.key}>
                      {c.label} {c.where ? <span className="muted">({c.where})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.plan.removed > 0 && <p className="small muted">{data.plan.removed} part{data.plan.removed === 1 ? ' was' : 's were'} removed from the template since. Yours stay.</p>}
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => void apply()}>
                {busy ? 'Updating…' : keys.length ? `Update ${keys.length} part${keys.length === 1 ? '' : 's'}` : 'Mark as up to date'}
              </button>
              <button className="btn" disabled={busy} onClick={onClose}>
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The review step before calling a project made from a template finished: what is not ticked, and what is ticked but still the template's own. */
export function ReviewModal({ onClose, onSelect }: { onClose: () => void; onSelect: (itemId: string) => void }) {
  const project = useEditor((s) => s.project);
  const r = useMemo(() => reviewReport(project), [project]);
  const row = (id: string, text: string) => (
    <li key={id}>
      <button className="link-btn inline" onClick={() => (onSelect(id), onClose())}>
        {text}
      </button>
    </li>
  );
  return (
    <Modal title="Review before you share" help="templates#review" onClose={onClose} className="share-modal">
      <div className="share-body">
        {r.clean && r.missing.length === 0 ? (
          <p>Everything on the checklist is ticked, and each layer it points at has been changed from the template.</p>
        ) : (
          <p className="muted">A template's sample content is easy to leave behind. These are worth a second look.</p>
        )}
        {r.open.length > 0 && (
          <>
            <strong>Not ticked yet</strong>
            <ul className="review-list">{r.open.map((i) => row(i.id, i.text))}</ul>
          </>
        )}
        {r.untouched.length > 0 && (
          <>
            <strong>Ticked, but the layer is still exactly the template's</strong>
            <ul className="review-list">{r.untouched.map((i) => row(i.id, i.text))}</ul>
          </>
        )}
        {r.missing.length > 0 && (
          <>
            <strong>Points at a layer that is gone</strong>
            <ul className="review-list">{r.missing.map((i) => row(i.id, i.text))}</ul>
          </>
        )}
        <div className="row">
          <button
            className="btn primary"
            onClick={() => {
              store().update((d) => markReviewed(d));
              track('feature', 'template-review', { detail: { clean: r.clean } });
              onClose();
            }}
          >
            {r.clean ? 'Mark as reviewed' : 'Mark as reviewed anyway'}
          </button>
          <button className="btn" onClick={onClose}>
            Keep working
          </button>
        </div>
      </div>
    </Modal>
  );
}
