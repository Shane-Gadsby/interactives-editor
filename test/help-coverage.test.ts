import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import '../src/help/branded-help';
import { getTopic, topicBody } from '../src/help/topics';

/**
 * Every feature the CHANGELOG lists under "Unreleased: Symposium 3" has to be explained somewhere in the help. The table maps
 * each entry's heading (its bold lead, or its first four words when it has none) to the topic that covers it and a phrase that
 * topic must contain. When a new entry lands in the CHANGELOG, add a row here and write the help for it in the same change.
 * A heading that appears twice is listed once and every place it is covered is a row of its own.
 */
const COVERED: Record<string, [topic: string, phrase: string][]> = {
  Rooms: [['rooms', 'A class chat in a few steps'], ['rooms', 'Moderating a room'], ['interactions', 'Send a message to a room'], ['data-sources', '+ Room']],
  'Ask the Activity Designer': [['activity-designer', 'builds it in your open project'], ['activity-designer', 'Undo what the Activity Designer did'], ['activity-designer', 'reached its hourly limit']],
  'Live shared responses': [['shared-responses', 'updates live'], ['shared-responses', 'the backup']],
  'Describe it': [['interactions', 'Describe it in words'], ['command-palette', 'Describe it']],
  'Apply the UniSQ look': [['themes', 'Apply the UniSQ look'], ['themes', 'A project that did not start from a pack'], ['project-settings', 'UniSQ look'], ['tutorial-brand', 'The look in one step']],
  'Every tutorial is guided': [['help', 'Every **Getting started** and **Build it** tutorial']],
  'Buttons on page masters': [['page-master', 'Buttons and clicks on a master'], ['page-master', 'Edit the master'], ['page-navigation', 'Add to this master'], ['concept-pages-masters', 'From the page master']],
  'Lists as tables': [['repeaters', 'Type my own items'], ['variables', 'JSON text']],
  'Picking in a repeater': [['repeaters', 'Selection'], ['repeaters', 'isSelected'], ['concept-repeaters', 'Selection']],
  'Duplicate with what it does': [['interactions', 'Copying a layer with what it does'], ['interactions', 'Duplicate layer only']],
  'Variables in your own words': [['variables', 'Naming a variable'], ['variables', 'Name in formulas']],
  'Drag a value onto the page': [['variables', 'Show a variable on the page'], ['text', 'Drag a value onto the page'], ['data-sources', 'Show a field on the page']],
  'Read changes aloud': [['accessibility', 'Read changes aloud']],
  'Say it': [['accessibility', 'Say it']],
  'When all of these are done': [['interactions', 'all of these are done'], ['interactions', 'Count what has been done'], ['interactions', 'Counting what is done']],
  'Guided tutorials': [['help', 'Show me'], ['help', 'ticks itself'], ['help', 'guided']],
  'More in + When clicked…': [['interactions', 'Show only one of a set'], ['interactions', 'Put values back to the start'], ['interactions', '+ then also']],
  'More ways to start': [['interactions', 'It starts when'], ['concept-only-if', '+ otherwise']],
  'Next and previous without formulas': [['variables', 'Next and previous in a range']],
  'Counting and adding up lists without code': [['expressions', 'count(list, field, value)'], ['expressions', 'positions(list, field, value)'], ['expressions', 'pluck(list, field)'], ['variables', 'Change list items where a field is a value']],
  'Insert value': [['text', 'Insert value']],
  'Pick a calculation': [['expressions', 'Calculations without typing'], ['expressions', 'Pick a calculation']],
  'By value': [['bindings', 'By value']],
  'Question looks': [['question-kit', 'Looks']],
  'Question blocks in the graph': [['interactions', 'Question blocks']],
  'See what a binding sets': [['bindings', 'link mark after its label'], ['concept-variables-data-bindings', 'Set by a data binding']],
  'Master layers on the canvas': [['page-master', 'From page master'], ['concept-pages-masters', 'From page master']],
  'Timeline clashes': [['timelines', 'When two timelines animate the same thing'], ['concept-timelines', 'Also animated by']],
  'More fixes': [['themes', 'page backgrounds, fills, strokes, text and shadows']],
  'A link instead of a file': [['export', 'Want a link instead of a file?'], ['concept-share-export', 'Want a link instead of a file?']],
  'Tutorials on the projects page': [['projects', 'Tutorials']],
  'Tutorial badges': [['help', 'Tutorials, badges and progress'], ['help', 'I have done all of this']],
  'Tutorial preferences': [['preferences', 'Tutorial badges and cheers'], ['preferences', 'Soft chime with the cheers'], ['preferences', 'Reset tutorial progress']],
  'Drag to put things in order': [['question-kit', 'by dragging an item to its place']],
  'Less motion in Preview': [['interface', '**Less motion** plays it'], ['concept-reduced-motion', 'press **Less motion**']],
  'Feedback for each blank': [['question-kit', 'Feedback if wrong'], ['question-kit', '**Shown as** appears']],
  'Polls keep their shape': [['shared-responses', 'Poll options']],
  'More one-click behaviours': [['interactions', 'Turn the sound off or on'], ['interactions', 'Jump a video to a time'], ['interactions', 'Run a script']],
  'Shared with instances': [['variables', 'Shared with instances']],
  'New projects respect reduced motion': [['links-cursors', 'It is on in a new project']],
  Fixes: [['page-master', 'progress bars, groups and frames only'], ['page-master', 'keeps its slot text'], ['concept-auto-layout', 'greyed out for a child the layout places'], ['concept-coordinates', "the group's X changed instead"], ['tutorial-sort', 'take the new names too']],
  'Guides, reworked': [['canvas', 'one endless dashed line'], ['canvas', 'Attach new guides to the page'], ['canvas', 'Rounding while you drag'], ['shortcuts', 'Keys you hold while dragging']],
  'Credits on every starter': [['attributions', 'A Credits button of your own'], ['branded-starters', 'button in a corner']],
  'Smaller saves and a faster first load': [['interface', 'sent squeezed']],
  'Shorter Inspector wording': [['properties-panel', 'More about']],
  'Preferences, redesigned': [['preferences', 'Reset this page']],
  'Keyboard sets': [['shortcuts', 'Illustration style']],
  'Reorder the Properties panel and tool bar': [['properties-panel', 'Moving sections'], ['interface', 'Move … up']],
  'A key for everything': [['shortcuts', 'Only ones with a key']],
  'Fit page to selection': [['artboards', 'Fit page to selection']],
  'Small fixes from the docs pass': [['layers-panel', 'Fit page to selection with space around'], ['timelines', 'scrolls by itself'], ['interface', 'follows the window']],
  'Swap text stays with its text key': [['timelines', 'Keep the dip with this text key']],
  'Fixed: messages with an Undo button stayed on screen': [['dialogs', 'Messages at the bottom']],
  'Always show the Alt-drag hint': [['preferences', 'Alt: drag a copy']],
  'See what you just added': [['interactions', 'Show new interactions in the graph']],
  'Keyboard shortcuts you can change': [['shortcuts', 'Set key']],
  'Timeline keys': [['timelines', 'Keys on the keyboard']],
  'Safer Delete': [['layers-panel', 'Deleting'], ['shortcuts', 'Safer Delete']],
  'Changed keys': [['shortcuts', 'Help for the selection is'], ['shortcuts', 'Changed keys']],
  'Text changes on the timeline': [['timelines', 'Swap text']],
  'Blends': [['blends', 'Transition']],
  'Change a value or counter over time': [['variables', 'Easing']],
  'Layers: Shift-click a range': [['layers-panel', 'Shift-click a range']],
  'Alt-drag copies more': [['layers-panel', 'Copying with Alt']],
  'Components, from where you want them': [['instances', 'Insert component here']],
  'Timeline: the list of timelines': [['timelines', 'Nothing plays it']],
  'Timeline: Sound and captions fold': [['timelines', 'Sound and captions']],
  'Data files open in a Form': [['data-sources', 'Form']],
  'Voice for the word: Play': [['question-kit', 'Voice for the word']],
  'Voice for the word: keep or discard a recording': [['question-kit', 'Use this recording']],
  'Code editor colours': [['scripts', 'Code colours']],
  'Edit data files in the editor': [['data-sources', 'Editing a data file']],
  'Page changes': [['links-cursors', 'How the page changes']],
  'Question cards': [['question-kit', 'Submit answer']],
  'Page change speed': [['links-cursors', 'Speed']],
  'More page transitions': [['links-cursors', 'iris']],
  'Soundtrack music': [['captions', 'Soundtrack']],
  'Depth (parallax)': [['fill-stroke', 'Depth']],
  'Move the view to a layer': [['moving-the-view', 'Move the view to a layer']],
  'Fill in this starter': [['fill-in-starter', 'Fill in']],
  'Sharing made simple': [['export', 'Where will people use it']],
  'Paste questions from Word or Excel': [['paste-questions', 'Not understood']],
  'Plain words': [['preferences', 'Technical wording']],
  'Starters, tidier still': [['branded-starters', 'Keep the learner\'s map']],
  'Interactions without the graph': [['interactions', 'Read as sentences']],
  'A gentler start': [['welcome', 'Essentials']],
  'See what ran': [['interactions', 'See what ran']],
  'Shared responses': [['shared-responses', 'Everyone in this class']],
  'Course collections': [['course-collections', 'course passport']],
  'Every starter\'s graphs are annotated': [['notes', 'Notes in starters and examples']],
  'Graph notes in the starters': [['branded-starters', 'Word colour']],
  'F1 searches the help again': [['help', 'F1']],
  'Connectors': [['connectors', 'elbow']],
  'Mind map and Flowchart starters': [['branded-starters', 'Flowchart']],
  'Small buttons': [['web-elements', 'Small buttons']],
  'Keyboard focus you can always see': [['accessibility', 'focus ring']],
  'Interactions panel': [['interactions', 'artboard picker']],
  'Starters, refined': [['branded-starters', 'Offer a Hint']],
  'Help that knows where you are': [['help', 'Back']],
  'New starters': [['branded-starters', 'Word cloud']],
  'Snapping menu': [['grid', 'path points']],
  'Download a file works in any project': [['sensors', 'Download as a file']],
  'Canvas fixes': [['artboards', 'Tidy up']],
  'Media and practice starters rebuilt': [['branded-starters', 'Sign practice']],
  'Fixes from the sweep': [['charts', 'hide a value']],
  'Games, story and writing starters rebuilt': [['branded-starters', 'Word search']],
  'Assessment starters rebuilt': [['question-kit', 'Review the missed ones']],
  'Drag and explore starters rebuilt': [['branded-starters', 'categorise']],
  'Examples, tidied': [['templates', 'note']],
  'Starters, part 1': [['branded-starters', 'Essay']],
  'Spelling tests': [['question-kit', 'Spell checkers and writing tools']],
  'Properties search': [['properties-panel', 'search box']],
  'Notes': [['notes', 'Pick the **Note** tool']],
  'Page masters': [['page-master', 'slots']],
  'Progress bars and charts': [['charts', 'donut']],
  'Grid': [['grid', 'Show grid']],
  'Media Catalogue': [['media-catalogue', 'Media Catalogue']],
  'Questions and dragging': [['question-kit', 'extra terms']],
  'Pages and events': [['interactions', 'Only if']],
  'Accessibility': [['accessibility', 'Pressed']],
  'Live variables': [['variables', 'Keep up to date']],
  'Video and sound': [['images-media', 'cue']],
  'Sign practice': [['branded-starters', 'Sign practice']],
  'Themes that change nothing say why': [['themes', 'Link colours to tokens']],
  'Fonts served from our own server': [['text', 'No flash of the wrong font']],
  'Several artboards at once': [['artboards', 'Group artboards']],
  'Ctrl/Cmd+click in the interaction graph': [['interactions', 'Ctrl']],
  'Embed code': [['export', 'Embed code']],
  'Preview keeps Save user data and remembered progress': [['results', 'Forget saved data']],
  'Polish': [['interface', 'Left panel']],
  'Spelling test voice': [['question-kit', 'Voice for the word']],
  'Canvas: Ctrl/Cmd+click adds a': [['canvas', 'Ctrl']],
  'Fit text to box': [['text', 'Fit text to box']],
  'Expression suggestions as you type': [['expressions', 'Suggestions as you type']],
  'Starters open laid out': [['artboards', 'Tidy up']],
  'Help, in plain words': [['help', 'More about']],
  'Brand-locked layers are really locked': [['layers-panel', 'Brand-locked layers']],
  'Chosen states, sliders, ticks': [['interface', 'gold']],
  'Video layers: playback speed': [['images-media', 'Speed and frame step']],
  'Play sound': [['captions', 'Soundtrack']],
  'Read it to me': [['read-aloud', 'Read aloud']],
  'Microphone, camera and photos': [['sensors', 'Microphone']],
  'Describe what you see': [['describe-what-you-see', 'Descriptions']],
  'Download size': [['download-size', 'Download size']],
  'Puzzle layouts from a': [['branded-starters', 'Crossword']],
  'New starters: Listening lab,': [['branded-starters', 'Listening lab']],
  'New branded set Listen,': [['branded-starters', 'Observe and tag']],
  'Property fields line up': [['properties-panel', 'How fields line up']],
  'Property fields on a grid': [['properties-panel', 'one grid of four columns']],
  'Gold instead of blue': [['preferences', 'the same gold with a thin dark edge']],
  'Faster on big projects': [['interface', 'Big projects']],
  'Opens faster': [['interface', 'Opening the editor']],
  'Grid sizes, tick boxes and long dropdowns': [['auto-layout', 'until you leave the box or press Enter'], ['properties-panel', 'Hug height']],
  'Rename a variable everywhere': [['variables', 'Renaming a variable'], ['variables', 'Rename, leave scripts']],
  'Build it tutorials and Concepts in the help': [['build-it', 'Just want to look?'], ['concepts', 'If something "does nothing"'], ['tutorial-mcq', 'Report result']],
  "Fonts load from StudyDesk's own server again": [['text', 'served from the same place as the editor']],
  "Saved values show in Preview's Debug panel straight away": [['interface', 'starting with any saved user data']],
  'Media Catalogue on the live StudyDesk site': [['media-catalogue', 'older **Photography catalogue**']],
  'Share for review needs a sign in': [['comments', 'There is no guest option'], ['comments', 'Sign in with StudyDesk']],
};

//Rows written before their CHANGELOG line exists, so the stale-row check below leaves them alone
const UPCOMING = new Set<string>([]);

const section = (): string[] => {
  const text = readFileSync(join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  const start = text.indexOf('## Unreleased: Symposium 3');
  const end = text.indexOf('\n## ', start + 5);
  return text
    .slice(start, end < 0 ? undefined : end)
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.match(/^- \*\*([^*]+)\*\*/)?.[1] ?? l.slice(2).replace(/\*/g, '').split(/\s+/).slice(0, 4).join(' '));
};

describe('every CHANGELOG feature in Symposium 3 is in the help', () => {
  const headings = [...new Set(section())];

  it('reads the entries, so the checks below are not passing on nothing', () => {
    expect(headings.length).toBeGreaterThan(80);
  });

  it('has a row for every entry, and no row for one that is gone', () => {
    expect(headings.filter((h) => !(h in COVERED))).toEqual([]);
    expect(Object.keys(COVERED).filter((h) => !headings.includes(h) && !UPCOMING.has(h))).toEqual([]);
  });

  it('finds a real topic and its key phrase for every row', () => {
    const bad: string[] = [];
    for (const [heading, rows] of Object.entries(COVERED)) {
      for (const [id, phrase] of rows) {
        const topic = getTopic(id);
        if (!topic) bad.push(`${heading}: no help topic "${id}"`);
        else if (!topicBody(topic).toLowerCase().includes(phrase.toLowerCase())) bad.push(`${heading}: "${id}" does not say "${phrase}"`);
      }
    }
    expect(bad).toEqual([]);
  });
});
