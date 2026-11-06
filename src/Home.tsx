import { track } from './lib/analytics';
import { VersionInfo } from './components/VersionInfo';
import { useEffect, useMemo, useState } from 'react';
import { PACKAGE_EXTENSION } from 'interactives-player';
import { newProjectWithThemes } from './lib/themes';
import { whenPaletteReady } from './lib/palette-look';
import { inUseWarning } from './lib/in-use';
import { createProjectRecord, deleteForever, deleteProject, duplicateProject, importPackage, listBin, listProjects, loadProjectRecord, META_MAX_LABEL, META_MAX_TAGS, restoreFromBin, session, setProjectMeta, type BinnedProject, type ProjectMeta, type SessionInfo } from './lib/db';
import { downloadPackage } from './lib/export';
import { pickFiles } from './lib/insert';
import { confirmDialog, promptDialog } from './components/dialogs';
import { Icons } from './components/icons';
import { PrefsModal } from './components/PrefsModal';
import { DEFAULT_FONT, prefs } from './lib/prefs';
import { ensureGoogleFont, loadCatalog } from './lib/font-catalog';
import { sessionUser, type SessionUser } from './lib/session';
import { noteIfStale } from './lib/stale-build';
import { NoticeBell } from './components/NoticeBell';
import { TemplatesTab } from './components/TemplatesTab';
import { NewProjectModal } from './components/NewProjectModal';

declare global {
  interface Window {
    powerUser?: { isToggleKey(e: KeyboardEvent): boolean; canUse(access: unknown): boolean };
  }
}

type FolderSel = { kind: 'all' } | { kind: 'none' } | { kind: 'folder'; name: string } | { kind: 'bin' };
type SortKey = 'updated' | 'name';

const SORT_KEY = 'ix.home.sort';
const VIEW_KEY = 'ix.home.view';
const SIZE_KEY = 'ix.home.size';
const TAB_KEY = 'ix.home.tab';
export const HOME_SIZE_MIN = 140;
export const HOME_SIZE_MAX = 360;
export const HOME_SIZE_DEFAULT = 220;
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

function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function readSize(): number {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return n ? Math.min(HOME_SIZE_MAX, Math.max(HOME_SIZE_MIN, n)) : HOME_SIZE_DEFAULT;
  } catch {
    return HOME_SIZE_DEFAULT;
  }
}

const keep = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window */
  }
};

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

const dayMs = 24 * 60 * 60 * 1000;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Deleted projects: when, by whom, how long until they go for good, with Restore and Delete forever. */
function BinView({ bin, busy, onRestore, onForget }: { bin: BinnedProject[]; busy: boolean; onRestore: (p: BinnedProject) => void; onForget: (p: BinnedProject) => void }) {
  const now = Date.now();
  return (
    <main className="project-grid as-list bin-view">
      <p className="muted bin-intro">Deleted projects stay here for 30 days, then go for good with their revision history, learner records and comments. While a project is here its share and review links don't work.</p>
      {!bin.length && <p className="muted">The Bin is empty.</p>}
      {bin.map((p) => {
        const left = Math.max(0, Math.ceil((new Date(p.purge).getTime() - now) / dayMs));
        return (
          <article key={p.id} className="project-card">
            <div className="project-thumb" aria-hidden="true">
              {p.thumb ? (
                <img className="thumb-board thumb-img" src={`api/bin/${p.id}/thumbnail?v=${p.thumb}`} alt="" loading="lazy" style={p.preview ? { aspectRatio: `${p.preview.width} / ${p.preview.height}` } : undefined} />
              ) : (
                p.preview && <span className="thumb-board" style={{ background: p.preview.background, aspectRatio: `${p.preview.width} / ${p.preview.height}` }} />
              )}
            </div>
            <div className="project-info">
              <div className="project-name">{p.name}</div>
              <div className="muted small">
                Deleted {shortDate(p.binned.at)}
                {p.binned.by?.name ? ` by ${p.binned.by.name}` : ''} · goes for good {left <= 1 ? 'within a day' : `in ${left} days`} ({shortDate(p.purge)})
              </div>
            </div>
            <div className="project-actions">
              <button className="btn" disabled={busy} onClick={() => onRestore(p)} title="Put it back in your projects, with its files, history and links">
                Restore
              </button>
              <button className="btn danger" disabled={busy} onClick={() => onForget(p)} title="Delete it now, for good">
                Delete forever
              </button>
            </div>
          </article>
        );
      })}
    </main>
  );
}

function readTab(): 'projects' | 'templates' {
  try {
    return localStorage.getItem(TAB_KEY) === 'templates' ? 'templates' : 'projects';
  } catch {
    return 'projects';
  }
}

export function Home({ open }: { open: (id: string) => void }) {
  const [tab, setTab] = useState<'projects' | 'templates'>(readTab);
  const pickTab = (t: 'projects' | 'templates') => {
    setTab(t);
    keep(TAB_KEY, t);
  };
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  //the font list is what New project reads the default font's weights from: have it by the time it is clicked
  useEffect(() => void loadCatalog().catch(() => []), []);
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
  // Thumbnails or a details list, and how big the thumbnails are: the same two controls the Assets panel has
  const [view, setView] = useState<'grid' | 'list'>(readView);
  const [size, setSize] = useState(readSize);

  const [bin, setBin] = useState<BinnedProject[]>([]);
  const [binNote, setBinNote] = useState<{ text: string; undo?: string } | null>(null);
  const refresh = async (all = power) => {
    try {
      setList(await listProjects(all));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    // The bin is a side list: if it can't load, the projects still show
    listBin(all)
      .then(setBin)
      .catch(() => setBin([]));
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

  //New project and the + card both ask how to start first (blank, a copy, a built-in starter, an example)
  const [choosing, setChoosing] = useState(false);

  /** A blank project in the folder the chooser asked for. Returns its id for the chooser to open. */
  const createBlank = async (name: string, folder: string | null) => {
    // The toolbox look from the start: the starter themes, with colours from the shared palette
    await whenPaletteReady();
    const p = newProjectWithThemes(name);
    // Every new project starts with the person's default font (Open Sans unless they changed it)
    await loadCatalog().catch(() => []);
    ensureGoogleFont(p.fonts, prefs().defaultFont.trim() || DEFAULT_FONT, [400, 600, 700], { force: true });
    await createProjectRecord(p);
    track('project', 'create');
    if (folder) await setProjectMeta(p.id, { folder }).catch(() => undefined);
    return p.id;
  };

  const doImport = () =>
    run(async () => {
      const files = await pickFiles(`${PACKAGE_EXTENSION},.zip,.json,.lottie,.riv,.rev,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft,.pptx`, false);
      const f = files[0];
      if (!f) return;
      // Lottie / Rive (.riv, .rev) / Photoshop / Illustrator / PDF / VectorCraft / PhotoCraft / PowerPoint files become a new project; anything else is an Interactives package or project JSON.
      const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
      const text = new TextDecoder().decode(head);
      const animation = /\.(lottie|riv|rev|psd|ai|pdf|dxf|dwg|vectorcraft|drawcraft|pcraft|pptx)$/i.test(f.name) || (/\.json$/i.test(f.name) && /"layers"\s*:/.test(text) && !/"format"\s*:\s*"interactives"/.test(text));
      if (animation) {
        const { chooseLinking, projectFromAnimation } = await import('./lib/importers');
        const linking = await chooseLinking([f]);
        if (!linking) return;
        const id = await projectFromAnimation(f, linking.get(f));
        track('project', 'create', { thing: 'import' });
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
          {(who?.user || me2) && <span className="muted home-user" title="Signed in through the toolbox">{who?.user?.name ?? me2?.name ?? who?.user?.username}</span>}
          <NoticeBell open={open} />
          <button className="icon-btn" title="Preferences (theme, mouse wheel, tooltips)" onClick={() => setPrefsOpen(true)}>
            <Icons.gear width={16} />
          </button>
          {prefsOpen && <PrefsModal onClose={() => setPrefsOpen(false)} />}
          <a className="btn" href="#/help" title="How to use Interactives (F1 to search)">
            <Icons.help width={14} /> Help
          </a>
          <VersionInfo />
          <button className="btn" onClick={doImport} disabled={busy} title={`Import a file as a new project. Accepts ${PACKAGE_EXTENSION} packages, project JSON, and Lottie, Rive, Photoshop (PSD), Illustrator (AI), PDF, VectorCraft and PhotoCraft files`}>
            <Icons.upload width={14} /> Import
          </button>
          <button className="btn primary" onClick={() => setChoosing(true)} disabled={busy} title="Start a new project: blank, a copy of one of yours, a built-in template or an example">
            <Icons.plus width={14} /> New project
          </button>
        </div>
      </header>
      {power && (
        <div className="power-banner">
          Power user mode: showing everyone's projects (F9 to turn off). <a href="#/usage">Usage and errors</a> · <a href="#/admin">Admin</a>
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      {binNote && (
        <div className="bin-note" role="status">
          {binNote.text}
          {binNote.undo && (
            <button
              className="link-btn inline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await restoreFromBin(binNote.undo!);
                  setBinNote({ text: 'Restored.' });
                  await refresh();
                })
              }
            >
              Undo
            </button>
          )}
          <button className="icon-btn" title="Dismiss" aria-label="Dismiss" onClick={() => setBinNote(null)}>
            ×
          </button>
        </div>
      )}
      {choosing && <NewProjectModal projects={list ?? []} me={me ?? undefined} folder={folderSel.kind === 'folder' ? folderSel.name : null} folders={folders.names} onBlank={createBlank} onMade={open} onClose={() => setChoosing(false)} />}
      <nav className="home-tabs" role="tablist" aria-label="Projects or templates">
        <button role="tab" aria-selected={tab === 'projects'} className={tab === 'projects' ? 'on' : ''} onClick={() => pickTab('projects')} title="Your projects">
          Projects
        </button>
        <button role="tab" aria-selected={tab === 'templates'} className={tab === 'templates' ? 'on' : ''} onClick={() => pickTab('templates')} title="Start from a template: yours, shared ones, the built-in starters and the examples">
          Templates
        </button>
      </nav>
      {tab === 'templates' && <TemplatesTab folder={folderSel.kind === 'folder' ? folderSel.name : null} folders={folders.names} open={open} />}
      {tab === 'projects' && !!list?.length && (
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
          <div className="asset-toolbar home-view">
            <div className="seg">
              <button className={view === 'grid' ? 'on' : ''} title="Show projects as thumbnails" onClick={() => { setView('grid'); keep(VIEW_KEY, 'grid'); }}>
                Thumbnails
              </button>
              <button className={view === 'list' ? 'on' : ''} title="Show projects as a list with details" onClick={() => { setView('list'); keep(VIEW_KEY, 'list'); }}>
                Details
              </button>
            </div>
            {view === 'grid' && (
              <input
                type="range"
                className="asset-size"
                min={HOME_SIZE_MIN}
                max={HOME_SIZE_MAX}
                step={4}
                value={size}
                title="Thumbnail size"
                aria-label="Thumbnail size"
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  keep(SIZE_KEY, e.target.value);
                }}
              />
            )}
          </div>
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
      {tab === 'projects' && <div className="home-body">
        {(!!list?.length || !!bin.length) && (
          <aside className="folder-side" aria-label="Folders">
            <button className={`folder-item${folderSel.kind === 'all' ? ' active' : ''}`} onClick={() => setFolderSel({ kind: 'all' })} title="Every project">
              <span>All projects</span>
              <span className="tag-n">{list?.length ?? 0}</span>
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
            {!!bin.length && (
              <button className={`folder-item bin-item${folderSel.kind === 'bin' ? ' active' : ''}`} onClick={() => setFolderSel({ kind: 'bin' })} title="Deleted projects, kept for 30 days: restore them from here">
                <Icons.trash width={13} height={13} />
                <span className="folder-name">Bin</span>
                <span className="tag-n">{bin.length}</span>
              </button>
            )}
          </aside>
        )}
      {folderSel.kind === 'bin' ? (
        <BinView
          bin={bin}
          busy={busy}
          onRestore={(p) =>
            run(async () => {
              track('project', 'restore');
              await restoreFromBin(p.id);
              setBinNote({ text: `Restored “${p.name}”.` });
              if (bin.length <= 1) setFolderSel({ kind: 'all' });
              await refresh();
            })
          }
          onForget={async (p) => {
            if (!(await confirmDialog({ title: 'Delete forever', message: `Delete “${p.name}” for good? Its files, revision history, learner records and review comments go too, and a library published from it stops being available. This cannot be undone.`, confirmLabel: 'Delete forever', danger: true }))) return;
            await run(async () => {
              track('project', 'purge');
              await deleteForever(p.id);
              if (bin.length <= 1) setFolderSel({ kind: 'all' });
              await refresh();
            });
          }}
        />
      ) : (
      <main className={`project-grid${view === 'list' ? ' as-list' : ''}`} style={{ '--card-size': `${size}px` } as React.CSSProperties}>
        {list === null && !error && <p className="muted">Loading…</p>}
        {list?.length === 0 && (
          <div className="empty-state">
            <h2>No projects yet</h2>
            <p>Interactives builds interactive 2D experiences for the web: vector artboards, web controls, timelines, node-based interactions and your own JavaScript, exported as a single HTML file or a {PACKAGE_EXTENSION} package.</p>
            <button className="btn primary" onClick={() => setChoosing(true)}>
              Create your first project
            </button>
          </div>
        )}
        {!!list?.length && (
          <article className="project-card new-card">
            <button className="project-thumb new-thumb" onClick={() => setChoosing(true)} disabled={busy} title={`Start a new project: blank, a copy of one of yours, a built-in template or an example${folderSel.kind === 'folder' ? `. It goes in the folder "${folderSel.name}"` : ''}`}>
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
                {!!p.openComments && (
                  <span className={`cm-count${p.assignedComments ? ' mine' : ''}`} title={`${p.openComments} open review comment${p.openComments === 1 ? '' : 's'}${p.assignedComments ? `, ${p.assignedComments} for you` : ''}. Open the project and look under Comments`}>
                    <Icons.comment width={11} height={11} /> {p.openComments}
                  </span>
                )}
                {p.isLibrary && (
                  <span className="badge library-badge" title={p.libraryVersion ? `A component library, published as version ${p.libraryVersion}` : 'A component library that has not been published yet'}>
                    Library{p.libraryVersion ? ` v${p.libraryVersion}` : ''}
                  </span>
                )}
              </div>
              <div className="muted small">
                {new Date(p.updated).toLocaleString()} · {p.artboards} artboard{p.artboards === 1 ? '' : 's'}
                {p.owner && p.owner.username !== me && ` · ${p.collaborators?.some((c) => c.username === me) ? 'shared with you by ' : ''}${p.owner.name ?? p.owner.username}`}
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
                    track('project', 'duplicate');
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
                  const live = await inUseWarning(p.id, 'delete');
                  if (!(await confirmDialog({ title: 'Delete project', message: `Move “${p.name}” to the Bin? You can restore it from the Bin for 30 days, then it goes for good.${live ? `\n\n${live}` : ''}`, confirmLabel: 'Move to Bin', danger: true }))) return;
                  await run(async () => {
                    track('project', 'delete');
                    await deleteProject(p.id);
                    setBinNote({ text: `Moved “${p.name}” to the Bin.`, undo: p.id });
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
      )}
      </div>}
    </div>
  );
}
