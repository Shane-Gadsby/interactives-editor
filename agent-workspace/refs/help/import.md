# Importing Lottie, Rive (.riv and .rev), Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft, PowerPoint and SVG
Bring in Lottie JSON / dotLottie, Rive .riv and Rive editor .rev files, Photoshop .psd files, Illustrator .ai files, PDFs, AutoCAD DXF (and what to do with DWG), VectorCraft .vectorcraft and PhotoCraft .pcraft files, PowerPoint .pptx slides, SVG and project packages.

| File | Becomes | Update from file |
|---|---|---|
| Lottie (`.json`, `.lottie`) | A page and a timeline | No |
| Rive (`.riv`) | A page for each Rive artboard, with timelines, state machines and bindings | No |
| Rive editor project (`.rev`) | The same, plus the layer names and the artboards a `.riv` export leaves out | No |
| Photoshop (`.psd`) | A page of layers, with editable text | Yes |
| Illustrator (`.ai`) and PDF | A page for each artboard or PDF page, as vector art | Yes |
| AutoCAD (`.dxf`) | A page with a group per CAD layer (`.dwg` must be saved as DXF first) | Yes |
| VectorCraft, PhotoCraft | Pages of layers | Yes |
| PowerPoint (`.pptx`) | A page for each slide, with editable text, pictures and shapes | Yes |
| SVG | A group of editable shapes | No |

**Update from file** is the last column: for those files you can bring in a newer version later without losing your edits. See [Updating a design file](import#updating-a-design-file).

New to this? [Tutorial 4](tutorial-import-design) walks through an import step by step.

## Ways to bring a file in
- **+ Import file as page** at the bottom of the **Layers** panel adds pages to the open project. It takes Lottie, Rive (`.riv` or `.rev`), Photoshop, Illustrator, PDF, AutoCAD (`.dxf`), VectorCraft, PhotoCraft and PowerPoint files.
- **Import** on the projects page makes a **new project** from the file.
- A `.psd`, `.ai`, `.pdf` or `.dxf` file dropped on the canvas also becomes new pages.
- An SVG file dropped on the canvas, pasted, or picked with the **Image** tool becomes a group of shapes (see [SVG](import#svg)).

After an import, a report lists anything that couldn't be carried over exactly (see [The import report](import#the-import-report)).

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients (with their exact start and end points, centre and radius, see [exact gradient points](fill-stroke#exact-gradient-points); they are written out the same way), transforms, trim paths and keyframes with easing become layers and a timeline. Text animators with range selectors become [text modifiers](text-modifiers). Expressions, layer masks, track mattes, layer effects, skew and time remapping are not carried over, and the import report lists what was dropped.

## Rive (.riv)
![A Rive file after import: each Rive artboard is a page, with its animations as timelines and its state machine as interactions.](help/rive-import-result.png)

Each Rive artboard becomes a page. In this section, "artboard" means Rive's own artboard.

What comes across: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Shape morphing (animated path points), holes, clipping shapes (a clip shape that follows another shape keeps following it) and the translation, rotation, scale, transform and follow path constraints (with factors, limits and local space) are carried over, and so are bones, skins (weights), image meshes, and IK and distance constraints (see [Bones and skinning](bones)); other constraints are not.

### Transitions and blending
A transition's blend time becomes a **Blend in** on the next state's *Play or stop an animation* or *Start a blend* (a percentage of the old animation is converted to milliseconds, disabled transitions are skipped), with its mix curve as the blend easing, the state left running on under it (or frozen, for *pause on exit*) and *early exit* as *Can be left early*; a state that is being mixed into cannot be left until the mix is done, unless that allows it (a trigger pressed meanwhile is lost, as in Rive).

An exit time becomes a **Wait for time in timeline**. Transitions out of one state that carry different random weights become one **Random** node (up to six; a weight of 0 is never picked). Transitions from the Any state are not held up by a mix in progress.

### Layout, strokes and text
Layout padding, margins and gaps given as percentages stay percentages (a share of the width of the layout around them, the way Rive does it, so they follow the layout when it is resized), and absolute insets given as percentages are worked out against the layout's size (and fixed at the file's size); a layout's border widths take room inside it like padding, auto margins push a layer to the end, and a gap between wrapped lines keeps its own value.

Rectangles and layouts with a different radius on each corner keep them, and dash lengths given as a share of the outline become pixels (fixed at the file's size). A fill and a stroke that Rive draws in a mixed order keep that [paint order](fill-stroke#paint-order).

A text box's vertical alignment, overflow (clip, ellipsis) and no-wrap come in; paragraph spacing comes in too (as the layer's *Paragraph spacing*); shrink-to-fit does not.

Rive centres a stroke on its outline, so a stroked rectangle or ellipse comes in a stroke-width bigger to keep the same outer edge.

### When state machine flows start
State machine layers that start an animation from any state with nothing to wait for (the looping animations of an icon) start when the artboard does. A transition that has an exit time at the end of the animation and also conditions is taken as soon as both hold, even when the conditions come true long after the animation finished (a splash that plays once and waits for a button); with no exit time and nothing to wait for it is taken the moment the state is entered.

An entry transition that has conditions leaves the layer idle until they hold.

### Actions, links and pointer handling
Actions on a state or a transition (set a view model property when it is entered, left, started or finished) become *Change a value or counter* nodes in the state's flow, next to the ones for Rive events. A layer's open-link event does not fire when the artboard starts, and one link is not opened twice within two seconds. Listeners on a nested artboard (the buttons of a layout built from several artboards) change the shared view model variables the main artboard's state machine reads.

In play, an imported Rive artboard lets the pointer through every layer except the ones its listeners name, so a hidden panel or a picture on top of a button does not stop its click, as in Rive.

### Listeners and keyboard
Rive **listeners** import as events: pointer enter, exit, press, release, click, move and drag as *When clicked or hovered*, **keyboard listeners** as *When a key is pressed* (the key, its modifiers, and the down, repeat and up phases; the key codes are the ones Rive uses, so letters, digits, arrows, function and numpad keys all map), and **focus** and **blur** listeners as *When a layer is focused*, with Rive's focus actions as *Focus layer* (focus traversal actions are not imported).

A keyboard listener on a layer imports with *Only while this layer has focus* set to it, so it hears the key only while that layer (or one inside it) has the focus, as in Rive; one on the artboard reacts wherever the focus is.

Rive has no scroll-wheel listener, so there is nothing to import there; gamepad, text input and semantic listeners are listed in the report.

### Nested artboards and 9-slice images
**Nested artboards** keep their starting inputs, and what Rive does to their inputs comes in too: a listener action that sets a nested number or bool or fires a nested trigger becomes *Give an embedded page a value* or *Trigger something in an embedded page* (a nested bool that Rive toggles flips what it is now: the instance's input is read back with `instanceInput()`).

Keys on a nested bool or trigger in an animation become [timeline markers](timelines) (named like *Badge: flag = true*) with a *When an animation reaches a marker* flow, and a nested number animated between keys becomes a track on the instance's input (*Input level*), so it tweens (see [instances](instances)).

A **9-slice image** (an image with slice axes) imports with its insets, and tile modes become **Fill edges**; Rive scales such an image to resize it, so the box is resized here and the corners keep their size (when the scale is animated the scale is kept instead). N-sliced groups, which resize a group's shapes, import as plain groups.

### How pointer listeners are tested
Rive pointer listeners are tested **by shape**, the way the Rive runtime does it: a listener's target is under the pointer where the shapes inside it cover (their fill, whatever its colour or opacity, not their stroke and not the box around them), and every target is tested on its own, so regions that overlap are all hovered. Targets entered at the same moment act from the front of the layers to the back, so the one lowest in the layers has the last word (that is what Rive answers at an overlap).

Layers that are not shown (a [solo](groups-frames) that has moved on) are not in the way. A state's animation that has played out keeps its last pose while the machine stays in that state, over the layers before it, as in Rive (it matters when a later layer holds a region view that an earlier layer's hover exit would otherwise put away). Re-import a Rive file made before this to get it.

### Events
Rive **events** become messages: a *Send message* node with the event's name, and its custom properties as the payload (an object, e.g. `event.payload.power`). An event keyed on an animation becomes a [timeline marker](timelines) with a *When an animation reaches a marker* node; events fired by listeners and by states or transitions (at their start or end) become *Send message* nodes in those flows, and Rive event listeners become *When a message arrives* nodes.

An **audio event** also plays its embedded sound (a *Play sound* node, with the audio stored as a project asset), and an **open URL event** also opens its link (an *Open a web address* node). Audio that is hosted on Rive's CDN instead of embedded is skipped, and the import report says so.

### Gradients and text boxes
Rive **gradients** keep their exact start and end points (a radial one its centre and radius), moved into the layer's box, so they land where Rive draws them and stay put when the layer is resized; keys on the points and on the stops' colours and positions become timeline tracks (see [exact gradient points](fill-stroke#exact-gradient-points)).

**Text** boxes can animate their height and origin: a fixed-size text box keeps its top left where Rive keeps it while its height or origin is keyed (lines that no longer fit are clipped or cut with an ellipsis as the box shrinks, and the vertical alignment follows the box), while the height of auto-width and auto-height text is worked out from its text, as in Rive, and its keys are ignored.

### View models and data binds
Rive **view models** become shared [variables](variables): numbers, true/false, text, colours, triggers (a count that goes up when it fires) and enums (a *Choice* with the enum's options), and a list property becomes a *List* of the first items' values. Transitions and listeners that read or write them keep working.

**Data binds on layers** (a view model value driving a layer's position, rotation, scale, opacity, text, fill or stroke colour, stroke width and so on) become [bindings](bindings), with the bind's converters (to text with decimals, rounding, boolean negate, range mapper, add, subtract, multiply, divide, to number, string pad and trim, formulas that are plain arithmetic) as converters. Two-way and to-source binds are brought in one way only (value to layer), and interpolating converters apply instantly.

### Joysticks
Rive **joysticks** become [joysticks](joysticks): a joystick that has a handle layer gets that layer and its rectangle as the **Handle** and **Area**, so the timelines follow where the handle sits (inverted axes are turned round, and a joystick without a handle keeps its set position). A *listener action that aligns a layer to the pointer* (what moves a joystick handle on drag) becomes *Change a layer's setting* nodes that set the layer's x and y from the pointer. Keys that move a joystick's own x and y are not imported.

### Masks, text modifiers, scrolling and lists
Rive **layer masks** become [masks](groups-frames#masks): the masked layer goes in a group with a masking copy of the source layer (a shape, a group of shapes, an image) in front of it, and the source itself is hidden unless the mask says it keeps drawing. Inverted, luminance and inverted luminance masks keep their mode (see *Mask mode* in [Groups and frames](groups-frames#masks)); custom bounds and the mask resolution are ignored, and the report lists those.

Rive **text modifiers** become [text modifiers](text-modifiers): each range of a group is one modifier, with the group's move, turn, scale and fade (the units are letters, words or lines, ranges by percent or by index, with the offset, strength and falloff) and keys on a range or group follow onto it. Falloffs import as the *Falloff* shape, which matches Rive letter for letter (it was measured against Rive's own runtime), and ranges that combine by subtracting, multiplying, min or max, ranges limited to one text run, text follow path and per-letter variable font axes are not imported; the report lists them.

Rive **scroll constraints** make the layout a scrollable [frame](groups-frames) in the direction they scroll, and the browser scrolls it. Elastic bounce and momentum, snapping, endless and virtualised lists, drag speed and a starting offset are not imported, and neither are scroll bars (the browser draws its own). A scroll constraint the viewer cannot drag is skipped.

Rive **artboard component lists** (lists that show an artboard for each item) become a frame that repeats an [instance](instances) of the item artboard once per item of the list [variable](variables), laid out along the parent's direction with its gap. Each item shows its own values: the properties of the item's view model that the item artboard reads become that instance's inputs, bound to the matching fields of the item (*Input title* bound to `item.title`; nested view models as `item.style.color`), and those variables are one per instance rather than shared. A list that shows different artboards for different kinds of items shows the first, and a list without a list property or an item artboard is skipped.


## Rive editor project (.rev)
A `.rev` is the file the Rive editor itself saves (the project or a backup of it), as opposed to the `.riv` it exports for playing. It opens through the same import as a `.riv`, so everything above applies, and an artboard comes out the same as the one from the `.riv` exported from that project. What the editor file adds:

- **Layer names.** An export strips the names of everything but artboards, animations and state machines; the editor file still has them, so layers keep names like *Hover* or *Shape 7* instead of *Group*.
- **Artboards the export leaves out.** Every artboard in the project comes in, in the order the file has them, with the project's default artboard first.
- Only fonts, images and sounds something uses come in; the editor also keeps the files it was given and never used.

The editor's own organisation (folders, the original SVG files that were imported, the position of states in the state machine graph, built-in enum tables) is skipped. Nothing about the format is published, so the reader was written from real files: if a `.rev` holds something it does not understand, the report says so and carries on with the rest, and a file it cannot read at all fails with a message. Export a `.riv` from the Rive editor and import that if it does.

## Photoshop (.psd)
![A Photoshop file after import: layers, a live text layer, and hidden layers kept hidden.](help/psd-import-result.png)

The document becomes a page of the same size. Every pixel layer becomes an image layer (stored as a PNG asset) at its position, folders become groups, and the layer name, visibility, opacity (including fill opacity) and blend modes carry over: normal, dissolve, multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge (add), difference, exclusion, hue, saturation, color and luminosity.

Modes a browser can't draw come in as the nearest one there is, and the report lists them: linear burn as multiply, darker color as darken, lighter color as lighten, vivid, linear and pin light and hard mix as hard light, and divide as color dodge.

8 and 16 bit RGB and grayscale files import as layers. Indexed colour and CMYK files (and files with no layers) import as one flattened picture, and 32 bit, bitmap, Lab, duotone and multichannel files are not supported. Layers with nothing in them are skipped without comment.

**Text layers** become real, editable text layers: the text, font, size, colour, alignment, line height, letter spacing (tracking) and bold, italic, underline and strikethrough, with a style run for each stretch that differs (so a heading with one red word stays one layer). Photoshop stores a font as a PostScript name such as `Montserrat-SemiBold`; the importer turns it into a family and weight. Families that are Google fonts are added to the project's fonts so they load; any other font keeps its name and shows only where that font is installed, so check the font field in the inspector. Point text (a click on the canvas) becomes a box that does not wrap, paragraph text (a dragged box) keeps its width and height. Text with a layer mask stays real text, with the mask over it. Only text Photoshop warps, sets vertically or stores in a way the importer can't read stays a picture of its pixels. That layer is named after the text with **(text as picture)**, shows with the picture icon in the Layers panel (real text has the **T**), and the import report lists it by name with the reason, so you know which ones to retype.

**Clipping groups.** In Photoshop a layer set to *Create clipping mask* only shows inside the layer below it. Each such base and its clipped layers become a group named after the base with "(clipped)" added: the base, then a copy of the base used as a [mask](groups-frames#masks) (a picture masks by its transparency), then the clipped layers. The group carries the base's opacity and blend mode. Move or resize the base and its mask copy together, or delete the mask copy to stop the clipping.

**Masks.** A layer's pixel mask is baked into the layer's transparency. A folder's pixel mask becomes a mask picture placed over the folder, inside a wrapper group. A vector mask becomes a path layer used as a mask, in a group with the layer (edit the path to reshape the cut-out); the outline of a shape layer is not a mask and is left alone.

Not carried over, and listed in the report: layer styles and effects (shadows, strokes, glows), adjustment layers, smart-object filters, the subtract blend mode (it imports as normal), and layer comps. Each layer is stored at its full size, so a large document with many layers makes a big project.

## Illustrator (.ai) and PDF
Illustrator saves a PDF inside its files when **Create PDF Compatible File** is ticked in the save options (it is by default). The importer reads that PDF, so a `.ai` file saved without it can't be imported: you'll see "Save the file with 'Create PDF Compatible File' ticked", and re-saving from Illustrator fixes it. Ordinary `.pdf` files import the same way.

Every PDF page, and every Illustrator artboard, becomes a page of the same size (the trim box when the file has one), laid out side by side. A file with one gives a page named after the file. With several, each is named *file / Artboard 2* and so on.

What you get is editable vector art:

- **Paths** become path layers, with fills, strokes (width, caps, joins, dashes) and even-odd fills. The positions and any scaling or rotation are applied to the points, so every shape sits where it was.
- **Colours** in grayscale, RGB, CMYK, spot (separation) and indexed spaces; CMYK is converted with an approximation, so print colours can look a little different on screen.
- **Gradients**: linear and radial gradients (axial and radial shadings) become linear and radial fills. A radial gradient is centred on its shape.
- **Clipping** becomes a [mask](groups-frames#masks): a group holding a path used as a mask in front of the layers it clips. Clips that cover everything inside them are dropped.
- **Opacity** (fill and stroke) and these blend modes: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, difference, exclusion, hue, saturation, color and luminosity.
- **Text** becomes text layers with the font name, size and colour. Pieces on one baseline join into one layer, and following lines in the same style become one multi-line layer. Fonts are matched by name, so install or [choose](text) the real font if it isn't available. Text that has no Unicode mapping in the file may show wrong characters.
- **Pictures** become image layers (PNG assets, or the original JPEG), with soft masks as transparency and stencil masks in the fill colour.
- **Layers**: Illustrator's layers become groups with the layer's name, and hidden layers stay hidden.

Not carried over, and listed in the report: pattern fills, gradient meshes, opacity masks, blend modes outside the list, live effects (the PDF holds what they produced, as paths or pictures), overprint, Type 3 fonts, JPEG 2000 and fax pictures, and encrypted files. Artboard names can't be read from the file, so they are numbered.

## AutoCAD (.dxf, and .dwg)
![An AutoCAD drawing after import: lines, a hatch and text as editable layers.](help/dxf-import-result.png)

A **DXF** file becomes one page of editable vector layers, named after the file. ASCII and binary DXF both work. Only the **model space** is imported; paper space layouts (sheets) are skipped and reported. If the file has nothing in the model space, its paper space is imported instead.

- **Fitting.** The drawing is scaled evenly, with the y axis flipped (CAD has y up), so its longest side is 1600 px, plus a 20 px margin. The report tells you the scale ("1 px = 5 mm") from the file's drawing units. Objects on layers that are off or frozen don't count when fitting. If a stray object far from the drawing would shrink it, the page shows the extents saved in the file instead and says so.
- **Layers.** Each DXF layer becomes a group with the layer's name, in the file's order. Layers that are off or frozen are imported hidden, so you can show them again. A layer with hundreds of plain lines has them merged into a few path layers (per colour, width and dash) to keep the project light.
- **Shapes.** Lines, polylines (with arc segments), circles, arcs, ellipses, splines (as cubic curves), points, solids, 3D faces (outline only) and leaders become path layers. Hatches become filled paths with their holes (even-odd), and gradient hatches become a two colour gradient.
- **Blocks.** Block inserts are expanded in place, including nested blocks, scale, rotation, mirroring and row / column arrays. Layer 0 and BYBLOCK properties follow the insert. Dimensions are drawn from the shapes AutoCAD saved with them. Attributes become text.
- **Text.** TEXT and MTEXT become text layers with their height, rotation and alignment. Formatting codes are removed and stacked fractions become *a/b*. CAD fonts aren't in the file as real fonts, so the text uses the default font and the box is an estimate: check long labels.
- **Colours.** AutoCAD colour numbers, BYLAYER, BYBLOCK and true colours all work. White (and AutoCAD's colour 7) is drawn **black**, because the page is white.
- **Line weights and linetypes.** CAD lines are thin, so lines without a weight are 1 px; a weight of 0.25 mm is 1 px, 0.5 mm is 2 px, 1 mm is 4 px (up to 14 px). Linetypes (dashed, dotted, ...) become dash patterns, scaled by the file's linetype scale.

Not carried over, and listed in the report: hatch pattern lines (a pattern hatch is a light tint of its colour), images, 3D solids and surfaces, multileaders, external references, infinite lines, mesh surfaces and proxy objects.

**DWG files** (the AutoCAD drawing format itself) can't be read directly: you'll see "DWG version AC1032 (AutoCAD 2018 and later): save it as DXF from your CAD program". In AutoCAD, BricsCAD, DraftSight, LibreCAD and similar, use **File > Save As > DXF** (any version; R2000 or later keeps the most) and import that file. Like Photoshop and Illustrator files, a DXF can be updated later with **Update from file…**.

## VectorCraft (.vectorcraft)
A VectorCraft file (and the older `.drawcraft` name) is read as editable vector art. Each artboard in the file becomes a page (one is named after the file, several are named *file - Artboard name*), holding the artwork that touches it.

- **Layers and groups** become groups with the same name; hidden stays hidden, and opacity and these blend modes are kept: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge, difference, exclusion, hue, saturation, color and luminosity. A clip group or clipped layer becomes a [mask](groups-frames#masks) in front of what it clips.
- **Paths and compound paths** become path layers. Solid, linear and radial gradient fills and strokes (width, caps, joins, dashes) are kept, and an object with several fills or strokes becomes a group with one path layer for each. CMYK, gray and Lab colours are converted to RGB with a simple formula, so print colours can look a little different.
- **Live objects**: shapes keep their outline, symbols are placed as copies, Repeat objects (radial, grid, mirror) become copies, and a Blend between two paths with the same points gets its steps. Envelope distortions are not applied: the art stays undistorted. Gradient meshes become flat patches.
- **Text** becomes text layers (font, size, colour, tracking, leading, alignment and style runs). Fonts are matched by name, so check the font field when a family is not one of the Google fonts.
- **Pictures** become image layers. A picture linked to a file on disk comes across only when VectorCraft saved its preview in the file.
- **Effects**: drop shadow and outer glow become the layer's shadow, and Gaussian blur its blur.

Not carried over, and listed in the report: opacity masks, pattern fills, brushes and variable-width strokes, arrowheads, inside and outside stroke alignment, type on a path, other live effects, placed documents, and blend modes outside the list.

## PhotoCraft (.pcraft)
A PhotoCraft file is read like a Photoshop file: pixel layers become image layers (PNG assets), folders become groups, and an artboard folder becomes a page.

- Opacity (times fill opacity), blend modes, visibility, **clipping layers** (as in Photoshop: a group with a copy of the base used as a mask), layer masks (baked into the pixels, or a mask picture for text, shapes and folders) and vector masks (a path used as a mask).
- **Text** becomes text layers: font, size, colour, tracking, leading, alignment and style runs. Warped, vertical and on-a-path text keeps its rendered pixels.
- **Shape layers** become path layers with fill, gradient and stroke; **fill layers** become a rectangle over the canvas. Smart objects use their rendered pixels.
- A drop shadow becomes the layer's shadow.

Not carried over, and listed in the report: adjustment layers, other layer styles, pattern fills, blend modes outside the list, and mask feather. A file that is a folder rather than a ZIP archive has to be zipped first. If nothing can be rebuilt, the flattened picture saved in the file is imported instead.

## PowerPoint (.pptx)
Each slide becomes a page, the size of the slide, named after the file and the slide number. Older `.ppt` files have to be saved as `.pptx` in PowerPoint first.

- **Text** becomes text layers: font, size, bold, italic, underline, strike, capitals, colour, letter spacing, alignment, line and paragraph spacing, vertical anchor and the box's padding. Placeholders (titles, body text) take their position and look from the slide's layout and master when the slide doesn't set them. Bullets and numbers are typed in as characters, and a layer has one alignment, so a text box with mixed alignment takes the first paragraph's.
- **Pictures** become image layers (assets of the project), with any crop kept as a clipped frame and the alt text as the layer's label. Pictures that are only linked, or saved as EMF, WMF or TIFF, are skipped.
- **Shapes**: rectangles, rounded rectangles, ellipses, triangles, diamonds, regular polygons, stars, lines and freeform paths, with solid, gradient or picture fill, outline (width, dash, cap) and drop shadow. A shape with text becomes a group of the shape and its text. Other preset shapes (arrows, callouts, ...) are drawn as rectangles.
- **Groups** keep their position, size, rotation and flip. **Backgrounds** (colour, gradient or picture) come from the slide, its layout or its master, and the logos and other decoration the layout and master draw come across as locked layers named *Master: ...* and *Layout: ...*.

Not carried over, and listed in the report with the slides they were on: charts, SmartArt, tables, embedded objects, audio and video (the poster picture is kept), animations, slide transitions, speaker notes, arrowheads, glow and other effects, and vertical text. The result is a starting point to design from rather than a copy of the deck: for the exact look of a slide, save the deck as PDF and import that instead.

## SVG
Drop an SVG file on the canvas, paste it, or pick it with the **Image** tool. It becomes a group of editable vector layers: shapes and paths (with their transforms applied), groups, solid and gradient fills, strokes and dashes, and simple text. Masks, filters, patterns and embedded images are listed as not carried over.

## Updating a design file
A Photoshop, Illustrator, PDF, AutoCAD (DXF), VectorCraft, PhotoCraft or PowerPoint file is copied into the project when you import it, and its pages remember which file they came from. When the designer saves a new version, bring it in with **Update from file…**:
- Select one of its pages: the Properties panel's **Source file** section says **From Poster.psd (Photoshop, updated 2 h ago)** and has **Update from file…**.
- Or open the **Assets** panel: **Design files** at the top lists each file with **Update…**.

Pick the new version (it can have a new name; the pages then say they came from that one). The editor can't notice a file changing on your computer by itself, since it runs in a web page, so updating is always this one step.

How a re-import merges (your edits are kept):
- Layers are matched by name (in the same folder, the nth layer of a repeated name), and a layer renamed in the file is recognised by its picture or text and position.
- A property (position, size, opacity, visibility, text, style, ...) the file changed is updated **unless you changed it too**: what you edited stays. Pictures that changed in the file are replaced; one you swapped for another picture stays.
- New layers in the file appear in their place in the layer order. Layers you added yourself, and all timelines, interactions and bindings, are left alone.
- A layer the file no longer has is removed. If you gave it keys, interactions or bindings it stays instead, hidden, and is renamed "(removed from file)", so nothing you built is lost. A layer you deleted here stays deleted.
- One undo step undoes a whole re-import. Pictures the file no longer uses are kept in the project (so undo can bring them back); they show as unused in the Usage tab, and **Remove unused assets** deletes them. A message says what happened ("Poster.psd updated: 3 layers changed, 1 added").

**Forget source file**, under the button, drops the connection: the layers stay as they are and **Update from file** goes away.

Pages that were *linked* to a file on disk before (an older way of doing this, in Chrome and Edge only) keep **Re-import now** and **Watch for changes** beside **Update from file…** in the browser that linked them.

## The import report
After an import, a report lists anything that couldn't be carried over exactly. It is the whole list: nothing is skipped without a note. Press the **×** to close it.

![An import report for a DXF file.](help/import-report-dxf.png)
