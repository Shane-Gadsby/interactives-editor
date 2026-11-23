import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, Handle, Position, type Connection, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { matchLines, type Story } from 'interactives-player';
import { store } from '../store/store';
import { confirmDialog } from '../components/dialogs';
import { CodeEditor } from '../components/CodeEditor';
import { insertAfter, joinTo, layoutMap, newSceneTitle, removeNode, storyMap, type MapNode } from '../lib/story-map';

type Data = { node: MapNode; selected: boolean };

/** One node: its title, a few of its lines, and a way out for each choice or branch. */
function StoryNode({ data }: NodeProps<Node<Data>>) {
  const n = data.node;
  const ends = n.kind === 'end' || n.kind === 'next';
  return (
    <div className={`story-node story-node-${n.kind}${n.unreached ? ' unreached' : ''}${data.selected ? ' picked' : ''}`} title={n.unreached ? 'Nothing leads here from the start of the chapter' : undefined}>
      <Handle type="target" position={Position.Left} />
      <div className="story-node-title">{n.title}</div>
      {n.kind === 'lines' && (
        <div className="story-node-lines">
          {n.preview.map((p, i) => (
            <div key={i}>{p}</div>
          ))}
          {n.lines > n.preview.length && <div className="muted">and {n.lines - n.preview.length} more</div>}
          {n.unreached && <div className="story-node-warn">Nothing leads here</div>}
        </div>
      )}
      {(n.kind === 'menu' || n.kind === 'if') && (
        <div className="story-node-ports">
          {n.ports.map((p) => (
            <div key={p.line} className="story-node-port">
              {n.kind === 'menu' ? p.label : p.label === 'else' ? 'otherwise' : `if ${p.label}`}
              <Handle type="source" position={Position.Right} id={p.line} />
            </div>
          ))}
          {n.kind === 'if' && !n.ports.some((p) => p.label === 'else') && (
            <div className="story-node-port muted">
              otherwise
              <Handle type="source" position={Position.Right} id={`${n.id}:otherwise`} />
            </div>
          )}
        </div>
      )}
      {n.kind === 'lines' && <Handle type="source" position={Position.Right} />}
      {ends && null}
    </div>
  );
}

const TYPES = { story: StoryNode };

/**
 * The Dialogue view: the chapter as nodes and arrows, worked out from its lines (story-map.ts). Drag from a choice or the end
 * of a scene to another scene to jump there; Delete takes a node's lines out; the selected node's lines can be edited under
 * the map. Every change edits the script, so the Script view and the map never disagree.
 */
export function StoryGraph({ story, chapterId, onOpenLine }: { story: Story; chapterId: string; onOpenLine: (line: number) => void }) {
  const chapter = story.chapters.find((c) => c.id === chapterId)!;
  const { nodes, edges } = useMemo(() => storyMap(chapter, story), [chapter, story]);
  const pos = useMemo(() => layoutMap(nodes, edges, chapter.map ?? {}), [nodes, edges, chapter.map]);
  const [picked, setPicked] = useState<string | null>(null);
  const sel = nodes.find((n) => n.id === picked) ?? null;

  const setLines = (lines: typeof chapter.lines, coalesce?: string) =>
    store().update(
      (d) => {
        const ch = d.story?.chapters.find((c) => c.id === chapterId);
        if (ch) ch.lines = lines as typeof ch.lines;
      },
      { coalesce },
    );
  const flowNodes: Node<Data>[] = nodes.map((n) => ({ id: n.id, type: 'story', position: pos.get(n.id)!, data: { node: n, selected: n.id === picked }, deletable: n.from !== undefined }));
  const flowEdges: Edge[] = edges.map((e) => ({ id: e.id, source: e.from, sourceHandle: e.port ?? null, target: e.to, label: e.label, deletable: false, className: 'story-edge' }));

  const connect = (c: Connection) => {
    const from = nodes.find((n) => n.id === c.source);
    const to = nodes.find((n) => n.id === c.target);
    if (!from || !to) return;
    let lines = chapter.lines;
    let title: string;
    if (to.kind === 'end') title = to.title.startsWith('End: ') ? `end ${to.title.slice(5)}` : 'end';
    else if (to.kind === 'next') title = to.title.replace(/^Chapter: /, '');
    else if (to.kind === 'lines' && to.from !== undefined && lines[to.from].text.trim().startsWith('#')) title = to.title;
    else if (to.kind === 'lines' && to.from !== undefined) {
      // a run of lines with no title gets one, so there's somewhere to jump to
      title = newSceneTitle(lines);
      lines = [...lines.slice(0, to.from), { id: `${to.id}-t`, text: `# ${title}` }, ...lines.slice(to.from)];
      lines = matchLines(chapter.lines, lines.map((l) => l.text).join('\n'));
    } else return;
    const fresh = storyMap({ ...chapter, lines }, story).nodes.find((n) => n.id === from.id) ?? from;
    setLines(joinTo(lines, fresh, c.sourceHandle ?? undefined, title));
  };

  const addScene = () => {
    const title = newSceneTitle(chapter.lines);
    setLines(insertAfter(chapter.lines, null, ['', `# ${title}`, 'Something happens here.']));
  };
  const addChoice = () => setLines(insertAfter(chapter.lines, sel, ['', '? One way', '    Narration for this way.', '? The other way', '    Narration for that way.']));

  const selText = sel && sel.from !== undefined && sel.to !== undefined ? chapter.lines.slice(sel.from, sel.to + 1).map((l) => l.text).join('\n') : '';
  const editSel = (text: string) => {
    if (!sel || sel.from === undefined || sel.to === undefined) return;
    const old = chapter.lines.slice(sel.from, sel.to + 1);
    const mid = matchLines(old, text);
    setLines([...chapter.lines.slice(0, sel.from), ...mid, ...chapter.lines.slice(sel.to + 1)], `story-map-${sel.id}`);
  };

  return (
    <div className="story-graph">
      <div className="story-graph-bar">
        <button className="btn" onClick={addScene} title="A new scene at the end of the chapter, to join to from a choice">
          + Scene
        </button>
        <button className="btn" onClick={addChoice} title={sel ? 'A choice with two ways, after the selected node' : 'A choice with two ways, at the end of the chapter'}>
          + Choice
        </button>
        {sel?.from !== undefined && (
          <button className="link-btn" onClick={() => onOpenLine(sel.from! + 1)}>
            Show in the script
          </button>
        )}
        <span className="hint">Drag from a choice, or the right of a scene, onto another scene to jump there.</span>
      </div>
      <div className="story-graph-flow">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={TYPES}
          //opens readable at the start of the chapter rather than fitting a long one into an unreadable strip
          defaultViewport={{ x: 24, y: 24, zoom: 0.85 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => setPicked(n.id)}
          onPaneClick={() => setPicked(null)}
          onConnect={connect}
          onNodeDragStop={(_, n) =>
            store().update(
              (d) => {
                const ch = d.story?.chapters.find((c) => c.id === chapterId);
                if (ch) (ch.map ??= {})[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
              },
              { coalesce: `story-map-pos-${chapterId}` },
            )
          }
          onBeforeDelete={async ({ nodes: gone }) => {
            const real = gone.map((g) => nodes.find((n) => n.id === g.id)).filter((n): n is MapNode => !!n && n.from !== undefined);
            if (!real.length) return false;
            const count = real.reduce((k, n) => k + (n.to! - n.from! + 1), 0);
            if (!(await confirmDialog({ title: 'Delete from the story', message: `Take ${real.length === 1 ? `"${real[0].title}"` : `${real.length} nodes`} out of the chapter (${count} lines)?`, confirmLabel: 'Delete', danger: true }))) return false;
            let lines = chapter.lines;
            //from the bottom up, so the line numbers above stay right
            for (const n of [...real].sort((a, b) => b.from! - a.from!)) lines = removeNode(lines, n);
            setLines(lines);
            setPicked(null);
            return false;
          }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {sel && sel.from !== undefined && (
        <div className="story-graph-edit">
          <div className="field-label block">{sel.title}: its lines</div>
          <CodeEditor key={sel.id} value={selText} onChange={editSel} language="story" height={150} label={`${sel.title}, its lines`} />
        </div>
      )}
    </div>
  );
}
