import { c, sect, type FormMaker } from '../../form-kit';

const HINTS = { covers: /^Choose whether questions offer a Hint/ };
const SCENES = ['Tuesday: a quiet group', 'Sam replies', 'Wednesday night', 'Thursday: the contribution statement', 'The lecturer replies'];

export const FORMS: Record<string, FormMaker> = {
  'story/branching-scenario': (R) => ({
    sections: [
      R.titles(),
      ...SCENES.map((name, i) =>
        sect(
          name,
          i === 0 ? 'Each page has a situation and some choices. A choice goes to the page named after "Goes to" (or to whichever ending the score earns). The best route should score the most.' : undefined,
          R.layerText(name, 'Situation', 'The situation', { long: true, id: `scene-${i + 1}-situation`, covers: i === 0 ? /^Write your situation and the first choices/ : undefined }),
          R.picture(name, 'Picture', 'Picture (optional)', { id: `scene-${i + 1}-picture` }),
          R.jsonList({ ...R.param(name, (n) => n.kind === 'action.setVariable' && String(n.params.value).startsWith('[{'), 'value'), json: true } as never, 'Choices', [c.text('label', 'Choice'), c.number('points', 'Points', { hint: 'The route with the most points earns the best ending.' }), c.text('path', 'Wording on the "path so far" line'), c.from('to', 'Goes to', 'pages', [{ value: 'ending', label: 'The ending the score earns' }])], { id: `scene-${i + 1}-choices`, noun: 'choice', covers: i === 0 ? undefined : i === 1 ? /^Write what happens after each choice/ : undefined, maxRows: 5 }),
        ),
      ),
      sect(
        'Endings',
        'What each of the three endings says about how it went.',
        ...['Ending: strong', 'Ending: mixed', 'Ending: learning moment'].map((name, i) => R.layerText(name, 'Outcome', name, { long: true, id: `ending-${i + 1}`, covers: i === 0 ? /^Write what each of the three endings says/ : undefined })),
      ),
    ],
    elsewhere: [/^Rewrite or delete the lecturer pages/],
  }),

  'story/course-presentation': (R) => {
    const slides = R.pages(/^Slide \d+: (Content|Summary)$/);
    return {
      sections: [
        R.titles({ label: 'Presentation title' }),
        sect('Acknowledgement and section', undefined, R.layerText('Slide 2:', 'Acknowledgement text', 'Acknowledgement of Country', { long: true, covers: /^Replace the Acknowledgement of Country/ }), R.layerText('Slide 3:', 'Page title', 'Section slide title', { covers: /^Rename the section slide/ })),
        sect(
          'Content slides',
          'The points and the picture on each content slide, and the closing points on the summary.',
          R.fixed(
            'Slides',
            slides.map((ab) => ({ label: ab.name, cells: { title: R.layer(ab, 'Page title'), text: R.layer(ab, 'Slide text'), picture: R.slot(ab, 'Picture') } })),
            [c.text('title', 'Slide title'), c.long('text', 'Points'), c.asset('picture', 'Picture')],
            { id: 'slides', covers: [/^Write your own points on each content slide/, /^Replace the grey picture boxes/, /^Change the picture on the second content slide/, /^Write the closing points on the summary slide/] },
          ),
        ),
        sect('Question', undefined, R.questionFields('Slide 6:', 'Question 1', { parts: ['prompt', 'options', 'hints', 'feedback'], covers: /^Write your own question and answers/ })),
        sect('End slide', undefined, R.layerText('Slide 8:', 'Page title', 'Closing message', { long: true, covers: /^Change the closing message on the end slide/ })),
        sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', HINTS), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      ],
      elsewhere: [/^To add a slide/],
    };
  },

  'story/memory-game': (R) => ({
    sections: [
      R.titles(),
      sect('The pairs', 'Each pair is a term and what it matches. The cards, the count and the finished check all follow this list.', R.list('pairs', 'Pairs', [c.text('term', 'Term'), c.text('match', 'What it matches')], { noun: 'pair', covers: /^Write your own six pairs/, maxRows: 12 })),
      sect(
        'Playing',
        undefined,
        R.nodeParam(R.param('Find the matching pairs', (n) => n.kind === 'action.delay' && n.params.ms === 1000, 'ms'), 'How long unmatched cards stay face up', 'number', { unit: 'ms', min: 200, max: 5000, step: 100, covers: /^Change how long unmatched cards stay face up/ }),
      ),
      sect('Finished page', undefined, R.layerText('Finished', 'Result note', 'The finished message and its ratings', { long: true, covers: /^Change the finished message/ })),
    ],
    elsewhere: [/^Restyle the card/],
  }),

  'story/video-questions': (R) => {
    const page = 'Watch and answer';
    return {
      sections: [
        R.titles(),
        sect('The video', 'Pick the video file. Until you do, the video says so itself.', R.picture(page, 'Video', 'Your video', { kind: 'video', covers: /^Choose your video file/ })),
        sect(
          'When the questions appear',
          'Each stop is a question, in order, at the second it appears. The video pauses for it.',
          R.jsonList(R.layer(page, 'Video', 'cues'), 'Stops', [c.text('name', 'Question'), c.number('time', 'Seconds into the video')], { noun: 'stop', fixed: true, covers: /^Write your three questions/ }),
        ),
        sect('The questions', undefined, ...[1, 2, 3].map((n) => R.questionFields(page, `Question ${n}`, { id: `question-${n}`, label: `Question ${n}`, prefix: true, parts: ['prompt', 'options', 'hints', 'feedback'] }))),
        sect(
          'Chapters',
          'The list beside the video, the video\'s own controls and the highlight all read these.',
          R.jsonList(R.layer(page, 'Video', 'chapters'), 'Chapters', [c.text('title', 'Title'), c.number('time', 'Starts at (seconds)')], { noun: 'chapter', covers: /^Rename the chapters and set where each starts/, maxRows: 12 }),
        ),
        sect('Summary', undefined, R.layerText('Summary', 'Summary text', 'Summary points', { long: true, covers: /^Write the summary points/ })),
        sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', HINTS), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      ],
    };
  },

  'story/interactive-book': (R) => {
    const pages = R.pages(/^\d\.\d /);
    const reading = pages.filter((ab) => !/Check your understanding/.test(ab.name));
    const questions = pages.filter((ab) => /Check your understanding/.test(ab.name));
    const slug = (ab: { name: string }) => ab.name.slice(0, 3);
    return {
      sections: [
        R.titles({ label: 'Book title' }),
        sect('Chapters', 'The cards, the strip on each page and the summary all read these. "First page" is the name of the chapter\'s first page, so keep it the same as that page\'s name.', R.list('chapters', 'Chapters', [c.text('name', 'Name'), c.long('blurb', 'What the card says'), c.number('size', 'Pages'), c.text('first', 'First page')], { noun: 'chapter', fixed: true, covers: /^Rename the chapters/ })),
        sect(
          'Reading pages',
          'The words and the picture on each page.',
          R.fixed(
            'Pages',
            reading.map((ab) => ({ label: ab.name, cells: { text: R.layer(ab, 'Page text'), picture: R.slot(ab, 'Picture') } })),
            [c.long('text', 'Text'), c.asset('picture', 'Picture')],
            { id: 'pages', covers: /^Chapter \d, page \d:/ },
          ),
        ),
        ...questions.map((ab, i) => {
          const layer = `Question ${i + 1}`;
          return sect(`Chapter ${slug(ab).slice(0, 1)} question`, undefined, R.questionFields(ab, layer, { label: `Chapter ${slug(ab).slice(0, 1)}`, parts: ['prompt', 'options', 'hints', 'feedback'], covers: new RegExp(`^Chapter ${slug(ab).slice(0, 1)} question:`) }));
        }),
        sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', HINTS), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      ],
      elsewhere: [/^To add a page to a chapter/],
    };
  },
};
