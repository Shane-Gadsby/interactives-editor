import { useEffect, useMemo, useState } from 'react';
import { track } from '../lib/analytics';
import { changeTemplate, createProjectRecord, deleteTemplate, exampleAssetBytes, exampleThumbUrl, getExample, listExamples, listTemplates, setProjectMeta, templateThumbUrl, useExample, useTemplate, type ExampleInfo } from '../lib/db';
import { standaloneHtml } from '../lib/export';
import { STARTERS, projectFromStarter, type Starter } from '../lib/template-starters';
import { CHECKLIST_FLAG, type TemplateInfo } from '../lib/templates';
import { noteIfStale } from '../lib/stale-build';
import { confirmDialog } from './dialogs';
import { Modal } from './ProjectModals';
import { ChecklistEditor, type DraftItem } from './ChecklistEditor';
import { Icons } from './icons';

type Sub = 'mine' | 'shared' | 'builtin' | 'examples';
const SUB_KEY = 'ix.home.templates';

const keep = (v: string) => {
  try {
    localStorage.setItem(SUB_KEY, v);
  } catch {
    /* private window */
  }
};

/** Pictures of the built-in starters, made once from the real project so they always look like what you get. */
const starterThumbs = new Map<string, Promise<string | null>>();
function starterThumb(s: Starter): Promise<string | null> {
  let p = starterThumbs.get(s.key);
  if (!p) {
    p = import('../lib/image-export')
      .then(({ projectThumbnail }) => projectThumbnail(s.build().project, 360))
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch(() => null);
    starterThumbs.set(s.key, p);
  }
  return p;
}

export function StarterPicture({ starter }: { starter: Starter }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void starterThumb(starter).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [starter]);
  if (url) return <img className="thumb-board thumb-img" src={url} alt="" />;
  return <span className="thumb-board template-blank">{url === undefined ? '' : starter.name}</span>;
}

export type Pick = { kind: 'saved'; t: TemplateInfo } | { kind: 'builtin'; s: Starter } | { kind: 'example'; e: ExampleInfo };

/** Makes the project for a pick (a saved template, a built-in starter or an example) and says which, so the checklist opens for the ones that have one. Returns the new project's id. */
export async function makeFromPick(pick: Pick, o: { name: string; folder: string | null }): Promise<string> {
  let id: string;
  if (pick.kind === 'saved') {
    id = await useTemplate(pick.t.id, { name: o.name, folder: o.folder });
  } else if (pick.kind === 'example') {
    id = await useExample(pick.e.key, { name: o.name, folder: o.folder });
  } else {
    const p = projectFromStarter(pick.s, o.name);
    await createProjectRecord(p);
    if (o.folder) await setProjectMeta(p.id, { folder: o.folder }).catch(() => undefined);
    id = p.id;
  }
  track('feature', 'template-use', { thing: pick.kind === 'saved' ? 'saved' : pick.kind === 'example' ? `example-${pick.e.key}`.slice(0, 40) : pick.s.key });
  if (pick.kind !== 'example') {
    try {
      sessionStorage.setItem(CHECKLIST_FLAG, id);
    } catch {
      /* the checklist tab just won't open by itself */
    }
  }
  return id;
}

/** "Use template": what it expects of you (its checklist), a name, then a new project in the folder you have open. */
function UseModal({ pick, folder: initialFolder, folders, onClose, onMade }: { pick: Pick; folder: string | null; folders: string[]; onClose: () => void; onMade: (id: string) => void }) {
  const [folder, setFolder] = useState<string | null>(initialFolder);
  const title = pick.kind === 'saved' ? pick.t.name : pick.kind === 'builtin' ? pick.s.name : pick.e.title;
  const description = pick.kind === 'saved' ? pick.t.description : pick.kind === 'builtin' ? pick.s.description : pick.e.description;
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useMemo(() => (pick.kind === 'saved' ? pick.t.checklist.map((i) => i.text) : pick.kind === 'builtin' ? pick.s.build().checklist.map((i) => i.text) : []), [pick]);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      onMade(await makeFromPick(pick, { name: name.trim() || title, folder }));
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title={pick.kind === 'example' ? 'Make your own copy' : 'Use template'} help={pick.kind === 'example' ? 'templates#examples' : 'templates#use-a-template'} onClose={() => !busy && onClose()} className="share-modal">
      <div className="share-body use-template">
        <label className="field">
          <span>Name of your new project</span>
          <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && void go()} />
        </label>
        {description && <p className="muted">{description}</p>}
        {pick.kind === 'example' ? (
          <p className="small muted">The example stays as it is for everyone. You get a copy of it in your own projects to change, break and keep.</p>
        ) : items.length > 0 ? (
          <>
            <strong>Things to change</strong>
            <p className="small muted">This template has hard-coded content in it. A checklist opens with your new project to walk you through replacing it.</p>
            <ul className="use-items">
              {items.map((t, i) => (
                <li key={i}>
                  <Icons.check width={12} height={12} /> {t}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="small muted">The author did not list anything to change. Look through it before you share it: the words and pictures in it are the author's.</p>
        )}
        <label className="field">
          <span>Folder</span>
          <select value={folder ?? ''} onChange={(e) => setFolder(e.target.value || null)}>
            <option value="">No folder</option>
            {[...new Set([...folders, ...(initialFolder ? [initialFolder] : [])])].sort((a, b) => a.localeCompare(b)).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => void go()}>
            {busy ? 'Making your project…' : pick.kind === 'example' ? 'Make my copy' : 'Create project'}
          </button>
          <button className="btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Plays an example the way a share link would (the single-file build in a sandbox), without opening anything of yours. */
function PlayModal({ e, onClose, onCopy }: { e: ExampleInfo; onClose: () => void; onCopy: () => void }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getExample(e.key)
      .then(({ project }) => standaloneHtml(project, { bytesFor: (a) => exampleAssetBytes(e.key, a.id) }))
      .then((h) => live && setHtml(h))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [e.key]);
  return (
    <Modal title={`Example: ${e.title}`} help="templates#examples" onClose={onClose} className="preview-modal example-play">
      <div className="preview-body">
        {html ? <iframe title={e.title} sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" srcDoc={html} /> : error ? <div className="center-msg">Could not play it: {error}</div> : <div className="center-msg muted">Building…</div>}
      </div>
      <div className="row example-bar">
        <span className="muted small">{e.description}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={onCopy} title="Get your own copy of this example to change">
          Make my copy
        </button>
      </div>
    </Modal>
  );
}

/** Title, description, who sees it and the checklist of a template of yours. The template itself is only changed by saving it again from a project. */
function EditModal({ t, onClose, onSaved }: { t: TemplateInfo; onClose: () => void; onSaved: (next: TemplateInfo) => void }) {
  const [name, setName] = useState(t.name);
  const [description, setDescription] = useState(t.description);
  const [everyone, setEveryone] = useState(t.everyone);
  const [items, setItems] = useState<DraftItem[]>(t.checklist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await changeTemplate(t.id, { name, description, everyone, checklist: items.filter((i) => i.text.trim()) }));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title="Template details" help="templates#save-as-template" onClose={onClose} className="share-modal template-modal">
      <div className="share-body">
        <label className="field">
          <span>Title</span>
          <input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} rows={3} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone can use this template
        </label>
        <strong>Checklist</strong>
        <ChecklistEditor items={items} onChange={setItems} />
        <p className="small muted">To change the template's content, open the project it was made from and use Share &gt; Save as template, choosing this one.</p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || !name.trim()} onClick={() => void save()}>
            Save
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

const groupsOf = (list: ExampleInfo[]): [string, ExampleInfo[]][] => {
  const out = new Map<string, ExampleInfo[]>();
  for (const e of list) out.set(e.group, [...(out.get(e.group) ?? []), e]);
  return [...out.entries()];
};

export function TemplatesTab({ folder, folders, open }: { folder: string | null; folders: string[]; open: (id: string) => void }) {
  const [list, setList] = useState<TemplateInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<Sub | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [editing, setEditing] = useState<TemplateInfo | null>(null);
  const [examples, setExamples] = useState<ExampleInfo[] | null>(null);
  const [playing, setPlaying] = useState<ExampleInfo | null>(null);
  useEffect(() => {
    listExamples().then(setExamples, () => setExamples([]));
  }, []);
  useEffect(() => {
    listTemplates().then(
      (l) => setList(l),
      (e) => {
        setError(e instanceof Error ? e.message : String(e));
        setList([]);
      },
    );
  }, []);
  const mine = (list ?? []).filter((t) => t.mine);
  const shared = (list ?? []).filter((t) => !t.mine);
  // The first visit lands where there is something: yours, else the starters
  const shown: Sub = sub ?? (mine.length ? 'mine' : 'builtin');
  const choose = (s: Sub) => {
    setSub(s);
    keep(s);
  };
  const remove = async (t: TemplateInfo) => {
    if (!(await confirmDialog({ title: 'Delete template', message: `Delete the template "${t.name}"? Projects already made from it keep their content; they just stop seeing updates.`, confirmLabel: 'Delete template', danger: true }))) return;
    try {
      await deleteTemplate(t.id);
      track('feature', 'template-delete');
      setList((l) => l && l.filter((x) => x.id !== t.id));
    } catch (e) {
      if (!noteIfStale(e)) setError(e instanceof Error ? e.message : String(e));
    }
  };
  const saved = shown === 'mine' ? mine : shown === 'shared' ? shared : [];
  return (
    <div className="templates-tab">
      <div className="templates-head">
        <div className="seg" role="tablist" aria-label="Which templates">
          <button role="tab" aria-selected={shown === 'mine'} className={shown === 'mine' ? 'on' : ''} onClick={() => choose('mine')} title="Templates you saved from your own projects">
            Mine <span className="tag-n">{mine.length}</span>
          </button>
          <button role="tab" aria-selected={shown === 'shared'} className={shown === 'shared' ? 'on' : ''} onClick={() => choose('shared')} title="Templates other people shared with everyone">
            Shared <span className="tag-n">{shared.length}</span>
          </button>
          <button role="tab" aria-selected={shown === 'builtin'} className={shown === 'builtin' ? 'on' : ''} onClick={() => choose('builtin')} title="Starters that come with Interactives, always up to date with the editor">
            Built-in <span className="tag-n">{STARTERS.length}</span>
          </button>
          <button role="tab" aria-selected={shown === 'examples'} className={shown === 'examples' ? 'on' : ''} onClick={() => choose('examples')} title="Finished projects that come with Interactives, the same for everyone: play one, or make your own copy to change">
            Examples <span className="tag-n">{examples?.length ?? 0}</span>
          </button>
        </div>
        <span className="muted small">{folder ? `New projects go in "${folder}".` : 'Use a template to start a project from it.'}</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="project-grid templates-grid" style={{ '--card-size': '260px' } as React.CSSProperties}>
        {(shown === 'examples' ? examples === null : list === null) && <p className="muted">Loading…</p>}
        {shown === 'builtin' &&
          STARTERS.map((s) => (
            <article key={s.key} className="project-card template-card">
              <button className="project-thumb" onClick={() => setPick({ kind: 'builtin', s })} aria-label={`Use the ${s.name} starter`}>
                <StarterPicture starter={s} />
              </button>
              <div className="project-info">
                <div className="project-name">{s.name}</div>
                <div className="muted small template-desc">{s.description}</div>
                <div className="card-tags">
                  {s.tags.map((t) => (
                    <span key={t} className="tag-chip static">
                      <span className="tag-label">{t}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="project-actions">
                <span className="muted small">Starter</span>
                <span className="spacer" />
                <button className="btn primary" onClick={() => setPick({ kind: 'builtin', s })} title="Make a new project from this starter, with a checklist of what to change">
                  Use template
                </button>
              </div>
            </article>
          ))}

        {shown === 'examples' &&
          groupsOf(examples ?? []).map(([group, items]) => (
            <section key={group} className="example-group">
              <h3>{group}</h3>
              <div className="project-grid templates-grid" style={{ '--card-size': '260px' } as React.CSSProperties}>
                {items.map((e) => (
                  <article key={e.key} className="project-card template-card example-card">
                    <button className="project-thumb" onClick={() => setPlaying(e)} aria-label={`Play ${e.title}`}>
                      <img className="thumb-board thumb-img" src={exampleThumbUrl(e.key)} alt="" loading="lazy" style={e.preview ? { aspectRatio: `${e.preview.width} / ${e.preview.height}` } : undefined} onError={(ev) => ((ev.target as HTMLImageElement).style.visibility = 'hidden')} />
                    </button>
                    <div className="project-info">
                      <div className="project-name">{e.title}</div>
                      <div className="muted small template-desc">{e.description}</div>
                      <div className="card-tags">
                        {e.tags.map((t) => (
                          <span key={t} className="tag-chip static">
                            <span className="tag-label">{t}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="project-actions">
                      <button className="btn" onClick={() => setPlaying(e)} title="Play it here. Nothing of yours is touched">
                        Play
                      </button>
                      <span className="spacer" />
                      <button className="btn primary" onClick={() => setPick({ kind: 'example', e })} title="Make your own copy of this example, to change as you like">
                        Make my copy
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        {list !== null && (shown === 'mine' || shown === 'shared') && saved.length === 0 && (
          <div className="empty-state">
            <h2>{shown === 'mine' ? 'No templates of yours yet' : 'Nothing shared yet'}</h2>
            <p>
              {shown === 'mine'
                ? 'Open a project and choose Share > Save as template. Give it a title, say what to change, and it appears here for you (and for everyone, if you let them).'
                : 'When someone saves a template and lets everyone use it, it shows up here.'}
            </p>
            <button className="btn" onClick={() => choose('builtin')}>
              See the built-in starters
            </button>
          </div>
        )}
        {saved.map((t) => (
          <article key={t.id} className="project-card template-card">
            <button className="project-thumb" onClick={() => setPick({ kind: 'saved', t })} aria-label={`Use ${t.name}`}>
              {t.thumb ? (
                <img className="thumb-board thumb-img" src={templateThumbUrl(t.id, t.thumb)} alt="" loading="lazy" style={t.preview ? { aspectRatio: `${t.preview.width} / ${t.preview.height}` } : undefined} />
              ) : (
                t.preview && <span className="thumb-board" style={{ background: t.preview.background, aspectRatio: `${t.preview.width} / ${t.preview.height}` }} />
              )}
            </button>
            <div className="project-info">
              <div className="project-name">
                {t.name}
                <span className="badge library-badge" title={`Version ${t.version}. Projects made from it can pull newer versions in`}>
                  v{t.version}
                </span>
              </div>
              {t.description && <div className="muted small template-desc">{t.description}</div>}
              <div className="muted small">
                {t.mine ? (t.everyone ? 'Everyone can use it' : 'Only you') : `by ${t.owner?.name ?? t.owner?.username ?? 'someone'}`} · {t.checklist.length} to change · {new Date(t.updated).toLocaleDateString()}
              </div>
            </div>
            <div className="project-actions">
              {t.mine && (
                <>
                  <button className="icon-btn" title="Title, description, who can use it, checklist" aria-label={`Edit details of ${t.name}`} onClick={() => setEditing(t)}>
                    <Icons.pencil width={15} />
                  </button>
                  <button className="icon-btn" title="Delete this template" aria-label={`Delete ${t.name}`} onClick={() => void remove(t)}>
                    <Icons.trash width={15} />
                  </button>
                </>
              )}
              <span className="spacer" />
              <button className="btn primary" onClick={() => setPick({ kind: 'saved', t })} title="Make a new project from this template, with a checklist of what to change">
                Use template
              </button>
            </div>
          </article>
        ))}
      </div>
      {playing && <PlayModal e={playing} onClose={() => setPlaying(null)} onCopy={() => (setPick({ kind: 'example', e: playing }), setPlaying(null))} />}
      {pick && <UseModal pick={pick} folder={folder} folders={folders} onClose={() => setPick(null)} onMade={open} />}
      {editing && <EditModal t={editing} onClose={() => setEditing(null)} onSaved={(next) => setList((l) => l && l.map((x) => (x.id === next.id ? { ...x, ...next } : x)))} />}
    </div>
  );
}
