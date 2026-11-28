# Shader layers
A layer painted by a GPU shader: clouds, plasma, ripples, glows, distortion of pictures, and your own GLSL.

A **Shader layer** is a box painted by a small program that runs on the graphics card for every pixel, many times a second. Use it for backgrounds that move, glows, noise, ripples and distortions of pictures: effects that shapes and timelines can't do.

Pick the **Shader layer** tool (in the **Media** group of the tool bar, which starts folded) and drag a box. It starts with drifting clouds, so you have a result at once. The **Start from** menu in the inspector replaces the shader with a preset: **Clouds (gradient noise)**, **Plasma**, **Ripples**, **Glow backdrop**, **Voronoi cells**, **Wave distortion (image)**, **CRT / scanlines (image)**, **Dot halftone (image)**, **Film grain (image)**. The presets marked *(image)* filter a picture: choose an image for their `u_image` uniform (until you do, they show a built-in test picture).

## The code

You write one function. Everything else (precision, the built-in values, your uniforms) is added for you.

```
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;          // 0 to 1 across the layer, y up
  float glow = 0.5 + 0.5 * sin(u_time * speed + uv.x * 6.0);
  fragColor = vec4(tint.rgb * glow, 1.0);      // straight alpha
}
```

- `fragCoord` is the pixel being painted, in canvas pixels with the origin at the **bottom-left**. `fragColor` is the colour to paint, with **straight** (not premultiplied) alpha.
- It is GLSL ES: WebGL 2 (ES 3.00) when the browser has it, otherwise WebGL 1 (ES 1.00). Write code that works in both: `texture2D` and `texture` both work, and loops need constant limits.
- Don't write `main` or declare `uniform`s for the built-ins: the player does.

## Built-in values

| Name | What |
|---|---|
| `u_time` | Seconds since the layer started. Frozen for viewers who prefer reduced motion. |
| `u_resolution` | `vec2`: the canvas size in pixels. |
| `u_mouse` | `vec3`: the pointer over the layer, x and y from 0 to 1 (y up), z is 1 while the button is down. Correct even if the layer is rotated or inside a group. |
| `u_frame` | Frames drawn so far. |
| `v_uv` | `vec2`: 0 to 1 across the layer, y up. |

## Uniforms: your own values

The **Uniforms** list gives the shader values you can change. Press **Add a uniform**, choose a type, and give it a **name**: that name is a variable in the code. Types: **Number** (a `float`), **Vector 2**, **Vector 3** and **Vector 4** (`vec2`, `vec3`, `vec4`), **Colour** (a `vec4` of red, green, blue and alpha, 0 to 1) and **Image** (a `sampler2D`, with `name_size` as a `vec2` of its pixel size, 0 until it has loaded).

- **Animate** them: the **◆** beside a value keys it at the playhead on the timeline. A vector keys each part (x, y, z, w) on its own track, a colour fades between colours, and an image uniform switches picture at each key. The tracks are `uniforms.<number>.value`, and `uniforms.<number>.value.<part>` for the parts of a vector, counting from 0 in list order.
- **Bind** them to variables in **Data bindings**: pick the uniform from the property list (for example *Uniform speed*) and type an expression, such as `score / 100`.
- A name has letters, digits and underscores, can't start with a digit, and can't be a built-in or a GLSL word. A uniform with a bad name is left out and the inspector says why.
- Removing a uniform also removes the tracks and bindings that were aimed at it, and the ones after it move up.

## Settings

- **FPS**: a frame rate cap while it animates. 0 draws on every frame.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the page's scale, up to 2. Shaders cost time for every pixel, so a layer is held to about 4 million pixels however large it is: past that it is drawn smaller and stretched.
- **Animate while editing**: runs the shader live on the editor canvas. Off (the default) paints one still frame at the timeline's time (0 when none is showing), which keeps editing smooth. **Preview** always runs it.

## Errors

If the shader doesn't compile, the layer shows a placeholder and the inspector lists each problem with its **line number** in your code; those lines are marked in the editor. The same messages appear in Preview's event list. Other layers carry on. Fix the code and the shader starts again.

## Limits and performance

- All shader layers on a page share **one WebGL context**, so the browser's limit on contexts doesn't apply. Each layer is limited to 24 on a page; extra ones show a placeholder and a warning.
- A shader is **paused while it is off screen** or the browser tab is hidden. A shader that reads neither `u_time` nor `u_mouse` (it only uses its uniforms) is drawn only when something changes.
- Without WebGL (some remote desktops and very old devices) the layer shows a placeholder and says so.
- **Pictures** you use as image uniforms must come from your project's assets (or a site that allows it); a picture the browser won't hand to WebGL is skipped with a warning.
- **Export**: shader layers work in the single-file export, **.ixp** packages and the embeddable player. A **PNG or SVG picture** of a page shows the layer's current frame (at the timeline's time, or 0), not a running animation.

## Shader filter on an image

An **image** layer can draw itself through a shader: **+** in **Effects**, then **Shader filter**. It has the same code editor, uniforms and settings, and `u_image` (the layer's own picture, with its fit applied) and `u_image_size` are ready to use. The plain picture shows until the shader has drawn, and again if it fails. This works for **image layers only** (not with a 9-slice); other layers can't be filtered this way. To run a shader over something else, make it a **Shader layer** with an image uniform.
