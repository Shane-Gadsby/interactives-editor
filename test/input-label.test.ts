//A new input arrives with a label: above the box, or beside a tick box, tied to it by labelId
import { describe, expect, it } from 'vitest';
import { createNode, createProject, type InputNode, type TextNode } from 'interactives-player';
import { withLabel } from '../src/lib/input-label';

describe('withLabel', () => {
  it('puts the label above the box, the box named by it', () => {
    const input = createNode('input', { x: 40, y: 100 } as never) as InputNode;
    const [label, box] = withLabel(createProject(), input) as [TextNode, InputNode];
    expect(label.type).toBe('text');
    expect(box.labelId).toBe(label.id);
    expect(label.x).toBe(40);
    expect(label.y + label.height).toBeLessThan(box.y);
    expect(box.y).toBe(100);
  });

  it('moves the box down when there is no room above it', () => {
    const input = createNode('input', { x: 0, y: 0 } as never) as InputNode;
    const [label, box] = withLabel(createProject(), input) as [TextNode, InputNode];
    expect(label.y).toBe(0);
    expect(box.y).toBeGreaterThan(label.height);
  });

  it('puts a tick box label beside it', () => {
    const input = createNode('input', { x: 10, y: 10, width: 24, height: 24, inputType: 'checkbox' } as never) as InputNode;
    const [label] = withLabel(createProject(), input) as [TextNode, InputNode];
    expect(label.x).toBeGreaterThan(34);
    expect(label.y).toBeLessThan(34);
  });
});
