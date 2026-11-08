//The node descriptions split into a summary and details: the inspector shows the summary and links to the reference, which has
//everything the old paragraph said.
import { describe, expect, it } from 'vitest';
import before from '../../interactives-player/test/fixtures/node-descriptions-before.json';
import { CATALOG } from 'interactives-player';
import { getTopic, topicBody } from '../src/help/topics';
import { slug } from '../src/help/markdown';
import { searchHelp } from '../src/help/search';

const SPLIT = /(?<=[.!?])\s+(?=[A-Z`"(])/;
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const reference = () => topicBody(getTopic('interaction-nodes')!);

describe('node reference', () => {
  it('has a heading for every node, so the inspector link lands on it', () => {
    const body = reference();
    const anchors = new Map<string, number>();
    for (const m of body.matchAll(/^### (.*)$/gm)) anchors.set(slug(m[1]), (anchors.get(slug(m[1])) ?? 0) + 1);
    for (const d of CATALOG) {
      expect(anchors.get(slug(d.label)), `${d.kind} (${d.label}) has no anchor in the node reference`).toBe(1);
    }
  });

  it('still says every sentence the old description said (the summary replaces the first, the details keep the rest)', () => {
    const body = flat(reference());
    for (const d of CATALOG) {
      const sentences = (before as Record<string, string>)[d.kind].split(SPLIT);
      for (const s of sentences.slice(1)) expect(body, `${d.kind} lost: ${s}`).toContain(flat(s));
      expect(body, d.kind).toContain(flat(d.summary));
    }
  });

  it('lists what an event gives, linked from the node by name', () => {
    const body = reference();
    expect(body).toContain('**Gives:** `event.key`, `event.code`');
  });

  it('is found by searching for what a node does', () => {
    const hits = searchHelp('runs when a key is pressed');
    expect(hits.some((h) => h.topic.id === 'interaction-nodes')).toBe(true);
  });
});
