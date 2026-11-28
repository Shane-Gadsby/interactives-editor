# Images, video and audio
Adding files, the Assets panel, cropping a picture in its frame, and 9-slice scaling for images.

Drop files on the canvas, paste them, or use the **Image** tool. SVG files become editable vector layers; other images become image layers. Video files become video layers; audio files are stored as assets for the **Play sound** action.

Pictures dropped or pasted onto an artboard are scaled to fit (up to 600 px for images and 640 px for video) and centred where you dropped them. The **Media Catalogue** button in the tool bar's Media group finds a photo in the suite's library instead: see [The Media Catalogue](media-catalogue). Every file is also kept in the project's **Assets** panel: see [The Assets panel](assets) for thumbnails, details, checking several at once and deleting.

## Image settings
**Fit** (cover, contain, stretch), corner radius, and:

### Cropping a picture
Put a photo in a 300 by 200 frame and the face may be cut off. **Crop** moves and zooms the picture inside its frame without touching the file (the original stays in Assets), so **Fit** still decides how it starts out.

- **Double-click** the picture, press <kbd>Enter</kbd> on it, use **Crop picture…** in its settings, or right-click and choose **Crop picture**.
- **Drag** inside the frame to move the picture. **Scroll** over it to zoom under the pointer, or pull a corner, or press <kbd>+</kbd> and <kbd>-</kbd>. The arrow keys nudge (<kbd>Shift</kbd> for 10 pixels).
- <kbd>Enter</kbd>, <kbd>Escape</kbd>, **Done**, or a click outside the frame finishes. **Reset** (or <kbd>0</kbd>) puts the picture back as **Fit** draws it. Each drag is one undo step.
- The settings have the same three numbers: **Zoom** (100% is as **Fit** draws it, 200% shows the middle quarter) and **Picture X** and **Picture Y**, how far it is moved as percents of the frame. The picture always keeps covering the frame, so no empty edge shows.

The crop belongs to the layer, not the file, and the frame (with its corner radius) clips whatever sticks out. A few things ignore it:
- A 9-slice picture or a mesh ignores the crop. A shader filter reads it.
- The Lottie export shows the whole picture (it lists that in its notes).
- Older files and players show the picture uncropped.

### A QR code
An image layer can be a **QR code** instead of a picture: choose **QR code from text** at the top of its **Image** list, or **Add QR code** from the command palette. Type what it carries under **QR code of**, usually a link. It's written like a text layer, so `https://example.com/?id={userId}` puts the viewer's own value in, and `{item.link}` gives each copy in a list its own code. The code is drawn as the page plays, so it changes when the values do.

- **Error correction** is how much of the code can be covered or scuffed and still scan. **Medium** suits a screen. Pick **High** or **Highest** for a printed poster, or when a logo sits over the middle.
- **Squares** and **Background** are its colours. Keep dark squares on a light background: plenty of phone cameras can't read light on dark.
- Keep it to a link. A long paragraph makes a dense code that phones struggle with, and the inspector says so past about 1200 characters.
- Give it a text alternative that says where it goes ("QR code for the course survey"). A screen reader can't scan it.

### 9-slice scaling
Turn on **9-slice** and set the four insets (in image pixels). The corners keep their size and the edges and middle stretch, so a rounded panel or button image can be resized without distortion. **Fill edges** chooses between *Stretch* and *Tile*: with *Tile* the edges and middle repeat the picture at its own size instead of stretching.


### Zoom and the focal spot
The same crop, from the picture's settings, when you'd rather point than drag. Under **Crop** in the **Image** section:

- **Focal spot** is a small picture of the whole photo. **Click the part that matters most** (a face, a label on a diagram) and that part moves to the middle of the frame. The dot marks it, and the bright outline is the part the frame shows. Drag the dot, or use the arrow keys with <kbd>Shift</kbd> for bigger steps.
- **Zoom** is a slider. It brings the picture closer about the focal spot, so what you chose stays in the middle while it grows. The number under it is the same zoom, to type.

**Good to know:** the frame is never left uncovered, so the spot goes as far towards the middle as the picture can move. With no zoom, a picture only moves the way it overflows its frame: a wide photo in a square frame moves left and right. Zoom in a little and it can move both ways.

### Swap a picture
To show a different picture in the same place, right-click the picture and open **Swap picture**. It asks where the new one comes from:

- **One already in this project…** opens the project's pictures as a grid. Click one. The one showing now is marked.
- **From the Media Catalogue…** opens the photo library. Pick a photo and press **Insert**. It's linked, not copied, like any other catalogue photo.
- **Upload a new one…** opens your computer's file picker. The picture is added to **Assets** and shown in the layer.

The layer keeps its place, its size, its corners, and every interaction and keyframe on it. Only the **crop** goes, since it was framed for the old picture, and you're asked for a new description, because the old one described the old picture. One undo puts the old picture back.

This changes one layer. To change a picture **everywhere** it's used, use **Replace file…** on it in Assets instead.

## Video
Autoplay, loop, muted, controls and fit. Most browsers only autoplay muted video.

### YouTube, Vimeo and Panopto
Paste the video's link (the address you'd share, or the site's embed code) into **Video site link** and the site's own player goes on the layer, wherever you put it and at its size. **Control video**, the **Playing**, **Playback position**, **Length** and **Ended** bindings, cue points and **Hold paused** all work on it as on a file, so a question can pause a YouTube clip at 1:30.

**Good to know:**
- It plays in Preview, share links, StudyDesk and the single HTML file. On the canvas it's a panel naming the video.
- Panopto plays, but it can't be told to play, pause or seek, or say what it's doing, so nodes and bindings don't reach it.
- The site's player sits on top of the project where the layer is, so anything you draw over it (a dialog, a sticker) is hidden behind it while it shows.
- Speed buttons, frame step, captions you add and descriptions are for video files. YouTube and Vimeo have their own captions in their controls.

### Poster, and a video with nothing to play
**Poster** is a picture shown before the video plays. It also stays up the whole time when the file is sound only (choose a sound in the **Video** list and the layer becomes a player with the browser's own controls, speed and captions), under the controls. It counts in the download size and goes with exports. A video with no file or address shows a grey **Choose a video** panel while you edit; learners see a plain grey box, or the words in **Text when empty**. The accessibility check warns about a video with nothing to play, so it gets filled in or deleted before you share.

### Cue points and chapters
A **cue** is a named point on the video, in seconds. **Add a cue** puts one on. When the video plays across a cue, the **When a video reaches a cue point** event fires (also called **On video cue**). It tells you the cue's name, time and place in the list (`event.name`, `event.time`, `event.index`).

- Tick **Pause the video here** on a cue and the video has already paused when the event fires, so a question can appear. Play on with a [Control video](interaction-nodes#control-video) node when it is answered.
- To keep the video paused until something happens, bind the layer's **Hold paused** to something like `!answered`. While it is true, the video can't be started, even from its own controls.
- Jumping past a cue (dragging the bar, a chapter, a **Control video** seek) fires nothing, and jumping back arms it again. You never need to keep count of which questions were asked.

**Chapters** are named sections of the video. The video's own controls list them in browsers that show chapters. The **Chapter showing** binding says which one the video is in (1 is the first, 0 is before it), and `self.chapters` and `layer("Clip").chapters` give the list to formulas.

### Speed and frame step
**Speed** sets how fast the video plays: 1 is normal, 0.5 is half speed, 2 is double. The pitch stays where it was, so slowed speech still sounds like the speaker.

- Tick **Speed buttons** to put Slower, a speed readout (press it to go back to normal) and Faster over the video for the viewer.
- Tick **Frame step** for Back and Forward one frame buttons (the video pauses first). Set **Frames per second** to the video's own rate (most are 24, 25 or 30) so a step is one real frame.
- Everything is a real button, so <kbd>Tab</kbd> and <kbd>Enter</kbd> or <kbd>Space</kbd> work. With focus on the video or the buttons, <kbd>,</kbd> and <kbd>.</kbd> step a frame and <kbd>&lt;</kbd> and <kbd>&gt;</kbd> change the speed.

To drive it from the project, use a **Playback speed** [data binding](bindings) (it goes both ways, so a variable shows the speed the viewer chose and can set it too), or the [Control video](interaction-nodes#control-video) node. That node can play, pause, play or pause, go to a time, skip forward or back, step a frame, set the speed, or move to the next speed up or down. In an expression, `layer("Clip").rate` is the speed it is playing at right now.

## Video playback in variables
Add a [data binding](bindings) on the video layer and pick what to watch: **Playback position (s)**, **Playing**, **Playback speed**, **Length (s)**, **Ended**, **Chapter showing** (read only) or **Hold paused**. Then pick which way it goes.

- **Out** keeps a variable up to date with the video. Show the time in text (`{videoTime} s`), or bind a progress bar's width to `videoTime / videoLength`.
- **Both** lets the variable drive the video too. Set the position variable from a slider, a **Change a value or counter** node or a script and the video jumps there. Set **Playing** to false and it pauses.
- **In** drives it from a formula. To scrub the video with a dragged knob, bind the knob's **X** out to `knobX`, **Length (s)** out to `videoLength`, and **Playback position (s)** in to `remap(knobX, 0, artboard.width - layer('Knob').width, 0, videoLength, true)`. For the position as a percentage, use `remap(knobX, 0, artboard.width - layer('Knob').width, 0, 100, true)` (in a text layer, or another binding).

Positions are to the hundredth of a second. They work in Preview and in exports, not on the editing canvas, where the video doesn't play.
