# Web elements
Real buttons, inputs, links, embeds and video that work with keyboards and screen readers.

Web elements are real HTML controls, so they work with keyboards, screen readers and forms.

## Button
Press <kbd>B</kbd> to draw one. A button has a label (which can use `{expressions}`), fill, stroke and corner radius. Add a **When clicked or hovered** event to react to a click.
- Tick **Fit text to box** to have the label's size chosen to fit the button (see [Text](text)).
- **Disabled** (also bindable, for a Next button that waits for an answer) greys it out and takes it out of the Tab sequence.
- **Side padding** on a button is the room between its label and its left and right edges: 12 pixels unless you change it. Give a wide button with its label on the left a little more, as an accordion's headers have.
- An **inner shadow** on a button is drawn over its fill, so a shadow of 0 across, -3 down, no blur, in a colour, is a line along its bottom edge. That is the line under the showing tab.
- A button's colours ease when a [state](layer-states) changes them, so a hover or a chosen look doesn't blink. With reduced motion asked for they change at once.
- **Disabled look** sets how dimmed a disabled button or input looks: 0.5 by default, 1 for no dimming. A layer whose Opacity is bound keeps doing its own dimming.
- **Small buttons** keep the size you draw. A button narrower than about 80 px no longer grows by its padding, so a dot-sized button really is dot-sized.

## Input
An input is one of: text, number, email, password, multi-line, checkbox, slider (range), dropdown (select) or choice buttons.
- **A new input comes with a label** above it (beside it for a tick box), in your text colour at the size every control's label takes. Change its words and a screen reader reads them as the box's name, so you don't have to write an **Accessible label** too. Move or restyle the label like any text; delete it if you don't want one, and the box stays. Inputs made before this have no label added.
- **Bind to a variable…** (under *Value*) ties the box to a variable with an ordinary [data binding](bindings) on its **Value**, set to **⇄ Both**: typing writes the variable and the variable fills the box. Change the way, or the variable, under **Data bindings**. Choose **Out →** to only write the variable and keep the box's own value. Older projects that had a *Variable* setting on an input are changed to this when they open.
- **When a value changes** reacts to what was typed.
- **No browser help** (text boxes) turns off the spellcheck underline, autocorrect, automatic capitals and autofill, for a spelling test.
- **Block paste and drop** refuses pasted or dragged text, so the answer has to be typed.
- To do something when Enter is pressed in a text box, use a **When a key is pressed** event set to `Enter` with **Also while typing in a text box** ticked (see [Interactions](interactions#when-a-key-is-pressed)).


### Choice buttons
A row of buttons for one variable, one of them chosen: study mode, a starting trimester, easy, medium or hard. Press <kbd>Ctrl</kbd>+<kbd>K</kbd> and **Add choice buttons**, or set an input's **Type** to **choice buttons**, then **Bind to a variable…** like any input.

- **Options**: one a line, the value or `value|words on the button` (`FT|Full-time`). Or **Options from** a formula: a list of text, or of `{value, label}`, so the buttons follow the data (`programData.find(p => p.code == program).starts`).
- **Off when**: a formula for each option, with `option.value`, `option.label` and `option.index`. True turns it off; a text turns it off and says why: `program == 'GCSC' && option.value == 'FT' ? 'GCSC is part-time only' : false`. An option that's off stays in the row, dimmed, and trying it shows the reason under the buttons and reads it out, so nobody's left wondering why a button does nothing. An item from **Options from** can carry its own `off` too. Off when doesn't change the variable: one that holds an option that's now off keeps it, with no button chosen, until someone picks another.
- The chosen one is gold with dark text (**Chosen** and **Chosen text** change it), the buttons share the layer's width in equal parts with **Gap** (20 px) between them, and each has the layer's fill, corners and stroke.
- It's a radio group to a screen reader: one <kbd>Tab</kbd> stop, the arrow keys move along and choose.

## Link
Text that opens a URL. **Fit text to box** works here too. For making any other layer a link, see [Links and cursors](links-cursors).

## Embed
An iframe from an `https://` URL, or your own HTML. The HTML runs in a sandboxed frame that can't reach the page it is on, so it can't read its cookies or call its code. In the editor an embed shows as a labelled box; open Preview to see it. Projects whose scripts don't run in the sandbox can switch on **Run embedded HTML in the page** in Project settings for HTML they wrote themselves.

### Paste a video or slides link
Most video and slide sites won't play in a frame at the address you copy from them: a YouTube watch page gives a grey box. Paste it anyway. The embed works out the address that plays, sets the layer's height to the shape of what it shows, and says under the box what it found (**Plays as a YouTube video**). The link you pasted stays in the box, so you can still read it.

| Site | Paste |
|---|---|
| YouTube | a watch link, a `youtu.be` link, a Short or a playlist. It plays from YouTube's no-cookie address, and a start time (`t=1m30s`) is kept |
| Vimeo | the video's page, an unlisted one's link with its code included |
| Panopto | the viewer link (`Viewer.aspx?id=...`) |
| Google Slides, Forms, Docs, Sheets | the link from **Share**. The file has to be open to **Anyone with the link** |
| Microsoft Forms | the link to fill in the form |
| Microsoft Stream | a `stream.aspx` link. A short link (`/:v:/`) has nothing in it to work from: use **Share > Embed code** in Stream and paste that |

You can also paste a site's whole **embed code** (`<iframe ...>`): the address is taken out of it and the layer takes its shape. Anything else is used as it is.

**The page may use** (a web page embed only) is a list of tick boxes for what the embedded page is allowed: **Autoplay**, **Full screen**, **Clipboard**, **Microphone**, **Camera**, **Screen share**, **Location**, **Motion sensors**, **Picture in picture** and **Protected video**. Only what's ticked is let through; an unticked box is a no, even for a page from the same site. Hover a box for what it really does.

- An embed starts with **Autoplay**, **Full screen** and **Clipboard**, which is what every embed had before this could be chosen, so nothing that worked has stopped.
- Ticking **Microphone**, **Camera**, **Screen share** or **Location** doesn't switch it on. It lets the embedded page *ask*, and the viewer still sees their browser's own question the first time.
- None of it works unless the embedded page is on `https`. And when your interactive is itself in a course page, that page has to let the interactive use the same thing, or the embed inside it gets nothing.
- Your own HTML takes none of these ticks. Its frame is shut tight on purpose and keeps the fixed three.

**Border** draws a line round the embed, inside its box and over the embedded page's edge, so the layer stays the size you gave it. It starts on your project's **border token**, so it matches the colourway and changes with it; pick another token from the **Tokens** tab of the colour, or a plain colour that stays put. **Border width** is how thick it is, and it follows the **Radius**.

## Video
A video file or URL.

## Accessibility
Every layer has an **Accessibility** section (roles, text alternative, keyboard reach, hiding decorative layers): see [Accessibility](accessibility). The **CSS class** is in the Advanced section. The [Accessibility checker](accessibility-checker) lists the layers that need a text alternative. The player honours the viewer's *reduce motion* setting when the project setting **Respect reduced motion** is on.
