# Script layers
A layer painted by a script every frame: generative art, particles, charts and custom visualisations.

A **Script layer** is a box that a script paints every frame. Use it for things shapes and timelines can't do well: particles, generative art, live charts, custom meters and any other visualisation that is easier to compute than to draw by hand.

Pick the **Script layer** tool (in the **Media** group of the tool bar, which starts folded: click **Media** to open it) and drag a box. It starts with a small script that already runs, and the **Start from** menu in the inspector replaces it with a starter: **Pulsing circle**, **Particles**, **Bar chart from a variable**, **Sine waves**, **Clock**.

## The script

```
// Anything declared outside the functions keeps its value between frames
const dots = [];

function setup(g) {
  for (let i = 0; i < 50; i++) dots.push({ x: g.random(g.width), y: g.random(g.height) });
}

function draw(g, t, dt) {
  g.clear('#10131a');
  g.fill('#6f8cff');
  for (const d of dots) g.circle(d.x, (d.y + t * 20) % g.height, 3);
}
```

- `draw(g, t, dt)` runs every frame. **t** is seconds since the layer started and **dt** is seconds since its last frame.
- `setup(g)` is optional and runs once first.
- The layer is **cleared before every frame**, so draw everything each time. Keep animation state in variables outside `draw`.
- Coordinates are layer pixels, 0,0 at the top-left of the box. Resize the layer and `g.width` and `g.height` follow.
- Read project variables and data with `ix.vars.name` and `ix.data.name`, as in any [script](scripts). A bar chart can read a list variable, a meter a number. A script layer reads the project; it can't move other layers.

## The drawing API

`g` is a small recorder, not a canvas: each call adds a drawing command, and the player paints the list onto a real canvas. Fill and stroke are set first and then used by the shapes that follow.

| Call | Does |
|---|---|
| `function draw(g, t, dt)` | Runs every frame. t is seconds since the layer started, dt seconds since the last frame it drew. The canvas is cleared before each frame, so draw everything every time. |
| `function setup(g)` | Optional. Runs once, before the first draw. Top-level code and `let` variables outside the functions keep their values between frames. |
| `g.width, g.height` | The layer's size in px. Draw in these units, 0,0 is the top-left; the pixel ratio is handled for you. |
| `g.pointer` | {x, y, down, inside}: the pointer in layer px, whether a button is down, and whether it is over the layer. |
| `g.frame` | How many frames this layer has drawn. |
| `g.clear(color?)` | Wipes the canvas, optionally filling it with a colour. |
| `g.fill(color) / g.noFill()` | Fill for the shapes and text that follow. Starts as black. A colour is any CSS colour, or a gradient from g.linearGradient / g.radialGradient. |
| `g.stroke(color, width = 1) / g.noStroke()` | Outline for the shapes that follow. Starts off. |
| `g.lineStyle({cap, join, dash, dashOffset})` | cap: butt, round or square. join: miter, round or bevel. dash: lengths like [6, 4]. |
| `g.rect(x, y, w, h, radius = 0)` | A rectangle (top-left corner and size). |
| `g.circle(x, y, r) / g.ellipse(x, y, rx, ry, rotation = 0)` | Centre and radius. Rotation is in radians. |
| `g.line(x1, y1, x2, y2)` | A line, drawn with the stroke (the fill colour when there is no stroke). |
| `g.path(points, closed = false)` | Joins points ([[x, y], ...], [{x, y}, ...] or a flat [x, y, x, y, ...]) and draws them with the fill and stroke. |
| `g.begin(), g.moveTo(x, y), g.lineTo(x, y), g.bezierTo(c1x, c1y, c2x, c2y, x, y), g.quadTo(cx, cy, x, y), g.arc(x, y, r, a0, a1, ccw), g.close(), g.paint()` | Build any outline step by step; paint() fills and strokes it. Angles are in radians. |
| `g.svgPath(d)` | An SVG path string ("M0 0L10 10..."), drawn with the fill and stroke. |
| `g.text(str, x, y, {size = 16, font, weight, italic, align = "left", baseline = "alphabetic", maxWidth})` | Text with the fill (and stroke). font is a family name, e.g. one of the project fonts. baseline: top, middle, alphabetic or bottom. |
| `g.image(assetNameOrId, x, y, w?, h?)` | An image asset from the project, at its own size unless w and h are given. Optional source rectangle: g.image(a, x, y, w, h, sx, sy, sw, sh). |
| `g.save() / g.restore()` | Keep and bring back the fill, stroke, transform, opacity, blend mode and clip. |
| `g.translate(x, y) / g.rotate(radians) / g.scale(sx, sy = sx)` | Move, turn or scale everything that follows (until restore). |
| `g.clipRect(x, y, w, h)` | Only draw inside this rectangle (until restore). |
| `g.alpha(a)` | Opacity 0 to 1 for what follows. |
| `g.blend(mode)` | normal, add, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion. |
| `g.shadow(color, blur, x = 0, y = 0) / g.noShadow()` | A drop shadow for what follows. |
| `g.linearGradient(x0, y0, x1, y1, stops) / g.radialGradient(x, y, r0, r1, stops)` | A gradient to pass to fill or stroke. stops: colours, spaced evenly, or [[offset, color], ...]. Valid for the frame it is made in. |
| `g.rgb(r, g, b, a = 1) / g.hsl(h, s, l, a = 1)` | Colour strings. h is 0 to 360, s and l 0 to 100. |
| `g.random(), g.random(max), g.random(min, max) / g.seed(n)` | Seeded random numbers: the layer draws the same numbers on every run, g.seed(n) restarts the sequence (do that at the start of draw for a picture that does not change from frame to frame). |
| `ix.vars.name, ix.data.name` | Project variables and data sources, read as in any script (vars is also a shortcut). A script layer can read them; it cannot move other layers. |

## Settings

- **FPS**: a frame rate cap. 0 draws on every frame; 30 is plenty for most charts.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the page's scale, up to 3. A fixed number is sharper but slower; very large layers are held to what the browser can allocate.
- **Paint while editing**: draws a single still frame on the canvas, at the timeline's time (0 when no timeline is showing), so you can lay out the page. Turn it off for a heavy script; the layer then shows as a placeholder. **Preview** always runs it.

The layer is an ordinary layer otherwise: move, rotate, fade, blend, mask and animate it, and click it with a **When clicked or hovered** event. Inside the script, `g.pointer` gives the pointer in the layer's own pixels (`x`, `y`, `down`, `inside`), correct even if the layer is rotated or inside a group.

## Errors and limits

- The script runs in the [sandbox](scripts) when the project has **Run scripts in the sandbox** on (the default): no page, network or storage access, and a frame that takes more than about 100 ms is stopped. Without the sandbox bundle the layer shows nothing.
- An error in the script **stops that layer only**. The message shows under the code, in the layer on the canvas, and in the Preview's event list. Edit the code to start it again.
- A frame is limited to 20,000 drawing commands. Past that, the rest are dropped and a warning is shown. Join many segments into one path with `g.path`.
- `g.random()` is seeded: the layer draws the same numbers on every run. Call `g.seed(1)` at the start of `draw` for a picture that stays the same from frame to frame.
