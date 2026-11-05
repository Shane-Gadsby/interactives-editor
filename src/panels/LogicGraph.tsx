import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  NodeResizer,
  Position,
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
import { copyLogicNodes, logicNodesToPaste } from '../lib/logic-clipboard';
import {
  ANIMATABLE_PROPS,
  CATALOG,
  CURSORS,
  CATALOG_BY_KIND,
  EASING_NAMES,
  defaultParams,
  uid,
  isContainer,
  walk,
  type Artboard,
  type LogicGroup,
  type LogicNode,
  type ParamDef,
  type Project,
} from 'interactives-player';
import { store, useEditor } from '../store/store';
import { openHelp } from '../help/Help';
import { slug } from '../help/markdown';
import { getArtboard } from '../store/doc';
import { CheckField, NumberField, SelectField, TextField } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { SplitColumns } from '../components/SplitColumns';

// We hold the React Flow Pro licence (hideAttribution below); drop the library's dev-only notice about it
if (import.meta.env.DEV) silenceFlowAttributionWarning();
import { assetKind } from '../lib/assets';
import { ContextMenu, type MenuItem } from '../components/ContextMenu';
import { promptDialog } from '../components/dialogs';
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
      <div className="ix-group-head" title="Drag to move the group and the nodes in it. Double-click to rename" onDoubleClick={() => setEditing(true)}>
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

function summarize(n: LogicNode, ab: Artboard, project: Project): string {
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
  const s = useEditor((st) => ({ project: st.project, abId: st.activeArtboardId, sel: st.logicSelection }));
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

  const nodes: Node<IxNodeData>[] = useMemo(
    () =>
      [
        // Groups first and below everything, moved only by their title bar so the empty space inside acts like the pane
        ...(ab?.logic.groups ?? []).map(
          (g) =>
            ({
              id: g.id,
              type: 'ixgroup',
              position: { x: g.x, y: g.y },
              width: g.width,
              height: g.height,
              zIndex: -1,
              dragHandle: '.ix-group-head',
              data: { group: g },
              selected: g.id === s.sel,
            }) as unknown as Node<IxNodeData>,
        ),
        ...(ab?.logic.nodes ?? []).map((n) => ({
          id: n.id,
          type: 'ix',
          position: { x: n.x, y: n.y },
          data: { logic: n, summary: ab ? summarize(n, ab, s.project) : '' },
          selected: n.id === s.sel,
        })),
      ],
    [ab, s.project, s.sel],
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
  const onNodesChange = (changes: NodeChange<Node<IxNodeData>>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position && isGroup(c.id)) {
        const pos = c.position;
        updateLogic((a) => {
          const g = a.logic.groups?.find((x) => x.id === c.id);
          if (!g) return;
          const dx = Math.round(pos.x) - g.x;
          const dy = Math.round(pos.y) - g.y;
          if (!dx && !dy) return;
          if (resizingGroup === g.id) {
            // Grown to the left or up: the right and bottom edges stay put
            g.width -= dx;
            g.height -= dy;
          } else
            for (const n of membersOf(a, g)) {
              n.x += dx;
              n.y += dy;
            }
          g.x += dx;
          g.y += dy;
        }, `logic-move-${c.id}`);
        if (!c.dragging && resizingGroup !== c.id) store().commit();
      } else if (c.type === 'dimensions' && c.dimensions && c.resizing && isGroup(c.id)) {
        const d = c.dimensions;
        updateLogic((a) => {
          const g = a.logic.groups?.find((x) => x.id === c.id);
          if (!g) return;
          g.width = Math.round(d.width);
          g.height = Math.round(d.height);
        }, `logic-resize-${c.id}`);
      } else if (c.type === 'position' && c.position) {
        const pos = c.position;
        updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === c.id);
          if (n) {
            n.x = Math.round(pos.x);
            n.y = Math.round(pos.y);
          }
        }, `logic-move-${c.id}`);
        if (!c.dragging) store().commit();
      } else if (c.type === 'select' && c.selected) {
        store().set({ logicSelection: c.id });
        setSelEdges([]);
      }
      else if (c.type === 'remove') {
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
        setSelEdges((cur) => (c.selected ? [...cur.filter((x) => x !== c.id), c.id] : cur.filter((x) => x !== c.id)));
        if (c.selected) store().set({ logicSelection: null });
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
    store().set({ logicSelection: id });
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
  const deleteSelected = () => {
    const st = store().get();
    if (selEdges.length) removeEdges(selEdges);
    //Deleting a group takes the frame away and leaves its nodes (Delete group and nodes in its menu takes both)
    if (st.logicSelection && isGroup(st.logicSelection)) ungroup(st.logicSelection);
    else if (st.logicSelection) removeNodes([st.logicSelection]);
    setSelEdges([]);
    store().set({ logicSelection: null });
  };
  const duplicate = (id: string) => {
    const n = ab?.logic.nodes.find((x) => x.id === id);
    if (!n) return;
    const nid = uid('lg');
    updateLogic((a) => {
      a.logic.nodes.push({ ...structuredClone(n), id: nid, x: n.x + 30, y: n.y + 30 });
    });
    store().set({ logicSelection: nid });
    focusGraph();
  };
  const addGroup = (rect: { x: number; y: number; width: number; height: number }, label = 'Group') => {
    const id = uid('lgg');
    updateLogic((a) => {
      a.logic.groups = [...(a.logic.groups ?? []), { id, label, x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }];
    });
    store().set({ logicSelection: id });
    setSelEdges([]);
    focusGraph();
    return id;
  };
  /** A group around one node, with room for a few more beside it and the title bar above. */
  const groupAround = (nodeId: string) => {
    const n = ab?.logic.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const z = sizeOf(nodeId);
    addGroup({ x: n.x - 24, y: n.y - 48, width: z.width + 48, height: z.height + 72 });
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
    store().set({ logicSelection: id });
    setSelEdges([]);
    const inside = membersOf(ab, g).map((n) => n.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { heading: g.label || 'Group' },
        { label: 'Rename…', onClick: () => void renameGroup(g) },
        { label: 'Colour', items: GROUP_COLORS.map((c) => ({ label: c.label, color: c.value || 'var(--muted)', onClick: () => updateGroup(g.id, (x) => (c.value ? (x.color = c.value) : delete x.color)) })) },
        { separator: true },
        { label: 'Ungroup (keep the nodes)', hint: 'Del', onClick: () => ungroup(id) },
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
  const copyNode = (id: string, cut = false) => {
    const n = ab?.logic.nodes.find((x) => x.id === id);
    if (!n) return;
    copyLogicNodes([n]);
    if (cut) {
      removeNodes([id]);
      store().set({ logicSelection: null });
    }
  };
  //Pasted nodes get new ids. Where the original is still on this graph the copy sits just off it, so it doesn't land
  //exactly on top, otherwise it keeps the position it was copied from (or goes where the menu was opened)
  const pasteNodes = (list: LogicNode[], at?: { x: number; y: number }) => {
    if (!ab || !list.length) return false;
    const first = list[0];
    const here = ab.logic.nodes.some((x) => x.id === first.id);
    const dx = at ? at.x - first.x : here ? 30 : 0;
    const dy = at ? at.y - first.y : here ? 30 : 0;
    const copies = list.map((n) => ({ ...structuredClone(n), id: uid('lg'), x: Math.round(n.x + dx), y: Math.round(n.y + dy) }));
    updateLogic((a) => {
      a.logic.nodes.push(...copies);
    });
    store().set({ logicSelection: copies[copies.length - 1].id });
    setSelEdges([]);
    focusGraph();
    return true;
  };
  const pasteFromClipboard = (at?: { x: number; y: number }) =>
    void (navigator.clipboard?.readText?.() ?? Promise.resolve('')).then(
      (t) => pasteNodes(logicNodesToPaste(t), at),
      () => pasteNodes(logicNodesToPaste(), at),
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
    store().set({ logicSelection: id });
    setSelEdges([]);
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
      { label: 'Cut', hint: 'Ctrl+X', onClick: () => copyNode(id, true) },
      { label: 'Copy', hint: 'Ctrl+C', onClick: () => copyNode(id) },
      { label: 'Duplicate', hint: 'Ctrl+D', onClick: () => duplicate(id) },
      { label: 'Put in a new group', title: 'Draw a labelled frame around this node; drag other nodes into it', onClick: () => groupAround(id) },
      { label: 'Help for this node', onClick: () => openHelp('interaction-nodes', slug(def.label)) },
      { separator: true },
      { label: 'Delete', hint: 'Del', danger: true, onClick: () => removeNodes([id]) },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const edgeMenu = (e: React.MouseEvent, edgeId: string) => {
    e.preventDefault();
    setSelEdges([edgeId]);
    store().set({ logicSelection: null });
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
        onKeyDown={(e) => {
          e.stopPropagation();
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.cm-editor')) return;
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelected();
          } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
            // The graph keeps the key to itself (stopPropagation above), so undo and redo have to be handled here
            e.preventDefault();
            if (e.key.toLowerCase() === 'y' || e.shiftKey) store().redo();
            else store().undo();
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && store().get().logicSelection) {
            e.preventDefault();
            duplicate(store().get().logicSelection!);
          } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && store().get().logicSelection) {
            //Leave it alone when there's text selected in a node, so copying that still works
            if (window.getSelection()?.toString()) return;
            e.preventDefault();
            copyNode(store().get().logicSelection!, e.key.toLowerCase() === 'x');
          }
        }}
        onPaste={(e) => {
          //The editor pastes layers onto the artboard from a window listener, so the graph has to keep its pastes to itself
          const t = e.target as HTMLElement;
          if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('.cm-editor')) return;
          e.stopPropagation();
          e.preventDefault();
          pasteNodes(logicNodesToPaste(e.clipboardData.getData('text/plain')));
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onInit={(inst) => (rf.current = inst)}
          onPaneClick={() => {
            store().set({ logicSelection: null });
            setSelEdges([]);
          }}
          onPaneContextMenu={paneMenu}
          onNodeContextMenu={(e, node) => (isGroup(node.id) ? groupMenu(e, node.id) : nodeMenu(e, node.id))}
          onEdgeContextMenu={(e, edge) => edgeMenu(e, edge.id)}
          fitView={ab.logic.nodes.length > 0}
          fitViewOptions={{ maxZoom: 1 }}
          deleteKeyCode={null}
          colorMode={theme === 'auto' ? 'system' : theme}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
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
        {selected ? <ParamForm node={selected} ab={ab} project={s.project} onChange={(params) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.params = params;
        }, `logic-params-${selected.id}`)} onNote={(note) => updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === selected.id);
          if (n) n.note = note || undefined;
        }, `logic-note-${selected.id}`)} /> : s.sel && ab.logic.groups?.some((g) => g.id === s.sel) ? (
          <p className="hint">A group. Drag its title to move it with the nodes inside, drag its edges to resize it, double-click the title to rename it, and right-click it for its colour. Delete removes the frame and keeps the nodes.</p>
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
      case 'variable':
        return pick(project.variables.map((x) => ({ value: x.id, label: x.name })), project.variables.length ? 'Choose variable…' : 'No variables yet', [addVariableOption()], { variableType: 'number' });
      case 'variables': {
        // Several variables: one box each, kept as a list of ids (in the order they were ticked)
        const chosen = Array.isArray(v) ? v.map(String) : [];
        return (
          <div key={p.key} className="param-variables">
            <div className="field-label block">{p.label}</div>
            {project.variables.length ? (
              project.variables.map((x) => (
                <CheckField key={x.id} label={x.name} value={chosen.includes(x.id)} onChange={(on) => set(p.key, on ? [...chosen, x.id] : chosen.filter((id) => id !== x.id))} />
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
      case 'prop':
        return <SelectField key={p.key} label={p.label} value={String(v ?? '')} options={ANIMATABLE_PROPS.map((a) => ({ value: a.prop, label: a.label }))} onChange={(x) => set(p.key, x)} />;
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
              {!quoted.includes(cur) && <TextField label="Expr" value={cur} mono commitOnBlur placeholder={`e.g. ${JSON.stringify(opts[0] ?? '')}`} onChange={(x) => set(p.key, x)} />}
            </div>
          );
        }
        return (
          <div key={p.key}>
            <TextField label={p.label} value={String(v ?? '')} mono commitOnBlur placeholder={p.placeholder} onChange={(x) => set(p.key, x)} />
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
