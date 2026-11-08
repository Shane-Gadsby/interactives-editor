import { c, sect, type FormKit, type FormMaker } from '../../form-kit';

const TRY = { covers: /^Choose whether wrong answers can be retried/ };
const HINTS = { covers: /^Choose whether questions offer a Hint/ };

//The page after the activity: its title and the words it says
const results = (R: FormKit) =>
  sect('Results page', undefined, R.layerText('Results', 'Page title', 'Page title', { id: 'results-title' }), R.layerText('Results', 'Result text', 'Words on the results page', { long: true, covers: /^Change the results page text/ }));

export const FORMS: Record<string, FormMaker> = {
  'drag/label-the-diagram': (R) => ({
    sections: [
      R.titles(),
      R.pageTexts('Activity', { covers: /^Change the page title and the footer text/ }),
      sect('The diagram', undefined, R.picture('Activity', 'Diagram picture', 'Your diagram', { covers: /^Replace the grey picture/ })),
      sect('Labels', 'Each pair is a label and the spot it belongs on: pair 1 belongs on Spot 1, pair 2 on Spot 2 and so on. Add wrong labels as wrong choices.', R.questionFields('Activity', 'Label question', { parts: ['prompt', 'pairs', 'extras', 'hints', 'feedback', 'tries', 'points'], covers: /^Type your own labels/, covers2: { tries: /^Set the tries, points and feedback/ } })),
      sect('Settings', undefined, R.toggle('allowTryAgain', 'Offer Try again after a wrong answer', TRY)),
      results(R),
    ],
    elsewhere: [/^Move each numbered spot/],
  }),

  'drag/sort-into-groups': (R) => ({
    sections: [
      R.titles(),
      R.pageTexts('Activity', { covers: /^Change the page title and the footer text/ }),
      sect('Groups and cards', 'Each card is dropped into the group it belongs in. The layers follow what you type.', R.questionFields('Activity', 'Sort question', { parts: ['prompt', 'groups', 'cards', 'hints', 'feedback', 'tries', 'points'], covers: /^Write your groups and cards/, covers2: { hints: /^Write the hint, feedback, tries and points/, cards: /^Rewrite what a wrong drop says/ } })),
      sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', HINTS), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      results(R),
    ],
  }),

  'drag/put-in-order': (R) => ({
    sections: [
      R.titles(),
      R.pageTexts('Activity', { covers: /^Change the page title and the footer text/ }),
      sect('The question', 'List the steps in their right order. The learner sees them shuffled.', R.questionFields('Activity', 'Order question', { parts: ['prompt', 'options', 'hints', 'feedbackAll', 'tries', 'points'], covers: /^Write your question and the steps/, covers2: { hints: /^Change the hint, tries and points/, feedback: /^Reword the four feedback/ } })),
      sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', HINTS), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
      results(R),
    ],
  }),

  'drag/interactive-timeline': (R) => ({
    sections: [
      R.titles(),
      R.pageTexts('Timeline', { covers: /^Change the page title and the footer text/ }),
      sect(
        'Events',
        'Keep to about seven events so the captions fit under the line.',
        R.list('events', 'Events', [c.text('date', 'Date'), c.text('short', 'Short caption'), c.text('title', 'Heading'), c.long('body', 'Text'), c.asset('image', 'Picture (optional)')], { noun: 'event', covers: [/^Write your events/, /^Give an event a picture/], maxRows: 12 }),
      ),
    ],
    elsewhere: [/^Retime the intro line/],
  }),

  'drag/drag-the-words': (R) => {
    const page = R.page('Activity');
    const q = R.question(page, 'Words question').node.question;
    return {
      sections: [
        R.titles(),
        R.pageTexts('Activity', { covers: /^Change the page title and the footer text/ }),
        sect(
          'The passage',
          'A gap at a time: the words before it, the word that goes in it, then the words after. The first accepted answer is the word that goes in the pile.',
          R.fixed(
            'Gaps',
            q.blanks.map((_, i) => ({ label: `Gap ${i + 1}`, cells: { before: R.layer(page, `Sentence ${i + 1} start`), word: R.q(page, 'Words question', ['blanks', i, 'answers']), after: R.layer(page, `Sentence ${i + 1} end`) } })),
            [c.long('before', 'Words before the gap'), c.lines('word', 'Right word (more than one line accepts either)'), c.long('after', 'Words after the gap')],
            { id: 'gaps', covers: [/^Write your own passage/, /^Set the right word for each gap/] },
          ),
          R.questionFields(page, 'Words question', { parts: ['extras'] }),
        ),
        sect('Instruction and marking', undefined, R.questionFields(page, 'Words question', { parts: ['prompt', 'hints', 'feedback', 'tries', 'points'], covers2: { tries: /^Set the tries, points and feedback/ } })),
        sect('Settings', undefined, R.toggle('allowTryAgain', 'Offer Try again after a wrong answer', TRY)),
        results(R),
      ],
    };
  },

  'drag/image-pairing': (R) => {
    const page = R.page('Activity');
    const q = R.question(page, 'Pairing question').node.question;
    return {
      sections: [
        R.titles(),
        R.pageTexts('Activity', { covers: /^Change the page title and the footer text/ }),
        sect(
          'The pairs',
          'Each card has a word and a line under it, and the picture that goes with it. Two cards to a row; three rows fit above the footer.',
          R.fixed(
            'Pairs',
            q.pairs.map((_, i) => ({
              label: `Pair ${i + 1}`,
              cells: { picture: R.slot(page, `Picture ${i + 1}`, `Picture ${i + 1} hint`), alt: R.layer(page, `Picture ${i + 1}`, 'ariaLabel'), shows: R.q(page, 'Pairing question', ['pairs', i, 'match']), word: R.q(page, 'Pairing question', ['pairs', i, 'term']), line: R.layer(page, `Partner ${i + 1} line text`) },
            })),
            [c.asset('picture', 'Picture'), c.text('alt', 'Description of the picture'), c.text('shows', 'What the picture shows'), c.text('word', 'Word on the card'), c.long('line', 'Line under the word')],
            { id: 'pairs', covers: [/^Replace each grey picture/, /^Write each card/] },
          ),
          R.questionFields(page, 'Pairing question', { parts: ['extras'], covers: /^Add or remove pairs/ }),
        ),
        sect('Marking', undefined, R.questionFields(page, 'Pairing question', { parts: ['prompt', 'hints', 'feedback', 'tries', 'points'], covers2: { tries: /^Set the tries, points and feedback/ } })),
        sect('Settings', undefined, R.toggle('allowTryAgain', 'Offer Try again after a wrong answer', TRY)),
        results(R),
      ],
    };
  },
};
