import { createNode, uid, type Artboard, type Blend, type SceneNode, type Timeline, type Variable } from 'interactives-player';

/**
 * A small working blend to learn from: a circle with two pose timelines (small and red, big and blue), a 0 to 1
 * number, a slider bound to it, and a 1D blend that starts with the artboard. Drag the slider in Preview.
 */
export function blendExample(ab: Artboard, taken: string[]): { nodes: SceneNode[]; timelines: Timeline[]; variable: Variable; blend: Blend } {
  const name = (base: string) => {
    let n = base;
    for (let i = 2; taken.includes(n); i++) n = `${base}${i}`;
    return n;
  };
  const variable: Variable = { id: uid('v'), name: name('mix'), type: 'number', initial: 0 };
  const cx = Math.round(ab.width / 2);
  const cy = Math.round(ab.height / 2);
  const ball = createNode('ellipse', { name: 'Blend ball', x: cx - 50, y: cy - 90, width: 100, height: 100 });
  const slider = createNode('input', { name: 'Blend slider', x: cx - 120, y: cy + 80, width: 240, height: 28, inputType: 'range', variableId: variable.id, min: 0, max: 1, step: 0.01, value: '0' } as Partial<SceneNode>);
  const pose = (label: string, size: number, color: string): Timeline => {
    const key = (value: number | string) => [
      { id: uid('k'), t: 0, value, ease: 'linear' as const },
      { id: uid('k'), t: 1000, value, ease: 'linear' as const },
    ];
    return {
      id: uid('tl'),
      name: `Example: ${label}`,
      duration: 1000,
      loop: 'loop',
      autoplay: false,
      speed: 1,
      tracks: [
        { id: uid('tr'), nodeId: ball.id, prop: 'scaleX', keys: key(size) },
        { id: uid('tr'), nodeId: ball.id, prop: 'scaleY', keys: key(size) },
        { id: uid('tr'), nodeId: ball.id, prop: 'fill.color', keys: key(color) },
      ],
    };
  };
  const small = pose('small and red', 0.6, '#e5484d');
  const big = pose('big and blue', 1.8, '#3b5bfd');
  const blend: Blend = {
    id: uid('bl'),
    name: 'Example blend',
    mode: '1d',
    variable: variable.id,
    autoplay: true,
    entries: [
      { timeline: small.id, value: 0 },
      { timeline: big.id, value: 1 },
    ],
  };
  return { nodes: [ball, slider], timelines: [small, big], variable, blend };
}
