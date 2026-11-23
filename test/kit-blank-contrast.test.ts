//A fill in the blank question's box takes the theme's colours, so it goes dark in Dark and High contrast and the words
//around it pass; a box made before that, still on the input's built-in light colours, is brought along
import { describe, expect, it } from 'vitest';
import { createNode, walk, type InputNode, type Project } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../src/lib/question-kit';
import { newProjectWithThemes } from '../src/lib/themes';
import { checkAccessibility } from '../src/lib/a11y/checks';

const boxes = (p: Project) => {
  const out: InputNode[] = [];
  walk(p.artboards[0].children, (n) => void (n.type === 'input' && out.push(n)));
  return out;
};

describe('a fill in the blank question in every theme', () => {
  it('passes the accessibility checker in Dark and High contrast', () => {
    const p = newProjectWithThemes();
    addQuestion(p, p.artboards[0].id, 'blank');
    const bad = checkAccessibility(p).findings.filter((f) => f.severity === 'issue' && /^In (Dark|High contrast):/.test(f.detail));
    expect(bad.map((f) => f.detail)).toEqual([]);
  });

  it('its box is in token colours', () => {
    const p = newProjectWithThemes();
    addQuestion(p, p.artboards[0].id, 'blank');
    const [box] = boxes(p);
    expect(box.fill?.type === 'solid' && box.fill.color).toMatch(/^token:/);
    expect(box.color).toMatch(/^token:/);
  });

  it('an older box on the built-in light colours takes the theme\'s when the question is next changed; one picked by hand stays', () => {
    const p = newProjectWithThemes();
    const frameId = addQuestion(p, p.artboards[0].id, 'blank')!;
    const plain = createNode('input') as InputNode;
    const [box] = boxes(p);
    box.fill = plain.fill;
    box.color = plain.color;
    setQuestionSettings(p, p.artboards[0].id, frameId, { feedbackCorrect: 'Yes!' } as never);
    expect(boxes(p)[0].fill?.type === 'solid' && (boxes(p)[0].fill as { color: string }).color).toMatch(/^token:/);
    expect(boxes(p)[0].color).toMatch(/^token:/);
    boxes(p)[0].color = '#123456';
    setQuestionSettings(p, p.artboards[0].id, frameId, { feedbackCorrect: 'Yes!!' } as never);
    expect(boxes(p)[0].color).toBe('#123456');
  });
});
