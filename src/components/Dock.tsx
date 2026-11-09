import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { onPanelRequest, store, useEditor, type BottomTab } from '../store/store';
import { BOTTOM_DEFAULT, bottomHeightFor, dockFloat, FOLDED_HEIGHT, showAll, getDock, isShown, movePanel, placeTools, resetDock, setDock, showPanel, subscribeDock, toolsDropFor, TOP_HEIGHT, useDock, ZONES, type DockGroup, type DropTarget, type FloatWin, type PanelId, type ToolsDrop, type ToolsPlace, type Zone } from '../lib/dock';
import { Icons, type IconName } from './icons';
import { openHelp, setContextHelp } from '../help/Help';
import { getTopic } from '../help/topics';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ErrorBoundary } from './ErrorBoundary';
import { Layers, Assets } from '../panels/LeftPanel';
import { LibrariesPanel } from '../panels/LibrariesPanel';
import { CommentsPanel } from '../panels/CommentsPanel';
import { Inspector } from '../panels/Inspector';
import { TimelinePanel } from '../panels/Timeline';
import { LogicGraph } from '../panels/LogicGraph';
import { ScriptsPanel, VariablesPanel } from '../panels/ScriptsVariables';
import { DataPanel } from '../panels/DataPanel';
import { UsagePanel } from '../panels/UsagePanel';
import { CreditsPanel } from '../panels/CreditsPanel';
import { IconsPanel } from '../panels/IconsPanel';
import { InsightsPanel } from '../panels/InsightsPanel';
import { InterfacePanel } from '../panels/InterfacePanel';
import { ThemesPanel } from '../panels/ThemesPanel';
import { AccessibilityPanel } from '../panels/AccessibilityPanel';
import { ChecklistPanel } from '../panels/ChecklistPanel';
import { ContentFormPanel } from '../panels/ContentFormPanel';
import { showFillIn } from '../lib/content-form';
import { jumpToThread } from '../lib/comment-jump';
import { panelOn, panelsInUse } from '../lib/essentials';
import { useComments } from '../lib/comments';
import { countsOf } from '../../shared/comments.mjs';
import { checklistProgress } from '../lib/templates';
import { track } from '../lib/analytics';
import { GENERAL_HELP, helpTooltip, resolveHelp, type HelpFocus, type HelpTarget } from '../help/context';
import { getArtboard, locate } from '../store/doc';
import type { NodeType } from 'interactives-player';

// ---------------------------------------------------------------- the panels

interface PanelDef {
  label: string;
  icon?: IconName;
  /** Help topic, with an optional #anchor. */
  help: string;
  tip: string;
  /** The tool panels (the ones code asks for with store.set({ bottomTab })). */
  tool?: boolean;
  body: () => ReactNode;
}

function CommentsBody() {
  const project = useEditor((st) => st.project);
  return <CommentsPanel project={project} onJump={jumpToThread} hint />;
}

const PANELS: Record<PanelId, PanelDef> = {
  layers: { label: 'Layers', help: 'layers-panel', tip: 'The pages and the layers on them', body: () => <Layers /> },
  assets: { label: 'Assets', help: 'assets', tip: 'Every file in the project: pictures, video, sound, fonts, data and design files', body: () => <Assets /> },
  icons: { label: 'Icons', help: 'icons', tip: 'The Toolbox\'s own icons (tick, bell, speech bubble, arrows and more), added as vector layers in a theme colour', body: () => <IconsPanel /> },
  libraries: { label: 'Libraries', help: 'libraries', tip: 'Share components and styles between projects', body: () => <LibrariesPanel /> },
  comments: { label: 'Comments', help: 'comments', tip: 'Review comments: notes pinned on the canvas by you and by reviewers, with replies, resolve and assignees', body: () => <CommentsBody /> },
  inspector: { label: 'Properties', help: 'properties-panel', tip: 'The settings of the selected layers, or of the page and project', body: () => <Inspector /> },
  timeline: { label: 'Timeline', icon: 'timeline', help: 'timelines', tip: 'Animate properties with keyframes', tool: true, body: () => <TimelinePanel /> },
  logic: { label: 'Interactions', icon: 'logic', help: 'interactions', tip: 'Events, actions and logic as a node graph', tool: true, body: () => <LogicGraph /> },
  scripts: { label: 'Scripts', icon: 'code', help: 'scripts', tip: 'JavaScript with the ix API', tool: true, body: () => <ScriptsPanel /> },
  variables: { label: 'Variables', icon: 'variable', help: 'variables', tip: 'Named values shared by the whole project', tool: true, body: () => <VariablesPanel /> },
  data: { label: 'Data', icon: 'table', help: 'data-sources', tip: 'JSON, CSV, TSV or text from files or URLs', tool: true, body: () => <DataPanel /> },
  a11y: { label: 'Accessibility', icon: 'a11y', help: 'accessibility-checker', tip: 'Check accessibility: contrast, small text, keyboard access, names and descriptions, autoplay and flashing, with what each means and a report for sign-off', tool: true, body: () => <AccessibilityPanel /> },
  insights: { label: 'Insights', icon: 'insights', help: 'insights', tip: 'What learners did: pages reached, where they clicked, steps, answers to questions and your own records, as counts', tool: true, body: () => <InsightsPanel /> },
  interface: { label: 'Public interface', icon: 'plug', help: 'public-interface', tip: 'What a page that embeds this project can set, read, send and hear: variables as inputs and outputs, messages, with descriptions. Makes the reference page and TypeScript definitions', tool: true, body: () => <InterfacePanel /> },
  checklist: { label: 'Checklist', icon: 'check', help: 'templates#use-a-template', tip: 'The things to change in a project made from a template: tick them off, click one to find its layer, review before you share', tool: true, body: () => <ChecklistPanel /> },
  content: { label: 'Fill in', icon: 'form', help: 'fill-in-starter', tip: 'Fill in this starter: the words, questions, lists and pictures of a project made from a starter, as a plain form. What you type goes into the project, and the other panels show it', body: () => <ContentFormPanel /> },
  themes: { label: 'Themes', icon: 'themes', help: 'themes', tip: 'Colour tokens and the themes that give them values (Light, Dark, High contrast), with a contrast check per theme', tool: true, body: () => <ThemesPanel /> },
  credits: { label: 'Attributions', icon: 'credits', help: 'attributions', tip: 'Where the pictures, sounds, text and data in this project came from, and what it draws on: credits and references, linked to assets, with an optional Credits button for learners', tool: true, body: () => <CreditsPanel /> },
  usage: { label: 'Usage', icon: 'usage', help: 'usage', tip: 'What uses what: where each page, asset, variable, data source, script and timeline is used, and what is unused', tool: true, body: () => <UsagePanel /> },
};

/** The help topic (with an optional #anchor) a panel's help opens. */
export const panelHelpTopic = (p: PanelId): string => PANELS[p].help;

export const panelLabel = (p: PanelId): string => PANELS[p].label;

/** The panels the project uses something from, as one string so a panel group only re-renders when that changes. Only worked out while something is put away. */
function useInUse(): Set<PanelId> {
  const l = useDock();
  const has = !!l.hidden?.length;
  const reviewed = useComments().threads.length > 0;
  const key = useEditor((st) => (has ? [...panelsInUse(st.project, reviewed)].sort().join(',') : ''));
  return useMemo(() => new Set(key ? (key.split(',') as PanelId[]) : []), [key]);
}

/** Panels that exist for this project (the checklist only for one made from a template) and are not put away (Essentials) unless the project uses them. */
function useAvailable(): (p: PanelId) => boolean {
  const template = useEditor((st) => !!st.project.template);
  const form = useEditor((st) => !!st.project.contentForm?.sections.length);
  const l = useDock();
  const inUse = useInUse();
  return (p) => (p !== 'checklist' || template) && (p !== 'content' || form) && panelOn(l, p, inUse);
}

/** A group's tabs that are there, and the one to show (the active one, or the first that's there). */
function visible(g: DockGroup, ok: (p: PanelId) => boolean): { tabs: PanelId[]; active: PanelId | null } {
  const tabs = g.tabs.filter(ok);
  return { tabs, active: g.active && tabs.includes(g.active) ? g.active : (tabs[0] ?? null) };
}

function TabBadge({ p }: { p: PanelId }) {
  const c = useComments();
  const progress = useEditor((st) => (p === 'checklist' && st.project.template ? checklistProgress(st.project) : null));
  if (p === 'comments') {
    const open = countsOf(c.threads, c.me).open;
    return open ? <span className="badge">{open}</span> : null;
  }
  if (p === 'checklist' && progress && progress.total > 0)
    return (
      <span className="badge">
        {progress.done}/{progress.total}
      </span>
    );
  return null;
}

// ---------------------------------------------------------------- keeping the editor store and the layout in step

/** Pick a tab: the tool panels go through store.bottomTab (which shows them), the others straight to the layout. */
export function activatePanel(p: PanelId): void {
  track('panel', 'open', { thing: p });
  if (PANELS[p].tool) store().set({ bottomTab: p as BottomTab, previewPlaying: false });
  else if (p === 'content') showFillIn();
  else setDock((l) => showPanel(l, p));
}

/** Wires the dock to the editor store: panel requests show panels, and the store hears whether the timeline is on screen. */
export function useDockSync(): void {
  useEffect(() => {
    onPanelRequest((id) => setDock((l) => (id ? showPanel(l, id) : l.zones.bottom.tabs.length ? { ...l, bottomFolded: true } : l)));
    const sync = () => {
      const shown = isShown(getDock(), 'timeline');
      if (store().get().timelineShown !== shown) store().set({ timelineShown: shown });
    };
    sync();
    const stop = subscribeDock(sync);
    document.addEventListener('pointerdown', trackPanelFocus, true);
    document.addEventListener('focusin', trackPanelFocus, true);
    // Whatever the project opens on (the checklist for a template) shows on first paint
    const first = store().get().bottomTab;
    if (first) setDock((l) => showPanel(l, first));
    return () => {
      onPanelRequest(null);
      stop();
      document.removeEventListener('pointerdown', trackPanelFocus, true);
      document.removeEventListener('focusin', trackPanelFocus, true);
    };
  }, []);
}

// ---------------------------------------------------------------- dragging tabs

interface DragState {
  panel: PanelId;
  x: number;
  y: number;
  target: DropTarget | null;
}
let drag: DragState | null = null;
const dragListeners = new Set<() => void>();
const setDrag = (d: DragState | null) => {
  drag = d;
  for (const fn of dragListeners) fn();
};
const useDrag = () =>
  useSyncExternalStore(
    (fn) => (dragListeners.add(fn), () => dragListeners.delete(fn)),
    () => drag,
  );

/** The tool rail being dragged: where the pointer is and what it would do if let go. Shares the panels' drop highlights. */
interface ToolsDragState {
  x: number;
  y: number;
  drop: ToolsDrop;
}
let toolsDrag: ToolsDragState | null = null;
const setToolsDrag = (d: ToolsDragState | null) => {
  toolsDrag = d;
  for (const fn of dragListeners) fn();
};
const useToolsDrag = () =>
  useSyncExternalStore(
    (fn) => (dragListeners.add(fn), () => dragListeners.delete(fn)),
    () => toolsDrag,
  );

/** What a dragged tool rail is over: one of the edge targets, a panel tab strip, or the open canvas. */
function toolsDropAt(x: number, y: number): ToolsDrop {
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const edge = h.dataset?.dockEdge as Zone | undefined;
    if (edge) return toolsDropFor({ edge });
    if (h.closest?.('[data-dock-strip]')) return toolsDropFor({ strip: true });
  }
  return toolsDropFor({});
}

/**
 * Drag the tool rail by its title bar (docked or floating). `at` says where the rail goes for a pointer position, null
 * until the pointer has moved far enough to count as a drag. Letting go over an edge target docks it there; anywhere else
 * it stays where it was dragged to, floating. Escape drops it where it is without docking.
 */
function dragTools(e: React.PointerEvent, at: (ev: PointerEvent) => { x: number; y: number } | null) {
  if (e.button !== 0) return;
  e.preventDefault();
  document.body.classList.add('dock-dragging');
  const move = (ev: PointerEvent) => {
    const to = at(ev);
    if (!to) return;
    setDock((l) => placeTools(l, 'float', to));
    setToolsDrag({ x: ev.clientX, y: ev.clientY, drop: toolsDropAt(ev.clientX, ev.clientY) });
  };
  const end = (ev: PointerEvent | KeyboardEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('keydown', key, true);
    document.body.classList.remove('dock-dragging');
    const d = toolsDrag;
    setToolsDrag(null);
    if (ev.type === 'pointerup' && d && 'place' in d.drop) {
      const place = d.drop.place;
      track('feature', 'dock-move', { thing: `tools-${place}` });
      setDock((l) => placeTools(l, place));
    }
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    end(ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('keydown', key, true);
}

/** What's under the pointer: a tab strip (and where in it), an edge target, or nowhere (a new window there). */
function targetAt(x: number, y: number): DropTarget {
  for (const el of document.elementsFromPoint(x, y)) {
    const h = el as HTMLElement;
    const edge = h.dataset?.dockEdge as Zone | undefined;
    if (edge) return { zone: edge, index: getDock().zones[edge].tabs.length };
    const strip = h.closest?.('[data-dock-strip]') as HTMLElement | null;
    if (strip) {
      const tabs = [...strip.querySelectorAll<HTMLElement>('[data-dock-tab]')];
      // the index among all of the group's tabs, hidden ones included, so it lands where it looks like it does
      const all = (strip.dataset.dockTabs ?? '').split(',');
      let index = all.length;
      for (const t of tabs) {
        const r = t.getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          index = all.indexOf(t.dataset.dockTab!);
          break;
        }
      }
      if (strip.dataset.dockZone) return { zone: strip.dataset.dockZone as Zone, index };
      if (strip.dataset.dockFloat) return { float: strip.dataset.dockFloat, index };
    }
  }
  return { newFloat: { x: x - 60, y: y - 14 } };
}

/** Pointer down on a tab: a click picks it; moving it more than a few pixels drags it. */
function startTabDrag(e: React.PointerEvent, p: PanelId, onClick: () => void) {
  if (e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let moving = false;
  const move = (ev: PointerEvent) => {
    if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!moving) document.body.classList.add('dock-dragging');
    moving = true;
    setDrag({ panel: p, x: ev.clientX, y: ev.clientY, target: targetAt(ev.clientX, ev.clientY) });
  };
  const end = (ev: PointerEvent | KeyboardEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('keydown', key, true);
    document.body.classList.remove('dock-dragging');
    const d = drag;
    setDrag(null);
    if (!moving) {
      if (ev.type === 'pointerup') onClick();
      return;
    }
    if (ev.type !== 'pointerup' || !d?.target) return;
    const target = d.target;
    track('feature', 'dock-move', { thing: 'newFloat' in target ? 'float' : 'zone' in target ? target.zone : 'window' });
    setDock((l) => movePanel(l, p, target));
    if (PANELS[p].tool) store().set({ bottomTab: p as BottomTab });
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    moving = false;
    end(ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('keydown', key, true);
}

/** While a tab or the tool rail is dragged: what it is, under the pointer, and the edges of the canvas to drop it on to dock it there. */
export function DockDragLayer() {
  const d = useDrag();
  const td = useToolsDrag();
  if (!d && !td) return null;
  const stage = document.querySelector('.stage')?.getBoundingClientRect();
  const t = d?.target;
  const toolsOver = td && 'place' in td.drop ? td.drop.place : null;
  const who = td ? 'tools ' : '';
  const edge = (z: Zone, style: React.CSSProperties, label: string) => (
    <div key={z} className={`dock-edge ${z}${(t && 'zone' in t && t.zone === z) || toolsOver === z ? ' over' : ''}`} data-dock-edge={z} style={style}>
      {label}
    </div>
  );
  const chip = td
    ? { at: td, name: 'Tools', note: 'place' in td.drop ? `dock ${td.drop.place}` : 'tabs' in td.drop ? "can't be a tab: drop on an edge to dock" : 'floating' }
    : d && { at: d, name: PANELS[d.panel].label, note: !t ? '' : 'newFloat' in t ? 'new window' : 'zone' in t ? `dock ${t.zone}` : 'into this window' };
  return (
    <>
      {stage && (
        <>
          {edge('left', { left: stage.left, top: stage.top, width: 64, height: stage.height }, `Dock ${who}left`)}
          {edge('right', { left: stage.right - 64, top: stage.top, width: 64, height: stage.height }, `Dock ${who}right`)}
          {edge('bottom', { left: stage.left + 64, top: stage.bottom - 48, width: Math.max(0, stage.width - 128), height: 48 }, `Dock ${who}at the bottom`)}
          {edge('top', { left: stage.left + 64, top: stage.top, width: Math.max(0, stage.width - 128), height: 48 }, `Dock ${who}at the top`)}
        </>
      )}
      {t && 'newFloat' in t && <div className="dock-float-ghost" style={{ left: t.newFloat.x, top: t.newFloat.y }} />}
      {chip && (
        <div className="dock-drag-tab" style={{ left: chip.at.x + 10, top: chip.at.y + 10 }}>
          {chip.name}
          <span className="muted"> {chip.note}</span>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- a group of tabs (docked or floating)

/** Open a panel's own help page (the tab row has no ? of its own any more: this, the tab's right-click menu and the header Help button reach it). */
export function openPanelHelp(p: PanelId): void {
  const [topic, anchor] = PANELS[p].help.split('#');
  openHelp(topic, anchor);
}
const panelHelpTip = (p: PanelId) => {
  const t = getTopic(PANELS[p].help.split('#')[0]);
  return t ? `${t.title}: ${t.summary}` : 'Open the help for this panel';
};

// The panel the person last worked in, and the field they last focused in Properties, so the header Help button can open the
// page for what they are working on. Clicking or tabbing into a panel (or one of its tabs) sets the panel, clicking the canvas
// or the toolbars clears it, and the header, menus and the help itself leave it alone. A field is only remembered while its
// panel is the one worked in, and any click in the panel that isn't on a field forgets it
let lastPanel: PanelId | null = null;
let lastField: NonNullable<HelpFocus['field']> | null = null;
let focusVersion = 0;
const lastListeners = new Set<() => void>();
const bumpFocus = () => {
  focusVersion++;
  for (const fn of lastListeners) fn();
};
const setLastPanel = (p: PanelId | null) => {
  if (p === lastPanel) return;
  lastPanel = p;
  if (p !== 'inspector') lastField = null;
  bumpFocus();
};
const setLastField = (f: typeof lastField) => {
  if (f?.prop === lastField?.prop && f?.sectionHelp === lastField?.sectionHelp) return;
  lastField = f;
  bumpFocus();
};
export const lastPanelWorkedIn = (): PanelId | null => lastPanel;
export function trackPanelFocus(e: Event): void {
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return;
  const own = t.closest('[data-panel], [data-dock-tab]');
  if (own) {
    const id = (own.getAttribute('data-panel') ?? own.getAttribute('data-dock-tab')) as PanelId;
    if (id in PANELS) {
      setLastPanel(id);
      if (id === 'inspector') {
        const row = t.closest('[data-prop]');
        const sec = t.closest('section.section');
        setLastField(row && row.getAttribute('data-prop') && !t.closest('.prop-search') ? { prop: row.getAttribute('data-prop')!, label: row.getAttribute('data-prop')!.replace(/-/g, ' '), sectionHelp: sec?.getAttribute('data-help') ?? undefined, sectionTitle: sec?.getAttribute('data-section-title') ?? undefined } : null);
      }
    }
    return;
  }
  if (t.closest('.topbar, .help-drawer, .quick-help-backdrop, .ctx-menu, [role="menu"], [role="dialog"]')) return;
  setLastPanel(null);
}

/** What the header Help button would open right now, from the selection, the tool, the panel and the focused field. */
export function currentHelpTarget(): HelpTarget {
  const st = store().get();
  const ab = getArtboard(st.project, st.activeArtboardId);
  const layerTypes = ab ? (st.selection.map((id) => locate(ab, id)?.node.type).filter(Boolean) as NodeType[]) : [];
  let graphKind: string | undefined;
  if (ab && st.logicSelection) {
    const node = ab.logic.nodes.find((n) => n.id === st.logicSelection);
    if (node) graphKind = node.kind;
    else if (ab.logic.groups?.some((g) => g.id === st.logicSelection)) graphKind = 'group';
  }
  return resolveHelp({
    field: lastPanel === 'inspector' && lastField ? lastField : undefined,
    panel: lastPanel ? { id: lastPanel, help: PANELS[lastPanel].help, label: PANELS[lastPanel].label } : null,
    layerTypes,
    graphKind,
    keysSelected: st.selectedKeys.length > 0,
    tool: st.tool,
    artboard: !layerTypes.length && st.artboardSelected && ab ? (ab.isMaster ? 'master' : 'artboard') : undefined,
  });
}
/** What the header Help button opens: the page for whatever is highlighted (see help/context.ts). */
export function openHeaderHelp(): void {
  const t = currentHelpTarget();
  const [topic, anchor] = t.to.split('#');
  openHelp(topic, anchor, t === GENERAL_HELP ? undefined : t.label);
}
setContextHelp(openHeaderHelp);
/** The header Help button's tooltip, which says what it will open. */
export function useHeaderHelpTitle(): string {
  useSyncExternalStore(
    (fn) => (lastListeners.add(fn), () => lastListeners.delete(fn)),
    () => focusVersion,
  );
  // re-render when what is highlighted changes
  useEditor((st) => `${st.selection.join(',')}|${st.logicSelection}|${st.selectedKeys.length}|${st.tool}|${st.artboardSelected}|${st.activeArtboardId}|${st.project.artboards.length}`);
  return helpTooltip(currentHelpTarget());
}

function tabMenu(p: PanelId, at: { zone: Zone } | { float: string }): MenuItem[] {
  const here = 'zone' in at ? at.zone : null;
  const moveTo = (z: Zone, label: string): MenuItem => ({ label, disabled: here === z, onClick: () => (setDock((l) => movePanel(l, p, { zone: z, index: l.zones[z].tabs.length })), PANELS[p].tool && store().set({ bottomTab: p as BottomTab })) });
  return [
    { heading: PANELS[p].label },
    moveTo('left', 'Dock on the left'),
    moveTo('right', 'Dock on the right'),
    moveTo('bottom', 'Dock at the bottom'),
    moveTo('top', 'Dock at the top'),
    { label: 'Float in its own window', disabled: !here, onClick: () => setDock((l) => movePanel(l, p, { newFloat: { x: Math.round(window.innerWidth / 2 - 190), y: 120 } })) },
    { separator: true },
    { label: 'Help for this panel', title: panelHelpTip(p), onClick: () => openPanelHelp(p) },
    { label: 'Reset panel layout', title: 'Put every panel back where it started', onClick: () => (resetDock(), store().set({ bottomTab: 'timeline' })) },
  ];
}

function DockTabs({ group, at, folded, extra }: { group: DockGroup; at: { zone: Zone } | { float: string }; folded?: boolean; extra?: ReactNode }) {
  const ok = useAvailable();
  const d = useDrag();
  const { tabs, active } = visible(group, ok);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const t = d?.target;
  const over = !!t && (('zone' in at && 'zone' in t && t.zone === at.zone) || ('float' in at && 'float' in t && t.float === at.float));
  return (
    <div
      className={`tabs dock-tabs${over ? ' drop-over' : ''}`}
      data-dock-strip=""
      data-dock-zone={'zone' in at ? at.zone : undefined}
      data-dock-float={'float' in at ? at.float : undefined}
      data-dock-tabs={group.tabs.join(',')}
      role="tablist"
    >
      {tabs.map((p) => {
        const P = PANELS[p];
        const I = P.icon ? Icons[P.icon] : null;
        const on = p === active && !folded;
        return (
          <button
            key={p}
            role="tab"
            aria-selected={on}
            className={`${on ? 'active' : ''}${over && t && 'index' in t && group.tabs[t.index] === p ? ' drop-before' : ''}${d?.panel === p ? ' dragging' : ''}`}
            data-dock-tab={p}
            title={`${P.tip}. Drag to move it: onto another panel's tabs to dock it there, onto the canvas for its own window. Right-click for more`}
            onPointerDown={(e) =>
              startTabDrag(e, p, () => {
                // The bottom area's open tab folds it away when clicked again, like before
                if ('zone' in at && at.zone === 'bottom' && on) store().set({ bottomTab: null });
                else if ('zone' in at && at.zone === 'top' && on) setDock((l) => ({ ...l, topFolded: true }));
                else {
                  activatePanel(p);
                  //a folded top area opens on the click itself, not through the store
                  if ('zone' in at && at.zone === 'top') setDock((l) => showPanel(l, p));
                }
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activatePanel(p);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, items: tabMenu(p, at) });
            }}
          >
            {I && <I width={14} />} {P.label}
            <TabBadge p={p} />
          </button>
        );
      })}
      {over && t && 'index' in t && t.index >= group.tabs.length && <span className="drop-end" />}
      <div className="spacer" />
      {extra}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function PanelBody({ p }: { p: PanelId }) {
  const project = useEditor((st) => st.project);
  return (
    <div className={`dock-body bottom-body dock-${p}`} data-panel={p}>
      <ErrorBoundary name={`panel-${p}`} message="This panel couldn't be shown." resetKey={project}>
        {PANELS[p].body()}
      </ErrorBoundary>
    </div>
  );
}

/**
 * Under Essentials, the way back to the panels that are put away: one at a time, or all of them (and the tool groups too). Nothing
 * when nothing is put away.
 */
function MorePanels() {
  const l = useDock();
  const inUse = useInUse();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const away = (l.hidden ?? []).filter((p) => !inUse.has(p));
  if (!away.length && !l.hiddenTools?.length) return null;
  const items: MenuItem[] = [
    { heading: 'Put away for now' },
    ...away.map((p): MenuItem => ({ label: PANELS[p].label, title: PANELS[p].tip, onClick: () => activatePanel(p) })),
    { separator: true },
    { label: 'Show all panels and tools', title: 'Leave Essentials: every panel and tool group comes back', onClick: () => setDock(showAll) },
  ];
  return (
    <>
      <button
        type="button"
        className="more-panels"
        aria-haspopup="menu"
        aria-expanded={!!at}
        title="Panels and tools that are put away while you start out. Pick one to bring it back, or show them all"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: Math.max(8, r.right - 220), y: Math.max(8, r.top - 30 - items.length * 30) });
        }}
      >
        More panels
      </button>
      {/* out in the body: inside the tab strip its buttons would take the tabs' look */}
      {at && <ContextMenu x={at.x} y={at.y} items={items} onClose={() => setAt(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- docked areas

//260 stored means "never set" (it follows the window), so a height somebody drags to must not land on exactly that
const nudgeOffDefault = (v: number): number => (Math.round(v) === BOTTOM_DEFAULT ? BOTTOM_DEFAULT + 1 : v);

/** The window's height, so what is sized from it follows a resize. */
function useWindowHeight(): number {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('resize', cb);
      return () => window.removeEventListener('resize', cb);
    },
    () => window.innerHeight,
  );
}

/** One of the docked areas around the canvas. Renders nothing when every panel has left it (its grid track is 0). */
export function DockZone({ zone }: { zone: Zone }) {
  const l = useDock();
  const ok = useAvailable();
  const g = l.zones[zone];
  const { tabs, active } = visible(g, ok);
  const winH = useWindowHeight();
  const h = bottomHeightFor(useEditor((st) => st.bottomHeight), winH);
  if (!tabs.length) return null;
  const folded = (zone === 'bottom' && l.bottomFolded) || (zone === 'top' && l.topFolded);
  const top = zone === 'top';
  const size = top ? l.topHeight : h;
  const [min, max] = top ? [TOP_HEIGHT.min, Math.min(TOP_HEIGHT.max, window.innerHeight - 200)] : [140, window.innerHeight - 200];
  const setSize = (v: number) => (top ? setDock((d) => ({ ...d, topHeight: Math.round(Math.max(min, Math.min(max, v))) })) : store().set({ bottomHeight: nudgeOffDefault(Math.max(min, Math.min(max, v))) }));
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    //the top area grows downwards, the bottom one upwards
    const move = (ev: PointerEvent) => setSize(size + (top ? 1 : -1) * (ev.clientY - y0));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const cls = zone === 'bottom' ? 'bottom-dock' : zone === 'top' ? 'top-dock' : zone === 'left' ? 'left-panel dock-side' : 'dock-right dock-side';
  const name = top ? 'top' : zone === 'bottom' ? 'bottom' : zone === 'left' ? 'left' : 'right';
  const handle = (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label={`Resize the ${name} panels`}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`Drag to resize the ${name} panels (double-click to reset)`}
      onPointerDown={startResize}
      onDoubleClick={() => (top ? setSize(TOP_HEIGHT.def) : store().set({ bottomHeight: BOTTOM_DEFAULT }))}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        //up makes the bottom area taller and the top one shorter
        const grow = top ? 'ArrowDown' : 'ArrowUp';
        const shrink = top ? 'ArrowUp' : 'ArrowDown';
        if (e.key === grow) setSize(size + step);
        else if (e.key === shrink) setSize(size - step);
        else return;
        e.preventDefault();
      }}
    />
  );
  return (
    <section className={`${cls} dock-zone`} aria-label={`${name === 'top' ? 'Top' : name === 'bottom' ? 'Bottom' : name === 'left' ? 'Left' : 'Right'} panels`}>
      {zone === 'bottom' && !folded && handle}
      <DockTabs
        group={g}
        at={{ zone }}
        folded={folded}
        extra={
          zone === 'bottom' ? (
            <MorePanels />
          ) : (
          top && (
            <button type="button" className="icon-btn" title={folded ? 'Unfold the top panels' : 'Fold the top panels down to their tabs'} aria-label={folded ? 'Unfold the top panels' : 'Fold the top panels'} aria-expanded={!folded} onClick={() => setDock((d) => ({ ...d, topFolded: !d.topFolded }))}>
              <Icons.chevronDown width={13} style={{ transform: folded ? 'rotate(-90deg)' : undefined }} />
            </button>
          )
          )
        }
      />
      {active && !folded && <PanelBody key={active} p={active} />}
      {top && !folded && handle}
    </section>
  );
}

/** Grid track sizes for the workspace: an area nobody has docked anything in takes no room. */
export function useZoneSizes(widths: { left: number; right: number }): { left: number; right: number; bottom: number; top: number; tools: ToolsPlace } {
  const l = useDock();
  const ok = useAvailable();
  const winH = useWindowHeight();
  const h = bottomHeightFor(useEditor((st) => st.bottomHeight), winH);
  const has = (z: Zone) => l.zones[z].tabs.some(ok);
  return {
    left: has('left') ? widths.left : 0,
    right: has('right') ? widths.right : 0,
    bottom: !has('bottom') ? 0 : l.bottomFolded ? FOLDED_HEIGHT : h,
    top: !has('top') ? 0 : l.topFolded ? FOLDED_HEIGHT : Math.min(l.topHeight, Math.max(TOP_HEIGHT.min, window.innerHeight - 200)),
    tools: l.tools.place,
  };
}

// ---------------------------------------------------------------- floating windows

const clampWin = (f: { x: number; y: number; w: number; h: number }) => ({
  x: Math.max(0, Math.min(f.x, window.innerWidth - 120)),
  y: Math.max(0, Math.min(f.y, window.innerHeight - 40)),
  w: Math.min(f.w, window.innerWidth),
  h: Math.min(f.h, window.innerHeight),
});

/** Move or resize with the pointer, writing the window's new box as it goes. */
function dragBox(e: React.PointerEvent, from: { x: number; y: number; w: number; h: number }, mode: 'move' | 'size', write: (b: { x: number; y: number; w: number; h: number }) => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX;
  const y0 = e.clientY;
  document.body.classList.add('dock-dragging');
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    write(mode === 'move' ? { ...from, x: from.x + dx, y: from.y + dy } : { ...from, w: Math.max(220, from.w + dx), h: Math.max(140, from.h + dy) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    document.body.classList.remove('dock-dragging');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function FloatWindow({ f, front }: { f: FloatWin; front: boolean }) {
  const ok = useAvailable();
  const { active } = visible(f, ok);
  const box = clampWin(f);
  const write = (b: { x: number; y: number; w: number; h: number }) => setDock((l) => ({ ...l, floats: l.floats.map((x) => (x.id === f.id ? { ...x, ...b } : x)) }));
  const raise = () => !front && setDock((l) => ({ ...l, floats: [...l.floats.filter((x) => x.id !== f.id), l.floats.find((x) => x.id === f.id)!] }));
  return (
    <div className={`dock-float${front ? ' front' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }} onPointerDownCapture={raise} role="dialog" aria-label={`${f.tabs.map(panelLabel).join(', ')} (floating)`}>
      <div
        className="dock-float-head"
        title="Drag to move this window"
        onPointerDown={(e) => {
          // the tabs drag themselves; the rest of the bar moves the window
          if ((e.target as HTMLElement).closest('[data-dock-tab], button, a')) return;
          dragBox(e, box, 'move', write);
        }}
      >
        <DockTabs
          group={f}
          at={{ float: f.id }}
          extra={
            <button type="button" className="icon-btn dock-float-close" title="Close this window: its panels go back to where they started" aria-label="Close this window and dock its panels" onClick={() => setDock((l) => dockFloat(l, f.id))}>
              <Icons.close width={13} />
            </button>
          }
        />
      </div>
      {active && <PanelBody key={active} p={active} />}
      <div className="dock-float-size" title="Drag to resize" onPointerDown={(e) => dragBox(e, box, 'size', write)} />
    </div>
  );
}

/** Every floating window, over the canvas and below menus and dialogs. */
export function DockFloats() {
  const l = useDock();
  const ok = useAvailable();
  const floats = l.floats.filter((f) => f.tabs.some(ok));
  return (
    <>
      {floats.map((f, i) => (
        <FloatWindow key={f.id} f={f} front={i === floats.length - 1} />
      ))}
    </>
  );
}

/** The tool rail in its own small window, when it's been floated. */
export function FloatingTools({ children }: { children: ReactNode }) {
  const l = useDock();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 72, h: 400 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const box = clampWin({ x: l.tools.x, y: l.tools.y, w: size.w, h: size.h });
  return (
    <div ref={ref} className="dock-float dock-tools-float front" style={{ left: box.x, top: box.y }} role="toolbar" aria-label="Tools (floating)">
      <div
        className="dock-tools-grip"
        title="Drag to move the tools. Drop them on an edge of the canvas to dock them there (left, right, top or bottom), or right-click for the menu"
        onPointerDown={(e) => {
          const x0 = e.clientX;
          const y0 = e.clientY;
          dragTools(e, (ev) => clampWin({ x: box.x + ev.clientX - x0, y: box.y + ev.clientY - y0, w: size.w, h: size.h }));
        }}
      >
        Tools
      </div>
      {children}
    </div>
  );
}

/**
 * The docked tool rail's title. Dragging it more than a few pixels lifts the rail out into its own floating window under
 * the pointer, and the same drag carries on moving it (a floated rail has its own title bar, in FloatingTools). Dropping it
 * on an edge target docks it there, the same targets the panels use.
 */
export function ToolsHead() {
  const l = useDock();
  if (l.tools.place === 'float') return null;
  const down = (e: React.PointerEvent) => {
    const x0 = e.clientX;
    const y0 = e.clientY;
    //where in the title it was picked up, so the floated rail stays under the pointer the same way
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ox = x0 - r.left;
    const oy = y0 - r.top;
    dragTools(e, (ev) => (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6 ? null : clampWin({ x: ev.clientX - ox, y: ev.clientY - oy, w: 74, h: 200 })));
  };
  const horizontal = l.tools.place === 'bottom' || l.tools.place === 'top';
  return (
    <div className={`dock-tools-grip docked${horizontal ? ' horizontal' : ''}`} title="Drag to float the tools, or onto an edge of the canvas to dock them there. Right-click the tools for the menu" onPointerDown={down}>
      Tools
    </div>
  );
}

/** The tool rail's right-click menu: which side it sits on, along the bottom, or floating. */
export function toolsMenu(order: MenuItem[] = []): MenuItem[] {
  const place = getDock().tools.place;
  const to = (p: ToolsPlace) => () => setDock((l) => placeTools(l, p, p === 'float' ? { x: 90, y: 110 } : undefined));
  return [
    { heading: 'Tools' },
    { label: 'Dock on the left', disabled: place === 'left', onClick: to('left') },
    { label: 'Dock on the right', disabled: place === 'right', onClick: to('right') },
    { label: 'Dock at the bottom', disabled: place === 'bottom', onClick: to('bottom') },
    { label: 'Dock at the top', disabled: place === 'top', onClick: to('top') },
    { label: 'Floating', disabled: place === 'float', onClick: to('float') },
    { separator: true },
    ...order,
    ...(order.length ? [{ separator: true as const }] : []),
    { label: 'Help for the tools', title: 'The tool bar and what each tool does', onClick: () => openHelp('interface', 'tool-bar-left-edge-unless-you-move-it') },
    { label: 'Reset panel layout', onClick: () => (resetDock(), store().set({ bottomTab: 'timeline' })) },
  ];
}

export { ZONES };
