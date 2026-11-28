# Timelines and keyframes
Animate properties with keyframes, record mode, looping and playback.

Each artboard can have any number of timelines. A timeline has **tracks**; each track animates one property of one layer through **keyframes**.

For the common cases there is no need to build one: [Animation presets](animation-presets) (Fade in, Slide in, Pop, Pulse, Shake, Fade out) write a timeline and its trigger for you.

## Adding keyframes
- Press **Record** (the red dot). A red bar at the top of the Inspector says **Recording keyframes at …**. While recording, every change you make to an animatable property at the playhead becomes a keyframe. Press it again to stop.
- Or click the diamond next to a field in the inspector to key the value it shows at the playhead (between two keys, that's the in-between value). With several layers selected it keys all of them. The diamond is filled when there's already a key at the playhead, and clicking it then updates that key.
- Once a property has keys on the open timeline, changing it in the inspector or on the canvas changes its key at the playhead (or adds one there), with or without Record, since the value you see is the timeline's. To change a layer's own value, the one it has before the timeline plays, switch to **Design view (no timeline)**.
- On a timeline set to **Whole frames**, a key goes on the start of the frame the playhead is in.
- Or select a layer, choose a property in the dropdown at the top left of the Timeline and press **+ Key**.
- Drag keys to retime them, <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove. The diamond on a layer's own row moves all of that layer's keys at that time. See [Copy, snap and stagger keys](timelines#copy-snap-and-stagger-keys) for the rest.

## Copy, snap and stagger keys
**Copy and paste.** Select keys (on one track or several, with <kbd>Shift</kbd>-click or by pressing a layer's own diamond), press <kbd>Ctrl</kbd>+<kbd>C</kbd>, move the playhead and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. The first copied key lands on the playhead and the others keep their spacing, values and easing. <kbd>Ctrl</kbd>+<kbd>X</kbd> copies and removes them. The pasted keys end up selected, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd> takes the whole paste back. Where they go:
- By default back onto the tracks they came from.
- Select a different layer on the canvas (when the keys came from one layer) and they go onto the same properties of that layer, with a new track where it has none. Properties that only mean something on the layer they came from (draw order, solo child, shape points, shader uniforms) are left out, and the message says so.
- Select the keys of one other track (when you copied from one track) and they go onto that track. The two properties must hold the same kind of value (a number onto a number, a colour onto a colour); otherwise nothing is pasted.
- A pasted key replaces any key already at that time on the track. Keys that would land past the end of the timeline are left out.

Pressing <kbd>Ctrl</kbd>+<kbd>C</kbd> copies keys while your last click was in the timeline, and layers otherwise.

**Snapping.** While you drag keys they pull onto the playhead (where it was when you grabbed the key) and onto markers when they come within a few pixels, and the keys you are dragging keep their spacing. Away from both they follow the 10 ms grid (100 ms with <kbd>Shift</kbd>). Hold <kbd>Alt</kbd> to drag without the pull.

**Stagger.** Select two or more layers that have keys on the timeline and press **Stagger…** in the Timeline bar. Enter a step in milliseconds: the first layer stays where it is, the next one's keys move later by the step, the next by twice the step, and so on. The order is the Layers panel's, top to bottom; layers with no keys on the timeline are skipped. A negative step runs the other way. Run it again and the offsets add up. If any key would leave the timeline, nothing moves and the message says how long to make it. It is one undo step.

## Keys on the keyboard
These work after you click in the Timeline. The full list is on the [Keyboard shortcuts](shortcuts#timeline) page.
- <kbd>Space</kbd> or <kbd>K</kbd> plays and pauses. <kbd>J</kbd> or <kbd>Home</kbd> goes to the start.
- <kbd>,</kbd> and <kbd>.</kbd> step back and forward one frame. Add <kbd>Shift</kbd> to jump between keys instead.
- <kbd>P</kbd>, <kbd>S</kbd>, <kbd>R</kbd>, <kbd>T</kbd> and <kbd>A</kbd> take you to the selected layer's **P**osition, **S**cale, **R**otation, opacity (**T**ransparency) and **A**nchor point. The Properties panel opens that field and focuses it, and the Timeline marks that property's track if the layer has one.
- <kbd>Shift</kbd>+<kbd>L</kbd> shows or hides [the list of timelines](timelines#the-list-of-timelines).

## When two timelines animate the same thing
If two timelines on a page both animate the same property of the same layer (both move Box's X, say), the list of timelines warns on each of them: **⚠ Also animated by** and the other timeline's name, with the layer and property. Nothing is wrong while only one of them plays. If both play at once, the one further down the list is applied last and wins; the warning's tooltip says which. Move the timelines in the list, animate different properties, stop one before the other starts, or use a **Blend in** to hand over.

## Timeline settings
The Timeline bar shows a short summary (length, loop, speed, autoplay, frame rate). Click the **gear** beside it to change them, and to rename the timeline; Esc or a click outside closes it.

| Setting | Meaning |
|---|---|
| Length | Duration in milliseconds |
| **Play once** / **Loop** / **Ping-pong** | What happens at the end |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast). To play backwards use a **Play or stop an animation** node set to **Play in reverse** |
| Frame rate | Frames per second the animation was made at (1 to 240); 0 leaves it free |
| Whole frames | Shown once a frame rate is set. Values are read at the start of the frame, so they step from frame to frame instead of gliding. Playback time, markers, sound and captions still use the real time. Applies in the player, blends and the canvas. Imported animations that snap to frames (for example 24 fps hand-drawn motion) come in with it on |

![The Timeline bar with its settings open: name, length, loop, autoplay, speed and frame rate.](help/timeline-settings.png)

A timeline can also carry **sound** (a voice-over that follows the playhead, with a waveform) and **captions** (timed text with a transcript for viewers). See [Narration, captions and transcript](captions).

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). In the Tween panel, drag the two handles on the graph to make your own curve; the dashed lines mark the start (0) and end (1) values, and the graph grows to show overshoot. Select a key to change its time or value.

## Changing text over time
Words can change on a timeline too: a title that says *hello* at 0 and *world* at 1 second. Every field that can be animated has the diamond, and that includes **Text** (and a button's **Label**, **Visible**, **Disabled**, a link's address and so on). To change text:
1. Open the Timeline, select the text layer and put the playhead where the first words should show. Click the diamond beside **Text**.
2. Move the playhead to when it should change, type the new words in the **Text** field (or turn on **Record** first), and click the diamond again.

Text does not glide: it holds the old words until the next key and then switches. So text keys are drawn as **squares** joined by a flat bar, not as diamonds with a curve. (True/false values such as **Visible** and **Disabled** are drawn the same way.) There is no easing to set for them. Words are never mixed in between, even when they look like a colour, such as *red*.

## Swap text
A hard switch can look abrupt. Right-click a text key (or select it and press the menu key, or open its **Keyframe** panel) to add a **Swap text** dip: the old words fade or blur out, the words change while they are hidden, and the new words come back in.

Choose **Fade out and in**, **Blur out and in** or **Fade and blur**, and how long each side lasts: **Quick** (150 ms), **Normal** (300 ms) or **Slow** (600 ms), or type your own in the Keyframe panel.

The dip is made of ordinary keys on the layer's *Opacity* and *Blur*, so you can move or reshape them afterwards. It is cut short where another text key is close. For viewers who ask for less motion the dip is left out and the words change at once. The first text key has no earlier words to change from, so it has no dip.

The **Keyframe** panel at the right of the timeline holds the selected key's settings. When they are taller than the bottom panel it scrolls by itself (the lanes stay where they are), so the last setting is always reachable.

**Swap text stays with its text key.** Drag the text key, or type a new time for it, and its dip moves by the same amount. Delete the text key and its dip goes too. The dip's keys that are tied to the text key are drawn as hollow diamonds.

Edit one of the dip's own keys by hand (drag it on its own, or change its time or value) and that key lets go and is an ordinary key from then on, while the rest still follow. To make the dip as plain keys that never follow, turn off **Keep the dip with this text key** in the Keyframe panel.

Moving the dip does not re-fit it: it keeps its length, so if it lands on another text key, run **Swap text** again. Running it again on the same key replaces the dip.

## Markers
A **marker** is a named point in time. Press **+ Marker** to add one at the playhead; it shows as a flag on the ruler and is called *Marker 1*, *Marker 2* and so on until you rename it. **Click** a marker to select it: it turns yellow, a dashed line runs down through the tracks, and a **Marker** panel appears at the right of the timeline with its name, its time, and (when [Steps](steps) use the timeline) its title and caption.

Drag it to move it, press the <kbd>←</kbd> and <kbd>→</kbd> arrow keys to nudge it (10 ms, 100 ms with Shift, or one frame when the timeline has a frame rate), and press <kbd>Delete</kbd> to remove it. Right-click a marker for the same things as a menu, and right-click the ruler to add a marker there.

To **do something when playback reaches a marker**, select it and press **+ When the playhead reaches this…**. That adds a **When an animation reaches a marker** node for the marker and a **Change a value or counter** node after it, and opens the Interactions tab on the Set variable node: pick the variable and the value there. The Marker panel says how many interactions already use the marker and has an **Open** link to them. If you rename the marker the nodes follow it.

A **When an animation reaches a marker** node runs its flow whenever playback passes the marker: going forwards or in reverse, and on every lap of a loop or ping-pong. Leave *Marker name* empty to react to every marker on the timeline; `event.marker` and `event.time` say which one fired. Scrubbing and seeking do not fire markers, only playing.

![The timeline bar and tracks. The flag on the ruler is a marker.](help/timeline-markers.png)

## The list of timelines
Beside the Timeline is a list of every timeline on the open artboard (or component), so you can see what is there and what is missing without opening a dropdown. Each row shows the timeline's length, whether it plays once, loops or ping-pongs, how many layers it animates, and what plays it (an interaction, a joystick, a blend, or its own autoplay). **Nothing plays it** means no interaction, joystick, blend or autoplay starts it yet.
- Click a row to open that timeline. The first row, **Design view**, goes back to the layers as they are.
- Select a layer on the canvas and the rows of timelines that animate it are marked **Animates ...** with a bar at their left.
- The open timeline's row shows its buttons (move, rename, duplicate, delete); every row has the same actions on right-click.
- Double-click a name, or use the pencil, to rename it. Two timelines on one artboard cannot share a name.
- Drag a row, or use the arrows, to reorder. The order matters for timelines that **hold their end pose**: a later one wins over an earlier one on the properties both key.
- The copy button makes a duplicate right after it (it does not autoplay, so the two do not both start). The bin deletes it and warns first when something plays it: those interactions will stop working until you point them at another timeline.
- On a component (a page that other pages place as a layer) the list says *Components usually have a timeline for each state. Missing:* and offers **+ Idle**, **+ Hover** and **+ Pressed** buttons for any that are missing. Each adds an empty timeline with that name. A timeline named with a word like rest, over, click or down counts as that state.
- To hide the list, press the **x** at its top. To bring it back, press **Show the list** on the Timeline bar (in Design view), tick **Show the list of timelines** in the **View** menu, or press <kbd>Shift</kbd>+<kbd>L</kbd>. Your choice is remembered for you.

## Sound and captions rows
Sound, Captions and Descriptions sit under the ruler in one group. When a timeline has no sound, captions or descriptions the group is folded to a single row, **Sound and captions**, that says what is in it. When it has some, the group is open. Click the arrow on that row to open or fold it by hand. Folded, the row still draws a mark for each clip and each cue along the time axis, so you can see where they are.

The **View** button (the eye) on the Timeline bar opens a menu with **Show the Sound lane**, **Show the Captions lane** and **Show the Descriptions lane**, which hide a lane altogether, and **Fold Sound and captions when empty**, which you can untick to keep the group open. Hiding a lane also hides its Add controls: tick it again in the same menu. These choices are kept for you across projects.

## Design view and timeline view
There are two ways to look at an artboard.

- **Design view**: the canvas shows the layers as they really are, with no animation applied. This is where you place and style things. Opening an artboard starts here, and the Timeline tab says **Design view: the canvas shows the layers as they are. Choose a timeline to see and edit its animation.**
- **Timeline view**: choose a timeline from [the list](timelines#the-list-of-timelines) beside the Timeline (or the dropdown at the top left of the Timeline tab) and the canvas shows that timeline at the playhead. Drag the playhead to see any frame, and with **Record** on, changes become keyframes.

Choose **Design view (no timeline)** in the same dropdown to go back. Record turns itself off when you do.

## Switching children and draw order
Two properties are not numbers. **Solo: active child** on a [solo group](groups-frames) switches which child shows, and **Draw order (children)** changes which child is in front. Both step at their keys instead of blending. Key them from the group's Solo and Draw order sections in the inspector.

## Playing from interactions
**Play or stop an animation** plays, restarts, pauses, stops, reverses, toggles or jumps to a time in a timeline. Give *Play*, *Restart* or *Reverse* a **Blend in** time (ms) to fade the timeline's pose in over the pose the layers have now instead of cutting to it: numbers and colours mix, anything else switches once the new pose weighs more. That is how to switch between looks (idle to wave) smoothly. Blend-in is off with reduced motion.

For what the look being left does meanwhile, the easing of the blend and cutting in on one, see [Transitions between looks](timelines#transitions-between-looks). From scripts: `ix.timeline('Intro').play()`. **When an animation finishes** fires when one finishes, and **When an animation reaches a marker** fires at each [marker](timelines#markers).

## Transitions between looks
A transition is a **Blend in** on the node that starts the next look (**Play or stop an animation**, or **Start a blend** for a [blend](blends)). These settings shape it:

| Setting | What it does |
|---|---|
| Blend in (ms) | How long the new look takes to take over. 0 cuts straight to it |
| Blend easing | The curve of the take-over. Linear is an even cross-fade; *Ease in* starts slowly, *Ease out* starts fast, or draw a bezier curve |
| Blend out of | The timelines and blends being replaced, by name: `"Idle"` or `["Idle", "Walk"]`. They **keep running** under the blend-in, so a walk cycle does not freeze mid-step while the wave fades in, and stop when it is done. With no blend-in time they stop at once. Leave it empty to leave things as they are (pause the old timeline yourself) |
| Freeze while blending out | The ones being replaced stand still where they are instead of running on |
| Can be left early | Another change is allowed to cut in before this blend-in has finished |

A blend works as a look too: a timeline can blend into a blend, a blend into a timeline, or a blend into another blend. Into a blend, its whole pose fades in (numbers and colours mix; anything else switches once the new pose weighs more).

Two more nodes make a state machine out of these:

- **Wait for blend-in** holds the flow while a timeline or blend is still blending in, so a change does not cut it short. It lets the flow through at once if the blend-in is marked *Can be left early* or nothing is blending in. With **Give up instead of waiting** the change is dropped instead, like a button press that is ignored during a transition.
- **Wait for time in timeline** holds the flow until a timeline has played to a time in milliseconds or a percentage of its length (an exit time: leave the idle only after it has played half through). It carries on at once if the timeline is already past that time.

Put **Wait for time in timeline** after a condition to leave "no sooner than" a point in the animation, and **Wait for blend-in** just before a change of look that should not interrupt the last one. **Random** (in the [interaction graph](interactions)) picks the next look.
