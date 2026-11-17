/**
 * The Questions batch of Build it examples mark the way their tutorials say: the near answers and the pattern of the fill in the
 * blanks, the extra term of the matching, the groups of the sort, part marks for the order, and the label slots sitting on the
 * diagram. Built from the modules, so a change to a module is checked before the example is written out again.
 */
import { describe, expect, it } from 'vitest';
import { gradeBlanks, gradeCategorise, gradeMatching, gradeOrdering, walk, type FrameNode, type Project, type Question, type SceneNode } from 'interactives-player';
import { example as blanks } from '../scripts/tutorial-examples/blanks';
import { example as dragMatch } from '../scripts/tutorial-examples/drag-match';
import { example as sort } from '../scripts/tutorial-examples/sort';
import { example as order } from '../scripts/tutorial-examples/order';
import { example as label } from '../scripts/tutorial-examples/label';

const questionOf = (p: Project): { frame: FrameNode; q: Question } => {
  const frame = p.artboards[0].children.find((n) => n.type === 'frame' && n.question) as FrameNode;
  return { frame, q: frame.question! };
};

describe('Questions tutorial examples', () => {
  it('blanks: alternatives, a near number, the pattern and a case that counts', () => {
    const { q } = questionOf(blanks.build());
    expect(gradeBlanks(q, ['pacific ocean', '8', 'Carbon  Dioxide', 'Na']).correct).toBe(true);
    expect(gradeBlanks(q, ['The Pacific', '8.7', 'co2', 'Na']).correct).toBe(true);
    const g = gradeBlanks(q, ['Atlantic', '10', 'oxygen', 'NA']);
    expect(Object.values(g.states)).toEqual(['wrong', 'wrong', 'wrong', 'wrong']);
    expect(gradeBlanks(q, ['Pacific', '8', 'oxygen', 'na']).fraction).toBe(0.5);
  });

  it('drag-match: the extra term belongs in no slot', () => {
    const { q } = questionOf(dragMatch.build());
    const right = Object.fromEntries(q.pairs.map((p) => [p.id, p.id]));
    expect(gradeMatching(q, right).correct).toBe(true);
    expect(gradeMatching(q, { ...right, x1: 'p1', p1: null }).correct).toBe(false);
  });

  it('sort: every item in its own group, part marks otherwise, a drop flow per group', () => {
    const p = sort.build();
    const { q } = questionOf(p);
    const right = Object.fromEntries(q.cards!.map((c) => [c.id, c.group]));
    expect(gradeCategorise(q, right).correct).toBe(true);
    expect(gradeCategorise(q, { ...right, c5: 'g2', c6: 'g1' }).fraction).toBeCloseTo(4 / 6);
    expect(p.artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionDrop')).toHaveLength(2);
  });

  it('order: the list is the right order, and part marks count the steps in place', () => {
    const { q } = questionOf(order.build());
    const ids = q.options.map((o) => o.id);
    expect(gradeOrdering(q, ids).correct).toBe(true);
    expect(gradeOrdering(q, [ids[1], ids[0], ...ids.slice(2)]).fraction).toBeCloseTo(4 / 6);
  });

  it('label: the diagram is behind the slots, every slot is on it, and the spots are named for screen readers', () => {
    const { frame, q } = questionOf(label.build());
    let matches: FrameNode | undefined;
    walk(frame.children, (n: SceneNode) => void (n.questionPart === 'matches' && (matches = n as FrameNode)));
    expect(matches!.layout).toBeNull();
    expect(matches!.children[0].name).toBe('Diagram');
    expect(matches!.children[0].ariaLabel).toBeTruthy();
    for (const row of matches!.children.slice(1)) {
      expect(row.x + row.width).toBeLessThanOrEqual(matches!.width);
      expect(row.y + 52).toBeLessThanOrEqual(matches!.height);
    }
    const zones: SceneNode[] = [];
    walk(frame.children, (n: SceneNode) => void (n.dropZone && zones.push(n)));
    expect(zones.map((z) => z.dropZone!.label)).toEqual(q.pairs.map((p) => p.match));
  });
});
