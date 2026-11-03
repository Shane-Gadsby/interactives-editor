import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ANIMATABLE_PROPS,
  CATALOG,
  CURSORS,
  CATALOG_BY_KIND,
  EASING_NAMES,
  defaultParams,
  uid,
  walk,
  type Artboard,
  type LogicNode,
  type ParamDef,
  type Project,
} from 'interactives-player';
import { store, useEditor } from '../store/store';
import { getArtboard } from '../store/doc';
import { CheckField, NumberField, SelectField, TextField } from '../components/ui';
import { CodeEditor } from '../components/CodeEditor';
import { assetKind } from '../lib/assets';

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

const nodeTypes = { ix: IxNode };

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
    else if (p.type === 'variable') text = project.variables.find((x) => x.id === v)?.name ?? '(missing variable)';
    else if (p.type === 'artboard') text = project.artboards.find((x) => x.id === v)?.name ?? '(missing artboard)';
    else if (p.type === 'script') text = project.scripts.find((x) => x.id === v)?.name ?? '(missing script)';
    else if (p.type === 'data') text = project.dataSources.find((x) => x.id === v)?.name ?? '(missing data)';
    else if (p.type === 'select') text = p.options?.find((o) => o.value === v)?.label ?? text;
    else if (p.type === 'boolean') text = v ? p.label : '';
    else if (p.type === 'text' && n.kind === 'action.code') text = text.split('\n')[0].slice(0, 40);
    if (text) parts.push(text);
  }
  return parts.join(' · ');
}

export function LogicGraph() {
  const s = useEditor((st) => ({ project: st.project, abId: st.activeArtboardId, sel: st.logicSelection }));
  const ab = getArtboard(s.project, s.abId);
  const rf = useRef<ReactFlowInstance<Node<IxNodeData>, Edge> | null>(null);

  const nodes: Node<IxNodeData>[] = useMemo(
    () =>
      (ab?.logic.nodes ?? []).map((n) => ({
        id: n.id,
        type: 'ix',
        position: { x: n.x, y: n.y },
        data: { logic: n, summary: ab ? summarize(n, ab, s.project) : '' },
        selected: n.id === s.sel,
      })),
    [ab, s.project, s.sel],
  );
  const edges: Edge[] = useMemo(
    () => (ab?.logic.edges ?? []).map((e) => ({ id: e.id, source: e.from, sourceHandle: e.fromPort, target: e.to, targetHandle: e.toPort, animated: false })),
    [ab],
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

  const onNodesChange = (changes: NodeChange<Node<IxNodeData>>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        const pos = c.position;
        updateLogic((a) => {
          const n = a.logic.nodes.find((x) => x.id === c.id);
          if (n) {
            n.x = Math.round(pos.x);
            n.y = Math.round(pos.y);
          }
        }, `logic-move-${c.id}`);
        if (!c.dragging) store().commit();
      } else if (c.type === 'select' && c.selected) store().set({ logicSelection: c.id });
      else if (c.type === 'remove') {
        updateLogic((a) => {
          a.logic.nodes = a.logic.nodes.filter((x) => x.id !== c.id);
          a.logic.edges = a.logic.edges.filter((e) => e.from !== c.id && e.to !== c.id);
        });
      }
    }
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
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

  const add = (kind: string, at?: { x: number; y: number }) => {
    const pos = at ?? rf.current?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight - 160 }) ?? { x: 40, y: 40 };
    const id = uid('lg');
    updateLogic((a) => {
      a.logic.nodes.push({ id, kind, x: Math.round(pos.x), y: Math.round(pos.y), params: defaultParams(kind) });
    });
    store().set({ logicSelection: id });
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
    <div className="logic">
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
                onDragStart={(e) => e.dataTransfer.setData('application/x-ix-logic', d.kind)}
                onClick={() => add(d.kind)}
              >
                {d.label}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div
        className="logic-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData('application/x-ix-logic');
          if (kind && rf.current) add(kind, rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(inst) => (rf.current = inst)}
          onPaneClick={() => store().set({ logicSelection: null })}
          fitView={ab.logic.nodes.length > 0}
          fitViewOptions={{ maxZoom: 1 }}
          deleteKeyCode={['Delete', 'Backspace']}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
        >
          <Background gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!ab.logic.nodes.length && (
          <div className="logic-empty">
            Add an <b>event</b> (e.g. On pointer), then connect it to <b>actions</b>. Drag from a node's right edge to the next node.
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
        }, `logic-note-${selected.id}`)} /> : <p className="hint">Select a node to edit its settings.</p>}
      </div>
    </div>
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
      if (n.type === 'group' || n.type === 'frame') rec(n.children, depth + 1);
    }
  };
  rec(ab.children, 0);
  const field = (p: ParamDef) => {
    if (p.showIf && !p.showIf.values.includes(params[p.showIf.key])) return null;
    const v = params[p.key];
    const pick = (options: { value: string; label: string }[], empty: string) => (
      <SelectField key={p.key} label={p.label} value={String(v ?? '')} options={[{ value: '', label: empty }, ...options]} onChange={(x) => set(p.key, x)} />
    );
    switch (p.type) {
      case 'node':
        return pick(layers, p.key === 'target' && node.kind.startsWith('event.') ? 'Any layer' : node.kind === 'action.cursor' ? 'Whole player' : 'Choose layer…');
      case 'timeline':
        return pick(ab.timelines.map((t) => ({ value: t.id, label: t.name })), ab.timelines.length ? 'Choose timeline…' : 'No timelines yet');
      case 'variable':
        return pick(project.variables.map((x) => ({ value: x.id, label: x.name })), project.variables.length ? 'Choose variable…' : 'No variables yet');
      case 'artboard':
        return pick(project.artboards.map((a) => ({ value: a.id, label: a.name })), 'Choose artboard…');
      case 'script':
        return pick(project.scripts.map((x) => ({ value: x.id, label: x.name })), project.scripts.length ? 'Choose script…' : 'No scripts yet');
      case 'asset':
        return pick(project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio').map((a) => ({ value: a.id, label: a.name })), 'Choose sound…');
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
      case 'expr':
        return (
          <div key={p.key}>
            <TextField label={p.label} value={String(v ?? '')} mono commitOnBlur placeholder={p.placeholder} onChange={(x) => set(p.key, x)} />
            <div className="hint">{p.help ?? 'JavaScript expression; variables by name, plus event.'}</div>
          </div>
        );
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
