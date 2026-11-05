import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { onPanelRequest, store, useEditor, type BottomTab } from '../store/store';
import { dockFloat, getDock, isShown, movePanel, resetDock, setDock, showPanel, subscribeDock, useDock, ZONES, type DockGroup, type DropTarget, type FloatWin, type PanelId, type Zone } from '../lib/dock';
import { Icons, type IconName } from './icons';
import { HelpLink } from '../help/Help';
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
import { InsightsPanel } from '../panels/InsightsPanel';
import { InterfacePanel } from '../panels/InterfacePanel';
import { ThemesPanel } from '../panels/ThemesPanel';
import { AccessibilityPanel } from '../panels/AccessibilityPanel';
import { ChecklistPanel } from '../panels/ChecklistPanel';
import { jumpToThread } from '../lib/comment-jump';
import { useComments } from '../lib/comments';
import { countsOf } from '../../shared/comments.mjs';
import { checklistProgress } from '../lib/templates';
import { track } from '../lib/analytics';

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
  layers: { label: 'Layers', help: 'layers', tip: 'The artboards and the layers on them', body: () => <Layers /> },
  assets: { label: 'Assets', help: 'assets', tip: 'Every file in the project: pictures, video, sound, fonts, data and design files', body: () => <Assets /> },
  libraries: { label: 'Libraries', help: 'libraries', tip: 'Share components and styles between projects', body: () => <LibrariesPanel /> },
  comments: { label: 'Comments', help: 'comments', tip: 'Review comments: notes pinned on the canvas by you and by reviewers, with replies, resolve and assignees', body: () => <CommentsBody /> },
  inspector: { label: 'Properties', help: 'inspector', tip: 'The settings of the selected layers, or of the artboard and project', body: () => <Inspector /> },
  timeline: { label: 'Timeline', icon: 'timeline', help: 'timelines', tip: 'Animate properties with keyframes', tool: true, body: () => <TimelinePanel /> },
  logic: { label: 'Interactions', icon: 'logic', help: 'interactions', tip: 'Events, actions and logic as a node graph', tool: true, body: () => <LogicGraph /> },
  scripts: { label: 'Scripts', icon: 'code', help: 'scripts', tip: 'JavaScript with the ix API', tool: true, body: () => <ScriptsPanel /> },
  variables: { label: 'Variables', icon: 'variable', help: 'variables', tip: 'Named values shared by the whole project', tool: true, body: () => <VariablesPanel /> },
  data: { label: 'Data', icon: 'table', help: 'data-sources', tip: 'JSON, CSV, TSV or text from files or URLs', tool: true, body: () => <DataPanel /> },
  a11y: { label: 'Accessibility', icon: 'a11y', help: 'accessibility-checker', tip: 'Check accessibility: contrast, small text, keyboard access, names and descriptions, autoplay and flashing, with what each means and a report for sign-off', tool: true, body: () => <AccessibilityPanel /> },
  insights: { label: 'Insights', icon: 'insights', help: 'insights', tip: 'What learners did: artboards reached, where they clicked, steps, answers to questions and your own records, as counts', tool: true, body: () => <InsightsPanel /> },
  interface: { label: 'Public interface', icon: 'plug', help: 'public-interface', tip: 'What a page that embeds this project can set, read, send and hear: variables as inputs and outputs, messages, with descriptions. Makes the reference page and TypeScript definitions', tool: true, body: () => <InterfacePanel /> },
  checklist: { label: 'Checklist', icon: 'check', help: 'templates#the-checklist', tip: 'The things to change in a project made from a template: tick them off, click one to find its layer, review before you share', tool: true, body: () => <ChecklistPanel /> },
  themes: { label: 'Themes', icon: 'themes', help: 'themes', tip: 'Colour tokens and the themes that give them values (Light, Dark, High contrast), with a contrast check per theme', tool: true, body: () => <ThemesPanel /> },
  usage: { label: 'Usage', icon: 'usage', help: 'usage', tip: 'What uses what: where each artboard, asset, variable, data source, script and timeline is used, and what is unused', tool: true, body: () => <UsagePanel /> },
};

export const panelLabel = (p: PanelId): string => PANELS[p].label;

/** Panels that exist for this project (the checklist only for one made from a template). */
function useAvailable(): (p: PanelId) => boolean {
  const template = useEditor((st) => !!st.project.template);
  return (p) => p !== 'checklist' || template;
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
    // Whatever the project opens on (the checklist for a template) shows on first paint
    const first = store().get().bottomTab;
    if (first) setDock((l) => showPanel(l, first));
    return () => {
      onPanelRequest(null);
      stop();
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

/** While a tab is dragged: what it is, under the pointer, and the edges of the canvas to drop it on to dock it there. */
export function DockDragLayer() {
  const d = useDrag();
  if (!d) return null;
  const stage = document.querySelector('.stage')?.getBoundingClientRect();
  const t = d.target;
  const edge = (z: Zone, style: React.CSSProperties, label: string) => (
    <div key={z} className={`dock-edge ${z}${t && 'zone' in t && t.zone === z ? ' over' : ''}`} data-dock-edge={z} style={style}>
      {label}
    </div>
  );
  return (
    <>
      {stage && (
        <>
          {edge('left', { left: stage.left, top: stage.top, width: 64, height: stage.height }, 'Dock left')}
          {edge('right', { left: stage.right - 64, top: stage.top, width: 64, height: stage.height }, 'Dock right')}
          {edge('bottom', { left: stage.left + 64, top: stage.bottom - 48, width: Math.max(0, stage.width - 128), height: 48 }, 'Dock at the bottom')}
        </>
      )}
      {t && 'newFloat' in t && <div className="dock-float-ghost" style={{ left: t.newFloat.x, top: t.newFloat.y }} />}
      <div className="dock-drag-tab" style={{ left: d.x + 10, top: d.y + 10 }}>
        {PANELS[d.panel].label}
        <span className="muted"> {!t ? '' : 'newFloat' in t ? 'new window' : 'zone' in t ? `dock ${t.zone}` : 'into this window'}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- a group of tabs (docked or floating)

function tabMenu(p: PanelId, at: { zone: Zone } | { float: string }): MenuItem[] {
  const here = 'zone' in at ? at.zone : null;
  const moveTo = (z: Zone, label: string): MenuItem => ({ label, disabled: here === z, onClick: () => (setDock((l) => movePanel(l, p, { zone: z, index: l.zones[z].tabs.length })), PANELS[p].tool && store().set({ bottomTab: p as BottomTab })) });
  return [
    { heading: PANELS[p].label },
    moveTo('left', 'Dock on the left'),
    moveTo('right', 'Dock on the right'),
    moveTo('bottom', 'Dock at the bottom'),
    { label: 'Float in its own window', disabled: !here, onClick: () => setDock((l) => movePanel(l, p, { newFloat: { x: Math.round(window.innerWidth / 2 - 190), y: 120 } })) },
    { separator: true },
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
  const def = active ? PANELS[active] : null;
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
                else activatePanel(p);
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
      {def && !folded && <HelpLink topic={def.help.split('#')[0]} anchor={def.help.split('#')[1]} />}
      {extra}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}

function PanelBody({ p }: { p: PanelId }) {
  const project = useEditor((st) => st.project);
  return (
    <div className={`dock-body bottom-body dock-${p}`}>
      <ErrorBoundary name={`panel-${p}`} message="This panel couldn't be shown." resetKey={project}>
        {PANELS[p].body()}
      </ErrorBoundary>
    </div>
  );
}

// ---------------------------------------------------------------- docked areas

/** One of the docked areas around the canvas. Renders nothing when every panel has left it (its grid track is 0). */
export function DockZone({ zone }: { zone: Zone }) {
  const l = useDock();
  const ok = useAvailable();
  const g = l.zones[zone];
  const { tabs, active } = visible(g, ok);
  const h = useEditor((st) => st.bottomHeight);
  if (!tabs.length) return null;
  const folded = zone === 'bottom' && l.bottomFolded;
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => store().set({ bottomHeight: Math.max(140, Math.min(window.innerHeight - 200, h - (ev.clientY - y0))) });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const cls = zone === 'bottom' ? 'bottom-dock' : zone === 'left' ? 'left-panel dock-side' : 'dock-right dock-side';
  return (
    <section className={`${cls} dock-zone`} aria-label={`${zone === 'bottom' ? 'Bottom' : zone === 'left' ? 'Left' : 'Right'} panels`}>
      {zone === 'bottom' && !folded && (
        <div
          className="resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the bottom panels"
          aria-valuenow={h}
          tabIndex={0}
          title="Drag to resize the bottom panels (double-click to reset)"
          onPointerDown={startResize}
          onDoubleClick={() => store().set({ bottomHeight: 260 })}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 10;
            if (e.key === 'ArrowUp') store().set({ bottomHeight: Math.min(window.innerHeight - 200, h + step) });
            else if (e.key === 'ArrowDown') store().set({ bottomHeight: Math.max(140, h - step) });
            else return;
            e.preventDefault();
          }}
        />
      )}
      <DockTabs group={g} at={{ zone }} folded={folded} />
      {active && !folded && <PanelBody key={active} p={active} />}
    </section>
  );
}

/** Grid track sizes for the workspace: an area nobody has docked anything in takes no room. */
export function useZoneSizes(widths: { left: number; right: number }): { left: number; right: number; bottom: number; tools: 'left' | 'right' | 'float' } {
  const l = useDock();
  const ok = useAvailable();
  const h = useEditor((st) => st.bottomHeight);
  const has = (z: Zone) => l.zones[z].tabs.some(ok);
  return {
    left: has('left') ? widths.left : 0,
    right: has('right') ? widths.right : 0,
    bottom: !has('bottom') ? 0 : l.bottomFolded ? 34 : h,
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
      <div className="dock-tools-grip" title="Drag to move the tools. Right-click the tools to dock them again" onPointerDown={(e) => dragBox(e, box, 'move', (b) => setDock((x) => ({ ...x, tools: { ...x.tools, x: b.x, y: b.y } })))} />
      {children}
    </div>
  );
}

/** The tool rail's right-click menu: which side it sits on, or floating. */
export function toolsMenu(): MenuItem[] {
  const place = getDock().tools.place;
  const to = (p: 'left' | 'right' | 'float') => () =>
    setDock((l) => ({ ...l, tools: { ...l.tools, place: p, ...(p === 'float' ? { x: 90, y: 110 } : {}) } }));
  return [
    { heading: 'Tools' },
    { label: 'On the left', disabled: place === 'left', onClick: to('left') },
    { label: 'On the right', disabled: place === 'right', onClick: to('right') },
    { label: 'Floating', disabled: place === 'float', onClick: to('float') },
    { separator: true },
    { label: 'Reset panel layout', onClick: () => (resetDock(), store().set({ bottomTab: 'timeline' })) },
  ];
}

export { ZONES };
