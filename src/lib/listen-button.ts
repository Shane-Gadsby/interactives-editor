import { createNode, defaultParams, uid, type Artboard, type FrameNode, type LogicNode, type Project } from 'interactives-player';
import { lookFor } from './themes';
import { nodeNames, uniqueName } from '../store/doc';

const solid = (color: string) => ({ type: 'solid' as const, color });

/**
 * The standard Listen button: one frame holding a button that reads the whole artboard aloud (and stops when pressed again),
 * and a line that says why it is not there when the device has no voice. It is made of ordinary layers and graph nodes, so it
 * can be restyled, moved, or have its Read aloud node pointed at one layer's text instead. Returns the frame's id.
 */
export function addListenButton(d: Project, abId: string, at?: { x: number; y: number }): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return null;
  const L = lookFor(d.themes);
  const names = nodeNames(ab);
  const button = createNode('button', {
    name: uniqueName(names, 'Listen'),
    label: 'Listen',
    x: 0,
    y: 0,
    width: 130,
    height: 44,
    fill: solid(L.surfaceMuted),
    color: L.text,
    ariaLabel: 'Read this page aloud',
    //Bound so it says Stop while a voice is talking, and is not there at all when the device has no voice
    bindings: { visible: 'voiceAvailable', label: 'speaking ? "Stop" : "Listen"' },
  });
  const note = createNode('text', {
    name: uniqueName(names, 'Listen note'),
    text: 'Read aloud needs a voice installed on this device, and there is not one for this language.',
    x: 0,
    y: 0,
    width: 320,
    height: 20,
    fontSize: 14,
    color: L.muted,
    autoSize: 'height',
    bindings: { visible: '!voiceAvailable' },
  });
  const frame = createNode('frame', {
    name: uniqueName(names, 'Listen button'),
    x: at?.x ?? 24,
    y: at?.y ?? Math.max(0, ab.height - 68),
    width: 320,
    height: 44,
    fill: null,
    stroke: null,
    clip: false,
    children: [button, note],
  }) as FrameNode;
  ab.children.push(frame);
  wire(ab, button.id);
  return frame.id;
}

function wire(ab: Artboard, buttonId: string): void {
  const y = ab.logic.nodes.length ? Math.max(...ab.logic.nodes.map((n) => n.y)) + 160 : 40;
  const node = (kind: string, x: number, yy: number, params: Record<string, unknown>): LogicNode => ({ id: uid('l'), kind, x, y: yy, params: { ...defaultParams(kind), ...params } });
  const click = node('event.pointer', 0, y, { target: buttonId, type: 'click' });
  const ifSpeaking = node('logic.if', 300, y, { condition: 'speaking' });
  const stop = node('action.speak', 600, y, { op: 'stop' });
  const read = node('action.speak', 600, y + 110, { op: 'page' });
  ab.logic.nodes.push(click, ifSpeaking, stop, read);
  const edge = (from: LogicNode, to: LogicNode, port = 'out') => ab.logic.edges.push({ id: uid('e'), from: from.id, fromPort: port, to: to.id, toPort: 'in' });
  edge(click, ifSpeaking);
  edge(ifSpeaking, stop, 'true');
  edge(ifSpeaking, read, 'false');
}
