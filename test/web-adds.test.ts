// @vitest-environment jsdom
//The ready-made Web tools: Tooltip, Modal, Confirmation, Prompt, Tabs and Accordion each have a button of their own
import { describe, expect, it } from 'vitest';
import { Icons } from '../src/components/icons';
import { DIALOG_KINDS } from '../src/lib/dialog-kit';
import { WEB_ADDS } from '../src/Editor';

describe('the ready-made Web tools', () => {
  it('are six, named as asked, in the order they sit', () => {
    expect(WEB_ADDS.map((w) => w.label)).toEqual(['Tooltip', 'Modal', 'Confirmation', 'Prompt', 'Tabs', 'Accordion']);
  });

  it('each has a key and an icon of its own, so they can be told apart and reordered', () => {
    expect(new Set(WEB_ADDS.map((w) => w.key)).size).toBe(WEB_ADDS.length);
    expect(new Set(WEB_ADDS.map((w) => w.icon)).size).toBe(WEB_ADDS.length);
    for (const w of WEB_ADDS) expect(Icons[w.icon], w.icon).toBeTypeOf('function');
  });

  it('every overlay kind the kit makes has a button, and each button makes one thing', () => {
    expect(WEB_ADDS.filter((w) => w.overlay).map((w) => w.overlay)).toEqual(DIALOG_KINDS.map((k) => k.value));
    for (const w of WEB_ADDS) expect(Boolean(w.overlay) !== Boolean(w.onPage), w.key).toBe(true);
  });
});
