# The Activity Designer is parked (11 Nov 2026)

An AI panel in the editor ("Ask the Activity Designer") that builds what a course designer asks for, in the open project,
using UniSQ's Cogniti as the model and the editor's own builders as its hands. It worked (a page with a multiple choice
question, linked from Home, from one Cogniti message in about a minute, with Undo), but it was parked because of Cogniti's
hourly message cap (about 30 per account, shared by everyone on one token) and replies that Cogniti drops when they take
more than about 30 seconds to start. Board doc `activity-designer-parked` has the full story; this file is what to put back.

## It also runs on Gemini now (18 Nov 2026)

`designer-gemini.js` is the same panel and the same route with Gemini as the model, and no message cap to work around: the
model runs the MCP tools itself (read, look up, edit, build, validate) until the request is done. It is still parked, and
it runs with `INTERACTIVES_DESIGNER=on` and `GEMINI_API_KEY` (see the README's env table for where the key comes from).
On the free tier a request takes three to five minutes. Before it comes back for people: the panel's "Use my own Cogniti
allowance" links and the Cogniti wording below need rewording, and the key's project needs billing on (the free tier
lets Google learn from what is sent).

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


# The Frameling integration is parked (18 Nov 2026)

Frameling is a desktop app for drawing animation frame by frame. The editor played its `.flplay` packages as an
**animation** layer, with **Edit in Frameling** to send one back for changes. It is hidden for now, not removed: nothing
in the editor makes a new one or mentions it, and a project that already has one still opens, plays, and lets the layer be
selected, changed and deleted.

## The switch

`src/lib/parked.ts`: `parked.frameling`. Set it to `false` and all of the below comes back.

## What it hides while it's on

- The **Frameling animation** tool (Media group of the tool rail), its command palette entries (`Add: Frameling animation`,
  `Tool: Frameling animation`), the canvas menu's Add entry and its row in Keyboard shortcuts.
- A `.flplay` dropped or picked is turned away with a message (`insert.ts`). Dropping one on an existing animation layer
  still replaces that layer's file, so a project that has one isn't stuck.
- **Place** on an animation asset in the Assets panel.
- In the animation layer's Inspector: **Edit in Frameling**, **Replace file…**, **+ Add a new Frameling animation…** and
  the links to the help topic. The play settings (clip, playing, loop, speed, still frame, copy offset) stay.
- The five animation nodes (`event.animationEnd`, `event.animationMarker`, `action.animationPlay`, `action.animationStop`,
  `action.animationFrame`) in the node palette, the node menus and the node reference, **unless the open project already
  has an animation layer**.
- Help: the **Frameling animations** topic, its row in the scripting table, the four Frameling rows in Animatable
  properties, and the mention under Preview's Less motion.

## What is untouched

- The player: the `animation` layer, `frameling.ts`, the nodes, `ix.playClip` and friends. Exports and old projects play.
- `src/lib/frameling-import.ts`, `src/panels/AnimationInspector.tsx`, the asset kind, usage tracking.
- The MCP server's references are generated from the player's catalog, so an agent can still read about the animation
  nodes. It has no way of making an animation layer's file, so nothing there needed hiding.
- Tests: `test/frameling-layer.test.tsx` switches the flag off for itself. `test/parked-frameling.test.tsx` checks what is
  hidden and what still works.

## To bring it back

1. `parked.frameling = false` in `src/lib/parked.ts`.
2. CHANGELOG lines (Unreleased) that were removed:

- **Edit in Frameling**: a Frameling animation layer whose file has its drawing inside has an Edit in Frameling button. It downloads the .flplay and shows the steps: open it in Frameling, save, then drop the saved file on the layer (or use the new Replace file… button). Every layer keeps its settings. Frameling animations also hold still on a Still frame for viewers who ask for less motion (with Respect reduced motion on), unless marked Essential motion; the copies in a repeater can be staggered with Copy offset; and an animation's pictures are let go once no layer shows it.
- **Frameling animations**: drop a `.flplay` file from Frameling (File > Export for Interactives there) onto the canvas and it plays as its own layer, crisp for pixel art. Pick the clip, whether it plays, loops and how fast in the inspector, with a small preview. Play a Frameling clip, Stop a Frameling animation and Show a Frameling frame control it from a click, When a Frameling clip ends and When a Frameling animation reaches a marker act on it, timelines can scrub its frame, and scripts use `ix.playClip`. Packages and single-file exports carry it.

3. Help-coverage rows (`test/help-coverage.test.ts`):

```
  'Frameling animations': [['frameling-animations', '.flplay']],
  'Edit in Frameling': [['frameling-animations', '## Edit in Frameling'], ['frameling-animations', '**Still frame**'], ['frameling-animations', '**Copy offset**']],
```

4. Turn `test/parked-frameling.test.tsx` round or delete it, and put `'Frameling animation': 'add.animation'` back in
   `test/keymap-coverage.test.ts` if it was taken out.
5. The toolbox docs (`/toolbox-docs`, in si-manager) never mentioned it, so there is nothing to restore there. Add it.
