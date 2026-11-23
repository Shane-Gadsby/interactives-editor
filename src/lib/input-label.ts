import { createNode, type InputNode, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { SPACE, TYPE } from './design-scale';
import { lookDefaults } from './themes';

/**
 * A new input with its label: a text layer above the box (beside it for a tick box), in the text colour at the size
 * every control's label takes, tied to the box (`labelId`) so a screen reader reads it as the box's name. The box keeps
 * where it was put unless the label would go off the top of the page, in which case both move down to make room.
 * Returns the label first, so it comes before the box in reading and tab order.
 */
export function withLabel(project: Project, input: InputNode, words = 'Label'): SceneNode[] {
  const font = input.fontFamily ? { fontFamily: input.fontFamily } : {};
  const lineH = Math.ceil(TYPE.body * 1.3);
  if (input.inputType === 'checkbox') {
    const label = createNode('text', {
      name: `${input.name} label`,
      text: words,
      x: input.x + input.width + SPACE.s,
      y: Math.round(input.y + (input.height - lineH) / 2),
      width: 200,
      height: lineH,
      autoSize: 'width',
      fontSize: TYPE.body,
      ...font,
      ...lookDefaults(project, 'text'),
    } as Partial<TextNode>) as TextNode;
    return [label, { ...input, labelId: label.id }];
  }
  const room = lineH + SPACE.s;
  const box = input.y < room ? { ...input, y: room } : input;
  const label = createNode('text', {
    name: `${input.name} label`,
    text: words,
    x: box.x,
    y: box.y - room,
    width: box.width,
    height: lineH,
    autoSize: 'height',
    fontSize: TYPE.body,
    fontWeight: 600,
    ...font,
    ...lookDefaults(project, 'text'),
  } as Partial<TextNode>) as TextNode;
  return [label, { ...box, labelId: label.id }];
}
