import { useEffect, useState } from 'react';
import { createProject, PACKAGE_EXTENSION } from 'interactives-player';
import { createProjectRecord, deleteProject, duplicateProject, importPackage, listProjects, loadProjectRecord, session, type ProjectMeta, type SessionInfo } from './lib/db';
import { downloadPackage } from './lib/export';
import { pickFiles } from './lib/insert';
import { Icons } from './components/icons';
import { PrefsModal } from './components/PrefsModal';
import { prefs } from './lib/prefs';
import { sessionUser, type SessionUser } from './lib/session';

declare global {
  interface Window {
    powerUser?: { isToggleKey(e: KeyboardEvent): boolean; canUse(access: unknown): boolean };
  }
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const p = createProject('Untitled project');
      // Every new project starts with the person's default font (Open Sans unless they changed it)
      const font = prefs().defaultFont.trim();
      if (font) p.fonts.push({ family: font, source: 'google', weights: [400, 600, 700] });
      await createProjectRecord(p);
      open(p.id);
    });

  const doImport = () =>
    run(async () => {
      const files = await pickFiles(`${PACKAGE_EXTENSION},.zip,.json,.lottie,.riv,.psd`, false);
      const f = files[0];
      if (!f) return;
      // Lottie / Rive / Photoshop files become a new project; anything else is an Interactives package or project JSON.
      const head = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
      const text = new TextDecoder().decode(head);
      const animation = /\.(lottie|riv|psd)$/i.test(f.name) || (/\.json$/i.test(f.name) && /"layers"\s*:/.test(text) && !/"format"\s*:\s*"interactives"/.test(text));
      if (animation) {
        const { projectFromAnimation } = await import('./lib/importers');
        const id = await projectFromAnimation(f);
        await refresh();
        open(id);
        return;
      }
      const p = await importPackage(f);
      await refresh();
      open(p.id);
    });

  const me = who?.user?.username;

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
          <button className="btn" onClick={doImport} disabled={busy}>
            <Icons.upload width={14} /> Import ({PACKAGE_EXTENSION}, Lottie, Rive, PSD)
          </button>
          <button className="btn primary" onClick={create} disabled={busy}>
            <Icons.plus width={14} /> New project
          </button>
        </div>
      </header>
      {power && <div className="power-banner">Power user mode: showing everyone's projects (F9 to turn off)</div>}
      {error && <div className="error-banner">{error}</div>}
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
            <button className="project-thumb new-thumb" onClick={create} disabled={busy} title="Start an empty project with one artboard">
              <Icons.plus width={34} height={34} />
            </button>
            <div className="project-info">
              <div className="project-name">Create new project</div>
              <div className="muted small">
                Or{' '}
                <button className="link-btn inline" onClick={doImport} disabled={busy} title={`Import a ${PACKAGE_EXTENSION} package, project JSON, Lottie, Rive or Photoshop file`}>
                  import a file
                </button>
              </div>
            </div>
          </article>
        )}
        {list?.map((p) => (
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
              <div className="project-name">{p.name}</div>
              <div className="muted small">
                {new Date(p.updated).toLocaleString()} · {p.artboards} artboard{p.artboards === 1 ? '' : 's'}
                {p.owner && p.owner.username !== me && ` · ${p.owner.name ?? p.owner.username}`}
              </div>
            </div>
            <div className="project-actions">
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
                onClick={() =>
                  run(async () => {
                    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
                    await deleteProject(p.id);
                    await refresh();
                  })
                }
              >
                <Icons.trash width={15} />
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
