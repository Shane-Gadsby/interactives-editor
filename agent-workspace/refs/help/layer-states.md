# Layer states
Looks a layer takes on when it is hovered, pressed, focused, disabled, or whenever something is true.

A **state** is a look a layer takes on for a while: the colour a button goes when you hover it, the green a right answer turns, the grey a disabled control sits at. Without states, each of those is a ternary written into four or five separate bindings on the same layer. With them it's one row.

**Add one:** select the layer, open **States** in the Properties panel and press **Add a state**. Pick **When** and set only the properties that change.

**Buttons already respond.** Every button has a hover and a pressed look without you adding anything: a faint tint over its own colour, darker on a light button and lighter on a dark one. A hover or pressed state of your own replaces the tint, and a disabled button doesn't respond.

## When a state is on
- **Hovered**, **Pressed**, **Focused**: the layer's own pointer and keyboard. Hovering something *inside* it doesn't count. These need the piece to be running, so they show in **Preview** and in what you share, not on the canvas.
- **Disabled**: the layer's own **Disabled** setting (buttons and inputs).
- **Being dragged**, **Picked up**: a draggable layer while it follows the pointer, or while it's held after a tap or Space.
- **A place it could go**, **The place it is over**, **A place that refuses it**: a drop zone while something it would take is held, while that something is over it, and while what's over it can't go there (the wrong tag, full, or its **Takes it when** said no). A layer with one of these states loses the player's own dashed or red outline for it, so your look is the only one.
- **When…**: on while an expression is true, such as `item.state == "right"` or `picked == 3`. Give it a **Name** so the list reads as it should. These show on the canvas too, so what you style is what you see.

## What a state changes
**Fill**, **Line** and **Text** are there from the start; **Also change** adds **Opacity**, **Scale W**, **Scale H**, **Radius**, **Line width** or **Line style** (solid, dashed or dotted). A held card with a dashed border and the places it could go dashed too is two states. Anything you leave alone keeps the layer's own value, so a hover state that only sets **Fill** changes nothing else.

Colours can be [theme tokens](themes) like any other colour, so a state follows the theme instead of pinning a hex.

## Several at once
States are applied in the order they're listed, so a later one wins where two change the same thing. Put the general ones first and the specific ones last. The arrows move a state up or down.

A state also beats a [binding](bindings) that sets the same property, so you can keep a binding for the normal look and let a state take over.

**More:** [Bindings](bindings), [Expressions](expressions), [Themes and colour tokens](themes), [Questions and quizzes](question-kit) for the right/wrong marking a **When…** state usually reads.
