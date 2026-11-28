# Progress bars
A bar that fills to a value: scores, steps and timers, with a screen reader role and spoken value.

A **Progress bar** layer is a track with a bar that fills it up to a **value** out of a **max**. Use it for a score, the step someone is on, a countdown, or how much of a list is done. It replaces the pair of rectangles and the width formula that bars used to be made from, and unlike them it can tell a screen reader what it is.

Pick the **Progress bar** tool (in the **Data** group of the tool bar, which starts folded) and drag a box, or right-click the canvas and choose **New**, **Progress bar**. It starts at 40 of 100.

## Value and max

- **Value** and **Max** in the *Progress bar* section are the numbers. A value past either end is held at it: 150 of 100 is a full bar, below zero is an empty one.
- To make the bar follow something, open **Bindings**, add *Value* and write an expression: `score`, `step / 5 * 100`, `timeLeft`. *Max* can be bound too, so `questions.length` can be the whole bar.
- **Value** can be keyed on a [timeline](timelines) (the **◆** beside it), set by a **Change a layer's setting** or **Animate a layer's setting** node (pick *Progress value* in the list), or by a script with `ix.node('Bar').set('value', 60)`. Animate it from 0 to 100 over a few seconds and you have a countdown.

## Look

- The **track** is the layer's own **Fill** (shown as *Track fill*) and **Stroke**: any colour, gradient, token or several paints, a stroke around it, a shadow. The **bar** is the **Bar** paint in the progress section. Both can use [theme tokens](themes), so a bar restyles with the theme and the colourway.
- **Direction** is *Across* (it grows from the left) or *Up* (from the bottom). **From the far end** grows it from the right, or the top, instead.
- **Radius** rounds the track, and the bar is clipped to it. A gradient bar is laid over the whole track and uncovered as the bar grows, so a green-to-red meter shows red only when it is nearly full.

## A ring
**Shape** can be **Ring**, which fills round a circle, or **Half ring**, which fills along an arc like a gauge. The track is the layer's fill and the part done is the **Bar** colour, and **Thickness** is how thick the ring is. It reads out the same as a bar.

## For screen readers

**Tells screen readers** chooses what the layer is: a **progress bar** (work towards a goal), a **meter** (a measurement in a range, like volume) or nothing. The first two put `role` and `aria-valuenow`, `aria-valuemin` (0), `aria-valuemax` and `aria-valuetext` on the layer, kept up to date as the value changes. Give the layer a **text alternative** in *Accessibility* ("Course progress"): the [checker](accessibility-checker) asks for one. A layer marked **Decorative** is hidden from screen readers whatever this says.

**Spoken value** is what is read out for the number. Blank says the percentage ("40%"). Write your own with `{value}`, `{max}`, `{percent}` and any variable: `Step {step} of 5`. A max of 0 or less makes the bar indeterminate: it has no value to announce.

## Where it works

Progress bars draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of a page. They are **not** part of a Lottie export (the export lists them as left out).

## A shader as a fill
A shader doesn't have to be a layer of its own. In any **Fill** picker, choose **Shader** and pick one of the starter shaders: the layer is painted with it, clipped by its corner radius, and the sliders under the picker are that shader's own controls. Rectangles, ellipses, frames, buttons and progress bars all take one.

The layer's plain fill shows until the shader has drawn, and comes back if it fails, so nothing is ever a blank box. **Animate on the canvas** keeps it moving while you edit; left off you get one still frame, which keeps the editor quick.

Use a shader layer instead when you want to write the code, pick your own uniforms, or feed it a picture.
