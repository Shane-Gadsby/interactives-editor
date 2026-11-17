//Frameling is parked (lib/parked.ts): nothing offers or mentions it, and a project that already has an animation layer
//keeps its nodes and its inspector
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  putAsset: async () => undefined,
}));

import { hasAnimationLayer, nodeKindParked, offeredNodes, parked } from '../src/lib/parked';
import { TOOL_GROUPS } from '../src/Editor';
import { COMMANDS } from '../src/lib/keymap';
import { insertFiles } from '../src/lib/insert';
import { getTopic, TOPICS, topicBody } from '../src/help/topics';
import { nodeHelp } from '../src/help/context';
import { filterPalette, NO_FILTER } from '../src/lib/graph-palette';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'interactives-player', 'test', 'fixtures', 'frameling');

let s: EditorStore;
beforeEach(() => {
  s = new EditorStore(createProject('T'));
  setCurrentStore(s);
});

describe('with Frameling parked', () => {
  it('is parked', () => {
    expect(parked.frameling).toBe(true);
  });

  it('has no tool on the rail and no row in the shortcuts', () => {
    expect(TOOL_GROUPS.flatMap((g) => g.tools)).not.toContain('animation');
    expect(COMMANDS.map((c) => c.name).join(' ')).not.toMatch(/frameling/i);
  });

  it('turns a dropped .flplay away, with nothing uploaded and no layer made', async () => {
    const toast = vi.spyOn(s, 'toast');
    const file = new File([new Uint8Array(readFileSync(path.join(fixtures, 'hero-sprite.flplay'))) as BlobPart], 'hero-sprite.flplay');
    const added = await insertFiles([file], s.get().project.artboards[0].id, { x: 10, y: 10 });
    expect(added).toHaveLength(0);
    expect(s.get().project.assets).toHaveLength(0);
    expect(s.get().project.artboards[0].children).toHaveLength(0);
    expect(toast.mock.calls[0][0]).toMatch(/aren't available at the moment/);
  });

  it('says nothing about it in the help', () => {
    expect(getTopic('frameling-animations')).toBeUndefined();
    for (const t of TOPICS) expect(`${t.title} ${t.summary} ${t.keywords ?? ''} ${topicBody(t)}`, t.id).not.toMatch(/frameling|flplay/i);
  });

  it('keeps the animation nodes out of the palette until the project has an animation layer', () => {
    const kinds = () => filterPalette(NO_FILTER, offeredNodes(s.get().project)).groups.flatMap((g) => g.defs.map((d) => d.kind));
    expect(kinds()).not.toContain('action.animationPlay');
    expect(kinds()).toContain('action.artboard');
    expect(nodeKindParked('event.animationEnd', s.get().project)).toBe(true);
    expect(nodeHelp('action.animationPlay')).toBeNull();
    //A project that already has one keeps them: it still has to be editable
    s.update((p) => {
      p.artboards[0].children.push(createNode('animation', { name: 'Hero' }));
    });
    expect(hasAnimationLayer(s.get().project)).toBe(true);
    expect(kinds()).toContain('action.animationPlay');
    expect(kinds()).toContain('event.animationMarker');
  });
});
