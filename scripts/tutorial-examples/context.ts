//The course and learner context tutorial's finished project: a welcome by first name, the course from context, two variables
//with per-course values and a note only staff see, built the way the tutorial's steps build it
import { createNode, uid, type Artboard, type Project, type SceneNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';

//A text layer as the Text tool makes it, with the project's look
function text(p: Project, ab: Artboard, name: string, words: string, y: number, extra: Record<string, unknown> = {}): SceneNode {
  const n = createNode('text', { ...lookDefaults(p, 'text'), name, text: words, x: 40, y, width: 720, height: 28, autoSize: 'height', fontSize: 20, ...extra } as never);
  ab.children.push(n);
  return n;
}

function variable(p: Project, v: Omit<Variable, 'id'>): Variable {
  const made = { id: uid('v'), ...v } as Variable;
  p.variables.push(made);
  return made;
}

function build(): Project {
  const p = blankProject('Course welcome');
  const ab = p.artboards[0];

  //Step 2: the greeting and the course, straight from context
  text(p, ab, 'Greeting', '{context.firstName ? "Welcome, " + context.firstName + "!" : "Welcome!"}', 60, { fontSize: 40, fontWeight: 700, height: 52 });
  text(p, ab, 'Course line', '{context.courseCode ? "You are in " + context.courseCode + ", " + context.courseName + "." : "Open this from your StudyDesk course to see your course here."}', 140);

  //Step 3: two ordinary variables, then step 4 gives them a value per course
  const assignment = variable(p, { name: 'assignment', type: 'string', initial: 'first assignment' });
  const dueWeek = variable(p, { name: 'dueWeek', type: 'number', initial: 5 });
  text(p, ab, 'Due line', 'Your {assignment} is due in week {dueWeek}.', 210);
  p.courseValues = [
    { id: uid('cv'), match: 'MAT1000_*', values: { [assignment.id]: 'problem set', [dueWeek.id]: 4 } },
    { id: uid('cv'), match: 'MAT1001_*', values: { [assignment.id]: 'project proposal', [dueWeek.id]: 6 } },
  ];

  //Step 5: shown only to staff (a Visible binding on context.isStaff)
  const staff = text(p, ab, 'Staff note', 'Staff only: students never see this line. The assignment and week for each course are in the Data tab, under context, Per-course values.', 300, { fontSize: 17 });
  staff.bindings = { visible: 'context.isStaff' };
  return p;
}

export const example: TutorialExample = {
  key: 'tut-context',
  topic: 'tutorial-context',
  title: 'Personalised for the course and learner',
  description: 'Greets the learner by first name, names their course, and gives a different assignment and due week in each course, with a line only staff see: the Course and learner context tutorial\'s project.',
  tags: ['context', 'personalise', 'course', 'per-course values'],
  build,
  notes: [
    { text: '**Everything here reads `context`.** It is filled in by the Link for StudyDesk. On the canvas and in Preview it uses the sample values in the Data tab, under context: change the first name or the course label there to try it.' },
    { text: '**One project, several courses.** In the Data tab, under context, Per-course values gives MAT1000 and MAT1001 their own assignment and due week. Any other course gets the starting values from the Variables tab.', colour: 'sky' },
    { text: '**The staff line is hidden from students** by a Visible binding on `context.isStaff`. Untick isStudent in the sample values to see it on the canvas.', colour: 'gold' },
  ],
};
