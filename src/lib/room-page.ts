import { createArtboard, createNode, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode } from 'interactives-player';
import { STAGE_H, STAGE_W } from './story';

/**
 * A room to look around, and a map. The room is drawn from plain shapes (swap in a background picture and keep the layers
 * as invisible places on top of it): five places to look at, two hidden hint coins and a key in the desk, the room box their
 * words show in, what the reader carries, and Leave. The map lists the places the story has opened with [place ...].
 */

const INK = '#f5f2ea';
const DARK = '#15141c';
const ACCENT = '#c8a24a';
const solid = (color: string) => ({ type: 'solid' as const, color });

type Wiring = { nodes: LogicNode[]; edges: LogicEdge[] };

function onClick(w: Wiring, target: SceneNode, ...actions: { kind: string; params?: Record<string, unknown> }[]): void {
  const y = 40 + w.nodes.length * 40;
  const ev: LogicNode = { id: uid('n'), kind: 'event.pointer', x: 40, y, params: { type: 'click', target: target.id } };
  w.nodes.push(ev);
  let prev = ev;
  actions.forEach((a, i) => {
    const n: LogicNode = { id: uid('n'), kind: a.kind, x: 320 + i * 260, y, params: a.params ?? {} };
    w.nodes.push(n);
    w.edges.push({ id: uid('e'), from: prev.id, fromPort: 'out', to: n.id, toPort: 'in' });
    prev = n;
  });
}

const button = (name: string, label: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
  createNode('button', { name, label, x, y, width, height: 44, fontSize: 17, fontWeight: 600, cornerRadius: 10, fill: solid('rgba(18, 18, 28, 0.78)'), color: INK, ...extra } as never);

const shape = (type: 'rect' | 'ellipse', name: string, x: number, y: number, width: number, height: number, color: string, extra: Record<string, unknown> = {}) =>
  createNode(type, { name, x, y, width, height, fill: solid(color), stroke: null, ...extra } as never);

/** The room box, what's carried and Leave: the parts every room needs, bound to room.* and wired. */
export function roomControls(w: Wiring, width = STAGE_W, height = STAGE_H): SceneNode[] {
  const name = createNode('text', { name: 'Room name', x: 28, y: 14, width: 600, height: 28, text: 'Name', fontSize: 19, fontWeight: 700, color: ACCENT, autoSize: 'none', bindings: { text: 'room.speaker', visible: 'room.speaking' } } as never);
  const words = createNode('text', { name: 'Room words', x: 28, y: 46, width: width - 216, height: 80, text: 'What you see.', fontSize: 23, lineHeight: 1.4, color: INK, autoSize: 'none', bindings: { text: 'room.text' } } as never);
  const more = createNode('text', { name: 'Room more', x: width - 196, y: 100, width: 24, height: 24, text: '▼', fontSize: 15, color: INK, align: 'center', autoSize: 'none', decorative: true, bindings: { visible: 'room.more' } } as never);
  const box = createNode('frame', { name: 'Room box', x: 80, y: height - 170, width: width - 160, height: 140, cornerRadius: 14, fill: solid('rgba(18, 18, 28, 0.88)'), role: 'status', bindings: { visible: 'room.showing' }, children: [name, words, more] } as never);
  const carried = createNode('text', { name: 'Carrying', x: 24, y: 20, width: 760, height: 26, text: 'Hint coins: 3', fontSize: 16, color: INK, autoSize: 'none', bindings: { text: "'Hint coins: ' + room.coins + (room.items.length ? '   Carrying: ' + room.items.map((i) => i.name).join(', ') : '')" } } as never);
  const leave = button('Leave', 'Leave', width - 24 - 140, 14, 140);
  onClick(w, leave, { kind: 'action.storyBack', params: { result: "'left'" } });
  return [carried, leave, box];
}

/** A drawn room: the wall and floor, five places, two hidden coins, and the key in the desk. */
export function roomPage(name = 'Room'): Artboard {
  const W = STAGE_W;
  const H = STAGE_H;
  const w: Wiring = { nodes: [], edges: [] };
  const wall = shape('rect', 'Wall', 0, 0, W, 470, '#3b3346', { decorative: true });
  const floor = shape('rect', 'Floor', 0, 470, W, 250, '#5a4636', { decorative: true });
  const look = (n: SceneNode, examine: Record<string, unknown>) => Object.assign(n, { examine });
  const window = look(shape('rect', 'Window', 520, 70, 240, 180, '#8fb3d9', { cornerRadius: 6, stroke: { color: '#2a2433', width: 10 } }), { text: 'Rain on the glass. The quad is empty.' });
  const shelf = look(shape('rect', 'Bookshelf', 90, 120, 220, 380, '#6b4a2f', { cornerRadius: 4 }), { text: 'Mostly poetry. One book is upside down.\nMillie: That one is mine. Leave it.' });
  const desk = look(shape('rect', 'Desk', 860, 330, 300, 170, '#7a5a3a', { cornerRadius: 6 }), { text: 'A desk with one drawer that sticks. Inside: a small brass key.', item: 'Brass key', stays: true });
  const rug = look(shape('ellipse', 'Rug', 420, 540, 440, 120, '#8a3a3a'), { text: 'A rug with a burn mark shaped like a duck.' });
  const door = look(shape('rect', 'Door', 1180, 150, 90, 330, '#4a3a2c', { cornerRadius: 4 }), { text: 'Locked. Through the keyhole: a garden shed.' });
  //Hidden: small and faint, for the reader who looks closely
  const glint = (n: string, x: number, y: number, says: string) => look(shape('ellipse', n, x, y, 26, 26, '#f3d27a', { opacity: 0.35 }), { coins: 1, text: says });
  const coins = [glint('Glint on the shelf', 250, 160, 'Something shines behind the books.'), glint('Glint by the door', 1150, 640, 'Something shines under the door.')];
  const page = createArtboard({ name, width: W, height: H, background: solid(DARK), children: [wall, floor, window, shelf, desk, rug, door, ...coins], logic: w, canvasX: 0, canvasY: 0 } as Partial<Artboard>);
  page.children.push(...roomControls(w, W, H));
  return page;
}

/** The map: a button for each place the story has opened, going to the scene of that name. */
export function mapPage(name = 'Map'): Artboard {
  const W = STAGE_W;
  const H = STAGE_H;
  const w: Wiring = { nodes: [], edges: [] };
  const heading = createNode('text', { name: 'Heading', text: 'Where to?', x: 80, y: 48, width: 800, height: 60, fontSize: 44, fontWeight: 700, color: INK, autoSize: 'none', role: 'heading', headingLevel: 1 } as never);
  const place = button('Place', 'A place', 0, 0, 360, { height: 56, fontSize: 20, fill: solid('rgba(255, 255, 255, 0.92)'), color: DARK, bindings: { label: 'item' } });
  const list = createNode('frame', { name: 'Places', x: 80, y: 140, width: 1120, height: 440, fill: null, repeat: { items: 'story.places', layout: 'grid', gap: 20, columns: 3 }, children: [place] });
  onClick(w, place, { kind: 'action.storyGoTo', params: { where: '{story.places[event.index]}' } });
  const noneWords = createNode('text', { name: 'Nowhere yet words', text: 'Nowhere to go yet.', x: 20, y: 14, width: 320, height: 28, fontSize: 20, color: INK, autoSize: 'none' } as never);
  const none = createNode('frame', { name: 'Nowhere yet', x: 80, y: 140, width: 360, height: 56, cornerRadius: 10, fill: solid('#2b3a33'), bindings: { visible: 'story.places.length == 0' }, children: [noneWords] } as never);
  const back = button('Back', 'Back', 80, H - 90, 200, { height: 54, fontSize: 20 });
  onClick(w, back, { kind: 'action.storyBack', params: { result: "''" } });
  return createArtboard({ name, width: W, height: H, background: solid('#1e2a24'), children: [heading, list, none, back], logic: w, canvasX: 0, canvasY: 0 } as Partial<Artboard>);
}

/** Put a page in the project, to the right of the others, with a name nothing else has. Returns its id. */
export function addPage(d: Project, page: Artboard): string {
  const names = new Set(d.artboards.map((a) => a.name.toLowerCase()));
  let n = page.name;
  for (let i = 2; names.has(n.toLowerCase()); i++) n = `${page.name} ${i}`;
  page.name = n;
  page.canvasX = d.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0) + 160;
  d.artboards.push(page);
  return page.id;
}
