# The Activity Designer is parked (11 Nov 2026)

An AI panel in the editor ("Ask the Activity Designer") that builds what a course designer asks for, in the open project,
using UniSQ's Cogniti as the model and the editor's own builders as its hands. It worked (a page with a multiple choice
question, linked from Home, from one Cogniti message in about a minute, with Undo), but it was parked because of Cogniti's
hourly message cap (about 30 per account, shared by everyone on one token) and replies that Cogniti drops when they take
more than about 30 seconds to start. Board doc `activity-designer-parked` has the full story; this file is what to put back.

## What is still in the code (off)

- Server: `designer.js` (Cogniti client, blueprint loop, own-token sealing), the `/api/designer/*` routes in `index.js`.
  Runs only with `INTERACTIVES_DESIGNER=on` **and** `COGNITI_TOKEN`; `/api/session` says `designer: false` otherwise.
- Client: `src/components/DesignerPanel.tsx`, `DesignerAllowance.tsx`, `src/lib/designer*.ts`; the header button in
  `Editor.tsx` only shows when the session says `designer: true`.
- `designer-spec.txt` (the blueprint format sent with each request), `designer-system.txt` (the Cogniti agent's system
  message), `agent-docs/playbook.md` (the agent's Knowledge), `scripts/export-agent-docs.mjs` (the help as Markdown parts
  for the agent's Resources).
- Tests: `test/designer*.test.ts(x)`, `test/server-designer.test.ts` (they switch it on themselves).

## To bring it back

1. Set `INTERACTIVES_DESIGNER=on` and `COGNITI_TOKEN` for the box (pm2 env; never commit the token).
2. Put the help topic back: paste `agent-docs/parked-help-topic.ts.txt` into `TOPICS` in `src/help/topics.ts`. Also restore
   the "Use my own Cogniti allowance" bullet in the `preferences` topic and the "The Activity Designer panel reads sentences
   the same way" paragraph in `interactions` (both in git history before this file was added).
3. Put the Preferences entry back in `src/components/PrefsPages.tsx` (General page, after Notifications), and its import
   `import { DesignerAllowance } from './DesignerAllowance';`:

```tsx
  // ---- Activity Designer
  {
    id: 'designerAllowance',
    page: 'general',
    section: 'Activity Designer',
    label: 'Use my own Cogniti allowance',
    tip: "Everyone's Activity Designer requests share one Cogniti allowance, which can run out. Paste a personal Cogniti API token (Cogniti, your name, User data, API tokens) and your requests use your own allowance instead. The token is checked once, kept encrypted on the server and never shown again",
    words: 'cogniti ai token api key limit allowance hourly designer assistant requests personal',
    keys: [],
    render: () => <DesignerAllowance />,
  },
```

   and turn `test/designer-allowance.test.tsx`'s "not in Preferences" case back into "is a setting on the General page".
4. CHANGELOG lines (Unreleased) that were removed:

- **Ask the Activity Designer**: the speech bubble button at the top right opens a chat panel where you describe what you want in plain words and UniSQ's Activity Designer builds it in your open project while you watch. It reads and checks the project as it goes, and one click on "Undo what the Activity Designer did" puts the project back as it was. Before it changes anything it saves a version called "Before the Activity Designer". It's shared across everyone, so when UniSQ's hourly AI limit is used up it says so and you try again shortly. Requests go to UniSQ's Cogniti with the project's content but no learner data.
- **Ask the Activity Designer is faster and goes further**: it now plans your whole request in one go and builds it with the editor's own tools (the question builder, Describe it, the look of the page you have open), so one request usually uses one of UniSQ's hourly Cogniti messages instead of several.
- **Free answers from the Activity Designer**: "How do I..." questions are answered from the help, with links to the best topics (and an **Ask the Activity Designer anyway** button). One behaviour on a selected layer, such as "when clicked go to the next page", is done on the spot with Describe it. Neither uses a request.
- **A fair share each**: the Activity Designer panel shows how many shared requests you have left this hour.
- **Use my own Cogniti allowance**: paste your own Cogniti API token in Preferences, General, to use your own allowance instead of the shared one. It is kept encrypted and never shown again.

5. Help-coverage rows (`test/help-coverage.test.ts`):

```
  'Ask the Activity Designer': [['activity-designer', 'builds it in your open project'], ['activity-designer', 'Undo what the Activity Designer did'], ['activity-designer', 'reached its hourly limit']],
  'Ask the Activity Designer is faster and goes further': [['activity-designer', 'Ask the Activity Designer anyway']],
  'Free answers from the Activity Designer': [['activity-designer', 'Done without using the AI'], ['interactions', 'Activity Designer']],
  'A fair share each': [['activity-designer', 'shared requests left this hour']],
  'Use my own Cogniti allowance': [['activity-designer', 'Use my own Cogniti allowance'], ['preferences', 'Use my own Cogniti allowance']],
```
