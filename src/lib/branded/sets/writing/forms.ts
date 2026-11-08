import { c, sect, type FormMaker } from '../../form-kit';

export const FORMS: Record<string, FormMaker> = {
  'writing/questionnaire': (R) => ({
    sections: [
      R.titles(),
      sect(
        'Question 1: a rating',
        'A scale of five round buttons. Say what the two ends mean.',
        R.layerText('Survey', 'Question', 'Question', { nth: 0, id: 'q1-question', long: true, covers: /^Question 1:/ }),
        R.layerText('Survey', 'Scale low', 'Label at the low end', { id: 'q1-low' }),
        R.layerText('Survey', 'Scale high', 'Label at the high end', { id: 'q1-high' }),
      ),
      sect('Question 2: a choice', undefined, R.layerText('Survey', 'Question', 'Question', { nth: 1, id: 'q2-question', long: true }), R.list('places', 'Choices', [c.text('', 'Choice')], { scalar: true, noun: 'choice', covers: /^Question 2:/, maxRows: 8 })),
      sect('Question 3: in your own words', undefined, R.layerText('Survey', 'Question', 'Question', { nth: 2, id: 'q3-question', long: true, covers: /^Question 3:/ })),
      sect('Thank you page', undefined, R.layerText('Thank you', 'Thank you message', 'Thank-you message', { covers: /^Write your thank-you message/ }), R.layerText('Thank you', 'Thank you text', 'Words under it', { long: true }), R.toggle('showSummary', 'Show the learner a summary of their answers')),
    ],
    elsewhere: [/^Decide which questions are required/, /^Change or remove what is sent to Insights/],
  }),

  'writing/documentation-tool': (R) => {
    const pages = R.pages(/^(My goals|Step \d)/);
    return {
      sections: [
        R.titles(),
        sect(
          'The steps',
          'Each step is a page with a prompt and a box to write in. The words in the box before anyone types are its placeholder.',
          R.fixed(
            'Steps',
            pages.map((ab) => ({ label: ab.name, cells: { title: R.layer(ab, 'Page title'), prompt: R.layer(ab, 'Prompt'), placeholder: R.layer(ab, 'Text box', 'placeholder') } })),
            [c.text('title', 'Page title'), c.long('prompt', 'Prompt'), c.text('placeholder', 'Placeholder in the box')],
            { id: 'steps', covers: [/^Write your goals prompt/, /^Step \d:/] },
          ),
        ),
        sect('Export page', undefined, R.layerText('Export', 'Intro', 'Words above the whole workbook', { long: true, covers: /^Change the export headings/ })),
      ],
      elsewhere: [/^Change the file name of the download/, /^If you rename a step/, /^To add a step/],
    };
  },

  'writing/reflection-journal': (R) => {
    const pages = R.pages(/^Part \d/);
    return {
      sections: [
        R.titles(),
        sect(
          'The four parts',
          'Each part has a lead line, three things to think about, and a placeholder in the box.',
          R.fixed(
            'Parts',
            pages.map((ab) => ({ label: ab.name, cells: { title: R.layer(ab, 'Page title'), lead: R.layer(ab, 'Prompt lead'), think: R.layer(ab, 'Think about'), placeholder: R.layer(ab, 'Text box', 'placeholder') } })),
            [c.text('title', 'Page title'), c.long('lead', 'Lead line'), c.long('think', 'Things to think about'), c.text('placeholder', 'Placeholder in the box')],
            { id: 'parts', covers: /^Part \d:/ },
          ),
        ),
        sect('Word count', undefined, R.number('aim', 'Words the count line asks for', { covers: /^Change how many words the count line asks for/, min: 0 })),
      ],
      elsewhere: [/^Change the headings the whole reflection uses/, /^Change the file name of the download/, /^If you rename a part/, /^To add a part/],
    };
  },
};
