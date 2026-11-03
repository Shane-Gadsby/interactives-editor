import { ANIMATABLE_PROPS, CATALOG, PACKAGE_EXTENSION, type NodeDef } from 'interactives-player';

export interface HelpTopic {
  id: string;
  title: string;
  group: string;
  /** One line, shown in search results and as the tooltip for "?" links. */
  summary: string;
  /** Extra words people might search for. */
  keywords?: string;
  body: string | (() => string);
}

export const GROUPS = ['Getting started', 'Design', 'Web elements', 'Motion', 'Interactivity', 'Data', 'Import and export', 'Working together', 'Reference'];

export const TOPICS: HelpTopic[] = [
  // ---------------------------------------------------------------- getting started
  {
    id: 'welcome',
    title: 'Welcome to Interactives',
    group: 'Getting started',
    summary: 'What Interactives is and how a project fits together.',
    keywords: 'intro overview start tutorial',
    body: `Interactives builds 2D interactive pieces for the web: animated diagrams, explainers, quizzes, small games and UI prototypes. You draw on artboards, animate with timelines, wire up behaviour with an interaction graph, and publish a single HTML file or a package that the player runs anywhere.

## How a project fits together

- **Artboards** are the screens. Each has its own layers, timelines and interactions. See [Artboards](artboards).
- **Layers** are shapes, text, images, groups, frames and real web elements (buttons, inputs, links, embeds, video).
- **Timelines** animate layer properties through keyframes. See [Timelines and keyframes](timelines).
- **Interactions** are a node graph: an event (a click, a key, a timer, a variable change) runs actions (play a timeline, set a variable, go to another artboard). See [Interactions](interactions).
- **Variables** and **data sources** hold values that text, bindings and lists read. See [Variables](variables) and [Data sources](data-sources).
- **Scripts** are JavaScript for anything the nodes can't do. See [Scripts](scripts).

## A first project in five minutes

1. On the projects page choose **New project**.
2. Pick the **Rectangle** tool (<kbd>R</kbd>) and drag on the artboard.
3. Open the **Timeline** tab at the bottom, press **Record**, move the playhead to 1s and drag the rectangle somewhere else. A keyframe appears.
4. Open **Interactions**, add **On pointer** (target: the rectangle, click) and connect it to **Play timeline**.
5. Press **Preview**. Click the rectangle and it moves.
6. **Export → Single HTML file** gives you one file to upload anywhere.

> Everything saves automatically. The label next to the project name says Saved, Saving… or Unsaved.`,
  },
  {
    id: 'projects',
    title: 'Projects page',
    group: 'Getting started',
    summary: 'Create, open, duplicate, import and delete projects.',
    keywords: 'home new import duplicate delete package ixp god mode power user',
    body: `The projects page lists the projects you own, newest first.

- **New project** makes an empty project with one artboard.
- **Import** opens a \`${PACKAGE_EXTENSION}\` package (a whole project with its assets), a project JSON file, a Lottie file or a Rive \`.riv\` file. Lottie and Rive files become a new project.
- Each card can be opened, **duplicated**, **downloaded** as a package or **deleted**. Deleting can't be undone, so download a package first if you might want it back.
- Use the **Help** link at the top for these pages, or press <kbd>F1</kbd> anywhere.

## Who sees what

You see only your own projects. Staff with power-user access can toggle the power-user view (the suite's shared shortcut) to see and open every project; the server checks that access again.`,
  },
  {
    id: 'interface',
    title: 'The editor at a glance',
    group: 'Getting started',
    summary: 'Tools, layers, canvas, inspector and the bottom panels.',
    keywords: 'layout panels toolbar inspector layers dock ui',
    body: `## Top bar
The project name (click to rename), save state, **Live** indicator, people currently in the project, undo/redo, zoom, **Preview**, **Export**, **Preferences** and **Help**.

## Tool bar (left edge)
Drawing tools, then the web-element tools, then **Help** at the bottom. Hover a tool to see its name and shortcut. See [Shapes and paths](shapes) and [Web elements](web-elements).

## Left panel
- **Layers**: the layer tree of the open artboard. Drag to reorder or nest, click the eye to hide and the lock to lock. Double-click to rename.
- **Assets**: images, video, audio, fonts and data files in the project.
- **Artboards**: every artboard; click one to open it.

## Canvas
All artboards side by side. See [Moving around the canvas](canvas). Right-click a layer for cut, copy, order, group, hide, lock and *Add interaction*; right-click an artboard to add a new layer where you clicked, or to duplicate, delete or zoom to it; right-click empty canvas for a new artboard there.

## Inspector (right)
Settings for the selection. With nothing selected it shows the artboard and the project settings. Section titles with a **?** link to the page in these docs.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables** and **Data**. Click a tab to open it, click it again to close it, and drag the top edge to resize.

## Preview
**Preview** runs the project exactly as the exported file will, from the start artboard or the one you're on. **Restart** starts again. The **Debug** panel (on by default) shows:

- **Now showing**: the artboard on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables**: every value as it changes. Type a new value (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too.`,
  },
  {
    id: 'canvas',
    title: 'Moving around the canvas',
    group: 'Getting started',
    summary: 'Zoom, pan, fit, and the wheel preference.',
    keywords: 'zoom pan scroll wheel trackpad pinch fit hand space middle mouse ctrl',
    body: `| Do this | To |
|---|---|
| Scroll the mouse wheel | Zoom in and out around the pointer (default) |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + wheel, or pinch on a trackpad | Zoom (always) |
| <kbd>Shift</kbd> + wheel | Pan sideways |
| Hold <kbd>Space</kbd> and drag, or drag with the middle button | Pan |
| <kbd>H</kbd> | Hand tool (drag to pan) |
| <kbd>Shift</kbd>+<kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to the selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |

## Big projects
Artboards you aren't working on are shown as a picture of themselves, which keeps panning and zooming smooth in projects with many artboards. Click an artboard (or a layer in it) and it comes alive for editing; the picture updates by itself shortly after anything in it changes.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.`,
  },
  {
    id: 'preferences',
    title: 'Preferences',
    group: 'Getting started',
    summary: 'Your own editor settings: wheel, theme, default font, rulers, tooltips.',
    keywords: 'settings options wheel tooltips',
    body: `Open **Preferences** from the gear in the top bar (or on the projects page). They are yours: saved with your account, so they follow you to any browser.

- **Mouse wheel**: *Zoom* (the wheel zooms, Shift+wheel pans) or *Pan* (the wheel pans, Ctrl+wheel zooms). See [Moving around the canvas](canvas).
- **Theme**: dark, light, or auto (follows your system).
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. Open Sans unless you change it; any Google font name works.
- **Show rulers**: rulers and guides on the canvas (also <kbd>Shift</kbd>+<kbd>R</kbd>).
- **Show tooltips**: explanations when you hover buttons and fields.

Project-wide settings (start artboard, fit, sandbox) are in the inspector with nothing selected. See [Project settings](project-settings).`,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Getting started',
    summary: 'Every keyboard shortcut in the editor.',
    keywords: 'keys hotkeys keyboard',
    body: `## Tools
| Key | Tool |
|---|---|
| <kbd>V</kbd> | Select |
| <kbd>H</kbd> | Hand (or hold <kbd>Space</kbd>) |
| <kbd>A</kbd> | Artboard |
| <kbd>F</kbd> | Frame |
| <kbd>R</kbd> | Rectangle |
| <kbd>O</kbd> | Ellipse |
| <kbd>L</kbd> | Line |
| <kbd>P</kbd> | Pen |
| <kbd>N</kbd> | Pencil (freehand) |
| <kbd>T</kbd> | Text |
| <kbd>B</kbd> | Button |

## Editing
| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy / cut / paste (pasting image files inserts them) |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all on the artboard |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection (or the selected keyframes) |
| Arrow keys (<kbd>Shift</kbd> for 10px) | Nudge |
| <kbd>]</kbd> / <kbd>[</kbd> | Bring forward / send backward (<kbd>Ctrl</kbd> for front / back) |
| <kbd>Enter</kbd> | Go into a group or frame, edit a path's points, or edit text |
| <kbd>Escape</kbd> | Stop editing, go up a level, clear the selection, then back to Select |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save now |

## View
| Key | Does |
|---|---|
| <kbd>Shift</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |
| <kbd>Shift</kbd>+<kbd>R</kbd> | Show or hide rulers |

## Help
| Key | Does |
|---|---|
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> | Search the help |
| <kbd>?</kbd> | Open the help |

While dragging: <kbd>Shift</kbd> keeps proportions or snaps angles, <kbd>Alt</kbd> resizes from the centre. In number fields, drag the label to scrub (<kbd>Shift</kbd> ×10, <kbd>Alt</kbd> ×0.1), use arrow keys to step, or type sums like \`100/2\`.`,
  },

  // ---------------------------------------------------------------- design
  {
    id: 'artboards',
    title: 'Artboards',
    group: 'Design',
    summary: 'Screens with their own size, background, timelines and interactions.',
    keywords: 'screen page scene size background start',
    body: `An artboard is one screen of the interactive. Each has a size, a background, its layers, its timelines and its interactions. Variables, scripts, data and assets belong to the whole project and are shared.

- Draw a new one with the **Artboard** tool (<kbd>A</kbd>) or add one from the Artboards list.
- Click an artboard's name on the canvas to select it; the inspector then shows its size, background and **Clip content to artboard**.
- The **start artboard** is the one the player shows first (Project settings).
- Move between artboards at runtime with the **Go to artboard** action (with a transition) or \`ix.goTo('Name', 'fade')\`.
- An artboard can also be placed inside another as an [instance](instances), like a reusable component.`,
  },
  {
    id: 'shapes',
    title: 'Shapes and paths',
    group: 'Design',
    summary: 'Rectangles, ellipses, polygons, stars, lines, the pen and the pencil, and editing points.',
    keywords: 'rectangle ellipse circle polygon star line pen pencil freehand bezier vertices points path draw',
    body: `Pick a tool and drag on an artboard. Hold <kbd>Shift</kbd> for squares, circles and 45° lines, and <kbd>Alt</kbd> to draw from the centre. A single click makes a default-sized shape.

## Pen (P)
Click to add corner points, drag to add smooth points with handles. Click the first point to close the shape, or press <kbd>Enter</kbd>/<kbd>Escape</kbd> to finish an open path.

## Pencil (N)
Draw freehand. The stroke is smoothed into a few bezier curves when you let go. End where you started to make a closed, filled shape.

## Editing points
Select a path and press <kbd>Enter</kbd> (or double-click). Drag points and handles, click a point and press <kbd>Delete</kbd> to remove it. <kbd>Escape</kbd> or <kbd>Enter</kbd> finishes.

## Shape settings
- **Rectangle**: corner radius.
- **Polygon**: number of sides. **Star**: points and inner ratio (how deep the points are).
- **Path**: closed or open, fill rule (non-zero or even-odd for holes).

Boolean operations (union, subtract, intersect, exclude) turn several shapes into one path. See [Align, arrange and combine](arrange).`,
  },
  {
    id: 'fill-stroke',
    title: 'Fill, stroke and effects',
    group: 'Design',
    summary: 'Solid, gradient and image fills; strokes, dashes and trim; shadow, blur and blend modes.',
    keywords: 'colour color gradient linear radial image fill stroke border dash cap join shadow blur blend opacity trim path',
    body: `## Fill
Solid colour, **linear** or **radial** gradient (add and move stops, set the angle) or an **image** fill (cover, contain or stretch). Colours accept hex, \`rgb()\`, \`hsl()\` and names; the number box beside a colour is its opacity.

## Stroke
Colour, width, **cap** (butt, round, square), **join** (miter, round, bevel) and **dash** (e.g. \`8 4\` for 8 on, 4 off).

### Trim path
**Trim start**, **Trim end** and **Trim offset** (all 0–100%) draw only part of a stroke. Animate *Trim end* from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
- **Opacity** of the whole layer.
- **Shadow**: x, y, blur, spread and colour.
- **Layer blur**: blurs the layer.
- **Blend**: how the layer mixes with what is under it (multiply, screen, overlay, …).

Most of these can be animated: look for the diamond next to a field. See [Animatable properties](animatable-properties).`,
  },
  {
    id: 'text',
    title: 'Text',
    group: 'Design',
    summary: 'Text layers, fonts, sizing and live values in text.',
    keywords: 'font typography type size weight align template variables google fonts upload',
    body: `Use the **Text** tool (<kbd>T</kbd>): click for text that grows as you type, or drag a box for wrapping text. Double-click text to edit it, and <kbd>Escape</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

- **Sizing**: *Auto width* (one line, grows sideways), *Auto height* (fixed width, wraps and grows down) or *Fixed* (clips nothing, you set both).
- **Font**: any Google font by name, or a font file you upload in the **Fonts** section of Project settings.
- Weight, italic, size, line height, letter spacing, alignment, vertical alignment, case and decoration.

## Live values in text
Anything in braces is an [expression](expressions): \`Score: {score}\`, \`{name.toUpperCase()}\`, \`{items.length} items\`. Write \`{{\` for a literal brace.`,
  },
  {
    id: 'images-media',
    title: 'Images, video, audio and assets',
    group: 'Design',
    summary: 'Adding files, the Assets panel, and 9-slice scaling for images.',
    keywords: 'image picture photo svg video audio sound mp3 upload drop paste asset nine slice 9-slice n-slice',
    body: `Drop files on the canvas, paste them, or use the **Image** tool. SVG files become editable vector layers; other images become image layers. Video files become video layers; audio files are stored as assets for the **Play sound** action.

The **Assets** panel lists every file in the project with its size. Removing an asset that layers still use leaves those layers empty.

## Image settings
**Fit** (cover, contain, stretch), corner radius, and:

### 9-slice scaling
Turn on **9-slice** and set the four insets (in image pixels). The corners keep their size and the edges and middle stretch, so a rounded panel or button image can be resized without distortion.

## Video
Autoplay, loop, muted, controls and fit. Most browsers only autoplay muted video.`,
  },
  {
    id: 'groups-frames',
    title: 'Groups and frames',
    group: 'Design',
    summary: 'Grouping layers, frames that clip and lay out, and scrolling frames.',
    keywords: 'group frame container clip mask nest focus scroll scrollable overflow',
    body: `- A **group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) moves, scales and animates its layers together. Its size follows its contents.
- A **frame** (<kbd>F</kbd>) is a box with its own fill, stroke and corner radius. It can **clip** its contents and can use [auto layout](auto-layout).

Press <kbd>Enter</kbd> on a group or frame to work inside it; <kbd>Escape</kbd> goes back out.

## Scrolling frames
Set a frame's **Overflow** to *Scroll vertically*, *Scroll horizontally* or *Scroll both*. Content beyond the frame can then be scrolled with the wheel, a trackpad or touch in the player, like a scrollable panel. An **On scroll** event set to *Is scrolled* fires as it scrolls, with \`event.scrollTop\`, \`event.scrollLeft\` and \`event.progress\` (0 to 1). In the editor the frame stays still so you can edit it; scroll it in Preview.`,
  },
  {
    id: 'auto-layout',
    title: 'Auto layout',
    group: 'Design',
    summary: 'Frames that arrange their children in rows or columns, with fill, hug and percent sizes.',
    keywords: 'flex flexbox row column stack gap padding justify align wrap hug fill percent absolute responsive',
    body: `Turn on **Auto layout** on a frame and its children are placed for you, like CSS flexbox.

| Setting | Meaning |
|---|---|
| Direction | Row (left to right) or column (top to bottom) |
| Gap | Space between children |
| Padding | Space inside the frame's edges |
| Justify | Where children sit along the direction: start, centre, end, space between |
| Align | Across the direction: start, centre, end, stretch |
| Wrap | Start a new row/column when one is full |
| Hug width / height | The frame shrinks or grows to fit its children |

## Child sizing
Each child of an auto-layout frame gets a **Layout** section:

- **Fixed**: its own width/height.
- **Fill**: shares the frame's free space with other fill children.
- **Hug**: fits its own contents (frames and text).
- **Percent**: a percentage of the frame.
- **Margin** around it.
- **Position**: *In flow* (laid out), *Absolute* (placed by insets from the frame's edges, e.g. pinned to the bottom right) or *Ignore* (keeps its own x/y).

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.`,
  },
  {
    id: 'arrange',
    title: 'Align, arrange and combine',
    group: 'Design',
    summary: 'Align and distribute, layer order, and boolean shape operations.',
    keywords: 'align distribute center order front back boolean union subtract intersect exclude combine snap',
    body: `## Align and distribute
With several layers selected, the bar at the top of the inspector aligns their edges or centres, and distributes three or more evenly. With one layer selected it aligns to the parent.

## Snapping
Layers snap to other layers' edges and centres while you drag; guide lines show what snapped. Hold <kbd>Ctrl</kbd> to drag without snapping. Rulers (<kbd>Shift</kbd>+<kbd>R</kbd>) show positions, and dragging from a ruler makes a guide that layers snap to. Drag a guide back onto the ruler to remove it.

## Order
<kbd>]</kbd> and <kbd>[</kbd> move a layer up and down; add <kbd>Ctrl</kbd> to go to the top or bottom. Or drag in the Layers panel.

## Boolean operations
Select two or more shapes and choose **Union**, **Subtract**, **Intersect** or **Exclude** in the inspector. The result is a single path; the originals are replaced.`,
  },
  {
    id: 'instances',
    title: 'Instances (components)',
    group: 'Design',
    summary: 'Place one artboard inside another, with its own timelines, interactions and inputs.',
    keywords: 'component nested artboard reuse symbol instance inputs',
    body: `Any artboard can be placed inside another as an **instance**: a live copy that runs its own timelines and interactions on the parent's clock. Edit the source artboard and every instance updates.

- Select a layer and use **Place as instance** in the inspector, or choose an artboard in an instance layer's **Artboard** field.
- **Fit** decides how the artboard sits in the instance's box (fill, contain, cover, none).
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source.
- Messages sent inside an instance (**Send message**, \`ix.emit\`) bubble up to the parent.

Instances can be nested up to six deep. An artboard that contains itself stops at that limit.`,
  },
  {
    id: 'constraints',
    title: 'Constraints',
    group: 'Design',
    summary: 'Make a layer follow a path or copy another layer\'s position, rotation or scale.',
    keywords: 'constraint follow path motion path copy transform translation rotation scale attach',
    body: `Constraints keep a layer tied to another one while things move. Add one in the **Constraints** section of the inspector.

| Constraint | What it does |
|---|---|
| Follow path | Places the layer along a path. **Distance** (0–100%) is how far along; animate it to move along the path. **Orient** turns the layer to face along the path. |
| Copy position | Takes another layer's position (plus an offset). |
| Copy rotation | Takes another layer's rotation. |
| Copy scale | Takes another layer's scale. |

Every constraint has a **Strength** (0–100%) that mixes between the layer's own value and the constrained one, and it can be animated. Constraints are applied in the player and on the canvas.`,
  },

  // ---------------------------------------------------------------- web
  {
    id: 'web-elements',
    title: 'Web elements',
    group: 'Web elements',
    summary: 'Real buttons, inputs, links, embeds and video that work with keyboards and screen readers.',
    keywords: 'button input text field checkbox slider range select dropdown link embed iframe html video aria accessibility',
    body: `Web elements are real HTML controls, so they work with keyboards, screen readers and forms.

- **Button** (<kbd>B</kbd>): a label (which can use \`{expressions}\`), fill, stroke and corner radius. Use **On pointer → Click** to react.
- **Input**: text, number, email, password, multi-line, checkbox, slider (range) or dropdown (select). Bind it to a **variable** and it reads and writes that variable both ways. **On variable change** then reacts to what was typed.
- **Link**: text that opens a URL.
- **Embed**: an iframe from a URL, or your own HTML.
- **Video**: a video file or URL.

## Accessibility
Every layer has an **ARIA label** and a **CSS class** in the Advanced section. Give shapes that act like buttons an ARIA label. The player honours the viewer's *reduce motion* setting when the project setting **Respect reduced motion** is on.`,
  },
  {
    id: 'links-cursors',
    title: 'Links and cursors',
    group: 'Web elements',
    summary: 'Make any layer a link, and choose the cursor shown when hovering it.',
    keywords: 'hyperlink url href target new tab cursor pointer hand custom cursor image hotspot',
    body: `## Link
In the **Link** section, give any layer a **URL** and it becomes a real link. **Open in** chooses where: a new tab, the same frame, the parent frame, or the whole page (useful when the interactive is embedded in an iframe). URLs can contain \`{expressions}\`.

The **Open URL** action does the same from an interaction.

## Cursor
**Cursor on hover** sets the cursor shown while the pointer is over the layer and its children, the way CSS \`:hover { cursor: pointer }\` works. *Automatic* gives links and layers with a click, press or release interaction a pointer. Choose the cursor shown over the layer (pointer, grab, crosshair, text, not-allowed, …) or **Custom image** with a hotspot (the point of the image that clicks). Change it at runtime with **Set cursor** or \`ix.setCursor('grab')\`.`,
  },

  // ---------------------------------------------------------------- motion
  {
    id: 'timelines',
    title: 'Timelines and keyframes',
    group: 'Motion',
    summary: 'Animate properties with keyframes, record mode, looping and playback.',
    keywords: 'animation animate keyframe key record playhead loop ping pong autoplay speed duration track',
    body: `Each artboard can have any number of timelines. A timeline has **tracks**; each track animates one property of one layer through **keyframes**.

## Adding keyframes
- Press **Record** (the red dot). While recording, every change you make to an animatable property at the playhead becomes a keyframe.
- Or click the diamond next to a field in the inspector to key its current value.
- Drag keys to retime them, <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove.

## Timeline settings
| Setting | Meaning |
|---|---|
| Duration | Length in milliseconds |
| Loop | Once, loop, or ping-pong |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast, negative plays backwards) |

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). Select a key to change its time or value.

## Design view
Switching artboards opens them in **design view**: the canvas shows the layers as they are, not a frame of an animation. Choose a timeline in the Timeline tab to see and edit its frames; choose *Design view* again to go back.

## Playing from interactions
**Play timeline** plays, pauses, stops, restarts, reverses or seeks a timeline. From scripts: \`ix.timeline('Intro').play()\`. **On timeline end** fires when one finishes.`,
  },
  {
    id: 'easing',
    title: 'Easing',
    group: 'Motion',
    summary: 'How a value moves between two keyframes.',
    keywords: 'ease interpolation curve bezier linear step elastic bounce back cubic',
    body: `| Easing | Feels like |
|---|---|
| linear | Constant speed |
| step | Jumps at the next key (no in-between) |
| easeIn | Starts slow, ends fast |
| easeOut | Starts fast, settles gently |
| easeInOut | Slow at both ends |
| backIn / backOut | Pulls back before, or overshoots after |
| elasticOut | Springs past and wobbles into place |
| bounceOut | Bounces at the end |
| Custom bezier | Your own curve: drag the two handles |

The same names work in **Animate property** nodes and in \`node.animate(prop, value, { ease: 'easeOut' })\`.`,
  },
  {
    id: 'joysticks',
    title: 'Joysticks',
    group: 'Motion',
    summary: 'Scrub one or two timelines from numbers, for dials, eyes that follow the pointer and blends.',
    keywords: 'joystick blend scrub drive timeline progress follow pointer dial gauge',
    body: `A **joystick** connects numbers to timeline positions. Instead of playing over time, the timeline sits at the position the numbers say.

Add one in the **Joysticks** section of the artboard (select the artboard).

- **X timeline** and **Y timeline**: one or two timelines to drive (Y is optional).
- **X value** and **Y value**: [expressions](expressions) from 0 to 1, for example \`pointer.x / artboard.width\` or a variable \`volume\`.

Examples: a dial that turns with a variable, a character whose eyes follow the pointer (a left-right timeline and an up-down timeline), or a gauge that fills with a score. \`pointer\` (\`{x, y}\` on the artboard) and \`artboard\` (\`{width, height}\`) are in scope.`,
  },

  // ---------------------------------------------------------------- interactivity
  {
    id: 'interactions',
    title: 'Interactions',
    group: 'Interactivity',
    summary: 'The node graph: events start a flow, actions do things, logic chooses the way.',
    keywords: 'interaction graph node event action logic state machine wire edge connect flow',
    body: `Open the **Interactions** tab. Each artboard has its own graph.

- **Events** (green) start a flow: a click, a key, a timer, a variable changing, a timeline ending, a message from the host page, scrolling, data loading, or the artboard starting.
- **Actions** (blue) do something and continue: play a timeline, set a variable, set or animate a property, show or hide, go to another artboard, open a URL, play a sound, run a script, send a message, wait.
- **Logic** (purple) chooses where to go: *If*, *Switch*, *Once*, *Sequence*.

Drag from an output port to the next node's input to connect them. Click a node in the palette on the left (or drag it onto the graph) to add it; select a node to edit its settings on the right. Every node is listed in [Interaction node reference](interaction-nodes).

## What's in scope
Expression fields can use every variable and data source by name, \`event\` (details of what fired: \`event.key\`, \`event.x\`, \`event.index\` for a repeated copy, \`event.payload\` for a message) and \`Math\`.

## Messages to and from the host page
**Send message** (and \`ix.emit\`) posts \`{source: 'interactives', name, payload}\` to the page the interactive is in. The page can send messages back with \`player.send(name, payload)\` and **On message** reacts. See [Embedding and the player API](embedding).`,
  },
  {
    id: 'interaction-nodes',
    title: 'Interaction node reference',
    group: 'Interactivity',
    summary: 'Every event, action and logic node with its settings.',
    keywords: 'nodes catalog reference events actions logic parameters',
    body: () => {
      const section = (title: string, cat: NodeDef['category']) =>
        `## ${title}\n\n` +
        CATALOG.filter((d) => d.category === cat)
          .map((d) => {
            const params = d.params
              .map((p) => `- **${p.label}**${p.help ? `: ${p.help}` : p.options ? `: ${p.options.map((o) => o.label).join(', ')}` : ''}`)
              .join('\n');
            const outs = d.outputs.filter((o) => o.label).map((o) => o.label);
            return `### ${d.label}\n${d.description}${outs.length ? ` Outputs: ${outs.join(', ')}.` : ''}\n\n${params}`;
          })
          .join('\n\n');
      return [section('Events', 'event'), section('Actions', 'action'), section('Logic', 'logic')].join('\n\n');
    },
  },
  {
    id: 'variables',
    title: 'Variables',
    group: 'Interactivity',
    summary: 'Named values (number, text, true/false, colour, choice) shared by the whole project.',
    keywords: 'variable state value number string boolean color enum choice options input',
    body: `Variables hold the state of an interactive: a score, a name, whether a panel is open. They belong to the project, so every artboard sees the same values.

Add them in the **Variables** tab. Each has a name, a type and a starting value.

| Type | Holds |
|---|---|
| Number | \`0\`, \`3.5\` |
| Text | \`"Hello"\` |
| True/false | \`true\` or \`false\` |
| Colour | \`#3b5bfd\` |
| Choice | One of a list of options you define, like \`easy\`, \`medium\`, \`hard\` |

Choice variables show as a dropdown wherever you set them, so you can't type a value that isn't on the list.

## Using variables
- In text: \`Score: {score}\`.
- In [bindings](bindings): drive any property from a variable.
- In interactions: **Set variable** (set, add, toggle), **On variable change**.
- On inputs: bind a text field, checkbox or slider to a variable.
- In scripts: \`ix.vars.score += 1\`.
- From the host page: \`player.setVariable('score', 10)\`.

Variable names must be letters, digits and \`_\` so expressions can use them.`,
  },
  {
    id: 'expressions',
    title: 'Expressions',
    group: 'Interactivity',
    summary: 'Short JavaScript formulas in text, bindings and node settings.',
    keywords: 'expression formula javascript template braces condition ternary math',
    body: `An expression is a short piece of JavaScript that gives a value. Variables and data sources are in scope by name.

\`\`\`
score + 1
name.toUpperCase()
lives > 0 ? "Play again" : "Game over"
Math.round(progress * 100) + "%"
products.filter(p => p.inStock).length
\`\`\`

## Where they go
- **Text**: anything in \`{braces}\`.
- **Bindings**: a property's value. See [Bindings](bindings).
- **Node settings** marked *expr*, such as Set variable's value or If's condition.
- **Repeat → Items**: the list to repeat over.

In repeated copies, \`item\` and \`index\` are the current list item and its position. In interactions, \`event\` describes what fired.

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).`,
  },
  {
    id: 'bindings',
    title: 'Bindings',
    group: 'Interactivity',
    summary: 'Drive a layer property from a variable, data or expression, live.',
    keywords: 'bind binding data binding property drive reactive',
    body: `A binding sets a layer's property from an [expression](expressions), and keeps it up to date as variables and data change. In the **Data bindings** section of the inspector, pick a property and type the expression.

Examples:

| Property | Expression |
|---|---|
| Width | \`progress * 300\` |
| Fill colour | \`correct ? "#2e7d32" : "#c62828"\` |
| Visible | \`step === 3\` |
| Text | \`products[0].name\` |
| Rotation | \`speed * 3\` |

A bound property shows a link icon and can't be changed by hand or keyframed until you remove the binding. Every animatable property can be bound; see [Animatable properties](animatable-properties).`,
  },
  {
    id: 'scripts',
    title: 'Scripts',
    group: 'Interactivity',
    summary: 'JavaScript with the ix API, run safely in a sandbox.',
    keywords: 'script javascript code ix api sandbox quickjs wasm onframe animate await',
    body: `Scripts are JavaScript for what the nodes can't do. Add them in the **Scripts** tab. A script runs on start (tick **Run on start**) or from a **Run script** node; short code can go straight into a **Run code** node.

\`\`\`
const ball = ix.node('Ball');
ix.onFrame((dt) => ball.set('x', (ball.get('x') + dt * 0.1) % ix.artboard.width));
ix.on('reset', () => { ix.vars.score = 0; });
await ix.node('Title').animate('opacity', 1, { duration: 600, ease: 'easeOut' });
\`\`\`

## The ix API
| Call | Does |
|---|---|
| \`ix.vars.name\`, \`ix.get(name)\`, \`ix.set(name, v)\` | Read and write variables |
| \`ix.node('Name')\` | A layer by name or id: \`.get(prop)\`, \`.set(prop, v)\`, \`.show()\`, \`.hide()\`, \`.toggle()\`, \`await .animate(prop, v, {duration, ease})\` |
| \`ix.timeline('Name')\` | \`.play()\`, \`.pause()\`, \`.stop()\`, \`.restart()\`, \`.reverse()\`, \`.seek(ms)\` |
| \`ix.goTo('Artboard', 'fade')\` | Go to another artboard |
| \`ix.emit(name, data)\` / \`ix.on(name, fn)\` | Send messages to the host page / react to them |
| \`ix.onFrame((dt, t) => …)\` | Run every frame |
| \`ix.pointer\`, \`ix.artboard\` | Pointer \`{x, y, down}\`, artboard \`{name, width, height}\` |
| \`ix.data.name\`, \`await ix.loadData(name)\` | Data sources |
| \`ix.setCursor('grab')\`, \`ix.log(…)\` | Cursor, logging |

## The sandbox
New projects run scripts in a sandbox: a separate JavaScript engine compiled to WebAssembly. Scripts there can only use \`ix\`, timers and \`console\`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped. Turn **Run scripts in the sandbox** off in Project settings only for code you trust that needs the page (\`node.element\`, \`fetch\`).`,
  },

  // ---------------------------------------------------------------- data
  {
    id: 'data-sources',
    title: 'Data sources',
    group: 'Data',
    summary: 'JSON, CSV, TSV or text from an uploaded file or a URL, used by name.',
    keywords: 'data json csv tsv text url fetch api spreadsheet refresh cors',
    body: `Open the **Data** tab and add a source **From file** (upload) or **From URL** (fetched by the player).

- **Format**: JSON, CSV or TSV (first row is the column names), or plain text. CSV and TSV become a list of rows, with numbers and true/false converted.
- **Refresh** (URLs): fetch again every n seconds; 0 loads once.
- The preview on the right shows what was loaded, with the field names you can use.

Use a source by its **name** anywhere expressions go: \`{products.length} products\`, a binding \`products[0].price\`, or **Repeat → Items** \`products\`. Scripts read \`ix.data.products\`.

**Load data** reloads a source (optionally from a different URL); **On data loaded** fires when it arrives. The host page can push data with \`player.setData('products', [...])\`.

> URLs must allow cross-origin requests (CORS) from wherever the interactive is published.`,
  },
  {
    id: 'repeaters',
    title: 'Repeated lists',
    group: 'Data',
    summary: 'Copy a layer once per item in a list, with item and index in scope.',
    keywords: 'repeat repeater list loop for each item index grid table',
    body: `Turn on **Repeat** on a group or frame and its **first child** is copied once per item in **Items** (an expression that gives a list, like \`products\` or \`[1, 2, 3]\`).

Inside the copies, \`item\` is the current item and \`index\` its position (from 0): \`{index + 1}. {item.name} - {item.price}\`.

**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best).

Clicks on a copy fire **On pointer** for the template layer with \`event.index\`, so \`products[event.index]\` is the item that was clicked.`,
  },
  {
    id: 'project-settings',
    title: 'Project settings',
    group: 'Data',
    summary: 'Start artboard, fit, page title, fonts, sandbox and reduced motion.',
    keywords: 'settings start artboard fit scale page title background fonts sandbox reduced motion',
    body: `Click an empty part of the canvas to see Project settings in the inspector.

| Setting | Meaning |
|---|---|
| Start artboard | Shown first in the player |
| Fit | How the artboard scales to the space it's given: contain, cover, fill, fit width, or none |
| Page title / Page bg | Title and background of the exported HTML page |
| Fonts | Google fonts by name, or uploaded font files |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |`,
  },

  // ---------------------------------------------------------------- import/export
  {
    id: 'import',
    title: 'Importing Lottie, Rive and SVG',
    group: 'Import and export',
    summary: 'Bring in Lottie JSON / dotLottie, Rive .riv files, SVG and project packages.',
    keywords: 'import lottie dotlottie rive riv svg after effects bodymovin convert',
    body: `Lottie and Rive files: use **Import** in the Layers panel (adds artboards to this project) or on the projects page (makes a new project).

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients, transforms, trim paths, masks and keyframes with easing become layers and a timeline. Expressions, effects and text animators are not carried over.

## Rive (.riv)
Each Rive artboard becomes an artboard: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Bones, meshes and data binding are not carried over yet.

## SVG
Drop an SVG file on the canvas, paste it, or pick it with the **Image** tool. It becomes a group of editable vector layers: shapes and paths (with their transforms applied), groups, solid and gradient fills, strokes and dashes, and simple text. Masks, filters, patterns and embedded images are listed as not carried over.

After an import, a report lists anything that couldn't be carried over exactly.`,
  },
  {
    id: 'export',
    title: 'Exporting',
    group: 'Import and export',
    summary: 'Single HTML file, project package, JSON, Lottie, PNG and SVG.',
    keywords: 'export download html single file package ixp json lottie png svg image publish',
    body: `**Export** in the top bar:

| Export | Gives you |
|---|---|
| Single HTML file | One file with the player, the project and every asset. Upload or embed it anywhere; it works offline. |
| Project package (${PACKAGE_EXTENSION}) | The whole project with assets, to re-import or play with the player library |
| Project JSON | The document only, without asset files |
| Lottie JSON / dotLottie | The open artboard's shapes and timeline, for Lottie players (no interactivity) |
| PNG image | The open artboard as a picture, at 2× or 1×, at the timeline's playhead |
| SVG image | The open artboard as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |

## Share link
**Export → Share link** publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it); links are long and random so they can't be guessed. It is a snapshot: press **Update to the latest version** to publish later changes, or **Turn off link** to stop it working.`,
  },
  {
    id: 'embedding',
    title: 'Embedding and the player API',
    group: 'Import and export',
    summary: 'Put an interactive on a page, size it, and talk to it from JavaScript.',
    keywords: 'embed iframe player api web component script host postmessage height resize toolbox',
    body: `## The simplest way
Upload the **Single HTML file** and show it in an iframe. Inside the StudyDesk Toolbox the player reports its height to the page so the iframe fits (the suite's \`setILARSize\` or a \`{width: null, height, cacheID}\` message).

## The web component
\`\`\`
<script src="interactives-player.iife.js"></script>
<interactives-player src="scene.ixp" fit="contain" style="width:800px;height:600px"></interactives-player>
\`\`\`
Messages the project sends arrive as \`ix-message\` events.

## From JavaScript
\`\`\`
import { Player, loadProject } from 'interactives-player';
const player = new Player(document.getElementById('stage'), await loadProject('scene.ixp'));
player.on('message', ({ name, payload }) => console.log(name, payload));
player.send('addToCart', { sku: 'A1' });
player.setVariable('score', 10);
player.timeline('Intro').play();
player.goTo('Checkout', 'fade');
player.setData('products', [...]);
\`\`\``,
  },

  // ---------------------------------------------------------------- together
  {
    id: 'live-editing',
    title: 'Live editing and saving',
    group: 'Working together',
    summary: 'Several people in one project, autosave, revisions and conflicts.',
    keywords: 'multiplayer collaborate live share presence cursor save autosave conflict undo revision history version restore',
    body: `Everything saves as you work. When others open the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **history** button (the clock) in the top bar to see them, preview one, and **Restore** it. Restoring is itself saved as a new revision, so it can be undone.`,
  },

  {
    id: 'ai-agents',
    title: 'AI agents (MCP)',
    group: 'Working together',
    summary: 'Let an AI agent join your editing session to build, change and debug alongside you.',
    keywords: 'ai agent claude mcp model context protocol assistant automation llm copilot',
    body: `An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects through the **Interactives MCP server**, a small program any MCP client (Claude Code, Claude Desktop and others) can start.

## Setting it up
The server is \`mcp/dist/interactives-mcp.mjs\` in the editor's repository. Add it to your MCP client, for example in Claude Code:

\`\`\`
claude mcp add interactives -e INTERACTIVES_URL=https://<your server>/interactives -e INTERACTIVES_AGENT_NAME=Claude -- node /path/to/interactives-editor/mcp/dist/interactives-mcp.mjs
\`\`\`

| Setting | Meaning |
|---|---|
| \`INTERACTIVES_URL\` | The editor's address (default \`http://127.0.0.1:3048/interactives\`) |
| \`INTERACTIVES_SESSION_ID\` | Your suite session id, where the server requires a signed-in session |
| \`INTERACTIVES_AGENT_NAME\` | The name people see (default Agent) |

## What the agent can do
| Tool | Does |
|---|---|
| list_projects | Your projects |
| join_session | Joins a project's live session; reports who is there and what they have selected |
| get_selection | The layers each person has selected, in full |
| get_overview, get_layers, get_interactions | Read artboards, layer trees, timelines, variables, interactions |
| edit | Add, change, move and delete layers; add artboards, variables, timelines, interactions and scripts, in one batch |
| validate | Find broken references, unconnected events and expressions that don't parse |
| read_reference | These help pages, plus generated references for layer fields, interaction nodes and animatable properties |

## Staying in control
- Everything the agent does goes through the same live editing as people, so you watch it happen.
- Your **Undo** only undoes your own changes. To roll back an agent's work, use the [revision history](live-editing#revision-history) (a snapshot is kept every few minutes while the project changes).
- The agent can only open projects your session can open.`,
  },

  // ---------------------------------------------------------------- reference
  {
    id: 'animatable-properties',
    title: 'Animatable properties',
    group: 'Reference',
    summary: 'Every property timelines, bindings and the property nodes can change.',
    keywords: 'property properties animatable list prop path',
    body: () =>
      `These properties can be keyframed, bound to an expression, and changed with **Set property** and **Animate property**. The path (left) is what scripts use: \`ix.node('Box').set('fill.color', '#f00')\`.\n\n| Path | Property | Kind |\n|---|---|---|\n` +
      ANIMATABLE_PROPS.map((p) => `| \`${p.prop}\` | ${p.label} | ${p.kind} |`).join('\n'),
  },
  {
    id: 'help',
    title: 'Using this help',
    group: 'Reference',
    summary: 'Search, tooltips and help links.',
    keywords: 'help docs search tooltip question',
    body: `- **Search**: press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere for quick search. Type a few words and press <kbd>Enter</kbd> to open the best match.
- **Help button**: the **?** at the bottom of the tool bar, the **Help** link on the projects page, or <kbd>?</kbd>.
- **Tooltips**: hover a button or a field's name for a short explanation. Turn them off in [Preferences](preferences).
- **? links**: inspector sections have a **?** that opens their page here.`,
  },
];

export function topicBody(t: HelpTopic): string {
  return typeof t.body === 'function' ? t.body() : t.body;
}

export function getTopic(id: string): HelpTopic | undefined {
  return TOPICS.find((t) => t.id === id);
}
