# Script layers (type "draw") and the g drawing API

Script layers (type "draw", shown as "Script layer"): a box painted by a script every frame, for generative art, particles, charts and custom visualisations. Fields: code (the script), fps (0 = every frame, else a cap), pixelRatio ("auto" or a number), runInEditor (paint on the editor canvas, one still frame). The code defines function draw(g, t, dt) and optionally function setup(g); g records drawing commands, it is not a canvas. The script runs in the sandbox (projects with settings.scriptSandbox, the default; without the sandbox bundle the layer shows nothing). Errors stop that layer only. Starter scripts to adapt (set as `code`): "Pulsing circle", "Particles", "Bar chart from a variable", "Sine waves", "Clock". The g API:
  function draw(g, t, dt): Runs every frame. t is seconds since the layer started, dt seconds since the last frame it drew. The canvas is cleared before each frame, so draw everything every time.
  function setup(g): Optional. Runs once, before the first draw. Top-level code and `let` variables outside the functions keep their values between frames.
  g.width, g.height: The layer's size in px. Draw in these units, 0,0 is the top-left; the pixel ratio is handled for you.
  g.pointer: {x, y, down, inside}: the pointer in layer px, whether a button is down, and whether it is over the layer.
  g.frame: How many frames this layer has drawn.
  g.clear(color?): Wipes the canvas, optionally filling it with a colour.
  g.fill(color) / g.noFill(): Fill for the shapes and text that follow. Starts as black. A colour is any CSS colour, or a gradient from g.linearGradient / g.radialGradient.
  g.stroke(color, width = 1) / g.noStroke(): Outline for the shapes that follow. Starts off.
  g.lineStyle({cap, join, dash, dashOffset}): cap: butt, round or square. join: miter, round or bevel. dash: lengths like [6, 4].
  g.rect(x, y, w, h, radius = 0): A rectangle (top-left corner and size).
  g.circle(x, y, r) / g.ellipse(x, y, rx, ry, rotation = 0): Centre and radius. Rotation is in radians.
  g.line(x1, y1, x2, y2): A line, drawn with the stroke (the fill colour when there is no stroke).
  g.path(points, closed = false): Joins points ([[x, y], ...], [{x, y}, ...] or a flat [x, y, x, y, ...]) and draws them with the fill and stroke.
  g.begin(), g.moveTo(x, y), g.lineTo(x, y), g.bezierTo(c1x, c1y, c2x, c2y, x, y), g.quadTo(cx, cy, x, y), g.arc(x, y, r, a0, a1, ccw), g.close(), g.paint(): Build any outline step by step; paint() fills and strokes it. Angles are in radians.
  g.svgPath(d): An SVG path string ("M0 0L10 10..."), drawn with the fill and stroke.
  g.text(str, x, y, {size = 16, font, weight, italic, align = "left", baseline = "alphabetic", maxWidth}): Text with the fill (and stroke). font is a family name, e.g. one of the project fonts. baseline: top, middle, alphabetic or bottom.
  g.image(assetNameOrId, x, y, w?, h?): An image asset from the project, at its own size unless w and h are given. Optional source rectangle: g.image(a, x, y, w, h, sx, sy, sw, sh).
  g.save() / g.restore(): Keep and bring back the fill, stroke, transform, opacity, blend mode and clip.
  g.translate(x, y) / g.rotate(radians) / g.scale(sx, sy = sx): Move, turn or scale everything that follows (until restore).
  g.clipRect(x, y, w, h): Only draw inside this rectangle (until restore).
  g.alpha(a): Opacity 0 to 1 for what follows.
  g.blend(mode): normal, add, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion.
  g.shadow(color, blur, x = 0, y = 0) / g.noShadow(): A drop shadow for what follows.
  g.linearGradient(x0, y0, x1, y1, stops) / g.radialGradient(x, y, r0, r1, stops): A gradient to pass to fill or stroke. stops: colours, spaced evenly, or [[offset, color], ...]. Valid for the frame it is made in.
  g.rgb(r, g, b, a = 1) / g.hsl(h, s, l, a = 1): Colour strings. h is 0 to 360, s and l 0 to 100.
  g.random(), g.random(max), g.random(min, max) / g.seed(n): Seeded random numbers: the layer draws the same numbers on every run, g.seed(n) restarts the sequence (do that at the start of draw for a picture that does not change from frame to frame).
  ix.vars.name, ix.data.name: Project variables and data sources, read as in any script (vars is also a shortcut). A script layer can read them; it cannot move other layers.
Example: {"type":"draw","name":"Pulse","width":320,"height":200,"code":"function draw(g, t) {\n  g.clear('#10131a');\n  g.fill('#6f8cff');\n  g.circle(g.width / 2, g.height / 2, 24 + Math.sin(t * 2) * 8);\n}"}.
