import { c, sect, type FormMaker } from '../../form-kit';

export const FORMS: Record<string, FormMaker> = {
  'media/observe-and-tag': (R) => ({
    sections: [
      R.titles(),
      sect('The recording', 'Check you have consent from everyone in it.', R.picture('Watch and tag', 'Video', 'Your recording', { kind: 'video', covers: /^Choose your recording/ })),
      sect('Tags', 'One name per line, up to nine. Each gets the number key that matches its place.', R.lines('categories', 'Tag names', { covers: /^Name your tags/ })),
      sect(
        'The expert',
        undefined,
        R.list('expert', 'Expert tags', [c.number('t', 'Second in the recording'), c.number('cat', 'Tag number'), c.long('comment', 'What the learner reads')], { noun: 'tag', covers: /^Set the expert tags/, maxRows: 20 }),
        R.layerText('Compare with the expert', 'Framing', 'Words on the compare page', { long: true, covers: /^Read the framing text/ }),
        R.number('tolerance', 'Window of seconds', { min: 0, max: 30, unit: 'seconds' }),
      ),
    ],
    elsewhere: [/^Use audio only with a poster picture/, /^Write the captions for the recording/],
  }),

  'media/listening-lab': (R) => {
    const clips: [string, string, string | null, string][] = [
      ['Identify the sound', 'Sound 1 description', 'Sound 1 waveform', 'Round 1: the sound'],
      ['Compare A and B', 'Clip A description', 'Clip A waveform', 'Round 2: clip A'],
      ['Compare A and B', 'Clip B description', 'Clip B waveform', 'Round 2: clip B'],
      ['Sort the sounds', 'Sound 1 description', null, 'Round 3: sound 1'],
      ['Sort the sounds', 'Sound 2 description', null, 'Round 3: sound 2'],
      ['Sort the sounds', 'Sound 3 description', null, 'Round 3: sound 3'],
      ['Sort the sounds', 'Sound 4 description', null, 'Round 3: sound 4'],
      ['What changed?', 'Before description', 'Before waveform', 'Round 4: before'],
      ['What changed?', 'After description', 'After waveform', 'Round 4: after'],
    ];
    return {
      sections: [
        R.titles(),
        sect(
          'The three questions',
          'Round 1 is Identify the sound, round 2 is Compare A and B, round 3 is What changed. The answer is the place of the right option, counting from 0.',
          R.list('rounds', 'Questions', [c.long('q', 'Question'), c.lines('options', 'Answers (one per line, up to three)'), c.pick('answer', 'Right answer', 'options', 0), c.long('why', 'Shown after the answer')], { noun: 'question', fixed: true, covers: /^Write your three questions/ }),
        ),
        sect(
          'The clips',
          'Write a description for every clip: it is the way in for learners who cannot or would rather not listen, so say what the sound is like without giving the answer away. The waveform picture is optional.',
          R.fixed(
            'Clips',
            clips.map(([page, desc, wave, label]) => ({ label, cells: { description: R.layer(page, desc), ...(wave ? { picture: R.slot(page, wave), alt: R.layer(page, wave, 'ariaLabel') } : {}) } })),
            [c.long('description', 'Description'), c.asset('picture', 'Waveform picture'), c.text('alt', 'Description of the waveform')],
            { id: 'clips', covers: [/^Write a description for every clip/, /^Replace the grey waveform pictures/] },
          ),
        ),
        sect('Results page', undefined, R.layerText('Results', 'Result text', 'Words on the results page', { long: true, covers: /^Change the results text/ })),
      ],
      elsewhere: [/^Swap each placeholder sound/, /^Round 3: rename the two groups/, /^To add a sound to the sorting round/],
    };
  },

  'media/described-video': (R) => ({
    sections: [
      R.titles(),
      sect('The video', 'The captions and descriptions are on the Video layer: use its Captions and Descriptions sections.', R.picture('Watch the lesson', 'Video', 'Your video', { kind: 'video', covers: /^Choose your video file/ })),
      sect('Words around the video', undefined, R.layerText('Watch the lesson', 'How to listen', 'How to listen', { long: true }), R.layerText('Watch the lesson', 'About descriptions', 'About the descriptions', { long: true }), R.layerText('Watch the lesson', 'About the transcript', 'About the transcript', { long: true })),
    ],
    elsewhere: [/^Replace the sample captions/, /^Write your own audio descriptions/, /^Decide whether descriptions start on/, /^Need a formally recorded/, /^Record a formal described version/],
  }),

  'media/lite-lesson': (R) => ({
    sections: [
      R.titles(),
      sect('Choose a version', undefined, R.layerText('Choose a version', 'Intro text', 'The line under "Choose a version"', { long: true, covers: /^Say more about when to use each version/ })),
      sect(
        'The three versions',
        undefined,
        R.picture('Video lesson', 'Video', 'Video version: your video', { kind: 'video', covers: /^Video version:/ }),
        R.picture('Audio only lesson', 'Soundtrack', 'Audio only version: your soundtrack', { kind: 'audio', covers: /^Audio only version:/ }),
        R.picture('Text only lesson', 'Key image 1', 'Text only version: first key image', { covers: /^Text only version:/ }),
        R.layerText('Text only lesson', 'Key image 1 caption', 'Caption under the first image', { long: true }),
        R.picture('Text only lesson', 'Key image 2', 'Text only version: second key image'),
        R.layerText('Text only lesson', 'Key image 2 caption', 'Caption under the second image', { long: true }),
      ),
      sect('Transcript', 'One transcript, shown on all three versions, so the versions stay in step.', R.long('transcript', 'Transcript', { covers: /^Replace the sample transcript/ })),
      sect('Closing line', undefined, R.layerText('Done', 'Result text', 'Closing line', { long: true, covers: /^Change the closing line/ })),
    ],
    elsewhere: [/^Replace the grey poster picture/],
  }),

  'media/live-sound-lab': (R) => ({
    sections: [
      R.titles(),
      sect(
        'The target band',
        'The part of the meter to aim for, from 0 (quiet) to 1 (loud). The sample is a comfortable speaking volume.',
        R.number('steadyLo', 'Bottom of the band', { min: 0, max: 1, step: 0.05, covers: /^Set the target band/ }),
        R.number('steadyHi', 'Top of the band', { min: 0, max: 1, step: 0.05 }),
        R.number('noiseLine', 'Where "loud" starts in the noise check', { min: 0, max: 1, step: 0.05 }),
      ),
      sect('Band names', 'Eight bands from 80 Hz to 8 kHz, so keep eight. The label is the band in hertz and the other column is a rough guide to what lives there.', R.list('bandLabels', 'Bands', [c.text('label', 'Label'), c.text('what', 'What lives there')], { noun: 'band', fixed: true })),
    ],
    elsewhere: [/^Rewrite the challenge to suit your lesson/, /^Decide whether the microphone stays on/, /^Keep the slider/],
  }),

  'media/photo-notebook': (R) => ({
    sections: [
      R.titles(),
      sect('Privacy lines', 'Make the four lines fit your task, and say plainly who may be photographed, if anyone. Have your privacy office read them.', R.lines('pledges', 'The lines learners agree to', { covers: /^Make the four privacy lines fit your task/ })),
      sect(
        'Prompts',
        'Six prompts fit. Each has a title, a hint, and an example picture with a description for a screen reader. The example is how a learner without a camera finishes.',
        R.list('prompts', 'Prompts', [c.text('title', 'Title'), c.long('hint', 'Hint'), c.asset('example', 'Example picture'), c.text('exampleAlt', 'Description of the example')], { noun: 'prompt', covers: [/^Write your prompts/, /^Replace the six example pictures/], maxRows: 6 }),
      ),
      sect('Notebook', undefined, R.text('notebookTitle', 'Name of the notebook'), R.toggle('bingo', 'Open as a bingo board', { covers: /^Choose the layout learners open in/ }), R.layerText('Hand in your notebook', 'Hand-in steps', 'The hand-in steps', { long: true, covers: /^Name your assignment in the hand-in steps/ })),
    ],
    elsewhere: [/^Choose the tags learners can pick from/],
  }),
};
