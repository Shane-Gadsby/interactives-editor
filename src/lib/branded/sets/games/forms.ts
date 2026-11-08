import { c, sect, type FormMaker } from '../../form-kit';

export const FORMS: Record<string, FormMaker> = {
  'games/crossword': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Words and clues',
        'Write the answer in letters only (spaces and dashes are dropped). The grid, the numbers and both clue lists are laid out from this list. The grid is 10 by 10, so an answer longer than 10 letters is left out.',
        R.list('words', 'Words', [c.text('answer', 'Answer'), c.long('clue', 'Clue')], { noun: 'word', covers: /^Write your own words and clues/, maxRows: 14 }),
      ),
      R.pageTexts('Crossword', { heading: 'Crossword page', covers: undefined }),
    ],
    elsewhere: [/^Leave the grid positions alone/, /^Restyle one square/, /^Change the completion message/],
  }),

  'games/word-search': (R) => ({
    sections: [
      R.titles(),
      sect('Words', 'Letters only (spaces and dashes are dropped). A word longer than 12 letters is left out. The "Words to find" list has room for about eight.', R.lines('words', 'Words to hide in the grid', { covers: /^Write your own words for the grid/, hint: 'One word per line.' })),
      sect(
        'Playing',
        undefined,
        R.toggle('showTimer', 'Show the clock', { covers: /^Turn the clock off/ }),
        R.layerText('Find the words', 'How to play', 'Instructions under the heading', { long: true, covers: /^Reword the instructions and player messages/ }),
        R.text('message', 'Message at the start'),
      ),
      sect('Finished page', undefined, R.layerText('Finished', 'Page title', 'Page title', { id: 'finished-title', covers: /^Change what the finished page says/ })),
    ],
    elsewhere: [/^Leave the grid letters alone/, /^Leave the grid at 12 by 12/],
  }),

  'games/arithmetic-quiz': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The sums',
        undefined,
        R.choice('operation', 'Kind of sums', [{ value: '+', label: 'Add' }, { value: '-', label: 'Subtract' }, { value: '×', label: 'Multiply' }, { value: '÷', label: 'Divide' }, { value: 'mixed', label: 'Mixed (add, subtract and multiply)' }], { covers: /^Choose the kind of sums/ }),
        R.number('lowest', 'Smallest number', { covers: /^Set the range of numbers/, hint: 'Division sums use the range for the answer.' }),
        R.number('highest', 'Largest number'),
        R.number('howMany', 'How many sums', { covers: /^Set how many sums/, min: 1, max: 50 }),
      ),
      sect('How learners answer', undefined, R.choice('mode', 'Answer by', [{ value: 'type', label: 'Typing the answer' }, { value: 'choose', label: 'Choosing from four' }], { covers: /^Choose how learners answer/ }), R.toggle('showTimer', 'Show the clock', { covers: /^Turn the clock off/ })),
      sect('Finished page', undefined, R.layerText('Finished', 'Result note', 'Feedback and the finished message', { long: true, covers: [/^Change the feedback and the finished message/, /^Change what the finished page says/] })),
    ],
  }),

  'games/guess-the-answer': (R) => ({
    sections: [
      R.titles(),
      sect('The cards', 'A question, its answer and a line about why. The card, the counter and the finished page follow this list.', R.list('cards', 'Cards', [c.long('q', 'Question'), c.text('a', 'Answer'), c.long('note', 'Why')], { noun: 'card', covers: [/^Write your five cards/, /^Add or remove cards/], maxRows: 20 })),
      sect(
        'Pictures and buttons',
        undefined,
        R.picture('Think, then turn the card', 'Question picture', 'Picture on the question side', { covers: /^Swap the grey pictures/ }),
        R.picture('Think, then turn the card', 'Answer picture', 'Picture on the answer side'),
        R.layerText('Think, then turn the card', 'I knew it', 'First rating button', { prop: 'label', covers: /^Change the two rating buttons/ }),
        R.layerText('Think, then turn the card', 'Still learning', 'Second rating button', { prop: 'label' }),
      ),
      sect('Finished page', undefined, R.layerText('Finished', 'Result note', 'Words on the finished page and its three ratings', { long: true, covers: /^Reword the finished page and its three ratings/ })),
    ],
    elsewhere: [/^Give each card its own picture/, /^Change how fast the card turns/, /^Add a third rating/],
  }),

  'games/personality-quiz': (R) => ({
    sections: [
      R.titles(),
      sect('Outcomes', 'The result page shows the outcome with the most points.', R.list('outcomes', 'Outcomes', [c.text('name', 'Name'), c.long('text', 'Description')], { noun: 'outcome', fixed: true, covers: /^Write your four outcomes/ })),
      sect(
        'Questions',
        'Each question has four answers. The four points go to the four outcomes in the order above: 2, 0, 0, 1 gives two points to the first outcome and one to the fourth. Give every outcome a fair chance of winning.',
        R.list(
          'questions',
          'Questions',
          [c.long('q', 'Question'), ...[1, 2, 3, 4].flatMap((n) => [c.text(`a${n}`, `Answer ${n}`, { path: ['answers', n - 1, 'text'] }), c.numbers(`p${n}`, `Points for answer ${n}`, { path: ['answers', n - 1, 'points'] })])],
          { noun: 'question', covers: [/^Write your questions and their points/, /^Add or remove whole questions/], blank: { a1: '', a2: '', a3: '', a4: '', p1: [0, 0, 0, 0], p2: [0, 0, 0, 0], p3: [0, 0, 0, 0], p4: [0, 0, 0, 0] }, maxRows: 12 },
        ),
      ),
      sect('Result page', undefined, R.picture('Your result', 'Result picture', 'Result picture', { covers: /^Swap the grey result picture/ })),
    ],
    elsewhere: [/^Give each outcome a fair chance/, /^Change how ties are broken/],
  }),

  'games/game-map': (R) => {
    const stages = R.pages(/^Stage \d/);
    //stage 3 is a true or false, with two options
    const has = (ab: (typeof stages)[number], layer: string) => {
      try {
        return !!R.node(ab, layer);
      } catch {
        return false;
      }
    };
    const right = (ab: (typeof stages)[number]) => ({ ...R.param(ab, (n) => n.kind === 'action.setVariable' && n.params.variable === R.variable('answer').id && n.params.op === 'set', 'value'), str: true }) as never;
    return {
      sections: [
        R.titles(),
        sect('The map', 'Drag the markers onto your artwork on the page.', R.picture('Map', 'Map picture', 'Your map artwork', { covers: /^Swap the grey map picture/ }), R.list('stages', 'Stage names', [c.text('', 'Name')], { scalar: true, noun: 'stage', fixed: true, covers: /^Rename the stages/ })),
        sect(
          'The stages',
          'Each stage is its own page. Say which option is the right one.',
          R.fixed(
            'Stage pages',
            stages.map((ab) => ({
              label: ab.name,
              cells: {
                title: R.layer(ab, 'Page title'),
                o1: R.layer(ab, 'Option 1 text'),
                o2: R.layer(ab, 'Option 2 text'),
                ...(has(ab, 'Option 3 text') ? { o3: R.layer(ab, 'Option 3 text') } : {}),
                right: right(ab),
              },
            })),
            [c.text('title', 'Heading'), c.text('o1', 'First option'), c.text('o2', 'Second option'), c.text('o3', 'Third option'), c.choice('right', 'The right option', [{ value: '0', label: 'First option' }, { value: '1', label: 'Second option' }, { value: '2', label: 'Third option' }])],
            { id: 'stage-pages', covers: [/^Write each stage's activity/, /^Say which option is right on each stage/] },
          ),
        ),
        sect('Reward', undefined, R.picture('Reward', 'Reward picture', 'Reward picture', { covers: /^Change the reward/ }), R.layerText('Reward', 'Reward text', 'Reward words', { long: true }), R.layerText('Reward', 'Reward note', 'What happens next', { long: true })),
      ],
      elsewhere: [/^Change the order the stages unlock in/],
    };
  },
};
