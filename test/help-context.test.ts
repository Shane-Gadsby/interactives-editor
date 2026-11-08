import { describe, expect, it } from 'vitest';
import { CATALOG } from 'interactives-player';
import { ARTBOARD_HELP, GENERAL_HELP, GRAPH_GROUP_HELP, LAYER_HELP, MANY_LAYERS_HELP, MASTER_HELP, PROP_HELP, TIMELINE_KEY_HELP, TOOL_HELP, helpTooltip, nodeHelp, resolveHelp, type HelpFocus, type HelpTarget } from '../src/help/context';
import { TOPICS, getTopic, topicBody } from '../src/help/topics';
import { slug } from '../src/help/markdown';
import { panelHelpTopic } from '../src/components/Dock';
import { ALL_PANELS } from '../src/lib/dock';
import { TOOL_GROUPS } from '../src/Editor';
import { sectionTags } from './helpers/sections-scan';

const anchorsOf = (id: string) => new Set([...topicBody(getTopic(id)!).matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])));
/** Why a "topic#anchor" doesn't resolve, or null when it does. */
function problem(to: string): string | null {
  const [id, anchor] = to.split('#');
  if (!getTopic(id)) return `no topic ${id}`;
  if (anchor && !anchorsOf(id).has(anchor)) return `${id} has no heading #${anchor}`;
  return null;
}

describe('the help mapping covers everything', () => {
  it('every layer type maps to a topic and anchor that exist', () => {
    for (const [type, t] of Object.entries(LAYER_HELP)) expect(problem(t.to), type).toBeNull();
    //the keys are the layer types the player knows (the format's union), so a new one is a compile error here too
    expect(Object.keys(LAYER_HELP).sort()).toEqual(['bone', 'button', 'chart', 'connector', 'draw', 'ellipse', 'embed', 'frame', 'group', 'image', 'input', 'instance', 'link', 'path', 'polygon', 'progress', 'rect', 'shader', 'star', 'text', 'video']);
  });
  it('every tool maps to a topic and anchor that exist, including the ones in the rail groups', () => {
    for (const [tool, t] of Object.entries(TOOL_HELP)) expect(problem(t.to), tool).toBeNull();
    for (const tool of ['select', 'hand', 'comment', 'note', ...TOOL_GROUPS.flatMap((g) => g.tools), 'image']) expect(TOOL_HELP[tool as keyof typeof TOOL_HELP], tool).toBeTruthy();
  });
  it('every interaction node kind has its entry in the node reference', () => {
    expect(CATALOG.length).toBeGreaterThan(40);
    for (const d of CATALOG) {
      const t = nodeHelp(d.kind);
      expect(t, d.kind).toBeTruthy();
      expect(problem(t!.to), d.kind).toBeNull();
    }
    expect(nodeHelp('no-such-kind')).toBeNull();
  });
  it('every panel has a topic that exists', () => {
    for (const p of ALL_PANELS) expect(problem(panelHelpTopic(p)), p).toBeNull();
  });
  it('every inspector section names its help, and it exists', () => {
    const tags = sectionTags();
    const none = tags.filter((t) => !t.help && !t.helpExpr).map((t) => `${t.file}:${t.line}`);
    expect(none).toEqual([]);
    for (const t of tags) {
      const named = t.help ? [t.help] : [...t.tag.matchAll(/help=\{[^}]*\}/g)].flatMap((m) => [...m[0].matchAll(/'([^']+)'/g)].map((x) => x[1]));
      for (const to of named) expect(problem(to), `${t.file}:${t.line}`).toBeNull();
    }
  });
  it('the fixed targets and field overrides exist', () => {
    for (const t of [...Object.values(PROP_HELP), TIMELINE_KEY_HELP, GRAPH_GROUP_HELP, ARTBOARD_HELP, MASTER_HELP, MANY_LAYERS_HELP, GENERAL_HELP]) expect(problem(t.to), t.label).toBeNull();
  });
  it('has no two topics with the same id', () => expect(new Set(TOPICS.map((t) => t.id)).size).toBe(TOPICS.length));
});

describe('what the Help button picks', () => {
  const base: HelpFocus = { panel: null, layerTypes: [], tool: 'select' };
  const pick = (f: Partial<HelpFocus>): HelpTarget => resolveHelp({ ...base, ...f });

  it('is general help when nothing is highlighted', () => expect(pick({})).toBe(GENERAL_HELP));
  it('names the panel last worked in', () => {
    const t = pick({ panel: { id: 'assets', help: 'assets', label: 'Assets' } });
    expect(t).toEqual({ to: 'assets', label: 'Assets panel' });
  });
  it('prefers the selected layer type over the panel', () => {
    expect(pick({ layerTypes: ['chart'], panel: { id: 'inspector', help: 'properties-panel', label: 'Properties' } })).toBe(LAYER_HELP.chart);
    expect(pick({ layerTypes: ['rect', 'rect'] })).toBe(LAYER_HELP.rect);
    expect(pick({ layerTypes: ['rect', 'text'] })).toBe(MANY_LAYERS_HELP);
  });
  it('prefers the focused field, by its section (or by its own entry)', () => {
    const inspector = { id: 'inspector', help: 'properties-panel', label: 'Properties' };
    expect(pick({ layerTypes: ['chart'], panel: inspector, field: { prop: 'gap', label: 'gap', sectionHelp: 'auto-layout', sectionTitle: 'Auto layout' } })).toEqual({ to: 'auto-layout', label: 'Auto layout' });
    expect(pick({ layerTypes: ['rect'], panel: inspector, field: { prop: 'trim', label: 'trim', sectionHelp: 'fill-stroke', sectionTitle: 'Fill' } })).toBe(PROP_HELP.trim);
  });
  it('uses the selected graph node while working in Interactions, and the layer otherwise', () => {
    const logic = { id: 'logic', help: 'interactions', label: 'Interactions' };
    const kind = CATALOG[0].kind;
    expect(pick({ layerTypes: ['rect'], graphKind: kind, panel: logic })).toEqual(nodeHelp(kind));
    expect(pick({ layerTypes: ['rect'], graphKind: kind, panel: null })).toBe(LAYER_HELP.rect);
    expect(pick({ graphKind: 'group', panel: logic })).toBe(GRAPH_GROUP_HELP);
  });
  it('uses a selected keyframe while working in the Timeline', () => {
    expect(pick({ layerTypes: ['rect'], keysSelected: true, panel: { id: 'timeline', help: 'timelines', label: 'Timeline' } })).toBe(TIMELINE_KEY_HELP);
  });
  it('uses the active tool after the rail, but not Select or Hand', () => {
    expect(pick({ tool: 'chart', layerTypes: ['rect'] })).toBe(TOOL_HELP.chart);
    expect(pick({ tool: 'hand', layerTypes: ['rect'] })).toBe(LAYER_HELP.rect);
    //working in a panel, the tool you left selected doesn't win over the panel's own selection
    expect(pick({ tool: 'chart', layerTypes: ['rect'], panel: { id: 'layers', help: 'layers-panel', label: 'Layers' } })).toBe(LAYER_HELP.rect);
  });
  it('names a selected artboard or master', () => {
    expect(pick({ artboard: 'artboard' })).toBe(ARTBOARD_HELP);
    expect(pick({ artboard: 'master' })).toBe(MASTER_HELP);
  });
  it('says what it will open in the tooltip', () => {
    expect(helpTooltip(LAYER_HELP.chart)).toContain('Help: Chart layer');
    expect(helpTooltip(GENERAL_HELP)).toMatch(/^Help \(/);
  });
});
