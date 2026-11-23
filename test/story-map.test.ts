//The story as a map: nodes for scenes, runs of lines, choices, ifs and endings, arrows between them, and edits from the map
import { describe, expect, it } from 'vitest';
import { chapterText, readChapter, type Story } from 'interactives-player';
import { SAMPLE_CHAPTER, linesOf } from '../src/lib/story';
import { insertAfter, joinTo, layoutMap, newSceneTitle, removeNode, storyMap } from '../src/lib/story-map';

const story = (text = SAMPLE_CHAPTER): Story => ({ chapters: [{ id: 'c1', name: 'Chapter 1', lines: linesOf(text) }, { id: 'c2', name: 'Chapter 2', lines: linesOf('Two.') }] });

describe('the map of a chapter', () => {
  it('has the scenes, the choice with a way out each, the if, and the endings, with arrows between', () => {
    const s = story();
    const { nodes, edges } = storyMap(s.chapters[0], s);
    expect(nodes.map((n) => [n.kind, n.title])).toEqual([
      ['lines', 'The club fair'],
      ['menu', 'Choice'],
      ['lines', 'Lines'],
      ['if', 'If'],
      ['lines', 'Lines'],
      ['lines', 'Signing up'],
      ['lines', 'Wandering the fair'],
      ['menu', 'Choice'],
      ['end', 'End: joined the club'],
      ['end', 'End: went home early'],
    ]);
    const menu = nodes[1];
    expect(menu.ports.map((p) => [p.label, p.jump])).toEqual([
      ['Join the writing club', 'Signing up'],
      ['Ask what they actually write (once)', undefined],
      ["Say you're still deciding", undefined],
    ]);
    const title = (id: string) => nodes.find((n) => n.id === id)?.title;
    const out = (n: number) => edges.filter((e) => e.from === nodes[n].id).map((e) => title(e.to));
    expect(out(1)).toEqual(['Signing up', 'Lines', 'Lines']);
    expect(out(0)).toEqual(['Choice']);
    expect(out(4)).toEqual(['Wandering the fair']);
    expect(nodes.every((n) => !n.unreached)).toBe(true);
    expect(nodes[0].preview[0]).toBe('The quad was crowded with folding tables and hand-painted signs.');
  });

  it('marks a scene nothing leads to, and says when a jump goes nowhere', () => {
    const s = story('Hi.\n-> end\n# Lonely\nNobody comes here.\n-> Nowhere');
    const { nodes } = storyMap(s.chapters[0], s);
    expect(nodes.find((n) => n.title === 'Lonely')?.unreached).toBe(true);
    expect(nodes.some((n) => n.title === 'Missing: nowhere')).toBe(true);
  });

  it('runs on into the next chapter', () => {
    const s = story('Just this.');
    const { nodes, edges } = storyMap(s.chapters[0], s);
    expect(nodes.map((n) => n.title)).toEqual(['Start', 'Chapter: Chapter 2']);
    expect(edges).toHaveLength(1);
  });

  it('lays nodes out left to right by steps from the start, keeping ones that were placed', () => {
    const s = story();
    const { nodes, edges } = storyMap(s.chapters[0], s);
    const pos = layoutMap(nodes, edges, { [nodes[2].id]: { x: 9, y: 9 } });
    expect(pos.get(nodes[0].id)).toEqual({ x: 0, y: 0 });
    expect(pos.get(nodes[1].id)!.x).toBeGreaterThan(0);
    expect(pos.get(nodes[2].id)).toEqual({ x: 9, y: 9 });
  });
});

describe('editing from the map', () => {
  it('joins a choice to a scene, replacing the jump it had, and the script still reads', () => {
    const s = story();
    const ch = s.chapters[0];
    const { nodes } = storyMap(ch, s);
    const menu = nodes[1];
    let lines = joinTo(ch.lines, menu, menu.ports[1].line, 'Wandering the fair');
    lines = joinTo(lines, storyMap({ ...ch, lines }, s).nodes[1], menu.ports[0].line, 'Wandering the fair');
    const text = chapterText({ ...ch, lines });
    expect(text).toContain("    Millie: {pause}We don't talk about it.\n    -> Wandering the fair");
    expect(text).toContain('Sign here. And here.\n    -> Wandering the fair');
    expect(text).not.toContain('-> Signing up');
    expect(readChapter({ ...ch, lines }).problems).toEqual([]);
    //unchanged lines keep their ids
    expect(lines[0].id).toBe(ch.lines[0].id);
  });

  it('joins a run of lines, adds a scene and removes a node', () => {
    const s = story('# One\nHello.\n# Two\nThere.');
    const ch = s.chapters[0];
    const { nodes } = storyMap(ch, s);
    let lines = joinTo(ch.lines, nodes[0], undefined, 'Two');
    expect(chapterText({ ...ch, lines })).toBe('# One\nHello.\n-> Two\n# Two\nThere.');
    lines = joinTo(lines, storyMap({ ...ch, lines }, s).nodes[0], undefined, 'end');
    expect(chapterText({ ...ch, lines })).toBe('# One\nHello.\n-> end\n# Two\nThere.');
    const title = newSceneTitle(lines);
    lines = insertAfter(lines, null, ['', `# ${title}`, 'Something happens.']);
    expect(chapterText({ ...ch, lines })).toContain('# New scene\nSomething happens.');
    const two = storyMap({ ...ch, lines }, s).nodes.find((n) => n.title === 'Two')!;
    lines = removeNode(lines, two);
    expect(chapterText({ ...ch, lines })).toBe('# One\nHello.\n-> end\n# New scene\nSomething happens.');
  });
});
