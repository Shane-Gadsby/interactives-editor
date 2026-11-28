# Scripts
JavaScript with the ix API, run safely in a sandbox.

Scripts are short programs, written in JavaScript, for the things the interaction nodes can't do. If you do not write code, the nodes cover most needs: see [Interactions](interactions). Add scripts in the **Scripts** tab. A script runs on start (tick **Run on start**) or from a **Run script** node; short code can go straight into a **Run code** node.

```
const ball = ix.node('Ball');
ix.onFrame((dt) => ball.set('x', (ball.get('x') + dt * 0.1) % ix.artboard.width));
ix.on('reset', () => { ix.vars.score = 0; });
await ix.node('Title').animate('opacity', 1, { duration: 600, ease: 'easeOut' });
```

## Code colours

The **Code colours** buttons above the code (**Follow**, **Light**, **Dark**) set the colours of the code box.
- **Follow** goes light or dark with the editor's theme. It is the default.
- **Light** is dark code on a light page, and **Dark** is light code on a dark page, whatever the editor looks like.

The same buttons are above the raw text in the Data tab, and the setting reaches every code box at once. It is also in [Preferences](preferences) as **Code editor colours** (General page, Appearance). It is your own setting, not saved in the project.

## The ix API
| Call | Does |
|---|---|
| `ix.vars.name`, `ix.get(name)`, `ix.set(name, v)` | Read and write variables (not a live one: those are worked out from their formula and read only) |
| `ix.reset(name, ...)` | Put variables back to their starting values |
| `ix.toggleItem(name, v)`, `ix.removeValue(name, v)`, `ix.setItem(name, index, v, field?)` | Change a list variable: add or take out a value, take out every match, or replace one item (or one field of it) |
| `ix.node('Name')` | A layer by name or id: `.get(prop)`, `.set(prop, v)`, `.show()`, `.hide()`, `.toggle()`, `await .animate(prop, v, {duration, ease})` |
| `ix.timeline('Name')` | `.play()`, `.pause()`, `.stop()`, `.restart()`, `.reverse()`, `.seek(ms)` |
| `ix.goTo('Artboard', 'fade')` | Go to another artboard |
| `await ix.moveView('Layer', {padding, maxZoom, duration, ease})` / `ix.resetView({duration, ease})` | Pan and zoom the page to frame a layer / back to the whole page (see [Moving the view](moving-the-view)) |
| `ix.emit(name, data)` / `ix.on(name, fn)` | Send messages to the host page / react to them |
| `ix.announce(text, 'polite' | 'assertive')` | Say something to screen readers (see [Accessibility](accessibility)) |
| `ix.toast(name, message?)` / `ix.hideToast(name?)` | Show a [toast](overlays#toasts) by its page's name, with the words it says this time, or put it (or every toast) away |
| `ix.soundPlaying(name?)` / `ix.soundsPlaying()` | Is a Play sound sound going (any, or one asset by name or id), and the names of the ones going |
| `ix.setTheme(name)` / `ix.getTheme()` / `ix.themes()` | Show a [theme](themes) by name (`'auto'` follows the viewer), read the one showing, list them |
| `ix.record(name, value?)` | Count that something happened, for [Insights](insights) (a name up to 60 characters, a short value) |
| `ix.setInstanceInput(layer, name, v)` / `ix.getInstanceInput(layer, name)` / `ix.fireInstanceTrigger(layer, name, data)` | Set or read a variable inside an [instance](instances), or send a message into it only |
| `ix.onFrame((dt, t) => …)` | Run every frame |
| `ix.pointer`, `ix.artboard` | Pointer `{x, y, down}`, artboard `{name, width, height}` |
| `ix.data.name`, `await ix.loadData(name)` | Data sources |
| `ix.context.firstName`, `ix.context.courseCode`, `ix.context.isStaff` | The course and learner, read only ([Course and learner context](course-context)) |
| `ix.link.program` | A value from the address the project was opened with (`?program=GCSC`), as text, read only ([Values on the link](course-context#values-on-the-link)) |
| `await ix.course.stamp(collection, 'Gold star')`, `await ix.course.count(collection, 'quizzes', 3)`, `await ix.course.read(collection)` | Stamps and counters shared by every interactive in the learner's course ([Course collections](course-collections)) |
| `ix.setCursor('grab')`, `ix.log(…)` | Cursor, logging |
| `ix.reducedMotion` | True when the viewer's device asks for less motion, the same as `reducedMotion` in expressions |
| `await ix.saveFile('plan.csv', text, 'text/csv')` | Hand the viewer a file the script made, like **Download a file**; true when it was handed over |
| `ix.today('dd-mm-yyyy')` | Today's date as text, with the letters the `today` expression takes |

A `.set()` wins over an `.animate()` or a drag's glide still on its way to the same property: the move stops where it is and the value you set stays. `.set()` and `.animate()` change the properties in the [Animatable properties](animatable-properties) (position, size, colour, text, visibility, link URL…) and a layer's `fill`, `stroke`, `shadow` and auto layout. Anything else, such as an embed's `html`, `className`, `bindings` or a layer's `repeat`, is part of how the project was built: the call throws an error saying so. Links only go to `http(s)`, `mailto`, `tel` or relative addresses.

To paint a layer from a script every frame (generative art, particles, charts), use a [Script layer](script-layers).

## A script that won't run
A script with a mistake in how it's written (a missing bracket, a stray character) never starts, and the page it's on just doesn't do what it should. So each time the project saves, every script and every **Run code** node is checked, and a red message names the first one that won't run, why, and the line. The project is still saved. It says it once for each set of mistakes, not on every keystroke.

## The sandbox
The sandbox is a locked room for scripts, so a script can't harm the page or the learner's browser. New projects run scripts in it. It is a separate JavaScript engine compiled to WebAssembly. Scripts there can only use `ix`, timers and `console`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped.

**Run scripts in the sandbox** in Project settings turns it off, so scripts run in the page itself with full access (`node.element`, `fetch`, the DOM). Keep it on for code you do not trust, and turn it off only for code you trust that needs the page. A script in the page can also hand the viewer a file it has made, of any kind (a PDF it drew, say), the way any web page does: a link with `download` on it, pointed at a `Blob` and clicked. That works in Preview, a share link and the Link for StudyDesk. For text, a CSV or a web page, the [Download a file](sensors#download-a-file) node needs no script at all.

One thing the sandbox does not hide: `ix.loadData(name, url)` fetches the URL the script gives it, from the viewer's browser, so a script can read from, and send data to, the network that way. It follows the project's [data rules](data-sources#what-may-be-loaded): http(s) only, no cookies to other sites, and, if you list **Allowed data hosts** in Project settings, only those hosts. A refused URL makes `loadData` throw, so use `try`/`catch`. Without an allowed-hosts list, only run projects whose scripts you trust.
