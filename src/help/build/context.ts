import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 54,
  level: 'intermediate',
  minutes: 15,
  example: 'tut-context',
  topic: {
    id: 'tutorial-context',
    title: 'Personalise it for the course and the learner',
    group: 'Build it',
    summary: 'Greet the learner by first name, name their course, give each course its own due date, and show a line only to staff.',
    keywords: 'tutorial context personalise personalize first name greeting welcome course code course name per-course values course label sample context staff student isStaff studydesk one project several courses',
    body: `You will make a welcome page that greets the learner by their first name, says which course they are in, and tells them when their first assignment is due. The assignment and the week are different in each course, from one project. A line at the bottom shows only to staff. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Personalised for the course and learner**. **Play** runs it and **Make my copy** gives you your own copy.

All of it comes from **context**, a data source every project has. It holds the course the project is in and the person playing. On the **Link for StudyDesk** it is filled in from their StudyDesk session. While you edit, it uses made-up sample values, so you can see what a learner would.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Course welcome** as the name and press **Create project**.

## 2. Greet the learner

1. Pick the **Text** tool in the tool bar down the left, click near the top of the page and type:

   \`{context.firstName ? "Welcome, " + context.firstName + "!" : "Welcome!"}\`

   Anything in curly brackets is a formula. This one says *Welcome, Alex!* with the sample name, and just *Welcome!* when nobody is known (a downloaded file, or a share link opened outside StudyDesk). Always word it so it still reads well with the name missing.
2. Make it big and bold in the Properties panel.
3. Add a second text under it for the course:

   \`{context.courseCode ? "You are in " + context.courseCode + ", " + context.courseName + "." : "Open this from your StudyDesk course to see your course here."}\`

   On the canvas it reads *You are in MAT1000, Introduction to Mathematics.*

## 3. See the sample values

1. Open the **Data** tab at the bottom of the window. **context** is first in the list, marked **built in**. Click it.
2. The table lists every field with its **Sample value**. Change the one beside **context.firstName** to your own name: the greeting on the canvas follows.
3. Clear it to see the page as someone nobody knows would.

Sample values are only for designing. They are never in an export or a share link, and learners never see them.

## 4. Give each course its own values

The assignment and the week it is due are two ordinary variables. Each course can start them at a different value.

1. In the **Variables** tab press **+ Add variable**, pick **Text** and call it **assignment**. Set its starting value to \`first assignment\`.
2. Press **+ Add variable** again, pick **Counter** and call it **dueWeek**. Set it to **5**.
3. Add a text to the page: \`Your {assignment} is due in week {dueWeek}.\`
4. Back in the **Data** tab, with **context** picked, find **Per-course values** and press **+ Add a course**.
5. Type \`MAT1000_*\` in the box. The \`*\` stands for anything, so this row is every run of MAT1000. It says **matches the sample course**, because the sample label is \`MAT1000_26S1_ONC\`.
6. From **Set a variable…** pick **assignment** and type \`problem set\`. Pick **dueWeek** too and make it **4**.
7. Press **+ Add a course** again for \`MAT1001_*\`: **assignment** \`project proposal\`, **dueWeek** **6**. This one says **no match**.

Any course with no row gets the starting values from the Variables tab: *first assignment*, week 5.

## 5. A line only staff see

1. Add a text at the bottom: \`Staff only: students never see this line.\`
2. With it selected, open **Data bindings** in the Properties panel and press **+ Add binding**. Pick **Visible**.
3. Choose **Formula**, then **Edit as formula**, and type \`context.isStaff\`.

The line disappears, because the sample person is a student. In the Data tab's sample values, untick the one beside **context.isStudent** and it shows. \`context.isStaff\` is true for anyone signed in who is not a student.

## 6. Try it

1. Press **Preview**. With the sample course it says *Your problem set is due in week 4.*
2. Close the Preview. In the Data tab, change the sample value of **context.courseLabel** to \`MAT1001_26S2_ONC\`. The MAT1001 row now says **matches the sample course**. Preview again: *Your project proposal is due in week 6.*
3. Try \`ENG1000_26S1_ONC\` to see a course with no row.

To use it for real, give learners the **Link for StudyDesk** from [Share link](export#share-link), not the plain share link: only that link knows the course and the learner. After changing per-course values, press **Update to the latest version** there.

## Good to know

- Rows apply from the top, and a later row wins where two set the same variable. \`MAT1000_*, MAT1001_*\` with a comma covers both in one row.
- A per-course value is only the starting value. Leave **Remember** off on these variables, because a learner's remembered value would win over it.
- Only the course, the first name and display name, and whether the person is a student or staff reach the project. Never a username, email or student number, and none of it goes to results or Insights.

## What you learned

- **context** is a built-in data source: \`context.firstName\`, \`context.courseCode\`, \`context.courseName\`, \`context.isStaff\` and more, usable in any formula.
- **Sample values** in the Data tab show you the page as a learner would see it, and as nobody.
- **Per-course values** start variables differently in each course, so one project serves several.

**Next:** every context field and the rules for per-course values are in [Course and learner context](course-context). Formulas in text and bindings are in [Expressions](expressions) and [Bindings](bindings). For data that comes from a file, see [Data sources](data-sources).`,
  },
};
