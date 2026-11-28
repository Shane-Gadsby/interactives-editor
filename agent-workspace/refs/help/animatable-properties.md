# Animatable properties
Every property timelines, bindings and the property nodes can change.

A property is something about a layer that you can change over time or with a rule: where it is, how big, how see-through, its colour. Any property below can get keyframes on a timeline (see [Timelines and keyframes](timelines)), be bound to an expression (see [Bindings](bindings)), and be changed with **Change a layer's setting** and **Animate a layer's setting**.

The first column is the technical name of the property. Scripts use it: `ix.node('Box').set('fill.color', '#f00')`.

| Path | Property | Kind |
|---|---|---|
| `x` | X | number |
| `y` | Y | number |
| `width` | Width | number |
| `height` | Height | number |
| `rotation` | Rotation | number |
| `scaleX` | Scale X | number |
| `scaleY` | Scale Y | number |
| `opacity` | Opacity | number |
| `visible` | Visible | boolean |
| `cornerRadius` | Corner radius | number |
| `cornerRadii.0` | Corner radius top-left | number |
| `cornerRadii.1` | Corner radius top-right | number |
| `cornerRadii.2` | Corner radius bottom-right | number |
| `cornerRadii.3` | Corner radius bottom-left | number |
| `originX` | Origin X (0-1) | number |
| `originY` | Origin Y (0-1) | number |
| `fill.color` | Fill colour | color |
| `stroke.width` | Stroke width | number |
| `stroke.paint.color` | Stroke colour | color |
| `fill.opacity` | Fill opacity | number |
| `fill.feather` | Fill feather | number |
| `stroke.opacity` | Stroke opacity | number |
| `stroke.feather` | Stroke feather | number |
| `fills.0.color` | Fill 2 colour | color |
| `fills.0.opacity` | Fill 2 opacity | number |
| `fills.0.feather` | Fill 2 feather | number |
| `fills.0.offsetX` | Fill 2 offset X | number |
| `fills.0.offsetY` | Fill 2 offset Y | number |
| `strokes.0.width` | Stroke 2 width | number |
| `strokes.0.paint.color` | Stroke 2 colour | color |
| `strokes.0.opacity` | Stroke 2 opacity | number |
| `strokes.0.feather` | Stroke 2 feather | number |
| `strokes.0.trimStart` | Stroke 2 trim start % | number |
| `strokes.0.trimEnd` | Stroke 2 trim end % | number |
| `strokes.0.trimOffset` | Stroke 2 trim offset % | number |
| `fill.from.x` | Fill gradient start X | number |
| `fill.from.y` | Fill gradient start Y | number |
| `fill.to.x` | Fill gradient end X | number |
| `fill.to.y` | Fill gradient end Y | number |
| `fill.center.x` | Fill gradient centre X | number |
| `fill.center.y` | Fill gradient centre Y | number |
| `fill.radius` | Fill gradient radius | number |
| `stroke.paint.from.x` | Stroke gradient start X | number |
| `stroke.paint.from.y` | Stroke gradient start Y | number |
| `stroke.paint.to.x` | Stroke gradient end X | number |
| `stroke.paint.to.y` | Stroke gradient end Y | number |
| `stroke.paint.center.x` | Stroke gradient centre X | number |
| `stroke.paint.center.y` | Stroke gradient centre Y | number |
| `stroke.paint.radius` | Stroke gradient radius | number |
| `fills.0.from.x` | Fill 2 gradient start X | number |
| `fills.0.from.y` | Fill 2 gradient start Y | number |
| `fills.0.to.x` | Fill 2 gradient end X | number |
| `fills.0.to.y` | Fill 2 gradient end Y | number |
| `fills.0.center.x` | Fill 2 gradient centre X | number |
| `fills.0.center.y` | Fill 2 gradient centre Y | number |
| `fills.0.radius` | Fill 2 gradient radius | number |
| `strokes.0.paint.from.x` | Stroke 2 gradient start X | number |
| `strokes.0.paint.from.y` | Stroke 2 gradient start Y | number |
| `strokes.0.paint.to.x` | Stroke 2 gradient end X | number |
| `strokes.0.paint.to.y` | Stroke 2 gradient end Y | number |
| `strokes.0.paint.center.x` | Stroke 2 gradient centre X | number |
| `strokes.0.paint.center.y` | Stroke 2 gradient centre Y | number |
| `strokes.0.paint.radius` | Stroke 2 gradient radius | number |
| `color` | Text colour | color |
| `fontSize` | Font size | number |
| `letterSpacing` | Letter spacing | number |
| `fontWeight` | Font weight | number |
| `lineHeight` | Line height | number |
| `blur` | Blur | number |
| `brightness` | Brightness | number |
| `reveal` | Letters shown | number |
| `shadow.blur` | Shadow blur | number |
| `shadow.x` | Shadow X | number |
| `shadow.y` | Shadow Y | number |
| `shadow.color` | Shadow colour | color |
| `text` | Text | string |
| `innerRatio` | Star inner ratio | number |
| `barFill.color` | Progress bar colour | color |
| `cursor` | Cursor | string |
| `link.url` | Link URL | string |
| `label` | Button label | string |
| `assetId` | Image / video asset | string |
| `disabled` | Disabled (button or input) | boolean |
| `disabledOpacity` | Disabled opacity | number |
| `ariaLabel` | Text alternative | string |
| `sayAs` | Say it like | string |
| `ariaDescription` | Accessible description | string |
| `ariaChecked` | Checked (checkbox role) | boolean |
| `ariaExpanded` | Expanded (button role) | boolean |
| `ariaPressed` | Pressed (button, toggle) | boolean |
| `ariaCurrent` | Current (true, or page, step, location) | string |
| `src` | Embed/video URL | string |
| `stroke.trimStart` | Trim start % | number |
| `stroke.trimEnd` | Trim end % | number |
| `stroke.trimOffset` | Trim offset % | number |
| `solo.active` | Solo: active child | string |
| `drawOrder` | Draw order (children) | list |
| `constraints.0.distance` | Follow path distance | number |
| `constraints.0.strength` | Constraint strength | number |
| `modifiers.0.offset` | Text modifier offset % | number |
| `modifiers.0.start` | Text modifier start % | number |
| `modifiers.0.end` | Text modifier end % | number |
| `modifiers.0.strength` | Text modifier strength % | number |
| `modifiers.0.falloffStart` | Text modifier falloff start % | number |
| `modifiers.0.falloffEnd` | Text modifier falloff end % | number |
| `modifiers.0.x` | Text modifier X | number |
| `modifiers.0.y` | Text modifier Y | number |
| `modifiers.0.rotation` | Text modifier rotation | number |
| `modifiers.0.scale` | Text modifier scale | number |
| `modifiers.0.opacity` | Text modifier opacity | number |
| `modifiers.0.color` | Text modifier colour | color |
| `modifiers.0.letterSpacing` | Text modifier letter spacing | number |
| `modifiers.0.blur` | Text modifier blur | number |
