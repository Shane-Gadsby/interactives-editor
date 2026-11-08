import { c, sect, type FormMaker } from '../../form-kit';

//Everything an author fills in for the assessment starters. Variables, layers and questions are named the way the builds name them.
const HINT = { covers: /^Choose whether questions offer a Hint/ };

export const FORMS: Record<string, FormMaker> = {
  'assessment/multi-page-quiz': (R) => ({
    sections: [
      R.titles(),
      ...[1, 2, 3, 4, 5].map((n) =>
        sect(
          `Question ${n}`,
          n === 1 ? 'Each question is on its own page. Tick the right answers, and add a hint if you like.' : undefined,
          R.questionFields(`Question ${n}`, `Question ${n}`, { label: `Question ${n}`, covers: new RegExp(`^Question ${n}:`), covers2: n === 1 ? { options: /^Mark the right options/ } : undefined }),
        ),
      ),
      sect('Result', 'What the last page says.', R.passMark('Pass mark', { covers: /^Change the pass mark/ }), R.text('passMessage', 'Message for a pass', { covers: /^Reword the pass and fail/ }), R.text('failMessage', 'Message for a fail')),
      sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint on every question', HINT)),
    ],
    elsewhere: [/^To add a question/],
  }),

  'assessment/true-or-false': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Statements',
        'The progress bar, the footer, the tally and the result all follow this list.',
        R.list('statements', 'Statements', [c.long('prompt', 'Statement'), c.toggle('correct', 'This statement is true'), c.long('explain', 'Explanation shown afterwards')], { noun: 'statement', covers: [/^Write your own statements/, /^Add or remove statements/], blank: { correct: true } }),
      ),
      sect('Ask some, in any order', undefined, R.questionFields('True or false', 'Statement question', { parts: ['bank'], covers: /^Ask only some statements/ })),
      sect('Result messages', undefined, R.text('messageHigh', 'Message for a high score', { covers: /^Reword the three result messages/ }), R.text('messageMid', 'Message for a middle score'), R.text('messageLow', 'Message for a low score')),
    ],
  }),

  'assessment/fill-in-the-blanks': (R) => {
    const page = R.page('Fill in the blanks');
    const q = R.question(page, 'Passage question').node.question;
    return {
      sections: [
        R.titles(),
        sect(
          'The passage',
          'Write it a gap at a time: the words before the gap, what the learner may type in it, then the words after.',
          R.fixed(
            'Gaps',
            q.blanks.map((_, i) => ({
              label: `Gap ${i + 1}`,
              cells: { before: R.q(page, 'Passage question', ['blanks', i, 'label']), answers: R.q(page, 'Passage question', ['blanks', i, 'answers']), after: R.layer(page, `Sentence ${i + 1} end`) },
            })),
            [c.long('before', 'Words before the gap'), c.lines('answers', 'Accepted answers (one per line)'), c.long('after', 'Words after the gap')],
            { id: 'gaps', covers: [/^Write your own passage/, /^Set the accepted answers/] },
          ),
        ),
        sect('Instruction and feedback', undefined, R.questionFields(page, 'Passage question', { parts: ['prompt', 'hints', 'feedback'], covers: /^Reword the instruction/ })),
      ],
      elsewhere: [/^To add a blank/, /^To remove a blank/],
    };
  },

  'assessment/mark-the-words': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The passage',
        'Put an asterisk on each side of every word the learner should mark, like *opened*. The asterisks never show.',
        R.long('passage', 'Passage', { covers: /^Write your passage/ }),
        R.text('rule', 'What the learner should mark', { covers: /^Say what the learner should mark/ }),
        R.layerText('Passage', 'Legend', 'Legend under the passage', { long: true, covers: /^Reword the legend/ }),
      ),
    ],
    elsewhere: [/^Change how a wrong word is scored/],
  }),

  'assessment/find-the-hotspot': (R) => ({
    sections: [
      R.titles(),
      sect('The picture', undefined, R.picture('Find the spot', 'Picture', 'Your picture', { covers: /^Swap the grey picture/ })),
      sect('The question', 'Name each area, tick the right one, and say what to tell the learner when it is picked. Move each area over its place on the page.', R.questionFields('Find the spot', 'Hotspot question', { parts: ['prompt', 'options', 'hints', 'feedback', 'tries'], covers: /^Write your question/, covers2: { tries: /^Set how many tries/, options: /^Place each area/ } })),
      sect('Settings', undefined, R.toggle('offerHint', 'Offer a Hint', { covers: /^Choose whether questions offer a Hint/ }), R.toggle('allowTryAgain', 'Offer Try again after a wrong answer')),
    ],
    elsewhere: [/^Delete the grey sample labels/],
  }),

  'assessment/find-multiple-hotspots': (R) => ({
    sections: [
      R.titles(),
      sect('The picture', undefined, R.picture('Find them all', 'Main picture', 'Your picture', { covers: /^Swap the grey picture/ }), R.toggle('showSampleLabels', 'Show the grey sample labels', { covers: /^Turn the grey sample labels off/ })),
      sect(
        'What to find',
        'Where each one is, in pixels from the top left of the picture. The areas move on the page as you type.',
        R.list('targets', 'Things to find', [c.text('name', 'Name'), c.long('feedback', 'Said when found'), c.number('x', 'Left'), c.number('y', 'Top'), c.number('w', 'Width'), c.number('h', 'Height')], { noun: 'target', covers: [/^Write what to find/, /^To add a target/] }),
      ),
      sect('Messages', undefined, R.text('wrongMessage', 'After a wrong click', { covers: /^Reword the wrong click/ }), R.text('messageGood', 'Result: no wrong clicks'), R.text('messageOk', 'Result: a few wrong clicks'), R.text('messageLow', 'Result: many wrong clicks')),
    ],
  }),

  'assessment/image-choice': (R) => ({
    sections: [
      R.titles(),
      sect('The question', undefined, R.text('prompt', 'Question', { covers: /^Write your question/ }), R.toggle('multiple', 'More than one answer can be right', { covers: /^Choose one right answer or several/ })),
      sect(
        'The pictures',
        'Each choice has a picture, a label, and a description of the picture for people who cannot see it.',
        R.list('options', 'Choices', [c.asset('image', 'Picture'), c.text('label', 'Label'), c.text('alt', 'Description of the picture'), c.toggle('correct', 'Right')], { noun: 'choice', covers: [/^Give each choice its picture/, /^Write each choice's label/, /^Use more or fewer pictures/], blank: { correct: false } }),
      ),
      sect('Feedback', undefined, R.text('feedbackCorrect', 'When right', { covers: /^Reword the three feedback/ }), R.text('feedbackPartial', 'When part right'), R.text('feedbackWrong', 'When wrong')),
    ],
  }),

  'assessment/single-choice-set': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Questions',
        'Each question has its answers, the place of the right one, and what is said after a wrong answer. The progress bar, the footer and the score follow the list.',
        R.list('questions', 'Questions', [c.long('prompt', 'Question'), c.lines('options', 'Answers (one per line)'), c.pick('correct', 'Right answer', 'options'), c.long('explain', 'Explanation')], {
          noun: 'question',
          covers: [/^Write your own questions/, /^Add or remove questions/],
          blank: { options: ['', '', ''], correct: 1 },
        }),
      ),
      sect('Timing', undefined, R.nodeParam(R.param('Quick questions', (n) => n.kind === 'action.delay', 'ms'), 'How long a right answer stays on screen', 'number', { unit: 'ms', min: 0, max: 10000, step: 100, covers: /^Change how long a right answer/ })),
      sect('Messages', undefined, R.text('messageHigh', 'Message for a high score', { covers: /^Reword the three score messages/ }), R.text('messageMid', 'Message for a middle score'), R.text('messageLow', 'Message for a low score')),
    ],
  }),

  'assessment/summary': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Steps',
        'Each step asks "which statement is true?". The true ones, in order, make the summary at the end.',
        R.list('steps', 'Steps', [c.text('heading', 'Heading'), c.lines('options', 'Statements (one per line)'), c.pick('correct', 'The true one', 'options'), c.long('line', 'Sentence for the summary')], {
          noun: 'step',
          covers: [/^Write your own steps/, /^Add or remove steps/, /^Put the steps in the order/],
          blank: { options: ['', '', ''], correct: 1 },
        }),
      ),
      sect('Messages', undefined, R.questionFields('Build the summary', 'Step question', { parts: ['prompt', 'feedback'], covers: /^Reword the right, wrong/ }), R.text('messageHigh', 'Message for a high score'), R.text('messageMid', 'Message for a middle score'), R.text('messageLow', 'Message for a low score')),
    ],
    elsewhere: [/^Change the points or allow part marks/],
  }),

  'assessment/essay': (R) => ({
    sections: [
      R.titles(),
      sect('The question', undefined, R.long('prompt', 'Prompt', { covers: /^Write your prompt/ })),
      sect(
        'Key ideas',
        'The feedback is automatic and looks for these words in the answer. A stem like "evaporat" matches evaporate, evaporation and evaporating.',
        R.lines('required', 'Ideas a good answer must have', { covers: /^List the key ideas/, hint: 'One word or word stem per idea.' }),
        R.lines('optional', 'Extras that make an answer stronger', { covers: /^List the extras/ }),
      ),
      sect('Length', undefined, R.number('minWords', 'Fewest words', { covers: /^Set the length/, min: 0 }), R.number('maxWords', 'Most words', { min: 0 })),
      sect('Model answer', undefined, R.long('modelAnswer', 'Your model answer', { covers: /^Write your model answer/ })),
      sect('What learners are told', undefined, R.layerText('Write your answer', 'How it works', 'Note about the automatic feedback', { long: true, covers: /^Tell learners the feedback is automatic/ })),
    ],
  }),

  'assessment/audio-first-quiz': (R) => ({
    sections: [
      R.titles({ extra: [R.layerText(0, 'Keys note', 'Note about the keys', { long: true })] }),
      sect(
        'Questions',
        'Each question is read aloud, then its answers. Keep each answer short: a voice reads them all.',
        R.list('questions', 'Questions', [c.long('prompt', 'Question'), c.long('spoken', 'Said instead of the question (when a voice reads it badly)'), c.lines('options', 'Answers (one per line)'), c.pick('correct', 'Right answer', 'options'), c.long('explain', 'Explanation, said after the answer'), c.text('hint', 'Hint')], {
          noun: 'question',
          covers: [/^Write your own questions/, /^Add a spoken version/, /^Add or remove questions/, /^Keep each option short/],
          blank: { options: ['', ''], correct: 1 },
        }),
      ),
      sect(
        'Settings',
        undefined,
        R.choice('pace', 'How the quiz moves on after an answer', [{ value: 0, label: 'By hand' }, { value: 4, label: 'After 4 seconds' }, { value: 8, label: 'After 8 seconds' }], { covers: /^Choose how the quiz moves on/ }),
        R.toggle('spokenOn', 'Read the questions aloud to start with'),
        R.toggle('offerHint', 'Offer a Hint', HINT),
      ),
      sect('Result messages', undefined, R.text('messageHigh', 'Message for a high score', { covers: /^Reword the three result messages/ }), R.text('messageMid', 'Message for a middle score'), R.text('messageLow', 'Message for a low score')),
    ],
    elsewhere: [/^Set the language of the spoken prompts/],
  }),

  'assessment/spelling-test': (R) => {
    const words = R.pages(/^Word \d/);
    return {
      sections: [
        R.titles(),
        sect(
          'The words',
          'Type the spellings you accept, one per line. The audio for each word is made on its page (see the Question section, Voice for the word). The word must not appear anywhere else on the page.',
          R.fixed(
            'Words',
            words.map((ab) => ({ label: ab.name, cells: { answers: R.q(ab, `${ab.name} question`, ['blanks', 0, 'answers']), hints: R.q(ab, `${ab.name} question`, ['hints']) } })),
            [c.lines('answers', 'Accepted spellings (one per line)'), c.lines('hints', 'Hint (never the word itself)')],
            { id: 'words', covers: /^Word \d+:/ },
          ),
        ),
        sect('Settings', undefined, R.toggle('allowTryAgain', 'Let a learner try a wrong word again', { covers: /^Choose whether learners get Try again/ }), R.toggle('offerHint', 'Offer a Hint on every word')),
        sect('Result', undefined, R.passMark('Pass mark', { covers: /^Reword the pass and fail/ }), R.text('passMessage', 'Message for a pass'), R.text('failMessage', 'Message for a fail')),
      ],
      elsewhere: [/^Make the audio for all/, /^Use mp3 or wav/, /^Set the retakes/, /^To add a word/],
    };
  },
};
