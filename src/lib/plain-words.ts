import { CATALOG_BY_KIND, type NodeDef, type ParamDef } from 'interactives-player';
import { prefs, usePrefs } from './prefs';

/**
 * Author wording. The catalog (and the file, and the MCP) keep the technical name of every node: "On pointer", "Set variable".
 * This is what the editor shows an author instead, in words for what happens: "When clicked or hovered", "Change a value or
 * counter". The technical name is never lost: it is the node's tooltip and its second name in every search, help names both,
 * and Preferences > Technical wording puts the technical names back on screen.
 *
 * Nothing here is saved in a project.
 */

/** The plain label of a node kind. A kind that is not here is already plain and shows its own label. */
export const PLAIN_NODE: Record<string, string> = {
  'event.start': 'When the page is shown',
  'event.activityLoad': 'When the activity has loaded',
  'event.pointer': 'When clicked or hovered',
  'event.key': 'When a key is pressed',
  'event.focus': 'When a layer is focused',
  'event.timer': 'When a timer goes off',
  'event.variable': 'When a value changes',
  'event.timelineEnd': 'When an animation finishes',
  'event.timelineMarker': 'When an animation reaches a marker',
  'event.videoCue': 'When a video reaches a cue point',
  'event.step': 'When the step changes',
  'event.message': 'When a message arrives',
  'event.scroll': 'When scrolled',
  'event.dragStart': 'When dragging starts',
  'event.dragMove': 'While dragging',
  'event.dragOver': 'When dragged over a drop zone',
  'event.drop': 'When dropped',
  'event.dragEnd': 'When dragging ends',
  'event.media': 'When the microphone or camera is used',
  'event.dataLoaded': 'When data has loaded',
  'action.timeline': 'Play or stop an animation',
  'action.blendPlay': 'Start a blend',
  'action.blendStop': 'Stop a blend',
  'action.setVariable': 'Change a value or counter',
  'action.resetVariables': 'Put values back to the start',
  'action.setProperty': "Change a layer's setting",
  'action.animate': "Animate a layer's setting",
  'action.visibility': 'Show or hide a layer',
  'action.artboard': 'Go to a page',
  'action.moveView': 'Move the view to a layer',
  'action.url': 'Open a web address',
  'action.credits': 'Show the credits',
  'action.cursor': 'Change the mouse pointer',
  'action.saveUserData': 'Save progress',
  'action.loadUserData': 'Load saved progress',
  'action.courseAdd': 'Add a stamp to the course passport',
  'action.courseLoad': 'Load the course passport',
  'action.courseCheck': 'Check the course passport',
  'action.setTheme': 'Switch the colour theme',
  'action.instanceInput': 'Give an embedded page a value',
  'action.instanceTrigger': 'Trigger something in an embedded page',
  'logic.if': 'Check a condition',
  'logic.switch': 'Alternate between two paths',
  'logic.once': 'Only the first time',
  'logic.sequence': 'Do these in order',
};

/** Plain wording for a node's choices, by `kind.param.value`. */
export const PLAIN_OPTION: Record<string, string> = {
  'action.setVariable.op.add': 'Add to it',
  'action.setVariable.op.toggle': 'Flip on or off',
  'action.setVariable.op.push': 'Add to the end of the list',
  'action.setVariable.op.remove': 'Remove from the list (by position)',
  'action.setVariable.op.toggleItem': 'Add to the list, or take out if it is there',
  'action.setVariable.op.removeValue': 'Remove from the list (by value)',
};

/** The query as typed and with artboard and page swapped, so each finds what is worded the other way. */
export function queryVariants(query: string): string[] {
  const out = [query];
  // swap each word once (a replacement is not itself swapped back)
  const swapped = query.replace(/\b(artboards|artboard|pages|page)\b/gi, (w) => {
    const l = w.toLowerCase();
    return l === 'artboards' ? 'pages' : l === 'artboard' ? 'page' : l === 'pages' ? 'artboards' : 'artboard';
  });
  if (swapped !== query) out.push(swapped);
  return out;
}

/** The wording the person asked for: plain (default) or the technical names. */
export const technicalWording = (): boolean => !!prefs().technicalWording;

/** The label to show for a node kind, now. */
export function nodeLabel(def: Pick<NodeDef, 'kind' | 'label'>, technical = technicalWording()): string {
  return technical ? def.label : (PLAIN_NODE[def.kind] ?? def.label);
}

/** The other name, when there is one: the technical name beside a plain one, the plain beside a technical one. */
export function nodeAka(def: Pick<NodeDef, 'kind' | 'label'>, technical = technicalWording()): string | null {
  const plain = PLAIN_NODE[def.kind];
  if (!plain || plain === def.label) return null;
  return technical ? plain : def.label;
}

/** A node's tooltip: what it does, and its other name. */
export function nodeTip(def: Pick<NodeDef, 'kind' | 'label' | 'summary'>, technical = technicalWording()): string {
  const aka = nodeAka(def, technical);
  return aka ? `${def.summary} (${technical ? 'Plain name' : 'Called'} "${aka}"${technical ? '' : ' in the file'})` : def.summary;
}

/** The label of one of a node's choices (the Do box of Change a value). */
export function optionLabel(kind: string, key: string, option: { value: string; label: string }, technical = technicalWording()): string {
  return technical ? option.label : (PLAIN_OPTION[`${kind}.${key}.${option.value}`] ?? option.label);
}

/** The heading a node has in the help's node reference: the plain name, then the technical one, so help finds either. */
export function nodeHeading(def: Pick<NodeDef, 'kind' | 'label'>): string {
  const plain = PLAIN_NODE[def.kind];
  return plain && plain !== def.label ? `${plain} (${def.label})` : def.label;
}

/** Re-renders a component when the wording preference changes, and gives the current setting. */
export function useTechnicalWording(): boolean {
  return !!usePrefs().technicalWording;
}

/** For a kind that may not be in the catalog (an old file): a label anyway. */
export function labelOfKind(kind: string): string {
  const def = CATALOG_BY_KIND[kind];
  return def ? nodeLabel(def) : kind;
}

/** Page for artboard in a piece of the catalog's own wording (a summary, a hint, a choice), unless the technical names are on. */
export function pw(text: string, technical = technicalWording()): string {
  if (technical || !text) return text;
  return text
    .replace(/\b([Aa])n artboard/g, (_, a: string) => `${a} page`)
    .replace(/\bartboards\b/g, 'pages')
    .replace(/\bArtboards\b/g, 'Pages')
    .replace(/\bartboard\b/g, 'page')
    .replace(/\bArtboard\b/g, 'Page');
}

/** A node's setting as the form shows it: its label, hint, placeholder and choices in plain wording. */
export function plainParam(kind: string, p: ParamDef, technical = technicalWording()): ParamDef {
  if (technical) return p;
  return {
    ...p,
    label: pw(p.label, false),
    help: p.help ? pw(p.help, false) : p.help,
    placeholder: p.placeholder ? pw(p.placeholder, false) : p.placeholder,
    options: p.options?.map((o) => ({
      ...o,
      label: pw(optionLabel(kind, p.key, o, false), false),
    })),
  };
}
