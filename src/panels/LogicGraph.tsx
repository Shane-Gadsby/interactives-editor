import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  ControlButton,
  Controls,
  Handle,
  NodeResizer,
  Position,
  SelectionMode,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { silenceFlowAttributionWarning } from '../lib/flow-licence';
import { cloneFragment, copyLogic, fragmentOf, fragmentOrigin, logicToPaste, type LogicFragment } from '../lib/logic-clipboard';
import {
  NOTE_COLOURS,
  ANIMATABLE_PROPS,
  TRANSITION_SPEEDS,
  layerOwnProps,
  CURSORS,
  CATALOG_BY_KIND,
  EASING_NAMES,
  defaultParams,
  uid,
  isContainer,
  isLive,
  walk,
  type Artboard,
  type LogicGroup,
  type LogicNode,
  type ParamDef,
  type Project,
  type SceneNode,
} from 'interactives-player';
import { store, useEditor } from '../store/store';
import { openHelp } from '../help/Help';
import { slug } from '../help/markdown';
import { getArtboard } from '../store/doc';
import { CheckField, NumberField, SelectField, SpeedField, TextField } from '../components/ui';
import { ConditionField } from '../components/ConditionField';
import { ExprField } from '../components/ExprField';

/** Names an expression in a graph node sees on top of the project's. */
const GRAPH_LOCALS = ['event', 'ix'];
import { CodeEditor } from '../components/CodeEditor';
import { SplitColumns } from '../components/SplitColumns';

// We hold the React Flow Pro licence (hideAttribution below); drop the library's dev-only notice about it
if (import.meta.env.DEV) silenceFlowAttributionWarning();
import { assetKind } from '../lib/assets';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { choiceDialog, promptDialog } from '../components/dialogs';
import { tidyGraph, type TidyNote } from '../lib/graph-tidy';
import { track } from '../lib/analytics';
import { Icons } from '../components/icons';
import { addAssetOption, addVariableOption, withQuickAdd } from '../lib/quick-add';
import { usePrefs } from '../lib/prefs';
import { compatibleKinds, newNodePort, type DragDirection } from '../lib/graph';
import { artboardChoices } from '../lib/variants-edit';
import { nodeMenuItems } from '../lib/node-menu';
import { GraphPalette } from './GraphPalette';
import { FlowSentences } from './FlowSentences';
import { MasterFlows } from './MasterFlows';
import { stepArtboard } from './ArtboardPicker';
import { CONTEXT_ORDER, commandFor, keyHints, matches, withKey } from '../lib/keymap';
import { GraphNoteForm, GraphNoteNode, resizing as noteResizing, type GraphNoteData } from './GraphNoteNode';
import { flashOf, useFlowVersion, wireClass } from '../lib/run-flow';
import { foldedEdges, framesToOpen, hiddenIn, isFoldId, kitBlocks } from '../lib/graph-fold';
import { labelOfKind, nodeAka, nodeHeading, nodeLabel, nodeTip, plainParam, pw, optionLabel, useTechnicalWording } from '../lib/plain-words';
import { finishReveal, frameRects, onReveal, pendingReveal, reducedMotion, type RevealRequest } from '../lib/graph-reveal';
import { setLastKeyArea } from '../lib/key-area';
import { addGraphNote, anchorOrigin, graphNotePlace, patchGraphNote, removeGraphNotes, attachGraphNote } from '../lib/graph-notes';
import { SectionBlurb } from '../components/SectionBlurb';

type IxNodeData = { logic: LogicNode; summary: string; revealed?: boolean };

const CAT_COLOR: Record<string, string> = { event: 'var(--event)', action: 'var(--action)', logic: 'var(--logic)' };

function IxNode({ data, selected }: NodeProps<Node<IxNodeData>>) {
  const technical = useTechnicalWording();
  const def = CATALOG_BY_KIND[data.logic.kind];
  //Lit while Preview runs it: green when it ran, grey when an event's "Only if" said no (the word is there for anyone who can't tell the colours apart)
  useFlowVersion();
  const lit = flashOf(data.logic.id);
  if (!def) return <div className="ix-graph-node unknown">Unknown node {data.logic.kind}</div>;
  const flash = lit && lit.kind !== 'wire' ? lit : null;
  return (
    <div className={`ix-graph-node${selected ? ' selected' : ''}${data.revealed ? ' revealed' : ''}${flash ? ` flash-${flash.kind} flash-${flash.n % 2}` : ''}`} style={{ ['--cat' as string]: CAT_COLOR[def.category] }}>
      {def.hasInput && <Handle type="target" position={Position.Left} id="in" />}
      <div className="gn-head">
        <span className="gn-cat">{def.category}</span>
        <span title={nodeTip(def, technical)}>{nodeLabel(def, technical)}</span>
        {flash && (
          <span className="gn-ran" role="status">
            {flash.kind === 'ran' ? 'ran' : 'held back'}
          </span>
        )}
      </div>
      <div className="gn-body">{data.summary || <span className="muted">{pw(def.summary, technical)}</span>}</div>
      <div className="gn-outs">
        {def.outputs.map((o, i) => (
          <div key={o.id} className="gn-out" style={{ top: 34 + i * 18 }}>
            {o.label && <span>{pw(o.label, technical)}</span>}
            <Handle type="source" position={Position.Right} id={o.id} style={{ top: 'auto', position: 'relative', transform: 'none', right: -8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

type KitFoldData = { frame: string; name: string; count: number; kinds: string; memberIds: string[]; open: boolean; onToggle: (frame: string) => void };

/**
 * One question's kit nodes: folded they are this block (connections that cross its edge are drawn to it), open it is a small tab
 * above them with Fold. A real button, so the keyboard folds and opens it. Only drawn so, the nodes are ordinary ones.
 */
function KitFoldNode({ data }: NodeProps<Node<KitFoldData>>) {
  useFlowVersion();
  const ran = data.memberIds.some((id) => flashOf(id)?.kind === 'ran');
  if (data.open)
    return (
      <button type="button" className="ix-kit-tab nodrag nopan" aria-expanded="true" title={`Fold the ${data.count} nodes the question kit made for ${data.name} back into one block`} onClick={() => data.onToggle(data.frame)}>
        <Icons.chevronDown width={10} height={10} /> {data.name}: kit nodes ({data.count}) · Fold
      </button>
    );
  return (
    <div className={`ix-kit-block${ran ? ' ran' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <button type="button" className="ix-kit-open nodrag nopan" aria-expanded="false" title={`The ${data.count} nodes the question kit made for ${data.name}: open them to see or change them`} onClick={() => data.onToggle(data.frame)}>
        <strong>{data.name}</strong>
        <span className="small">Made by the question kit · {data.count} nodes{ran ? ' · ran' : ''}</span>
        <span className="small muted">{data.kinds}</span>
        <span className="ix-kit-hint">Open</span>
      </button>
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} />
    </div>
  );
}

type GroupData = { group: LogicGroup };

/** Colours a group can take. The empty one is the default (the frame takes the editor's muted line colour). */
export const GROUP_COLORS = [
  { label: 'Grey', value: '' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Red', value: '#dc2626' },
];

/** A change to one group of the open artboard's graph, through the store like every other edit. */
function updateGroup(id: string, fn: (g: LogicGroup) => void, coalesce?: string) {
  const st = store();
  const abId = st.get().activeArtboardId;
  st.update(
    (d) => {
      const g = d.artboards.find((x) => x.id === abId)?.logic.groups?.find((x) => x.id === id);
      if (g) fn(g as LogicGroup);
    },
    { coalesce },
  );
}

//Set while a group's resize handles are held: its position changes then are the frame growing to the left or up,
//not the group being dragged, so the nodes inside stay where they are
let resizingGroup: string | null = null;

function GroupNode({ data, selected }: NodeProps<Node<GroupData>>) {
  const g = data.group;
  const [editing, setEditing] = useState(false);
  const commit = (v: string) => {
    setEditing(false);
    if (v.trim() !== g.label) updateGroup(g.id, (x) => void (x.label = v.trim().slice(0, 200)));
  };
  return (
    <div className={`ix-group${selected ? ' selected' : ''}`} style={g.color ? { ['--group' as string]: g.color } : undefined}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        onResizeStart={() => (resizingGroup = g.id)}
        onResizeEnd={() => {
          resizingGroup = null;
          store().commit();
        }}
      />
      <div className="ix-group-head" title="Click to select the group, drag to move it with the nodes in it, double-click to rename" onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <input
            className="ix-group-input nodrag"
            autoFocus
            defaultValue={g.label}
            aria-label="Group name"
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commit(e.currentTarget.value);
              else if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          g.label || 'Group'
        )}
      </div>
    </div>
  );
}

const nodeTypes = { ix: IxNode, ixgroup: GroupNode, ixnote: GraphNoteNode, ixkit: KitFoldNode };

//Layer names of an artboard, kept for as long as its layers are the same objects (every node on the graph reads them)
const layerNames = new WeakMap<object, Map<string, string>>();

function namesOf(ab: Artboard): Map<string, string> {
  let names = layerNames.get(ab.children);
  if (!names) {
    names = new Map<string, string>();
    walk(ab.children, (x) => names!.set(x.id, x.name));
    layerNames.set(ab.children, names);
  }
  return names;
}

export function summarize(n: LogicNode, ab: Artboard, project: Project): string {
  const def = CATALOG_BY_KIND[n.kind];
  if (!def) return '';
  const parts: string[] = [];
  const names = namesOf(ab);
  for (const p of def.params) {
    if (p.showIf && !p.showIf.values.includes(n.params[p.showIf.key] ?? defaultParams(n.kind)[p.showIf.key])) continue;
    const v = n.params[p.key];
    if (v === undefined || v === '') continue;
    let text = String(v);
    //Go to artboard: a chosen one reads as its name, and one worked out by an expression as "computed" (the expression is in the settings)
    if (n.kind === 'action.artboard' && p.key === 'to' && (v === 'picked' || v === 'expression')) continue;
    if (n.kind === 'action.artboard' && p.key === 'expr') {
      parts.push('computed');
      continue;
    }
    //An event's Only if, and a timer's Only while, read as a condition
    if (p.key === 'onlyIf' || (n.kind === 'event.timer' && p.key === 'while')) {
      parts.push(`${p.key === 'onlyIf' ? 'if' : 'while'} ${text.trim().replace(/\s+/g, ' ').slice(0, 40)}`);
      continue;
    }
    if (p.type === 'node') text = names.get(text) ?? '(missing layer)';
    else if (p.type === 'timeline') text = ab.timelines.find((t) => t.id === v)?.name ?? '(missing timeline)';
    else if (p.type === 'blend') text = ab.blends?.find((b) => b.id === v)?.name ?? '(missing blend)';
    else if (p.type === 'variable') text = project.variables.find((x) => x.id === v)?.name ?? '(missing variable)';
    else if (p.type === 'variables') text = (Array.isArray(v) ? v : []).map((id) => project.variables.find((x) => x.id === id)?.name ?? '(missing variable)').join(', ');
    else if (p.type === 'artboard') text = project.artboards.find((x) => x.id === v)?.name ?? '(missing artboard)';
    else if (p.type === 'script') text = project.scripts.find((x) => x.id === v)?.name ?? '(missing script)';
    else if (p.type === 'data') text = project.dataSources.find((x) => x.id === v)?.name ?? '(missing data)';
    else if (p.type === 'asset') text = project.assets.find((x) => x.id === v)?.name ?? '(missing sound)';
    else if (p.widget === 'speed') text = TRANSITION_SPEEDS.find((x) => x.ms === Number(v))?.label ?? `${text} ms`;
    else if (p.type === 'select') text = pw(p.options?.find((o) => o.value === v) ? optionLabel(n.kind, p.key, p.options.find((o) => o.value === v)!) : text);
    else if (p.type === 'boolean') text = v ? p.label : '';
    else if (p.type === 'text' && n.kind === 'action.code') text = text.split('\n')[0].slice(0, 40);
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}

export function LogicGraph() {
  const s = useEditor((st) => ({ project: st.project, abId: st.activeArtboardId, sel: st.logicSelection, picked: st.logicPicked, view: st.logicView }));
  const { theme, showNotes } = usePrefs();
  const ab = getArtboard(s.project, s.abId);
  const rf = useRef<ReactFlowInstance<Node<IxNodeData>, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  //The graph is not on screen while the sentences are, so its handle is let go (it comes back with onInit)
  useEffect(() => {
    if (s.view === 'sentences') rf.current = null;
  }, [s.view]);
  const searchRef = useRef<HTMLInputElement>(null);
  //A menu pick (or a drop) leaves focus on a button that's just been removed, so on the page itself, where Delete and the
  //other shortcuts mean the artboard's layers. Back into the graph, unless the person has gone to a field of their own
  const focusGraph = () =>
    requestAnimationFrame(() => {
      const here = document.activeElement;
      if (here && here !== document.body && !canvasRef.current?.contains(here)) return;
      canvasRef.current?.focus({ preventScroll: true });
    });

  // Everything selected: the store's list when the main item is in it, otherwise just the main item (another panel
  // selected one node, or nothing is selected)
  const chosen = useMemo(() => (s.sel ? (s.picked.includes(s.sel) ? s.picked : [s.sel]) : []), [s.sel, s.picked]);
  const chosenNow = () => {
    const st = store().get();
    return st.logicSelection ? (st.logicPicked.includes(st.logicSelection) ? st.logicPicked : [st.logicSelection]) : [];
  };
  /** Select these nodes and groups; `main` (the last one by default) is the one the settings column shows. */
  const select = (ids: string[], main?: string | null) => store().set({ logicPicked: ids, logicSelection: main !== undefined ? main : (ids[ids.length - 1] ?? null) });
  /** What a menu on `id` acts on: the whole selection when `id` is part of it, otherwise just `id`. */
  const targetIds = (id: string) => (chosenNow().includes(id) ? chosenNow() : [id]);

  //The nodes just added glow for a moment (not at all with reduced motion)
  const [glow, setGlow] = useState<string[]>([]);
  //A node the flow didn't change keeps its object, so React Flow leaves it alone (a click on one node in a big graph redrew every node)
  const kept = useRef(new Map<string, { logic: LogicNode; summary: string; selected: boolean; revealed: boolean; node: Node<IxNodeData> }>());
  useEffect(() => {
    const here = new Set((ab?.logic.nodes ?? []).map((n) => n.id));
    for (const id of kept.current.keys()) if (!here.has(id)) kept.current.delete(id);
  }, [ab?.logic.nodes]);
  //Which questions' kit nodes are open. Only about how the graph is drawn (see lib/graph-fold.ts), so it is not in the document
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const openRef = useRef(open);
  openRef.current = open;
  const blocks = useMemo(() => kitBlocks(ab?.logic.nodes ?? []), [ab?.logic.nodes]);
  const hidden = useMemo(() => hiddenIn(blocks, open), [blocks, open]);
  const toggleKit = useCallback((frame: string) => {
    const st = store().get();
    const members = kitBlocks(getArtboard(st.project, st.activeArtboardId)?.logic.nodes ?? []).find((b) => b.frame === frame)?.members.map((m) => m.id) ?? [];
    const was = openRef.current.has(frame);
    //Folding picks nothing inside it any more (a Delete would otherwise reach nodes nobody can see)
    if (was && (st.logicPicked.some((id) => members.includes(id)) || (st.logicSelection && members.includes(st.logicSelection))))
      store().set({ logicPicked: st.logicPicked.filter((id) => !members.includes(id)), logicSelection: st.logicSelection && members.includes(st.logicSelection) ? null : st.logicSelection });
    setOpen((cur) => {
      const next = new Set(cur);
      if (was) next.delete(frame);
      else next.add(frame);
      return next;
    });
  }, []);
  //A node that is picked from somewhere else (an error, the sentences, a flow that was just added) opens the question it is in
  const shownKey = [...(s.sel ? [s.sel] : []), ...s.picked].join(',');
  useEffect(() => {
    const want = framesToOpen(shownKey ? shownKey.split(',') : [], blocks, open);
    if (want.length) setOpen((cur) => new Set([...cur, ...want]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, blocks]);
  const nodes: Node<IxNodeData>[] = useMemo(
    () =>
      [
        // Groups first and below everything. A click anywhere in one (its title or the empty space inside) selects it,
        // and dragging it moves it with its nodes
        ...(ab?.logic.groups ?? []).map(
          (g) =>
            ({
              id: g.id,
              type: 'ixgroup',
              position: { x: g.x, y: g.y },
              width: g.width,
              height: g.height,
              zIndex: -1,
              data: { group: g },
              selected: chosen.includes(g.id),
            }) as unknown as Node<IxNodeData>,
        ),
        //One block per question for its kit nodes while they are folded, a Fold tab above them while they are open
        ...(ab
          ? blocks.map((b) => {
              const isOpen = open.has(b.frame);
              const kinds = [...new Set(b.members.map((m) => labelOfKind(m.kind)))];
              return {
                id: b.id,
                type: 'ixkit',
                position: { x: b.x, y: isOpen ? b.y - 34 : b.y },
                draggable: false,
                selectable: false,
                deletable: false,
                connectable: false,
                zIndex: 1,
                data: { frame: b.frame, name: namesOf(ab).get(b.frame) ?? 'Question', count: b.members.length, kinds: kinds.slice(0, 4).join(', ') + (kinds.length > 4 ? '…' : ''), memberIds: b.members.map((m) => m.id), open: isOpen, onToggle: toggleKit },
              } as unknown as Node<IxNodeData>;
            })
          : []),
        ...(ab?.logic.nodes ?? []).filter((n) => !hidden.has(n.id)).map((n) => {
          const summary = ab ? summarize(n, ab, s.project) : '';
          const selected = chosen.includes(n.id);
          const revealed = glow.includes(n.id);
          const had = kept.current.get(n.id);
          if (had && had.logic === n && had.summary === summary && had.selected === selected && had.revealed === revealed) return had.node;
          const node: Node<IxNodeData> = { id: n.id, type: 'ix', position: { x: n.x, y: n.y }, data: { logic: n, summary, ...(revealed ? { revealed: true } : {}) }, selected };
          kept.current.set(n.id, { logic: n, summary, selected, revealed, node });
          return node;
        }),
        // Sticky notes for the people editing the graph (hidden with the canvas notes, and never in the player)
        ...(showNotes && ab
          ? (ab.logic.notes ?? []).map((note) => {
              const at = graphNotePlace(ab.logic, note);
              const host = note.anchor ? ab.logic.nodes.find((n) => n.id === note.anchor!.layerId) : undefined;
              const group = note.anchor ? ab.logic.groups?.find((g) => g.id === note.anchor!.layerId) : undefined;
              return {
                id: note.id,
                type: 'ixnote',
                position: { x: at.x, y: at.y },
                width: note.w,
                height: note.h,
                zIndex: 2,
                data: { note, detached: at.detached, hostName: host ? labelOfKind(host.kind) : group ? `Group: ${group.label || 'Group'}` : null } satisfies GraphNoteData,
                selected: chosen.includes(note.id),
              } as unknown as Node<IxNodeData>;
            })
          : []),
      ],
    [ab, s.project, chosen, showNotes, glow, blocks, hidden, open, toggleKit],
  );
  // Selected connections live here (the document only stores the graph), so Delete can remove them
  const [selEdges, setSelEdges] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; search?: string } | null>(null);
  const flowVersion = useFlowVersion();
  const edges: Edge[] = useMemo(
    () =>
      foldedEdges(ab?.logic.edges ?? [], hidden).map((e) => {
        const lit = wireClass(e.id);
        return { id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target, targetHandle: e.targetHandle, animated: false, selected: selEdges.includes(e.id), ...(lit ? { className: lit } : {}) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ab, selEdges, flowVersion, hidden],
  );

  const updateLogic = useCallback(
    (fn: (a: Artboard) => void, coalesce?: string) =>
      store().update(
        (d) => {
          const a = d.artboards.find((x) => x.id === s.abId);
          if (a) fn(a as Artboard);
        },
        { coalesce },
      ),
    [s.abId],
  );

  const isGroup = (id: string) => !!ab?.logic.groups?.some((g) => g.id === id);
  const isNote = (id: string) => !!ab?.logic.notes?.some((n) => n.id === id);
  /** A node's size on screen (it isn't in the document); a typical node's size before it has been measured. */
  const sizeOf = (id: string) => {
    const m = rf.current?.getInternalNode(id)?.measured;
    return { width: m?.width ?? 180, height: m?.height ?? 70 };
  };
  /** The nodes in a group: the ones whose centre is inside its frame. */
  const membersOf = (a: Artboard, g: LogicGroup) =>
    a.logic.nodes.filter((n) => {
      const z = sizeOf(n.id);
      const cx = n.x + z.width / 2;
      const cy = n.y + z.height / 2;
      return cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height;
    });
  //Ctrl/Cmd+click is handled here from the pointer events' own modifier flags. React Flow only knows the key is down from
  //a window keydown, and the graph keeps its keys to itself (stopPropagation on the canvas), so with a node focused
  //(which a click does) it never heard Control at all and every Ctrl+click came through as a plain click
  const press = useRef<{ id: string; x: number; y: number; was: boolean; mod: boolean } | null>(null);
  const pointerDown = (e: React.PointerEvent) => {
    press.current = null;
    //React Flow swallows the mousedown, so nothing takes focus on its own: without this Delete lands on whatever had it before (the canvas)
    const el = e.target as HTMLElement;
    if (!el.closest('input, textarea, select, button, [contenteditable], .cm-editor') && !canvasRef.current?.contains(document.activeElement)) canvasRef.current?.focus({ preventScroll: true });
    const id = e.button === 0 ? (e.target as HTMLElement).closest<HTMLElement>('.react-flow__node')?.dataset.id : undefined;
    if (!id) return;
    const mod = e.ctrlKey || e.metaKey;
    const now = chosenNow();
    const was = now.includes(id);
    press.current = { id, x: e.clientX, y: e.clientY, was, mod };
    //Adding happens on the press, so a drag from here carries the others along; taking one out waits for the click
    if (mod && !was) select([...now, id], id);
  };
  const pointerUp = () => {
    //React Flow's own click handling comes right after this, still to be ignored
    setTimeout(() => (press.current = null), 0);
  };
  const onNodeClick = (e: React.MouseEvent, node: Node) => {
    const p = press.current;
    if (!p || p.id !== node.id || !p.was) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) return;
    const now = chosenNow();
    if (p.mod) {
      const rest = now.filter((id) => id !== node.id);
      select(rest, rest[rest.length - 1] ?? null);
    } else if (now.length > 1) {
      //A plain click on one of several chosen (not a drag) picks just that one, same as any file list
      select([node.id], node.id);
    }
  };
  const onNodesChange = (all: NodeChange<Node<IxNodeData>>[]) => {
    //The folded blocks are only drawn, never selected, moved or removed
    const changes = all.filter((c) => !('id' in c && isFoldId(c.id)));
    // Selection: a click or a marquee arrives as select changes, often several at once (a Ctrl+click is dealt with above)
    const selects = press.current?.mod ? [] : changes.filter((c) => c.type === 'select');
    if (selects.length) {
      const next = new Set(chosenNow());
      for (const c of selects) c.selected ? next.add(c.id) : next.delete(c.id);
      const added = selects.filter((c) => c.selected).map((c) => c.id);
      const cur = store().get().logicSelection;
      const list = [...next];
      select(list, added.length ? added[added.length - 1] : cur && next.has(cur) ? cur : (list[list.length - 1] ?? null));
    }
    // Moves: everything dragged together is one edit (one undo step). A group carries the nodes inside it, except the
    // ones that are selected and so being moved already, which would otherwise go twice as far
    const moves = changes.filter((c) => c.type === 'position' && c.position) as Extract<NodeChange, { type: 'position' }>[];
    if (moves.length) {
      const moving = new Set(moves.map((c) => c.id));
      updateLogic((a) => {
        const carried = new Set<string>();
        const noteMoves: typeof moves = [];
        for (const c of moves) {
          const pos = c.position!;
          if (a.logic.notes?.some((x) => x.id === c.id)) {
            noteMoves.push(c);
            continue;
          }
          const g = a.logic.groups?.find((x) => x.id === c.id);
          if (g) {
            const dx = Math.round(pos.x) - g.x;
            const dy = Math.round(pos.y) - g.y;
            if (!dx && !dy) continue;
            if (resizingGroup === g.id) {
              // Grown to the left or up: the right and bottom edges stay put
              g.width -= dx;
              g.height -= dy;
            } else
              for (const n of membersOf(a, g)) {
                if (moving.has(n.id) || carried.has(n.id)) continue;
                carried.add(n.id);
                n.x += dx;
                n.y += dy;
              }
            g.x += dx;
            g.y += dy;
            continue;
          }
          const n = a.logic.nodes.find((x) => x.id === c.id);
          if (n) {
            n.x = Math.round(pos.x);
            n.y = Math.round(pos.y);
          }
        }
        //Notes last, so one that is dragged with the node it follows is measured from where that node ends up
        for (const c of noteMoves) {
          const note = a.logic.notes!.find((x) => x.id === c.id)!;
          const x = Math.round(c.position!.x);
          const y = Math.round(c.position!.y);
          if (noteResizing.note === note.id) {
            // Grown to the left or up: the right and bottom edges stay put
            note.w -= x - note.x;
            note.h -= y - note.y;
          }
          note.x = x;
          note.y = y;
          const o = note.anchor ? anchorOrigin(a.logic, note.anchor.layerId) : null;
          if (o && note.anchor) {
            note.anchor.lx = x - o.x;
            note.anchor.ly = y - o.y;
          }
        }
      }, `logic-move-${[...moving].sort().join(',')}`);
      if (moves.every((c) => !c.dragging) && !(resizingGroup && moving.has(resizingGroup)) && !(noteResizing.note && moving.has(noteResizing.note))) store().commit();
    }
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions && c.resizing && isGroup(c.id)) {
        const d = c.dimensions;
        updateLogic((a) => {
          const g = a.logic.groups?.find((x) => x.id === c.id);
          if (!g) return;
          g.width = Math.round(d.width);
          g.height = Math.round(d.height);
        }, `logic-resize-${c.id}`);
      } else if (c.type === 'dimensions' && c.dimensions && c.resizing && isNote(c.id)) {
        const d = c.dimensions;
        patchGraphNote(c.id, { w: d.width, h: d.height }, `logic-resize-${c.id}`);
      } else if (c.type === 'remove') {
        updateLogic((a) => {
          a.logic.nodes = a.logic.nodes.filter((x) => x.id !== c.id);
          a.logic.edges = a.logic.edges.filter((e) => e.from !== c.id && e.to !== c.id);
        });
      }
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    for (const c of changes)
      if (c.type === 'select') {
        //No clearing the nodes here: a marquee selects connections and nodes together, and a plain click on a connection
        //deselects the nodes itself (as select changes in onNodesChange)
        setSelEdges((cur) => (c.selected ? [...cur.filter((x) => x !== c.id), c.id] : cur.filter((x) => x !== c.id)));
      }
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length)
      updateLogic((a) => {
        a.logic.edges = a.logic.edges.filter((e) => !removed.includes(e.id));
      });
  };
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target || isFoldId(c.source) || isFoldId(c.target)) return;
    updateLogic((a) => {
      if (a.logic.edges.some((e) => e.from === c.source && e.fromPort === (c.sourceHandle ?? 'out') && e.to === c.target)) return;
      a.logic.edges.push({ id: uid('e'), from: c.source!, fromPort: c.sourceHandle ?? 'out', to: c.target!, toPort: c.targetHandle ?? 'in' });
    });
  };

  const add = (kind: string, at?: { x: number; y: number }, from?: { id: string; port: string }, back?: { id: string; port: string }) => {
    const pos = at ?? rf.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight - 160 }) ?? { x: 40, y: 40 };
    const id = uid('lg');
    // The node and its connection go in one update, so a single undo removes both
    updateLogic((a) => {
      a.logic.nodes.push({ id, kind, x: Math.round(pos.x), y: Math.round(pos.y), params: defaultParams(kind) });
      if (from && CATALOG_BY_KIND[kind]?.hasInput) a.logic.edges.push({ id: uid('e'), from: from.id, fromPort: from.port, to: id, toPort: 'in' });
      // Dragged backwards from an input: the new node feeds the original one
      if (back) a.logic.edges.push({ id: uid('e'), from: id, fromPort: back.port, to: back.id, toPort: 'in' });
    });
    select([id]);
    setSelEdges([]);
    focusGraph();
    return id;
  };

  /** A connection dragged from a port and let go on empty space: offer the nodes that could go there. */
  const onConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (state.isValid || state.toHandle || !state.fromHandle || !state.fromNode) return;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!pt) return;
    const at = rf.current?.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
    const origin = state.fromNode.id;
    const direction: DragDirection = state.fromHandle.type === 'source' ? 'from-output' : 'from-input';
    const port = state.fromHandle.id ?? (direction === 'from-output' ? 'out' : 'in');
    const kinds = new Set(compatibleKinds(direction));
    const items = paletteItems(
      (kind) => {
        const mine = newNodePort(kind, direction);
        if (!mine) return;
        if (direction === 'from-output') add(kind, at, { id: origin, port });
        else add(kind, at, undefined, { id: origin, port: mine });
      },
      (k) => kinds.has(k),
    );
    if (!items.length) return;
    setMenu({ x: pt.clientX, y: pt.clientY, items: [{ heading: 'Add and connect' }, ...items], search: 'Find a node…' });
  };

  const removeNodes = (ids: string[]) =>
    updateLogic((a) => {
      a.logic.nodes = a.logic.nodes.filter((x) => !ids.includes(x.id));
      a.logic.edges = a.logic.edges.filter((e) => !ids.includes(e.from) && !ids.includes(e.to));
    });
  const removeEdges = (ids: string[]) =>
    updateLogic((a) => {
      a.logic.edges = a.logic.edges.filter((e) => !ids.includes(e.id));
    });
  /**
   * Delete what's selected (nodes, groups and connections) in one undo step. A selected group with nodes inside that
   * aren't selected themselves asks first: just the group, keeping its nodes, or the group and everything in it.
   */
  const deleteSelected = async () => {
    if (!ab) return;
    const ids = chosenNow();
    const edgeIds = selEdges;
    const groups = (ab.logic.groups ?? []).filter((g) => ids.includes(g.id));
    const noteIds = ids.filter(isNote);
    const picked = new Set(ids.filter((id) => !isGroup(id) && !isNote(id)));
    const inside = new Set<string>();
    for (const g of groups) for (const n of membersOf(ab, g)) if (!picked.has(n.id)) inside.add(n.id);
    let withInside = false;
    if (inside.size) {
      const one = groups.length === 1;
      const nodes = `${inside.size} node${inside.size === 1 ? '' : 's'}`;
      const answer = await choiceDialog({
        title: one ? `Delete “${groups[0].label || 'Group'}”?` : `Delete ${groups.length} groups?`,
        message: `${one ? 'It has' : 'They have'} ${nodes} inside. Delete just the ${one ? 'group' : 'groups'} and keep the nodes where they are, or delete the nodes too?`,
        confirmLabel: one ? 'Just the group' : 'Just the groups',
        altLabel: `${one ? 'Group' : 'Groups'} and ${nodes}`,
        altDanger: true,
      });
      if (!answer) return focusGraph();
      withInside = answer === 'alt';
    }
    const gone = new Set([...picked, ...(withInside ? inside : [])]);
    const groupIds = new Set(groups.map((g) => g.id));
    if (!gone.size && !groupIds.size && !edgeIds.length && !noteIds.length) return;
    updateLogic((a) => {
      a.logic.nodes = a.logic.nodes.filter((x) => !gone.has(x.id));
      a.logic.edges = a.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to) && !edgeIds.includes(e.id));
      if (a.logic.groups && groupIds.size) {
        a.logic.groups = a.logic.groups.filter((g) => !groupIds.has(g.id));
        if (!a.logic.groups.length) delete a.logic.groups;
      }
      if (a.logic.notes && noteIds.length) {
        a.logic.notes = a.logic.notes.filter((n) => !noteIds.includes(n.id));
        if (!a.logic.notes.length) delete a.logic.notes;
      }
    });
    setSelEdges([]);
    select([], null);
    focusGraph();
  };
  /** The piece of graph these ids copy: the nodes, what's inside any of the groups, and the connections between them. */
  const fragment = (ids: string[]): LogicFragment => (ab ? fragmentOf(ab.logic, ids, (g) => membersOf(ab, g)) : { nodes: [], edges: [], groups: [] });
  //Pasted copies get new ids, with their connections rewired to each other. Where the originals are still on this
  //graph the copy sits just off them, so it doesn't land exactly on top, otherwise it keeps the position it was copied
  //from (or goes where the menu was opened)
  const pasteFragment = (f: LogicFragment, at?: { x: number; y: number }) => {
    if (!ab || (!f.nodes.length && !f.groups.length && !f.notes?.length)) return false;
    const o = fragmentOrigin(f);
    const here = f.nodes.some((n) => ab.logic.nodes.some((x) => x.id === n.id)) || f.groups.some((g) => ab.logic.groups?.some((x) => x.id === g.id));
    const c = cloneFragment(f, at ? at.x - o.x : here ? 30 : 0, at ? at.y - o.y : here ? 30 : 0);
    updateLogic((a) => {
      a.logic.nodes.push(...c.nodes);
      a.logic.edges.push(...c.edges);
      if (c.groups.length) a.logic.groups = [...(a.logic.groups ?? []), ...c.groups];
      if (c.notes?.length) a.logic.notes = [...(a.logic.notes ?? []), ...c.notes];
    });
    select([...c.groups.map((g) => g.id), ...c.nodes.map((n) => n.id), ...(c.notes ?? []).map((n) => n.id)]);
    setSelEdges([]);
    focusGraph();
    return true;
  };
  const duplicate = (ids: string[]) => pasteFragment(fragment(ids));
  const copySelection = (ids: string[], cut = false) => {
    const f = fragment(ids);
    copyLogic(f);
    if (!cut) return;
    const gone = new Set(f.nodes.map((n) => n.id));
    const groupIds = new Set(f.groups.map((g) => g.id));
    const goneNotes = new Set((f.notes ?? []).map((n) => n.id));
    updateLogic((a) => {
      if (a.logic.notes && goneNotes.size) {
        a.logic.notes = a.logic.notes.filter((n) => !goneNotes.has(n.id));
        if (!a.logic.notes.length) delete a.logic.notes;
      }
      a.logic.nodes = a.logic.nodes.filter((x) => !gone.has(x.id));
      a.logic.edges = a.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
      if (a.logic.groups && groupIds.size) {
        a.logic.groups = a.logic.groups.filter((g) => !groupIds.has(g.id));
        if (!a.logic.groups.length) delete a.logic.groups;
      }
    });
    select([], null);
  };
  /**
   * Tidy up: lay the graph out in columns from its events, with as few crossing connections as it can manage, and fit
   * each group to its nodes. One undo step.
   */
  const tidy = () => {
    if (!ab || !ab.logic.nodes.length) return;
    const nodes = ab.logic.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...sizeOf(n.id) }));
    const edges = ab.logic.edges.map((e) => ({ from: e.from, to: e.to, port: Math.max(0, CATALOG_BY_KIND[ab.logic.nodes.find((n) => n.id === e.from)?.kind ?? '']?.outputs.findIndex((o) => o.id === e.fromPort) ?? 0) }));
    const groups = (ab.logic.groups ?? []).map((g) => ({ id: g.id, members: membersOf(ab, g).map((n) => n.id), x: g.x, y: g.y }));
    const tnotes: TidyNote[] = (ab.logic.notes ?? []).map((n) => {
      const at = graphNotePlace(ab.logic, n);
      return { id: n.id, x: at.x, y: at.y, width: n.w, height: n.h, host: n.anchor && !at.detached ? n.anchor.layerId : undefined };
    });
    const out = tidyGraph(nodes, edges, groups, tnotes);
    updateLogic((a) => {
      //A note keeps its offset from the node or group it follows; the corner it was last drawn at follows along
      for (const n of a.logic.notes ?? []) {
        const p = out.notes.get(n.id);
        if (p) {
          n.x = p.x;
          n.y = p.y;
        }
      }
      for (const n of a.logic.nodes) {
        const p = out.positions.get(n.id);
        if (p) {
          n.x = p.x;
          n.y = p.y;
        }
      }
      for (const g of a.logic.groups ?? []) {
        const b = out.groups.get(g.id);
        if (b) Object.assign(g, { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
      }
    });
    track('feature', 'graph-tidy', { sum: { nodes: nodes.length } });
    requestAnimationFrame(() => rf.current?.fitView({ maxZoom: 1, padding: 0.2, duration: 250 }));
  };
  const addGroup = (rect: { x: number; y: number; width: number; height: number }, label = 'Group') => {
    const id = uid('lgg');
    updateLogic((a) => {
      a.logic.groups = [...(a.logic.groups ?? []), { id, label, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }];
    });
    select([id]);
    setSelEdges([]);
    focusGraph();
    return id;
  };
  /** A new note on the graph, where the menu was opened or in the middle of the view; with `anchorId` it follows that node or group. */
  const addNoteAt = (at?: { x: number; y: number }, anchorId?: string) => {
    const pos = at ?? rf.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight - 200 }) ?? { x: 40, y: 40 };
    const id = addGraphNote(s.abId, { x: pos.x, y: pos.y, anchorId });
    if (!id) return;
    select([id]);
    setSelEdges([]);
    store().set({ editingNote: id });
    return id;
  };
  /** A group around these nodes, with room round them and the title bar above. */
  const groupAround = (ids: string[]) => {
    const list = ab?.logic.nodes.filter((x) => ids.includes(x.id)) ?? [];
    if (!list.length) return;
    const boxes = list.map((n) => ({ ...sizeOf(n.id), x: n.x, y: n.y }));
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    addGroup({ x: x - 24, y: y - 48, width: right - x + 48, height: bottom - y + 72 });
  };
  const ungroup = (id: string) =>
    updateLogic((a) => {
      a.logic.groups = (a.logic.groups ?? []).filter((g) => g.id !== id);
      if (!a.logic.groups.length) delete a.logic.groups;
    });
  const renameGroup = async (g: LogicGroup) => {
    const v = await promptDialog({ title: 'Rename group', label: 'Name', initial: g.label, confirmLabel: 'Rename' });
    if (v !== null) updateGroup(g.id, (x) => void (x.label = v.trim().slice(0, 200)));
  };
  const groupMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const g = ab?.logic.groups?.find((x) => x.id === id);
    if (!g || !ab) return;
    if (!chosenNow().includes(id)) select([id]);
    else if (chosenNow().length > 1) return selectionMenu(e, chosenNow());
    const inside = membersOf(ab, g).map((n) => n.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { heading: g.label || 'Group' },
        // right-clicking inside a group no longer reaches the graph behind it, so its menu adds nodes too
        { label: 'Add node here', items: paletteItems((kind) => add(kind, rf.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY }))) },
        { separator: true },
        { label: 'Rename…', onClick: () => void renameGroup(g) },
        { label: 'Add note to this group', title: 'A sticky note that moves with this group. Players never see it', onClick: () => void addNoteAt({ x: g.x, y: g.y - 130 }, id) },
        { label: 'Colour', items: GROUP_COLORS.map((c) => ({ label: c.label, color: c.value || 'var(--muted)', onClick: () => updateGroup(g.id, (x) => (c.value ? (x.color = c.value) : delete x.color)) })) },
        { separator: true },
        { label: 'Copy group and its nodes', hint: keyHints('graph-copy'), onClick: () => copySelection([id]) },
        { label: 'Duplicate group and its nodes', hint: keyHints('graph-duplicate'), onClick: () => duplicate([id]) },
        { separator: true },
        { label: 'Ungroup (keep the nodes)', onClick: () => ungroup(id) },
        {
          label: `Delete group and ${inside.length} node${inside.length === 1 ? '' : 's'}`,
          danger: true,
          onClick: () =>
            updateLogic((a) => {
              a.logic.nodes = a.logic.nodes.filter((x) => !inside.includes(x.id));
              a.logic.edges = a.logic.edges.filter((x) => !inside.includes(x.from) && !inside.includes(x.to));
              a.logic.groups = (a.logic.groups ?? []).filter((x) => x.id !== id);
              if (!a.logic.groups.length) delete a.logic.groups;
            }),
        },
      ],
    });
  };
  const pasteFromClipboard = (at?: { x: number; y: number }) =>
    void (navigator.clipboard?.readText?.() ?? Promise.resolve('')).then(
      (t) => pasteFragment(logicToPaste(t), at),
      () => pasteFragment(logicToPaste(), at),
    );

  /** Node palette as menu items: categories with their nodes, each calling `pick(kind)`. */
  const paletteItems = nodeMenuItems;

  const paneMenu = (e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    const at = rf.current?.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { heading: 'Add node' },
        ...paletteItems((kind) => add(kind, at)),
        { separator: true },
        { label: 'New group here', onClick: () => addGroup({ x: at?.x ?? 0, y: at?.y ?? 0, width: 360, height: 220 }) },
        { label: 'Add note here', title: 'A sticky note for the people editing this graph. Players never see it', onClick: () => void addNoteAt(at) },
        { label: 'Tidy up', title: 'Lay the graph out in columns from its events, with as few crossing connections as possible, and fit groups to their nodes', onClick: tidy },
        { label: 'Paste', hint: keyHints('paste'), onClick: () => pasteFromClipboard(at) },
      ],
      search: 'Find a node…',
    });
  };

  const nodeMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!ab) return;
    const n = ab.logic.nodes.find((x) => x.id === id);
    const def = n && CATALOG_BY_KIND[n.kind];
    if (!n || !def) return;
    // Right-clicking a node that's part of the selection keeps the selection: Copy, Duplicate, Group and Delete act on all of it
    if (!chosenNow().includes(id)) select([id]);
    const many = targetIds(id);
    if (many.length > 1) return selectionMenu(e, many);
    const names = new Map(ab.logic.nodes.map((x) => [x.id, labelOfKind(x.kind)]));
    const outs = def.outputs;
    const ins = ab.logic.edges.filter((x) => x.to === id);
    const outEdges = ab.logic.edges.filter((x) => x.from === id);
    const portLabel = (port: string) => outs.find((o) => o.id === port)?.label;
    const at = { x: n.x + 260, y: n.y + outEdges.length * 40 };
    // "Connect to new" for each output (one level when there is just one output)
    const toNew = (port: string): MenuItem[] => paletteItems((kind) => add(kind, at, { id, port }), (k) => CATALOG_BY_KIND[k]?.hasInput);
    const others = ab.logic.nodes.filter((x) => x.id !== id && CATALOG_BY_KIND[x.kind]?.hasInput);
    const toExisting = (port: string): MenuItem[] =>
      others.length
        ? others.map((o) => ({
            label: `${names.get(o.id)}${summarize(o, ab, s.project) ? ` · ${summarize(o, ab, s.project).slice(0, 30)}` : ''}`,
            disabled: ab.logic.edges.some((x) => x.from === id && x.fromPort === port && x.to === o.id),
            onClick: () => onConnect({ source: id, sourceHandle: port, target: o.id, targetHandle: 'in' }),
          }))
        : [{ label: 'No other nodes to connect to', onClick: () => undefined, disabled: true }];
    const perPort = (make: (port: string) => MenuItem[]): MenuItem[] =>
      outs.length === 1 ? make(outs[0].id) : outs.map((o) => ({ label: `From “${o.label || o.id}”`, items: make(o.id) }));
    const items: MenuItem[] = [{ heading: nodeLabel(def) }];
    if (outs.length) {
      items.push({ label: 'Connect to new node', items: perPort(toNew) });
      items.push({ label: 'Connect to existing node', items: perPort(toExisting) });
    }
    if (ins.length || outEdges.length)
      items.push({
        label: 'Disconnect',
        items: [
          ...ins.map((x) => ({ label: `From ${names.get(x.from)}`, onClick: () => removeEdges([x.id]) })),
          ...outEdges.map((x) => ({ label: `To ${names.get(x.to)}${portLabel(x.fromPort) ? ` (${portLabel(x.fromPort)})` : ''}`, onClick: () => removeEdges([x.id]) })),
          { separator: true } as MenuItem,
          { label: 'All connections', onClick: () => removeEdges([...ins, ...outEdges].map((x) => x.id)) },
        ],
      });
    items.push(
      { separator: true },
      { label: 'Cut', hint: keyHints('graph-cut'), onClick: () => copySelection([id], true) },
      { label: 'Copy', hint: keyHints('graph-copy'), onClick: () => copySelection([id]) },
      { label: 'Duplicate', hint: keyHints('graph-duplicate'), onClick: () => duplicate([id]) },
      { label: 'Put in a new group', hint: keyHints('graph-group'), title: 'Draw a labelled frame around this node; drag other nodes into it', onClick: () => groupAround([id]) },
      { label: 'Add note to this node', title: 'A sticky note that moves with this node. Players never see it', onClick: () => void addNoteAt({ x: n.x, y: n.y - 130 }, id) },
      { label: 'Help for this node', onClick: () => openHelp('interaction-nodes', slug(nodeHeading(def))) },
      { separator: true },
      { label: 'Delete', hint: keyHints('graph-delete'), danger: true, onClick: () => removeNodes([id]) },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  /** Right-click on a selection of several nodes and groups: what applies to all of them together. */
  const selectionMenu = (e: React.MouseEvent, ids: string[]) => {
    if (!ab) return;
    const nodeIds = ids.filter((x) => !isGroup(x) && !isNote(x));
    const noteCount = ids.filter(isNote).length;
    const groupCount = ids.filter(isGroup).length;
    const inside = new Set(nodeIds);
    const between = ab.logic.edges.filter((x) => inside.has(x.from) && inside.has(x.to));
    const touching = ab.logic.edges.filter((x) => inside.has(x.from) || inside.has(x.to));
    const what = [nodeIds.length && `${nodeIds.length} node${nodeIds.length === 1 ? '' : 's'}`, groupCount && `${groupCount} group${groupCount === 1 ? '' : 's'}`, noteCount && `${noteCount} note${noteCount === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    const items: MenuItem[] = [
      { heading: `${what} selected` },
      { label: 'Cut', hint: keyHints('graph-cut'), onClick: () => copySelection(ids, true) },
      { label: 'Copy', hint: keyHints('graph-copy'), title: 'Copies them with the connections between them; pasted copies are wired to each other the same way', onClick: () => copySelection(ids) },
      { label: 'Duplicate', hint: keyHints('graph-duplicate'), onClick: () => duplicate(ids) },
    ];
    if (nodeIds.length) items.push({ label: 'Put in a new group', hint: keyHints('graph-group'), title: 'Draw a labelled frame around the selected nodes', onClick: () => groupAround(nodeIds) });
    if (touching.length)
      items.push({
        label: 'Disconnect',
        items: [
          { label: `Between them (${between.length})`, disabled: !between.length, onClick: () => removeEdges(between.map((x) => x.id)) },
          { label: `From everything else (${touching.length - between.length})`, disabled: touching.length === between.length, onClick: () => removeEdges(touching.filter((x) => !between.includes(x)).map((x) => x.id)) },
          { label: `All (${touching.length})`, onClick: () => removeEdges(touching.map((x) => x.id)) },
        ],
      });
    items.push({ label: 'Tidy up the graph', onClick: tidy }, { separator: true }, { label: 'Delete', hint: keyHints('graph-delete'), danger: true, onClick: () => void deleteSelected() });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const noteMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const note = ab?.logic.notes?.find((x) => x.id === id);
    if (!note || !ab) return;
    select([id]);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { heading: 'Note' },
        { label: 'Edit text', hint: keyHints('graph-edit-note'), onClick: () => store().set({ editingNote: id }) },
        { label: 'Colour', items: NOTE_COLOURS.map((c) => ({ label: { gold: 'Yellow', orange: 'Orange', green: 'Green', sky: 'Blue', purple: 'Purple', rose: 'Pink' }[c], onClick: () => patchGraphNote(id, { colour: c }) })) },
        ...(note.anchor ? [{ label: 'Stop following', onClick: () => void attachGraphNote(id, null) } as MenuItem] : []),
        { separator: true },
        { label: 'Delete note', hint: keyHints('graph-delete'), danger: true, onClick: () => removeGraphNotes([id]) },
      ],
    });
  };

  const edgeMenu = (e: React.MouseEvent, edgeId: string) => {
    e.preventDefault();
    setSelEdges([edgeId]);
    select([], null);
    setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete connection', hint: keyHints('graph-delete'), danger: true, onClick: () => removeEdges([edgeId]) }] });
  };

  // Frame the graph when switching artboards, or when nodes appear in a graph that was empty.
  const count = ab?.logic.nodes.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    //(not when something was just added and is being framed on its own: lib/graph-reveal.ts)
    if (count && (lastCount.current === 0 || count - lastCount.current > 1) && !pendingReveal()) requestAnimationFrame(() => rf.current?.fitView({ maxZoom: 1, padding: 0.2 }));
    lastCount.current = count;
  }, [count, s.abId]);

  //Something was added from outside the graph (+ When clicked…, an empty event): wait for the nodes to be drawn and measured,
  //take focus to the new event, frame everything that was added, and glow it. Anyone dragging or zooming in the meantime keeps their view
  const reveal = useCallback((req: RevealRequest) => {
    let tries = 0;
    let stop = false;
    let cleanup: (() => void) | null = null;
    const frame = (instant: boolean) => {
      const inst = rf.current;
      const pane = canvasRef.current;
      if (!inst || !pane) return;
      const rects = req.ids.flatMap((id) => {
        const n = inst.getInternalNode(id);
        return n ? [{ x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, width: n.measured?.width ?? 180, height: n.measured?.height ?? 70 }] : [];
      });
      const box = pane.getBoundingClientRect();
      const vp = frameRects(rects, { width: box.width, height: box.height }, { maxZoom: 1, minZoom: 0.2 });
      if (vp) void inst.setViewport(vp, { duration: instant || reducedMotion() ? 0 : 300 });
    };
    const attempt = () => {
      if (stop) return;
      const inst = rf.current;
      const pane = canvasRef.current;
      const drawn = !!inst && !!pane && req.ids.every((id) => !!inst.getInternalNode(id)?.measured?.width);
      //(a graph that never measures its nodes, a test's, is framed on typical sizes after a while)
      if (!drawn && !(tries > 40 && inst && pane && req.ids.every((id) => !!inst.getInternalNode(id)))) {
        if (++tries < 90) requestAnimationFrame(attempt);
        else finishReveal(req);
        return;
      }
      //Focus first: React Flow pans to a node that takes focus, and the framing below then wins
      setLastKeyArea('graph');
      const el = Array.from(pane!.querySelectorAll<HTMLElement>('.react-flow__node')).find((n) => n.getAttribute('data-id') === req.focusId);
      (el ?? pane!).focus({ preventScroll: true });
      frame(false);
      if (!reducedMotion()) {
        setGlow(req.ids);
        setTimeout(() => setGlow((g) => (g === req.ids ? [] : g)), 1800);
      }
      //The dock may still be growing to give the graph room (lib/interactions-room.ts), so frame again if the panel changes size
      //in the next moment, unless the person has already taken the view into their own hands
      let ro: ResizeObserver | null = null;
      const touched = () => cleanup?.();
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => frame(true));
        ro.observe(pane!);
      }
      pane!.addEventListener('pointerdown', touched, true);
      pane!.addEventListener('wheel', touched, true);
      const timer = setTimeout(() => cleanup?.(), 900);
      cleanup = () => {
        ro?.disconnect();
        pane!.removeEventListener('pointerdown', touched, true);
        pane!.removeEventListener('wheel', touched, true);
        clearTimeout(timer);
        cleanup = null;
      };
      finishReveal(req);
    };
    requestAnimationFrame(attempt);
    return () => {
      stop = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    let undo: (() => void) | undefined;
    const run = (r: RevealRequest) => {
      if (r.abId !== store().get().activeArtboardId) return;
      //What was added may be kit nodes folded in a block: open it so there is something to frame
      const here = getArtboard(store().get().project, r.abId)?.logic.nodes ?? [];
      const want = framesToOpen(r.ids, kitBlocks(here), new Set());
      if (want.length) setOpen((cur) => new Set([...cur, ...want]));
      undo?.();
      undo = reveal(r);
    };
    //(asked for before this mounted: the tab was on something else)
    const waiting = pendingReveal();
    if (waiting) run(waiting);
    const off = onReveal(run);
    return () => {
      off();
      undo?.();
    };
  }, [reveal]);

  if (!ab) return null;
  const selected = ab.logic.nodes.find((n) => n.id === s.sel);

  //"/" or Ctrl+F anywhere in the panel (outside a field being typed in) goes to the node search, and Alt+Up / Alt+Down (or Ctrl+[ and Ctrl+])
  //step to the previous or next artboard's graph. Caught on the way down because the graph keeps its keys to itself
  const panelKeys = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable || !!t.closest('.cm-editor');
    //(the keys are the keymap's, so they follow what the person set)
    if (matches(e, 'graph-search') && (!typing || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
      return;
    }
    if (!typing && (matches(e, 'graph-tidy') || matches(e, 'graph-add-note'))) {
      e.preventDefault();
      e.stopPropagation();
      if (matches(e, 'graph-tidy')) tidy();
      else void addNoteAt();
      return;
    }
    const dir = matches(e, 'graph-next-page') ? 1 : matches(e, 'graph-prev-page') ? -1 : null;
    if (dir && !t.closest('.cm-editor') && !t.closest('.search-pop')) {
      e.preventDefault();
      e.stopPropagation();
      stepArtboard(dir);
    }
  };

  //React Flow hands these to every node it draws, so a new function on each render would draw every node again
  const onNodeContextMenu = (e: React.MouseEvent, node: Node) => (isNote(node.id) ? noteMenu(e, node.id) : isGroup(node.id) ? groupMenu(e, node.id) : nodeMenu(e, node.id));
  const nodeHandlers = useRef({ onNodeClick, onNodeContextMenu });
  nodeHandlers.current = { onNodeClick, onNodeContextMenu };
  const stableNodeHandlers = useMemo(() => ({ onNodeClick: (e: React.MouseEvent, node: Node) => nodeHandlers.current.onNodeClick(e, node), onNodeContextMenu: (e: React.MouseEvent, node: Node) => nodeHandlers.current.onNodeContextMenu(e, node) }), []);

  return (
    <div className="logic-root" onKeyDownCapture={panelKeys}>
    <SplitColumns id="logic" columns={[{ width: 200, min: 120, max: 360 }, 'flex', { width: 260, min: 200, max: 560 }]} className="logic">
      <GraphPalette onAdd={(kind) => add(kind)} inputRef={searchRef} />
      <div
        ref={canvasRef}
        className="logic-canvas"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData('application/x-ix-logic');
          if (kind && rf.current) add(kind, rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        tabIndex={-1}
        onPointerDownCapture={pointerDown}
        onPointerUpCapture={pointerUp}
        onKeyDown={(e) => {
          e.stopPropagation();
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.cm-editor')) return;
          const cmd = commandFor(e, CONTEXT_ORDER.graph)?.id;
          if (cmd === 'graph-delete') {
            e.preventDefault();
            void deleteSelected();
          } else if (cmd === 'graph-edit-note' && chosenNow().length === 1 && isNote(chosenNow()[0])) {
            //Enter on a picked note opens it for typing, like a note on the canvas
            e.preventDefault();
            store().set({ editingNote: chosenNow()[0] });
          } else if (cmd === 'graph-select-all') {
            e.preventDefault();
            select([...(ab.logic.groups ?? []).map((g) => g.id), ...ab.logic.nodes.filter((n) => !hidden.has(n.id)).map((n) => n.id), ...(showNotes ? (ab.logic.notes ?? []).map((n) => n.id) : [])]);
          } else if (cmd === 'graph-group' && chosenNow().some((id) => !isGroup(id) && !isNote(id))) {
            e.preventDefault();
            groupAround(chosenNow());
          } else if (cmd === 'undo' || cmd === 'redo') {
            // The graph keeps the key to itself (stopPropagation above), so undo and redo have to be handled here
            e.preventDefault();
            if (cmd === 'redo') store().redo();
            else store().undo();
          } else if (cmd === 'graph-duplicate' && chosenNow().length) {
            e.preventDefault();
            duplicate(chosenNow());
          } else if ((cmd === 'graph-copy' || cmd === 'graph-cut') && chosenNow().length) {
            //Leave it alone when there's text selected in a node, so copying that still works
            if (window.getSelection()?.toString()) return;
            e.preventDefault();
            copySelection(chosenNow(), cmd === 'graph-cut');
          }
        }}
        onPaste={(e) => {
          //The editor pastes layers onto the artboard from a window listener, so the graph has to keep its pastes to itself
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.cm-editor')) return;
          e.stopPropagation();
          e.preventDefault();
          pasteFragment(logicToPaste(e.clipboardData.getData('text/plain')));
        }}
      >
        <div className="logic-view-toggle seg" role="radiogroup" aria-label="How to show the interactions">
          <button type="button" role="radio" aria-checked={s.view === 'graph'} className={`seg-btn${s.view === 'graph' ? ' on' : ''}`} title="The node graph" onClick={() => store().set({ logicView: 'graph' })}>
            Graph
          </button>
          <button type="button" role="radio" aria-checked={s.view === 'sentences'} className={`seg-btn${s.view === 'sentences' ? ' on' : ''}`} title="Read everything on this page as plain sentences" onClick={() => store().set({ logicView: 'sentences' })}>
            Read as sentences
          </button>
        </div>
        <div className="master-flows-slot">
          <MasterFlows ab={ab} project={s.project} />
        </div>
        {s.view === 'sentences' ? (
          <FlowSentences ab={ab} project={s.project} picked={s.sel} />
        ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={stableNodeHandlers.onNodeClick}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onInit={(inst) => (rf.current = inst)}
          onPaneClick={() => {
            select([], null);
            setSelEdges([]);
          }}
          onPaneContextMenu={paneMenu}
          onNodeContextMenu={stableNodeHandlers.onNodeContextMenu}
          onEdgeContextMenu={(e, edge) => edgeMenu(e, edge.id)}
          fitView={ab.logic.nodes.length > 0}
          fitViewOptions={{ maxZoom: 1 }}
          deleteKeyCode={null}
          // Dragging on empty space draws a marquee (Shift+drag draws one from anywhere, groups included, since a group
          // takes every press on it); the middle button, or Space held with the left, pans. The wheel still zooms
          selectionOnDrag
          selectionMode={SelectionMode.Full}
          panOnDrag={[1]}
          panActivationKeyCode="Space"
          selectionKeyCode="Shift"
          multiSelectionKeyCode={null}
          // A selected group stays behind its nodes (React Flow would raise it over them, and they couldn't be clicked)
          elevateNodesOnSelect={false}
          colorMode={theme === 'auto' ? 'system' : theme}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
        >
          <Background gap={16} />
          <Controls showInteractive={false}>
            <ControlButton onClick={() => void addNoteAt()} title={withKey('Add a note: a sticky note for the people editing this graph (players never see it)', 'graph-add-note')} aria-label="Add a note to the graph">
              <Icons.note width={14} />
            </ControlButton>
            {blocks.length > 0 && (
              <ControlButton
                onClick={() => setOpen(blocks.some((b) => !open.has(b.frame)) ? new Set(blocks.map((b) => b.frame)) : new Set())}
                title={blocks.some((b) => !open.has(b.frame)) ? 'Open the question blocks: show the nodes the question kit made' : 'Fold the question blocks: hide the nodes the question kit made, so your own flows stand out'}
                aria-label={blocks.some((b) => !open.has(b.frame)) ? 'Open every question block' : 'Fold every question block'}
              >
                <Icons.question width={14} />
              </ControlButton>
            )}
            <ControlButton onClick={tidy} title={withKey('Tidy up: lay the graph out in columns from its events, with as few crossing connections as possible (one undo)', 'graph-tidy')} aria-label="Tidy up the graph">
              <Icons.distH width={14} />
            </ControlButton>
          </Controls>
        </ReactFlow>
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} search={menu.search} onClose={() => setMenu(null)} />}
        {s.view === 'graph' && !ab.logic.nodes.length && (
          <div className="logic-empty">
            <p>
              Add an <b>event</b> (e.g. On pointer), then connect it to <b>actions</b>. Drag from a node's right edge to the next node. Right-click for a menu of nodes, or drag a connection into empty space to add and connect one.
            </p>
          </div>
        )}
      </div>
      <div className="logic-settings">
        {chosen.length > 1 ? (
          <SectionBlurb text={`${chosen.length} selected. Drag any of them to move them all. Right-click for more.`} name="selecting nodes" help={['interactions', 'selecting-moving-around-and-copying']} />
        ) : s.sel && ab.logic.notes?.some((n) => n.id === s.sel) ? (
          <GraphNoteForm note={ab.logic.notes!.find((n) => n.id === s.sel)!} logic={ab.logic} />
        ) : selected ? <ParamForm node={selected} ab={ab} project={s.project} onChange={(params) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.params = params;
        }, `logic-params-${selected.id}`)} onNote={(note) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.note = note || undefined;
        }, `logic-note-${selected.id}`)} /> : s.sel && ab.logic.groups?.some((g) => g.id === s.sel) ? (
          <SectionBlurb text="A group. Drag it to move it with its nodes, or its edges to resize it. Double-click the title to rename it." name="groups" help={['interactions', 'groups']} />
        ) : (
          <p className="hint">Select a node to edit its settings.</p>
        )}
      </div>
    </SplitColumns>
    </div>
  );
}

/** The names an event node hands to the flow after it, in short: the first few, and a link to the rest in the node reference. */
function NodeGives({ def }: { def: { kind: string; label: string; gives?: string[] } }) {
  const all = def.gives ?? [];
  const shown = all.slice(0, 4);
  const more = all.length - shown.length;
  return (
    <p className="hint node-gives">
      Gives{' '}
      {shown.map((g, i) => (
        <span key={g}>
          <code>{g}</code>
          {i < shown.length - 1 || more > 0 ? ', ' : ''}
        </span>
      ))}
      {more > 0 && (
        <button type="button" className="link-btn" onClick={() => openHelp('interaction-nodes', slug(nodeHeading(def)))} aria-label={`${more} more names ${nodeLabel(def)} gives, in the node reference`}>
          and {more} more →
        </button>
      )}
    </p>
  );
}

export function ParamForm({ node, ab, project, onChange, onNote }: { node: LogicNode; ab: Artboard; project: Project; onChange: (p: Record<string, unknown>) => void; onNote: (n: string) => void }) {
  const technical = useTechnicalWording();
  const def = CATALOG_BY_KIND[node.kind];
  if (!def) return null;
  const params = { ...defaultParams(node.kind), ...node.params };
  const set = (key: string, v: unknown) => onChange({ ...params, [key]: v });
  const layers: { value: string; label: string }[] = [];
  const rec = (list: Artboard['children'], depth: number) => {
    for (const n of [...list].reverse()) {
      layers.push({ value: n.id, label: `${'  '.repeat(depth)}${n.name}` });
      if (isContainer(n)) rec(n.children, depth + 1);
    }
  };
  rec(ab.children, 0);
  const field = (p0: ParamDef) => {
    const p = plainParam(node.kind, p0, technical);
    if (p.showIf && !p.showIf.values.includes(params[p.showIf.key])) return null;
    const v = params[p.key];
    const pick = (options: { value: string; label: string }[], empty: string, extra: { value: string; label: string }[] = [], quick: Parameters<typeof withQuickAdd>[1] = {}) => (
      <SelectField key={p.key} label={p.label} title={p.help} value={String(v ?? '')} options={[{ value: '', label: empty }, ...options, ...extra]} onChange={withQuickAdd((x) => set(p.key, x), quick)} />
    );
    switch (p.type) {
      case 'node':
        return pick(layers, p.key === 'target' && node.kind.startsWith('event.') ? 'Any layer' : node.kind === 'action.cursor' ? 'Whole player' : 'Choose layer…');
      case 'timeline':
        return pick(ab.timelines.map((t) => ({ value: t.id, label: t.name })), ab.timelines.length ? 'Choose timeline…' : 'No timelines yet');
      case 'blend':
        return pick((ab.blends ?? []).map((b) => ({ value: b.id, label: b.name })), ab.blends?.length ? 'Choose blend…' : 'No blends yet (add one on the artboard)');
      case 'variable': {
        const chosenVar = project.variables.find((x) => x.id === v);
        // A live variable is worked out from its formula, so a Set variable node cannot write it
        const dead = node.kind === 'action.setVariable' && !!chosenVar && isLive(chosenVar);
        return (
          <div key={p.key}>
            {pick(project.variables.map((x) => ({ value: x.id, label: node.kind === 'action.setVariable' && isLive(x) ? `${x.name} (live, read only)` : x.name })), project.variables.length ? 'Choose variable…' : 'No variables yet', [addVariableOption()], { variableType: 'number' })}
            {dead && (
              <div className="error small" role="status">
                {chosenVar!.name} is a live variable: it is worked out from its formula, so this node does nothing to it. Turn off Keep up to date in the Variables tab to set it by hand.
              </div>
            )}
          </div>
        );
      }
      case 'variables': {
        // Several variables: one box each, kept as a list of ids (in the order they were ticked)
        const chosen = Array.isArray(v) ? v.map(String) : [];
        return (
          <div key={p.key} className="param-variables">
            <div className="field-label block">{p.label}</div>
            {project.variables.length > 1 && (
              <div className="param-variables-all">
                <button className="btn small" onClick={() => set(p.key, project.variables.filter((x) => !(node.kind === 'action.resetVariables' && isLive(x))).map((x) => x.id))}>
                  All
                </button>{' '}
                <button className="btn small" onClick={() => set(p.key, [])}>
                  None
                </button>{' '}
                <span className="muted small">{chosen.length} chosen</span>
              </div>
            )}
            {project.variables.length ? (
              project.variables.map((x) => (
                <CheckField
                  key={x.id}
                  label={node.kind === 'action.resetVariables' && isLive(x) ? `${x.name} (live, left alone)` : x.name}
                  value={chosen.includes(x.id)}
                  disabled={node.kind === 'action.resetVariables' && isLive(x)}
                  onChange={(on) => set(p.key, on ? [...chosen, x.id] : chosen.filter((id) => id !== x.id))}
                />
              ))
            ) : (
              <div className="hint">No variables yet. Add some in the Variables panel.</div>
            )}
            {p.help && <div className="hint">{p.help}</div>}
          </div>
        );
      }
      case 'artboard':
        return pick(artboardChoices(project, v), 'Choose page…');
      case 'script':
        return pick(project.scripts.map((x) => ({ value: x.id, label: x.name })), project.scripts.length ? 'Choose script…' : 'No scripts yet');
      case 'asset':
        return pick(project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio').map((a) => ({ value: a.id, label: a.name })), 'Choose sound…', [addAssetOption('audio')], { asset: 'audio' });
      case 'data': {
        // The shared responses nodes work on shared sources only
        const shared = node.kind.startsWith('action.shared');
        const list = project.dataSources.filter((d) => !shared || d.source === 'shared');
        return pick(list.map((d) => ({ value: d.id, label: d.name })), list.length ? 'Choose data source…' : shared ? 'No shared responses yet (Data tab)' : 'No data sources yet');
      }
      case 'cursor':
        return <SelectField key={p.key} label={p.label} title={p.help} value={String(v ?? 'pointer')} options={[...CURSORS]} onChange={(x) => set(p.key, x)} />;
      case 'prop': {
        // The layer this node acts on can have settings of its own (a progress layer's value)
        let target: SceneNode | undefined;
        walk(ab.children, (x) => {
          if (x.id === node.params.target) target = x;
        });
        return <SelectField key={p.key} label={p.label} title={p.help} value={String(v ?? '')} options={[...ANIMATABLE_PROPS, ...layerOwnProps(target)].map((a) => ({ value: a.prop, label: a.label }))} onChange={(x) => set(p.key, x)} />;
      }
      case 'select':
        return <SelectField key={p.key} label={p.label} title={p.help} value={String(v ?? '')} options={p.options ?? []} onChange={(x) => set(p.key, x)} />;
      case 'easing':
        return <SelectField key={p.key} label={p.label} title={p.help} value={String(v ?? 'easeInOut')} options={[...EASING_NAMES]} onChange={(x) => set(p.key, x)} />;
      case 'number':
        if (p.widget === 'speed') return <SpeedField key={`${node.id}:${p.key}`} label={p.label} title={p.help} value={Number(v ?? 0)} onChange={(x) => set(p.key, x)} />;
        return <NumberField key={p.key} label={p.label} title={p.help} value={Number(v ?? 0)} onChange={(x) => set(p.key, x)} />;
      case 'boolean':
        return <CheckField key={p.key} label={p.label} title={p.help} value={!!v} onChange={(x) => set(p.key, x)} />;
      case 'expr': {
        // Setting a choice variable: pick from its choices (stored as a quoted value), or type an expression
        const enumVar = node.kind === 'action.setVariable' && p.key === 'value' ? project.variables.find((x) => x.id === node.params.variable && x.type === 'enum') : undefined;
        if (enumVar) {
          const opts = enumVar.options ?? [];
          const cur = String(v ?? '');
          const quoted = opts.map((o) => JSON.stringify(o));
          return (
            <div key={p.key}>
              <SelectField
                label={p.label}
                title={`${enumVar.name} is a choice: pick one of its options`}
                value={quoted.includes(cur) ? cur : '__expr'}
                options={[...opts.map((o) => ({ value: JSON.stringify(o), label: o })), { value: '__expr', label: 'Expression…' }]}
                onChange={(x) => set(p.key, x === '__expr' ? '' : x)}
              />
              {!quoted.includes(cur) && <ExprField label="Expr" value={cur} locals={GRAPH_LOCALS} commitOnBlur placeholder={`e.g. ${JSON.stringify(opts[0] ?? '')}`} onChange={(x) => set(p.key, x)} />}
            </div>
          );
        }
        // Wherever the graph asks for a yes/no condition: pickers, with the formula one click away
        const isCondition = p.key === 'onlyIf' || (node.kind === 'logic.if' && p.key === 'condition') || (node.kind === 'event.timer' && p.key === 'while');
        return (
          <div key={p.key}>
            {isCondition ? (
              <ConditionField label={p.label} title={p.help} value={String(v ?? '')} locals={GRAPH_LOCALS} placeholder={p.placeholder} onChange={(x) => set(p.key, x)} />
            ) : (
              <ExprField label={p.label} title={p.help} value={String(v ?? '')} locals={GRAPH_LOCALS} commitOnBlur calc={node.kind === 'action.setVariable' && p.key === 'value'} placeholder={p.placeholder} onChange={(x) => set(p.key, x)} />
            )}
            <div className="hint">{p.help ?? 'JavaScript expression; variables by name, plus event.'}</div>
          </div>
        );
      }
      case 'text':
        if (node.kind === 'action.code')
          return (
            <div key={p.key} className="code-field">
              <div className="field-label block">{p.label}</div>
              <CodeEditor value={String(v ?? '')} onChange={(x) => set(p.key, x)} height={160} />
            </div>
          );
        return <TextField key={p.key} label={p.label} title={p.help} value={String(v ?? '')} placeholder={p.placeholder} commitOnBlur onChange={(x) => set(p.key, x)} />;
    }
  };
  return (
    <div className="param-form">
      <div className="param-title" title={nodeAka(def) ?? undefined}>{nodeLabel(def)}</div>
      <p className="hint node-summary">
        {def.summary}
        {def.details && (
          <>
            {' '}
            <button type="button" className="link-btn" onClick={() => openHelp('interaction-nodes', slug(nodeHeading(def)))} aria-label={`More about ${nodeLabel(def)}, in the node reference`}>
              More about {nodeLabel(def)} →
            </button>
          </>
        )}
      </p>
      {def.gives && <NodeGives def={def} />}
      {def.params.map(field)}
      <TextField label="Note" value={node.note ?? ''} commitOnBlur onChange={onNote} />
      <button
        className="btn danger"
        onClick={() =>
          store().update((d) => {
            const a = d.artboards.find((x) => x.id === ab.id);
            if (!a) return;
            a.logic.nodes = a.logic.nodes.filter((x) => x.id !== node.id);
            a.logic.edges = a.logic.edges.filter((e) => e.from !== node.id && e.to !== node.id);
          })
        }
      >
        Delete node
      </button>
    </div>
  );
}
