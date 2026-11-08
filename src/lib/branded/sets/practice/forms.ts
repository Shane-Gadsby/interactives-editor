import { c, sect, type FormMaker } from '../../form-kit';

export const FORMS: Record<string, FormMaker> = {
  'practice/difficult-conversation': (R) => {
    const scenes = R.pages(/^Alex/);
    return {
      sections: [
        R.titles(),
        sect(
          'The scenes',
          'Who the other person is on the left of each scene page, and what they say. Their line is the transcript, so keep it even if you add audio.',
          R.fixed(
            'Scenes',
            scenes.map((ab) => ({ label: ab.name, cells: { picture: R.slot(ab, 'Character picture'), alt: R.layer(ab, 'Character picture', 'ariaLabel'), name: R.layer(ab, 'Character name'), role: R.layer(ab, 'Character role'), mood: R.layer(ab, 'Character mood'), line: R.layer(ab, 'Their line'), expert: R.layer(ab, 'Expert reply') } })),
            [c.asset('picture', 'Picture of the character'), c.text('alt', 'Description of the picture'), c.text('name', 'Name'), c.text('role', 'Role'), c.text('mood', 'Mood'), c.long('line', 'What they say'), c.long('expert', 'What an expert might say')],
            { id: 'scenes', covers: [/^Write each scene/, /^Swap the grey character picture/, /^Write the expert reply/] },
          ),
        ),
        sect('The framework', 'One point per line, up to five.', R.lines('framework', 'What a good reply includes', { covers: /^Write the framework learners tick/ })),
        sect('Ending', 'Read how many scenes calmed and how many got tenser. Keep the parts in curly brackets.', R.layerText('Ending', 'Outcome', 'What the three outcomes say', { long: true, covers: /^Write what the three endings say/ })),
      ],
      elsewhere: [/^Add audio for each line/, /^Set where each answer goes/, /^Decide whether to offer recording/],
    };
  },

  'practice/timed-talk-rehearsal': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Cards',
        'Each card has a label, the question or topic, a short model answer and up to four things a good answer makes.',
        R.list('cards', 'Cards', [c.text('type', 'Label on the card'), c.long('q', 'Question or topic'), c.long('model', 'Model answer'), c.lines('points', 'Things a good answer makes (one per line)')], { noun: 'card', covers: /^Write your bank of cards/, maxRows: 20 }),
      ),
      sect('Timers', 'Longer times are an accessibility adjustment, so offer them.', R.toggle('timersOn', 'Count down the preparation and talk', { covers: /^Set the timers/ }), R.number('prepSeconds', 'Preparation time', { unit: 'seconds', min: 0, max: 600 }), R.number('talkSeconds', 'Talk time', { unit: 'seconds', min: 0, max: 1800 })),
      sect(
        'Where to talk',
        undefined,
        R.layerText('Draw, prepare, talk', 'Draw help', 'Help on the draw stage', { long: true, covers: /^Tell learners where to talk/ }),
        R.layerText('Draw, prepare, talk', 'Prepare help', 'Help on the prepare stage', { long: true }),
        R.layerText('Draw, prepare, talk', 'Talk help', 'Help on the talk stage', { long: true }),
      ),
    ],
    elsewhere: [/^Decide whether to offer recording/],
  }),

  'practice/keep-the-beat': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Drills',
        'Each drill is a card with its own Choose button, up to three across. The beat window is how many milliseconds either side of a beat still counts: phones add their own delay, so try it on a real phone and widen it if good taps are missed.',
        R.list('presets', 'Drills', [c.text('name', 'Name'), c.number('bpm', 'Starting beats a minute'), c.number('min', 'Slowest'), c.number('max', 'Fastest'), c.number('lead', 'Beats played first'), c.number('tol', 'Beat window', { hint: 'Milliseconds either side of the beat.' }), c.long('note', 'Note'), c.long('script', 'Words to say, one for every beat')], { noun: 'drill', covers: [/^Rename, retune or reword the drills/, /^Tune the beat window/, /^Write one word for every beat/, /^Reword the note on each drill/], maxRows: 3 }),
      ),
      sect('Goal', undefined, R.number('goal', 'Accuracy that counts as reaching the goal', { unit: '%', min: 0, max: 100, covers: /^Change the accuracy goal/ }), R.number('keep', 'Beats the learner keeps going', { covers: /^Change how many beats you keep going/, min: 4, max: 16 })),
    ],
    elsewhere: [/^Swap the placeholder clicks/],
  }),

  'practice/sign-practice': (R) => ({
    sections: [
      R.titles(),
      sect('Language and credit', 'Say who signs and the permission you hold. It shows on the How this works page.', R.text('language', 'Language', { covers: /^Write the title and set the language/ }), R.long('clipsCredit', 'Who signs, and the permission you hold', { covers: /^Get the signer's consent/ })),
      sect(
        'Signs',
        'One row per sign: the meaning is the answer, the two wrong choices, what the learner is told to notice, and the video of the sign. Use short clips of one sign each, filmed front on, with the hands and face in view.',
        R.list('signs', 'Signs', [c.text('meaning', 'Meaning (the right answer)'), c.lines('wrong', 'Two wrong choices (one per line)'), c.long('look', 'What to notice'), c.asset('clip', 'Video of the sign', { kind: 'video' })], { noun: 'sign', covers: [/^Swap each placeholder clip/, /^Write your signs/, /^Add or remove signs/], maxRows: 12, blank: { wrong: ['', ''] } }),
      ),
      sect('Self-review', 'Up to five lines, each a thing a learner can check in their own take.', R.lines('selfReview', 'Lines to tick', { covers: /^Write the self-review list/ })),
      sect('Wording', undefined, R.layerText('How this works', 'Camera privacy text', 'How the camera is kept private', { long: true, covers: /^Tell learners how their camera is kept private/ }), R.layerText('Your practice', 'Tutor note', 'Who to send the take and notes to', { long: true, covers: /^Say who learners send their take/ })),
    ],
  }),

  'practice/shadow-the-model': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Cards',
        'Each card has a phrase (shown big, and the transcript of the clip), a note on what to listen for, and up to four checks a learner ticks. Write the checks as things a learner can hear in their own voice.',
        R.list('cards', 'Cards', [c.long('phrase', 'Phrase'), c.long('note', 'What to listen for'), c.asset('sound', 'Model clip', { kind: 'audio' }), c.lines('checks', 'Checks (one per line)')], { noun: 'card', covers: [/^Write your cards/, /^Write the checks as things/], maxRows: 6 }),
      ),
    ],
    elsewhere: [/^Swap each placeholder clip/, /^Change the slow speed/, /^Tell learners a recording stays/],
  }),
};
