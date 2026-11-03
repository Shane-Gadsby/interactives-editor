import { useEffect, useRef, useState } from 'react';
import { PACKAGE_EXTENSION, walk, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore, store, useEditor, type BottomTab, type Tool } from './store/store';
import { ConflictError, liveSeqOf, loadProjectRecord, saveProject } from './lib/db';
import { LIVE_FALLBACK_EVENT, LiveSession, liveSession, setLiveSession } from './lib/live';
import { assetUrls } from './lib/assets';
import { ensureFonts } from './lib/fonts';
import { downloadJson, downloadPackage, downloadStandalone, standaloneHtml } from './lib/export';
import { insertFiles, pickFiles } from './lib/insert';
import { copySelection, pasteNodes } from './lib/clipboard';
import { Canvas } from './canvas/Canvas';
import { LeftPanel } from './panels/LeftPanel';
import { Inspector } from './panels/Inspector';
import { TimelinePanel, deleteSelectedKeys } from './panels/Timeline';
import { LogicGraph } from './panels/LogicGraph';
import { ScriptsPanel, VariablesPanel } from './panels/ScriptsVariables';
import { DataPanel } from './panels/DataPanel';
import { UsagePanel } from './panels/UsagePanel';
import { AccessibilityPanel } from './panels/AccessibilityPanel';
import { Icons, type IconName } from './components/icons';
import { IconButton } from './components/ui';
import { getArtboard, selectionBounds } from './store/doc';
import { exportActiveAsLottie } from './lib/importers';
import { HelpLink, openHelp } from './help/Help';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrefsModal } from './components/PrefsModal';
import { HistoryModal, ShareModal } from './components/ProjectModals';
import { prefs, setPrefs, usePrefs } from './lib/prefs';
import { LinkManager, setLinkManager } from './lib/links';
import { LinkBanner } from './components/LinkBanner';
import { LinkChanges } from './components/LinkChanges';
import { PanelResizeHandle, usePanelWidths } from './components/PanelResize';

export function Editor({ projectId, home }: { projectId: string; home: () => void }) {
  const [ready, setReady] = useState<EditorStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopLinks: (() => void) | null = null;
    (async () => {
      try {
        const p = await loadProjectRecord(projectId);
        if (!p) throw new Error('That project does not exist (it may have been deleted).');
        await assetUrls.load(p.id);
        if (cancelled) return;
        const s = new EditorStore(p);
        setCurrentStore(s);
        // Live editing: ops instead of whole-document saves, and other people's changes as they happen
        setLiveSession(new LiveSession(p.id, s, liveSeqOf(p.id)));
        // Linked design files: handles from this browser, watching, re-importing
        const links = new LinkManager(s);
        links.start();
        setLinkManager(links);
        stopLinks = () => {
          links.stop();
          setLinkManager(null);
        };
        // Handy from the devtools console (and for driving the editor in automated checks).
        (window as unknown as { interactivesEditor: unknown }).interactivesEditor = {
          store: s,
          // Import a Lottie/Rive file (a File or Blob with a name) as artboards, same as the Layers panel button
          // The player itself, for measuring playback against the open document
          loadPlayer: () => import('interactives-player'),
          importAnimation: async (file: File) => {
            const { addImportedArtboard, readAnimationFile } = await import('./lib/importers');
            await addImportedArtboard(await readAnimationFile(file));
          },
        };
        const pending = sessionStorage.getItem(`ix-import-report:${p.id}`);
        if (pending) {
          sessionStorage.removeItem(`ix-import-report:${p.id}`);
          s.set({ report: JSON.parse(pending) });
        }
        setReady(s);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      stopLinks?.();
      liveSession()?.close();
      setLiveSession(null);
      setCurrentStore(null);
    };
  }, [projectId]);

  if (error)
    return (
      <div className="center-msg">
        <p>{error}</p>
        <button className="btn" onClick={home}>
          Back to projects
        </button>
      </div>
    );
  if (!ready) return <div className="center-msg muted">Opening project…</div>;
  return <Workspace key={ready.get().project.id} home={home} />;
}

// ---------------------------------------------------------------- autosave

function useAutosave() {
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    const s = store();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRev = s.revision;
    let saving = false;
    // The live session closes (parent cleanup) before this one runs, so remember now whether changes travel as ops
    let viaOps = !!liveSession();
    const save = async (force = false) => {
      // A live session saves through ops; a whole-document PUT would reset everyone else's copy
      if (liveSession() && !force) return;
      if (saving) return;
      saving = true;
      const rev = s.revision;
      s.set({ saveState: 'saving' });
      try {
        await saveProject(s.get().project, { force });
        s.set({ saveState: s.revision === rev ? 'saved' : 'dirty', saveError: null });
        setConflict(false);
      } catch (err) {
        if (err instanceof ConflictError) setConflict(true);
        s.set({ saveState: 'error', saveError: err instanceof Error ? err.message : String(err) });
      } finally {
        saving = false;
        if (s.revision !== rev) schedule();
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(), 800);
    };
    (window as unknown as { __ixForceSave: () => Promise<void> }).__ixForceSave = () => save(true);
    const unsub = s.subscribe(() => {
      if (s.revision !== lastRev) {
        lastRev = s.revision;
        schedule();
        ensureFonts(s.get().project);
      }
    });
    ensureFonts(s.get().project);
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (liveSession() ? liveSession()!.busy : s.get().saveState !== 'saved') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    // A live session the server stopped accepting: take the server's current revision, then save the whole document
    // the usual way (a conflict still shows the conflict bar)
    const onLiveFallback = () => {
      viaOps = false;
      void loadProjectRecord(s.get().project.id)
        .catch(() => null)
        .then(() => save());
    };
    window.addEventListener(LIVE_FALLBACK_EVENT, onLiveFallback);
    return () => {
      window.removeEventListener(LIVE_FALLBACK_EVENT, onLiveFallback);
      unsub();
      if (timer) {
        clearTimeout(timer);
        // Leaving with a change not yet saved: a connected live session still sends its queued ops, and a whole-document
        // PUT here would reset everyone else's copy (or answer 409 once the server has moved on)
        if (!viaOps || s.get().live?.status !== 'live') void save();
      }
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  return conflict;
}

// ---------------------------------------------------------------- shortcuts

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  h: 'hand',
  a: 'artboard',
  f: 'frame',
  r: 'rect',
  o: 'ellipse',
  l: 'line',
  p: 'pen',
  n: 'pencil',
  w: 'bend',
  t: 'text',
  b: 'button',
  j: 'bone',
};

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.cm-editor') || t.closest('.react-flow'))) return;
      const s = store();
      const st = s.get();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && k === 'd') {
        e.preventDefault();
        s.duplicateSelection();
        return;
      }
      if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) s.ungroupSelection();
        else s.groupSelection();
        return;
      }
      if (mod && k === 'c') {
        copySelection();
        return;
      }
      if (mod && k === 'x') {
        copySelection(true);
        return;
      }
      if (mod && k === 'a') {
        e.preventDefault();
        const ab = s.artboard();
        if (ab) s.select(ab.children.filter((n) => !n.locked).map((n) => n.id));
        return;
      }
      if (mod && k === 's') {
        e.preventDefault();
        void (window as unknown as { __ixForceSave?: () => Promise<void> }).__ixForceSave?.();
        return;
      }
      if (mod && (k === '0' || k === '1')) {
        e.preventDefault();
        zoomTo(k === '0' ? 'fit' : '100');
        return;
      }
      if (e.shiftKey && !mod && k === 'j') {
        e.preventDefault();
        s.set({ showBones: !st.showBones });
        return;
      }
      if (e.shiftKey && !mod && k === 'r') {
        e.preventDefault();
        setPrefs({ rulers: !prefs().rulers });
        return;
      }
      if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2')) {
        e.preventDefault();
        zoomTo(e.code === 'Digit1' ? 'fit' : 'selection');
        return;
      }
      if (k === 'delete' || k === 'backspace') {
        e.preventDefault();
        if (!deleteSelectedKeys()) s.deleteSelection();
        return;
      }
      if (k === 'escape') {
        if (st.editingTextId) s.set({ editingTextId: null });
        else if (st.focusId) s.set({ selection: [st.focusId], focusId: null }); else if (st.selection.length || st.artboardSelected) s.set({ selection: [], artboardSelected: false });
        else s.set({ tool: 'select' });
        return;
      }
      if (k === 'enter' && st.selection.length === 1) {
        const n = s.selectedNodes()[0];
        if (n?.type === 'group' || n?.type === 'frame') s.set({ focusId: n.id, selection: n.children.map((c) => c.id).slice(-1) });
        else if (n?.type === 'path') s.set({ editingPathId: n.id });
        else if (n?.type === 'text' || n?.type === 'button' || n?.type === 'link') s.set({ editingTextId: n.id });
        return;
      }
      if (k.startsWith('arrow') && st.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0;
        const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
        const changes = new Map<string, Record<string, unknown>>();
        for (const n of s.selectedNodes()) if (!n.locked) changes.set(n.id, { x: n.x + dx, y: n.y + dy });
        s.setEach(changes, 'nudge');
        return;
      }
      if (k === ']' || k === '[') {
        e.preventDefault();
        s.reorder(k === ']' ? (mod ? Infinity : 1) : mod ? -Infinity : -1);
        return;
      }
      if (!mod && !e.altKey && TOOL_KEYS[k]) {
        s.set({ tool: TOOL_KEYS[k], editingPathId: null });
        return;
      }
    };
    const onPaste = async (e: ClipboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.cm-editor'))) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const s = store();
      const ab = s.artboard();
      if (files.length && ab) {
        e.preventDefault();
        await insertFiles(files, ab.id, { x: ab.width / 2, y: ab.height / 2 });
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (pasteNodes(text)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}

function zoomTo(mode: 'fit' | '100' | 'selection') {
  const s = store();
  const st = s.get();
  const el = document.querySelector('.canvas') as HTMLElement | null;
  if (!el) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  let box: { x: number; y: number; width: number; height: number } | null = null;
  if (mode === 'selection') {
    const ab = s.artboard();
    const b = ab && (st.selection.length ? selectionBounds(ab, st.selection) : { x: 0, y: 0, width: ab.width, height: ab.height });
    if (ab && b) box = { x: ab.canvasX + b.x, y: ab.canvasY + b.y, width: b.width, height: b.height };
  } else {
    const abs = st.project.artboards;
    const minX = Math.min(...abs.map((a) => a.canvasX));
    const minY = Math.min(...abs.map((a) => a.canvasY));
    const maxX = Math.max(...abs.map((a) => a.canvasX + a.width));
    const maxY = Math.max(...abs.map((a) => a.canvasY + a.height));
    box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  if (!box) return;
  const zoom = mode === '100' ? 1 : Math.min(8, Math.max(0.05, Math.min((W - 120) / Math.max(1, box.width), (H - 120) / Math.max(1, box.height))));
  s.set({ zoom, panX: W / 2 - (box.x + box.width / 2) * zoom, panY: H / 2 - (box.y + box.height / 2) * zoom });
}

// ---------------------------------------------------------------- layout

/** Keep the projects page thumbnail current: a few seconds after changes stop, at most every 20 seconds. */
function useThumbnails() {
  useEffect(() => {
    const s = store();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRev = s.revision;
    let lastShot = 0;
    let busy = false;
    let stale = true; // the first visit makes one even without changes, for projects from before thumbnails
    const shoot = async () => {
      if (busy) return;
      busy = true;
      stale = false;
      lastShot = Date.now();
      try {
        const project = s.get().project;
        const { projectThumbnail } = await import('./lib/image-export');
        const blob = await projectThumbnail(project);
        if (blob) await fetch(new URL(`api/projects/${project.id}/thumbnail`, document.baseURI).href, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
      } catch (err) {
        console.warn('[interactives] thumbnail failed', err);
      } finally {
        busy = false;
      }
    };
    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void shoot(), Math.max(delay, lastShot + 20000 - Date.now()));
    };
    const unsub = s.subscribe(() => {
      if (s.revision === lastRev) return;
      lastRev = s.revision;
      stale = true;
      schedule(3000);
    });
    schedule(4000);
    // Leaving the editor: catch the last changes if they haven't been captured
    const flush = () => stale && void shoot();
    window.addEventListener('pagehide', flush);
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
}

/** An error boundary that tries its part again whenever the document changes (an undo, a remote edit that fixes it). */
function Guard(props: { message: string; className?: string; children: React.ReactNode }) {
  const project = useEditor((st) => st.project);
  return <ErrorBoundary {...props} resetKey={project} />;
}

function Workspace({ home }: { home: () => void }) {
  const conflict = useAutosave();
  useThumbnails();
  useShortcuts();
  const s = useEditor((st) => ({ bottomTab: st.bottomTab, bottomHeight: st.bottomHeight, toast: st.toast, report: st.report }));
  const [widths, setWidth] = usePanelWidths();
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => zoomTo('fit'));
  }, []);
  // Tell the others what is selected (and on which artboard)
  useEffect(() => {
    let last = '';
    // Hold the store: leaving the editor clears the current store before this listener is removed, and a late change (a focused field committing as it unmounts) must not throw
    const s = store();
    return s.subscribe(() => {
      const st = s.get();
      const key = `${st.activeArtboardId}|${st.selection.join(',')}`;
      if (key === last) return;
      last = key;
      liveSession()?.presence({ artboardId: st.activeArtboardId, selection: st.selection });
    });
  }, []);
  return (
    <div className="workspace" style={{ ['--bottom-h' as string]: s.bottomTab ? `${s.bottomHeight}px` : '34px', ['--left-w' as string]: `${widths.left}px`, ['--right-w' as string]: `${widths.right}px` }}>
      <TopBar home={home} onPreview={() => setPreview(true)} />
      <div className="banner-area">
        {conflict && <ConflictBanner />}
        <LinkBanner />
        <LinkChanges />
      </div>
      <Toolbar />
      <Guard message="This panel couldn't be shown." className="left-panel">
        <LeftPanel />
      </Guard>
      <main className="stage">
        <Guard message="Something on this artboard couldn't be drawn.">
          <Canvas />
        </Guard>
        <PanelResizeHandle side="left" width={widths.left} onWidth={(w) => setWidth('left', w)} />
        <PanelResizeHandle side="right" width={widths.right} onWidth={(w) => setWidth('right', w)} />
      </main>
      <Guard message="This panel couldn't be shown." className="inspector">
        <Inspector />
      </Guard>
      <Guard message="This panel couldn't be shown." className="bottom-dock">
        <BottomPanel />
      </Guard>
      {preview && <PreviewModal onClose={() => setPreview(false)} />}
      {s.toast && <div className={`toast ${s.toast.kind}`}>{s.toast.text}</div>}
      {s.report && <ReportModal title={s.report.title} lines={s.report.lines} />}
    </div>
  );
}

function ConflictBanner() {
  return (
    <div className="conflict-banner">
      This project was changed in another tab or by someone else since you opened it. Your edits are not saved.
      <button className="btn" onClick={() => location.reload()}>
        Reload theirs
      </button>
      <button className="btn danger" onClick={() => void (window as unknown as { __ixForceSave: () => Promise<void> }).__ixForceSave()}>
        Overwrite with mine
      </button>
    </div>
  );
}

/** A live variable's value as text in the preview panel: lists show as JSON. */
const shown = (v: unknown): string => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));

function TopBar({ home, onPreview }: { home: () => void; onPreview: () => void }) {
  const s = useEditor((st) => ({ name: st.project.name, saveState: st.saveState, saveError: st.saveError, zoom: st.zoom, rev: st.project.updated, live: st.live, peers: st.peers }));
  const [menu, setMenu] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const st = store();
  const [shareOpen, setShareOpen] = useState(false);
  const exportPicture = async (kind: 'png' | 'svg', scale: number) => {
    const state = st.get();
    const ab = getArtboard(state.project, state.activeArtboardId);
    if (!ab) throw new Error('Open an artboard first.');
    const tl = ab.timelines.find((t) => t.id === state.activeTimelineId) ?? null;
    const { downloadArtboardPng, downloadArtboardSvg } = await import('./lib/image-export');
    const warnings = kind === 'png' ? await downloadArtboardPng(state.project, ab, tl, state.playhead, scale) : await downloadArtboardSvg(state.project, ab, tl, state.playhead);
    for (const w of warnings) st.toast(w);
  };
  const run = async (fn: () => Promise<void> | void) => {
    setMenu(false);
    try {
      await fn();
    } catch (err) {
      st.toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  return (
    <header className="topbar">
      <IconButton icon={<Icons.home />} title="All projects" onClick={home} />
      <input
        className="project-title"
        value={s.name}
        onChange={(e) =>
          st.update(
            (d) => {
              d.name = e.target.value;
            },
            { coalesce: 'project-name' },
          )
        }
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <span className={`save-state ${s.saveState}`} title={s.saveError ?? undefined}>
        {s.saveState === 'saved' ? 'Saved' : s.saveState === 'saving' ? 'Saving…' : s.saveState === 'dirty' ? 'Unsaved' : 'Save failed'}
      </span>
      {s.live && (
        <span className={`live-state ${s.live.status}`} title={s.live.status === 'live' ? 'Live: changes are shared as you make them' : s.live.status === 'reconnecting' ? 'Reconnecting… your changes are kept and sent when back' : 'This project was deleted'}>
          ● {s.live.status === 'live' ? 'Live' : s.live.status === 'reconnecting' ? 'Reconnecting' : 'Deleted'}
        </span>
      )}
      <div className="spacer" />
      <div className="peers">
        {Object.values(s.peers).map((p) => (
          <span key={p.clientId} className="peer" style={{ background: p.color }} title={p.name}>
            {p.name
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
        ))}
      </div>
      <IconButton icon={<Icons.history />} title="Revision history: earlier saved versions of this project" onClick={() => setHistoryOpen(true)} />
      <IconButton icon={<Icons.undo />} title="Undo (Ctrl+Z)" onClick={() => st.undo()} disabled={!st.canUndo()} />
      <IconButton icon={<Icons.redo />} title="Redo (Ctrl+Shift+Z)" onClick={() => st.redo()} disabled={!st.canRedo()} />
      <div className="zoom-ctl">
        <button onClick={() => st.set({ zoom: Math.max(0.05, s.zoom / 1.25) })}>−</button>
        <button className="zoom-val" title="Fit all (Shift+1)" onClick={() => zoomTo('fit')}>
          {Math.round(s.zoom * 100)}%
        </button>
        <button onClick={() => st.set({ zoom: Math.min(32, s.zoom * 1.25) })}>+</button>
      </div>
      <IconButton icon={<Icons.gear />} title="Preferences (mouse wheel, tooltips)" onClick={() => setPrefsOpen(true)} />
      <IconButton icon={<Icons.help />} title="Help (? to open, F1 or Ctrl+K to search)" onClick={() => openHelp()} />
      {prefsOpen && <PrefsModal onClose={() => setPrefsOpen(false)} />}
      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
      {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} />}
      <button className="btn primary" onClick={onPreview} title="Play the project exactly as the exported file will">
        <Icons.preview width={14} /> Preview
      </button>
      <div className="menu-wrap">
        <button className="btn" onClick={() => setMenu(!menu)}>
          <Icons.download width={14} /> Export
        </button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => run(() => downloadStandalone(st.get().project))}>
              Single HTML file
              <span className="muted small">Player, project and assets in one file</span>
            </button>
            <button onClick={() => run(() => downloadPackage(st.get().project))}>
              Project package ({PACKAGE_EXTENSION})
              <span className="muted small">Whole project, re-importable</span>
            </button>
            <button onClick={() => run(() => downloadJson(st.get().project))}>
              Project JSON
              <span className="muted small">Document only, no asset bytes</span>
            </button>
            <button onClick={() => run(() => exportActiveAsLottie('json'))}>
              Lottie JSON (this artboard)
              <span className="muted small">Shapes + the open timeline, no interactivity</span>
            </button>
            <button onClick={() => run(() => exportActiveAsLottie('lottie'))}>
              dotLottie (this artboard)
              <span className="muted small">.lottie package of the same</span>
            </button>
            <button onClick={() => run(() => exportPicture('png', 2))}>
              PNG image (this artboard)
              <span className="muted small">At 2× size, at the timeline's playhead</span>
            </button>
            <button onClick={() => run(() => exportPicture('png', 1))}>
              PNG image, 1×
              <span className="muted small">Actual size</span>
            </button>
            <button onClick={() => run(() => exportPicture('svg', 1))}>
              SVG image (this artboard)
              <span className="muted small">Scales cleanly; opens in browsers</span>
            </button>
            <button onClick={() => run(() => setShareOpen(true))}>
              Share link…
              <span className="muted small">A link that plays the project in the browser</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/** The help page for whatever tool is in use. */
function helpTopicForTool(tool: Tool): string {
  if (['button', 'input', 'link', 'embed', 'video'].includes(tool)) return 'web-elements';
  if (tool === 'draw') return 'script-layers';
  if (tool === 'shader') return 'shader-layers';
  if (tool === 'bone') return 'bones';
  if (tool === 'text') return 'text';
  if (tool === 'artboard') return 'artboards';
  if (tool === 'frame') return 'groups-frames';
  if (tool === 'select' || tool === 'hand') return 'interface';
  return 'shapes';
}

const TOOLS: { tool: Tool; icon: IconName; label: string; key?: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select', key: 'V' },
  { tool: 'hand', icon: 'hand', label: 'Hand', key: 'H / Space' },
  { tool: 'artboard', icon: 'artboard', label: 'Artboard', key: 'A' },
  { tool: 'frame', icon: 'frame', label: 'Frame', key: 'F' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle', key: 'R' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse', key: 'O' },
  { tool: 'polygon', icon: 'polygon', label: 'Polygon' },
  { tool: 'star', icon: 'star', label: 'Star' },
  { tool: 'line', icon: 'line', label: 'Line', key: 'L' },
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { tool: 'pencil', icon: 'pencil', label: 'Pencil (freehand)', key: 'N' },
  { tool: 'bend', icon: 'bend', label: 'Bend (drag an edge into a curve; Alt bends one side)', key: 'W' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T' },
  { tool: 'draw', icon: 'draw', label: 'Script layer (generative art, charts)' },
  { tool: 'shader', icon: 'shader', label: 'Shader layer (GPU effects, backdrops)' },
  { tool: 'bone', icon: 'bone', label: 'Bone (drag to draw one; start on a bone tip to continue the chain)', key: 'J' },
];

const WEB_TOOLS: { tool: Tool; icon: IconName; label: string; key?: string }[] = [
  { tool: 'button', icon: 'button', label: 'Button', key: 'B' },
  { tool: 'input', icon: 'input', label: 'Input field' },
  { tool: 'link', icon: 'link', label: 'Link' },
  { tool: 'embed', icon: 'embed', label: 'Embed (HTML or iframe)' },
  { tool: 'video', icon: 'video', label: 'Video' },
];

function Toolbar() {
  const tool = useEditor((st) => st.tool);
  const showBones = useEditor((st) => st.showBones);
  const btn = (t: (typeof TOOLS)[number]) => {
    const I = Icons[t.icon];
    return <IconButton key={t.tool} icon={<I />} title={`${t.label}${t.key ? ` (${t.key})` : ''}`} active={tool === t.tool} onClick={() => store().set({ tool: t.tool, editingPathId: null })} />;
  };
  return (
    <nav className="toolbar">
      {TOOLS.map(btn)}
      <IconButton icon={showBones ? <Icons.eye /> : <Icons.eyeOff />} title={showBones ? 'Hide bones on the canvas (Shift+J)' : 'Show bones on the canvas (Shift+J)'} onClick={() => store().set({ showBones: !showBones })} />
      <IconButton
        icon={<Icons.image />}
        title="Image"
        onClick={async () => {
          const files = await pickFiles('image/*,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft');
          const ab = store().artboard();
          if (files.length && ab) await insertFiles(files, ab.id, { x: ab.width / 2, y: ab.height / 2 });
        }}
      />
      <div className="toolbar-sep" />
      {WEB_TOOLS.map(btn)}
      <div className="toolbar-fill" />
      <IconButton icon={<Icons.help />} title="Help and docs (? to open, F1 or Ctrl+K to search)" onClick={() => openHelp(helpTopicForTool(tool))} />
    </nav>
  );
}

const TABS: { id: BottomTab; label: string; icon: IconName; help: string; tip: string }[] = [
  { id: 'timeline', label: 'Timeline', icon: 'timeline', help: 'timelines', tip: 'Animate properties with keyframes' },
  { id: 'logic', label: 'Interactions', icon: 'logic', help: 'interactions', tip: 'Events, actions and logic as a node graph' },
  { id: 'scripts', label: 'Scripts', icon: 'code', help: 'scripts', tip: 'JavaScript with the ix API' },
  { id: 'variables', label: 'Variables', icon: 'variable', help: 'variables', tip: 'Named values shared by the whole project' },
  { id: 'data', label: 'Data', icon: 'table', help: 'data-sources', tip: 'JSON, CSV, TSV or text from files or URLs' },
  { id: 'a11y', label: 'Accessibility', icon: 'a11y', help: 'accessibility-checker', tip: 'Check accessibility: contrast, small text, keyboard access, names and descriptions, autoplay and flashing, with what each means and a report for sign-off' },
  { id: 'usage', label: 'Usage', icon: 'usage', help: 'usage', tip: 'What uses what: where each artboard, asset, variable, data source, script and timeline is used, and what is unused' },
];

function BottomPanel() {
  const s = useEditor((st) => ({ tab: st.bottomTab, h: st.bottomHeight }));
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = s.h;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => store().set({ bottomHeight: Math.max(140, Math.min(window.innerHeight - 200, h0 - (ev.clientY - y0))) });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <section className="bottom-dock">
      {s.tab && <div className="resize-handle" onPointerDown={startResize} />}
      <div className="tabs bottom-tabs">
        {TABS.map((t) => {
          const I = Icons[t.icon];
          return (
            <button key={t.id} className={s.tab === t.id ? 'active' : ''} title={t.tip} onClick={() => store().set({ bottomTab: s.tab === t.id ? null : t.id, previewPlaying: false })}>
              <I width={14} /> {t.label}
            </button>
          );
        })}
        <div className="spacer" />
        {s.tab && <HelpLink topic={TABS.find((t) => t.id === s.tab)!.help} />}
      </div>
      {s.tab && (
        <div className="bottom-body">
          {s.tab === 'timeline' && <TimelinePanel />}
          {s.tab === 'logic' && <LogicGraph />}
          {s.tab === 'scripts' && <ScriptsPanel />}
          {s.tab === 'variables' && <VariablesPanel />}
          {s.tab === 'data' && <DataPanel />}
          {s.tab === 'usage' && <UsagePanel />}
          {s.tab === 'a11y' && <AccessibilityPanel />}
        </div>
      )}
    </section>
  );
}

function PreviewModal({ onClose }: { onClose: () => void }) {
  const project = useEditor((st) => st.project);
  const abId = useEditor((st) => st.activeArtboardId);
  const [html, setHtml] = useState<string | null>(null);
  // Accessibility features in the preference: the preview plays with or without them, and shows what the screen reader would say
  const accessibility = usePrefs().accessibility;
  const [said, setSaid] = useState<{ text: string; politeness: string }[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [from, setFrom] = useState<'start' | 'current'>('start');
  const [log, setLog] = useState<string[]>([]);
  const [vars, setVars] = useState<Record<string, unknown> | null>(null);
  type DebugState = { artboard: string; timelines: { name: string; playing: boolean; time: number; duration: number }[]; instances: number };
  type Trace = { artboard: string; event: string; target?: string; then: string[]; note?: string; depth: number; at: number };
  const [dbg, setDbg] = useState<DebugState | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  // Script layers that failed or hit a limit, as the player reports them (newest last)
  const [scriptErrors, setScriptErrors] = useState<{ source?: string; layer: string; message: string; kind: string }[]>([]);
  const [varFilter, setVarFilter] = useState('');
  const t0 = useRef(performance.now());
  const [showVars, setShowVars] = useState(true);
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  // Drag and drop: outline every draggable layer and drop zone in the running preview
  const [hitAreas, setHitAreas] = useState(false);
  const hasDrag = project.artboards.some((a) => {
    let found = false;
    walk(a.children, (n) => {
      if (n.draggable || n.dropZone) found = true;
    });
    return found;
  });
  const showHitAreas = (on: boolean) => frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'dragDebug', on }, '*');
  useEffect(() => {
    let live = true;
    setBuildError(null);
    standaloneHtml(project as Project, { startArtboardId: from === 'current' ? abId : undefined, debug: true, accessibility }).then(
      (h) => live && setHtml(h),
      (err) => live && setBuildError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      live = false;
    };
  }, [project, from, abId, nonce, accessibility]);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.source === 'interactives-debug') {
        if (e.data.vars) setVars(e.data.vars);
        if (e.data.state) setDbg(e.data.state);
        if (e.data.trace) setTraces((l) => [...l.slice(-199), { ...e.data.trace, at: performance.now() - t0.current }]);
        if (e.data.scripterror) setScriptErrors((l) => [...l.slice(-49), e.data.scripterror]);
        if (e.data.announce) setSaid((l) => [...l.slice(-2), e.data.announce]);
        return;
      }
      if (e.data?.source !== 'interactives') return;
      setLog((l) => [...l.slice(-50), `${e.data.name}${e.data.payload !== undefined ? ` ${JSON.stringify(e.data.payload)}` : ''}`]);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('message', onMsg);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const ab = getArtboard(project, from === 'current' ? abId : project.settings.startArtboardId);
  const post = (name: string, value: unknown) => frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'setVariable', name, value }, '*');
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal preview-modal">
        <header>
          <strong>Preview</strong>
          <select value={from} onChange={(e) => setFrom(e.target.value as 'start' | 'current')}>
            <option value="start">From the start artboard</option>
            <option value="current">From this artboard</option>
          </select>
          <span className="muted small">{ab ? `${ab.width} × ${ab.height}` : ''} · runs exactly like the exported file</span>
          <button
            className={`btn${accessibility ? ' active' : ''}`}
            onClick={() => setPrefs({ accessibility: !accessibility })}
            title="Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements (also in Preferences). Switch it off to check whether a problem comes from it"
          >
            Accessibility {accessibility ? 'on' : 'off'}
          </button>
          {hasDrag && (
            <button
              className={`btn${hitAreas ? ' active' : ''}`}
              onClick={() => {
                setHitAreas(!hitAreas);
                showHitAreas(!hitAreas);
              }}
              title="Outline every draggable layer (blue, with its tags and the point tested) and drop zone (green, with what it takes and how full it is) in the preview, and the pointer while dragging"
            >
              Hit areas {hitAreas ? 'on' : 'off'}
            </button>
          )}
          <div className="spacer" />
          <button
            className="btn"
            onClick={() => {
              // A new iframe runs everything from the start; the debug panel starts again with it
              setNonce(nonce + 1);
              setTraces([]);
              setLog([]);
              setScriptErrors([]);
              setSaid([]);
              setDbg(null);
              t0.current = performance.now();
            }}
            title="Start again from the beginning (timelines, variables and all)"
          >
            Restart
          </button>
          <button className={`btn${showVars ? ' active' : ''}`} onClick={() => setShowVars(!showVars)} title="Debug: what's showing, running timelines, variables (editable) and the events that fire">
            Debug
          </button>
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        <div className="preview-body">
          {showVars && vars && (
            <aside className="preview-vars">
              {dbg && (
                <div className="debug-state">
                  <div className="field-label block">Now showing</div>
                  <div className="mono small">
                    {dbg.artboard}
                    {dbg.instances ? ` · ${dbg.instances} instance${dbg.instances === 1 ? '' : 's'}` : ''}
                  </div>
                  {dbg.timelines.length > 0 && (
                    <>
                      <div className="field-label block">Timelines</div>
                      {dbg.timelines.map((t) => (
                        <div key={t.name} className="debug-tl small" title={`${t.playing ? 'Playing' : 'Paused'} at ${t.time} of ${t.duration} ms`}>
                          <span className={`dot ${t.playing ? 'ok' : ''}`} />
                          <span className="mono">{t.name}</span>
                          <span className="debug-bar">
                            <span style={{ width: `${Math.min(100, (t.time / (t.duration || 1)) * 100)}%` }} />
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
              <div className="field-label block">Variables (live)</div>
              {project.variables.length > 8 && <input className="debug-filter" placeholder="Filter variables…" value={varFilter} onChange={(e) => setVarFilter(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />}
              {Object.keys(vars).length === 0 && <p className="muted small">This project has no variables.</p>}
              {project.variables.filter((v) => !varFilter || v.name.toLowerCase().includes(varFilter.toLowerCase())).map((v) => (
                <label key={v.id} className="preview-var" title={`${v.name}: change it in the running preview`}>
                  <span className="mono">{v.name}</span>
                  {v.type === 'boolean' ? (
                    <input type="checkbox" checked={!!vars[v.name]} onChange={(e) => post(v.name, e.target.checked)} />
                  ) : v.type === 'enum' ? (
                    <select value={String(vars[v.name] ?? '')} onChange={(e) => post(v.name, e.target.value)}>
                      {(v.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      key={shown(vars[v.name])}
                      defaultValue={shown(vars[v.name])}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') post(v.name, (e.target as HTMLInputElement).value);
                      }}
                      onBlur={(e) => e.target.value !== shown(vars[v.name]) && post(v.name, e.target.value)}
                    />
                  )}
                </label>
              ))}
            </aside>
          )}
          {html ? <iframe key={nonce} ref={frame} title="Preview" sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" srcDoc={html} onLoad={() => hitAreas && showHitAreas(true)} /> : buildError ? <div className="center-msg">Could not build the preview: {buildError}</div> : <div className="center-msg muted">Building…</div>}
        </div>
        {accessibility && (
          <div className="preview-said" aria-hidden="true" title="What a screen reader is told by Announce nodes and ix.announce, as it is spoken">
            <strong>Screen reader</strong>
            {said.length ? said.map((a, i) => <span key={i} className={i === said.length - 1 ? 'latest' : undefined}>{a.text}</span>) : <span className="muted">Nothing announced yet. Tab to a clickable layer and press Enter or Space.</span>}
          </div>
        )}
        {showVars && (
          <footer className="preview-log mono small">
            <div className="debug-log-head">
              <span>Events (newest last)</span>
              <button className="btn small-btn" onClick={() => (setTraces([]), setLog([]), setScriptErrors([]))} title="Clear the event list (the preview keeps running)">
                <Icons.trash width={12} /> Clear
              </button>
            </div>
            {scriptErrors.map((x, i) => (
              <div key={`e${i}`} className={x.kind === 'error' ? 'error' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
                {x.source === 'shader' ? 'Shader layer' : 'Script layer'} “{x.layer}” {x.kind === 'error' ? 'stopped' : 'warning'}: {x.message}
              </div>
            ))}
            {traces.map((t, i) => (
              <div key={i} className="trace" title={t.note}>
                <span className="muted">{(t.at / 1000).toFixed(2)}s</span> {t.depth ? <span className="muted">[{t.artboard}] </span> : null}
                <strong>{t.event}</strong>
                {t.target ? ` (${t.target})` : ''} → {t.then.length ? t.then.join(', ') : <span className="muted">nothing connected</span>}
              </div>
            ))}
            {log.map((l, i) => (
              <div key={`m${i}`}>message to the page: {l}</div>
            ))}
            {!traces.length && !log.length && !scriptErrors.length && <div className="muted">No events yet. Click, hover or type in the preview and they show here.</div>}
          </footer>
        )}
      </div>
    </div>
  );
}

function ReportModal({ title, lines }: { title: string; lines: string[] }) {
  const close = () => store().set({ report: null });
  // Like the other dialogs, Escape closes it
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && store().set({ report: null });
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal report-modal">
        <header>
          <strong>{title}</strong>
          <div className="spacer" />
          <IconButton icon={<Icons.close />} title="Close" onClick={close} />
        </header>
        <div className="report-body">
          <p className="muted">Done. These parts could not be carried over exactly:</p>
          <ul>
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
