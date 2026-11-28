# Project settings
Start page, fit, page title, fonts, live collaboration, sandbox, reduced motion and Optimise output.

![The Project section of the Inspector, with Allowed data hosts filled in and the library and reduced motion boxes below it.](help/project-settings.png)

The **Project** section holds the settings for the whole project, not one page. Click an empty part of the canvas, or a page's name, and it shows in the Inspector, below the page's own settings.

| Setting | Meaning |
|---|---|
| Colourway | Branded starters only. The colour theme the project opens in, and whether learners can switch it. See [Branded starter packs](branded-starters#switching-colourway) |
| UniSQ look | Every other project. **Apply the UniSQ look…** adds a colourway and the branded page frame to the pages. See [Themes and colour tokens](themes#apply-the-unisq-look) |
| Name | The project's name, as on the projects page |
| Page title | The title of the browser tab for the exported page |
| Description | A note about the project, kept in the file |
| Stage shape | **Free** (each page sets its own size, the default), **16:9, widescreen** or **4:3**. With a shape, the stage keeps it the way a game does: letterboxed in any window, a StudyDesk frame of that shape, a full screen button at its top right when it's in a frame or on a phone, and a phone held upright asked to turn on its side (or **Play this way**). Pages of another shape are letterboxed inside it; 1280 x 720 is the usual size for 16:9 |
| Fit | How the page scales to the space it's given (with a **Stage shape**, always letterboxed): **Contain (letterbox)**, **Cover (crop)**, **Stretch**, **Fit width (page height follows)** or **Actual size** |
| Page background | The colour around the page in a share link, embed or downloaded page. See-through to start with, so an embed never shows a dark box while it loads and resizes |
| Hide sideways scrollbar | Off unless you tick it. When the project plays inside a frame (the Link for StudyDesk, an embedded share link or file), the page never shows a horizontal scrollbar. Opened in its own tab it scrolls as usual. Press **Update** in Share after changing it |
| Hide up-down scrollbar | On to begin with. The frame grows to fit the project, so a vertical scrollbar would only flicker on and off while it resizes. Left as it starts, it comes back if nothing sizes the frame (the project stays taller than the frame for a second), so nothing is out of reach. Ticked on purpose, it stays hidden; unticked, the page scrolls as usual. Opened in its own tab it always scrolls. Press **Update** in Share after changing it |
| Live collaboration | Off unless you turn it on. On, people who share the project see each other's cursors and changes as they happen; off, nothing extra is sent and the project is saved one person at a time. See [Live editing and saving](live-editing#live-collaboration) |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Run embedded HTML in the page | Only shown while the sandbox box above is off. Lets Embed layers with HTML reach the page, for HTML you wrote and trust. See [Web elements](web-elements) |
| Allowed data hosts | Hosts that data may be loaded from, one per line (`api.example.com`, `*.example.com`). Empty allows any http(s) host. See [Data sources](data-sources#what-may-be-loaded) |
| This project is a library | Shares the pages you publish, with the project's styles and assets, as components for other projects. See [Libraries](libraries) |
| Wait for user session before start | For the Link for StudyDesk. On, the project stays on its loading screen until StudyDesk has said who the learner is, however long that takes, so their saved work is always there when it starts. Off, it starts at once with whatever is known, which suits a project that needs nothing from the learner's session. It starts ticked for a project that saves user data, remembers variables or reports a result, and unticked otherwise. Press **Update** in Share after changing it. A plain share link, an exported file and Preview have no session to wait for, so they start as usual. See [Results and progress](results) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |
| Depth range | How far, in pixels, a layer with a depth of 100% moves as the pointer goes from the middle of the window to its edge. It starts at 40 px. Each layer's own **Depth** is in its Inspector. See [Depth (parallax)](fill-stroke#depth-parallax) |
| Tilt moves depth layers | Off by default. On phones and tablets, layers with a depth also follow how the device is tilted. iPhones and iPads ask the viewer for permission to use the motion sensor on their first tap, never when the page loads. If they refuse, or there is no sensor, the layers follow the pointer only |
| Optimise output | On by default. Downloads and share links carry smaller copies of big pictures, and your originals stay at full size. The slider under it runs from **Smaller files** to **Better quality** (it starts at **Better quality**). **Optimise pictures now** makes the copies straight away and tells you what they save. See [Exporting](export#optimised-pictures) |
| Start page | Shown first in the player. Set it with **Make start page** on a page |

## More sections
Below those settings the Inspector has sections of their own for the project, each with its own help:
- **Captions and narration**: whether captions and descriptions start on, and whether the player shows its viewer buttons. See [Narration, captions and transcript](captions).
- **Read aloud**: **Offer read-aloud** gives every page a **Listen** button, with a **Language** and a **Button at** corner. See [Read it to me](read-aloud).
- **Results and progress**: the score, pass mark and when the project counts as complete. See [Results and progress](results).
- **Learner records**: which things the player counts for [Insights](insights).
- **Microphone and camera**: what the project may use. See [Microphone, camera and photos](sensors).
- **Credits**: whether learners get a **Credits** button, and whether exported and shared pages carry the attributions list. The entries are in the **Attributions** tab. See [Attributions and references](attributions).

## Fonts
The **Fonts** section lists the fonts the project loads. New projects start with Open Sans.

- **Add a Google font…** is a search box over every Google font. Type, then press <kbd>Enter</kbd> or click. The chips narrow it by Sans, Serif, Display, Handwriting or Mono.
- Or upload font files in the **Assets** panel.
- Choosing a font for a text layer adds it here by itself.

Fonts come from this server, which keeps a copy of each Google font the first time it is used. A lesson waits a moment for its fonts before it shows, so text never appears in one font and then changes.
