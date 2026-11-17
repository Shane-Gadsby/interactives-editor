import { beforeAll, describe, expect, it } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';

let mcp: typeof import('../mcp/server');
beforeAll(async () => {
  process.env.INTERACTIVES_MCP_NO_STDIO = '1';
  mcp = await import('../mcp/server');
});

describe('a page that fits its content in the editor', () => {
  it('takes the height of its lowest layer (plus the space below) after each change, and keeps its own height when it is off', () => {
    const p: Project = createProject('T');
    const a = createNode('rect', { name: 'A', x: 0, y: 40, width: 100, height: 200 });
    p.artboards[0].children.push(a);
    const s = new EditorStore(p);
    const ab = () => s.get().project.artboards[0];
    const own = ab().height;
    s.update((d) => {
      d.artboards[0].hugHeight = true;
      d.artboards[0].hugPadding = 16;
    });
    expect(ab().height).toBe(256);
    s.setProps([a.id], { height: 500 });
    expect(ab().height).toBe(556);
    s.setProps([a.id], { visible: false });
    // nothing shows: it keeps the height it had
    expect(ab().height).toBe(556);
    s.update((d) => {
      delete d.artboards[0].hugHeight;
      d.artboards[0].height = own;
    });
    s.setProps([a.id], { visible: true, height: 50 });
    expect(ab().height).toBe(own);
  });

  it('can be set through the MCP, which measures it there and then', () => {
    const p: Project = createProject('T');
    p.artboards[0].children.push(createNode('rect', { y: 100, height: 300 }));
    const out = mcp.applyChanges(p, [{ op: 'set_artboard', id: p.artboards[0].id, props: { hugHeight: true, hugPadding: 10, hugAnimate: true, hugDuration: 450 } }] as never);
    expect(out.project.artboards[0]).toMatchObject({ height: 410, hugHeight: true, hugAnimate: true, hugDuration: 450 });
  });
});
