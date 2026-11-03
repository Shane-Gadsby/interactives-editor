//The cursors say what a press will do: resize arrows turn with the layer, bend only over a bendable edge, and so on.
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, type Tool } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { ADD_POINT_CURSOR, BEND_CURSOR, PEN_CLOSE_CURSOR, angleOf, handleDirection, resizeCursor, resizeCursorForAngle, rotateCursor, rotateCursorAt, toolCursor } from '../src/canvas/cursors';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Q = [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
const box = (w: number, h: number): Q => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
const turned = (q: Q, deg: number): Q => {
  const a = (deg * Math.PI) / 180;
  return q.map((p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })) as Q;
};

describe('resize cursors', () => {
  it('map any angle to the double arrow along that line', () => {
    expect(resizeCursorForAngle(0)).toBe('ew-resize');
    expect(resizeCursorForAngle(180)).toBe('ew-resize');
    expect(resizeCursorForAngle(45)).toBe('nwse-resize');
    expect(resizeCursorForAngle(-135)).toBe('nwse-resize');
    expect(resizeCursorForAngle(90)).toBe('ns-resize');
    expect(resizeCursorForAngle(-90)).toBe('ns-resize');
    expect(resizeCursorForAngle(135)).toBe('nesw-resize');
    expect(resizeCursorForAngle(-45)).toBe('nesw-resize');
  });
  it('are the usual ones on an upright layer', () => {
    const q = box(100, 60);
    expect(resizeCursor('n', q)).toBe('ns-resize');
    expect(resizeCursor('e', q)).toBe('ew-resize');
    expect(resizeCursor('nw', q)).toBe('nwse-resize');
    expect(resizeCursor('se', q)).toBe('nwse-resize');
    expect(resizeCursor('ne', q)).toBe('nesw-resize');
    expect(resizeCursor('sw', q)).toBe('nesw-resize');
  });
  it('stay diagonal on a long thin box, where the box diagonal would flatten the arrow', () => {
    expect(resizeCursor('se', box(400, 10))).toBe('nwse-resize');
    expect(resizeCursor('ne', box(10, 400))).toBe('nesw-resize');
  });
  it('turn with the layer', () => {
    const q = box(100, 60);
    expect(resizeCursor('e', turned(q, 90))).toBe('ns-resize');
    expect(resizeCursor('n', turned(q, 90))).toBe('ew-resize');
    expect(resizeCursor('e', turned(q, 45))).toBe('nwse-resize');
    expect(resizeCursor('se', turned(q, 45))).toBe('ns-resize');
    expect(resizeCursor('nw', turned(q, 90))).toBe('nesw-resize');
    expect(resizeCursor('e', turned(q, 180))).toBe('ew-resize');
  });
  it('follow a flipped layer (the right edge is on the left)', () => {
    const flipped = box(100, 60).map((p) => ({ x: 100 - p.x, y: p.y })) as Q;
    expect(resizeCursor('e', flipped)).toBe('ew-resize');
    expect(resizeCursor('ne', flipped)).toBe('nwse-resize');
  });
});

describe('rotate cursors', () => {
  it('turn to sit around their corner, and share one image between close angles', () => {
    const q = box(100, 100);
    const nw = rotateCursorAt('nw', q);
    const se = rotateCursorAt('se', q);
    const ne = rotateCursorAt('ne', q);
    expect(new Set([nw, se, ne]).size).toBe(3);
    expect(rotateCursor(-135)).toBe(nw);
    expect(rotateCursor(-134)).toBe(nw);
    expect(nw).toContain('data:image/svg+xml');
    expect(nw.endsWith(', alias')).toBe(true);
    expect(angleOf(handleDirection('se', q))).toBeCloseTo(45);
  });
});

describe('tool cursors', () => {
  it('say what the tool does on empty canvas', () => {
    expect(toolCursor('hand')).toBe('grab');
    expect(toolCursor('select')).toBe('default');
    expect(toolCursor('bend')).toBe('default');
    expect(toolCursor('text')).toBe('text');
    expect(toolCursor('rect')).toBe('crosshair');
    expect(toolCursor('pen')).toContain('data:image/svg+xml');
    expect(toolCursor('pen').endsWith(', crosshair')).toBe(true);
  });
  it('every custom cursor has a hotspot and a standard fallback', () => {
    for (const c of [BEND_CURSOR, ADD_POINT_CURSOR, PEN_CLOSE_CURSOR, toolCursor('pen'), toolCursor('pencil')]) expect(c).toMatch(/^url\("data:image\/svg\+xml,[^"]+"\) \d+ \d+, [a-z-]+$/);
  });
});

describe('the canvas', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  const mount = (tool: Tool, nodes: SceneNode[], extra: Record<string, unknown> = {}) => {
    const p = createProject('T');
    p.artboards[0].children.push(...nodes);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ tool, selection: nodes.length ? [nodes[0].id] : [], activeArtboardId: p.artboards[0].id, ...extra });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Canvas />));
    return { s, p, vp: host.querySelector<HTMLElement>('.canvas')! };
  };
  const frame = () => new Promise((r) => setTimeout(r, 40));
  const move = async (vp: HTMLElement, x: number, y: number) => {
    await act(async () => {
      vp.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
      await frame();
    });
  };
  const handleCursor = (h: string) => (host!.querySelector(`[data-handle="${h}"]`) as HTMLElement).style.cursor;

  it('gives a turned layer resize and rotate handles that point the way they drag', () => {
    const r = createNode('rect', { x: 50, y: 50, width: 100, height: 40, rotation: 90 });
    mount('select', [r]);
    // Turned a quarter, the right edge is at the bottom of the screen
    expect(handleCursor('resize:e')).toBe('ns-resize');
    expect(handleCursor('resize:n')).toBe('ew-resize');
    expect(handleCursor('resize:se')).toBe('nesw-resize');
    expect(handleCursor('rotate:nw')).toContain('data:image/svg+xml');
    expect(handleCursor('rotate:nw')).not.toBe(handleCursor('rotate:se'));
  });

  it('shows the start of the pen path as the one to click to close it', async () => {
    const { vp, s } = mount('pen', []);
    expect(vp.style.cursor).toContain('data:image/svg+xml');
    s.set({ tool: 'pen' });
    for (const [x, y] of [[40, 40], [120, 40], [120, 100]]) {
      await act(async () => {
        vp.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
        vp.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
      });
    }
    expect(handleCursor('penstart')).toBe(PEN_CLOSE_CURSOR);
  });

  it('shows the Bend tool only over an edge it can bend', async () => {
    const path = createNode('path', {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      paths: [
        {
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
      ],
    } as never);
    const { vp, s } = mount('bend', [path]);
    const ab = s.get().project.artboards[0];
    const { zoom, panX, panY } = s.get();
    const at = (x: number, y: number) => [(x + ab.canvasX) * zoom + panX, (y + ab.canvasY) * zoom + panY] as const;
    expect(vp.style.cursor).toBe('default');
    await move(vp, ...at(150, 100));
    expect(vp.style.cursor).toBe(BEND_CURSOR);
    await move(vp, ...at(150, 150));
    expect(vp.style.cursor).toBe('default');
    await move(vp, ...at(100, 150));
    expect(vp.style.cursor).toBe(BEND_CURSOR);
  });

  it('says a double-click adds a point on the outline of the path being edited, and a drag moves a selected layer', async () => {
    const path = createNode('path', {
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fill: { type: 'solid', color: '#fff' },
      paths: [
        {
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
      ],
    } as never);
    const { vp, s } = mount('select', [path]);
    const ab = s.get().project.artboards[0];
    const { zoom, panX, panY } = s.get();
    const at = (x: number, y: number) => [(x + ab.canvasX) * zoom + panX, (y + ab.canvasY) * zoom + panY] as const;
    await move(vp, ...at(150, 150));
    expect(vp.style.cursor).toBe('move');
    await move(vp, ...at(400, 400));
    expect(vp.style.cursor).toBe('default');
    act(() => s.set({ editingPathId: path.id }));
    await move(vp, ...at(150, 100));
    expect(vp.style.cursor).toBe(ADD_POINT_CURSOR);
    await move(vp, ...at(150, 150));
    expect(vp.style.cursor).not.toBe(ADD_POINT_CURSOR);
  });
});
