# Public interface: inputs and outputs for developers
List the variables and messages a page that embeds the project may use, with descriptions; get a reference page, TypeScript definitions, player.describe() and web component options.

Someone who embeds your project should not have to read through it to find which variables and messages are meant for them. The **Public interface** tab (bottom panel) is that list.

## The list
- **Variables** are marked **Input** (the page sets it), **Output** (the page reads it) or **Both**, each with a description. They are held by the variable, not its name: rename a variable and the row says so, with **Use the new name** to accept it (the page then has to change too).
- **Messages** are the ones the project **receives** from the page (the ones *When a message arrives* nodes and `ix.on` handlers listen for) and the ones it **sends** (*Send message* nodes and `ix.emit`). Each can have a description and a payload shape: nothing, text, number, true or false, anything, or an object with named fields.
- **Add from what the project uses** finds every message in the project's flows and scripts, and the variables its flows and controls work with. A message found but not listed shows as a **+** button under the messages. Pick any other variable from **Add a variable…**.
- A row is flagged when a listed variable was renamed or deleted, or when no node or script sends or listens for a listed message.

## What you get
- **Reference page** (button in the tab, and **Export > Public interface reference**): inputs, outputs, messages, the element options and a worked embed example, as a page you can send to a developer. A `.ixp` package of a project with a public interface also holds it as `reference.html`, with `interface.d.ts` beside it.
- **TypeScript definitions** (the **.d.ts** button, **Export > TypeScript definitions**): types for each input, output and message, and a player type whose `setVariable`, `getVariable`, `send` and `on` know your names.
- **player.describe()** returns the same list at run time: `{ title, declared, restrictInputs, variables: [{ name, type, direction, description, initial, options }], messages: [{ name, direction, description, payload }], issues }`.
- **Exporting asks first** when the list no longer matches the project (renamed or deleted variables, messages nothing handles), so an embed does not break without anyone knowing.

## Embedding with options
```html
<script src="interactives-player.iife.js"></script>
<interactives-player src="quiz.ixp" style="width:800px;height:600px"
    loading="lazy" poster="quiz.jpg" pause-offscreen
    input-level="hard" input-learnername="Sam"></interactives-player>
<script>
  const el = document.querySelector('interactives-player');
  el.addEventListener('ix-variable', (e) => console.log(e.detail.name, e.detail.value)); // outputs
  el.addEventListener('ix-message', (e) => console.log(e.detail.name, e.detail.payload));
  el.addEventListener('ix-ready', () => el.player.send('addToCart', { sku: 'A1' }));
</script>
```
- **`input-<name>="value"`** and a JSON **`inputs='{"level": "hard"}'`** attribute set variables before the first frame, and again whenever they change. Names are matched ignoring case (attribute names are lower case). Values are converted to the variable's type: a number must be a number, a choice must be one of its options, a list must be JSON. A value that does not fit is skipped with a console warning.
- **`loading="lazy"`**: the project is not fetched until the element is within 200 px of the viewport.
- **`poster="image"`**: an image shows until the project is ready (and while it waits to load).
- **`start="click"`**: the poster (or a plain box) with a play button, and nothing loads until it is used. `el.start()` does the same from script. The click also lets the browser play sound.
- **`pause-offscreen`**: timelines and sound pause while the element is not on screen, and carry on when it comes back.
- **`label`**: the play button's accessible name.
- Outputs arrive as **`ix-variable`** events (`detail` is `{ name, value, previous }`) and, from the single-file export inside an iframe, as `{ source: 'interactives-variable', name, value }` posted to the parent page. Only variables listed as outputs are announced.

## Only public inputs can be set from outside
Off by default, so embeds that already exist keep working. Turn it on and attributes on the element, and `{ target: 'interactives', type: 'setVariable' | 'send' }` messages from the page around an exported file, can only set the **Input** and **Both** variables and send the **Received** messages on the list. Anything else is refused with a console warning. Code that holds the player object (`el.player.setVariable`) is the page's own code and is not held to it.

## Good to know
- The list is documentation first. Nothing about how the project plays changes when you add to it, apart from this option.
- Message names found in scripts are only the ones written out as text (`ix.emit('done')`), not names built from other values. Add those by hand.
- **Update to the latest version** in Share link after changing the list, so the link plays the new version.
