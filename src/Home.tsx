import { useEffect, useMemo, useState } from 'react';
import { createProject, PACKAGE_EXTENSION } from 'interactives-player';
import { createProjectRecord, deleteProject, duplicateProject, importPackage, listProjects, loadProjectRecord, META_MAX_LABEL, META_MAX_TAGS, session, setProjectMeta, type ProjectMeta, type SessionInfo } from './lib/db';
import { downloadPackage } from './lib/export';
import { pickFiles } from './lib/insert';
import { confirmDialog, promptDialog } from './components/dialogs';
import { Icons } from './components/icons';
import { PrefsModal } from './components/PrefsModal';
import { prefs } from './lib/prefs';
import { sessionUser, type SessionUser } from './lib/session';
import { noteIfStale } from './lib/stale-build';

declare global {
  interface Window {
    powerUser?: { isToggleKey(e: KeyboardEvent): boolean; canUse(access: unknown): boolean };
  }
}

type FolderSel = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string };
type SortKey = 'updated' | 'name';

const SORT_KEY = 'ix.home.sort';
const NEW_FOLDER = '\u0000new';

/** The tag text as the server will keep it: collapsed spaces, trimmed, capped. */
const cleanLabel = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, META_MAX_LABEL);

function readSort(): SortKey {
  try {
    return localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'updated';
  } catch {
    return 'updated';
  }
}

/** Add-a-tag input on a project card: a "+" button that turns into a small text field. */
function TagAdder({ onAdd, disabled, suggestions }: { onAdd: (tag: string) => void; disabled: boolean; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = cleanLabel(draft);
    if (t) onAdd(t);
    setDraft('');
    setOpen(false);
  };
  if (!open)
    return (
      <button className="tag-add" disabled={disabled} onClick={() => setOpen(true)} title="Add a tag to this project">
        <Icons.plus width={10} height={10} /> tag
      </button>
    );
  return (
    <>
      <input
        className="tag-input"
        autoFocus
        list="home-tag-suggestions"
        value={draft}
        maxLength={META_MAX_LABEL}
        placeholder="New tag"
        title="Type a tag and press Enter (Esc to cancel)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft('');
            setOpen(false);
          }
        }}
      />
      <datalist id="home-tag-suggestions">
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}

export function Home({ open }: { open: (id: string) => void }) {
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<SessionInfo | null>(null);
  const [power, setPower] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  // The toolbox session's own view of who this is (the server's check can be missing in local dev)
  const [me2, setMe2] = useState<SessionUser | null>(null);
  useEffect(() => {
    void sessionUser().then(setMe2);
  }, []);
  const [folderSel, setFolderSel] = useState<FolderSel>({ kind: 'all' });
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>(readSort);

  const refresh = async (all = power) => {
    try {
      setList(await listProjects(all));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh(false);
    session()
      .then(setWho)
      .catch(() => setWho(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Power user (god mode): the suite's shared key and rule; the server checks again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!window.powerUser?.isToggleKey(e) || !who?.power) return;
      e.preventDefault();
      const next = !power;
      setPower(next);
      void refresh(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, power]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (!noteIfStale(err)) setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** A project made while a folder is selected goes into that folder (a failure here must not lose the new project) */
  const intoSelectedFolder = async (id: string) => {
    if (folderSel.kind !== 'folder') return;
    try {
      await setProjectMeta(id, { folder: folderSel.name });
    } catch {
      /* it stays in "No folder" and can be moved from its card */
    }
  };

  const create = () =>
    run(async () => {
      const p = createProject('Untitled project');
      // Every new project starts with the person's default font (Open Sans unless they changed it)
      const font = prefs().defaultFont.trim();
      if (font) p.fonts.push({ family: font, source: 'google', weights: [400, 600, 700] });
      await createProjectRecord(p);
      await intoSelectedFolder(p.id);
      open(p.id);
    });

  const doImport = () =>
    run(async () => {
      const files = await pickFiles(`${PACKAGE_EXTENSION},.zip,.json,.lottie,.riv,.rev,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft`, false);
      const f = files[0];
      if (!f) return;
      // Lottie / Rive (.riv, .rev) / Photoshop / Illustrator / PDF / VectorCraft / PhotoCraft files become a new project; anything else is an Interactives package or project JSON.
      const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
      const text = new TextDecoder().decode(head);
      const animation = /\.(lottie|riv|rev|psd|ai|pdf|dxf|dwg|vectorcraft|drawcraft|pcraft)$/i.test(f.name) || (/\.json$/i.test(f.name) && /"layers"\s*:/.test(text) && !/"format"\s*:\s*"interactives"/.test(text));
      if (animation) {
        const { chooseLinking, projectFromAnimation } = await import('./lib/importers');
        const linking = await chooseLinking([f]);
        if (!linking) return;
        const id = await projectFromAnimation(f, linking.get(f));
        await intoSelectedFolder(id);
        await refresh();
        open(id);
        return;
      }
      const p = await importPackage(f);
      await intoSelectedFolder(p.id);
      await refresh();
      open(p.id);
    });

  const me = who?.user?.username;

  const changeSort = (next: SortKey) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* private window */
    }
  };

  /** Save tags / folder for one project and fold the server's answer back into the list. */
  const saveMeta = (id: string, patch: { tags?: string[]; folder?: string | null }) =>
    run(async () => {
      const next = await setProjectMeta(id, patch);
      setList((l) => l && l.map((p) => (p.id === id ? { ...p, tags: next.tags ?? [], folder: next.folder ?? null } : p)));
    });

  const addTag = (p: ProjectMeta, tag: string) => {
    const tags = p.tags ?? [];
    if (tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    if (tags.length >= META_MAX_TAGS) return setError(`A project can have up to ${META_MAX_TAGS} tags`);
    void saveMeta(p.id, { tags: [...tags, tag] });
  };

  const moveTo = async (p: ProjectMeta, value: string) => {
    if (value === NEW_FOLDER) {
      const name = cleanLabel((await promptDialog({ title: 'New folder', label: 'Name for the new folder', confirmLabel: 'Create folder' })) ?? '');
      if (name) void saveMeta(p.id, { folder: name });
      return;
    }
    void saveMeta(p.id, { folder: value || null });
  };

  /** Rename / delete touch every project in the folder that this list holds, one request each. */
  const renameFolder = async (name: string) => {
    const next = cleanLabel((await promptDialog({ title: 'Rename folder', label: `Rename folder "${name}" to`, initial: name, confirmLabel: 'Rename' })) ?? '');
    if (!next || next === name) return;
    void run(async () => {
      await Promise.all((list ?? []).filter((p) => p.folder === name).map((p) => setProjectMeta(p.id, { folder: next })));
      setFolderSel({ kind: 'folder', name: next });
      await refresh();
    });
  };

  const deleteFolder = async (name: string) => {
    if (!(await confirmDialog({ title: 'Delete folder', message: `Delete the folder "${name}"? Its projects are kept and move to "No folder".`, confirmLabel: 'Delete folder', danger: true }))) return;
    void run(async () => {
      await Promise.all((list ?? []).filter((p) => p.folder === name).map((p) => setProjectMeta(p.id, { folder: null })));
      setFolderSel({ kind: 'all' });
      await refresh();
    });
  };

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const p of list ?? []) {
      if (p.folder) counts.set(p.folder, (counts.get(p.folder) ?? 0) + 1);
      else none++;
    }
    return { names: [...counts.keys()].sort((a, b) => a.localeCompare(b)), counts, none };
  }, [list]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of list ?? []) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = (list ?? []).filter((p) => {
      if (folderSel.kind === 'none' && p.folder) return false;
      if (folderSel.kind === 'folder' && p.folder !== folderSel.name) return false;
      if (tagFilter && !(p.tags ?? []).some((t) => t.toLowerCase() === tagFilter.toLowerCase())) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.tags ?? []).some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
    if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    else out.sort((a, b) => b.updated.localeCompare(a.updated));
    return out;
  }, [list, folderSel, tagFilter, query, sort]);

  const filtering = folderSel.kind !== 'all' || !!tagFilter || !!query.trim();

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          <span>Interactives</span>
        </div>
        <div className="home-actions">
          {(who?.user || me2) && <span className="muted" title="Signed in through the toolbox">{who?.user?.name ?? me2?.name ?? who?.user?.username}</span>}
          <button className="icon-btn" title="Preferences (theme, mouse wheel, tooltips)" onClick={() => setPrefsOpen(true)}>
            <Icons.gear width={16} />
          </button>
          {prefsOpen && <PrefsModal onClose={() => setPrefsOpen(false)} />}
          <a className="btn" href="#/help" title="How to use Interactives (F1 to search)">
            <Icons.help width={14} /> Help
          </a>
          <button className="btn" onClick={doImport} disabled={busy} title={`Import a file as a new project. Accepts ${PACKAGE_EXTENSION} packages, project JSON, and Lottie, Rive, Photoshop (PSD), Illustrator (AI), PDF, VectorCraft and PhotoCraft files`}>
            <Icons.upload width={14} /> Import
          </button>
          <button className="btn primary" onClick={create} disabled={busy}>
            <Icons.plus width={14} /> New project
          </button>
        </div>
      </header>
      {power && <div className="power-banner">Power user mode: showing everyone's projects (F9 to turn off)</div>}
      {error && <div className="error-banner">{error}</div>}
      {!!list?.length && (
        <div className="home-tools">
          <input
            type="search"
            className="home-search"
            value={query}
            placeholder="Search name or tag"
            title="Show only projects whose name or tags contain this text"
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="home-sort muted small" title="Order of the project cards">
            Sort{' '}
            <select value={sort} onChange={(e) => changeSort(e.target.value as SortKey)}>
              <option value="updated">Last updated</option>
              <option value="name">Name</option>
            </select>
          </label>
          {tagCounts.length > 0 && (
            <div className="tag-filter" title="Click a tag to show only projects that have it">
              <Icons.tag width={13} height={13} />
              {tagCounts.map(([t, n]) => (
                <button key={t} className={`tag-chip${tagFilter?.toLowerCase() === t.toLowerCase() ? ' active' : ''}`} onClick={() => setTagFilter(tagFilter?.toLowerCase() === t.toLowerCase() ? null : t)} title={`${n} project${n === 1 ? '' : 's'} tagged "${t}". Click to filter, click again to clear`}>
                  {t} <span className="tag-n">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="home-body">
        {!!list?.length && (
          <aside className="folder-side" aria-label="Folders">
            <button className={`folder-item${folderSel.kind === 'all' ? ' active' : ''}`} onClick={() => setFolderSel({ kind: 'all' })} title="Every project">
              <span>All projects</span>
              <span className="tag-n">{list.length}</span>
            </button>
            <button className={`folder-item${folderSel.kind === 'none' ? ' active' : ''}`} onClick={() => setFolderSel({ kind: 'none' })} title="Projects that are not in any folder">
              <span>No folder</span>
              <span className="tag-n">{folders.none}</span>
            </button>
            {folders.names.map((name) => {
              const active = folderSel.kind === 'folder' && folderSel.name === name;
              return (
                <div key={name} className={`folder-row${active ? ' active' : ''}`}>
                  <button className="folder-item" onClick={() => setFolderSel({ kind: 'folder', name })} title={`Show the projects in "${name}"`}>
                    <Icons.folder width={13} height={13} />
                    <span className="folder-name">{name}</span>
                    <span className="tag-n">{folders.counts.get(name)}</span>
                  </button>
                  {active && (
                    <span className="folder-tools">
                      <button className="icon-btn" title={`Rename folder "${name}"`} disabled={busy} onClick={() => renameFolder(name)}>
                        <Icons.pencil width={13} />
                      </button>
                      <button className="icon-btn" title={`Delete folder "${name}" (its projects are kept, they just leave the folder)`} disabled={busy} onClick={() => deleteFolder(name)}>
                        <Icons.trash width={13} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            <div className="hint">Use a card's folder menu to move a project into a folder, or to start a new one.</div>
          </aside>
        )}
      <main className="project-grid">
        {list === null && !error && <p className="muted">Loading…</p>}
        {list?.length === 0 && (
          <div className="empty-state">
            <h2>No projects yet</h2>
            <p>Interactives builds interactive 2D experiences for the web: vector artboards, web controls, timelines, node-based interactions and your own JavaScript, exported as a single HTML file or a {PACKAGE_EXTENSION} package.</p>
            <button className="btn primary" onClick={create}>
              Create your first project
            </button>
          </div>
        )}
        {!!list?.length && (
          <article className="project-card new-card">
            <button className="project-thumb new-thumb" onClick={create} disabled={busy} title={`Start an empty project with one artboard${folderSel.kind === 'folder' ? `, in the folder "${folderSel.name}"` : ''}`}>
              <Icons.plus width={34} height={34} />
            </button>
            <div className="project-info">
              <div className="project-name">Create new project</div>
              <div className="muted small">
                Or{' '}
                <button className="link-btn inline" onClick={doImport} disabled={busy} title={`Import a ${PACKAGE_EXTENSION} package, project JSON, or a Lottie, Rive, Photoshop, Illustrator, PDF, VectorCraft or PhotoCraft file`}>
                  import a file
                </button>
              </div>
            </div>
          </article>
        )}
        {!!list?.length && !shown.length && (
          <div className="empty-state">
            <p>No projects match.</p>
            {filtering && (
              <button
                className="btn"
                title="Clear the search, tag and folder filters"
                onClick={() => {
                  setQuery('');
                  setTagFilter(null);
                  setFolderSel({ kind: 'all' });
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {shown.map((p) => (
          <article key={p.id} className="project-card">
            <button className="project-thumb" onClick={() => open(p.id)} aria-label={`Open ${p.name}`}>
              {p.thumb ? (
                <img className="thumb-board thumb-img" src={`api/projects/${p.id}/thumbnail?v=${p.thumb}`} alt="" loading="lazy" style={p.preview ? { aspectRatio: `${p.preview.width} / ${p.preview.height}` } : undefined} />
              ) : (
                p.preview && (
                  <span
                    className="thumb-board"
                    style={{
                      background: p.preview.background,
                      aspectRatio: `${p.preview.width} / ${p.preview.height}`,
                    }}
                  />
                )
              )}
            </button>
            <div className="project-info">
              <div className="project-name">
                {p.name}
                {p.isLibrary && (
                  <span className="badge library-badge" title={p.libraryVersion ? `A component library, published as version ${p.libraryVersion}` : 'A component library that has not been published yet'}>
                    Library{p.libraryVersion ? ` v${p.libraryVersion}` : ''}
                  </span>
                )}
              </div>
              <div className="muted small">
                {new Date(p.updated).toLocaleString()} · {p.artboards} artboard{p.artboards === 1 ? '' : 's'}
                {p.owner && p.owner.username !== me && ` · ${p.owner.name ?? p.owner.username}`}
              </div>
              <div className="card-tags">
                {(p.tags ?? []).map((t) => (
                  <span key={t} className="tag-chip static">
                    <button className="tag-label" onClick={() => setTagFilter(t)} title={`Show only projects tagged "${t}"`}>
                      {t}
                    </button>
                    <button
                      className="tag-x"
                      disabled={busy}
                      title={`Remove the tag "${t}" from this project`}
                      aria-label={`Remove tag ${t}`}
                      onClick={() => saveMeta(p.id, { tags: (p.tags ?? []).filter((x) => x !== t) })}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <TagAdder disabled={busy} onAdd={(t) => addTag(p, t)} suggestions={tagCounts.map(([t]) => t).filter((t) => !(p.tags ?? []).includes(t))} />
              </div>
            </div>
            <div className="project-actions">
              <select className="folder-pick" value={p.folder ?? ''} disabled={busy} title="Move this project to a folder" aria-label="Folder" onChange={(e) => moveTo(p, e.target.value)}>
                <option value="">No folder</option>
                {folders.names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value={NEW_FOLDER}>New folder…</option>
              </select>
              <span className="spacer" />
              <button
                className="icon-btn"
                title="Duplicate"
                onClick={() =>
                  run(async () => {
                    await duplicateProject(p.id);
                    await refresh();
                  })
                }
              >
                <Icons.copy width={15} />
              </button>
              <button
                className="icon-btn"
                title={`Export ${PACKAGE_EXTENSION}`}
                onClick={() =>
                  run(async () => {
                    const project = await loadProjectRecord(p.id);
                    if (project) await downloadPackage(project);
                  })
                }
              >
                <Icons.download width={15} />
              </button>
              <button
                className="icon-btn"
                title="Delete"
                onClick={async () => {
                  if (!(await confirmDialog({ title: 'Delete project', message: `Delete "${p.name}"? This cannot be undone.`, confirmLabel: 'Delete project', danger: true }))) return;
                  await run(async () => {
                    await deleteProject(p.id);
                    await refresh();
                  });
                }}
              >
                <Icons.trash width={15} />
              </button>
            </div>
          </article>
        ))}
      </main>
      </div>
    </div>
  );
}
