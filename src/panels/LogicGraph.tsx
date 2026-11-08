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
  ANIMATABLE_PROPS,
  layerOwnProps,
  CATALOG,
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
import { CheckField, NumberField, SelectField, TextField } from '../components/ui';
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
import { tidyGraph } from '../lib/graph-tidy';
import { track } from '../lib/analytics';
import { Icons } from '../components/icons';
import { addAssetOption, addVariableOption, withQuickAdd } from '../lib/quick-add';
import { usePrefs } from '../lib/prefs';
import { compatibleKinds, newNodePort, type DragDirection } from '../lib/graph';
import { artboardChoices } from '../lib/variants-edit';

type IxNodeData = { logic: LogicNode; summary: string };

const CAT_COLOR: Record<string, string> = { event: 'var(--event)', action: 'var(--action)', logic: 'var(--logic)' };

function IxNode({ data, selected }: NodeProps<Node<IxNodeData>>) {
  const def = CATALOG_BY_KIND[data.logic.kind];
  if (!def) return <div className="ix-graph-node unknown">Unknown node {data.logic.kind}</div>;
  return (
    <div className={`ix-graph-node${selected ? ' selected' : ''}`} style={{ ['--cat' as string]: CAT_COLOR[def.category] }}>
      {def.hasInput && <Handle type="target" position={Position.Left} id="in" />}
      <div className="gn-head">
        <span className="gn-cat">{def.category}</span>
        {def.label}
      </div>
      <div className="gn-body">{data.summary || <span className="muted">{def.description}</span>}</div>
      <div className="gn-outs">
        {def.outputs.map((o, i) => (
          <div key={o.id} className="gn-out" style={{ top: 34 + i * 18 }}>
            {o.label && <span>{o.label}</span>}
            <Handle type="source" position={Position.Right} id={o.id} style={{ top: 'auto', position: 'relative', transform: 'none', right: -8 }} />
          </div>
        ))}
      </div>
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

const nodeTypes = { ix: IxNode, ixgroup: GroupNode };

export function summarize(n: LogicNode, ab: Artboard, project: Project): string {
  const def = CATALOG_BY_KIND[n.kind];
  if (!def) return '';
  const parts: string[] = [];
  const names = new Map<string, string>();
  walk(ab.children, (x) => names.set(x.id, x.name));
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
    else if (p.type === 'select') text = p.options?.find((o) => o.value === v)?.label ?? text;
    else if (p.type === 'boolean') text = v ? p.label : '';
    else if (p.type === 'text' && n.kind === 'action.code') text = text.split('\n')[0].slice(0, 40);
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}

export function LogicGraph() {
  const s = useEditor((st) => ({ project: st.project, abId: st.activeArtboardId, sel: st.logicSelection, picked: st.logicPicked }));
  const theme = usePrefs().theme;
  const ab = getArtboard(s.project, s.abId);
  const rf = useRef<ReactFlowInstance<Node<IxNodeData>, Edge> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
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
        ...(ab?.logic.nodes ?? []).map((n) => ({
          id: n.id,
          type: 'ix',
          position: { x: n.x, y: n.y },
          data: { logic: n, summary: ab ? summarize(n, ab, s.project) : '' },
          selected: chosen.includes(n.id),
        })),
      ],
    [ab, s.project, chosen],
  );
  // Selected connections live here (the document only stores the graph), so Delete can remove them
  const [selEdges, setSelEdges] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; search?: string } | null>(null);
  const edges: Edge[] = useMemo(
    () => (ab?.logic.edges ?? []).map((e) => ({ id: e.id, source: e.from, sourceHandle: e.fromPort, target: e.to, targetHandle: e.toPort, animated: false, selected: selEdges.includes(e.id) })),
    [ab, selEdges],
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
  const onNodesChange = (changes: NodeChange<Node<IxNodeData>>[]) => {
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
        for (const c of moves) {
          const pos = c.position!;
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
      }, `logic-move-${[...moving].sort().join(',')}`);
      if (moves.every((c) => !c.dragging) && !(resizingGroup && moving.has(resizingGroup))) store().commit();
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
    if (!c.source || !c.target || c.source === c.target) return;
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
    const picked = new Set(ids.filter((id) => !isGroup(id)));
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
    if (!gone.size && !groupIds.size && !edgeIds.length) return;
    updateLogic((a) => {
      a.logic.nodes = a.logic.nodes.filter((x) => !gone.has(x.id));
      a.logic.edges = a.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to) && !edgeIds.includes(e.id));
      if (a.logic.groups && groupIds.size) {
        a.logic.groups = a.logic.groups.filter((g) => !groupIds.has(g.id));
        if (!a.logic.groups.length) delete a.logic.groups;
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
    if (!ab || (!f.nodes.length && !f.groups.length)) return false;
    const o = fragmentOrigin(f);
    const here = f.nodes.some((n) => ab.logic.nodes.some((x) => x.id === n.id)) || f.groups.some((g) => ab.logic.groups?.some((x) => x.id === g.id));
    const c = cloneFragment(f, at ? at.x - o.x : here ? 30 : 0, at ? at.y - o.y : here ? 30 : 0);
    updateLogic((a) => {
      a.logic.nodes.push(...c.nodes);
      a.logic.edges.push(...c.edges);
      if (c.groups.length) a.logic.groups = [...(a.logic.groups ?? []), ...c.groups];
    });
    select([...c.groups.map((g) => g.id), ...c.nodes.map((n) => n.id)]);
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
    updateLogic((a) => {
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
    const groups = (ab.logic.groups ?? []).map((g) => ({ id: g.id, members: membersOf(ab, g).map((n) => n.id) }));
    const out = tidyGraph(nodes, edges, groups);
    updateLogic((a) => {
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
        { label: 'Colour', items: GROUP_COLORS.map((c) => ({ label: c.label, color: c.value || 'var(--muted)', onClick: () => updateGroup(g.id, (x) => (c.value ? (x.color = c.value) : delete x.color)) })) },
        { separator: true },
        { label: 'Copy group and its nodes', hint: 'Ctrl+C', onClick: () => copySelection([id]) },
        { label: 'Duplicate group and its nodes', hint: 'Ctrl+D', onClick: () => duplicate([id]) },
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
  const paletteItems = (pick: (kind: string) => void, only?: (kind: string) => boolean): MenuItem[] =>
    (['event', 'action', 'logic'] as const)
      .map((cat) => ({
        label: cat === 'event' ? 'Event' : cat === 'action' ? 'Action' : 'Logic',
        color: CAT_COLOR[cat],
        items: CATALOG.filter((d) => d.category === cat && (!only || only(d.kind))).map((d) => ({ label: d.label, title: d.description, onClick: () => pick(d.kind) })),
      }))
      .filter((g) => g.items.length);

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
        { label: 'Tidy up', title: 'Lay the graph out in columns from its events, with as few crossing connections as possible, and fit groups to their nodes', onClick: tidy },
        { label: 'Paste', hint: 'Ctrl+V', onClick: () => pasteFromClipboard(at) },
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
    const names = new Map(ab.logic.nodes.map((x) => [x.id, CATALOG_BY_KIND[x.kind]?.label ?? x.kind]));
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
    const items: MenuItem[] = [{ heading: def.label }];
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
      { label: 'Cut', hint: 'Ctrl+X', onClick: () => copySelection([id], true) },
      { label: 'Copy', hint: 'Ctrl+C', onClick: () => copySelection([id]) },
      { label: 'Duplicate', hint: 'Ctrl+D', onClick: () => duplicate([id]) },
      { label: 'Put in a new group', hint: 'Ctrl+G', title: 'Draw a labelled frame around this node; drag other nodes into it', onClick: () => groupAround([id]) },
      { label: 'Help for this node', onClick: () => openHelp('interaction-nodes', slug(def.label)) },
      { separator: true },
      { label: 'Delete', hint: 'Del', danger: true, onClick: () => removeNodes([id]) },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  /** Right-click on a selection of several nodes and groups: what applies to all of them together. */
  const selectionMenu = (e: React.MouseEvent, ids: string[]) => {
    if (!ab) return;
    const nodeIds = ids.filter((x) => !isGroup(x));
    const groupCount = ids.length - nodeIds.length;
    const inside = new Set(nodeIds);
    const between = ab.logic.edges.filter((x) => inside.has(x.from) && inside.has(x.to));
    const touching = ab.logic.edges.filter((x) => inside.has(x.from) || inside.has(x.to));
    const what = [nodeIds.length && `${nodeIds.length} node${nodeIds.length === 1 ? '' : 's'}`, groupCount && `${groupCount} group${groupCount === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    const items: MenuItem[] = [
      { heading: `${what} selected` },
      { label: 'Cut', hint: 'Ctrl+X', onClick: () => copySelection(ids, true) },
      { label: 'Copy', hint: 'Ctrl+C', title: 'Copies them with the connections between them; pasted copies are wired to each other the same way', onClick: () => copySelection(ids) },
      { label: 'Duplicate', hint: 'Ctrl+D', onClick: () => duplicate(ids) },
    ];
    if (nodeIds.length) items.push({ label: 'Put in a new group', hint: 'Ctrl+G', title: 'Draw a labelled frame around the selected nodes', onClick: () => groupAround(nodeIds) });
    if (touching.length)
      items.push({
        label: 'Disconnect',
        items: [
          { label: `Between them (${between.length})`, disabled: !between.length, onClick: () => removeEdges(between.map((x) => x.id)) },
          { label: `From everything else (${touching.length - between.length})`, disabled: touching.length === between.length, onClick: () => removeEdges(touching.filter((x) => !between.includes(x)).map((x) => x.id)) },
          { label: `All (${touching.length})`, onClick: () => removeEdges(touching.map((x) => x.id)) },
        ],
      });
    items.push({ label: 'Tidy up the graph', onClick: tidy }, { separator: true }, { label: 'Delete', hint: 'Del', danger: true, onClick: () => void deleteSelected() });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const edgeMenu = (e: React.MouseEvent, edgeId: string) => {
    e.preventDefault();
    setSelEdges([edgeId]);
    select([], null);
    setMenu({ x: e.clientX, y: e.clientY, items: [{ label: 'Delete connection', hint: 'Del', danger: true, onClick: () => removeEdges([edgeId]) }] });
  };

  // Frame the graph when switching artboards, or when nodes appear in a graph that was empty.
  const count = ab?.logic.nodes.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count && (lastCount.current === 0 || count - lastCount.current > 1)) requestAnimationFrame(() => rf.current?.fitView({ maxZoom: 1, padding: 0.2 }));
    lastCount.current = count;
  }, [count, s.abId]);

  if (!ab) return null;
  const selected = ab.logic.nodes.find((n) => n.id === s.sel);

  return (
    <SplitColumns id="logic" columns={[{ width: 170, min: 120, max: 360 }, 'flex', { width: 260, min: 200, max: 560 }]} className="logic">
      <div className="logic-palette">
        {(['event', 'action', 'logic'] as const).map((cat) => (
          <div key={cat} className="palette-group">
            <div className="palette-title" style={{ color: CAT_COLOR[cat] }}>
              {cat === 'event' ? 'Events' : cat === 'action' ? 'Actions' : 'Logic'}
            </div>
            {CATALOG.filter((d) => d.category === cat).map((d) => (
              <button
                key={d.kind}
                className="palette-item"
                title={d.description}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('application/x-ix-logic', d.kind);
                }}
                onClick={() => add(d.kind)}
              >
                {d.label}
              </button>
            ))}
          </div>
        ))}
      </div>
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
          const mod = e.ctrlKey || e.metaKey;
          const k = e.key.toLowerCase();
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            void deleteSelected();
          } else if (mod && k === 'a') {
            e.preventDefault();
            select([...(ab.logic.groups ?? []).map((g) => g.id), ...ab.logic.nodes.map((n) => n.id)]);
          } else if (mod && k === 'g' && chosenNow().some((id) => !isGroup(id))) {
            e.preventDefault();
            groupAround(chosenNow());
          } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            // The graph keeps the key to itself (stopPropagation above), so undo and redo have to be handled here
            e.preventDefault();
            if (e.key.toLowerCase() === 'y' || e.shiftKey) store().redo();
            else store().undo();
          } else if (mod && k === 'd' && chosenNow().length) {
            e.preventDefault();
            duplicate(chosenNow());
          } else if (mod && (k === 'c' || k === 'x') && chosenNow().length) {
            //Leave it alone when there's text selected in a node, so copying that still works
            if (window.getSelection()?.toString()) return;
            e.preventDefault();
            copySelection(chosenNow(), k === 'x');
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={onNodeClick}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onInit={(inst) => (rf.current = inst)}
          onPaneClick={() => {
            select([], null);
            setSelEdges([]);
          }}
          onPaneContextMenu={paneMenu}
          onNodeContextMenu={(e, node) => (isGroup(node.id) ? groupMenu(e, node.id) : nodeMenu(e, node.id))}
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
            <ControlButton onClick={tidy} title="Tidy up: lay the graph out in columns from its events, with as few crossing connections as possible (one undo)" aria-label="Tidy up the graph">
              <Icons.distH width={14} />
            </ControlButton>
          </Controls>
        </ReactFlow>
        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} search={menu.search} onClose={() => setMenu(null)} />}
        {!ab.logic.nodes.length && (
          <div className="logic-empty">
            <p>
              Add an <b>event</b> (e.g. On pointer), then connect it to <b>actions</b>. Drag from a node's right edge to the next node. Right-click for a menu of nodes, or drag a connection into empty space to add and connect one.
            </p>
          </div>
        )}
      </div>
      <div className="logic-settings">
        {chosen.length > 1 ? (
          <p className="hint">
            {chosen.length} selected. Drag any of them to move them all. <b>Ctrl+C</b> copies them with the connections between them (pasted copies are wired to each other the same way), <b>Ctrl+D</b> duplicates, <b>Ctrl+G</b> puts them in a new group and <b>Del</b> deletes them. Ctrl+click adds or removes one.
          </p>
        ) : selected ? <ParamForm node={selected} ab={ab} project={s.project} onChange={(params) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.params = params;
        }, `logic-params-${selected.id}`)} onNote={(note) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.note = note || undefined;
        }, `logic-note-${selected.id}`)} /> : s.sel && ab.logic.groups?.some((g) => g.id === s.sel) ? (
          <p className="hint">A group. Drag it (its title or the empty space inside) to move it with the nodes in it, drag its edges to resize it, double-click the title to rename it, and right-click it to add a node inside or change its colour. Delete asks whether to keep the nodes inside or delete them too.</p>
        ) : (
          <p className="hint">Select a node to edit its settings.</p>
        )}
      </div>
    </SplitColumns>
  );
}

function ParamForm({ node, ab, project, onChange, onNote }: { node: LogicNode; ab: Artboard; project: Project; onChange: (p: Record<string, unknown>) => void; onNote: (n: string) => void }) {
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
  const field = (p: ParamDef) => {
    if (p.showIf && !p.showIf.values.includes(params[p.showIf.key])) return null;
    const v = params[p.key];
    const pick = (options: { value: string; label: string }[], empty: string, extra: { value: string; label: string }[] = [], quick: Parameters<typeof withQuickAdd>[1] = {}) => (
      <SelectField key={p.key} label={p.label} value={String(v ?? '')} options={[{ value: '', label: empty }, ...options, ...extra]} onChange={withQuickAdd((x) => set(p.key, x), quick)} />
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
        return pick(artboardChoices(project, v), 'Choose artboard…');
      case 'script':
        return pick(project.scripts.map((x) => ({ value: x.id, label: x.name })), project.scripts.length ? 'Choose script…' : 'No scripts yet');
      case 'asset':
        return pick(project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio').map((a) => ({ value: a.id, label: a.name })), 'Choose sound…', [addAssetOption('audio')], { asset: 'audio' });
      case 'data':
        return pick(project.dataSources.map((d) => ({ value: d.id, label: d.name })), project.dataSources.length ? 'Choose data source…' : 'No data sources yet');
      case 'cursor':
        return <SelectField key={p.key} label={p.label} value={String(v ?? 'pointer')} options={[...CURSORS]} onChange={(x) => set(p.key, x)} />;
      case 'prop': {
        // The layer this node acts on can have settings of its own (a progress layer's value)
        let target: SceneNode | undefined;
        walk(ab.children, (x) => {
          if (x.id === node.params.target) target = x;
        });
        return <SelectField key={p.key} label={p.label} value={String(v ?? '')} options={[...ANIMATABLE_PROPS, ...layerOwnProps(target)].map((a) => ({ value: a.prop, label: a.label }))} onChange={(x) => set(p.key, x)} />;
      }
      case 'select':
        return <SelectField key={p.key} label={p.label} value={String(v ?? '')} options={p.options ?? []} onChange={(x) => set(p.key, x)} />;
      case 'easing':
        return <SelectField key={p.key} label={p.label} value={String(v ?? 'easeInOut')} options={[...EASING_NAMES]} onChange={(x) => set(p.key, x)} />;
      case 'number':
        return <NumberField key={p.key} label={p.label} value={Number(v ?? 0)} onChange={(x) => set(p.key, x)} />;
      case 'boolean':
        return <CheckField key={p.key} label={p.label} value={!!v} onChange={(x) => set(p.key, x)} />;
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
        return (
          <div key={p.key}>
            <ExprField label={p.label} value={String(v ?? '')} locals={GRAPH_LOCALS} commitOnBlur placeholder={p.placeholder} onChange={(x) => set(p.key, x)} />
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
        return <TextField key={p.key} label={p.label} value={String(v ?? '')} placeholder={p.placeholder} commitOnBlur onChange={(x) => set(p.key, x)} />;
    }
  };
  return (
    <div className="param-form">
      <div className="param-title">{def.label}</div>
      <p className="hint">{def.description}</p>
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
