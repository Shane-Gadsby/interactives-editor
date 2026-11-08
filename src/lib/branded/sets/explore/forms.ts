import { c, sect, type FormMaker } from '../../form-kit';

const HINT = { covers: /^Choose whether questions offer a Hint/ };

export const FORMS: Record<string, FormMaker> = {
  'explore/image-hotspots': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The picture',
        undefined,
        R.picture('Explore the water cycle', 'Main picture', 'Your picture', { covers: /^Replace the grey picture/, hint: 'Picture hint' }),
        R.picture('Explore the water cycle', 'Dialog picture', 'Picture in the pop-up (optional)', { covers: /^Add a picture to the dialog/ }),
      ),
      sect('What each point says', 'The points are numbered on the picture, in this order. Drag the points into place on the page.', R.list('spots', 'Points', [c.text('title', 'Title'), c.long('body', 'Text')], { noun: 'point', fixed: true, covers: /^Write what each point says/ })),
      R.footers({ pages: [1] }),
    ],
    elsewhere: [/^Drag each point/, /^To add a point/],
  }),

  'explore/accordion': (R) => ({
    sections: [
      R.titles(),
      sect('The sections', 'Each section has a title and the text that opens under it. The ones below move to make room.', R.list('sections', 'Sections', [c.text('title', 'Title'), c.long('body', 'Text')], { noun: 'section', covers: [/^Write each section/, /^To add a section/] })),
      sect('Settings', undefined, R.toggle('allowMany', 'Let several sections stay open at once', { covers: /^Let several sections/ }), R.numbers('open', 'Sections that start open', { hint: 'Their places, counting from 0: the first is 0. Leave empty for none.', covers: /^Choose which sections start open/ })),
      R.footers({ pages: [1] }),
    ],
  }),

  'explore/flip-and-dialog-cards': (R) => ({
    sections: [
      R.titles(),
      sect('The cards', 'A front and a back for each. The grid and the dialog cards both follow this list.', R.list('cards', 'Cards', [c.text('front', 'Front'), c.long('back', 'Back')], { noun: 'card', sized: { flipped: false }, covers: [/^Write your cards/, /^To add a card/], maxRows: 12 })),
      R.footers({ pages: ['Flip the cards', 'Dialog cards'] }),
    ],
    elsewhere: [/^Put a picture on a card front/],
  }),

  'explore/image-slider': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The slides',
        'Each slide has a heading, a caption and a picture with a description for people who cannot see it.',
        R.list('slides', 'Slides', [c.text('title', 'Heading'), c.long('body', 'Caption'), c.asset('image', 'Picture'), c.text('alt', 'Description of the picture')], { noun: 'slide', covers: [/^Write each slide/, /^Give a slide its picture/, /^To add a slide/], maxRows: 12 }),
      ),
      sect(
        'Playing',
        undefined,
        R.toggle('playing', 'Start with the slides playing', { covers: /^Choose whether the slides start playing/ }),
        R.nodeParam(R.param(1, (n) => n.kind === 'event.timer', 'ms'), 'Time between slides', 'number', { unit: 'ms', min: 500, max: 60000, step: 500, covers: /^Change the time between slides/ }),
      ),
      R.footers({ pages: [1] }),
    ],
  }),

  'explore/before-and-after': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The two pictures',
        'Use two pictures the same size so they line up.',
        R.picture('Compare the pictures', 'Before picture', 'Before picture', { covers: /^Replace the grey Before picture/, hint: 'Before picture hint' }),
        R.layerText('Compare the pictures', 'Before picture', 'Description of the Before picture', { prop: 'ariaLabel', id: 'before-description' }),
        R.picture('Compare the pictures', 'After picture', 'After picture', { covers: /^Replace the grey After picture/, hint: 'After picture hint' }),
        R.layerText('Compare the pictures', 'After picture', 'Description of the After picture', { prop: 'ariaLabel', id: 'after-description' }),
      ),
      sect('Words', undefined, R.layerText('Compare the pictures', 'Before label text', 'Label for the Before side', { covers: /^Change the Before and After labels/ }), R.layerText('Compare the pictures', 'After label text', 'Label for the After side'), R.layerText('Compare the pictures', 'Instructions', 'Instruction under the pictures', { long: true, covers: /^Change the instruction line/ })),
      R.footers({ pages: ['Compare the pictures'] }),
    ],
  }),

  'explore/image-sequence': (R) => {
    const page = R.page('From seed to seed');
    const n = (JSON.parse(R.variable('stages').initial as string) as unknown[]).length;
    const rows = Array.from({ length: n }, (_, i) => ({
      label: `Stage ${i + 1}`,
      cells: { picture: R.slot(page, `Image ${i + 1} picture`, `Image ${i + 1} picture hint`), alt: R.layer(page, `Image ${i + 1} picture`, 'ariaLabel'), title: R.item('stages', i, 'title'), caption: R.item('stages', i, 'caption'), name: R.layer(page, `Stage ${i + 1} name`) },
    }));
    return {
      sections: [
        R.titles(),
        sect(
          'The stages',
          'One picture and its words for each stage. The name sits under the slider.',
          R.fixed('Stages', rows, [c.asset('picture', 'Picture'), c.text('alt', 'Description of the picture'), c.text('title', 'Title'), c.long('caption', 'Caption'), c.text('name', 'Name under the slider')], { id: 'stages', covers: [/^Replace each grey picture/, /^Write each stage/, /^Rename the stage names/] }),
        ),
        R.footers({ pages: [1] }),
      ],
      elsewhere: [/^To change the number of stages/],
    };
  },

  'explore/information-wall': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The panels',
        'Keep each panel\'s text to about 60 characters: a tile has room for two lines. Tags must be spelled the same way as the topic buttons.',
        R.list('panels', 'Panels', [c.text('title', 'Title'), c.long('text', 'Text'), c.tags('tags', 'Tags'), c.asset('image', 'Picture')], { noun: 'panel', covers: [/^Write your panels/, /^Give a panel its own picture/, /^To add or remove a panel/], maxRows: 24 }),
      ),
      sect('Topic buttons', 'Put All first.', R.list('topics', 'Topics', [c.text('', 'Topic')], { scalar: true, noun: 'topic', blank: { '': '' }, covers: /^Change the topic buttons/ })),
      R.footers({ pages: [1] }),
    ],
    elsewhere: [/^Restyle the tile/],
  }),

  'explore/collage': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The layout',
        undefined,
        R.choice('layout', 'Layout', [{ value: 1, label: 'Grid' }, { value: 2, label: 'Banner' }, { value: 3, label: 'Feature' }, { value: 4, label: 'Columns' }], { covers: /^Choose your layout/ }),
        R.toggle('showButtons', 'Show the layout buttons'),
      ),
      sect('The six pictures', 'Every layout shows the same six pictures. Keep each caption short, about 20 characters.', R.list('items', 'Pictures', [c.asset('image', 'Picture'), c.text('caption', 'Caption')], { noun: 'picture', fixed: true, covers: [/^Add your pictures/, /^Write the six captions/] })),
      R.pageTexts(1, { covers: /^Change the page title and the footer line/, heading: 'Collage page' }),
    ],
    elsewhere: [/^To use fewer pictures/, /^Restyle the caption bars/],
  }),

  'explore/chart': (R) => ({
    sections: [
      R.titles(),
      sect('The numbers', 'The bar chart, the pie, the table and the guess page all follow this list.', R.list('rows', 'Items', [c.text('label', 'Name'), c.number('value', 'Value')], { noun: 'item', covers: /^Put your own numbers/ }), R.text('unit', 'Unit', { covers: /^Change the unit/, hint: 'Every chart shows it after the numbers, for example "hours".' })),
      sect('The guess page', undefined, R.number('guessMax', 'Top of the guess scale', { covers: /^On the guess page, set the top/, hint: 'A little more than your biggest value.' }), R.layerText('Your guess', 'Question', 'The question', { long: true, covers: /^Rewrite the guess question/ })),
      R.footers({ pages: ['Chart', 'Your guess'] }),
    ],
    elsewhere: [/^Change or delete the two data buttons/],
  }),

  'explore/word-cloud': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The words',
        'The bigger the weight, the bigger the word. A word can open a pop-up with a detail and a link.',
        R.list('ourWords', 'Words', [c.text('text', 'Word'), c.number('weight', 'Weight'), c.long('detail', 'Detail shown when the word is opened'), c.text('link', 'Link (optional)')], { noun: 'word', covers: /^Write your own words/, maxRows: 60 }),
      ),
      sect(
        'The look',
        undefined,
        R.number('minSize', 'Smallest word size', { unit: 'px', covers: /^Choose how big the words are/ }),
        R.number('maxSize', 'Biggest word size', { unit: 'px' }),
        R.number('ourWidth', 'Width of the cloud', { unit: 'px' }),
        R.number('ourHeight', 'Height of the cloud', { unit: 'px' }),
        R.toggle('pills', 'A soft chip behind each word', { covers: /^Choose the look of the words/ }),
        R.choice('wordColour', 'Word colour', ['Plain', 'Colourway']),
      ),
      sect(
        'Words learners add',
        undefined,
        R.lines('blocked', 'Words not allowed', { covers: /^Block words and set a minimum count/ }),
        R.number('minCount', 'Show a word once it has been said', { unit: 'times', min: 1 }),
        R.choice('whoSees', 'Who sees the learners\' cloud', ['Only me', 'Everyone in this class'], { covers: /^Choose who sees the learner cloud/ }),
      ),
      R.footers({ pages: ['Our cloud', 'My cloud'] }),
    ],
    elsewhere: [/^Set up the class cloud responses/, /^Delete the My cloud page/],
  }),

  'explore/dated-timeline': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Events',
        'Dates can be a year (1969), a month (1969-07) or a day (1969-07-20). Any order: events are placed by date. A higher priority gets its label first.',
        R.list('events', 'Events', [c.text('date', 'Date'), c.text('end', 'End date (for a range)'), c.text('title', 'Title'), c.long('detail', 'Detail shown when it is opened'), c.asset('image', 'Picture (optional)'), c.number('priority', 'Priority')], { noun: 'event', covers: [/^Write your events/, /^Give an event a picture/], maxRows: 60 }),
      ),
      sect('Eras', 'Shaded periods behind the events. Leave empty for none.', R.list('eras', 'Eras', [c.text('name', 'Name'), c.text('from', 'From'), c.text('to', 'To')], { noun: 'era', covers: /^Write your eras/ })),
      sect('The marker line', undefined, R.text('markerDate', 'Date of the marker', { hint: 'A date, "today", or empty for none.', covers: /^Choose the marker line/ }), R.text('markerLabel', 'What the marker is called')),
      sect('The ordering activity', undefined, R.questionFields('Put in order', 'Order question', { parts: ['prompt', 'options', 'hints', 'feedback', 'tries'], covers: /^Set up the ordering activity/ }), R.toggle('offerHint', 'Offer a Hint', HINT), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      R.footers({ pages: ['Timeline', 'Timeline (portrait)', 'Put in order'] }),
    ],
  }),

  'explore/mind-map': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Ideas',
        'The first idea, in the middle, hangs from nothing. Every other idea hangs from the code of the idea above it. About ten ideas on a side, three levels deep, fits best.',
        R.list('ideas', 'Ideas', [c.text('id', 'Code'), c.text('parent', 'Hangs from (code)'), c.text('label', 'Name'), c.long('detail', 'Detail shown when it is opened')], { noun: 'idea', covers: [/^Write your own mind map ideas/], maxRows: 40 }),
        R.lines('folded', 'Branches that start folded', { hint: 'The codes of the ideas.' }),
      ),
      sect('Explore page', undefined, R.layerText('Explore', 'Page title', 'Page title', { id: 'explore-title', covers: /^Change the page title and the footer line on the Explore/ }), R.footers({ pages: ['Explore'] }).items[0]),
      sect('Build page', undefined, R.toggle('keepMap', 'Keep the learner\'s map for next time', { covers: /^Decide whether the learner's map is kept/ }), R.layerText('Build your own', 'Build hint', 'What the learner should do', { long: true, covers: /^Say what the learner should do on the Build page/ })),
    ],
  }),

  'explore/flowchart': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Steps',
        'Kinds: start, process, decision, io, end. About six rows and two steps across fits best.',
        R.list('steps', 'Steps', [c.text('id', 'Code'), c.choice('kind', 'Kind', ['start', 'process', 'decision', 'io', 'end']), c.text('label', 'Words in the shape'), c.long('detail', 'Detail')], { noun: 'step', covers: /^Write the steps of the flowchart/, maxRows: 24 }),
      ),
      sect('Arrows', 'One arrow for each answer of a decision. An arrow back to an earlier step makes a loop.', R.list('links', 'Arrows', [c.text('from', 'From (code)'), c.text('to', 'To (code)'), c.text('answer', 'Answer written on the arrow')], { noun: 'arrow', covers: /^Join the steps/, maxRows: 40 })),
      sect('Follow page', undefined, R.layerText('Follow the flowchart', 'Page title', 'Page title', { id: 'follow-title', covers: /^Change the page title and the footer text on the Follow/ }), R.footers({ pages: ['Follow the flowchart'] }).items[0]),
      sect('Complete the flowchart', 'Each pair is a step and the blank it goes in. Add wrong steps in the Question section.', R.questionFields('Complete the flowchart', 'Flowchart question', { parts: ['prompt', 'pairs', 'hints', 'feedback', 'tries'], covers: /^Set up the complete-the-flowchart page/, covers2: { tries: /^Set the tries, points and feedback/ } }), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer', { covers: /^Choose whether wrong answers can be retried/ })),
      sect('Results page', undefined, R.layerText('Results', 'Result text', 'Words on the results page', { long: true, covers: /^Change the results page text/ })),
    ],
    elsewhere: [/^Set where the walk starts/],
  }),
};
