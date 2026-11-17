import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ANIMATABLE_PROPS, createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { NodeInspector } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;

function mount(node: SceneNode) {
  const p = createProject('T');
  p.artboards[0].children.push(node);
  s = new EditorStore(p);
  setCurrentStore(s);
  s.set({ activeArtboardId: p.artboards[0].id, timelineShown: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = () => {
    const n = useEditor((st) => st.project.artboards[0].children[0]);
    const ab = useEditor((st) => st.project.artboards[0]);
    const project = useEditor((st) => st.project);
    return <NodeInspector nodes={[n]} ab={ab} project={project} />;
  };
  act(() => root.render(<Harness />));
}

/** The properties the node's key buttons are for (their tooltips read "... keyframe for <prop> at ..."). */
const keyed = () => Array.from(host.querySelectorAll('.key-btn')).map((b) => /keyframe for (\S+) at/.exec(b.getAttribute('title') ?? '')?.[1] ?? '?');

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const fixtures: Record<string, { node: () => SceneNode; has: string[] }> = {
  rect: {
    node: () => createNode('rect', { stroke: { paint: { type: 'solid', color: '#000000' }, width: 2 }, shadow: { x: 0, y: 4, blur: 12, spread: 0, color: '#000000' }, blur: 3, link: { url: 'https://example.org', target: '_blank' } } as never),
    has: ['link.url', 'visible', 'cursor', 'stroke.paint.color', 'stroke.width', 'shadow.color', 'blur', 'fill.color'],
  },
  text: { node: () => createNode('text', {}), has: ['text', 'fontWeight', 'lineHeight', 'fontSize', 'visible'] },
  button: { node: () => createNode('button', {}), has: ['label', 'disabled', 'disabledOpacity', 'fontWeight', 'lineHeight'] },
  input: { node: () => createNode('input', {}), has: ['disabled', 'disabledOpacity', 'stroke.paint.color'] },
  link: { node: () => createNode('link', {}), has: ['text'] },
  embed: { node: () => createNode('embed', { mode: 'iframe' } as never), has: ['src'] },
  star: { node: () => createNode('star', {}), has: ['innerRatio'] },
  progress: { node: () => createNode('progress', {}), has: ['barFill.color', 'value', 'max'] },
  animation: { node: () => createNode('animation', {}), has: ['clipName', 'playing', 'speed', 'frame'] },
};

/** Fields that have no key button on purpose: they are driven by bindings and interactions, or are set up once. */
const LEFT_OUT = [
  /^aria/, // accessibility state follows a variable (Data bindings), it is not animated on a timeline
  'sayAs',
  'originX', // the pivot is a picker plus numbers, and moving a pivot over time is rare
  'originY',
  'assetId', // swapped by the Replace image/video flow
  /^(fill|stroke\.paint)\.(from|to|center|radius)/, // gradient handles: dragged on the canvas while recording
  /^cornerRadii/, // keyed from the corner radii control
  'drawOrder',
  'solo.active',
];

describe('key buttons in the inspector', () => {
  const seen = new Set<string>();
  for (const [name, f] of Object.entries(fixtures)) {
    it(`${name} has them on its fields`, () => {
      mount(f.node());
      act(() => host.querySelectorAll<HTMLElement>('.section-title').forEach((b) => b.getAttribute('aria-expanded') === 'false' && b.click()));
      const got = keyed();
      for (const prop of f.has) expect(got, prop).toContain(prop);
      got.forEach((p) => seen.add(p));
    });
  }

  it('every animatable property is keyable somewhere, or listed as left out on purpose', () => {
    const missing = ANIMATABLE_PROPS.filter((a) => !/^(fills|strokes|constraints|modifiers)\.0\./.test(a.prop))
      .map((a) => a.prop)
      .filter((p) => !seen.has(p) && !LEFT_OUT.some((l) => (typeof l === 'string' ? l === p : l.test(p))));
    expect(missing).toEqual([]);
  });
});
