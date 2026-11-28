# Tutorial 4: Importing a design file
Bring in a design or animation file, read the import report and update it later.

You don't have to draw everything in Interactives. You can bring in a design from another app, then add the motion and the behaviour here. This tutorial uses a Photoshop file; the others work the same way.

## 1. Pick a file

Any of these will do:

| Format | File | Becomes |
|---|---|---|
| Photoshop | `.psd` | One page, with real layers and editable text |
| Illustrator | `.ai` (saved with **Create PDF Compatible File**) | One page per artboard in the file |
| PDF | `.pdf` | One page per PDF page |
| AutoCAD | `.dxf` (not `.dwg`) | One page with a group per CAD layer |
| Rive | `.riv` | A page for each Rive artboard, with timelines and state machines |
| Rive editor | `.rev` | The same, with the layer names the export strips |
| Lottie | `.json` or `.lottie` | A page and a timeline |
| SVG | `.svg` | A group of editable shapes |

If you don't have one handy, any Photoshop file with a few layers and a text layer is a good test.

## 2. Bring it in

There are three ways:

- **Drop it** on the canvas of an open project. `.psd`, `.ai`, `.pdf` and `.dxf` files become new pages.
- Press **+ Import file as page** at the bottom of the **Layers** panel. This adds pages to the open project.
- Press **Import** on the projects page. This makes a **new project** from the file.

## 3. The file is copied in

For Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft and PowerPoint files, the editor copies the file into the project and remembers which file it came from. There is nothing to choose. The imported pages say **From Poster.psd** in their **Source file** section, and that is how you bring in a newer version later (step 7).

## 4. Read the report

When the import finishes, a box lists anything that couldn't be carried over exactly, for example a blend mode with no equivalent. Read it once, then press the **×**. Nothing is hidden: it is the whole list.

![An import report. It says what was approximated, so you know what to check.](help/import-report.png)

## 5. Look at what you got

![A Photoshop file after import: each layer is a layer in the Layers panel, and the text is a live text layer with its own styling.](help/psd-import-result.png)

- Pixel layers became image layers. Folders became groups. Hidden layers stay hidden and show as faint ghosts on the canvas.
- Click a text layer. It is real text: change the words in the **Text** box. If it has several styles, a **Text runs** button lists them.
- If a font isn't a Google font, check the **Font** field in the Properties panel. A font that isn't installed on the viewer's computer won't show.

## 6. Make it move

1. Select a layer and follow [Tutorial 1](tutorial-first-animation) to animate it, or add a button and follow [Tutorial 2](tutorial-first-interaction).
2. Your timelines, interactions and bindings are never touched when you update from a file.

## 7. Bring in a newer version of the file

When the designer saves a new version of the file:

1. Select one of the imported pages. The Properties panel's **Source file** section says **From Poster.psd** and when it was last brought in.
2. Press **Update from file…** and pick the new version of the file. It can have a new name.
3. A message says something like **Poster.psd updated: 3 layers changed, 1 added**. The whole update is one undo step.

What you changed here is kept. **Forget source file** drops the connection and leaves the layers as they are.

Full details, including what each format does and doesn't carry over, are in [Importing](import).

**Next:** [Tutorial 5: Publishing and sharing](tutorial-publish).
