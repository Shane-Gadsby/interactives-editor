import { createNode, uid, type Artboard, type Blend, type SceneNode, type Timeline, type Variable } from 'interactives-player';

/**
 * A small working blend to learn from: a circle with two pose timelines (small and red, big and blue), a 0 to 1
 * number, a slider bound to it, and a 1D blend that starts with the artboard. The slider is labelled on the artboard
 * ("Drag me: blend weight", the two ends, and the live value) so there is no doubt what to drag in Preview.
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
  const slider = createNode('input', { name: 'Blend slider', x: cx - 160, y: cy + 78, width: 320, height: 32, inputType: 'range', variableId: variable.id, min: 0, max: 1, step: 0.01, value: '0' } as Partial<SceneNode>);
  const label = (nameText: string, text: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
    createNode('text', { name: nameText, text, x, y, width, height: 24, fontSize: 16, color: '#344054', align: 'center', ...extra } as Partial<SceneNode>);
  const tw = Math.min(600, ab.width - 32);
  const labels = [
    label('Blend title', 'Blend example', cx - tw / 2, Math.max(16, cy - 250), tw, { fontSize: 30, fontWeight: 700, color: '#101828', height: 40 }),
    label('Blend hint', 'Drag the slider below: the ball mixes between two timelines', cx - tw / 2, Math.max(56, cy - 206), tw, { fontSize: 16, color: '#667085' }),
    label('Blend slider caption', 'Drag me: blend weight', cx - 160, cy + 46, 320, { fontWeight: 700, fontSize: 18, color: '#3b5bfd' }),
    label('Blend slider low', '0 = small and red', cx - 160, cy + 116, 150, { align: 'left', fontSize: 13, color: '#667085' }),
    label('Blend slider high', '1 = big and blue', cx + 10, cy + 116, 150, { align: 'right', fontSize: 13, color: '#667085' }),
    label('Blend value', `${variable.name} = {${variable.name}}`, cx - 100, cy + 146, 200, { fontSize: 14, color: '#344054' }),
  ];
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
  return { nodes: [ball, slider, ...labels], timelines: [small, big], variable, blend };
}
