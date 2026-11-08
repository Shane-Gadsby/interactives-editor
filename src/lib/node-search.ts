/**
 * Finding a graph node by what it does. The palette's search box and the Add and connect menu both go through `rankNodes`, which is
 * the properties panel's scorer (`scoreEntry`: the label first, then synonyms, the topic, the summary; typos and half-remembered
 * letters count against labels and synonyms only) with a list of other names people know the nodes by.
 */
import { CATALOG, type NodeDef } from 'interactives-player';
import { rankEntries, suggest, type PropEntry } from './prop-search';

/** Other names for a node, by kind: what someone would type who doesn't know what it is called here. */
export const NODE_SYNONYMS: Record<string, string[]> = {
  'event.start': ['begin', 'load', 'open', 'show', 'first', 'init', 'initialise', 'page load'],
  'event.beforeLoad': ['preload', 'before load', 'setup', 'restore', 'resume'],
  'event.activityLoad': ['loaded', 'ready', 'once', 'first load'],
  'event.pointer': ['click', 'tap', 'press', 'touch', 'hover', 'mouse', 'button', 'drag', 'mouseover', 'pointer down'],
  'event.key': ['keyboard', 'shortcut', 'keypress', 'hotkey', 'arrow', 'enter', 'space', 'type'],
  'event.focus': ['tab', 'tab stop', 'focused', 'blur', 'keyboard focus'],
  'event.timer': ['timer', 'clock', 'countdown', 'interval', 'repeat', 'every', 'after', 'tick', 'delay'],
  'event.variable': ['watch', 'changed', 'state', 'when value'],
  'event.timelineEnd': ['finished', 'animation done', 'ends', 'complete'],
  'event.timelineMarker': ['cue', 'marker', 'label', 'passes'],
  'event.videoCue': ['cue point', 'chapter', 'video marker', 'captions'],
  'event.step': ['steps', 'next step', 'slides', 'stepper'],
  'event.message': ['receive', 'listen', 'postmessage', 'host', 'broadcast'],
  'event.scroll': ['scrolling', 'in view', 'visible', 'appears'],
  'event.dragStart': ['pick up', 'grab', 'lift', 'drag'],
  'event.dragMove': ['dragging', 'moving', 'drag'],
  'event.dragOver': ['hover zone', 'drop zone', 'enter zone', 'drag'],
  'event.drop': ['dropped', 'let go', 'release', 'drop zone', 'drag'],
  'event.dragEnd': ['let go', 'released', 'cancelled', 'drag'],
  'event.media': ['microphone', 'mic', 'camera', 'recording', 'photo', 'webcam', 'sensor'],
  'event.dataLoaded': ['fetch', 'loaded', 'api', 'csv', 'json', 'data source'],
  'action.timeline': ['animation', 'play', 'pause', 'stop', 'restart', 'timeline', 'reverse'],
  'action.blendPlay': ['mix', 'blend', 'combine animations', 'start blend'],
  'action.blendStop': ['stop mix', 'end blend'],
  'action.setVariable': ['var', 'variable', 'state', 'set', 'score', 'increment', 'counter', 'assign', 'add', 'toggle', 'list', 'push'],
  'action.resetVariables': ['reset', 'clear', 'restart', 'defaults', 'initial'],
  'action.setProperty': ['change', 'move', 'colour', 'color', 'opacity', 'size', 'position', 'style', 'property', 'text'],
  'action.animate': ['tween', 'ease', 'transition', 'move smoothly', 'fade', 'slide', 'grow', 'animation'],
  'action.visibility': ['show', 'hide', 'visible', 'toggle', 'reveal', 'appear', 'disappear'],
  'action.artboard': ['goto', 'go to', 'navigate', 'page', 'next page', 'previous', 'back', 'screen', 'slide', 'jump', 'link'],
  'action.url': ['link', 'website', 'open', 'browser', 'navigate', 'external'],
  'action.reportResult': ['score', 'grade', 'lms', 'complete', 'pass', 'fail', 'moodle', 'scorm', 'xapi'],
  'action.record': ['analytics', 'track', 'insights', 'log event', 'count'],
  'action.startOver': ['restart', 'reset', 'retry', 'again', 'new attempt'],
  'action.cursor': ['mouse', 'pointer', 'hand', 'cursor'],
  'action.saveUserData': ['save', 'remember', 'persist', 'store', 'progress'],
  'action.loadUserData': ['load', 'restore', 'resume', 'remember', 'progress'],
  'action.loadData': ['fetch', 'refresh', 'reload', 'api', 'csv', 'json', 'data source'],
  'action.clock': ['timer', 'clock', 'countdown', 'stopwatch', 'time limit', 'seconds'],
  'action.sound': ['sound', 'audio', 'music', 'play audio', 'mp3', 'effect', 'noise', 'loop'],
  'action.video': ['video', 'play video', 'pause video', 'seek', 'speed', 'frame'],
  'action.stopSound': ['silence', 'mute', 'stop audio', 'end loop'],
  'action.recordStart': ['microphone', 'mic', 'record', 'voice', 'audio', 'camera'],
  'action.listen': ['microphone', 'mic', 'level', 'volume', 'live', 'sound level'],
  'action.recordStop': ['stop', 'finish recording'],
  'action.recordPlay': ['play back', 'replay', 'listen'],
  'action.recordDiscard': ['delete', 'throw away', 'redo'],
  'action.recordDownload': ['save', 'export', 'file'],
  'action.cameraPreview': ['webcam', 'camera', 'live video', 'selfie'],
  'action.photo': ['picture', 'camera', 'image', 'upload', 'selfie', 'photograph'],
  'action.saveFile': ['download', 'export', 'csv', 'report', 'save', 'text file'],
  'action.sensorsOff': ['privacy', 'opt out', 'no microphone', 'no camera', 'consent'],
  'action.script': ['javascript', 'js', 'code', 'custom'],
  'action.code': ['javascript', 'js', 'script', 'inline', 'snippet', 'ix'],
  'action.emit': ['broadcast', 'message', 'post', 'tell', 'send', 'event'],
  'action.steps': ['step', 'next step', 'previous step', 'stepper', 'slides'],
  'action.captions': ['subtitles', 'transcript', 'mute', 'unmute', 'descriptions', 'larger text'],
  'action.announce': ['screen reader', 'aria', 'live region', 'accessibility', 'say'],
  'action.speak': ['read aloud', 'voice', 'text to speech', 'tts', 'say', 'speech', 'narrate'],
  'action.questionCheck': ['mark', 'submit', 'check', 'answer', 'quiz', 'correct', 'grade'],
  'action.questionReset': ['try again', 'retry', 'clear', 'restart question', 'quiz'],
  'action.questionHint': ['help', 'clue', 'quiz'],
  'action.questionChoose': ['select', 'pick', 'option', 'answer', 'quiz', 'radio'],
  'action.questionMove': ['order', 'reorder', 'up', 'down', 'sequence', 'quiz'],
  'action.questionDrop': ['categorise', 'sort', 'group', 'feedback', 'quiz'],
  'action.focus': ['keyboard focus', 'tab', 'blur', 'focus ring'],
  'action.dragPlace': ['snap', 'put', 'place', 'drop', 'zone'],
  'action.dragReset': ['put back', 'return', 'undo drag', 'start again'],
  'action.dragEnable': ['lock', 'unlock', 'disable drag', 'allow', 'freeze'],
  'action.setTheme': ['dark mode', 'light mode', 'colours', 'colors', 'high contrast', 'skin'],
  'action.instanceInput': ['component', 'instance', 'input', 'variable inside'],
  'action.instanceTrigger': ['component', 'instance', 'message', 'trigger'],
  'action.delay': ['wait', 'delay', 'pause', 'sleep', 'hold', 'timeout', 'later'],
  'action.waitBlendIn': ['wait', 'blend', 'hold'],
  'action.waitTimeline': ['wait', 'timeline', 'exit time', 'hold'],
  'action.log': ['console', 'debug', 'print', 'trace'],
  'logic.if': ['condition', 'branch', 'else', 'when', 'check', 'test', 'conditional', 'true', 'false', 'compare'],
  'logic.switch': ['alternate', 'flip', 'toggle', 'a b', 'ping pong', 'every other'],
  'logic.random': ['chance', 'dice', 'shuffle', 'pick one', 'probability', 'weighted'],
  'logic.once': ['first time', 'only once', 'one shot', 'single'],
  'logic.sequence': ['in order', 'then', 'steps', 'split', 'parallel', 'several'],
};

/** What the scorer reads for a node: its label, other names, topic and summary. */
export function nodeEntry(d: Pick<NodeDef, 'kind' | 'label' | 'summary' | 'group'>): PropEntry {
  return { key: d.kind, label: d.label, tip: d.summary, section: d.group, extra: NODE_SYNONYMS[d.kind], plain: true };
}

const entries = new Map<string, PropEntry>();
const entryOf = (d: NodeDef): PropEntry => {
  let e = entries.get(d.kind);
  if (!e) entries.set(d.kind, (e = nodeEntry(d)));
  return e;
};

/**
 * The nodes that match what was typed, best first. Nothing typed is every node in catalog order. A node stays when it scores at
 * least half of the best one, so an exact "wait" does not also bring in everything that mentions waiting in its summary.
 */
export const rankNodes = (query: string, defs: NodeDef[] = CATALOG): NodeDef[] => rankEntries(query, defs, entryOf);

/** The closest node name to what was typed, for "Did you mean" when nothing matches. */
export const suggestNode = (query: string, defs: NodeDef[] = CATALOG): string | null => suggest(query, defs.map(entryOf));
