import { answerPreviewProgress, forgetPreviewCourse, forgetPreviewLearner, previewCourseHas, previewLearnerHas, usesCourseCollections } from './lib/preview-learner';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PACKAGE_EXTENSION, countNotes, pickTheme, readViewerPrefs, tokenByName, tokenValue, defaultTheme, declaresSensors, FAKE_BEHAVIOURS, QUESTION_KINDS, sampleContextFor, setMembers, walk, type FakeBehaviour, type Project, type QuestionKind } from 'interactives-player';
import { syncProjectWithPalette } from './lib/palette-look';
import { EditorStore, setCurrentStore, store, useEditor, type Tool } from './store/store';
import { ToastView } from './components/ToastView';
import { ApiError, ConflictError, liveSeqOf, loadProjectRecord, saveProject, session } from './lib/db';
import { LIVE_FALLBACK_EVENT, LiveSession, liveSession, setLiveSession } from './lib/live';
import { assetUrls } from './lib/assets';
import { ensureFonts } from './lib/fonts';
import { download, downloadJson, downloadPackage, downloadStandalone, fileSafe, standaloneHtml } from './lib/export';
import { insertFiles, pickFiles } from './lib/insert';
import { addQuestion } from './lib/question-kit';
import { importGiftFile } from './lib/gift-import';
import { watchKeyArea } from './lib/key-area';
import { keyHint, keyHints, keysSuspended, withKey } from './lib/keymap';
import { handleEditorKey, installEditorKeys } from './lib/editor-keys';
import { installTimelineKeys } from './lib/timeline-keys';
import { CommandPalette } from './components/CommandPalette';
import { ComponentPicker } from './components/ComponentPicker';
import { BeforeYouShareModal } from './components/BeforeShare';
import { checkBeforeShare } from './lib/before-share';
import { openPalette } from './lib/command-palette';
import { APP_ACTION_EVENT, type AppAction } from './lib/app-actions';
import { PasteQuestionsModal } from './components/PasteQuestionsModal';
import { pasteNodes } from './lib/clipboard';
import { isKeyClipText, keysCopiedLast, pasteKeys, watchKeyContext } from './lib/key-edit';
import { Canvas } from './canvas/Canvas';
import { ThemeFixedHint } from './components/ThemeFixedHint';
import { ReferenceModal } from './panels/InterfacePanel';
import { MotionExportModal } from './components/MotionExportModal';
import { exportProblems, typeDefinitions } from 'interactives-player';
import { confirmDialog } from './components/dialogs';
import { Icons, type IconName } from './components/icons';
import { IconButton } from './components/ui';
import { PreviewWidth, responsiveSets, widthInside } from './components/PreviewWidth';
import { getArtboard, selectionBounds } from './store/doc';
import { exportActiveAsLottie } from './lib/importers';
import { HelpLink } from './help/Help';
import { setPreviewOpen, trapFocus } from './lib/overlays';
import { installInteractionsRoom } from './lib/interactions-room';
import { clearFlow, lastQuietHit, pushFlow, useFlowVersion } from './lib/run-flow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ContextMenu } from './components/ContextMenu';
import { DockDragLayer, DockFloats, DockZone, FloatingTools, ToolsHead, openHeaderHelp, useHeaderHelpTitle, toolsMenu, useDockSync, useZoneSizes } from './components/Dock';
import { PrefsModal } from './components/PrefsModal';
import { HistoryModal, InviteModal, ShareForReviewModal, ShareModal } from './components/ProjectModals';
import { SaveTemplateModal } from './components/TemplateModals';
import { CHECKLIST_FLAG, hasChecklist } from './lib/templates';
import { prefs, setPrefs, usePrefs } from './lib/prefs';
import { hideSome, setDock, useDock } from './lib/dock';
import { showFillIn } from './lib/content-form';
import { toolGroupsInUse } from './lib/essentials';
import { arrange } from './lib/reorder';
import { toolDragStart, toolKeyMove, toolOrderMenu, TOOL_GROUPS_KEY } from './lib/tool-order';
import { GettingStarted } from './components/GettingStarted';
import { watchGettingStarted } from './lib/onboarding';
import { applyNewcomerEssentials } from './lib/workspaces';
import { snapAny, snapSettings } from './lib/snapping';
import { SnapMenu } from './components/SnapMenu';
import { gridMenu } from './components/grid-menu';
import { MediaCatalogueModal } from './components/MediaCatalogueModal';
import { LinkManager, setLinkManager } from './lib/links';
import { LinkBanner } from './components/LinkBanner';
import { LinkChanges } from './components/LinkChanges';
import { PanelResizeHandle, usePanelWidths } from './components/PanelResize';
import { noteIfStale } from './lib/stale-build';
import { primeStills, releaseStills } from './lib/still-cache';
import { noteProjectDiagnostic, reportError, setProject, span, track } from './lib/analytics';
import { observeStore } from './lib/usage';
import { SHARE_FOR_REVIEW_EVENT, comments, openShareForReview, readNotices } from './lib/comments';

export function Editor({ projectId, home }: { projectId: string; home: () => void }) {
  const [ready, setReady] = useState<EditorStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopLinks: (() => void) | null = null;
    let stopWatching: (() => void) | null = null;
    const openedAt = Date.now();
    (async () => {
      try {
        // The saved pictures of its artboards are read while the project downloads, so the canvas opens with them showing
        const stills = primeStills(projectId);
        const p = await loadProjectRecord(projectId);
        if (!p) throw new Error('That project does not exist (it may have been deleted).');
        await assetUrls.load(p.id);
        // Nearly always done by now; never held up for long if the browser's database is slow
        await Promise.race([stills, new Promise((r) => setTimeout(r, 400))]);
        if (cancelled) return;
        // Colours linked to the shared palette follow it (the stored colour stands if it can't be reached)
        await syncProjectWithPalette(p);
        if (cancelled) return;
        const s = new EditorStore(p);
        setCurrentStore(s);
        // Live editing: ops instead of whole-document saves, and other people's changes as they happen
        setLiveSession(new LiveSession(p.id, s, liveSeqOf(p.id)));
        // Review comments: their own stream, apart from the editing room
        comments.onNotice = (text) => prefs().commentNotices && s.toast(text, 'info');
        void comments.startEditor(p.id);
        // Whatever the bell on the projects page said about this project, you are looking at it now
        void readNotices({ project: p.id }).catch(() => undefined);
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
        // Just made from a template: the checklist opens beside it
        try {
          if (sessionStorage.getItem(CHECKLIST_FLAG) === p.id) {
            sessionStorage.removeItem(CHECKLIST_FLAG);
            if (hasChecklist(p)) s.set({ bottomTab: 'checklist' });
            //a starter with a form opens it beside the page too: writing the content is the first job
            if (p.contentForm?.sections.length) showFillIn();
          }
        } catch {
          /* no session storage */
        }
        setProject(p.id);
        const stopUse = observeStore(s);
        const stopJobs = watchGettingStarted(s);
        stopWatching = () => (stopUse(), stopJobs());
        track('project', 'open', { ms: Date.now() - openedAt, sum: { artboards: p.artboards.length, assets: p.assets.length } });
        setReady(s);
      } catch (err) {
        reportError({ kind: 'open', error: err, where: 'editor-load' });
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
      stopWatching?.();
      setProject(null);
      stopLinks?.();
      liveSession()?.close();
      setLiveSession(null);
      comments.stop();
      comments.onNotice = null;
      setCurrentStore(null);
      releaseStills();
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
    // A save the network or the server dropped tries again by itself: 2 s, 4 s... up to a minute, and straight away
    // when the browser says it is back online. A refused one (too big, not allowed) waits for the next change
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryIn = 2000;
    let retrying = false;
    let lastRefusal = '';
    const retryLater = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retrying = true;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void save();
      }, retryIn);
      retryIn = Math.min(60000, retryIn * 2);
    };
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
        if (retrying) s.toast('Saved again');
        retrying = false;
        retryIn = 2000;
        lastRefusal = '';
      } catch (err) {
        if (err instanceof ConflictError) setConflict(true);
        const message = err instanceof Error ? err.message : String(err);
        const again = err instanceof ApiError && err.retryable;
        s.set({ saveState: 'error', saveError: again ? `${message}. Trying again by itself` : message });
        if (again) {
          if (!retrying) s.toast(`Not saved: ${message}. It will keep trying; keep this tab open.`, 'error');
          retryLater();
        } else if (!(err instanceof ConflictError) && message !== lastRefusal) {
          // Once per reason: the next change saves (and fails) again, and saying it on every keystroke helps nobody
          lastRefusal = message;
          s.toast(`Not saved: ${message}`, 'error');
        }
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
    const onOnline = () => {
      if (!retrying) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      retryIn = 2000;
      void save();
    };
    window.addEventListener('online', onOnline);
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
      window.removeEventListener('online', onOnline);
      if (retryTimer) clearTimeout(retryTimer);
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


function useShortcuts() {
  useEffect(() => {
    installEditorKeys(zoomTo);
    installTimelineKeys();
    //Ctrl+S saves the project from anywhere in the editor, a text box, the code editor and the graph included (panels that
    //keep their keys to themselves too, hence the capture phase), and never lets the browser save the page's html instead
    const onSave = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (!keysSuspended()) void (window as unknown as { __ixForceSave?: () => Promise<void> }).__ixForceSave?.();
    };
    window.addEventListener('keydown', onSave, true);
    const onKey = handleEditorKey;
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
      // Keys copied from the timeline paste at the playhead; the system clipboard says which was copied last, else this session's memory does
      if ((isKeyClipText(text) || (!text?.includes('interactives/nodes') && keysCopiedLast())) && pasteKeys(text)) {
        e.preventDefault();
        return;
      }
      if (pasteNodes(text)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    const unwatchCtx = watchKeyContext();
    const unwatchArea = watchKeyArea();
    return () => {
      unwatchCtx();
      unwatchArea();
      window.removeEventListener('keydown', onSave, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  }, []);
}

function zoomTo(mode: 'fit' | '100' | 'selection' | 'page') {
  const s = store();
  const st = s.get();
  const el = document.querySelector('.canvas') as HTMLElement | null;
  if (!el) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  let box: { x: number; y: number; width: number; height: number } | null = null;
  if (mode === 'page') {
    const ab = s.artboard();
    if (ab) box = { x: ab.canvasX, y: ab.canvasY, width: ab.width, height: ab.height };
  } else if (mode === 'selection') {
    const ab = s.artboard();
    const b = ab && (st.selection.length ? selectionBounds(ab, st.selection) : { x: 0, y: 0, width: ab.width, height: ab.height });
    if (ab && b) box = { x: ab.canvasX + b.x, y: ab.canvasY + b.y, width: b.width, height: b.height };
  } else {
    const drawn = st.project.artboards.filter((a) => !a.canvasHidden);
    const abs = drawn.length ? drawn : st.project.artboards;
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
function Guard(props: { message: string; name?: string; className?: string; children: React.ReactNode }) {
  const project = useEditor((st) => st.project);
  return <ErrorBoundary {...props} resetKey={project} />;
}

//Assets someone else added or replaced while we were both in the project come in as records only: fetch their files
function useRemoteAssets() {
  const projectId = useEditor((st) => st.project.id);
  const assets = useEditor((st) => st.project.assets);
  useEffect(() => {
    assetUrls.link(assets);
    void assetUrls.ensure(
      projectId,
      assets.map((a) => a.id),
    );
  }, [projectId, assets]);
}

//Power users (and the server's brand group) can switch the brand kit lock off for a session, with the suite's F9 / Ctrl+F8. The
//server says who qualifies; nothing is saved with it, and a reload puts the lock back
function useBrandOverride() {
  useEffect(() => {
    let allowed = false;
    let live = true;
    session()
      .then((who) => void (allowed = live && !!(who.brand || who.power)))
      .catch(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (!allowed || !window.powerUser?.isToggleKey(e)) return;
      e.preventDefault();
      const st = store();
      const on = !st.get().brandOverride;
      st.set({ brandOverride: on });
      st.toast(on ? 'Brand lock off: you can edit and detach brand kit items, and change the logo, colours and fonts of a branded starter project (F9 to turn it back on)' : 'Brand lock on', 'info');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      live = false;
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}

function Workspace({ home }: { home: () => void }) {
  const conflict = useAutosave();
  useRemoteAssets();
  useThumbnails();
  useShortcuts();
  useBrandOverride();
  const s = useEditor((st) => ({ toast: st.toast, report: st.report, brandOverride: st.brandOverride }));
  const [widths, setWidth] = usePanelWidths();
  useDockSync();
  const z = useZoneSizes(widths);
  const [preview, setPreview] = useState(false);
  // Someone new (they saw the first-run screen) opens their first project in Essentials, once. A template's checklist stays the tab that is open
  useEffect(() => void applyNewcomerEssentials(), []);
  // Fitted before the first paint (the canvas opens at its final zoom, not at 100% for a frame), and again a frame later in
  // case the panels settled the canvas to a different size
  useLayoutEffect(() => {
    zoomTo('fit');
    requestAnimationFrame(() => zoomTo('fit'));
  }, []);
  //The Interactions tab lifts the bottom panel while it is open (only from the default height)
  useEffect(() => installInteractionsRoom(), []);
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
    <div className={`workspace tools-${z.tools}`} style={{ ['--bottom-h' as string]: `${z.bottom}px`, ['--top-h' as string]: `${z.top}px`, ['--left-w' as string]: `${z.left}px`, ['--right-w' as string]: `${z.right}px` }}>
      <TopBar home={home} onPreview={() => (store().set({ previewPlaying: false }), setPreview(true))} />
      <div className="banner-area">
        {conflict && <ConflictBanner />}
        {s.brandOverride && <div className="power-banner">Power user mode: the brand lock is off for this session. Edits to brand kit items, and to the logo, colours and fonts of a branded starter project, are yours to make (F9 to turn it back on).</div>}
        <LinkBanner />
        <LinkChanges />
        <GettingStarted />
      </div>
      <DockZone zone="top" />
      {z.tools === 'float' ? (
        <FloatingTools>
          <Toolbar />
        </FloatingTools>
      ) : (
        <Toolbar />
      )}
      <DockZone zone="left" />
      <main className="stage">
        <Guard name="canvas" message="Something on this artboard couldn't be drawn.">
          <Canvas />
        </Guard>
        {z.left > 0 && <PanelResizeHandle side="left" width={widths.left} onWidth={(w) => setWidth('left', w)} />}
        {z.right > 0 && <PanelResizeHandle side="right" width={widths.right} onWidth={(w) => setWidth('right', w)} />}
      </main>
      <DockZone zone="right" />
      <DockZone zone="bottom" />
      <DockFloats />
      <DockDragLayer />
      {preview && <PreviewModal onClose={() => setPreview(false)} />}
      <CommandPalette />
      <ComponentPicker />
      {s.toast && <ToastView toast={s.toast} />}
      {s.report && <ReportModal title={s.report.title} lines={s.report.lines} undo={!!s.report.undo} />}
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

/** The theme the canvas draws while you edit (not saved). Only a project with themes has one. */
function ThemeSwitch() {
  const project = useEditor((s) => s.project);
  const shown = useEditor((s) => s.canvasTheme);
  const themes = project.themes;
  if (!themes?.list.length) return null;
  const [hint, setHint] = useState(false);
  const current = themes.list.find((t) => t.id === shown) ?? defaultTheme(themes);
  return (
    <span className="theme-switch-wrap">
      <label className="theme-switch" title="The theme the canvas shows while you edit. Layers with theme colours change, plain colours don't. Exports and pictures use it too. It is not saved with the project">
        <Icons.themes width={14} />
        <select
          value={current.id}
          onChange={(e) => (store().set({ canvasTheme: e.target.value }), setHint(true))}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Theme shown on the canvas"
        >
          {themes.list.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {hint && (
        <div className="theme-fixed-pop">
          <ThemeFixedHint onCanvas onClose={() => setHint(false)} />
        </div>
      )}
    </span>
  );
}

function TopBar({ home, onPreview }: { home: () => void; onPreview: () => void }) {
  usePrefs();
  const helpTitle = useHeaderHelpTitle();
  const s = useEditor((st) => ({ name: st.project.name, saveState: st.saveState, saveError: st.saveError, zoom: st.zoom, rev: st.project.updated, live: st.live, peers: st.peers }));
  const [menu, setMenu] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const st = store();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false);
  //Share and the exports that hand the project to others first show what is likely wrong (Before you share), when there is anything
  const [gate, setGate] = useState<{ what: 'share' | 'export'; go: () => void } | null>(null);
  const gated = (what: 'share' | 'export', go: () => void) => (checkBeforeShare(st.get().project).length ? setGate({ what, go }) : go());
  const exportDefinitions = () => {
    const project = st.get().project;
    download(new Blob([typeDefinitions(project)], { type: 'text/plain' }), `${fileSafe(project.name)}.d.ts`);
  };
  const [reviewOpen, setReviewOpen] = useState(false);
  useEffect(() => {
    const on = () => setReviewOpen(true);
    window.addEventListener(SHARE_FOR_REVIEW_EVENT, on);
    return () => window.removeEventListener(SHARE_FOR_REVIEW_EVENT, on);
  }, []);
  const exportPicture = async (kind: 'png' | 'svg', scale: number) => {
    const state = st.get();
    const ab = getArtboard(state.project, state.activeArtboardId);
    if (!ab) throw new Error('Open an artboard first.');
    const tl = ab.timelines.find((t) => t.id === state.activeTimelineId) ?? null;
    const { downloadArtboardPng, downloadArtboardSvg } = await import('./lib/image-export');
    const warnings = kind === 'png' ? await downloadArtboardPng(state.project, ab, tl, state.playhead, scale, state.canvasTheme) : await downloadArtboardSvg(state.project, ab, tl, state.playhead, state.canvasTheme);
    for (const w of warnings) st.toast(w);
  };
  //An export of a project whose public interface has drifted (renamed or removed variables, messages nothing handles) asks first
  const checked = (fn: () => Promise<void> | void) => async () => {
    const problems = exportProblems(st.get().project);
    if (problems.length) {
      const shown = problems.slice(0, 6).map((i) => `• ${i.message}`);
      if (problems.length > shown.length) shown.push(`…and ${problems.length - shown.length} more`);
      const ok = await confirmDialog({
        title: 'The public interface is out of date',
        message: `Pages that embed this project may rely on the list in Public interface, and it no longer matches the project:\n\n${shown.join('\n')}`,
        confirmLabel: 'Export anyway',
        cancelLabel: 'Fix the list first',
      });
      if (!ok) {
        st.set({ bottomTab: 'interface', previewPlaying: false });
        return;
      }
    }
    await fn();
  };
  const run = async (fn: () => Promise<void> | void) => {
    setMenu(false);
    try {
      await fn();
    } catch (err) {
      if (noteIfStale(err)) return;
      st.toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };
  //What the command palette (and anything else) asks the top bar to do, by name: the same calls the buttons make
  const doAction = useRef<(a: AppAction) => void>(() => undefined);
  doAction.current = (a) => {
    const html = checked(() => downloadStandalone(st.get().project));
    const pack = checked(() => downloadPackage(st.get().project));
    if (a === 'export-html') return gated('export', () => void run(html));
    if (a === 'export-package') return gated('export', () => void run(pack));
    const file = a === 'export-html-now' ? html : a === 'export-package-now' ? pack : a === 'export-json' ? checked(() => downloadJson(st.get().project)) : a === 'export-png' ? () => exportPicture('png', 2) : a === 'export-svg' ? () => exportPicture('svg', 1) : a === 'export-lottie' ? () => exportActiveAsLottie('json') : a === 'export-dotlottie' ? () => exportActiveAsLottie('lottie') : a === 'export-png-1x' ? () => exportPicture('png', 1) : a === 'export-dts' ? checked(() => exportDefinitions()) : null;
    if (file) return void run(file);
    if (a === 'home') home();
    else if (a === 'preview') onPreview();
    else if (a === 'share') gated('share', () => setShareOpen(true));
    else if (a === 'invite') setInviteOpen(true);
    else if (a === 'template') setTemplateOpen(true);
    else if (a === 'history') setHistoryOpen(true);
    else if (a === 'prefs') setPrefsOpen(true);
    else if (a === 'motion') setMotionOpen(true);
    else if (a === 'reference') setReferenceOpen(true);
  };
  useEffect(() => {
    const on = (e: Event) => doAction.current((e as CustomEvent<AppAction>).detail);
    window.addEventListener(APP_ACTION_EVENT, on);
    return () => window.removeEventListener(APP_ACTION_EVENT, on);
  }, []);
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
      <ThemeSwitch />
      <IconButton icon={<Icons.history />} title="Revision history: earlier saved versions of this project" onClick={() => setHistoryOpen(true)} />
      <IconButton icon={<Icons.undo />} title={withKey('Undo', 'undo')} onClick={() => st.undo()} disabled={!st.canUndo()} />
      <IconButton icon={<Icons.redo />} title={withKey('Redo', 'redo')} onClick={() => st.redo()} disabled={!st.canRedo()} />
      <div className="zoom-ctl">
        <button title={withKey('Zoom out', 'zoom-out')} aria-label="Zoom out" onClick={() => st.set({ zoom: Math.max(0.05, s.zoom / 1.25) })}>
          −
        </button>
        <button className="zoom-val" title={withKey('Fit all', 'zoom-fit')} onClick={() => zoomTo('fit')}>
          {Math.round(s.zoom * 100)}%
        </button>
        <button title={withKey('Zoom in', 'zoom-in')} aria-label="Zoom in" onClick={() => st.set({ zoom: Math.min(32, s.zoom * 1.25) })}>
          +
        </button>
      </div>
      <IconButton icon={<Icons.gear />} title="Preferences (mouse wheel, tooltips)" onClick={() => setPrefsOpen(true)} />
      <IconButton icon={<Icons.search />} title={withKey('Find a command and do it: add a layer, go to a page, turn the grid on, share...', 'palette')} onClick={() => void openPalette(false)} />
      <IconButton icon={<Icons.help />} title={helpTitle} onClick={openHeaderHelp} />
      {prefsOpen && <PrefsModal workspace onClose={() => setPrefsOpen(false)} />}
      {shareOpen && <ShareModal onClose={() => setShareOpen(false)} />}
      {gate && <BeforeYouShareModal what={gate.what} onGo={gate.go} onClose={() => setGate(null)} />}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
      {templateOpen && <SaveTemplateModal onClose={() => setTemplateOpen(false)} />}
      {referenceOpen && <ReferenceModal onClose={() => setReferenceOpen(false)} />}
      {motionOpen && <MotionExportModal onClose={() => setMotionOpen(false)} />}
      {reviewOpen && <ShareForReviewModal onClose={() => setReviewOpen(false)} />}
      {historyOpen && <HistoryModal onClose={() => setHistoryOpen(false)} />}
      <button className="btn primary" onClick={onPreview} title="Play the project exactly as the exported file will">
        <Icons.preview width={14} /> Preview
      </button>
      <div className="menu-wrap">
        <button className="btn" onClick={() => setMenu(!menu)} title="Export: save the project, or a picture or animation of it, as files">
          <Icons.download width={14} /> Export
        </button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            <button onClick={() => (setMenu(false), gated('export', () => void run(checked(() => downloadStandalone(st.get().project)))))}>
              Single HTML file
              <span className="muted small">Player, project and assets in one file</span>
            </button>
            <button onClick={() => (setMenu(false), gated('export', () => void run(checked(() => downloadPackage(st.get().project)))))}>
              Project package ({PACKAGE_EXTENSION})
              <span className="muted small">Whole project, re-importable</span>
            </button>
            <button onClick={() => run(checked(() => downloadJson(st.get().project)))}>
              Project JSON
              <span className="muted small">Document only, no asset bytes</span>
            </button>
            <button onClick={() => run(() => setReferenceOpen(true))}>
              Public interface reference…
              <span className="muted small">What an embedding page can set, read and hear</span>
            </button>
            <button onClick={() => run(checked(() => exportDefinitions()))}>
              TypeScript definitions (.d.ts)
              <span className="muted small">Typed names for the public interface</span>
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
            <button onClick={() => run(() => setMotionOpen(true))}>
              Video, GIF or frames…
              <span className="muted small">A timeline of this artboard as MP4, WebM, GIF or PNG pictures</span>
            </button>
          </div>
        )}
      </div>
      <div className="menu-wrap">
        <button className="btn" onClick={() => setShareMenu(!shareMenu)} title="Share the project: a link to play it, people to edit it with, reviewers to comment on it">
          <Icons.share width={14} /> Share
        </button>
        {shareMenu && (
          <div className="menu" onMouseLeave={() => setShareMenu(false)}>
            <button onClick={() => (setShareMenu(false), gated('share', () => setShareOpen(true)))}>
              Share…
              <span className="muted small">Choose where people will use it (a StudyDesk page, the gradebook, a link, a file) and copy the one thing it needs</span>
            </button>
            <button onClick={() => (setShareMenu(false), setInviteOpen(true))}>
              Invite to collaborate…
              <span className="muted small">People who can open and edit it with you, live</span>
            </button>
            <button onClick={() => (setShareMenu(false), setTemplateOpen(true))}>
              Save as template…
              <span className="muted small">A copy other people (or you) start new projects from, with a checklist of what to change</span>
            </button>
            <button onClick={() => (setShareMenu(false), openShareForReview())}>
              Share for review…
              <span className="muted small">A link where reviewers can look and leave comments, without editing</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

//The tool's tooltip with the keys it has now: the person's own, from the keymap
const toolTip = (label: string, tool: Tool) => {
  const keys = [keyHints(`tool.${tool}`), tool === 'hand' ? keyHints('hand-hold') : ''].filter(Boolean).join(' or ');
  return keys ? `${label} (${keys})` : label;
};

const TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select' },
  { tool: 'hand', icon: 'hand', label: 'Hand' },
  { tool: 'artboard', icon: 'artboard', label: 'Page' },
  { tool: 'frame', icon: 'frame', label: 'Frame' },
  { tool: 'rect', icon: 'rect', label: 'Rectangle' },
  { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
  { tool: 'polygon', icon: 'polygon', label: 'Polygon' },
  { tool: 'star', icon: 'star', label: 'Star' },
  { tool: 'line', icon: 'line', label: 'Line' },
  { tool: 'connector', icon: 'connector', label: 'Connector (drag from one layer to another to join them with a line or arrow that follows them)' },
  { tool: 'pen', icon: 'pen', label: 'Pen' },
  { tool: 'pencil', icon: 'pencil', label: 'Pencil (freehand)' },
  { tool: 'bend', icon: 'bend', label: 'Bend (drag an edge into a curve; Alt bends one side)' },
  { tool: 'text', icon: 'text', label: 'Text' },
  { tool: 'draw', icon: 'draw', label: 'Script layer (generative art, charts)' },
  { tool: 'shader', icon: 'shader', label: 'Shader layer (GPU effects, backdrops)' },
  { tool: 'progress', icon: 'progress', label: 'Progress bar (a bar that fills to a value, for scores, steps and timers)' },
  { tool: 'chart', icon: 'chart', label: 'Chart (bar, column, line, pie and donut charts from a list)' },
  { tool: 'bone', icon: 'bone', label: 'Bone (drag to draw one; start on a bone tip to continue the chain)' },
  { tool: 'comment', icon: 'comment', label: 'Comment (click where you want to say something; reviewers see these, exports never do)' },
  { tool: 'note', icon: 'note', label: 'Note (draw a sticky note for the people making this project; players and exports never see it)' },
];

const WEB_TOOLS: { tool: Tool; icon: IconName; label: string }[] = [
  { tool: 'button', icon: 'button', label: 'Button' },
  { tool: 'input', icon: 'input', label: 'Input field' },
  { tool: 'link', icon: 'link', label: 'Link' },
  { tool: 'embed', icon: 'embed', label: 'Embed (HTML or iframe)' },
  { tool: 'video', icon: 'video', label: 'Video' },
];

/** The Add question button: a menu of question types; picking one builds the question on the open artboard and selects it. */
function AddQuestion({ reorderKey }: { reorderKey?: string }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  useEffect(() => {
    const open = () => setPasteOpen(true);
    window.addEventListener('ix-paste-questions', open);
    return () => window.removeEventListener('ix-paste-questions', open);
  }, []);
  const add = (kind: QuestionKind) => {
    const s = store();
    const ab = s.artboard();
    setAt(null);
    if (!ab) return;
    let id: string | null = null;
    track('feature', 'question-add', { thing: kind });
    s.update((d) => void (id = addQuestion(d as Project, ab.id, kind)));
    if (id) s.select([id], { artboardId: ab.id });
  };
  return (
    <>
      {pasteOpen && <PasteQuestionsModal onClose={() => setPasteOpen(false)} />}
      <IconButton
        reorderKey={reorderKey}
        icon={<Icons.question />}
        title="Add question: multiple choice, true/false, fill in the blank, ordering, matching, hotspot"
        active={!!at}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAt(at ? null : { left: r.right + 6, top: Math.max(8, Math.min(r.top, window.innerHeight - 520)) });
        }}
      />
      {at && (
        <>
          <div className="q-menu-scrim" onClick={() => setAt(null)} />
          <div className="q-menu" style={{ left: at.left, top: at.top }} role="menu" aria-label="Add question" onKeyDown={(e) => e.key === 'Escape' && setAt(null)}>
            <div className="q-menu-title">
              Add question <HelpLink topic="question-kit" />
            </div>
            {QUESTION_KINDS.map((k) => (
              <button key={k.value} role="menuitem" onClick={() => add(k.value)}>
                {k.label}
                <span className="muted small">{k.hint}</span>
              </button>
            ))}
            <div className="q-menu-title">Import</div>
            <button
              role="menuitem"
              onClick={() => {
                setAt(null);
                setPasteOpen(true);
              }}
            >
              Paste questions from Word or Excel
              <span className="muted small">A table, a list or lines, with a preview and templates to fill in</span>
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setAt(null);
                void importGiftFile();
              }}
            >
              Import questions from a GIFT file
              <span className="muted small">One question per artboard, from Moodle or the GIFT converter</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

// The tools column in groups that fold (Shapes and Draw start open), so it fits without scrolling. Select and Hand
// always show; a folded group still shows its tool when that's the one in use
export const TOOL_GROUPS: { id: string; label: string; tools: Tool[]; open: boolean }[] = [
  { id: 'shapes', label: 'Shapes', tools: ['artboard', 'frame', 'rect', 'ellipse', 'polygon', 'star'], open: true },
  { id: 'draw', label: 'Draw', tools: ['line', 'connector', 'pen', 'pencil', 'bend'], open: true },
  { id: 'media', label: 'Media', tools: ['text', 'draw', 'shader', 'video'], open: false },
  { id: 'data', label: 'Data', tools: ['progress', 'chart'], open: false },
  { id: 'web', label: 'Web', tools: ['button', 'input', 'link', 'embed'], open: false },
  { id: 'rig', label: 'Rig', tools: ['bone'], open: false },
];
const GROUPS_KEY = 'ix-tool-groups';

function useToolGroups(): [Record<string, boolean>, (id: string) => void] {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const def = Object.fromEntries(TOOL_GROUPS.map((g) => [g.id, g.open]));
    try {
      return { ...def, ...(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}') as Record<string, boolean>) };
    } catch {
      return def;
    }
  });
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  return [open, toggle];
}

/** Show or hide the sticky notes on the canvas (a preference of the person, so a template's explanations can be put away), with how many there are. */
function NotesToggle() {
  const { showNotes } = usePrefs();
  const count = useEditor((st) => countNotes(st.project));
  const title = `${showNotes ? 'Hide' : 'Show'} notes on the canvas (${count})`;
  return (
    <button type="button" className={`icon-btn note-toggle${showNotes ? ' active' : ''}`} title={title} aria-label={title} aria-pressed={showNotes} onClick={() => setPrefs({ showNotes: !showNotes })}>
      {showNotes ? <Icons.eye /> : <Icons.eyeOff />}
      {count > 0 && <span className="note-count">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}

export function Toolbar() {
  const [menu, setMenu] = useState<{ x: number; y: number; target: EventTarget | null } | null>(null);
  const nav = useRef<HTMLElement>(null);
  const tool = useEditor((st) => st.tool);
  const showBones = useEditor((st) => st.showBones);
  const [open, toggle] = useToolGroups();
  const snapPrefs = usePrefs();
  const dock = useDock();
  const place = dock.tools.place;
  // Essentials puts some groups away: they come back when the project already has layers from them or one of their tools is in use
  const away = dock.hiddenTools ?? [];
  const usedAway = useEditor((st) => (away.length ? toolGroupsInUse(st.project) : '')).split(',');
  const putAway = (g: { id: string; tools: Tool[] }) => away.includes(g.id) && !usedAway.includes(g.id) && !g.tools.includes(tool);
  const horizontal = place === 'bottom' || place === 'top';
  const shownGroups = TOOL_GROUPS.filter((g) => !putAway(g));
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [gridMenuAt, setGridMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [snapMenuAt, setSnapMenuAt] = useState<{ x: number; y: number } | null>(null);
  const gridContext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGridMenuAt({ x: e.clientX, y: e.clientY });
  };
  const all = [...TOOLS, ...WEB_TOOLS];
  const btn = (id: Tool) => {
    const t = all.find((x) => x.tool === id);
    if (!t) return null;
    const I = Icons[t.icon];
    return <IconButton key={t.tool} reorderKey={t.tool} icon={<I />} title={toolTip(t.label, t.tool)} active={tool === t.tool} onClick={() => store().set({ tool: t.tool, editingPathId: null })} />;
  };
  const image = (
    <IconButton
      key="image"
      reorderKey="image"
      icon={<Icons.image />}
      title="Image"
      onClick={async () => {
        const files = await pickFiles('image/*,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft,.pptx');
        const ab = store().artboard();
        if (files.length && ab) await insertFiles(files, ab.id, { x: ab.width / 2, y: ab.height / 2 });
      }}
    />
  );
  //an action, not a tool mode: it opens the modal and never stays lit
  const catalogue = <IconButton key="catalogue" reorderKey="catalogue" icon={<Icons.catalogue />} title="Media Catalogue: find a photo and put it on the artboard as a picture" onClick={() => setCatalogueOpen(true)} />;
  const bones = <IconButton key="bones" reorderKey="bones" icon={showBones ? <Icons.eye /> : <Icons.eyeOff />} title={withKey(showBones ? 'Hide bones on the canvas' : 'Show bones on the canvas', 'toggle-bones')} onClick={() => store().set({ showBones: !showBones })} />;
  return (
    <nav
      ref={nav}
      className={`toolbar${horizontal ? ' horizontal' : ''}`}
      aria-orientation={horizontal ? 'horizontal' : undefined}
      onPointerDown={(e) => toolDragStart(e, nav.current, horizontal)}
      onKeyDown={(e) => toolKeyMove(e, nav.current)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, target: e.target });
      }}
    >
      {menu && <ContextMenu x={menu.x} y={menu.y} items={toolsMenu(toolOrderMenu(nav.current, menu.target, horizontal))} onClose={() => setMenu(null)} />}
      {catalogueOpen && <MediaCatalogueModal onClose={() => setCatalogueOpen(false)} />}
      {gridMenuAt && <ContextMenu x={gridMenuAt.x} y={gridMenuAt.y} items={gridMenu()} onClose={() => setGridMenuAt(null)} />}
      {snapMenuAt && <SnapMenu x={snapMenuAt.x} y={snapMenuAt.y} onClose={() => setSnapMenuAt(null)} />}
      <ToolsHead />
      <div className="tool-grid">
        {btn('select')}
        {btn('hand')}
      </div>
      {arrange(
        shownGroups.map((g) => g.id),
        snapPrefs.toolOrder?.[TOOL_GROUPS_KEY],
      ).map((id) => {
        const g = shownGroups.find((x) => x.id === id)!;
        const isOpen = !!open[g.id];
        const activeHere = g.tools.includes(tool);
        // the group's tools and its extra buttons, in the person's order
        const extras: Record<string, ReactNode> = g.id === 'media' ? { image, catalogue } : g.id === 'web' ? { question: <AddQuestion key="q" reorderKey="question" /> } : g.id === 'rig' ? { bones } : {};
        const keys = [...(g.tools as string[]), ...Object.keys(extras)];
        return (
          <div key={g.id} className={`tool-group${isOpen ? ' open' : ''}`} data-reorder-key={g.id}>
            <button type="button" className="tool-group-head" aria-expanded={isOpen} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title={`${isOpen ? 'Fold' : 'Show'} the ${g.label} tools. Drag to move the group, or press Alt+arrow`} onClick={() => toggle(g.id)}>
              <span className="section-chev" aria-hidden="true" />
              {g.label}
            </button>
            <div className="tool-grid">
              {isOpen ? (
                <>{arrange(keys, snapPrefs.toolOrder?.[g.id]).map((k) => extras[k] ?? btn(k as Tool))}</>
              ) : (
                activeHere && btn(tool)
              )}
            </div>
          </div>
        );
      })}
      {TOOL_GROUPS.some(putAway) && (
        <button type="button" className="tool-group-head more-tools" title={`More tools: ${TOOL_GROUPS.filter(putAway).map((g) => g.label).join(', ')}`} onClick={() => setDock((l) => hideSome(l, l.hidden ?? [], []))}>
          More tools
        </button>
      )}
      <div className="toolbar-fill" />
      <div className="tool-grid">
        <IconButton
          icon={<Icons.grid />}
          title={`${snapPrefs.showGrid ? 'Hide' : 'Show'} the grid${keyHint('toggle-grid') ? ` (${keyHint('toggle-grid')})` : ''}. Right-click for the grid size`}
          active={snapPrefs.showGrid}
          pressed={snapPrefs.showGrid}
          onClick={() => setPrefs({ showGrid: !snapPrefs.showGrid })}
          onContextMenu={gridContext}
        />
        <IconButton
          icon={<Icons.magnet />}
          title={`Snapping is ${snapPrefs.snapOn ? (snapAny(snapSettings(snapPrefs)) ? 'on' : 'on, with nothing ticked') : 'off'}: click for the targets (grid, artboard, layers, guides, spacing, pixels, points). Hold Ctrl while dragging to skip it${keyHint('snap-grid') ? `, ${keyHint('snap-grid')} toggles the grid` : ''}`}
          active={snapPrefs.snapOn && snapAny(snapSettings(snapPrefs))}
          pressed={snapPrefs.snapOn}
          popup="menu"
          expanded={!!snapMenuAt}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setSnapMenuAt(snapMenuAt ? null : place === 'top' ? { x: r.left, y: r.bottom + 6 } : horizontal ? { x: r.left, y: Math.max(8, r.top - 330) } : { x: r.right + 6, y: Math.max(8, r.top - 300) });
          }}
          onContextMenu={gridContext}
        />
        {btn('comment')}
        {btn('note')}
        <NotesToggle />
      </div>
    </nav>
  );
}

export function PreviewModal({ onClose }: { onClose: () => void }) {
  const project = useEditor((st) => st.project);
  const abId = useEditor((st) => st.activeArtboardId);
  const [html, setHtml] = useState<string | null>(null);
  // Accessibility features in the preference: the preview plays with or without them, and shows what the screen reader would say
  const { accessibility, screenReader } = usePrefs();
  const [said, setSaid] = useState<{ text: string; politeness: string }[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [from, setFrom] = useState<'start' | 'current'>('start');
  const [log, setLog] = useState<string[]>([]);
  // The Events list follows the newest entry unless this is unticked (kept in this browser)
  const [autoScroll, setAutoScroll] = useState(() => {
    try {
      return localStorage.getItem('ix-events-autoscroll') !== 'off';
    } catch {
      return true;
    }
  });
  const eventsBox = useRef<HTMLElement>(null);
  const [vars, setVars] = useState<Record<string, unknown> | null>(null);
  type DebugState = { artboard: string; timelines: { name: string; playing: boolean; time: number; duration: number }[]; instances: number; variant?: { set: string; width: number } };
  type Trace = { artboard: string; artboardId?: string; id?: string; event: string; target?: string; then: string[]; note?: string; depth: number; at: number };
  const [dbg, setDbg] = useState<DebugState | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  // Script layers that failed or hit a limit, as the player reports them (newest last)
  const [scriptErrors, setScriptErrors] = useState<{ source?: string; layer: string; message: string; kind: string }[]>([]);
  // Follow the newest event (after the list has drawn it)
  useLayoutEffect(() => {
    const el = eventsBox.current;
    if (autoScroll && el) el.scrollTop = el.scrollHeight;
  }, [autoScroll, traces, log, scriptErrors]);
  const [varFilter, setVarFilter] = useState('');
  const t0 = useRef(performance.now());
  const [showVars, setShowVars] = useState(true);
  const [nonce, setNonce] = useState(0);
  //Which frame has loaded: a new one stays see-through until its page is in, so the empty frame's white never shows
  const [frameShown, setFrameShown] = useState(-1);
  const frame = useRef<HTMLIFrameElement>(null);
  //Preview is a modal above everything: focus stays in it, Esc closes it (not the help drawer behind), and help asked for while it is open goes to its own window
  const modalRef = useRef<HTMLDivElement>(null);
  //"Beside the editor": Preview moves up to the right so the canvas and the Interactions graph underneath show while it runs, which is
  //where the nodes light up and the layer that was clicked pulses. The focus trap and the click-outside close are off in that mode.
  const [peek, setPeek] = useState(false);
  const peekRef = useRef(false);
  peekRef.current = peek;
  useEffect(() => {
    setPreviewOpen(true);
    return () => {
      setPreviewOpen(false);
      clearFlow();
    };
  }, []);
  useEffect(() => {
    const release = !peek && modalRef.current ? trapFocus(modalRef.current) : undefined;
    return () => release?.();
  }, [peek]);
  //Its height is whatever is left above the bottom panels
  useLayoutEffect(() => {
    const box = modalRef.current;
    if (!peek || !box) return;
    const fit = () => {
      const bottom = document.querySelector<HTMLElement>('.bottom-dock');
      const top = bottom ? bottom.getBoundingClientRect().top : window.innerHeight * 0.65;
      box.style.height = `${Math.max(240, top - 16)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    const dock = document.querySelector('.bottom-dock');
    if (ro && dock) ro.observe(dock);
    return () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
      box.style.height = '';
    };
  }, [peek]);
  //Select a line of the events list's node in the Interactions graph (and bring the graph into view beside Preview)
  const showNode = (artboardId: string | undefined, id: string | undefined) => {
    if (!id) return;
    const st = store();
    const ab = artboardId ? st.get().project.artboards.find((a) => a.id === artboardId) : undefined;
    setPeek(true);
    st.set({ ...(ab ? { activeArtboardId: ab.id, artboardSelected: false } : {}), selection: [], bottomTab: 'logic', logicSelection: id });
  };
  useFlowVersion();
  const quiet = lastQuietHit();
  // Responsive sets: the width of the page the preview runs in (null: all the room there is), and how much room that is
  const sets = responsiveSets(project as Project);
  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const stageBox = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(1000);
  useEffect(() => {
    const el = stageBox.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    setRoom(el.clientWidth);
    return () => ro.disconnect();
  }, [html === null]);
  // Previewing from a variant opens on a page width that shows it
  useEffect(() => {
    const cur = from === 'current' ? getArtboard(project, abId) : null;
    if (!cur || !sets.length) return;
    const members = setMembers(project.artboards, cur);
    if (members.length > 1) setPageWidth(widthInside(members, cur, room));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, abId]);
  // Drag and drop: outline every draggable layer and drop zone in the running preview
  const [hitAreas, setHitAreas] = useState(false);
  // Themes: which one the preview shows (auto follows the viewer), the viewer it pretends to be, and a host page that supplies CSS variables
  const themes = (project as Project).themes;
  const [theme, setTheme] = useState('auto');
  const [viewer, setViewer] = useState<'device' | 'dark' | 'contrast' | 'dark-contrast'>('device');
  const [host, setHost] = useState<'none' | 'moodle'>('none');
  // The pretend microphone and camera: what they do in the running preview (a real one cannot be had in a sandboxed preview)
  const [mediaSim, setMediaSim] = useState<FakeBehaviour>('works');
  const [keptData, setKeptData] = useState(() => previewLearnerHas((project as Project).id));
  //Course collections have no course in Preview: they are this browser's, and the toolbar says so while the project uses them
  const [usesCourse] = useState(() => usesCourseCollections(project as Project));
  const [keptCourse, setKeptCourse] = useState(() => previewCourseHas());
  const simulateMedia = (b: FakeBehaviour) => frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'simulateMedia', behaviour: b }, '*');
  const applyTheme = (t = theme, v = viewer, h = host) => {
    const w = frame.current?.contentWindow;
    if (!w || !themes?.list.length) return;
    w.postMessage({ target: 'interactives', type: 'hostVars', vars: h === 'moodle' ? SIMULATED_MOODLE : {}, clear: h === 'moodle' ? [] : Object.keys(SIMULATED_MOODLE) }, '*');
    w.postMessage({ target: 'interactives', type: 'simulateViewer', prefs: v === 'device' ? null : { dark: v === 'dark' || v === 'dark-contrast', contrast: v === 'contrast' || v === 'dark-contrast' } }, '*');
    w.postMessage({ target: 'interactives', type: 'setTheme', theme: t }, '*');
  };
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
    // The preview pretends to be a signed in learner on the sample course from the Data panel, so per-course values and context show
    standaloneHtml(project as Project, { startArtboardId: from === 'current' ? abId : undefined, debug: true, accessibility, context: sampleContextFor(project as Project) }).then(
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
      // How the previewed project ran (the player's diagnostics): the load time, and faults for triage
      if (e.data?.source === 'interactives-diag') {
        noteProjectDiagnostic(e.data.diag, 'preview');
        return;
      }
      if (e.data?.source === 'interactives-debug') {
        if (e.data.vars) setVars(e.data.vars);
        if (e.data.state) setDbg(e.data.state);
        if (Array.isArray(e.data.flow)) {
          pushFlow(e.data.flow);
          //Watching beside the editor, the graph shown follows the page that is running
          if (peekRef.current) {
            const st = store();
            const on = (e.data.flow as { a?: string }[]).find((f) => f.a && f.a !== st.get().activeArtboardId && st.get().project.artboards.some((a) => a.id === f.a && !a.canvasHidden));
            if (on?.a) st.set({ activeArtboardId: on.a, artboardSelected: false });
          }
        }
        if (e.data.trace) setTraces((l) => [...l.slice(-199), { ...e.data.trace, at: performance.now() - t0.current }]);
        if (e.data.scripterror) setScriptErrors((l) => [...l.slice(-49), e.data.scripterror]);
        if (e.data.announce) setSaid((l) => [...l.slice(-2), e.data.announce]);
        return;
      }
      //Save user data and remembered progress: kept here per project, like the learner page keeps them in StudyDesk
      const kept = answerPreviewProgress(e.data, store().get().project as Project);
      if (kept) {
        if (e.data.rid) frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'progress', rid: e.data.rid, ...kept }, '*');
        if (e.data.op === 'userdata-save' || e.data.op === 'save' || e.data.op === 'shared-add') setKeptData(true);
        if (e.data.op === 'course-add') setKeptCourse(true);
        return;
      }
      if (e.data?.source !== 'interactives') return;
      setLog((l) => [...l.slice(-50), `${e.data.name}${e.data.payload !== undefined ? ` ${JSON.stringify(e.data.payload)}` : ''}`]);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('message', onMsg);
    window.addEventListener('keydown', onKey);
    const timeInPreview = span('preview', 'open', { thing: 'modal' });
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('keydown', onKey);
      timeInPreview();
    };
  }, [onClose]);
  const ab = getArtboard(project, from === 'current' ? abId : project.settings.startArtboardId);
  const post = (name: string, value: unknown) => frame.current?.contentWindow?.postMessage({ target: 'interactives', type: 'setVariable', name, value }, '*');
  return (
    <div className={`modal-backdrop preview-backdrop${peek ? ' peek' : ''}`} onPointerDown={(e) => !peek && e.target === e.currentTarget && onClose()}>
      <div className="modal preview-modal" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Preview">
        <header>
          <strong>Preview</strong>
          <select value={from} onChange={(e) => setFrom(e.target.value as 'start' | 'current')}>
            <option value="start">From the start artboard</option>
            <option value="current">From this artboard</option>
          </select>
          <span className="muted small preview-size">{ab ? `${ab.width} × ${ab.height}` : ''}{peek ? '' : ' · runs exactly like the exported file'}</span>
          <button
            className={`btn${accessibility ? ' active' : ''}`}
            onClick={() => setPrefs({ accessibility: !accessibility })}
            title="Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements (also in Preferences). Switch it off to check whether a problem comes from it"
          >
            Accessibility {accessibility ? 'on' : 'off'}
          </button>
          <button
            className={`btn${screenReader && accessibility ? ' active' : ''}`}
            onClick={() => setPrefs({ screenReader: !screenReader })}
            title="Show a strip under the preview with what a screen reader would be told by Announce nodes and ix.announce (also in Preferences). It needs Accessibility on"
          >
            Screen reader {screenReader ? 'on' : 'off'}
          </button>
          {themes?.list.length ? (
            <>
              <ThemeFixedHint />
              <select
                value={theme}
                title="The theme the preview shows. Follow the viewer picks one from the colour scheme and contrast settings, the way the finished interactive does"
                aria-label="Theme in the preview"
                onChange={(e) => (setTheme(e.target.value), applyTheme(e.target.value))}
              >
                <option value="auto">Theme: follow the viewer</option>
                {themes.list.map((t) => (
                  <option key={t.id} value={t.id}>
                    Theme: {t.name}
                  </option>
                ))}
              </select>
              {theme === 'auto' && (
                <select value={viewer} title="Pretend the viewer has dark mode or more contrast switched on, to see which theme they would get" aria-label="Simulated viewer" onChange={(e) => (setViewer(e.target.value as typeof viewer), applyTheme(theme, e.target.value as typeof viewer))}>
                  <option value="device">Viewer: this device</option>
                  <option value="dark">Viewer: dark mode</option>
                  <option value="contrast">Viewer: more contrast</option>
                  <option value="dark-contrast">Viewer: dark and more contrast</option>
                </select>
              )}
              {themes.host?.enabled && (
                <select value={host} title="Pretend the page around the interactive supplies Moodle's CSS variables (--bs-primary and so on), to check the tokens that map from them" aria-label="Simulated host page" onChange={(e) => (setHost(e.target.value as typeof host), applyTheme(theme, viewer, e.target.value as typeof host))}>
                  <option value="none">Host: plain page</option>
                  <option value="moodle">Host: Moodle variables</option>
                </select>
              )}
            </>
          ) : null}
          {keptData && (
            <button
              type="button"
              className="btn"
              title="Preview keeps what Save user data and remembered progress save, for this project in this browser, so reopening Preview is like a learner coming back. Forget it to start as a new learner"
              onClick={() => (forgetPreviewLearner((project as Project).id), setKeptData(false), setNonce((n) => n + 1))}
            >
              Forget saved data
            </button>
          )}
          {usesCourse && (
            <span
              className="muted small"
              style={{ whiteSpace: 'nowrap' }}
              role="status"
              title="Course collections are shared by every interactive in a StudyDesk course. Preview has no course, so its collections are kept in this browser only, under their names, and shared by the projects you preview here"
            >
              Collections: this browser only
            </span>
          )}
          {keptCourse && (
            <button
              type="button"
              className="btn"
              title="Forget every course collection Preview has kept in this browser (all projects), to start as a learner with an empty passport"
              onClick={() => (forgetPreviewCourse(), setKeptCourse(false), setNonce((n) => n + 1))}
            >
              Forget collections
            </button>
          )}
          {declaresSensors((project as Project).settings.sensors) && (
            <select
              value={mediaSim}
              title="The preview has a pretend microphone and camera, since the real ones need the page the project is shared in. Make it fail the ways a real one does to build and try the plain version. Try the real devices from the share link in StudyDesk"
              aria-label="Microphone and camera in the preview"
              onChange={(e) => (setMediaSim(e.target.value as FakeBehaviour), simulateMedia(e.target.value as FakeBehaviour))}
            >
              {FAKE_BEHAVIOURS.map((o) => (
                <option key={o.value} value={o.value}>
                  Microphone and camera: {o.label}
                </option>
              ))}
            </select>
          )}
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
              clearFlow();
              t0.current = performance.now();
            }}
            title="Start again from the beginning (timelines, variables and all)"
          >
            Restart
          </button>
          <button
            className={`btn${peek ? ' active' : ''}`}
            aria-pressed={peek}
            onClick={() => setPeek(!peek)}
            title="Move Preview to the side so you can watch the Interactions graph and the canvas while it runs: the nodes that run light up, and the layer you click shows a ring"
          >
            Beside editor
          </button>
          <button className={`btn${showVars ? ' active' : ''}`} onClick={() => setShowVars(!showVars)} title="Debug: what's showing, running timelines, variables (editable) and the events that fire">
            Debug
          </button>
          <IconButton icon={<Icons.close />} title="Close (Esc)" onClick={onClose} />
        </header>
        {sets.length > 0 && <PreviewWidth sets={sets} width={pageWidth} max={room} current={dbg?.variant ? dbg.artboard : undefined} onChange={setPageWidth} />}
        {/* The project's own page colour from the first frame: while it builds, while the frame loads and while the player waits,
            so opening Preview never flashes black, then white, then the page */}
        <div className="preview-body" style={{ background: /^(#|rgb|hsl)/.test((project as Project).settings.pageBackground ?? '') ? (project as Project).settings.pageBackground : undefined }}>
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
          <div className="preview-stage" ref={stageBox}>
          {html && frameShown !== nonce && <BuildingSpinner project={project as Project} overlay />}
          {html ? <iframe key={nonce} ref={frame} title="Preview" allow="autoplay" style={{ ...(pageWidth !== null && pageWidth < room ? { flex: 'none', width: pageWidth } : {}), opacity: frameShown === nonce ? 1 : 0 }} sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox" srcDoc={html} onLoad={() => (setFrameShown(nonce), hitAreas && showHitAreas(true), applyTheme(), mediaSim !== 'works' && simulateMedia(mediaSim))} /> : buildError ? <div className="center-msg">Could not build the preview: {buildError}</div> : <BuildingSpinner project={project as Project} />}
          </div>
        </div>
        {accessibility && screenReader && (
          <div className="preview-said" aria-hidden="true" title="What a screen reader is told by Announce nodes and ix.announce, as it is spoken">
            <strong>Screen reader</strong>
            {said.length ? said.map((a, i) => <span key={i} className={i === said.length - 1 ? 'latest' : undefined}>{a.text}</span>) : <span className="muted">Nothing announced yet. Tab to a clickable layer and press Enter or Space.</span>}
          </div>
        )}
        {showVars && (
          <footer className="preview-log mono small" ref={eventsBox}>
            <div className="debug-log-head">
              <span>Events (newest last)</span>
              <label className="debug-autoscroll" title="Keep the list scrolled to the newest event">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => {
                    setAutoScroll(e.target.checked);
                    try {
                      localStorage.setItem('ix-events-autoscroll', e.target.checked ? 'on' : 'off');
                    } catch {
                      /* storage unavailable */
                    }
                  }}
                />
                Auto-scroll
              </label>
              <button className="btn small-btn" onClick={() => (setTraces([]), setLog([]), setScriptErrors([]))} title="Clear the event list (the preview keeps running)">
                <Icons.trash width={12} /> Clear
              </button>
            </div>
            {scriptErrors.map((x, i) => (
              <div key={`e${i}`} className={x.kind === 'error' ? 'error' : undefined} style={{ whiteSpace: 'pre-wrap' }}>
                {x.source === 'shader' ? 'Shader layer' : 'Script layer'} “{x.layer}” {x.kind === 'error' ? 'stopped' : 'warning'}: {x.message}
              </div>
            ))}
            {quiet && (
              <div className="trace why-nothing" role="status">
                <strong>Why did nothing happen?</strong> {quiet.reason}
              </div>
            )}
            {traces.map((t, i) => (
              <div key={i} className="trace" title={t.note}>
                <span className="muted">{(t.at / 1000).toFixed(2)}s</span> {t.depth ? <span className="muted">[{t.artboard}] </span> : null}
                {t.id ? (
                  <button type="button" className="link-btn trace-node" onClick={() => showNode(t.artboardId, t.id)} title="Show this node in the Interactions graph" aria-label={`${t.event}: show this node in the Interactions graph`}>
                    <strong>{t.event}</strong>
                  </button>
                ) : (
                  <strong>{t.event}</strong>
                )}
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

/** What the Preview's "Moodle variables" host sets on the page around the interactive: a plausible Boost theme. */
const SIMULATED_MOODLE: Record<string, string> = {
  '--bs-primary': '#0f6cbf',
  '--bs-body-bg': '#ffffff',
  '--bs-body-color': '#1d2125',
  '--bs-border-color': '#ced4da',
  '--bs-secondary-color': '#495057',
};

function ReportModal({ title, lines, undo }: { title: string; lines: string[]; undo?: boolean }) {
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
          {undo && (
            <button type="button" className="toast-action" title="Take the whole thing back, as one undo step (Ctrl+Z does the same)" onClick={() => store().undoReport()}>
              Undo
            </button>
          )}
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

/**
 * While Preview builds its page there is no player yet to show its own spinner, so this stands in for it: the same ring, in
 * the project's colours for the theme this device would get (its primary or button token on its background token), with the
 * toolbox gold on the page colour when the project has no themes.
 */
function BuildingSpinner({ project, overlay }: { project: Project; overlay?: boolean }) {
  const t = project.themes;
  const theme = t?.list.length ? pickTheme(t, readViewerPrefs()) : null;
  const colour = (...names: string[]) => {
    if (!t || !theme) return undefined;
    for (const n of names) {
      const tok = tokenByName(t, n);
      const v = tok && tokenValue(t, tok, theme.id);
      if (v && !v.startsWith('token:')) return v;
    }
    return undefined;
  };
  const arc = colour('color/primary', 'color/button') ?? '#ffb448';
  const backdrop = colour('color/background');
  return (
    <div className={`preview-building${overlay ? ' overlay' : ''}`} style={backdrop ? { background: backdrop } : undefined} role="status" aria-label="Building the preview">
      <div className="preview-building-ring" style={{ borderColor: `color-mix(in srgb, ${arc} 25%, transparent)`, borderTopColor: arc }} />
    </div>
  );
}
