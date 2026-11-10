/**
 * The controls a tutorial step can point at with Show me. Each one is a `data-tour="..."` attribute on the control in the editor
 * (or, for the panels, the hooks the dock already has), with a short name for the label and a line saying where it is, for when it
 * is not on screen (a folded tool group, a closed panel). Plain data, so tutorial modules can name a target without loading any UI.
 */
export interface TourTarget {
  /** What the ring's label says: the control by name. */
  label: string;
  /** Where to find it, said when it is not on screen. */
  where: string;
  /** The control's own selector, when it already has a good hook and there is no data-tour on it. */
  sel?: string;
}

const TOOLS = 'It is in the tool bar down the left edge of the editor.';
const WEB = 'It is in the Web group of the tool bar down the left edge. Click Web to open the group.';
const MEDIA = 'It is in the Media group of the tool bar down the left edge. Click Media to open the group.';
const BOTTOM = 'It is a tab in the panel along the bottom of the window. If you do not see it, More panels brings it back.';

export const TOUR = {
  'project-name': { label: 'The project name', where: 'The project name is in the bar at the top left of the editor.' },
  'tool-rect': { label: 'Rectangle tool (R)', where: TOOLS },
  'tool-ellipse': { label: 'Ellipse tool (O)', where: TOOLS },
  'tool-frame': { label: 'Frame tool (F)', where: TOOLS },
  'tool-text': { label: 'Text tool (T)', where: MEDIA },
  'tool-button': { label: 'Button tool (B)', where: WEB },
  'add-question': { label: 'Add question', where: WEB },
  'panel-layers': { label: 'The Layers panel', where: 'The Layers panel is on the left of the editor.', sel: '[data-panel="layers"]' },
  'panel-inspector': { label: 'The Properties panel', where: 'The Properties panel is on the right of the editor.', sel: '[data-panel="inspector"]' },
  'panel-timeline': { label: 'The Timeline tab', where: BOTTOM },
  'panel-logic': { label: 'The Interactions tab', where: BOTTOM },
  'panel-variables': { label: 'The Variables tab', where: BOTTOM },
  'timeline-new': { label: '+ New timeline', where: 'Open the Timeline tab (along the bottom) and press + New timeline.' },
  'timeline-play': { label: 'Play preview', where: 'Open the Timeline tab (along the bottom) and make a timeline. Play is in the bar above the tracks.' },
  'timeline-record': { label: 'Record', where: 'Open the Timeline tab (along the bottom) and make a timeline. The red Record button is in the bar above the tracks.' },
  'add-when-clicked': { label: '+ When clicked…', where: 'Select a layer, then scroll the Properties panel (on the right) to its Interactions section.' },
  'add-empty-click': { label: '+ On click (empty)', where: 'Select a layer, then scroll the Properties panel (on the right) to its Interactions section.' },
  'add-variable': { label: '+ Add variable', where: 'Open the Variables tab along the bottom of the window. The button is under the list.' },
  'add-page': { label: '+ Add page', where: 'It is at the bottom of the Layers panel, on the left of the editor.' },
  preview: { label: 'Preview', where: 'Preview is at the top right of the editor.' },
  export: { label: 'Export', where: 'Export is at the top right of the editor, beside Preview.' },
  share: { label: 'Share', where: 'Share is at the top right of the editor, beside Export.' },
} satisfies Record<string, TourTarget>;

export type TourId = keyof typeof TOUR;

export const tourTarget = (id: TourId): TourTarget => TOUR[id] as TourTarget;
/** The CSS selector that finds the control on the page. */
export const tourSelector = (id: TourId): string => tourTarget(id).sel ?? `[data-tour="${id}"]`;
