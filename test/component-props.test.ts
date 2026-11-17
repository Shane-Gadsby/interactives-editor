//What a page says it takes when it's used as a component, and how an instance's fields come from it
import { describe, expect, it } from 'vitest';
import { createNode } from 'interactives-player';
import { createProject, type Project } from 'interactives-player';

const withComponent = (): Project => {
  const p = createProject();
  const card = createProject('card').artboards[0];
  card.id = 'abcard';
  card.name = 'Card';
  p.artboards.push(card);
  p.variables.push(
    { id: 'v1', name: 'title', label: 'Heading', type: 'string', initial: 'Hello' },
    { id: 'v2', name: 'level', type: 'number', initial: 1 },
    { id: 'v3', name: 'tone', type: 'string', initial: 'calm', options: ['calm', 'urgent'] },
  );
  card.props = [{ variable: 'v1', label: 'Card heading' }, { variable: 'v2', help: 'How far along' }, { variable: 'v3' }];
  p.artboards[0].children.push(createNode('instance', { id: 'card1', artboardId: 'abcard', inputs: { title: 'Mine' } }));
  return p;
};

describe('what a component takes', () => {
  it('keeps the declared order, and a prop points at a real variable', () => {
    const p = withComponent();
    const card = p.artboards.find((a) => a.id === 'abcard')!;
    expect(card.props!.map((x) => x.variable)).toEqual(['v1', 'v2', 'v3']);
    for (const pr of card.props!) expect(p.variables.some((v) => v.id === pr.variable)).toBe(true);
  });

  it('an instance sets them by the variable name, not its id', () => {
    const p = withComponent();
    const inst = p.artboards[0].children.find((c) => c.id === 'card1')! as { inputs?: Record<string, unknown> };
    //the field for v1 writes "title", because that is what the player hands the nested page
    expect(Object.keys(inst.inputs!)).toEqual(['title']);
    expect(inst.inputs!.title).toBe('Mine');
  });

  it('a label falls back to the variable label, then its name', () => {
    const p = withComponent();
    const card = p.artboards.find((a) => a.id === 'abcard')!;
    const name = (pr: { variable: string; label?: string }) => {
      const v = p.variables.find((x) => x.id === pr.variable)!;
      return pr.label || v.label || v.name;
    };
    expect(card.props!.map(name)).toEqual(['Card heading', 'level', 'tone']);
  });

  it('a page that declares nothing has no props at all, so the instance keeps its JSON box', () => {
    const p = createProject();
    expect(p.artboards[0].props).toBeUndefined();
  });
});
