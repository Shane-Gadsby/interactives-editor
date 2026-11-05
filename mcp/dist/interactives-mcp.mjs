#!/usr/bin/env node
import { AsyncLocalStorage } from "node:async_hooks";
const OUT = [{ id: "out", label: "" }];
const CONTINUE = [
  {
    key: "continue",
    label: "Continue",
    type: "select",
    options: [
      { value: "end", label: "When it finishes" },
      { value: "percent", label: "Part-way through" },
      { value: "start", label: "Straight away" }
    ],
    default: "end",
    help: "When the next node runs: when this finishes, part-way through, or straight away"
  },
  { key: "continueAt", label: "At (%)", type: "number", default: 50, showIf: { key: "continue", values: ["percent"] }, help: "How far through, 0 to 100" }
];
const MIX_OPS = ["play", "restart", "reverse"];
const mixParams = (ops) => {
  const only = ops ? { showIf: { key: "op", values: ops } } : {};
  return [
    { key: "fade", label: "Blend in (ms)", type: "expr", default: "0", ...only },
    { key: "fadeEase", label: "Blend easing", type: "easing", default: "linear", help: "Shapes the blend-in: how fast the new look takes over. Linear is an even cross-fade.", ...only },
    {
      key: "outgoing",
      label: "Blend out of",
      type: "expr",
      default: "",
      placeholder: '"Idle"',
      help: 'The timelines and blends this replaces, by name: "Idle" or ["Idle", "Walk"]. They keep running while the new look blends in over them, then stop. With no blend-in time they stop straight away.',
      ...only
    },
    { key: "hold", label: "Freeze while blending out", type: "boolean", default: false, help: "The timelines and blends being replaced stop where they are instead of running on while the new look blends in", ...only },
    { key: "earlyExit", label: "Can be left early", type: "boolean", default: false, help: "Another change (a Wait for blend-in node) may cut in before this blend-in is done", ...only }
  ];
};
const LINK_TARGETS = [
  { value: "_blank", label: "New tab (_blank)" },
  { value: "_self", label: "Same frame (_self)" },
  { value: "_parent", label: "Parent frame (_parent)" },
  { value: "_top", label: "Whole page (_top)" }
];
const POINTER_TYPES = [
  { value: "click", label: "Click / tap" },
  { value: "dblclick", label: "Double click" },
  { value: "pointerdown", label: "Press" },
  { value: "pointerup", label: "Release" },
  { value: "pointerenter", label: "Hover start" },
  { value: "pointerleave", label: "Hover end" },
  { value: "pointermove", label: "Pointer moves over it" },
  { value: "dragstart", label: "Drag starts" },
  { value: "drag", label: "Dragging" },
  { value: "dragend", label: "Drag ends" }
];
const CATALOG = [
  // ---------------------------------------------------------------- events
  {
    kind: "event.start",
    label: "On start",
    category: "event",
    description: "When the artboard is shown.",
    outputs: OUT,
    hasInput: false,
    params: []
  },
  {
    kind: "event.beforeLoad",
    label: "Before activity loads",
    category: "event",
    description: "Once, as the activity opens: before anything is shown, and before On activity load and On start. The activity waits for everything this sets off to finish (up to 10 seconds), so a Load user data or Set variable here is in place for the first frame. Remembered progress is already restored. Fires on the artboard the activity opens on.",
    outputs: OUT,
    hasInput: false,
    params: []
  },
  {
    kind: "event.activityLoad",
    label: "On activity load",
    category: "event",
    description: "Once, when the activity has loaded and is showing, just before the first On start. Unlike On start it does not fire again when another artboard is shown, or after Start over. Fires on the artboard the activity opens on.",
    outputs: OUT,
    hasInput: false,
    params: []
  },
  {
    kind: "event.pointer",
    label: "On pointer",
    category: "event",
    description: "When a layer is clicked, pressed, hovered or dragged. Moves and drags give event.x / event.y (artboard coordinates) and event.stepX / event.stepY (movement since the last event); drags also give event.dx / event.dy (movement since the press).",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "target", label: "Layer", type: "node" },
      { key: "type", label: "Event", type: "select", options: POINTER_TYPES, default: "click" }
    ]
  },
  {
    kind: "event.key",
    label: "On key",
    category: "event",
    description: "When a keyboard key is pressed or released. Leave the key empty for any key. Modifiers that are ticked must be held. Pick a layer to react only while that layer (or one inside it) has keyboard focus. event.key, event.code and event.shift / ctrl / alt / meta say what was pressed.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "key", label: "Key", type: "text", placeholder: "e.g. ArrowLeft, a, Enter" },
      { key: "shift", label: "Shift held", type: "boolean", default: false },
      { key: "ctrl", label: "Ctrl held", type: "boolean", default: false },
      { key: "alt", label: "Alt held", type: "boolean", default: false },
      { key: "meta", label: "Meta held", type: "boolean", default: false },
      { key: "repeat", label: "Fire again while held", type: "boolean", default: false, help: "Key down repeats while the key is held" },
      { key: "target", label: "Only while this layer has focus", type: "node", help: "Pick a layer to react to the key only while that layer, or a layer inside it, has keyboard focus (the layer becomes focusable). Leave empty to react wherever the focus is" },
      {
        key: "type",
        label: "Event",
        type: "select",
        options: [
          { value: "keydown", label: "Key down" },
          { value: "keyup", label: "Key up" }
        ],
        default: "keydown"
      }
    ]
  },
  {
    kind: "event.focus",
    label: "On focus",
    category: "event",
    description: "When a layer gains or loses keyboard focus (tabbing to it, clicking it, or the Focus layer node). The layer becomes focusable.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "target", label: "Layer", type: "node" },
      {
        key: "type",
        label: "Event",
        type: "select",
        options: [
          { value: "focus", label: "Gains focus" },
          { value: "blur", label: "Loses focus" }
        ],
        default: "focus"
      }
    ]
  },
  {
    kind: "event.timer",
    label: "On timer",
    category: "event",
    description: "After a delay, optionally repeating.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "ms", label: "Every (ms)", type: "number", default: 1e3 },
      { key: "repeat", label: "Repeat", type: "boolean", default: true }
    ]
  },
  {
    kind: "event.variable",
    label: "On variable change",
    category: "event",
    description: "When a variable changes value.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "variable", label: "Variable", type: "variable" }]
  },
  {
    kind: "event.timelineEnd",
    label: "On timeline end",
    category: "event",
    description: "When a play-once timeline finishes.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "timeline", label: "Timeline", type: "timeline" }]
  },
  {
    kind: "event.timelineMarker",
    label: "On timeline marker",
    category: "event",
    description: "When playback of a timeline passes a marker, going forwards or backwards, on every lap of a loop. `event.marker` is the marker name, `event.time` its time in ms.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "timeline", label: "Timeline", type: "timeline" },
      { key: "marker", label: "Marker name", type: "text", placeholder: "Any marker", help: "Leave empty to fire for every marker on the timeline" }
    ]
  },
  {
    kind: "event.step",
    label: "On step",
    category: "event",
    description: "In a step-through artboard (Steps in the artboard settings): when a step is chosen (Next, Back, a jump, scrolling), or when its animation has finished playing. `event.step` is the step number from 1, `event.count` the number of steps, `event.title` and `event.caption` its text, `event.from` the step it came from and `event.direction` is 1 going forward and -1 going back.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "step", label: "Step", type: "number", placeholder: "Any step", help: "Step number from 1. Leave empty to run for every step" },
      {
        key: "type",
        label: "When",
        type: "select",
        options: [
          { value: "change", label: "The step is chosen" },
          { value: "settle", label: "Its animation has finished" }
        ],
        default: "change"
      }
    ]
  },
  {
    kind: "event.message",
    label: "On message",
    category: "event",
    description: "When a message is sent by a script, an Emit node or the host page (player.send).",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "name", label: "Message", type: "text", placeholder: "e.g. addToCart" }]
  },
  {
    kind: "event.scroll",
    label: "On scroll",
    category: "event",
    description: "When a layer scrolls into or out of view, or while a scrollable frame is scrolled (event.scrollTop, event.scrollLeft, event.progress 0-1).",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "target", label: "Layer", type: "node" },
      {
        key: "type",
        label: "When",
        type: "select",
        options: [
          { value: "enter", label: "Enters view" },
          { value: "leave", label: "Leaves view" },
          { value: "scroll", label: "Is scrolled (scrollable frame)" }
        ],
        default: "enter"
      },
      { key: "once", label: "Only once", type: "boolean", default: true }
    ]
  },
  {
    kind: "event.dragStart",
    label: "On drag start",
    category: "event",
    description: "When a draggable layer is picked up: dragged by the mouse or a finger, or lifted with the keyboard (Space) or a tap. Set up dragging in the layer's Draggable section. `event.layer` is its name, `event.zone` the drop zone it was in (empty if none), `event.tags` its tags, `event.keyboard` true when it was not dragged.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "target", label: "Draggable layer", type: "node", placeholder: "Any draggable layer", help: "Leave empty to fire for every draggable layer" }]
  },
  {
    kind: "event.dragMove",
    label: "On drag move",
    category: "event",
    description: "Over and over while a draggable layer is held and moving: dragged by the mouse or a finger, nudged with Shift+arrows, or sent to another zone with the arrow keys. At most once a frame. `event.layerX` and `event.layerY` are where the layer is now, `event.dx` and `event.dy` how far it has come since it was picked up, `event.x` and `event.y` the pointer, `event.zone` the zone it is over (empty if none), `event.keyboard` true when it is not being dragged.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "target", label: "Draggable layer", type: "node", placeholder: "Any draggable layer", help: "Leave empty to fire for every draggable layer" }]
  },
  {
    kind: "event.dragOver",
    label: "On drag over zone",
    category: "event",
    description: "When a dragged layer moves over a drop zone, or off it. `event.zone` is the zone, `event.layer` the layer, `event.accepted` whether the zone would take it (right tag, room).",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "target", label: "Drop zone", type: "node", placeholder: "Any drop zone", help: "Leave empty to fire for every drop zone" },
      { key: "layer", label: "Draggable layer", type: "node", placeholder: "Any draggable layer", help: "Leave empty for every draggable layer" },
      {
        key: "type",
        label: "When",
        type: "select",
        options: [
          { value: "enter", label: "Moves over the zone" },
          { value: "leave", label: "Moves off the zone" }
        ],
        default: "enter"
      }
    ]
  },
  {
    kind: "event.drop",
    label: "On drop",
    category: "event",
    description: "When a draggable layer is let go (or dropped with the keyboard or a tap). Pick what to react to: dropped in a zone that took it, dropped on a zone that refused it (wrong tag, or full), or dropped where there is no zone. `event.layer`, `event.zone` (the zone it is in now), `event.from` (where it was), `event.accepted`, `event.reason` (tags or full), `event.swapped` (the layer a swap sent back) and `event.tags` are available.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "target", label: "Drop zone", type: "node", placeholder: "Any drop zone", help: "Leave empty to fire for every drop zone (and, with Missed, for drops on no zone)" },
      { key: "layer", label: "Draggable layer", type: "node", placeholder: "Any draggable layer", help: "Leave empty for every draggable layer" },
      {
        key: "result",
        label: "Result",
        type: "select",
        options: [
          { value: "accepted", label: "Taken by the zone" },
          { value: "rejected", label: "Refused by the zone" },
          { value: "missed", label: "Dropped on no zone" },
          { value: "any", label: "Any drop" }
        ],
        default: "accepted"
      }
    ]
  },
  {
    kind: "event.dragEnd",
    label: "On drag end",
    category: "event",
    description: "When a draggable layer is let go, wherever it ends up, or the pick-up is cancelled (Escape). Fires after On drop. `event.result` is accepted, rejected, missed or cancelled; `event.zone` the zone it is in now, `event.dropped` true when a zone took it.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "target", label: "Draggable layer", type: "node", placeholder: "Any draggable layer", help: "Leave empty to fire for every draggable layer" }]
  },
  {
    kind: "event.dataLoaded",
    label: "On data loaded",
    category: "event",
    description: "When a data source finishes loading or refreshing. `event.data` holds the value.",
    outputs: OUT,
    hasInput: false,
    params: [{ key: "source", label: "Data source", type: "data" }]
  },
  // ---------------------------------------------------------------- actions
  {
    kind: "action.timeline",
    label: "Control timeline",
    category: "action",
    description: 'Play, pause, stop, restart, reverse or jump a timeline. "Blend in" fades its pose in over the pose the layers have now, instead of cutting to it (for switching between looks).',
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "timeline", label: "Timeline", type: "timeline" },
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "play", label: "Play" },
          { value: "restart", label: "Restart" },
          { value: "pause", label: "Pause" },
          { value: "stop", label: "Stop (reset)" },
          { value: "reverse", label: "Play in reverse" },
          { value: "toggle", label: "Toggle play/pause" },
          { value: "seek", label: "Jump to time" }
        ],
        default: "play"
      },
      { key: "time", label: "Time (ms)", type: "expr", default: "0", showIf: { key: "op", values: ["seek"] } },
      ...mixParams(MIX_OPS),
      ...CONTINUE.map((c2) => c2.key === "continue" ? { ...c2, showIf: { key: "op", values: ["play", "restart", "reverse", "toggle"] } } : c2)
    ]
  },
  {
    kind: "action.blendPlay",
    label: "Play blend",
    category: "action",
    description: 'Start a blend: its timelines play together and are mixed by the weights from its number variables, until it is stopped. Does nothing if it is already playing. "Blend in" fades its pose in over the pose the layers have now.',
    outputs: OUT,
    hasInput: true,
    params: [{ key: "blend", label: "Blend", type: "blend" }, ...mixParams(null)]
  },
  {
    kind: "action.blendStop",
    label: "Stop blend",
    category: "action",
    description: "Stop a blend. The mixed pose stays where it is, except for additive blends, which take their change back out.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "blend", label: "Blend", type: "blend" }]
  },
  {
    kind: "action.setVariable",
    label: "Set variable",
    category: "action",
    description: "Set, add to, toggle or change the list of a variable.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "variable", label: "Variable", type: "variable" },
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "set", label: "Set to" },
          { value: "add", label: "Add" },
          { value: "toggle", label: "Toggle (boolean)" },
          { value: "push", label: "Append to list" },
          { value: "remove", label: "Remove from list (position)" },
          { value: "clear", label: "Empty (list, number or text)" }
        ],
        default: "set"
      },
      {
        key: "value",
        label: "Value",
        type: "expr",
        default: "0",
        showIf: { key: "op", values: ["set", "add", "push", "remove"] },
        help: 'Expression, e.g. 1, "hi", score * 2. For a list: the item to append ({name: "Ann"}) or the position to remove (0 is the first).'
      }
    ]
  },
  {
    kind: "action.setProperty",
    label: "Set property",
    category: "action",
    description: "Change a layer property instantly.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Layer", type: "node" },
      { key: "prop", label: "Property", type: "prop", default: "opacity" },
      { key: "value", label: "Value", type: "expr", default: "1" }
    ]
  },
  {
    kind: "action.animate",
    label: "Animate property",
    category: "action",
    description: "Tween a layer property to a value.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Layer", type: "node" },
      { key: "prop", label: "Property", type: "prop", default: "x" },
      { key: "to", label: "To", type: "expr", default: "0" },
      { key: "relative", label: "Relative (add to current)", type: "boolean", default: false },
      { key: "duration", label: "Duration (ms)", type: "number", default: 400 },
      { key: "ease", label: "Easing", type: "easing", default: "easeInOut" },
      ...CONTINUE
    ]
  },
  {
    kind: "action.visibility",
    label: "Show / hide",
    category: "action",
    description: "Show, hide or toggle a layer.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Layer", type: "node" },
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "show", label: "Show" },
          { value: "hide", label: "Hide" },
          { value: "toggle", label: "Toggle" }
        ],
        default: "toggle"
      }
    ]
  },
  {
    kind: "action.artboard",
    label: "Go to artboard",
    category: "action",
    description: "Switch to another artboard.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "artboard", label: "Artboard", type: "artboard" },
      {
        key: "transition",
        label: "Transition",
        type: "select",
        options: [
          { value: "none", label: "Instant" },
          { value: "fade", label: "Fade" },
          { value: "slideLeft", label: "Slide left" },
          { value: "slideRight", label: "Slide right" },
          { value: "slideUp", label: "Slide up" }
        ],
        default: "fade"
      },
      { key: "duration", label: "Duration (ms)", type: "number", default: 300 }
    ]
  },
  {
    kind: "action.url",
    label: "Open URL",
    category: "action",
    description: "Open a link in a new tab, this frame, the parent frame or the whole page.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "url", label: "URL", type: "expr", default: '"https://example.com"' },
      { key: "target", label: "Open in", type: "select", options: LINK_TARGETS, default: "_blank" }
    ]
  },
  {
    kind: "action.reportResult",
    label: "Report result",
    category: "action",
    description: "Send the learner's result (score, pass or fail, completion) to where the page keeps it: the learner's record on the server when played from a share link in StudyDesk. The score comes from the score variable in Project > Results and progress. Nothing is lost or broken if no record is kept.",
    outputs: OUT,
    hasInput: true,
    params: [
      {
        key: "completed",
        label: "Report as",
        type: "select",
        options: [
          { value: "complete", label: "Complete" },
          { value: "progress", label: "Score so far (not complete)" }
        ],
        default: "complete"
      },
      { key: "score", label: "Score", type: "expr", default: "", placeholder: "the score variable", help: "Leave empty to report the score variable. Or an expression, e.g. correct * 10." }
    ]
  },
  {
    kind: "action.record",
    label: "Record",
    category: "action",
    description: "Record that something happened, for Insights: counts of how often each name was recorded, and of each value it carried. Counts only, nobody is named, so do not put anything personal in the name or value. Learners' browsers send it to the page around the project (the StudyDesk learner page, which passes it to the analytics); nothing is sent from an export on its own, or when recording is off in Project > Learner records.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "name", label: "Name", type: "text", default: "milestone", help: 'What happened, in a few words ("opened hint", "chose route B"). Up to 60 characters.' },
      { key: "value", label: "Value", type: "expr", default: "", placeholder: "optional", help: "Something short to count separately: a choice, a level, a score band. Leave empty for just the name." }
    ]
  },
  {
    kind: "action.startOver",
    label: "Start over",
    category: "action",
    description: "Begin again: every variable goes back to its starting value, remembered progress is cleared, it counts as a new attempt and the start artboard shows. Nothing after this node runs.",
    outputs: OUT,
    hasInput: true,
    params: []
  },
  {
    kind: "action.cursor",
    label: "Set cursor",
    category: "action",
    description: "Change the mouse cursor over a layer, or over the whole player when no layer is chosen.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Layer", type: "node" },
      { key: "cursor", label: "Cursor", type: "cursor", default: "pointer" }
    ]
  },
  {
    kind: "action.saveUserData",
    label: "Save user data",
    category: "action",
    description: "Saves the chosen variables for the person playing, so Load user data can bring them back on a later visit. On the StudyDesk learner page (Share > Link for StudyDesk) they are kept on the server under the signed-in person and the course; anywhere else (an export, Preview, no sign-in) in the browser. Each save only changes the variables chosen here. Continues when saved.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "variables", label: "Variables", type: "variables", help: "The variables to save" }]
  },
  {
    kind: "action.loadUserData",
    label: "Load user data",
    category: "action",
    description: "Sets the chosen variables back to what Save user data last saved for the person playing (same places as Save user data). A variable that was never saved keeps its value. Continues from Loaded when anything came back, and from Nothing saved when nothing did (a first visit, or nowhere to load from).",
    outputs: [
      { id: "out", label: "Loaded" },
      { id: "none", label: "Nothing saved" }
    ],
    hasInput: true,
    params: [{ key: "variables", label: "Variables", type: "variables", help: "The variables to load" }]
  },
  {
    kind: "action.loadData",
    label: "Load data",
    category: "action",
    description: "Reload a data source, optionally from a different URL. Continues when loaded.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "source", label: "Data source", type: "data" },
      { key: "url", label: "URL (optional)", type: "expr", default: "", help: 'Leave empty to reload from its own file/URL, e.g. "https://api.example.com/items?page=" + page' }
    ]
  },
  {
    kind: "action.sound",
    label: "Play sound",
    category: "action",
    description: "Play an audio asset.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "asset", label: "Sound", type: "asset" },
      { key: "volume", label: "Volume (0-1)", type: "number", default: 1 },
      ...CONTINUE
    ]
  },
  {
    kind: "action.script",
    label: "Run script",
    category: "action",
    description: "Run a custom JavaScript script. `event` holds what triggered it.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "script", label: "Script", type: "script" }]
  },
  {
    kind: "action.code",
    label: "Run code",
    category: "action",
    description: "Run an inline JavaScript snippet with `ix`, `event` and variables in scope.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "code", label: "Code", type: "text", default: 'ix.log("hello")' }]
  },
  {
    kind: "action.emit",
    label: "Send message",
    category: "action",
    description: "Send a named message to scripts, On message nodes and the host page.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "name", label: "Message", type: "text", placeholder: "e.g. addToCart" },
      { key: "payload", label: "Payload", type: "expr", default: "" }
    ]
  },
  {
    kind: "action.steps",
    label: "Go to step",
    category: "action",
    description: "Move a step-through artboard (Steps in the artboard settings). Next and Back play the animation to the neighbouring step; going to a step further away shows it straight away. Does nothing on an artboard without steps, or past the first or last step.",
    outputs: OUT,
    hasInput: true,
    params: [
      {
        key: "op",
        label: "Go to",
        type: "select",
        options: [
          { value: "next", label: "Next step" },
          { value: "back", label: "Previous step" },
          { value: "first", label: "First step" },
          { value: "last", label: "Last step" },
          { value: "goto", label: "A step number" }
        ],
        default: "next"
      },
      { key: "step", label: "Step number", type: "expr", default: "1", showIf: { key: "op", values: ["goto"] }, help: "From 1. In a dot of the step bar: event.index + 1" }
    ]
  },
  {
    kind: "action.captions",
    label: "Captions and sound",
    category: "action",
    description: "Change what the viewer has chosen for captions, the transcript panel and sound: turn captions on or off, make them larger or smaller, open the transcript, mute or unmute. For your own buttons when the built-in ones are hidden in Project settings. The choices are remembered in the viewer's browser.",
    outputs: OUT,
    hasInput: true,
    params: [
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "captionsToggle", label: "Captions: flip" },
          { value: "captionsOn", label: "Captions: on" },
          { value: "captionsOff", label: "Captions: off" },
          { value: "larger", label: "Captions: larger text" },
          { value: "smaller", label: "Captions: smaller text" },
          { value: "transcriptToggle", label: "Transcript: flip" },
          { value: "transcriptShow", label: "Transcript: show" },
          { value: "transcriptHide", label: "Transcript: hide" },
          { value: "soundToggle", label: "Sound: flip" },
          { value: "soundOn", label: "Sound: on" },
          { value: "soundOff", label: "Sound: off" },
          { value: "start", label: "Sound: start what the browser held back" }
        ],
        default: "captionsToggle"
      }
    ]
  },
  {
    kind: "action.announce",
    label: "Announce",
    category: "action",
    description: 'Say something to screen readers ("Correct, 3 of 5") through a live region. Nothing visible changes. Does nothing when accessibility is off in the preferences.',
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "text", label: "Text", type: "expr", default: '"Correct"', help: 'An expression, e.g. "Correct, " + score + " of 5"' },
      {
        key: "politeness",
        label: "Priority",
        type: "select",
        options: [
          { value: "polite", label: "Polite: after what is being read" },
          { value: "assertive", label: "Assertive: interrupt" }
        ],
        default: "polite"
      }
    ]
  },
  {
    kind: "action.questionCheck",
    label: "Check answer",
    category: "action",
    description: 'Check the answer on a question (made with Add question): updates its answered, correct, attempts, score and feedback variables, locks it when it is right or out of tries, and tells screen readers the feedback. Continues from "right" or "wrong", then also from "finished" once the question is locked.',
    outputs: [
      { id: "correct", label: "right" },
      { id: "wrong", label: "wrong" },
      { id: "finished", label: "finished" }
    ],
    hasInput: true,
    params: [{ key: "question", label: "Question", type: "node", help: "The question frame" }]
  },
  {
    kind: "action.questionReset",
    label: "Reset question",
    category: "action",
    description: "Put a question back to the start: no answer, no hints, all tries back, options reshuffled when it shuffles. With a question bank it moves on to the next row. Run it on start to set the question up.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "question", label: "Question", type: "node", help: "The question frame" },
      { key: "next", label: "Next from the bank", type: "boolean", default: true, help: "With a question bank: draw the next row. Off keeps the row showing and only clears the answer." }
    ]
  },
  {
    kind: "action.questionHint",
    label: "Show hint",
    category: "action",
    description: "Show the next hint of a question and tell screen readers. Does nothing when there are none left or the question is finished.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "question", label: "Question", type: "node", help: "The question frame" }]
  },
  {
    kind: "action.questionChoose",
    label: "Choose option",
    category: "action",
    description: "Select an option of a choice question: it swaps the choice for a single answer and toggles it for several. Normally run from a click on the option layer, where event.index is which option was clicked.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "question", label: "Question", type: "node", help: "The question frame" },
      { key: "option", label: "Option", type: "expr", default: "event.index", help: "Which option, counting from 0 in the order shown" }
    ]
  },
  {
    kind: "action.questionMove",
    label: "Move item",
    category: "action",
    description: "Move an item of an ordering question one place up or down and tell screen readers where it went.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "question", label: "Question", type: "node", help: "The question frame" },
      { key: "item", label: "Item", type: "expr", default: "event.index", help: "Which item, counting from 0 in the order shown" },
      {
        key: "direction",
        label: "Move",
        type: "select",
        options: [
          { value: "up", label: "Up (earlier)" },
          { value: "down", label: "Down (later)" }
        ],
        default: "up"
      }
    ]
  },
  {
    kind: "action.focus",
    label: "Focus layer",
    category: "action",
    description: "Give a layer keyboard focus, or take focus away from whatever has it. Only tab stops can take focus: layers with an On focus event or a click (with accessibility on), buttons, inputs and links.",
    outputs: OUT,
    hasInput: true,
    params: [
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "focus", label: "Focus the layer" },
          { value: "clear", label: "Clear focus" }
        ],
        default: "focus"
      },
      { key: "target", label: "Layer", type: "node", showIf: { key: "op", values: ["focus"] } }
    ]
  },
  {
    kind: "action.dragPlace",
    label: "Put layer in drop zone",
    category: "action",
    description: "Move a draggable layer into a drop zone as if it had been dropped there (it settles by the zone's snap setting, or goes to the zone's centre). Does nothing if the zone would not take it. Fires no drag events, so it cannot start a loop; it does update the zone variables.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "layer", label: "Draggable layer", type: "node" },
      { key: "zone", label: "Drop zone", type: "node" }
    ]
  },
  {
    kind: "action.dragReset",
    label: "Reset draggable",
    category: "action",
    description: 'Send a draggable layer back to where it started (and into the zone it started in). Leave the layer empty to reset all of them ("Start again"). Fires no drag events.',
    outputs: OUT,
    hasInput: true,
    params: [{ key: "layer", label: "Draggable layer", type: "node", placeholder: "All draggable layers" }]
  },
  {
    kind: "action.dragEnable",
    label: "Allow dragging",
    category: "action",
    description: "Turn dragging on or off for a draggable layer (to lock an answer after checking it), or turn a drop zone on or off.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Layer", type: "node", help: "A draggable layer or a drop zone" },
      {
        key: "op",
        label: "Do",
        type: "select",
        options: [
          { value: "enable", label: "Allow" },
          { value: "disable", label: "Do not allow" },
          { value: "toggle", label: "Toggle" }
        ],
        default: "disable"
      }
    ]
  },
  {
    kind: "action.setTheme",
    label: "Set theme",
    category: "action",
    description: `Show one of the project's themes (Light, Dark, High contrast ...) by name, or "auto" to follow the viewer's colour scheme and contrast settings again. Layers whose colours are theme tokens change with it.`,
    outputs: OUT,
    hasInput: true,
    params: [{ key: "theme", label: "Theme", type: "expr", default: '"Dark"', help: 'A theme name in quotes, or an expression. "auto" follows the viewer.' }]
  },
  {
    kind: "action.instanceInput",
    label: "Set instance input",
    category: "action",
    description: "Set a variable inside an instance layer's artboard, by name (the instance's own inputs). Every copy of a repeated instance is set.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Instance layer", type: "node" },
      { key: "name", label: "Input", type: "text", placeholder: "variable name inside the instance" },
      { key: "value", label: "Value", type: "expr", default: "1" }
    ]
  },
  {
    kind: "action.instanceTrigger",
    label: "Fire instance trigger",
    category: "action",
    description: "Send a message into an instance layer's artboard only (its On message nodes and scripts hear it, the parent does not). Every copy of a repeated instance receives it.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "target", label: "Instance layer", type: "node" },
      { key: "name", label: "Trigger", type: "text", placeholder: "message name inside the instance" },
      { key: "payload", label: "Payload", type: "expr", default: "" }
    ]
  },
  {
    kind: "action.delay",
    label: "Wait",
    category: "action",
    description: "Pause this flow for a time.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "ms", label: "Milliseconds", type: "number", default: 500 }]
  },
  {
    kind: "action.waitBlendIn",
    label: "Wait for blend-in",
    category: "action",
    description: 'Holds the flow while a timeline or blend is still blending in (see "Blend in" on Control timeline), unless that blend-in is marked "Can be left early". Use it in front of a change that should not cut a blend-in short. With "Give up" the flow just stops there instead of waiting.',
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "timeline", label: "Timeline", type: "timeline" },
      { key: "blend", label: "Or blend", type: "blend" },
      { key: "drop", label: "Give up instead of waiting", type: "boolean", default: false }
    ]
  },
  {
    kind: "action.waitTimeline",
    label: "Wait for time in timeline",
    category: "action",
    description: "Holds the flow until a timeline has played to a point (an exit time). Carries on at once if it is already past it, and a looping timeline that comes round counts as past. Nothing happens while the timeline is paused short of it.",
    outputs: OUT,
    hasInput: true,
    params: [
      { key: "timeline", label: "Timeline", type: "timeline" },
      {
        key: "unit",
        label: "Measured in",
        type: "select",
        options: [
          { value: "ms", label: "Milliseconds" },
          { value: "percent", label: "Percent of the timeline" }
        ],
        default: "ms"
      },
      { key: "at", label: "At", type: "number", default: 500 }
    ]
  },
  {
    kind: "action.log",
    label: "Log",
    category: "action",
    description: "Write to the browser console (handy while building).",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "message", label: "Message", type: "expr", default: '"clicked"' }]
  },
  // ---------------------------------------------------------------- logic
  {
    kind: "logic.if",
    label: "If",
    category: "logic",
    description: 'Continue down "true" or "false" depending on a condition.',
    outputs: [
      { id: "true", label: "true" },
      { id: "false", label: "false" }
    ],
    hasInput: true,
    params: [{ key: "condition", label: "Condition", type: "expr", default: "score > 10" }]
  },
  {
    kind: "logic.switch",
    label: "Toggle",
    category: "logic",
    description: 'Alternate between "a" and "b" each time it runs.',
    outputs: [
      { id: "a", label: "a" },
      { id: "b", label: "b" }
    ],
    hasInput: true,
    params: []
  },
  {
    kind: "logic.random",
    label: "Random",
    category: "logic",
    description: 'Continues down one of its outputs, picked at random. "Weights" gives each output its chance (a list, in output order: [1, 3] makes output 2 three times as likely). "Only if" is a list of conditions in the same order; an output whose condition is false cannot be picked. Nothing continues when none can.',
    outputs: [1, 2, 3, 4, 5, 6].map((n) => ({ id: String(n), label: String(n) })),
    hasInput: true,
    params: [
      { key: "weights", label: "Weights", type: "expr", default: "[1, 1]", help: "One number per output, in order. 0 never gets picked (unless nothing else can be)." },
      { key: "valid", label: "Only if", type: "expr", default: "[true, true]", help: "One condition per output, in order, e.g. [score > 3, true]" }
    ]
  },
  {
    kind: "logic.once",
    label: "Once",
    category: "logic",
    description: "Only lets the flow through the first time.",
    outputs: OUT,
    hasInput: true,
    params: []
  },
  {
    kind: "logic.sequence",
    label: "Sequence",
    category: "logic",
    description: 'Runs "1", then "2", then "3" in order.',
    outputs: [
      { id: "1", label: "1" },
      { id: "2", label: "2" },
      { id: "3", label: "3" }
    ],
    hasInput: true,
    params: []
  }
];
Object.fromEntries(CATALOG.map((d) => [d.kind, d]));
const SHADER_UNIFORM_TYPES = ["float", "vec2", "vec3", "vec4", "color", "image"];
const SHADER_BUILTINS = ["u_time", "u_resolution", "u_mouse", "u_frame", "v_uv"];
const GLSL_WORDS = new Set(
  "attribute uniform varying const in out inout centroid flat smooth layout float int uint bool void true false vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 sampler2D samplerCube if else for while do switch case default break continue return discard struct precision highp mediump lowp main mainImage texture texture2D".split(" ")
);
const VECTOR_SIZE = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
function uniformNameProblem(name, others = []) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "A name is letters, digits and underscores, and does not start with a digit.";
  if (name.length > 48) return "That name is too long (48 characters at most).";
  if (name.startsWith("gl_") || name.includes("__") || name.startsWith("ix_")) return "That name is reserved by GLSL or the player.";
  if (SHADER_BUILTINS.includes(name)) return `${name} is built in.`;
  if (GLSL_WORDS.has(name)) return `${name} is a GLSL word.`;
  if (others.includes(name)) return "Another uniform already has that name.";
  return null;
}
function defaultUniformValue(type) {
  switch (type) {
    case "float":
      return 0;
    case "vec2":
      return [0, 0];
    case "vec3":
      return [0, 0, 0];
    case "vec4":
      return [0, 0, 0, 1];
    case "color":
      return "#ffffff";
    case "image":
      return "";
  }
}
const finite = (v) => {
  const n = typeof v === "number" ? v : typeof v === "boolean" ? v ? 1 : 0 : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
function coerceUniformValue(type, value) {
  const def = defaultUniformValue(type);
  switch (type) {
    case "float":
      return finite(value);
    case "vec2":
    case "vec3":
    case "vec4": {
      const size = VECTOR_SIZE[type];
      const src = Array.isArray(value) ? value : typeof value === "number" ? [value] : [];
      const out = def.slice();
      for (let i = 0; i < size; i++) if (i < src.length) out[i] = finite(src[i]);
      return out;
    }
    case "color":
      return typeof value === "string" && value.trim() ? value : def;
    case "image":
      return typeof value === "string" ? value : "";
  }
}
function normalizeUniform(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r2 = raw;
  if (typeof r2.name !== "string" || !r2.name || !SHADER_UNIFORM_TYPES.includes(r2.type)) return null;
  const type = r2.type;
  const u = { name: r2.name, type, value: coerceUniformValue(type, r2.value) };
  if (typeof r2.min === "number" && Number.isFinite(r2.min)) u.min = r2.min;
  if (typeof r2.max === "number" && Number.isFinite(r2.max)) u.max = r2.max;
  return u;
}
function usableUniforms(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const names = [];
  for (const raw of list) {
    const u = normalizeUniform(raw);
    if (!u || uniformNameProblem(u.name, names)) continue;
    if (u.type === "image" && names.includes(`${u.name}_size`)) continue;
    if (names.includes(u.name)) continue;
    names.push(u.name);
    if (u.type === "image") names.push(`${u.name}_size`);
    out.push(u);
  }
  return out;
}
const ANIMATABLE_PROPS = [
  { prop: "x", label: "X", kind: "number" },
  { prop: "y", label: "Y", kind: "number" },
  { prop: "width", label: "Width", kind: "number" },
  { prop: "height", label: "Height", kind: "number" },
  { prop: "rotation", label: "Rotation", kind: "number" },
  { prop: "scaleX", label: "Scale X", kind: "number" },
  { prop: "scaleY", label: "Scale Y", kind: "number" },
  { prop: "opacity", label: "Opacity", kind: "number" },
  { prop: "visible", label: "Visible", kind: "boolean" },
  { prop: "cornerRadius", label: "Corner radius", kind: "number" },
  // One corner of a rect or frame with radii per corner (top-left, top-right, bottom-right, bottom-left)
  { prop: "cornerRadii.0", label: "Corner radius top-left", kind: "number" },
  { prop: "cornerRadii.1", label: "Corner radius top-right", kind: "number" },
  { prop: "cornerRadii.2", label: "Corner radius bottom-right", kind: "number" },
  { prop: "cornerRadii.3", label: "Corner radius bottom-left", kind: "number" },
  { prop: "originX", label: "Origin X (0-1)", kind: "number" },
  { prop: "originY", label: "Origin Y (0-1)", kind: "number" },
  { prop: "fill.color", label: "Fill colour", kind: "color" },
  { prop: "stroke.width", label: "Stroke width", kind: "number" },
  { prop: "stroke.paint.color", label: "Stroke colour", kind: "color" },
  { prop: "fill.opacity", label: "Fill opacity", kind: "number" },
  { prop: "fill.feather", label: "Fill feather", kind: "number" },
  { prop: "stroke.opacity", label: "Stroke opacity", kind: "number" },
  { prop: "stroke.feather", label: "Stroke feather", kind: "number" },
  { prop: "fills.0.color", label: "Fill 2 colour", kind: "color" },
  { prop: "fills.0.opacity", label: "Fill 2 opacity", kind: "number" },
  { prop: "fills.0.feather", label: "Fill 2 feather", kind: "number" },
  { prop: "fills.0.offsetX", label: "Fill 2 offset X", kind: "number" },
  { prop: "fills.0.offsetY", label: "Fill 2 offset Y", kind: "number" },
  { prop: "strokes.0.width", label: "Stroke 2 width", kind: "number" },
  { prop: "strokes.0.paint.color", label: "Stroke 2 colour", kind: "color" },
  { prop: "strokes.0.opacity", label: "Stroke 2 opacity", kind: "number" },
  { prop: "strokes.0.feather", label: "Stroke 2 feather", kind: "number" },
  { prop: "strokes.0.trimStart", label: "Stroke 2 trim start %", kind: "number" },
  { prop: "strokes.0.trimEnd", label: "Stroke 2 trim end %", kind: "number" },
  { prop: "strokes.0.trimOffset", label: "Stroke 2 trim offset %", kind: "number" },
  { prop: "fill.from.x", label: "Fill gradient start X", kind: "number" },
  { prop: "fill.from.y", label: "Fill gradient start Y", kind: "number" },
  { prop: "fill.to.x", label: "Fill gradient end X", kind: "number" },
  { prop: "fill.to.y", label: "Fill gradient end Y", kind: "number" },
  { prop: "fill.center.x", label: "Fill gradient centre X", kind: "number" },
  { prop: "fill.center.y", label: "Fill gradient centre Y", kind: "number" },
  { prop: "fill.radius", label: "Fill gradient radius", kind: "number" },
  { prop: "stroke.paint.from.x", label: "Stroke gradient start X", kind: "number" },
  { prop: "stroke.paint.from.y", label: "Stroke gradient start Y", kind: "number" },
  { prop: "stroke.paint.to.x", label: "Stroke gradient end X", kind: "number" },
  { prop: "stroke.paint.to.y", label: "Stroke gradient end Y", kind: "number" },
  { prop: "stroke.paint.center.x", label: "Stroke gradient centre X", kind: "number" },
  { prop: "stroke.paint.center.y", label: "Stroke gradient centre Y", kind: "number" },
  { prop: "stroke.paint.radius", label: "Stroke gradient radius", kind: "number" },
  { prop: "fills.0.from.x", label: "Fill 2 gradient start X", kind: "number" },
  { prop: "fills.0.from.y", label: "Fill 2 gradient start Y", kind: "number" },
  { prop: "fills.0.to.x", label: "Fill 2 gradient end X", kind: "number" },
  { prop: "fills.0.to.y", label: "Fill 2 gradient end Y", kind: "number" },
  { prop: "fills.0.center.x", label: "Fill 2 gradient centre X", kind: "number" },
  { prop: "fills.0.center.y", label: "Fill 2 gradient centre Y", kind: "number" },
  { prop: "fills.0.radius", label: "Fill 2 gradient radius", kind: "number" },
  { prop: "strokes.0.paint.from.x", label: "Stroke 2 gradient start X", kind: "number" },
  { prop: "strokes.0.paint.from.y", label: "Stroke 2 gradient start Y", kind: "number" },
  { prop: "strokes.0.paint.to.x", label: "Stroke 2 gradient end X", kind: "number" },
  { prop: "strokes.0.paint.to.y", label: "Stroke 2 gradient end Y", kind: "number" },
  { prop: "strokes.0.paint.center.x", label: "Stroke 2 gradient centre X", kind: "number" },
  { prop: "strokes.0.paint.center.y", label: "Stroke 2 gradient centre Y", kind: "number" },
  { prop: "strokes.0.paint.radius", label: "Stroke 2 gradient radius", kind: "number" },
  { prop: "color", label: "Text colour", kind: "color" },
  { prop: "fontSize", label: "Font size", kind: "number" },
  { prop: "letterSpacing", label: "Letter spacing", kind: "number" },
  { prop: "fontWeight", label: "Font weight", kind: "number" },
  { prop: "lineHeight", label: "Line height", kind: "number" },
  { prop: "blur", label: "Blur", kind: "number" },
  { prop: "shadow.blur", label: "Shadow blur", kind: "number" },
  { prop: "shadow.x", label: "Shadow X", kind: "number" },
  { prop: "shadow.y", label: "Shadow Y", kind: "number" },
  { prop: "shadow.color", label: "Shadow colour", kind: "color" },
  { prop: "text", label: "Text", kind: "string" },
  { prop: "innerRatio", label: "Star inner ratio", kind: "number" },
  { prop: "cursor", label: "Cursor", kind: "string" },
  { prop: "link.url", label: "Link URL", kind: "string" },
  { prop: "label", label: "Button label", kind: "string" },
  { prop: "assetId", label: "Image / video asset", kind: "string" },
  { prop: "disabled", label: "Button disabled", kind: "boolean" },
  { prop: "ariaLabel", label: "Text alternative", kind: "string" },
  { prop: "ariaDescription", label: "Accessible description", kind: "string" },
  { prop: "ariaChecked", label: "Checked (checkbox role)", kind: "boolean" },
  { prop: "src", label: "Embed/video URL", kind: "string" },
  { prop: "stroke.trimStart", label: "Trim start %", kind: "number" },
  { prop: "stroke.trimEnd", label: "Trim end %", kind: "number" },
  { prop: "stroke.trimOffset", label: "Trim offset %", kind: "number" },
  { prop: "solo.active", label: "Solo: active child", kind: "string" },
  { prop: "drawOrder", label: "Draw order (children)", kind: "list" },
  { prop: "constraints.0.distance", label: "Follow path distance", kind: "number" },
  { prop: "constraints.0.strength", label: "Constraint strength", kind: "number" },
  { prop: "modifiers.0.offset", label: "Text modifier offset %", kind: "number" },
  { prop: "modifiers.0.start", label: "Text modifier start %", kind: "number" },
  { prop: "modifiers.0.end", label: "Text modifier end %", kind: "number" },
  { prop: "modifiers.0.strength", label: "Text modifier strength %", kind: "number" },
  { prop: "modifiers.0.falloffStart", label: "Text modifier falloff start %", kind: "number" },
  { prop: "modifiers.0.falloffEnd", label: "Text modifier falloff end %", kind: "number" },
  { prop: "modifiers.0.x", label: "Text modifier X", kind: "number" },
  { prop: "modifiers.0.y", label: "Text modifier Y", kind: "number" },
  { prop: "modifiers.0.rotation", label: "Text modifier rotation", kind: "number" },
  { prop: "modifiers.0.scale", label: "Text modifier scale", kind: "number" },
  { prop: "modifiers.0.opacity", label: "Text modifier opacity", kind: "number" },
  { prop: "modifiers.0.color", label: "Text modifier colour", kind: "color" },
  { prop: "modifiers.0.letterSpacing", label: "Text modifier letter spacing", kind: "number" },
  { prop: "modifiers.0.blur", label: "Text modifier blur", kind: "number" }
];
const MODIFIER_UNITS = ["letter", "word", "line"];
const MODIFIER_SHAPES = ["square", "ramp-up", "ramp-down", "triangle", "round", "smooth", "falloff"];
function defaultModifier(patch = {}) {
  return { unit: "letter", start: 0, end: 100, offset: 0, shape: "square", strength: 100, x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, letterSpacing: 0, blur: 0, ...patch };
}
const isNum$2 = (v) => typeof v === "number" && Number.isFinite(v);
const num$1 = (v, d) => isNum$2(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d;
function normalizeModifier(raw) {
  const r2 = raw && typeof raw === "object" ? raw : {};
  const d = defaultModifier();
  const m = {
    unit: MODIFIER_UNITS.includes(r2.unit) ? r2.unit : d.unit,
    start: num$1(r2.start, d.start),
    end: num$1(r2.end, d.end),
    offset: num$1(r2.offset, d.offset),
    shape: MODIFIER_SHAPES.includes(r2.shape) ? r2.shape : d.shape,
    strength: num$1(r2.strength, d.strength),
    x: num$1(r2.x, d.x),
    y: num$1(r2.y, d.y),
    rotation: num$1(r2.rotation, d.rotation),
    scale: num$1(r2.scale, d.scale),
    opacity: num$1(r2.opacity, d.opacity),
    letterSpacing: num$1(r2.letterSpacing, d.letterSpacing),
    blur: num$1(r2.blur, d.blur)
  };
  if (isNum$2(r2.falloffStart)) m.falloffStart = r2.falloffStart;
  if (isNum$2(r2.falloffEnd)) m.falloffEnd = r2.falloffEnd;
  if (typeof r2.name === "string") m.name = r2.name;
  if (typeof r2.color === "string" && r2.color) m.color = r2.color;
  if (r2.ease !== void 0 && r2.ease !== null) m.ease = r2.ease;
  if (r2.randomize === true) m.randomize = true;
  if (isNum$2(r2.seed)) m.seed = r2.seed;
  return m;
}
const MAX_PATTERN = 300;
const MAX_UNBOUNDED = 3;
const MAX_WORK = 65536;
const INPUT_LIMITS = [1e4, 1e4, 1e3, 200];
class RegexRefused extends Error {
}
const newGroup = () => ({ multi: false, optional: 0, alternation: false, firsts: [], complex: false, atBranchStart: true, work: 1, starts: [], optionals: [], nextStarts: false });
const SAMPLE = [...Array.from({ length: 128 }, (_, i) => i), 160, 233, 305, 383, 8490, 945, 1046, 19968, 128512].map((c2) => String.fromCodePoint(c2));
const overlaps = /* @__PURE__ */ new Map();
function canShare(a, b, flags) {
  if (a.src === null || b.src === null) return true;
  const key = `${flags}/${a.src}/${b.src}`;
  let hit = overlaps.get(key);
  if (hit === void 0) {
    const f2 = flags.replace(/[gy]/g, "");
    try {
      const ra = new RegExp(`^(?:${a.src})$`, f2);
      const rb = new RegExp(`^(?:${b.src})$`, f2);
      hit = SAMPLE.some((ch) => ra.test(ch) && rb.test(ch));
    } catch {
      hit = true;
    }
    if (overlaps.size > 2e3) overlaps.clear();
    overlaps.set(key, hit);
  }
  return hit;
}
function escapeLength(src, i) {
  const n = src[i + 1];
  if ((n === "u" || n === "p" || n === "P") && src[i + 2] === "{") {
    const close = src.indexOf("}", i);
    return close < 0 ? 2 : close + 1 - i;
  }
  if (n === "u") return 6;
  if (n === "x") return 4;
  return 2;
}
function parseQuantifier(src, i) {
  const c2 = src[i];
  let min;
  let max;
  let end;
  if (c2 === "*") [min, max, end] = [0, Infinity, i + 1];
  else if (c2 === "+") [min, max, end] = [1, Infinity, i + 1];
  else if (c2 === "?") [min, max, end] = [0, 1, i + 1];
  else if (c2 === "{") {
    const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(i, i + 24));
    if (!m) return void 0;
    min = Number(m[1]);
    max = m[2] ? m[3] === "" ? Infinity : Number(m[3]) : min;
    end = i + m[0].length;
  } else return void 0;
  if (src[end] === "?" || src[end] === "+") end++;
  return { min, max, end };
}
function checkPattern(src, flags = "") {
  if (src.length > MAX_PATTERN) throw new RegexRefused(`the pattern is longer than ${MAX_PATTERN} characters`);
  const stack2 = [];
  let cur = newGroup();
  let unbounded = 0;
  const nestedClasses = flags.includes("v");
  const fold = flags.includes("i") ? (ch) => ch.toUpperCase().toLowerCase() : (ch) => ch;
  let last;
  const noteAtom = (ch, text) => {
    const atom = { src: text };
    let first;
    if (cur.atBranchStart) {
      cur.firsts.push(ch === null ? "" : fold(ch));
      first = cur.firsts.length - 1;
      cur.atBranchStart = false;
      cur.starts.push(atom);
    } else if (cur.nextStarts) cur.starts.push(atom);
    cur.nextStarts = false;
    if (ch === null) cur.complex = true;
    return { first, atom };
  };
  let i = 0;
  while (i < src.length) {
    const c2 = src[i];
    if (c2 === "\\") {
      const n = src[i + 1] ?? "";
      if (/[1-9]/.test(n) || n === "k" && src[i + 2] === "<") throw new RegexRefused("backreferences (\\1, \\k<name>) are not allowed");
      const len = escapeLength(src, i);
      last = noteAtom(/[a-zA-Z0-9]/.test(n) ? null : n, /^\\[bB]/.test(src.slice(i, i + 2)) ? null : src.slice(i, i + len));
      i += len;
    } else if (c2 === "[") {
      let j = i + 1;
      if (src[j] === "^") j++;
      for (let depth = 0; j < src.length && (src[j] !== "]" || depth > 0); j++) {
        if (src[j] === "\\") j++;
        else if (nestedClasses && src[j] === "[") depth++;
        else if (nestedClasses && src[j] === "]") depth--;
      }
      last = noteAtom(null, src.slice(i, j + 1));
      i = j + 1;
    } else if (c2 === "(") {
      let j = i + 1;
      if (src[j] === "?") {
        const rest = src.slice(j + 1, j + 40);
        const m = /^(?:[:=!]|<[=!]|<[A-Za-z_$][\w$]*>|[a-z]*(?:-[a-z]+)?:)/.exec(rest);
        j += 1 + (m ? m[0].length : 0);
      }
      noteAtom(null, null);
      stack2.push(cur);
      cur = newGroup();
      i = j;
      last = void 0;
    } else if (c2 === ")") {
      const done = cur;
      const parent = stack2.pop();
      if (!parent) throw new RegexRefused("the parentheses do not match");
      cur = parent;
      cur.multi ||= done.multi;
      cur.optional += done.optional;
      cur.work *= done.work;
      cur.optionals.push(...done.optionals);
      last = { group: done, atom: { src: null } };
      i++;
    } else if (c2 === "|") {
      cur.alternation = true;
      cur.atBranchStart = true;
      last = void 0;
      i++;
    } else {
      const q = last ? parseQuantifier(src, i) : void 0;
      if (q) {
        const repeats = q.max > 1;
        const open = q.max === Infinity || q.max - q.min > 50;
        if (open && ++unbounded > MAX_UNBOUNDED) throw new RegexRefused(`more than ${MAX_UNBOUNDED} open-ended repetitions (*, +, {n,})`);
        const g = last.group;
        if (g && repeats) {
          if (g.multi) throw new RegexRefused("a repeated group contains another repetition, like (a+)+");
          if (g.optional > 1) throw new RegexRefused("a repeated group contains several optional parts, like (a?a?)+");
          for (const o of g.optionals) if (g.starts.some((f2) => f2 !== o && canShare(o, f2, flags))) throw new RegexRefused("a repeated group has an optional part that could also start it, like (\\d\\d?)+");
          if (g.alternation) {
            const distinct = new Set(g.firsts).size === g.firsts.length && !g.firsts.includes("");
            if (g.complex || !distinct || g.optional) throw new RegexRefused("a repeated group contains alternatives that can match the same text, like (a|aa)+");
          }
        }
        if (repeats && q.min !== q.max) cur.multi = true;
        else if (q.max === 1 && q.min === 0) cur.optional++;
        if (q.max !== Infinity && q.max !== q.min) cur.work *= q.max - q.min + 1;
        if (g && q.max !== Infinity && q.max > 1) cur.work *= g.work ** (q.max - 1);
        if (q.min === 0 && last.first !== void 0) {
          cur.firsts[last.first] = "";
          cur.nextStarts = true;
        }
        if (q.min === 0 && q.max === 1) cur.optionals.push(last.atom);
        i = q.end;
        last = void 0;
      } else {
        if (c2 === "^" || c2 === "$") {
          cur.complex = true;
          last = { atom: { src: null } };
        } else last = noteAtom(c2 === "." ? null : c2, c2 === "." ? "." : c2.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"));
        i++;
      }
    }
  }
  if (stack2.length) throw new RegexRefused("the parentheses do not match");
  if (cur.work > MAX_WORK) throw new RegexRefused("too many optional or bounded parts that can overlap, like a?a?a?...a?aaa... or a{0,30}a{0,30}a{0,30}");
  return { unbounded, work: cur.work };
}
const verdicts = /* @__PURE__ */ new Map();
function verdict(source, flags) {
  const key = `${flags}/${source}`;
  let v = verdicts.get(key);
  if (!v) {
    try {
      const { unbounded, work } = checkPattern(source, flags);
      v = { problem: "", limit: Math.floor(INPUT_LIMITS[unbounded] / work ** (1 / (unbounded + 1))) };
    } catch (e) {
      if (!(e instanceof RegexRefused)) throw e;
      v = { problem: e.message, limit: 0 };
    }
    if (verdicts.size > 500) verdicts.clear();
    verdicts.set(key, v);
  }
  return v;
}
function regexProblem(source, flags = "") {
  return verdict(source, flags).problem;
}
function assertSafePattern(source, flags = "") {
  const why = regexProblem(source, flags);
  if (why) throw new RegexRefused(`Pattern not allowed: ${why}`);
}
function assertSafeMatch(source, flags, text) {
  assertSafePattern(source, flags);
  const { limit } = verdict(source, flags);
  if (text.length > limit) throw new RegexRefused(`Text is too long to match against this pattern (${text.length} characters; the limit is ${limit})`);
}
class RegexBudget extends RegexRefused {
}
const STEP_BUDGET = 3e5;
const WINDOW_STEPS = 4e6;
const WINDOW_MS = 250;
const MAX_PROGRAM = 4e3;
const MAX_STATES = 6e6;
const isWord = (c2) => c2 >= 48 && c2 <= 57 || c2 >= 65 && c2 <= 90 || c2 === 95 || c2 >= 97 && c2 <= 122;
const isDigit = (c2) => c2 >= 48 && c2 <= 57;
const isSpace = (c2) => c2 === 32 || c2 >= 9 && c2 <= 13 || c2 === 160 || c2 === 5760 || c2 >= 8192 && c2 <= 8202 || c2 === 8232 || c2 === 8233 || c2 === 8239 || c2 === 8287 || c2 === 12288 || c2 === 65279;
const isLine = (c2) => c2 === 10 || c2 === 13 || c2 === 8232 || c2 === 8233;
const propCache = /* @__PURE__ */ new Map();
function property(name, negated) {
  const key = (negated ? "P" : "p") + name;
  let f2 = propCache.get(key);
  if (!f2) {
    const re = new RegExp(`^\\${negated ? "P" : "p"}{${name}}$`, "u");
    const memo = /* @__PURE__ */ new Map();
    f2 = (cp) => {
      let v = memo.get(cp);
      if (v === void 0) {
        v = re.test(String.fromCodePoint(cp));
        if (memo.size > 4e3) memo.clear();
        memo.set(cp, v);
      }
      return v;
    };
    propCache.set(key, f2);
  }
  return f2;
}
const refuse = (why) => {
  throw new RegexRefused(`Pattern not allowed: ${why}`);
};
function parse(src, flags) {
  const u = flags.u;
  let p = 0;
  let ncap = 0;
  const names = [void 0];
  const hasNamed = /\(\?<[^=!]/.test(src);
  const peek = () => src[p];
  const next = () => {
    const cp = u ? src.codePointAt(p) : src.charCodeAt(p);
    p += cp > 65535 ? 2 : 1;
    return cp;
  };
  function alternation() {
    const list = [sequence()];
    while (peek() === "|") {
      p++;
      list.push(sequence());
    }
    return list.length === 1 ? list[0] : { t: "alt", list };
  }
  function sequence() {
    const list = [];
    while (p < src.length && peek() !== "|" && peek() !== ")") list.push(term());
    return list.length === 0 ? { t: "empty" } : list.length === 1 ? list[0] : { t: "cat", list };
  }
  function braces() {
    const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(src.slice(p, p + 24));
    if (!m) return null;
    const min = Number(m[1]);
    const max = m[2] ? m[3] === "" ? Infinity : Number(m[3]) : min;
    p += m[0].length;
    return [min, max];
  }
  function term() {
    const c2 = peek();
    const capStart = ncap;
    let node2;
    let quantifiable = true;
    if (c2 === "^") {
      p++;
      return { t: "assert", k: "bol" };
    } else if (c2 === "$") {
      p++;
      return { t: "assert", k: "eol" };
    } else if (c2 === "(") {
      p++;
      if (src.startsWith("?:", p)) {
        p += 2;
        node2 = alternation();
      } else if (src.startsWith("?=", p) || src.startsWith("?!", p)) {
        const neg = src[p + 1] === "!";
        p += 2;
        node2 = { t: "look", behind: false, neg, node: alternation() };
        quantifiable = !u;
      } else if (src.startsWith("?<=", p) || src.startsWith("?<!", p)) {
        const neg = src[p + 2] === "!";
        p += 3;
        node2 = { t: "look", behind: true, neg, node: alternation() };
        quantifiable = false;
      } else if (src.startsWith("?<", p)) {
        const end = src.indexOf(">", p);
        const name = src.slice(p + 2, end);
        p = end + 1;
        const idx = ++ncap;
        names[idx] = name;
        node2 = { t: "group", idx, node: alternation() };
      } else if (peek() === "?") {
        return refuse("this group syntax is not supported");
      } else {
        const idx = ++ncap;
        names[idx] = void 0;
        node2 = { t: "group", idx, node: alternation() };
      }
      if (peek() !== ")") return refuse("unbalanced parentheses");
      p++;
    } else if (c2 === ".") {
      p++;
      node2 = { t: "any" };
    } else if (c2 === "[") {
      p++;
      node2 = { t: "class", cls: classBody() };
    } else if (c2 === "\\") {
      p++;
      const e = escape(false);
      if (typeof e === "object" && "assert" in e) return { t: "assert", k: e.assert };
      node2 = typeof e === "number" ? { t: "char", c: e } : { t: "class", cls: e };
    } else if (c2 === "*" || c2 === "+" || c2 === "?") {
      return refuse("nothing to repeat");
    } else if (c2 === "{" && !u && braces() === null) {
      p++;
      node2 = { t: "char", c: 123 };
    } else if (c2 === "{" && !u) {
      return refuse("nothing to repeat");
    } else {
      node2 = { t: "char", c: next() };
    }
    let min = -1;
    let max = -1;
    const q = peek();
    if (q === "*") min = 0, max = Infinity, p++;
    else if (q === "+") min = 1, max = Infinity, p++;
    else if (q === "?") min = 0, max = 1, p++;
    else if (q === "{") {
      const b = braces();
      if (b) [min, max] = b;
    }
    if (min < 0) return node2;
    if (!quantifiable) return refuse("a repeated lookaround");
    if (max < min) return refuse("numbers out of order in {} quantifier");
    let greedy = true;
    if (peek() === "?") {
      greedy = false;
      p++;
    }
    return { t: "rep", node: node2, min, max, greedy, lo: capStart + 1, hi: ncap + 1 };
  }
  const hex = (n) => {
    const s = src.slice(p, p + n);
    if (s.length === n && /^[0-9a-fA-F]+$/.test(s)) {
      p += n;
      return parseInt(s, 16);
    }
    return null;
  };
  function escape(inClass) {
    if (p >= src.length) return refuse("a pattern cannot end with a backslash");
    const c2 = src[p++];
    switch (c2) {
      case "d":
        return { test: isDigit };
      case "D":
        return { test: (x) => !isDigit(x) };
      case "w":
        return { test: isWord };
      case "W":
        return { test: (x) => !isWord(x) };
      case "s":
        return { test: isSpace };
      case "S":
        return { test: (x) => !isSpace(x) };
      case "b":
        return inClass ? 8 : { assert: "wb" };
      case "B":
        return inClass ? refuse("\\B in a class") : { assert: "nwb" };
      case "f":
        return 12;
      case "n":
        return 10;
      case "r":
        return 13;
      case "t":
        return 9;
      case "v":
        return 11;
      case "0":
        if (isDigit(src.charCodeAt(p))) return refuse("octal escapes");
        return 0;
      case "c": {
        const l = src[p];
        if (l && /[A-Za-z]/.test(l)) {
          p++;
          return l.charCodeAt(0) % 32;
        }
        return 92;
      }
      case "x": {
        const v = hex(2);
        return v ?? 120;
      }
      case "u": {
        if (u && src[p] === "{") {
          const end = src.indexOf("}", p);
          const v2 = parseInt(src.slice(p + 1, end), 16);
          p = end + 1;
          return v2;
        }
        const v = hex(4);
        if (v === null) return 117;
        if (u && v >= 55296 && v <= 56319 && src.startsWith("\\u", p)) {
          const save = p;
          p += 2;
          const lo = hex(4);
          if (lo !== null && lo >= 56320 && lo <= 57343) return (v - 55296) * 1024 + (lo - 56320) + 65536;
          p = save;
        }
        return v;
      }
      case "p":
      case "P": {
        if (!u) return c2.charCodeAt(0);
        const end = src.indexOf("}", p);
        const name = src.slice(p + 1, end);
        p = end + 1;
        return { test: property(name, c2 === "P") };
      }
      case "k":
        return hasNamed ? refuse("named backreferences") : 107;
      default:
        if (c2 >= "1" && c2 <= "9") return refuse("backreferences");
        if (c2 === "-" && !inClass && u) return 45;
        {
          p--;
          return next();
        }
    }
  }
  function classBody() {
    let neg = false;
    if (peek() === "^") {
      neg = true;
      p++;
    }
    const ranges = [];
    const tests = [];
    const atom = () => {
      if (peek() === "\\") {
        p++;
        return escape(true);
      }
      return next();
    };
    while (p < src.length && peek() !== "]") {
      const a = atom();
      if (peek() === "-" && src[p + 1] !== "]" && p + 1 < src.length) {
        p++;
        const b = atom();
        if (typeof a === "number" && typeof b === "number") {
          ranges.push(a, b);
          continue;
        }
        if (u) return refuse("a class range that is not a range");
        if (typeof a === "number") ranges.push(a, a);
        else tests.push(a.test);
        ranges.push(45, 45);
        if (typeof b === "number") ranges.push(b, b);
        else tests.push(b.test);
        continue;
      }
      if (typeof a === "number") ranges.push(a, a);
      else tests.push(a.test);
    }
    if (peek() !== "]") return refuse("unterminated class");
    p++;
    const n = ranges.length;
    const raw = (cp) => {
      for (let i = 0; i < n; i += 2) if (cp >= ranges[i] && cp <= ranges[i + 1]) return true;
      for (let i = 0; i < tests.length; i++) if (tests[i](cp)) return true;
      return false;
    };
    const test = flags.i ? (cp) => {
      if (raw(cp)) return true;
      const s = String.fromCodePoint(cp);
      const lo = s.toLowerCase();
      const up = s.toUpperCase();
      return lo.length === s.length && lo !== s && raw(lo.codePointAt(0)) || up.length === s.length && up !== s && raw(up.codePointAt(0));
    } : raw;
    const ascii = new Uint8Array(128);
    for (let i = 0; i < 128; i++) ascii[i] = test(i) !== neg ? 1 : 0;
    return { test: (cp) => cp < 128 ? ascii[cp] === 1 : test(cp) !== neg };
  }
  const node = alternation();
  if (p < src.length) refuse("unbalanced parentheses");
  return { node, ncap: ncap + 1, names };
}
function widthOf(n, u) {
  const unit = u ? 2 : 1;
  switch (n.t) {
    case "empty":
    case "assert":
    case "look":
      return [0, 0];
    case "char":
      return [n.c > 65535 ? 2 : 1, n.c > 65535 ? 2 : 1];
    case "any":
    case "class":
      return [1, unit];
    case "cat": {
      let lo = 0;
      let hi = 0;
      for (const x of n.list) {
        const [a, b] = widthOf(x, u);
        lo += a;
        hi += b;
      }
      return [lo, hi];
    }
    case "alt": {
      let lo = Infinity;
      let hi = 0;
      for (const x of n.list) {
        const [a, b] = widthOf(x, u);
        lo = Math.min(lo, a);
        hi = Math.max(hi, b);
      }
      return [lo, hi];
    }
    case "group":
      return widthOf(n.node, u);
    case "rep": {
      const [a, b] = widthOf(n.node, u);
      return [a * n.min, n.max === Infinity ? b === 0 ? 0 : Infinity : b * n.max];
    }
  }
}
function canon(cp, u) {
  const s = String.fromCodePoint(cp);
  if (u) {
    const l = s.toLowerCase();
    return l.length === s.length ? l.codePointAt(0) : cp;
  }
  const up = s.toUpperCase();
  if (up.length !== s.length) return cp;
  const c2 = up.charCodeAt(0);
  return cp >= 128 && c2 < 128 ? cp : c2;
}
function compileProgram(source, flagText) {
  const f2 = { g: flagText.includes("g"), y: flagText.includes("y"), d: flagText.includes("d"), i: flagText.includes("i"), m: flagText.includes("m"), s: flagText.includes("s"), u: flagText.includes("u") };
  const { node, ncap, names } = parse(source, f2);
  const op = [];
  const a = [];
  const b = [];
  const classes = [];
  const widths = /* @__PURE__ */ new Map();
  let nloops = 0;
  const active = [];
  const encl = [];
  let deepest = 0;
  const emit = (o, x = 0, y = 0) => {
    if (op.length >= MAX_PROGRAM) refuse("too big once its repeats are counted out");
    op.push(o);
    encl.push(active.length ? active.slice(-3) : null);
    if (active.length > deepest) deepest = Math.min(active.length, 3);
    a.push(x);
    b.push(y);
    return op.length - 1;
  };
  function gen(n) {
    switch (n.t) {
      case "empty":
        return;
      case "char": {
        if (f2.i) {
          const c2 = canon(n.c, f2.u);
          const s = String.fromCodePoint(n.c);
          if (s.toLowerCase() !== s.toUpperCase()) {
            const lo = s.toLowerCase();
            const up = s.toUpperCase();
            if (lo.length === s.length && up.length === s.length) {
              classes.push({ test: (cp) => cp === n.c || canon(cp, f2.u) === c2 });
              emit(2, classes.length - 1);
              return;
            }
          }
        }
        emit(0, n.c);
        return;
      }
      case "any":
        emit(
          1
          /* Any */
        );
        return;
      case "class":
        classes.push(n.cls);
        emit(2, classes.length - 1);
        return;
      case "assert":
        emit(
          n.k === "bol" ? 3 : n.k === "eol" ? 4 : n.k === "wb" ? 5 : 6
          /* Nwb */
        );
        return;
      case "cat":
        for (const x of n.list) gen(x);
        return;
      case "alt": {
        const jumps = [];
        for (let k = 0; k < n.list.length; k++) {
          if (k < n.list.length - 1) {
            const sp = emit(
              8
              /* Split */
            );
            a[sp] = op.length;
            gen(n.list[k]);
            jumps.push(emit(
              9
              /* Jmp */
            ));
            b[sp] = op.length;
          } else gen(n.list[k]);
        }
        for (const j of jumps) a[j] = op.length;
        return;
      }
      case "group":
        emit(7, n.idx * 2);
        gen(n.node);
        emit(7, n.idx * 2 + 1);
        return;
      case "look": {
        const at = emit(11, n.neg ? 1 : 0, 0);
        op[at] = 11;
        if (n.behind) {
          a[at] |= 2;
          widths.set(at, widthOf(n.node, f2.u));
        }
        gen(n.node);
        emit(
          12
          /* LookEnd */
        );
        b[at] = op.length;
        return;
      }
      case "rep": {
        const reset = n.hi > n.lo;
        const canBeEmpty = widthOf(n.node, f2.u)[0] === 0;
        const body = (optional) => {
          const slot = optional && canBeEmpty ? ncap * 2 + nloops++ : -1;
          if (reset) emit(10, n.lo * 2, n.hi * 2);
          if (slot >= 0) {
            emit(14, slot);
            active.push(slot);
          }
          gen(n.node);
          if (slot >= 0) {
            emit(15, slot);
            active.pop();
          }
        };
        for (let k = 0; k < n.min; k++) body(false);
        if (n.max === Infinity) {
          const sp = emit(
            8
            /* Split */
          );
          const start = op.length;
          body(true);
          emit(9, sp);
          const exit = op.length;
          if (n.greedy) a[sp] = start, b[sp] = exit;
          else a[sp] = exit, b[sp] = start;
        } else {
          const splits = [];
          for (let k = n.min; k < n.max; k++) {
            const sp = emit(
              8
              /* Split */
            );
            splits.push(sp);
            if (n.greedy) a[sp] = op.length;
            else b[sp] = op.length;
            body(true);
          }
          for (const sp of splits) {
            if (n.greedy) b[sp] = op.length;
            else a[sp] = op.length;
          }
        }
        return;
      }
    }
  }
  emit(7, 0);
  gen(node);
  emit(7, 1);
  emit(
    13
    /* Match */
  );
  let first = -1;
  if (!f2.i && op[1] === 0 && a[1] <= 65535) first = a[1];
  return {
    op: Int8Array.from(op),
    a: Int32Array.from(a),
    b: Int32Array.from(b),
    classes,
    encl,
    mult: 1 << deepest,
    ncap,
    nslots: ncap * 2 + nloops,
    names,
    hasNames: names.some((x) => x !== void 0),
    ...f2,
    first,
    widths
  };
}
const programs = /* @__PURE__ */ new Map();
function compile$1(source, flags) {
  const key = `${flags}/${source}`;
  let p = programs.get(key);
  if (!p) {
    p = compileProgram(source, flags);
    if (programs.size > 300) programs.clear();
    programs.set(key, p);
  }
  return p;
}
let visited = new Uint32Array(0);
let generation = 0;
let stack = new Int32Array(4096);
let steps = 0;
const nextGen = () => {
  if (++generation >= 4294967280) {
    visited.fill(0);
    generation = 1;
  }
  return generation;
};
let windowStart = 0;
let windowSpent = 0;
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
function charge(n) {
  const t2 = now();
  if (t2 - windowStart > WINDOW_MS) {
    windowStart = t2;
    windowSpent = 0;
  }
  windowSpent += n;
  if (windowSpent > WINDOW_STEPS) throw new RegexBudget("Patterns are taking too long to run here; try a simpler pattern or less text");
}
function execProgram(prog, text, from, sticky) {
  const n = text.length;
  const ninst = prog.op.length;
  const width = n + 1;
  if (ninst * width * prog.mult > MAX_STATES) throw new RegexBudget(`Text is too long to match against this pattern (${n} characters)`);
  const need = ninst * width * prog.mult;
  if (visited.length < need) visited = new Uint32Array(Math.max(need, visited.length * 2 > MAX_STATES ? MAX_STATES : visited.length * 2));
  steps = 0;
  const caps = new Int32Array(prog.nslots).fill(-1);
  const gen = nextGen();
  const ctx2 = { prog, text, n, width, caps, target: -1 };
  try {
    for (let s = from; s <= n; ) {
      if (!sticky && prog.first >= 0) {
        const at = text.indexOf(String.fromCharCode(prog.first), s);
        if (at < 0) break;
        s = at;
      }
      if (run(ctx2, 0, s, gen)) return caps;
      if (sticky) break;
      s += prog.u && s < n && text.codePointAt(s) > 65535 ? 2 : 1;
    }
    return null;
  } finally {
    charge(steps);
    if (visited.length > 6e5) visited = new Uint32Array(0);
  }
}
function run(ctx2, startPc, startPos, gen) {
  const { prog, text, n, width, caps } = ctx2;
  const { op, a, b, encl } = prog;
  const base2 = stackBase;
  let sp = base2;
  const push = (x, y) => {
    if (sp + 2 > stack.length) {
      const bigger = new Int32Array(stack.length * 2);
      bigger.set(stack);
      stack = bigger;
    }
    stack[sp++] = x;
    stack[sp++] = y;
  };
  push(startPc, startPos);
  const unicode = prog.u;
  while (sp > base2) {
    const pos0 = stack[--sp];
    const pc0 = stack[--sp];
    if (pc0 < 0) {
      caps[-pc0 - 1] = pos0;
      continue;
    }
    let pc = pc0;
    let pos = pos0;
    thread: for (; ; ) {
      if (op[pc] !== 15) {
        let key = pc * width + pos;
        const e = encl[pc];
        if (e !== null) {
          let bits = 0;
          for (let k = 0; k < e.length; k++) if (caps[e[k]] === pos) bits |= 1 << k;
          key = key * prog.mult + bits;
        } else if (prog.mult > 1) key *= prog.mult;
        if (visited[key] === gen) break;
        visited[key] = gen;
      }
      if (++steps > STEP_BUDGET) throw new RegexBudget("A pattern is taking too long to run here; try a simpler pattern or less text");
      switch (op[pc]) {
        case 0: {
          if (pos >= n) break thread;
          const c2 = a[pc];
          if (c2 > 65535) {
            if (text.codePointAt(pos) !== c2) break thread;
            pos += 2;
          } else {
            if (text.charCodeAt(pos) !== c2) break thread;
            pos++;
          }
          pc++;
          break;
        }
        case 1: {
          if (pos >= n) break thread;
          const c2 = unicode ? text.codePointAt(pos) : text.charCodeAt(pos);
          if (!prog.s && isLine(c2)) break thread;
          pos += c2 > 65535 ? 2 : 1;
          pc++;
          break;
        }
        case 2: {
          if (pos >= n) break thread;
          const c2 = unicode ? text.codePointAt(pos) : text.charCodeAt(pos);
          if (!prog.classes[a[pc]].test(c2)) break thread;
          pos += c2 > 65535 ? 2 : 1;
          pc++;
          break;
        }
        case 3:
          if (!(pos === 0 || prog.m && isLine(text.charCodeAt(pos - 1)))) break thread;
          pc++;
          break;
        case 4:
          if (!(pos === n || prog.m && isLine(text.charCodeAt(pos)))) break thread;
          pc++;
          break;
        case 5:
        case 6: {
          const before = pos > 0 && isWord(text.charCodeAt(pos - 1));
          const after = pos < n && isWord(text.charCodeAt(pos));
          if (before !== after !== (op[pc] === 5)) break thread;
          pc++;
          break;
        }
        case 15:
          if (caps[a[pc]] === pos) break thread;
          pc++;
          break;
        case 7:
        case 14:
          push(-1 - a[pc], caps[a[pc]]);
          caps[a[pc]] = pos;
          pc++;
          break;
        case 10:
          for (let k = a[pc]; k < b[pc]; k++) {
            if (caps[k] !== -1) {
              push(-1 - k, caps[k]);
              caps[k] = -1;
            }
          }
          pc++;
          break;
        case 8:
          push(b[pc], pos);
          pc = a[pc];
          break;
        case 9:
          pc = a[pc];
          break;
        case 11: {
          const neg = (a[pc] & 1) === 1;
          const behind = (a[pc] & 2) === 2;
          const snapshot = caps.slice();
          stackBase = sp;
          const saveTarget = ctx2.target;
          let ok = false;
          try {
            if (!behind) {
              ctx2.target = -1;
              ok = run(ctx2, pc + 1, pos, nextGen());
            } else {
              const [lo, hi] = prog.widths.get(pc);
              ctx2.target = pos;
              const g = nextGen();
              for (let s = pos - lo; s >= 0 && (hi === Infinity || s >= pos - hi); s--) {
                if (run(ctx2, pc + 1, s, g)) {
                  ok = true;
                  break;
                }
              }
            }
          } finally {
            stackBase = base2;
            ctx2.target = saveTarget;
          }
          if (ok === neg) {
            caps.set(snapshot);
            break thread;
          }
          if (neg) caps.set(snapshot);
          else {
            for (let k = 0; k < caps.length; k++) if (caps[k] !== snapshot[k]) push(-1 - k, snapshot[k]);
          }
          pc = b[pc];
          break;
        }
        case 12:
          if (ctx2.target >= 0 && pos !== ctx2.target) break thread;
          return true;
        case 13:
          return true;
      }
    }
  }
  return false;
}
let stackBase = 0;
const progOf = (re) => compile$1(re.source, re.flags);
const advance = (s, i, u) => u && i + 1 < s.length && s.codePointAt(i) > 65535 ? i + 2 : i + 1;
function result(prog, s, caps) {
  const out = [];
  for (let k = 0; k < prog.ncap; k++) out.push(caps[2 * k] < 0 || caps[2 * k + 1] < 0 ? void 0 : s.slice(caps[2 * k], caps[2 * k + 1]));
  out.index = caps[0];
  out.input = s;
  let groups;
  if (prog.hasNames) {
    groups = /* @__PURE__ */ Object.create(null);
    for (let k = 1; k < prog.ncap; k++) if (prog.names[k] !== void 0) groups[prog.names[k]] = out[k];
  }
  out.groups = groups;
  if (prog.d) {
    const ind = [];
    for (let k = 0; k < prog.ncap; k++) ind.push(caps[2 * k] < 0 || caps[2 * k + 1] < 0 ? void 0 : [caps[2 * k], caps[2 * k + 1]]);
    let g;
    if (prog.hasNames) {
      g = /* @__PURE__ */ Object.create(null);
      for (let k = 1; k < prog.ncap; k++) if (prog.names[k] !== void 0) g[prog.names[k]] = ind[k];
    }
    ind.groups = g;
    out.indices = ind;
  }
  return out;
}
function linearExec(re, s) {
  const prog = progOf(re);
  const use = prog.g || prog.y;
  let from = use ? Math.min(re.lastIndex, Number.MAX_SAFE_INTEGER) : 0;
  if (from > s.length) {
    if (use) re.lastIndex = 0;
    return null;
  }
  from = Math.max(0, from);
  const caps = execProgram(prog, s, from, prog.y);
  if (!caps) {
    if (use) re.lastIndex = 0;
    return null;
  }
  if (use) re.lastIndex = caps[1];
  return result(prog, s, caps);
}
function linearMatch(re, s) {
  const prog = progOf(re);
  if (!prog.g) return linearExec(re, s);
  re.lastIndex = 0;
  const out = [];
  for (; ; ) {
    const m = linearExec(re, s);
    if (!m) break;
    out.push(m[0]);
    if (m[0] === "") re.lastIndex = advance(s, re.lastIndex, prog.u);
  }
  return out.length ? out : null;
}
function linearMatchAll(re, s) {
  const prog = progOf(re);
  if (!prog.g) throw new TypeError("String.prototype.matchAll called with a non-global RegExp argument");
  const copy = new RegExp(re.source, re.flags);
  copy.lastIndex = re.lastIndex;
  const out = [];
  for (; ; ) {
    const m = linearExec(copy, s);
    if (!m) break;
    out.push(m);
    if (m[0] === "") copy.lastIndex = advance(s, copy.lastIndex, prog.u);
  }
  return out;
}
function linearSearch(re, s) {
  const prog = progOf(re);
  const caps = execProgram(prog, s, 0, prog.y);
  return caps ? caps[0] : -1;
}
function substitute(m, s, template) {
  const pos = m.index;
  const matched = m[0];
  const ncap = m.length - 1;
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const c2 = template[i];
    if (c2 !== "$" || i + 1 >= template.length) {
      out += c2;
      continue;
    }
    const n = template[i + 1];
    if (n === "$") out += "$", i++;
    else if (n === "&") out += matched, i++;
    else if (n === "`") out += s.slice(0, pos), i++;
    else if (n === "'") out += s.slice(Math.min(s.length, pos + matched.length)), i++;
    else if (n >= "0" && n <= "9") {
      let digits = 1;
      let idx = Number(n);
      if (i + 2 < template.length && template[i + 2] >= "0" && template[i + 2] <= "9") {
        const two = idx * 10 + Number(template[i + 2]);
        if (two >= 1 && two <= ncap) idx = two, digits = 2;
      }
      if (idx >= 1 && idx <= ncap) {
        out += m[idx] ?? "";
        i += digits;
      } else out += "$";
    } else if (n === "<") {
      const end = template.indexOf(">", i + 2);
      if (m.groups === void 0 || end < 0) out += "$";
      else {
        out += m.groups[template.slice(i + 2, end)] ?? "";
        i = end;
      }
    } else out += "$";
  }
  return out;
}
function linearReplace(re, s, replacement, all) {
  const prog = progOf(re);
  if (all && !prog.g) throw new TypeError("replaceAll must be called with a global RegExp");
  const fn = typeof replacement === "function" ? replacement : null;
  const template = fn ? "" : String(replacement);
  const matches = [];
  if (prog.g) {
    re.lastIndex = 0;
    for (; ; ) {
      const m = linearExec(re, s);
      if (!m) break;
      matches.push(m);
      if (m[0] === "") re.lastIndex = advance(s, re.lastIndex, prog.u);
    }
  } else {
    const m = linearExec(re, s);
    if (m) matches.push(m);
  }
  let out = "";
  let last = 0;
  for (const m of matches) {
    if (m.index < last) continue;
    out += s.slice(last, m.index);
    if (fn) {
      const args = [...m, m.index, s];
      if (m.groups !== void 0) args.push(m.groups);
      out += String(fn(...args));
    } else out += substitute(m, s, template);
    last = m.index + m[0].length;
  }
  return out + s.slice(last);
}
function linearSplit(re, s, limit) {
  const prog = progOf(re);
  const lim = limit === void 0 ? 4294967295 : Number(limit) >>> 0;
  const out = [];
  if (lim === 0) return out;
  const size = s.length;
  if (size === 0) return execProgram(prog, s, 0, true) ? out : [s];
  let p = 0;
  let q = 0;
  while (q < size) {
    const caps = execProgram(prog, s, q, false);
    if (!caps || caps[0] >= size) break;
    const e = Math.min(caps[1], size);
    if (e === p) {
      q = advance(s, caps[0], prog.u);
      continue;
    }
    out.push(s.slice(p, caps[0]));
    if (out.length === lim) return out;
    p = e;
    for (let k = 1; k < prog.ncap; k++) {
      out.push(caps[2 * k] < 0 || caps[2 * k + 1] < 0 ? void 0 : s.slice(caps[2 * k], caps[2 * k + 1]));
      if (out.length === lim) return out;
    }
    q = p;
  }
  out.push(s.slice(p));
  return out;
}
const QUESTION_KINDS = [
  { value: "single", label: "Multiple choice (one answer)", hint: "Pick the one right option" },
  { value: "multiple", label: "Multiple response (several answers)", hint: "Tick every right option" },
  { value: "truefalse", label: "True or false", hint: "A statement that is either true or false" },
  { value: "blank", label: "Fill in the blank", hint: "Type the missing word or number" },
  { value: "ordering", label: "Put in order", hint: "Arrange the items into the right order" },
  { value: "matching", label: "Matching (drag and drop)", hint: "Drag each term onto the definition it belongs to" },
  { value: "hotspot", label: "Hotspot (click the right place)", hint: "Click the right place on a picture" }
];
const MAX_OPTIONS = 30;
const MAX_BLANKS = 8;
const MAX_PAIRS = 8;
const MAX_HINTS = 10;
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const isIdentifier = (s) => IDENT.test(s);
function newQuestion(kind, prefix = "q1") {
  const base2 = {
    kind,
    prefix,
    prompt: "Your question goes here",
    points: 1,
    options: [],
    blanks: [],
    pairs: [],
    shuffle: false,
    partial: kind === "multiple" || kind === "ordering" || kind === "blank" || kind === "matching",
    attempts: 0,
    attemptPenalty: 0,
    hints: [],
    hintPenalty: 0,
    feedbackCorrect: "Correct!",
    feedbackPartial: "",
    feedbackIncorrect: "Not quite. Have another look.",
    feedbackOutOfTries: "",
    reveal: true,
    bank: null
  };
  switch (kind) {
    case "single":
      return { ...base2, prompt: "Which of these is a prime number?", options: opts(["9", "11", "15", "21"], [1]), hints: ["It has exactly two factors: 1 and itself."] };
    case "multiple":
      return { ...base2, prompt: "Which of these are fruits? Choose all that apply.", options: opts(["Apple", "Carrot", "Banana", "Potato"], [0, 2]) };
    case "truefalse":
      return { ...base2, prompt: "The Pacific is the largest ocean on Earth.", options: [{ id: "o1", text: "True", correct: true }, { id: "o2", text: "False" }] };
    case "blank":
      return { ...base2, prompt: "Complete the sentence.", blanks: [{ id: "b1", label: "The capital of France is", answers: ["Paris"] }] };
    case "ordering":
      return { ...base2, prompt: "Put these steps of the water cycle in order.", shuffle: true, options: opts(["Evaporation", "Condensation", "Precipitation", "Collection"], []) };
    case "matching":
      return {
        ...base2,
        prompt: "Drag each country onto its capital city.",
        shuffle: true,
        pairs: [
          { id: "p1", term: "France", match: "Paris" },
          { id: "p2", term: "Japan", match: "Tokyo" },
          { id: "p3", term: "Egypt", match: "Cairo" },
          { id: "p4", term: "Peru", match: "Lima" }
        ],
        hints: ["The capital of Egypt is on the Nile."]
      };
    case "hotspot":
      return {
        ...base2,
        prompt: "Click the roof of the house.",
        options: [
          { id: "o1", text: "Roof", correct: true, feedback: "Yes, that is the roof." },
          { id: "o2", text: "Sun" },
          { id: "o3", text: "Tree" },
          { id: "o4", text: "Door" }
        ],
        hints: ["It sits on top of the walls."],
        feedbackIncorrect: "Not there. Have another look at the picture."
      };
  }
}
function opts(texts, right) {
  return texts.map((text2, i) => ({ id: `o${i + 1}`, text: text2, ...right.includes(i) ? { correct: true } : {} }));
}
const isObj$2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str$1 = (v, d = "") => typeof v === "string" ? v : d;
const num = (v, d, lo = -Infinity, hi = Infinity) => typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
function normaliseQuestion(raw) {
  if (!isObj$2(raw)) return null;
  const kind = QUESTION_KINDS.some((k) => k.value === raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const d = newQuestion(kind);
  const list = (v, max) => Array.isArray(v) ? v.filter(isObj$2).slice(0, max) : [];
  const options = list(raw.options, MAX_OPTIONS).map((o, i) => ({
    id: str$1(o.id) || `o${i + 1}`,
    text: str$1(o.text),
    ...o.correct === true ? { correct: true } : {},
    ...str$1(o.feedback) ? { feedback: str$1(o.feedback) } : {},
    ...o.fixed === true ? { fixed: true } : {}
  }));
  const blanks = list(raw.blanks, MAX_BLANKS).map((b, i) => ({
    id: str$1(b.id) || `b${i + 1}`,
    label: str$1(b.label),
    answers: (Array.isArray(b.answers) ? b.answers : []).filter((a) => typeof a === "string").slice(0, 40),
    ...b.caseSensitive === true ? { caseSensitive: true } : {},
    ...typeof b.tolerance === "number" && Number.isFinite(b.tolerance) && b.tolerance > 0 ? { tolerance: b.tolerance } : {}
  }));
  const pairs = list(raw.pairs, MAX_PAIRS).map((pr, i) => ({ id: str$1(pr.id) || `p${i + 1}`, term: str$1(pr.term), match: str$1(pr.match) }));
  const bank = isObj$2(raw.bank) && str$1(raw.bank.items).trim() ? { items: str$1(raw.bank.items), order: raw.bank.order === "sequence" ? "sequence" : "random" } : null;
  return {
    kind,
    prefix: isIdentifier(str$1(raw.prefix)) ? str$1(raw.prefix) : d.prefix,
    prompt: str$1(raw.prompt),
    points: num(raw.points, 1, 0, 1e3),
    options,
    blanks,
    pairs,
    shuffle: raw.shuffle === true,
    partial: raw.partial === true,
    attempts: Math.round(num(raw.attempts, 0, 0, 100)),
    attemptPenalty: num(raw.attemptPenalty, 0, 0, 1),
    hints: (Array.isArray(raw.hints) ? raw.hints : []).filter((h) => typeof h === "string").slice(0, MAX_HINTS),
    hintPenalty: num(raw.hintPenalty, 0, 0, 1),
    feedbackCorrect: str$1(raw.feedbackCorrect),
    feedbackPartial: str$1(raw.feedbackPartial),
    feedbackIncorrect: str$1(raw.feedbackIncorrect),
    feedbackOutOfTries: str$1(raw.feedbackOutOfTries),
    reveal: raw.reveal !== false,
    bank,
    ...raw.report === "complete" || raw.report === "progress" ? { report: raw.report } : {}
  };
}
const isObj$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNum$1 = (v) => typeof v === "number" && Number.isFinite(v);
function cleanCues(v) {
  if (!Array.isArray(v)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const raw of v) {
    if (!isObj$1(raw) || typeof raw.text !== "string" || !isNum$1(raw.start)) continue;
    const start = Math.max(0, raw.start);
    const end = isNum$1(raw.end) && raw.end > start ? raw.end : start + 1e3;
    let id = typeof raw.id === "string" && raw.id && !seen.has(raw.id) ? raw.id : uid("cu");
    while (seen.has(id)) id = uid("cu");
    seen.add(id);
    out.push({ id, start, end, text: raw.text, ...typeof raw.speaker === "string" && raw.speaker ? { speaker: raw.speaker } : {} });
  }
  return out;
}
function toRgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
const toHex = (c2) => "#" + c2.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
function resolveSpec(spec, vars) {
  const s = spec.trim();
  const m = /^mix\(\s*(--[\w-]+)\s+(\d{1,3})%\s*,\s*(--[\w-]+)\s*\)$/.exec(s);
  if (m) {
    const a = vars[m[1]];
    const b = vars[m[3]];
    if (!a || !b) return void 0;
    const p = Math.min(100, Number(m[2])) / 100;
    const ca = toRgb(a);
    const cb = toRgb(b);
    return toHex(ca.map((x, i) => x * p + cb[i] * (1 - p)));
  }
  return /^--[\w-]+$/.test(s) ? vars[s] : void 0;
}
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";
function percentSides(v) {
  if (!isObj(v)) return void 0;
  const out = {};
  for (const k of ["top", "right", "bottom", "left"]) if (v[k] === "percent") out[k] = "percent";
  return Object.keys(out).length ? out : void 0;
}
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const arr = (v, keep) => Array.isArray(v) ? v.filter(keep) : [];
const objs = (v) => arr(v, isObj);
function fits(value, def) {
  if (def === null) return value === null || isObj(value) || isStr(value) || isNum(value);
  if (Array.isArray(def)) return Array.isArray(value);
  switch (typeof def) {
    case "number":
      return isNum(value);
    case "string":
      return isStr(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return value === null || isObj(value);
    default:
      return true;
  }
}
function dragSettings(raw, draggable) {
  const out = {};
  const pick = (k, ok) => {
    if (k in raw && ok(raw[k])) out[k] = raw[k];
  };
  const oneOf2 = (list) => (v) => isStr(v) && list.includes(v);
  const bool = (v) => typeof v === "boolean";
  const nonNeg = (v) => isNum(v) && v >= 0;
  pick("enabled", bool);
  pick("label", isStr);
  if (Array.isArray(raw[draggable ? "tags" : "accepts"])) out[draggable ? "tags" : "accepts"] = arr(raw[draggable ? "tags" : "accepts"], isStr).map((t2) => t2.trim()).filter(Boolean).slice(0, 50);
  if (draggable) {
    pick("axis", oneOf2(["both", "x", "y"]));
    pick("bounds", isStr);
    pick("onMiss", oneOf2(["stay", "return"]));
    pick("hit", oneOf2(["center", "pointer", "overlap"]));
    pick("grid", nonNeg);
    pick("glideMs", nonNeg);
    pick("step", nonNeg);
    pick("tapToMove", bool);
    pick("holdToDrag", bool);
    pick("silent", bool);
    if ("zoneVariable" in raw && (raw.zoneVariable === null || isStr(raw.zoneVariable))) out.zoneVariable = raw.zoneVariable;
  } else {
    pick("capacity", nonNeg);
    pick("whenFull", oneOf2(["reject", "swap"]));
    pick("snap", oneOf2(["none", "center", "topLeft"]));
    pick("highlight", bool);
    if ("contentsVariable" in raw && (raw.contentsVariable === null || isStr(raw.contentsVariable))) out.contentsVariable = raw.contentsVariable;
  }
  return out;
}
function stringMap(v) {
  if (!isObj(v)) return void 0;
  const out = {};
  for (const [k, x] of Object.entries(v)) if (isStr(x)) out[k] = x;
  return out;
}
function sanitizeLayerInPlace(node) {
  const clean = sanitizeNode(node, /* @__PURE__ */ new Set());
  if (!clean) return false;
  const target = node;
  for (const k of Object.keys(target)) if (!(k in clean)) delete target[k];
  for (const [k, v] of Object.entries(clean)) if (!same$1(target[k], v)) target[k] = v;
  return true;
}
function same$1(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => same$1(a[k], b[k]));
}
function sanitizeNode(raw, seen) {
  if (!isObj(raw) || !isStr(raw.id) || !raw.id || !isStr(raw.type)) return null;
  seen.add(raw.id);
  let def;
  try {
    def = createNode(raw.type);
  } catch {
    return null;
  }
  const n = { ...raw };
  for (const [k, d] of Object.entries(def)) {
    if (k === "id" || k === "type") continue;
    if (!(k in n) || !fits(n[k], d)) n[k] = structuredClone(d);
  }
  if (!isStr(n.name)) n.name = String(raw.type);
  if (raw.type === "draw") n.pixelRatio = isNum(raw.pixelRatio) && raw.pixelRatio > 0 ? Math.min(4, raw.pixelRatio) : "auto";
  if (raw.type === "shader") {
    n.pixelRatio = isNum(raw.pixelRatio) && raw.pixelRatio > 0 ? Math.min(3, raw.pixelRatio) : "auto";
    n.uniforms = usableUniforms(raw.uniforms);
  }
  if (raw.type === "image" && "shaderFilter" in n) {
    const f2 = n.shaderFilter;
    if (isObj(f2) && isStr(f2.code)) {
      n.shaderFilter = { ...f2, uniforms: usableUniforms(f2.uniforms), ...f2.pixelRatio !== void 0 ? { pixelRatio: isNum(f2.pixelRatio) && f2.pixelRatio > 0 ? Math.min(3, f2.pixelRatio) : "auto" } : {} };
    } else delete n.shaderFilter;
  }
  if ("bindings" in n) n.bindings = stringMap(n.bindings);
  if ("converters" in n && !isObj(n.converters)) delete n.converters;
  if (isObj(n.converters)) for (const [k, list] of Object.entries(n.converters)) n.converters[k] = objs(list).filter((c2) => isStr(c2.type));
  if ("constraints" in n) n.constraints = objs(n.constraints).filter((c2) => isStr(c2.type));
  if ("repeat" in n && !(isObj(n.repeat) && isStr(n.repeat.items))) delete n.repeat;
  if ("question" in n) {
    const qn = normaliseQuestion(n.question);
    if (qn && raw.type === "frame") n.question = qn;
    else delete n.question;
  }
  if ("questionPart" in n && !isStr(n.questionPart)) delete n.questionPart;
  if ("solo" in n && !(isObj(n.solo) && (n.solo.active === null || isStr(n.solo.active)))) delete n.solo;
  if ("drawOrder" in n) n.drawOrder = arr(n.drawOrder, isStr);
  if ("link" in n && n.link !== null && !(isObj(n.link) && isStr(n.link.url))) delete n.link;
  if ("layoutItem" in n && n.layoutItem !== null && !isObj(n.layoutItem)) delete n.layoutItem;
  if (isObj(n.layoutItem) && "marginUnits" in n.layoutItem) {
    const u = percentSides(n.layoutItem.marginUnits);
    if (u && isObj(n.layoutItem.margin)) n.layoutItem.marginUnits = u;
    else delete n.layoutItem.marginUnits;
  }
  for (const k of ["draggable", "dropZone"]) {
    if (!(k in n)) continue;
    if (n[k] === null) continue;
    if (!isObj(n[k])) delete n[k];
    else n[k] = dragSettings(n[k], k === "draggable");
  }
  if ("shadow" in n && n.shadow !== null && !(isObj(n.shadow) && ["x", "y", "blur", "spread"].every((k) => isNum(n.shadow[k])) && isStr(n.shadow.color))) delete n.shadow;
  if ("maxWidth" in n && !isNum(n.maxWidth)) delete n.maxWidth;
  if ("paragraphSpacing" in n && !isNum(n.paragraphSpacing)) delete n.paragraphSpacing;
  if ("cornerRadii" in n && !(Array.isArray(n.cornerRadii) && n.cornerRadii.length === 4 && n.cornerRadii.every(isNum))) delete n.cornerRadii;
  for (const k of ["mask", "locked"]) if (k in n && typeof n[k] !== "boolean") delete n[k];
  if ("maskMode" in n && !["alpha", "inverted", "luminance", "invertedLuminance"].includes(n.maskMode)) delete n.maskMode;
  for (const k of ["blur", "fontWeight"]) if (k in n && !isNum(n[k]) && !isStr(n[k])) delete n[k];
  for (const k of ["blendMode", "cursor", "ariaLabel", "ariaDescription", "className"]) if (k in n && !isStr(n[k])) delete n[k];
  if ("role" in n && !["button", "checkbox", "radio", "radiogroup", "heading", "image", "region"].includes(n.role)) delete n.role;
  for (const k of ["decorative", "focusable", "ariaChecked"]) if (k in n && typeof n[k] !== "boolean") delete n[k];
  for (const k of ["headingLevel", "tabOrder"]) if (k in n && !isNum(n[k])) delete n[k];
  const stroke = (v) => {
    const pt = isObj(v) ? paint(v.paint) : null;
    if (!isObj(v) || !pt) return null;
    const out = { ...fx(v), paint: pt, width: isNum(v.width) ? v.width : 1 };
    if (v.dash !== void 0) out.dash = arr(v.dash, isNum);
    for (const k of ["dashOffset", "trimStart", "trimEnd", "trimOffset"]) if (k in out && !isNum(out[k])) delete out[k];
    if ("cap" in out && !["butt", "round", "square"].includes(out.cap)) delete out.cap;
    if ("join" in out && !["miter", "round", "bevel"].includes(out.join)) delete out.join;
    if ("align" in out && !["center", "inside", "outside"].includes(out.align)) delete out.align;
    return out;
  };
  if ("fill" in n) n.fill = paint(n.fill);
  if ("stroke" in n) n.stroke = stroke(n.stroke);
  for (const k of ["strokes", "fills"]) {
    if (!(k in n)) continue;
    const list = (Array.isArray(n[k]) ? n[k] : []).map(k === "fills" ? paint : stroke).filter(Boolean);
    if (list.length) n[k] = list;
    else delete n[k];
  }
  const written = n.paintOrder;
  if ("paintOrder" in n) {
    if (Array.isArray(written)) n.paintOrder = written.filter((k) => k === "fill" || k === "stroke");
    else delete n.paintOrder;
  }
  if ("background" in n && n.background !== null) n.background = paint(n.background);
  if ("modifiers" in n) {
    if (Array.isArray(n.modifiers)) n.modifiers = objs(n.modifiers).map(normalizeModifier);
    else delete n.modifiers;
  }
  if ("runs" in n) {
    const runs = objs(n.runs).filter((r2) => isStr(r2.text)).map(sanitizeRun);
    if (runs.length) n.runs = runs;
    else delete n.runs;
  }
  if ("options" in n && !isStr(n.options)) delete n.options;
  for (const k of ["min", "max", "step"]) if (k in n && !isNum(n[k])) delete n[k];
  if ("cursorImage" in n && n.cursorImage !== null && !isStr(n.cursorImage)) delete n.cursorImage;
  if ("cursorHotspot" in n && !(isObj(n.cursorHotspot) && isNum(n.cursorHotspot.x) && isNum(n.cursorHotspot.y))) delete n.cursorHotspot;
  if ("disabled" in n && typeof n.disabled !== "boolean") delete n.disabled;
  if ("slice" in n && n.slice !== null && !(isObj(n.slice) && ["top", "right", "bottom", "left"].every((k) => isNum(n.slice[k])))) delete n.slice;
  if ("sliceTile" in n && n.sliceTile !== "stretch" && n.sliceTile !== "repeat") delete n.sliceTile;
  if (raw.type === "video") {
    if ("captions" in n) {
      const cues = cleanCues(n.captions);
      if (cues.length) n.captions = cues;
      else delete n.captions;
    }
    if ("captionLang" in n && !isStr(n.captionLang)) delete n.captionLang;
  }
  if ("inputs" in n && !isObj(n.inputs)) delete n.inputs;
  if (isObj(n.inputs)) n.inputs = Object.fromEntries(Object.entries(n.inputs).filter(([, v]) => isNum(v) || isStr(v) || typeof v === "boolean"));
  if (raw.type === "path") {
    n.paths = objs(n.paths).map((sp) => ({ ...sp, closed: !!sp.closed, points: objs(sp.points).filter((p) => isNum(p.x) && isNum(p.y)) })).filter((sp) => sp.points.length > 0);
  }
  if ("skin" in n) {
    const sk = skin(n.skin);
    if (sk) n.skin = sk;
    else delete n.skin;
  }
  if ("mesh" in n) {
    const m = mesh(n.mesh);
    if (m) n.mesh = m;
    else delete n.mesh;
  }
  if (raw.type === "group" || raw.type === "frame" || raw.type === "bone") {
    n.children = (Array.isArray(n.children) ? n.children : []).map((c2) => sanitizeNode(c2, seen)).filter(Boolean);
    if (n.layout !== void 0 && n.layout !== null && !isObj(n.layout)) n.layout = null;
    if (isObj(n.layout)) {
      const L = { ...LAYOUT_DEFAULTS, ...n.layout };
      for (const [k, d] of Object.entries(LAYOUT_DEFAULTS)) if (!fits(L[k], d)) L[k] = structuredClone(d);
      const pad = isObj(L.padding) ? L.padding : {};
      L.padding = Object.fromEntries(["top", "right", "bottom", "left"].map((k) => [k, isNum(pad[k]) ? pad[k] : 0]));
      if ("crossGap" in L && !isNum(L.crossGap)) delete L.crossGap;
      if ("units" in L) {
        const u = isObj(L.units) ? L.units : {};
        const kept = {};
        if (u.gap === "percent") kept.gap = "percent";
        if (u.crossGap === "percent" && isNum(L.crossGap)) kept.crossGap = "percent";
        const sides = percentSides(u.padding);
        if (sides) kept.padding = sides;
        if (Object.keys(kept).length) L.units = kept;
        else delete L.units;
      }
      if ("grid" in L) {
        const grid = gridLayout(L.grid);
        if (grid) L.grid = grid;
        else delete L.grid;
      }
      n.layout = L;
    }
  }
  return n;
}
const influences = (v) => objs(v).filter((i) => isNum(i.b) && isNum(i.w)).slice(0, 4);
function skin(v) {
  if (!isObj(v) || !Array.isArray(v.bones) || !Array.isArray(v.weights)) return null;
  const bones = objs(v.bones).filter((b) => isStr(b.bone) && Array.isArray(b.bind) && b.bind.length === 6 && b.bind.every(isNum));
  if (!bones.length || bones.length !== v.bones.length) return null;
  const weights = v.weights.map(
    (sp) => (Array.isArray(sp) ? sp : []).map((pt) => {
      const o = isObj(pt) ? pt : {};
      const out = { w: influences(o.w).filter((i) => i.b < bones.length) };
      for (const k of ["in", "out"]) if (Array.isArray(o[k])) out[k] = influences(o[k]).filter((i) => i.b < bones.length);
      return out;
    })
  );
  return { bones, weights };
}
function mesh(v) {
  if (!isObj(v) || !Array.isArray(v.vertices) || !Array.isArray(v.triangles)) return null;
  const vertices = objs(v.vertices).filter((p) => isNum(p.x) && isNum(p.y) && isNum(p.u) && isNum(p.v));
  if (vertices.length !== v.vertices.length || vertices.length < 3) return null;
  const tri = v.triangles.filter((i) => Number.isInteger(i) && i >= 0 && i < vertices.length);
  if (tri.length !== v.triangles.length) return null;
  const sk = v.skin === void 0 || v.skin === null ? null : skin(v.skin);
  return { vertices, triangles: tri.slice(0, tri.length - tri.length % 3), skin: sk };
}
function sanitizeRun(r2) {
  const out = { ...r2 };
  for (const k of ["fontFamily", "color"]) if (k in out && !isStr(out[k])) delete out[k];
  for (const k of ["fontSize", "fontWeight", "letterSpacing"]) if (k in out && !isNum(out[k])) delete out[k];
  for (const k of ["italic", "underline", "strike"]) if (k in out && typeof out[k] !== "boolean") delete out[k];
  if ("link" in out && out.link !== null && !(isObj(out.link) && isStr(out.link.url))) delete out.link;
  return out;
}
const isPaintBlend = (b) => PAINT_BLEND_MODES.includes(b);
function fx(v) {
  const o = { ...v };
  for (const k of ["opacity", "feather", "offsetX", "offsetY"]) if (k in o && !isNum(o[k])) delete o[k];
  if ("feather" in o && o.feather < 0) delete o.feather;
  if ("visible" in o && typeof o.visible !== "boolean") delete o.visible;
  if ("blend" in o && !(isStr(o.blend) && isPaintBlend(o.blend))) delete o.blend;
  return o;
}
function paint(v) {
  if (!isObj(v) || !isStr(v.type)) return null;
  switch (v.type) {
    case "solid":
      return fx(isStr(v.color) ? v : { ...v, color: "#000000" });
    case "linear":
    case "radial": {
      const stops = objs(v.stops).filter((st) => isStr(st.color)).map((st) => ({ ...st, offset: isNum(st.offset) ? st.offset : 0 }));
      if (!stops.length) return null;
      const out = { ...v, stops };
      if (v.type === "linear") out.angle = isNum(v.angle) ? v.angle : 0;
      for (const k of ["from", "to", "center"]) {
        if (!(k in out)) continue;
        const pt = out[k];
        if (!isObj(pt) || !(isNum(pt.x) || isNum(pt.y))) delete out[k];
        else out[k] = { ...isNum(pt.x) ? { x: pt.x } : {}, ...isNum(pt.y) ? { y: pt.y } : {} };
      }
      if ("radius" in out && !(isNum(out.radius) && out.radius > 0)) delete out.radius;
      return fx(out);
    }
    case "image":
      return isStr(v.assetId) ? fx(v) : null;
    default:
      return null;
  }
}
const oneOf = (v, list) => list.includes(v) ? v : void 0;
function gridLayout(v) {
  if (!isObj(v)) return null;
  const tracks = (list) => objs(list).map((t2) => ({ type: oneOf(t2.type, ["auto", "px", "percent", "fr"]), value: t2.value })).filter((t2) => t2.type).map((t2) => isNum(t2.value) ? { type: t2.type, value: t2.value } : { type: t2.type });
  const g = { columns: tracks(v.columns), rows: tracks(v.rows) };
  for (const [k, list] of [["justifyItems", ["start", "center", "end"]], ["alignItems", ["start", "center", "end"]], ["justifyContent", ["start", "center", "space-between"]], ["alignContent", ["start", "center"]]]) {
    const x = oneOf(v[k], list);
    if (x) g[k] = x;
  }
  if (v.stack === true) g.stack = true;
  return g;
}
const LAYOUT_DEFAULTS = { direction: "row", gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: "start", align: "start", wrap: false, hugWidth: false, hugHeight: false };
const BLEND_MODES = ["normal", "dissolve", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "plus-lighter", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];
const PAINT_BLEND_MODES = BLEND_MODES.filter((m) => m !== "dissolve");
function isContainer(node) {
  return node.type === "group" || node.type === "frame" || node.type === "bone";
}
let idCounter = 0;
function uid(prefix = "") {
  idCounter = (idCounter + 1) % 1679616;
  const rand = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36).slice(-5) + idCounter.toString(36) + rand;
}
function createArtboard(partial = {}) {
  return {
    id: uid("ab"),
    name: "Artboard",
    width: 800,
    height: 600,
    background: { type: "solid", color: "#ffffff" },
    canvasX: 0,
    canvasY: 0,
    children: [],
    timelines: [],
    logic: { nodes: [], edges: [] },
    clip: true,
    ...partial
  };
}
function walk(nodes, fn, parent = null) {
  for (const n of nodes) {
    fn(n, parent);
    if (isContainer(n)) walk(n.children, fn, n);
  }
}
const DRAW_TEMPLATES = [
  {
    id: "starter",
    name: "Pulsing circle",
    description: "The smallest script layer: a circle that breathes.",
    code: `// g draws; t is seconds since the layer started
function draw(g, t) {
  g.clear('#10131a');
  g.fill('#6f8cff');
  const r = 24 + Math.sin(t * 2) * 8;
  g.circle(g.width / 2, g.height / 2, r);
}
`
  },
  {
    id: "particles",
    name: "Particles",
    description: "Glowing dots that drift upwards and shy away from the pointer.",
    code: `// Anything declared outside draw() keeps its value between frames
const dots = [];

function setup(g) {
  for (let i = 0; i < 80; i++) {
    dots.push({
      x: g.random(g.width),
      y: g.random(g.height),
      r: g.random(1.5, 4),
      speed: g.random(8, 30),
      hue: g.random(190, 280),
    });
  }
}

function draw(g, t, dt) {
  g.clear('#0b0e17');
  g.blend('add');
  for (const d of dots) {
    d.y -= d.speed * dt;
    if (d.y < -10) { d.y = g.height + 10; d.x = g.random(g.width); }
    // Push dots away from the pointer
    if (g.pointer.inside) {
      const dx = d.x - g.pointer.x;
      const dy = d.y - g.pointer.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 70) { d.x += (dx / dist) * (70 - dist) * 4 * dt; d.y += (dy / dist) * (70 - dist) * 4 * dt; }
    }
    g.fill(g.hsl(d.hue, 90, 65, 0.8));
    g.circle(d.x + Math.sin(t + d.hue) * 6, d.y, d.r);
  }
}
`
  },
  {
    id: "bar-chart",
    name: "Bar chart from a variable",
    description: "Bars for the numbers in a list variable called chartValues. Change the variable and the bars grow to match.",
    variables: [{ name: "chartValues", type: "list", initial: "[12, 19, 7, 15, 24, 10]" }],
    code: `// Reads the list variable "chartValues" (numbers, or objects with a "value"). Edit it and the bars follow.
const shown = [];   // what is drawn now, easing towards the variable

function draw(g, t, dt) {
  const raw = ix.vars.chartValues;
  const values = (Array.isArray(raw) ? raw : []).map((v) => Number(v && typeof v === 'object' ? v.value : v) || 0);
  g.clear('#ffffff');
  if (!values.length) { g.fill('#888'); g.text('Add a list variable called chartValues', 12, 24, { size: 13 }); return; }

  const pad = 24;
  const max = Math.max(1, ...values);
  const slot = (g.width - pad * 2) / values.length;
  g.stroke('#e3e6ee', 1);
  g.line(pad, g.height - pad, g.width - pad, g.height - pad);
  g.noStroke();

  values.forEach((v, i) => {
    // Ease the shown value towards the real one (about a third of a second)
    shown[i] = (shown[i] ?? 0) + (v - (shown[i] ?? 0)) * Math.min(1, dt * 8);
    const h = (shown[i] / max) * (g.height - pad * 2 - 14);
    const x = pad + i * slot + slot * 0.15;
    g.fill(g.hsl(220 + i * 18, 75, 58));
    g.rect(x, g.height - pad - h, slot * 0.7, h, 4);
    g.fill('#444');
    g.text(String(Math.round(v)), x + slot * 0.35, g.height - pad - h - 6, { size: 12, align: 'center' });
  });
}
`
  },
  {
    id: "sine-waves",
    name: "Sine waves",
    description: "Layered, slowly moving waves with a gradient sky.",
    code: `function draw(g, t) {
  const sky = g.linearGradient(0, 0, 0, g.height, ['#1b2a5a', '#e0709a']);
  g.fill(sky);
  g.rect(0, 0, g.width, g.height);

  for (let layer = 0; layer < 4; layer++) {
    const base = g.height * (0.45 + layer * 0.14);
    const amp = 14 + layer * 6;
    const points = [[0, g.height]];
    for (let x = 0; x <= g.width; x += 6) {
      points.push([x, base + Math.sin(x / (50 + layer * 20) + t * (0.6 + layer * 0.25)) * amp]);
    }
    points.push([g.width, g.height]);
    g.fill(g.hsl(255 - layer * 12, 55, 20 + layer * 9, 0.9));
    g.path(points, true);
  }
}
`
  },
  {
    id: "clock",
    name: "Clock",
    description: "An analogue clock showing the viewer's local time.",
    code: `function hand(g, cx, cy, angle, length, width, color) {
  g.stroke(color, width);
  g.lineStyle({ cap: 'round' });
  g.line(cx, cy, cx + Math.sin(angle) * length, cy - Math.cos(angle) * length);
}

function draw(g) {
  const cx = g.width / 2;
  const cy = g.height / 2;
  const r = Math.min(cx, cy) - 8;
  g.clear();
  g.fill('#fafafa');
  g.stroke('#222', 3);
  g.circle(cx, cy, r);
  g.noFill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.stroke('#222', i % 3 === 0 ? 3 : 1);
    g.line(cx + Math.sin(a) * r * 0.86, cy - Math.cos(a) * r * 0.86, cx + Math.sin(a) * r * 0.95, cy - Math.cos(a) * r * 0.95);
  }
  const now = new Date();
  const s = now.getSeconds() + now.getMilliseconds() / 1000;
  const m = now.getMinutes() + s / 60;
  const h = (now.getHours() % 12) + m / 60;
  hand(g, cx, cy, (h / 12) * Math.PI * 2, r * 0.5, 5, '#222');
  hand(g, cx, cy, (m / 60) * Math.PI * 2, r * 0.75, 3, '#222');
  hand(g, cx, cy, (s / 60) * Math.PI * 2, r * 0.85, 1.5, '#d33');
}
`
  }
];
const NOISE = `// Hash and gradient noise
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash22(i), f), dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
`;
const DEMO = `// The picture to filter: u_image, or a test card while none is set
vec4 demoCard(vec2 uv) {
  vec3 c = mix(vec3(0.98, 0.62, 0.30), vec3(0.16, 0.22, 0.62), uv.y);
  float sun = smoothstep(0.205, 0.195, length((uv - vec2(0.5, 0.58)) * vec2(1.7, 1.0)));
  c = mix(c, vec3(1.0, 0.94, 0.78), sun);
  float hill = smoothstep(0.02, 0.0, uv.y - (0.22 + 0.08 * sin(uv.x * 7.0) + 0.04 * sin(uv.x * 19.0)));
  c = mix(c, vec3(0.08, 0.09, 0.16), hill);
  return vec4(c, 1.0);
}
vec4 source(vec2 uv) {
  return u_image_size.x > 0.5 ? texture2D(u_image, uv) : demoCard(uv);
}
`;
const f = (name, value, min, max) => ({ name, type: "float", value, ...min !== void 0 ? { min } : {}, ...max !== void 0 ? { max } : {} });
const c = (name, value) => ({ name, type: "color", value });
const SHADER_PRESETS = [
  {
    id: "clouds",
    name: "Clouds (gradient noise)",
    description: "Soft drifting clouds from layered gradient noise.",
    kind: "generator",
    uniforms: [f("speed", 0.12, 0, 2), f("scale", 2.6, 0.5, 10), c("skyColor", "#1c3f8f"), c("cloudColor", "#f2f7ff")],
    code: `// Soft drifting clouds: layered gradient noise, warped by itself
${NOISE}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * gnoise(p);
    p = p * 2.02 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return v;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.y;
  float t = u_time * speed;
  vec2 p = uv * scale;
  float q = fbm(p + vec2(t, t * 0.4));
  float n = fbm(p + 2.0 * q + vec2(-t * 0.6, t * 0.2));
  float cloud = smoothstep(-0.2, 0.55, n);
  vec3 col = mix(skyColor.rgb, cloudColor.rgb, cloud);
  col += 0.06 * (1.0 - fragCoord.y / u_resolution.y) * vec3(0.6, 0.7, 1.0);
  fragColor = vec4(col, 1.0);
}
`
  },
  {
    id: "plasma",
    name: "Plasma",
    description: "Classic colour-cycling plasma from summed sine waves.",
    kind: "generator",
    uniforms: [f("speed", 1, 0, 5), f("scale", 2, 0.5, 8), f("hue", 0, 0, 6.28)],
    code: `// Plasma: sine waves summed, then run through a cosine palette
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * u_resolution) / u_resolution.y * scale;
  float t = u_time * speed;
  float v = sin(p.x * 3.0 + t);
  v += sin(p.y * 3.0 - t * 1.3);
  v += sin((p.x + p.y) * 2.0 + t * 0.7);
  v += sin(length(p) * 4.0 - t * 1.7);
  vec3 col = 0.5 + 0.5 * cos(6.28318 * (v * 0.25 + vec3(0.0, 0.33, 0.67)) + hue);
  fragColor = vec4(col, 1.0);
}
`
  },
  {
    id: "ripples",
    name: "Ripples",
    description: "Rings spreading from the centre, or from the pointer while it is pressed.",
    kind: "generator",
    uniforms: [f("frequency", 28, 4, 80), f("speed", 3, 0, 10), c("deepColor", "#061a3a"), c("lightColor", "#5fd0ff")],
    code: `// Ripples: rings spreading from the centre, or from the pointer while the button is down
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  vec2 centre = u_mouse.z > 0.5 ? u_mouse.xy : vec2(0.5);
  vec2 d = (uv - centre) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float r = length(d);
  float wave = sin(r * frequency - u_time * speed);
  float fade = exp(-r * 2.2);
  float shade = 0.5 + 0.5 * wave * fade;
  vec3 col = mix(deepColor.rgb, lightColor.rgb, shade);
  col += 0.25 * pow(max(wave, 0.0), 6.0) * fade;
  fragColor = vec4(col, 1.0);
}
`
  },
  {
    id: "glow",
    name: "Glow backdrop",
    description: "Soft drifting lights with a bloom-like roll-off, for backgrounds.",
    kind: "generator",
    uniforms: [f("speed", 0.5, 0, 3), f("intensity", 1.1, 0, 3), c("colorA", "#ff4f9a"), c("colorB", "#4f7bff")],
    code: `// A glowing backdrop: a few drifting lights added together, then rolled off like bloom
float blob(vec2 p, vec2 centre, float radius) {
  float d = length(p - centre) / radius;
  return 1.0 / (1.0 + d * d * d * d);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * speed;
  float a = blob(p, vec2(aspect * 0.30 + 0.20 * sin(t), 0.50 + 0.25 * cos(t * 1.3)), 0.45);
  float b = blob(p, vec2(aspect * 0.70 + 0.20 * cos(t * 0.8), 0.45 + 0.30 * sin(t * 0.9)), 0.40);
  float c = blob(p, vec2(aspect * 0.50 + 0.30 * sin(t * 0.6 + 2.0), 0.20 + 0.10 * cos(t)), 0.35);
  vec3 light = colorA.rgb * a + colorB.rgb * b + mix(colorA.rgb, colorB.rgb, 0.5) * c;
  vec3 col = vec3(0.03, 0.035, 0.07) + light * intensity;
  col *= 1.0 - 0.35 * length(uv - 0.5);
  col = 1.0 - exp(-col * 1.4);
  fragColor = vec4(col, 1.0);
}
`
  },
  {
    id: "voronoi",
    name: "Voronoi cells",
    description: "Animated cellular pattern with thin borders.",
    kind: "generator",
    uniforms: [f("scale", 6, 1, 30), f("speed", 0.6, 0, 3), f("edgeWidth", 0.06, 5e-3, 0.3), c("colorA", "#ffb347"), c("colorB", "#3a1c71"), c("lineColor", "#10061f")],
    code: `// Voronoi: the nearest of a jittering point per grid cell, coloured by which cell it is
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.y * scale;
  vec2 g = floor(uv);
  vec2 f = fract(uv);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = 0.5 + 0.5 * hash22(g + o);
      vec2 r = o + 0.5 + 0.45 * sin(u_time * speed + 6.28318 * h) - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = g + o;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float edge = smoothstep(0.0, edgeWidth, sqrt(d2) - sqrt(d1));
  vec3 cell = mix(colorA.rgb, colorB.rgb, hash21(id));
  fragColor = vec4(mix(lineColor.rgb, cell, edge), 1.0);
}
`
  },
  {
    id: "wave",
    name: "Wave distortion (image)",
    description: "Ripples an image sideways and up and down.",
    kind: "filter",
    uniforms: [f("amount", 0.012, 0, 0.1), f("frequency", 14, 1, 60), f("speed", 1.5, 0, 8)],
    code: `// Wave distortion: the picture is sampled through a moving sine warp
${DEMO}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  float t = u_time * speed;
  uv.x += sin(uv.y * frequency + t) * amount;
  uv.y += cos(uv.x * frequency * 0.8 + t * 1.2) * amount * 0.6;
  fragColor = source(clamp(uv, 0.0, 1.0));
}
`
  },
  {
    id: "crt",
    name: "CRT / scanlines (image)",
    description: "Curved screen, scanlines, colour fringing and a vignette.",
    kind: "filter",
    uniforms: [f("curvature", 0.25, 0, 1), f("scanlines", 0.35, 0, 1), f("lines", 240, 60, 720), f("fringe", 2e-3, 0, 0.01)],
    code: `// CRT: barrel distortion, scanlines that roll slowly, red and blue pulled apart, dark corners
${DEMO}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  vec2 cc = uv - 0.5;
  uv = 0.5 + cc * (1.0 + curvature * dot(cc, cc));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 off = vec2(fringe, 0.0);
  vec3 col = vec3(source(uv + off).r, source(uv).g, source(uv - off).b);
  float line = 0.5 + 0.5 * sin(uv.y * lines * 6.28318 - u_time * 2.0);
  col *= 1.0 - scanlines * line;
  col *= 1.0 + 0.03 * sin(u_time * 60.0);
  col *= 1.0 - 1.4 * dot(cc, cc);
  fragColor = vec4(col, 1.0);
}
`
  },
  {
    id: "halftone",
    name: "Dot halftone (image)",
    description: "Prints the picture as a grid of dots that grow where it is darker.",
    kind: "filter",
    uniforms: [f("dotSize", 9, 3, 40), f("colorMix", 0.4, 0, 1), c("inkColor", "#15151f"), c("paperColor", "#f4efe2")],
    code: `// Halftone: a rotated grid of dots; each dot's size follows the brightness of the picture under it
${DEMO}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float cell = max(dotSize, 2.0);
  float ang = 0.5236;
  mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 gp = R * (fragCoord / cell);
  vec2 id = floor(gp);
  vec2 local = fract(gp) - 0.5;
  vec2 centrePx = ((id + 0.5) * R) * cell;
  vec4 src = source(clamp(centrePx / u_resolution.xy, 0.0, 1.0));
  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  float radius = 0.72 * sqrt(1.0 - lum);
  float aa = 1.5 / cell;
  float dotMask = smoothstep(radius + aa, radius - aa, length(local));
  vec3 ink = mix(inkColor.rgb, src.rgb, colorMix);
  fragColor = vec4(mix(paperColor.rgb, ink, dotMask), 1.0);
}
`
  },
  {
    id: "grain",
    name: "Film grain (image)",
    description: "Flickering film grain and a soft vignette over a picture.",
    kind: "filter",
    uniforms: [f("amount", 0.18, 0, 1), f("rate", 24, 1, 60), f("vignette", 0.5, 0, 1)],
    code: `// Film grain: fresh noise every 1/rate of a second, strongest in the mid-tones, plus a vignette
${NOISE}
${DEMO}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution.xy;
  vec4 col = source(uv);
  float n = hash21(fragCoord + floor(u_time * rate) * vec2(17.0, 31.0)) - 0.5;
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  col.rgb += n * amount * (1.0 - 0.6 * abs(lum - 0.5) * 2.0);
  col.rgb *= 1.0 - vignette * dot(uv - 0.5, uv - 0.5) * 2.0;
  fragColor = col;
}
`
  }
];
const SHADER_PRESETS_BY_ID = Object.fromEntries(SHADER_PRESETS.map((p) => [p.id, p]));
const IMAGE_UNIFORM = "u_image";
function presetContent(preset, target) {
  const uniforms = preset.uniforms.map((u) => ({ ...u, value: Array.isArray(u.value) ? [...u.value] : u.value }));
  if (target === "layer" && preset.kind === "filter") uniforms.push({ name: IMAGE_UNIFORM, type: "image", value: "" });
  return { code: preset.code, uniforms };
}
const DEFAULT_SHADER = presetContent(SHADER_PRESETS[0], "layer");
({ ...presetContent(SHADER_PRESETS_BY_ID.wave, "filter") });
const PALETTE_SNAPSHOT = {
  "--blue-gradient-1": "#00497d",
  "--blue-gradient-2": "#0080a8",
  "--feature-colour-blue": "#0080a8",
  "--feature-colour-charcoal": "#777777",
  "--feature-colour-gold": "#ffb448",
  "--feature-colour-green": "#3e8521",
  "--feature-colour-orange": "#ed6a21",
  "--feature-colour-purple": "#775d94",
  "--gold-gradient-1": "#f58220",
  "--gold-gradient-2": "#ffb448",
  "--green-gradient-1": "#0e6a6f",
  "--green-gradient-2": "#3e8521",
  "--ilar-btn-active": "#777777",
  "--ilar-btn-active-background": "#a0a0a0",
  "--ilar-btn-active-border": "#a0a0a0",
  "--ilar-btn-active-text": "#ffffff",
  "--ilar-btn-border": "#a0a0a0",
  "--ilar-btn-hover": "#cacaca",
  "--ilar-btn-hover-active": "#4d4d4d",
  "--ilar-btn-hover-active-background": "#4d4d4d",
  "--ilar-btn-hover-active-border": "#4d4d4d",
  "--ilar-btn-hover-active-text": "#ffffff",
  "--ilar-btn-hover-background": "#dfdfdf",
  "--ilar-btn-hover-border": "#a0a0a0",
  "--ilar-btn-hover-text": "#777777",
  "--ilar-btn-primary": "#ffffff",
  "--ilar-btn-primary-active-background": "#fb9400",
  "--ilar-btn-primary-active-border": "#fb9400",
  "--ilar-btn-primary-active-text": "#1e1e1e",
  "--ilar-btn-primary-background": "#ffb448",
  "--ilar-btn-primary-border": "#ffb448",
  "--ilar-btn-primary-hover-active-background": "#b36b03",
  "--ilar-btn-primary-hover-active-border": "#b36b03",
  "--ilar-btn-primary-hover-active-text": "#1e1e1e",
  "--ilar-btn-primary-hover-background": "#fb9400",
  "--ilar-btn-primary-hover-border": "#fb9400",
  "--ilar-btn-primary-hover-text": "#1e1e1e",
  "--ilar-btn-primary-selected-hover-background": "#b36b03",
  "--ilar-btn-primary-selected-hover-border": "#b36b03",
  "--ilar-btn-primary-selected-hover-text": "#1e1e1e",
  "--ilar-btn-primary-text": "#1e1e1e",
  "--ilar-btn-selected-hover-background": "#777777",
  "--ilar-btn-selected-hover-border": "#777777",
  "--ilar-btn-selected-hover-text": "#ffffff",
  "--ilar-btn-text": "#a0a0a0",
  "--ilar-dark-primary": "#fb9400",
  "--ilar-darker-primary": "#b36b03",
  "--ilar-primary": "#ffb448",
  "--ilar-swatch-blue": "#0080a8",
  "--ilar-swatch-error": "#f44336",
  "--ilar-swatch-green": "#3e8521",
  "--ilar-swatch-grey-1": "#f4f4f4",
  "--ilar-swatch-grey-2": "#dfdfdf",
  "--ilar-swatch-grey-3": "#cacaca",
  "--ilar-swatch-grey-4": "#a0a0a0",
  "--ilar-swatch-grey-5": "#777777",
  "--ilar-swatch-grey-6": "#4d4d4d",
  "--ilar-swatch-grey-7": "#1e1e1e",
  "--ilar-swatch-grey-dim": "#888888",
  "--ilar-swatch-grey-muted": "#999999",
  "--ilar-swatch-grey-panel": "#eeeeee",
  "--ilar-swatch-grey-text": "#333333",
  "--ilar-swatch-hyperlink": "#428bca",
  "--ilar-swatch-hyperlink-active": "#212529",
  "--ilar-swatch-hyperlink-hover": "#2a6496",
  "--ilar-swatch-hyperlink-visited": "#1e1e1e",
  "--ilar-swatch-icon-blue": "#26a7de",
  "--ilar-swatch-off-white": "#fefefe",
  "--ilar-swatch-orange": "#ed6a21",
  "--ilar-swatch-plum": "#3c2d4d",
  "--ilar-swatch-purple": "#775d94",
  "--ilar-swatch-yellow": "#ffb448",
  "--ilar-swatch-yellow-dark": "#fb9400",
  "--ilar-swatch-yellow-darker": "#b36b03",
  "--orange-gradient-1": "#d0372b",
  "--orange-gradient-2": "#ed6a21",
  "--purple-gradient-1": "#3c2d4d",
  "--purple-gradient-2": "#775d94",
  "--red-gradient-1": "#eb6559",
  "--red-gradient-2": "#eb6559",
  "--yellow-gradient-1": "#f58220",
  "--yellow-gradient-2": "#ffb448"
};
const listeners = /* @__PURE__ */ new Set();
function currentPalette() {
  return PALETTE_SNAPSHOT;
}
function onPaletteChange(fn) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function paletteColor(spec, vars = currentPalette()) {
  return resolveSpec(spec, vars) ?? resolveSpec(spec, PALETTE_SNAPSHOT);
}
const t = (key, name, light, dark, highContrast) => ({ key, name, light, dark, highContrast });
const WHITE = "--ilar-swatch-off-white";
const INK = "--ilar-swatch-grey-7";
const GREEN = "--ilar-swatch-green";
const ERROR = "--ilar-swatch-error";
const ORANGE = "--ilar-swatch-orange";
const GOLD = "--ilar-swatch-yellow";
const LINK = "--ilar-swatch-hyperlink";
const mix = (a, pct, over) => `mix(${a} ${pct}%, ${over})`;
const STARTER_TOKEN_DEFS = [
  t("background", "color/background", WHITE, INK, INK),
  t("surface", "color/surface", "--ilar-swatch-grey-1", "--ilar-swatch-grey-text", INK),
  t("surfaceMuted", "color/surface-muted", "--ilar-swatch-grey-2", "--ilar-swatch-grey-6", "--ilar-swatch-grey-6"),
  t("text", "color/text", INK, "--ilar-swatch-grey-1", WHITE),
  t("muted", "color/muted", "--ilar-swatch-grey-4", "--ilar-swatch-grey-3", WHITE),
  t("primary", "color/primary", "--ilar-primary", GOLD, GOLD),
  t("onPrimary", "color/on-primary", INK, INK, INK),
  t("link", "color/link", LINK, mix(LINK, 70, WHITE), mix(LINK, 70, WHITE)),
  t("button", "color/button", "--ilar-btn-primary-background", "--ilar-btn-primary-background", "--ilar-btn-primary-background"),
  t("onButton", "color/on-button", "--ilar-btn-primary-text", "--ilar-btn-primary-text", "--ilar-btn-primary-text"),
  t("border", "color/border", "--ilar-swatch-grey-4", "--ilar-swatch-grey-4", WHITE),
  t("divider", "color/divider", "--ilar-swatch-grey-2", "--ilar-swatch-grey-6", WHITE),
  t("focus", "color/focus", "--ilar-primary", GOLD, WHITE),
  t("success", "color/success", GREEN, mix(GREEN, 55, WHITE), mix(GREEN, 55, WHITE)),
  t("successSurface", "color/success-surface", mix(GREEN, 12, WHITE), mix(GREEN, 25, INK), INK),
  t("error", "color/error", ERROR, mix(ERROR, 60, WHITE), mix(ERROR, 60, WHITE)),
  t("errorSurface", "color/error-surface", mix(ERROR, 12, WHITE), mix(ERROR, 25, INK), INK),
  t("warning", "color/warning", ORANGE, GOLD, GOLD),
  t("warningSurface", "color/warning-surface", mix(ORANGE, 14, WHITE), mix(GOLD, 20, INK), INK)
];
function starterHex(def, column) {
  return paletteColor(def[column], currentPalette()) ?? "#808080";
}
const LIGHT_LOOK = {};
function refreshLook() {
  for (const d of STARTER_TOKEN_DEFS) LIGHT_LOOK[d.key] = starterHex(d, "light");
}
refreshLook();
onPaletteChange(refreshLook);
const NAMES = {
  rect: "Rectangle",
  ellipse: "Ellipse",
  polygon: "Polygon",
  star: "Star",
  path: "Path",
  text: "Text",
  image: "Image",
  group: "Group",
  frame: "Frame",
  button: "Button",
  input: "Input",
  link: "Link",
  embed: "Embed",
  video: "Video",
  instance: "Instance",
  draw: "Script layer",
  shader: "Shader layer",
  bone: "Bone"
};
function base(type) {
  return {
    id: uid("n"),
    type,
    name: NAMES[type],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    originX: 0.5,
    originY: 0.5,
    opacity: 1,
    visible: true
  };
}
const DEFAULT_FONT = "Open Sans";
const DEFAULT_TEXT_STYLE = {
  fontFamily: `"${DEFAULT_FONT}", system-ui, sans-serif`,
  fontSize: 16,
  fontWeight: 400,
  fontStyle: "normal",
  lineHeight: 1.3,
  letterSpacing: 0,
  //Read when a layer is made, so a palette that loads later is picked up
  get color() {
    return LIGHT_LOOK.text;
  },
  align: "left",
  verticalAlign: "top"
};
const DEFAULT_DRAW_CODE = DRAW_TEMPLATES[0].code;
const GREY = () => ({ type: "solid", color: LIGHT_LOOK.surfaceMuted });
const FACTORIES = {
  rect: () => ({ fill: GREY(), stroke: null, cornerRadius: 0 }),
  ellipse: () => ({ fill: GREY(), stroke: null }),
  polygon: () => ({ fill: GREY(), stroke: null, sides: 6 }),
  star: () => ({ fill: GREY(), stroke: null, points: 5, innerRatio: 0.45 }),
  path: () => ({
    fill: null,
    stroke: { paint: { type: "solid", color: LIGHT_LOOK.text }, width: 2 },
    paths: [],
    lineCap: "round",
    lineJoin: "round"
  }),
  text: () => ({ ...DEFAULT_TEXT_STYLE, text: "Text", autoSize: "height", width: 200, height: 24 }),
  image: () => ({ assetId: null, fit: "cover", cornerRadius: 0 }),
  group: () => ({ children: [] }),
  frame: () => ({
    children: [],
    fill: { type: "solid", color: LIGHT_LOOK.background },
    stroke: null,
    cornerRadius: 0,
    clip: true
  }),
  button: () => ({
    ...DEFAULT_TEXT_STYLE,
    //Gold with black, bolder text, like the toolbox's buttons
    fill: { type: "solid", color: LIGHT_LOOK.button },
    stroke: null,
    color: LIGHT_LOOK.onButton,
    fontWeight: 700,
    align: "center",
    verticalAlign: "middle",
    label: "Button",
    cornerRadius: 6,
    width: 140,
    height: 44
  }),
  input: () => ({
    ...DEFAULT_TEXT_STYLE,
    fill: { type: "solid", color: LIGHT_LOOK.background },
    stroke: { paint: { type: "solid", color: LIGHT_LOOK.border }, width: 1 },
    inputType: "text",
    placeholder: "Type here",
    variableId: null,
    value: "",
    cornerRadius: 6,
    width: 220,
    height: 40
  }),
  link: () => ({
    ...DEFAULT_TEXT_STYLE,
    color: LIGHT_LOOK.link,
    textDecoration: "underline",
    text: "Link",
    href: "https://example.com",
    newTab: true,
    width: 120,
    height: 24
  }),
  embed: () => ({
    mode: "html",
    src: "https://example.com",
    html: '<div style="font:14px system-ui;padding:12px">Custom HTML</div>',
    cornerRadius: 0,
    width: 320,
    height: 200
  }),
  video: () => ({
    assetId: null,
    src: "",
    autoplay: true,
    loop: true,
    muted: true,
    controls: false,
    fit: "cover",
    cornerRadius: 0,
    width: 320,
    height: 180
  }),
  instance: () => ({ artboardId: "", fit: "fill" }),
  // A bone's base is its origin; its length is its width (see BoneNode)
  bone: () => ({ children: [], width: 80, height: 0, originX: 0, originY: 0 }),
  draw: () => ({
    code: DEFAULT_DRAW_CODE,
    fps: 0,
    pixelRatio: "auto",
    runInEditor: true,
    width: 320,
    height: 200
  }),
  shader: () => ({
    code: DEFAULT_SHADER.code,
    uniforms: structuredClone(DEFAULT_SHADER.uniforms),
    fps: 0,
    pixelRatio: "auto",
    animateInEditor: false,
    width: 320,
    height: 200
  })
};
function createNode(type, partial = {}) {
  return { ...base(type), ...FACTORIES[type](), ...partial, type };
}
const DRAW_API = [
  ["function draw(g, t, dt)", "Runs every frame. t is seconds since the layer started, dt seconds since the last frame it drew. The canvas is cleared before each frame, so draw everything every time."],
  ["function setup(g)", "Optional. Runs once, before the first draw. Top-level code and `let` variables outside the functions keep their values between frames."],
  ["g.width, g.height", "The layer's size in px. Draw in these units, 0,0 is the top-left; the pixel ratio is handled for you."],
  ["g.pointer", "{x, y, down, inside}: the pointer in layer px, whether a button is down, and whether it is over the layer."],
  ["g.frame", "How many frames this layer has drawn."],
  ["g.clear(color?)", "Wipes the canvas, optionally filling it with a colour."],
  ["g.fill(color) / g.noFill()", "Fill for the shapes and text that follow. Starts as black. A colour is any CSS colour, or a gradient from g.linearGradient / g.radialGradient."],
  ["g.stroke(color, width = 1) / g.noStroke()", "Outline for the shapes that follow. Starts off."],
  ["g.lineStyle({cap, join, dash, dashOffset})", "cap: butt, round or square. join: miter, round or bevel. dash: lengths like [6, 4]."],
  ["g.rect(x, y, w, h, radius = 0)", "A rectangle (top-left corner and size)."],
  ["g.circle(x, y, r) / g.ellipse(x, y, rx, ry, rotation = 0)", "Centre and radius. Rotation is in radians."],
  ["g.line(x1, y1, x2, y2)", "A line, drawn with the stroke (the fill colour when there is no stroke)."],
  ["g.path(points, closed = false)", "Joins points ([[x, y], ...], [{x, y}, ...] or a flat [x, y, x, y, ...]) and draws them with the fill and stroke."],
  ["g.begin(), g.moveTo(x, y), g.lineTo(x, y), g.bezierTo(c1x, c1y, c2x, c2y, x, y), g.quadTo(cx, cy, x, y), g.arc(x, y, r, a0, a1, ccw), g.close(), g.paint()", "Build any outline step by step; paint() fills and strokes it. Angles are in radians."],
  ["g.svgPath(d)", 'An SVG path string ("M0 0L10 10..."), drawn with the fill and stroke.'],
  ['g.text(str, x, y, {size = 16, font, weight, italic, align = "left", baseline = "alphabetic", maxWidth})', "Text with the fill (and stroke). font is a family name, e.g. one of the project fonts. baseline: top, middle, alphabetic or bottom."],
  ["g.image(assetNameOrId, x, y, w?, h?)", "An image asset from the project, at its own size unless w and h are given. Optional source rectangle: g.image(a, x, y, w, h, sx, sy, sw, sh)."],
  ["g.save() / g.restore()", "Keep and bring back the fill, stroke, transform, opacity, blend mode and clip."],
  ["g.translate(x, y) / g.rotate(radians) / g.scale(sx, sy = sx)", "Move, turn or scale everything that follows (until restore)."],
  ["g.clipRect(x, y, w, h)", "Only draw inside this rectangle (until restore)."],
  ["g.alpha(a)", "Opacity 0 to 1 for what follows."],
  ["g.blend(mode)", "normal, add, multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, exclusion."],
  ["g.shadow(color, blur, x = 0, y = 0) / g.noShadow()", "A drop shadow for what follows."],
  ["g.linearGradient(x0, y0, x1, y1, stops) / g.radialGradient(x, y, r0, r1, stops)", "A gradient to pass to fill or stroke. stops: colours, spaced evenly, or [[offset, color], ...]. Valid for the frame it is made in."],
  ["g.rgb(r, g, b, a = 1) / g.hsl(h, s, l, a = 1)", "Colour strings. h is 0 to 360, s and l 0 to 100."],
  ["g.random(), g.random(max), g.random(min, max) / g.seed(n)", "Seeded random numbers: the layer draws the same numbers on every run, g.seed(n) restarts the sequence (do that at the start of draw for a picture that does not change from frame to frame)."],
  ["ix.vars.name, ix.data.name", "Project variables and data sources, read as in any script (vars is also a shortcut). A script layer can read them; it cannot move other layers."]
];
const STYLE_KEYS = ["fontFamily", "fontSize", "fontWeight", "italic", "color", "underline", "strike", "letterSpacing", "link"];
function runsText(runs) {
  return runs ? runs.map((r2) => r2.text).join("") : "";
}
function styleOf(r2) {
  const out = {};
  for (const k of STYLE_KEYS) if (r2[k] !== void 0 && r2[k] !== null) out[k] = r2[k];
  return out;
}
function sameRunStyle(a, b) {
  for (const k of STYLE_KEYS) {
    const x = a[k] ?? void 0;
    const y = b[k] ?? void 0;
    if (k === "link") {
      if (x?.url !== y?.url || x?.target !== y?.target) return false;
    } else if (x !== y) return false;
  }
  return true;
}
function isPlainRuns(runs) {
  return !runs || runs.every((r2) => Object.keys(styleOf(r2)).length === 0);
}
function normalizeRuns(runs) {
  const out = [];
  for (const r2 of runs) {
    if (!r2.text) continue;
    const next = { text: r2.text, ...styleOf(r2) };
    const last = out[out.length - 1];
    if (last && sameRunStyle(last, next)) last.text += next.text;
    else out.push(next);
  }
  return out;
}
function runsPatch(runs) {
  const norm = normalizeRuns(runs);
  return { text: runsText(norm), runs: isPlainRuns(norm) ? void 0 : norm };
}
class ExprError extends Error {
}
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MAX_STEPS = 2e5;
const MAX_DEPTH = 80;
const MAX_SOURCE = 2e4;
const MAX_STRING = 1e6;
const MAX_LIST = 1e5;
const SHORT = Symbol("short");
const RESERVED = /* @__PURE__ */ new Set([
  "function",
  "this",
  "class",
  "delete",
  "instanceof",
  "var",
  "let",
  "const",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "try",
  "catch",
  "finally",
  "throw",
  "async",
  "await",
  "yield",
  "import",
  "export",
  "super",
  "with",
  "debugger",
  "enum",
  "extends",
  "new",
  "typeof",
  "void",
  "in",
  "null",
  "true",
  "false"
]);
const PUNCT = [
  ">>>=",
  "...",
  "===",
  "!==",
  "**=",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "**",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "=",
  "!",
  "~",
  "&",
  "|",
  "^",
  "?",
  ":",
  ",",
  ".",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}"
];
const ID_START = /[A-Za-z_$ -￿]/;
const ID_PART = /[\w$ -￿]/;
const DIGIT = /[0-9]/;
const ASSIGN = /* @__PURE__ */ new Set(["=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "??="]);
const REGEX_FLAGS = /^[dgimsuy]*$/;
class Parser {
  constructor(src) {
    this.src = src;
    this.pos = 0;
    this.depth = 0;
    this.advance();
  }
  fail(msg, at = this.tok?.start ?? this.pos) {
    throw new ExprError(`${msg} (at ${at})`);
  }
  // ---- lexing
  lex() {
    const s = this.src;
    while (this.pos < s.length && /\s/.test(s[this.pos])) this.pos++;
    const start = this.pos;
    if (start >= s.length) return { t: "end", v: "", start, end: start };
    const c2 = s[start];
    if (c2 === '"' || c2 === "'") {
      let i = start + 1;
      let out = "";
      while (i < s.length && s[i] !== c2) {
        if (s[i] === "\n") this.fail("Unterminated string", start);
        if (s[i] === "\\") {
          const r2 = this.escape(i);
          out += r2.text;
          i = r2.next;
        } else out += s[i++];
      }
      if (i >= s.length) this.fail("Unterminated string", start);
      this.pos = i + 1;
      return { t: "str", v: out, start, end: this.pos };
    }
    if (c2 === "`") {
      this.pos = start + 1;
      return { t: "tick", v: "`", start, end: this.pos };
    }
    if (DIGIT.test(c2) || c2 === "." && DIGIT.test(s[start + 1] ?? "")) {
      let m = /^0[xX][0-9a-fA-F]+|^0[bB][01]+|^0[oO][0-7]+/.exec(s.slice(start));
      if (!m) m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(start));
      const text = m[0];
      if (s[start + text.length] && ID_START.test(s[start + text.length])) this.fail("Unexpected character after number", start);
      this.pos = start + text.length;
      return { t: "num", v: text, n: Number(text), start, end: this.pos };
    }
    if (ID_START.test(c2)) {
      let i = start + 1;
      while (i < s.length && ID_PART.test(s[i])) i++;
      this.pos = i;
      return { t: "id", v: s.slice(start, i), start, end: i };
    }
    for (const p of PUNCT) {
      if (s.startsWith(p, start)) {
        if (p === "?." && DIGIT.test(s[start + 2] ?? "")) continue;
        this.pos = start + p.length;
        return { t: "p", v: p, start, end: this.pos };
      }
    }
    return this.fail(`Unexpected character "${c2}"`, start);
  }
  escape(i) {
    const s = this.src;
    const c2 = s[i + 1];
    switch (c2) {
      case "n":
        return { text: "\n", next: i + 2 };
      case "t":
        return { text: "	", next: i + 2 };
      case "r":
        return { text: "\r", next: i + 2 };
      case "b":
        return { text: "\b", next: i + 2 };
      case "f":
        return { text: "\f", next: i + 2 };
      case "v":
        return { text: "\v", next: i + 2 };
      case "0":
        return { text: "\0", next: i + 2 };
      case "\n":
        return { text: "", next: i + 2 };
      case "x": {
        const h = s.slice(i + 2, i + 4);
        if (!/^[0-9a-fA-F]{2}$/.test(h)) this.fail("Bad escape", i);
        return { text: String.fromCharCode(parseInt(h, 16)), next: i + 4 };
      }
      case "u": {
        if (s[i + 2] === "{") {
          const close = s.indexOf("}", i);
          const h2 = s.slice(i + 3, close);
          if (close < 0 || !/^[0-9a-fA-F]{1,6}$/.test(h2) || parseInt(h2, 16) > 1114111) this.fail("Bad escape", i);
          return { text: String.fromCodePoint(parseInt(h2, 16)), next: close + 1 };
        }
        const h = s.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) this.fail("Bad escape", i);
        return { text: String.fromCharCode(parseInt(h, 16)), next: i + 6 };
      }
      case void 0:
        return this.fail("Bad escape", i);
      default:
        return { text: c2, next: i + 2 };
    }
  }
  advance() {
    this.tok = this.lex();
  }
  is(v) {
    return this.tok.t === "p" && this.tok.v === v;
  }
  eat(v) {
    if (this.is(v)) {
      this.advance();
      return true;
    }
    return false;
  }
  expect(v) {
    if (!this.eat(v)) this.fail(`Expected "${v}"`);
  }
  // ---- grammar
  parseAll() {
    if (this.src.length > MAX_SOURCE) this.fail("Expression is too long", 0);
    const e = this.sequence();
    if (this.tok.t !== "end") this.fail(`Unexpected "${this.tok.v}"`);
    return e;
  }
  nest(f2) {
    if (++this.depth > MAX_DEPTH) this.fail("Expression is nested too deeply");
    try {
      return f2();
    } finally {
      this.depth--;
    }
  }
  sequence() {
    const first = this.ternary();
    if (!this.is(",")) return first;
    const list = [first];
    while (this.eat(",")) list.push(this.ternary());
    return (env) => {
      let v;
      for (const e of list) v = e(env);
      return v;
    };
  }
  ternary() {
    return this.nest(() => {
      const arrow = this.tryArrow();
      if (arrow) return arrow;
      const test = this.binary(0);
      if (this.is("?")) {
        this.advance();
        const a = this.ternary();
        this.expect(":");
        const b = this.ternary();
        return (env) => test(env) ? a(env) : b(env);
      }
      if (this.tok.t === "p" && ASSIGN.has(this.tok.v)) this.fail("Assignment is not supported in expressions");
      return test;
    });
  }
  /** `x => body` and `(a, b) => body`; null when this is not an arrow function (state untouched). */
  tryArrow() {
    const save = { pos: this.pos, tok: this.tok };
    const restore = () => {
      this.pos = save.pos;
      this.tok = save.tok;
    };
    let params = null;
    if (this.tok.t === "id" && !RESERVED.has(this.tok.v)) {
      const name = this.tok.v;
      this.advance();
      if (this.is("=>")) params = [name];
    } else if (this.is("(")) {
      this.advance();
      const names2 = [];
      let ok = true;
      if (!this.is(")")) {
        for (; ; ) {
          if (this.tok.t === "id" && !RESERVED.has(this.tok.v)) {
            names2.push(this.tok.v);
            this.advance();
          } else {
            ok = false;
            break;
          }
          if (this.eat(",")) continue;
          break;
        }
      }
      if (ok && this.is(")")) {
        this.advance();
        if (this.is("=>")) params = names2;
      }
    }
    if (!params) {
      restore();
      return null;
    }
    this.advance();
    if (this.is("{")) this.fail("Arrow functions need an expression body, not a block");
    const body = this.ternary();
    const names = params;
    for (const n of names) if (n === "__proto__") this.fail("Bad parameter name");
    return (env) => {
      const outer = env;
      return (...args) => {
        const b = outer.budget.active ? outer.budget : { steps: 0, active: true };
        if (++b.steps > MAX_STEPS) throw new ExprError("Expression took too long");
        return body({ ...outer, budget: b, locals: { names, values: args, parent: outer.locals } });
      };
    };
  }
  static {
    this.BIN = {
      "??": 1,
      "||": 2,
      "&&": 3,
      "|": 4,
      "^": 5,
      "&": 6,
      "==": 7,
      "!=": 7,
      "===": 7,
      "!==": 7,
      "<": 8,
      ">": 8,
      "<=": 8,
      ">=": 8,
      in: 8,
      "<<": 9,
      ">>": 9,
      ">>>": 9,
      "+": 10,
      "-": 10,
      "*": 11,
      "/": 11,
      "%": 11,
      "**": 12
    };
  }
  binary(min) {
    let left = this.unary();
    for (; ; ) {
      const op = this.tok.t === "p" || this.tok.t === "id" && this.tok.v === "in" ? this.tok.v : "";
      const prec = Parser.BIN[op];
      if (prec === void 0 || prec < min) return left;
      this.advance();
      const right = this.binary(op === "**" ? prec : prec + 1);
      left = makeBinary(op, left, right);
    }
  }
  unary() {
    return this.nest(() => {
      if (this.tok.t === "p" && ["!", "-", "+", "~"].includes(this.tok.v)) {
        const op = this.tok.v;
        this.advance();
        const a = this.unary();
        if (op === "!") return (env) => !a(env);
        if (op === "-") return (env) => -a(env);
        if (op === "+") return (env) => +a(env);
        return (env) => ~a(env);
      }
      if (this.tok.t === "id" && (this.tok.v === "typeof" || this.tok.v === "void")) {
        const op = this.tok.v;
        this.advance();
        const a = this.unary();
        if (op === "typeof") {
          const name = IDENT_NAME.get(a);
          if (name) {
            return (env) => {
              const f2 = find(env, name);
              return f2.found ? typeof f2.value : "undefined";
            };
          }
          return (env) => typeof a(env);
        }
        return (env) => (a(env), void 0);
      }
      if (this.is("++") || this.is("--")) this.fail("Increment is not supported in expressions");
      return this.postfix();
    });
  }
  args() {
    const list = [];
    this.expect("(");
    while (!this.is(")")) {
      if (this.eat("...")) {
        const e = this.ternary();
        list.push(markSpread(e));
      } else list.push(this.ternary());
      if (!this.eat(",")) break;
    }
    this.expect(")");
    return list;
  }
  postfix() {
    let e = this.primary();
    let optional = false;
    for (; ; ) {
      if (this.is(".") || this.is("?.")) {
        const opt = this.is("?.");
        this.advance();
        if (opt && this.is("(")) {
          e = makeCall(e, this.args(), true);
          optional = true;
          continue;
        }
        if (opt && this.is("[")) {
          this.advance();
          const k = this.sequence();
          this.expect("]");
          e = makeMember(e, k, true);
          optional = true;
          continue;
        }
        if (this.tok.t !== "id") this.fail("Expected a property name");
        const name = this.tok.v;
        this.advance();
        e = makeMember(e, name, opt);
        if (opt) optional = true;
        continue;
      }
      if (this.is("[")) {
        this.advance();
        const k = this.sequence();
        this.expect("]");
        e = makeMember(e, k, false);
        continue;
      }
      if (this.is("(")) {
        e = makeCall(e, this.args(), false);
        continue;
      }
      if (this.tok.t === "tick") this.fail("Tagged templates are not supported");
      break;
    }
    if (optional) {
      const inner = e;
      return (env) => {
        const v = inner(env);
        return v === SHORT ? void 0 : v;
      };
    }
    return e;
  }
  primary() {
    const t2 = this.tok;
    switch (t2.t) {
      case "num": {
        this.advance();
        const n = t2.n;
        return () => n;
      }
      case "str": {
        this.advance();
        const s = t2.v;
        return () => s;
      }
      case "tick":
        return this.template();
      case "id":
        return this.identifier();
      case "p":
        break;
      default:
        return this.fail("Unexpected end of expression");
    }
    switch (t2.v) {
      case "(": {
        this.advance();
        const e = this.sequence();
        this.expect(")");
        return e;
      }
      case "[":
        return this.arrayLiteral();
      case "{":
        return this.objectLiteral();
      case "/":
      case "/=":
        return this.regex();
      default:
        return this.fail(`Unexpected "${t2.v}"`);
    }
  }
  identifier() {
    const name = this.tok.v;
    if (name === "new") return this.newExpr();
    if (RESERVED.has(name)) {
      if (name === "null") {
        this.advance();
        return () => null;
      }
      if (name === "true") {
        this.advance();
        return () => true;
      }
      if (name === "false") {
        this.advance();
        return () => false;
      }
      this.fail(`"${name}" is not supported in expressions`);
    }
    this.advance();
    const ev = (env) => {
      const f2 = find(env, name);
      if (!f2.found) throw new ExprError(`${name} is not defined`);
      return f2.value;
    };
    IDENT_NAME.set(ev, name);
    return ev;
  }
  newExpr() {
    this.advance();
    if (this.tok.t !== "id" || RESERVED.has(this.tok.v)) this.fail("Expected a name after new");
    const name = this.tok.v;
    this.advance();
    const args = this.is("(") ? this.args() : [];
    return (env) => {
      const f2 = find(env, name);
      const fn = f2.found ? f2.value : void 0;
      if (typeof fn !== "function" || !NEWABLE.has(fn)) throw new ExprError(`new ${name} is not supported in expressions`);
      budget(env);
      return Reflect.construct(fn, evalArgs(args, env));
    };
  }
  arrayLiteral() {
    this.advance();
    const items = [];
    while (!this.is("]")) {
      if (this.is(",")) {
        this.advance();
        items.push(() => void 0);
        continue;
      }
      if (this.eat("...")) items.push(markSpread(this.ternary()));
      else items.push(this.ternary());
      if (!this.eat(",")) break;
    }
    this.expect("]");
    return (env) => evalArgs(items, env);
  }
  objectLiteral() {
    this.advance();
    const props = [];
    while (!this.is("}")) {
      if (this.eat("...")) {
        props.push({ key: null, value: this.ternary(), spread: true });
      } else {
        let key;
        let shorthand = null;
        if (this.tok.t === "id") {
          key = this.tok.v;
          shorthand = RESERVED.has(this.tok.v) ? null : this.tok.v;
          this.advance();
        } else if (this.tok.t === "str") {
          key = this.tok.v;
          this.advance();
        } else if (this.tok.t === "num") {
          key = String(this.tok.n);
          this.advance();
        } else if (this.is("[")) {
          this.advance();
          key = this.ternary();
          this.expect("]");
        } else return this.fail("Expected a property name");
        if (this.eat(":")) props.push({ key, value: this.ternary() });
        else if (shorthand && typeof key === "string") {
          const name = shorthand;
          props.push({
            key,
            value: (env) => {
              const f2 = find(env, name);
              if (!f2.found) throw new ExprError(`${name} is not defined`);
              return f2.value;
            }
          });
        } else if (this.is("(")) this.fail("Methods in object literals are not supported");
        else this.fail('Expected ":"');
      }
      if (!this.eat(",")) break;
    }
    this.expect("}");
    return (env) => {
      const out = {};
      for (const p of props) {
        if (p.spread) {
          const v = p.value(env);
          if (v === null || v === void 0) continue;
          if (typeof v === "string" || Array.isArray(v) || isPlain(v)) {
            for (const k2 of Object.keys(v)) if (!BLOCKED.has(k2)) out[k2] = v[k2];
          } else throw new ExprError("Cannot spread that value into an object");
          continue;
        }
        const k = typeof p.key === "string" ? p.key : propKey(p.key(env));
        if (BLOCKED.has(k)) throw new ExprError(`Property "${k}" is not allowed`);
        Object.defineProperty(out, k, { value: p.value(env), enumerable: true, writable: true, configurable: true });
      }
      return out;
    };
  }
  regex() {
    const s = this.src;
    const start = this.tok.start;
    let i = start + 1;
    let inClass = false;
    for (; i < s.length; i++) {
      const c2 = s[i];
      if (c2 === "\n") this.fail("Unterminated regular expression", start);
      if (c2 === "\\") i++;
      else if (c2 === "[") inClass = true;
      else if (c2 === "]") inClass = false;
      else if (c2 === "/" && !inClass) break;
    }
    if (i >= s.length) this.fail("Unterminated regular expression", start);
    const source = s.slice(start + 1, i);
    let j = i + 1;
    while (j < s.length && ID_PART.test(s[j])) j++;
    const flags = s.slice(i + 1, j);
    if (!REGEX_FLAGS.test(flags)) this.fail("Bad regular expression flags", start);
    try {
      assertSafePattern(source, flags);
      new RegExp(source, flags);
      compile$1(source, flags);
    } catch (e) {
      this.fail(e instanceof RegexRefused ? e.message : `Bad regular expression: ${e.message}`, start);
    }
    this.pos = j;
    this.advance();
    return () => new RegExp(source, flags);
  }
  template() {
    const s = this.src;
    let i = this.tok.end;
    const strings = [];
    const exprs = [];
    let cur = "";
    for (; ; ) {
      if (i >= s.length) this.fail("Unterminated template", this.tok.start);
      const c2 = s[i];
      if (c2 === "`") {
        strings.push(cur);
        i++;
        break;
      }
      if (c2 === "\\") {
        const r2 = this.escape(i);
        cur += r2.text;
        i = r2.next;
      } else if (c2 === "$" && s[i + 1] === "{") {
        strings.push(cur);
        cur = "";
        this.pos = i + 2;
        this.advance();
        exprs.push(this.sequence());
        if (!this.is("}")) this.fail('Expected "}" in template');
        i = this.tok.end;
      } else {
        cur += c2;
        i++;
      }
    }
    this.pos = i;
    this.advance();
    return (env) => {
      let out = strings[0];
      for (let k = 0; k < exprs.length; k++) out += toText(exprs[k](env)) + strings[k + 1];
      if (out.length > MAX_STRING) throw new ExprError("Text is too long");
      return out;
    };
  }
}
function budget(env) {
  if (++env.budget.steps > MAX_STEPS) throw new ExprError("Expression took too long");
}
function find(env, name) {
  for (let l = env.locals; l; l = l.parent) {
    const i = l.names.lastIndexOf(name);
    if (i >= 0) return { found: true, value: l.values[i] };
  }
  if (hasOwn(env.extra, name)) return { found: true, value: env.extra[name] };
  if (hasOwn(env.vars, name)) return { found: true, value: env.vars[name] };
  if (hasOwn(FORMULA_HELPERS, name)) return { found: true, value: FORMULA_HELPERS[name] };
  if (hasOwn(GLOBALS, name)) return { found: true, value: GLOBALS[name] };
  return { found: false };
}
const IDENT_NAME = /* @__PURE__ */ new WeakMap();
const MEMBER_INFO = /* @__PURE__ */ new WeakMap();
const SPREAD = /* @__PURE__ */ new WeakSet();
function markSpread(e) {
  const w = (env) => e(env);
  SPREAD.add(w);
  return w;
}
function evalArgs(list, env) {
  const out = [];
  for (const e of list) {
    if (SPREAD.has(e)) {
      const v = e(env);
      if (typeof v === "string" || Array.isArray(v)) {
        if (out.length + v.length > MAX_LIST) throw new ExprError("List is too long");
        for (const x of v) out.push(x);
      } else throw new ExprError("Cannot spread that value");
    } else out.push(e(env));
  }
  return out;
}
function toText(v) {
  if (typeof v === "symbol") throw new ExprError("Cannot convert a symbol to text");
  return String(v);
}
const BLOCKED = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
function isPlain(v) {
  if (v === null || typeof v !== "object") return false;
  const p = Object.getPrototypeOf(v);
  if (p === Object.prototype || p === null) return true;
  return Object.getPrototypeOf(p) === null && hasOwn(p, "hasOwnProperty");
}
function propKey(k) {
  if (typeof k === "string") return k;
  if (typeof k === "number" || typeof k === "boolean" || typeof k === "bigint") return String(k);
  if (k === null || k === void 0) return String(k);
  throw new ExprError("That value cannot be used as a property name");
}
const guardLen = (n) => {
  if (typeof n === "number" && n > MAX_STRING) throw new ExprError("Text is too long");
};
class PatternText {
  constructor(source) {
    this.source = source;
  }
}
function guardRegex(re, text) {
  try {
    assertSafeMatch(re.source, re instanceof RegExp ? re.flags : "", text);
  } catch (e) {
    if (e instanceof RegexRefused) throw new ExprError(e.message);
    throw e;
  }
}
const STRING_METHODS = {};
for (const m of [
  "at",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "concat",
  "endsWith",
  "includes",
  "indexOf",
  "lastIndexOf",
  "localeCompare",
  "match",
  "normalize",
  "replace",
  "replaceAll",
  "search",
  "slice",
  "split",
  "startsWith",
  "substring",
  "substr",
  "toLowerCase",
  "toLocaleLowerCase",
  "toUpperCase",
  "toLocaleUpperCase",
  "toString",
  "trim",
  "trimEnd",
  "trimStart",
  "valueOf"
]) {
  const f2 = String.prototype[m];
  STRING_METHODS[m] = function(...a) {
    return f2.apply(this, a);
  };
}
STRING_METHODS.repeat = function(n) {
  if (typeof n === "number" && n * this.length > MAX_STRING) throw new ExprError("Text is too long");
  return this.repeat(n);
};
STRING_METHODS.padStart = function(n, fill) {
  guardLen(n);
  return this.padStart(n, fill);
};
STRING_METHODS.padEnd = function(n, fill) {
  guardLen(n);
  return this.padEnd(n, fill);
};
for (const m of ["match", "matchAll", "search", "replace", "replaceAll", "split"]) {
  const inner = STRING_METHODS[m];
  const compiles = m === "match" || m === "matchAll" || m === "search";
  STRING_METHODS[m] = function(...a) {
    const p = a[0];
    let re = null;
    if (p instanceof RegExp) {
      guardRegex(p, this);
      re = p;
    } else if (compiles && p !== void 0 && p !== null) {
      const text = String(p);
      guardRegex(new PatternText(text), this);
      re = new RegExp(text, m === "matchAll" ? "g" : "");
    }
    if (!re) return inner.apply(this, a);
    return linearly(() => {
      switch (m) {
        case "match":
          return linearMatch(re, this);
        case "matchAll":
          return linearMatchAll(re, this);
        case "search":
          return linearSearch(re, this);
        case "replace":
          return linearReplace(re, this, a[1], false);
        case "replaceAll":
          return linearReplace(re, this, a[1], true);
        default:
          return linearSplit(re, this, a[1]);
      }
    });
  };
}
function linearly(f2) {
  try {
    return f2();
  } catch (e) {
    if (e instanceof RegexRefused) throw new ExprError(e.message);
    throw e;
  }
}
const ARRAY_METHODS = {};
for (const m of [
  "at",
  "concat",
  "every",
  "filter",
  "find",
  "findIndex",
  "findLast",
  "findLastIndex",
  "flat",
  "flatMap",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "lastIndexOf",
  "map",
  "reduce",
  "reduceRight",
  "slice",
  "some",
  "toString",
  "toLocaleString",
  "toSorted",
  "toReversed",
  "toSpliced",
  "with"
]) {
  const f2 = Array.prototype[m];
  if (!f2) continue;
  ARRAY_METHODS[m] = function(...a) {
    return f2.apply(this, a);
  };
}
ARRAY_METHODS.sort = function(cmp) {
  return [...this].sort(cmp);
};
ARRAY_METHODS.reverse = function() {
  return [...this].reverse();
};
const NUMBER_METHODS = {};
for (const m of ["toFixed", "toExponential", "toPrecision", "toString", "toLocaleString", "valueOf"]) {
  const f2 = Number.prototype[m];
  NUMBER_METHODS[m] = function(...a) {
    return f2.apply(this, a);
  };
}
const BOOLEAN_METHODS = {
  toString: function() {
    return String(this);
  },
  valueOf: function() {
    return this.valueOf();
  }
};
const DATE_METHODS = {};
for (const m of [
  "getTime",
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "getMilliseconds",
  "getTimezoneOffset",
  "getUTCFullYear",
  "getUTCMonth",
  "getUTCDate",
  "getUTCDay",
  "getUTCHours",
  "getUTCMinutes",
  "getUTCSeconds",
  "getUTCMilliseconds",
  "toISOString",
  "toJSON",
  "toDateString",
  "toTimeString",
  "toString",
  "toLocaleString",
  "toLocaleDateString",
  "toLocaleTimeString",
  "valueOf"
]) {
  const f2 = Date.prototype[m];
  DATE_METHODS[m] = function(...a) {
    return f2.apply(this, a);
  };
}
const REGEXP_METHODS = {
  test: function(s) {
    guardRegex(this, String(s));
    return linearly(() => linearExec(this, String(s)) !== null);
  },
  exec: function(s) {
    guardRegex(this, String(s));
    return linearly(() => linearExec(this, String(s)));
  },
  toString: function() {
    return this.toString();
  }
};
const STATICS = /* @__PURE__ */ new Map();
const guardedFrom = (src, map) => {
  if (typeof src === "string" || Array.isArray(src)) return Array.from(src, map);
  if (src && typeof src === "object") {
    const len = Number(src.length);
    if (Number.isFinite(len) && len > MAX_LIST) throw new ExprError("List is too long");
    return Array.from(src, map);
  }
  return [];
};
const plainOnly = (o) => {
  if (o !== null && typeof o === "object" && (Array.isArray(o) || isPlain(o))) return o;
  throw new ExprError("Expected an object");
};
const ObjectNs = {
  keys: (o) => Object.keys(plainOnly(o)),
  values: (o) => Object.values(plainOnly(o)),
  entries: (o) => Object.entries(plainOnly(o)),
  fromEntries: (list) => {
    const out = {};
    for (const e of guardedFrom(list)) {
      const k = propKey(e[0]);
      if (!BLOCKED.has(k)) Object.defineProperty(out, k, { value: e[1], enumerable: true, writable: true, configurable: true });
    }
    return out;
  },
  hasOwn: (o, k) => hasOwn(plainOnly(o), propKey(k))
};
const ArrayNs = {
  isArray: (v) => Array.isArray(v),
  from: guardedFrom,
  of: (...a) => a
};
const JSONNs = {
  parse: (s, reviver) => JSON.parse(String(s), reviver),
  stringify: (v, replacer, space) => JSON.stringify(v, replacer, space)
};
const NUMBER_STATICS = {};
for (const k of ["isFinite", "isInteger", "isNaN", "isSafeInteger", "parseFloat", "parseInt", "MAX_SAFE_INTEGER", "MIN_SAFE_INTEGER", "EPSILON", "MAX_VALUE", "MIN_VALUE", "POSITIVE_INFINITY", "NEGATIVE_INFINITY", "NaN"]) {
  NUMBER_STATICS[k] = Number[k];
}
STATICS.set(Number, NUMBER_STATICS);
STATICS.set(String, {
  fromCharCode: (...a) => String.fromCharCode(...a),
  fromCodePoint: (...a) => String.fromCodePoint(...a)
});
STATICS.set(Date, { now: () => Date.now(), parse: (s) => Date.parse(String(s)), UTC: (...a) => Date.UTC(...a) });
const NEWABLE = /* @__PURE__ */ new Set([Date]);
const GLOBALS = {
  Math,
  JSON: JSONNs,
  Number,
  String,
  Boolean,
  Date,
  Array: ArrayNs,
  Object: ObjectNs,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  NaN: NaN,
  Infinity: Infinity,
  undefined: void 0
};
function getMember(obj, rawKey) {
  if (obj === null || obj === void 0) throw new ExprError(`Cannot read "${String(rawKey)}" of ${obj}`);
  const key = propKey(rawKey);
  if (BLOCKED.has(key)) throw new ExprError(`Property "${key}" is not allowed`);
  switch (typeof obj) {
    case "string":
      if (key === "length") return obj.length;
      if (/^\d+$/.test(key)) return obj[Number(key)];
      return hasOwn(STRING_METHODS, key) ? bind(STRING_METHODS[key], obj) : void 0;
    case "number":
      return hasOwn(NUMBER_METHODS, key) ? bind(NUMBER_METHODS[key], obj) : void 0;
    case "boolean":
      return hasOwn(BOOLEAN_METHODS, key) ? bind(BOOLEAN_METHODS[key], obj) : void 0;
    case "function": {
      const t2 = STATICS.get(obj);
      return t2 && hasOwn(t2, key) ? t2[key] : void 0;
    }
    case "object":
      if (Array.isArray(obj)) {
        if (key === "length") return obj.length;
        if (/^\d+$/.test(key)) return obj[Number(key)];
        return hasOwn(ARRAY_METHODS, key) ? bind(ARRAY_METHODS[key], obj) : void 0;
      }
      if (obj instanceof Date) return hasOwn(DATE_METHODS, key) ? bind(DATE_METHODS[key], obj) : void 0;
      if (obj instanceof RegExp) {
        if (key === "source") return obj.source;
        if (key === "flags") return obj.flags;
        return hasOwn(REGEXP_METHODS, key) ? bind(REGEXP_METHODS[key], obj) : void 0;
      }
      if (isPlain(obj)) return hasOwn(obj, key) ? obj[key] : void 0;
      throw new ExprError(`Cannot read "${key}" of that value`);
    default:
      return void 0;
  }
}
function bind(fn, self) {
  return (...a) => fn.apply(self, a);
}
function makeMember(objEv, key, optional) {
  const ev = (env) => {
    const o = objEv(env);
    if (o === SHORT) return SHORT;
    if (optional && (o === null || o === void 0)) return SHORT;
    return getMember(o, typeof key === "string" ? key : key(env));
  };
  MEMBER_INFO.set(ev, { obj: objEv, key, optional });
  return ev;
}
function makeCall(calleeEv, args, optionalCall) {
  const info = MEMBER_INFO.get(calleeEv);
  return (env) => {
    budget(env);
    let fn;
    let self;
    if (info) {
      const o = info.obj(env);
      if (o === SHORT) return SHORT;
      if (info.optional && (o === null || o === void 0)) return SHORT;
      fn = getMember(o, typeof info.key === "string" ? info.key : info.key(env));
      self = isPlain(o) ? o : void 0;
    } else {
      fn = calleeEv(env);
      if (fn === SHORT) return SHORT;
    }
    if ((fn === null || fn === void 0) && optionalCall) return SHORT;
    if (typeof fn !== "function") throw new ExprError("Not a function");
    return fn.apply(self, evalArgs(args, env));
  };
}
function makeBinary(op, a, b) {
  switch (op) {
    case "??":
      return (env) => {
        const v = a(env);
        return v === null || v === void 0 ? b(env) : v;
      };
    case "||":
      return (env) => a(env) || b(env);
    case "&&":
      return (env) => a(env) && b(env);
    case "|":
      return (env) => a(env) | b(env);
    case "^":
      return (env) => a(env) ^ b(env);
    case "&":
      return (env) => a(env) & b(env);
    case "==":
      return (env) => a(env) == b(env);
    case "!=":
      return (env) => a(env) != b(env);
    case "===":
      return (env) => a(env) === b(env);
    case "!==":
      return (env) => a(env) !== b(env);
    case "<":
      return (env) => a(env) < b(env);
    case ">":
      return (env) => a(env) > b(env);
    case "<=":
      return (env) => a(env) <= b(env);
    case ">=":
      return (env) => a(env) >= b(env);
    case "in":
      return (env) => {
        const k = a(env);
        const o = b(env);
        if (o === null || typeof o !== "object" || !(Array.isArray(o) || isPlain(o))) throw new ExprError('"in" needs an object or a list');
        return hasOwn(o, propKey(k));
      };
    case "<<":
      return (env) => a(env) << b(env);
    case ">>":
      return (env) => a(env) >> b(env);
    case ">>>":
      return (env) => a(env) >>> b(env);
    case "+":
      return (env) => {
        const r2 = a(env) + b(env);
        if (typeof r2 === "string" && r2.length > MAX_STRING) throw new ExprError("Text is too long");
        return r2;
      };
    case "-":
      return (env) => a(env) - b(env);
    case "*":
      return (env) => a(env) * b(env);
    case "/":
      return (env) => a(env) / b(env);
    case "%":
      return (env) => a(env) % b(env);
    case "**":
      return (env) => a(env) ** b(env);
    default:
      throw new ExprError(`Unsupported operator ${op}`);
  }
}
const FORMULA_HELPERS = {
  fmt(n, decimals = 0, thousands = false) {
    const d = Math.max(0, Math.min(20, Math.round(decimals)));
    const s = Number(n).toFixed(d);
    if (!thousands) return s;
    const [int, frac] = s.split(".");
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? "." + frac : "");
  },
  remap(v, inMin, inMax, outMin, outMax, clamp = false) {
    const t2 = inMax === inMin ? 0 : (v - inMin) / (inMax - inMin);
    const k = clamp ? Math.min(1, Math.max(0, t2)) : t2;
    return outMin + (outMax - outMin) * k;
  },
  clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
  lookup(v, map, fallback) {
    const key = String(v);
    return map && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
  },
  pad: (n, width) => {
    guardLen(width);
    return String(n).padStart(width, "0");
  }
};
const cache = /* @__PURE__ */ new Map();
function compile(src) {
  let hit = cache.get(src);
  if (hit === void 0) {
    try {
      hit = new Parser(src).parseAll();
    } catch (e) {
      hit = e instanceof ExprError ? e : new ExprError(String(e?.message ?? e));
    }
    if (cache.size > 2e3) cache.clear();
    cache.set(src, hit);
  }
  if (hit instanceof ExprError) throw new ExprError(`Cannot parse expression: ${src.trim()} - ${hit.message}`);
  return hit;
}
function checkExpression(src) {
  const t2 = src.trim();
  if (t2) compile(t2);
}
const isIdArray = (a) => Array.isArray(a) && a.length > 0 && a.every((e) => e && typeof e === "object" && typeof e.id === "string");
const same = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  let ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let k of ka) if (!same(a[k], b[k])) return false;
  return true;
};
function stayers(order) {
  let tails = [], prev = new Array(order.length), tailIdx = [];
  for (let i = 0; i < order.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      let mid = lo + hi >> 1;
      if (tails[mid] < order[i]) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = order[i];
    tailIdx[lo] = i;
    prev[i] = lo ? tailIdx[lo - 1] : -1;
  }
  let keep = /* @__PURE__ */ new Set(), k = tailIdx[tails.length - 1];
  while (k !== void 0 && k >= 0) {
    keep.add(k);
    k = prev[k];
  }
  return keep;
}
function diff(a, b, path = [], out = []) {
  if (a === b) return out;
  let aObj = a && typeof a === "object", bObj = b && typeof b === "object";
  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    if (!same(a, b)) out.push({ t: "set", p: path, v: b });
    return out;
  }
  if (Array.isArray(a)) {
    if (a.length && a.length === b.length) {
      let aligned = true;
      for (let i = 0; i < a.length; i++) {
        let x = a[i], y = b[i];
        if (!x || typeof x !== "object" || typeof x.id !== "string" || x !== y && (!y || typeof y !== "object" || y.id !== x.id)) {
          aligned = false;
          break;
        }
      }
      if (aligned) {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff(a[i], b[i], [...path, { i: a[i].id }], out);
        return out;
      }
    }
    let idArrays = (isIdArray(a) || a.length === 0) && (isIdArray(b) || b.length === 0) && (a.length || b.length);
    if (!idArrays) {
      if (!same(a, b)) out.push({ t: "set", p: path, v: b });
      return out;
    }
    let aIds = new Map(a.map((e, i) => [e.id, i])), bIds = new Set(b.map((e) => e.id));
    for (let e of a) if (!bIds.has(e.id)) out.push({ t: "del", p: path, id: e.id });
    let common = b.filter((e) => aIds.has(e.id)), keep = stayers(common.map((e) => aIds.get(e.id))), moved = /* @__PURE__ */ new Set();
    common.forEach((e, i) => {
      if (!keep.has(i)) moved.add(e.id);
    });
    for (let id of moved) out.push({ t: "del", p: path, id });
    b.forEach((e, i) => {
      let after = i ? b[i - 1].id : null;
      if (!aIds.has(e.id) || moved.has(e.id)) out.push({ t: "ins", p: path, v: e, after });
      else diff(a[aIds.get(e.id)], e, [...path, { i: e.id }], out);
    });
    return out;
  }
  for (let k of Object.keys(a)) if (!(k in b)) out.push({ t: "set", p: [...path, k], v: void 0 });
  for (let k of Object.keys(b)) diff(a[k], b[k], [...path, k], out);
  return out;
}
const PACKAGE_EXTENSION = ".ixp";
const TUTORIALS = [
  {
    id: "tutorial-first-animation",
    title: "Tutorial 1: Your first animation",
    group: "Getting started",
    summary: "Draw a box and make it slide across the artboard with two keyframes. About five minutes.",
    keywords: "tutorial first animation start beginner keyframe record timeline rectangle move slide learn how to",
    body: `In this tutorial you draw a box and make it slide from the left of the artboard to the right. You will meet the **Layers** panel, the **Inspector**, the **Timeline** and keyframes. It takes about five minutes and you don't need anything installed.

This is how it looks when it is done:

![The finished animation in the Timeline tab: Play slides the box from the left to the right in one second, and the Record button turns the Inspector's top bar red so every change becomes a keyframe.](help/first-animation.mp4)

## 1. Make a project

1. Open the Interactives page and press **New project**. A window called **Start a new project** asks how to begin: keep **Blank project**, leave the name as it is (or type your own) and press **Create project**. The editor opens with one artboard called **Home**, 800 by 600.
2. Click the project name at the top left (it says *Untitled project*), type **My first animation** and press <kbd>Enter</kbd>. Everything saves by itself. The label next to the name says **Saved** when it has.

## 2. Draw the box

1. Press <kbd>R</kbd> to pick the **Rectangle** tool (or click the rectangle in the tool bar down the left edge).
2. Drag on the artboard, from about a quarter of the way down the left side, to make a square. Hold <kbd>Shift</kbd> while you drag to keep it square.
3. The new layer is selected. In the **Layers** panel on the left it shows under **Home**. In the **Inspector** on the right, change **Name** to **Box**.
4. In the Inspector's **Fill** section, click the colour swatch and pick a colour you like. Set **Radius** (under **Rectangle**) to 16 for rounded corners.

![The editor with the Box selected: Layers on the left, the artboard in the middle, the Inspector on the right and the Timeline underneath.](help/editor-overview.png)

## 3. Make a timeline

A **timeline** holds the animation. Each artboard can have as many as you like.

1. Click the **Timeline** tab at the bottom of the window. It opens a panel.
2. Press **+ New timeline**. You get a timeline called **Timeline**, 1000 ms (one second) long, set to **Play once**.
3. Look at the Inspector. Small diamonds now sit beside the number fields. These are **key buttons**, and they only show while the Timeline tab is open.

## 4. Set the start and the end

A **keyframe** says "at this moment, this property has this value". With two keyframes the player works out everything in between.

1. Make sure the playhead (the red line) is at **0 ms**. The time shows next to the red record dot.
2. With **Box** selected, click the diamond next to **X**. It turns gold: the box's starting X is now keyed at 0 ms.
3. Press the red **Record** button in the Timeline bar. A red bar across the top of the Inspector says **Recording keyframes at 0 ms**. While Record is on, any animatable property you change becomes a keyframe at the playhead.
4. Move the playhead to the end: click the ruler at the far right, at **1s**. The readout shows **1000 ms**.
5. Drag the box to the right edge of the artboard. Or type a new **X** value, such as 560. A second keyframe appears on the box's **X** track.
6. Press **Record** again to switch it off. Otherwise your next edit would become a keyframe too.

![The timeline: one track for the Box's X, with a keyframe at 0 and one at 1s. The Length, loop and Autoplay settings are in the bar above.](help/timeline-panel.png)

## 5. Play it

Press the **Play preview** triangle in the Timeline bar. The box slides across. Drag the playhead along the ruler to scrub through by hand.

> If the box doesn't move, check that there are **two** keys on the **X** track. A track with one key just holds that value.

## 6. Make it nicer

- **Easing.** The line between two keys is a *tween*. Click it, and in the **Tween** box on the right choose **easeOut** or **bounceOut** from **Ease**. You can also drag the two round handles on the little graph to draw your own curve. See [Easing](easing).
- **Loop.** Change **Play once** to **Loop** or **Ping-pong**, and tick **Autoplay** so it starts as soon as the artboard shows.
- **More properties.** Select the box, press **+ Key** with **Opacity**, **Rotation** or **Fill colour** chosen in the dropdown at the top left of the Timeline, or use Record and change them at different times.
- **Preview.** Press **Preview** at the top right to see it exactly as the exported file will play it. Press <kbd>Esc</kbd> to close.

## What you learned

- Projects save as you work.
- The **Layers** panel lists everything; the **Inspector** edits the selection.
- A timeline has tracks, and a track has keyframes.
- **Record** turns every change into a keyframe at the playhead.

**Next:** [Tutorial 2: Your first interaction](tutorial-first-interaction), where a button starts the animation. More on timelines: [Timelines and keyframes](timelines).`
  },
  {
    id: "tutorial-first-interaction",
    title: "Tutorial 2: Your first interaction",
    group: "Getting started",
    summary: "Add a button that plays your animation when someone clicks it, using the Interactions graph.",
    keywords: "tutorial interaction button click event action node graph connect wire drag empty space control timeline play",
    body: `Now make the animation wait for a click. You will use the **Interactions** tab, where an *event* (something happens) starts a flow of *actions* (do something). It builds on [Tutorial 1](tutorial-first-animation): open that project, or any project with a timeline in it.

## 1. Stop the timeline starting by itself

1. Open the **Timeline** tab and check that **Autoplay** is **off**. If it is on, the box would slide as soon as the artboard shows.

## 2. Add a button

1. Press <kbd>B</kbd> for the **Button** tool and drag a button below the box.
2. In the Inspector, change **Label** to **Slide the box**. The label is the text on the button. Change **Name** to **Slide button** so it is easy to find later.

## 3. Add the event

1. With the button selected, scroll the Inspector to its **Interactions** section and press **+ On click**.
2. The bottom panel switches to the **Interactions** tab and an **On pointer** node appears. Its settings on the right say **Layer: Slide button** and **Event: Click / tap**. That reads as "when Slide button is clicked".

> A shortcut for later: right-click a layer, choose **Add interaction**, then **On click…**. It adds an **On pointer** node and a **Control timeline** node, already joined.

## 4. Add the action by dragging

1. Find the small dot on the right edge of the **On pointer** node. That is its output.
2. Drag from the dot into empty space and let go.
3. A menu called **ADD AND CONNECT** opens. It lists only the nodes that make sense there. Choose **Action**, then **Control timeline**.
4. The new node appears where you let go, already connected.

![Dragging a connection into empty space: let go, pick a node, and it is added and joined for you.](help/drag-to-connect.mp4)

## 5. Choose what it does

1. Click the **Control timeline** node. Its settings show on the right.
2. Set **Timeline** to **Timeline** (the one you made), and **Do** to **Play**.
3. Leave **Continue** on **When it finishes**. That setting decides when the *next* node would run. It matters once you chain more actions after this one.

![The Interactions tab: the node palette on the left, the graph in the middle and the selected node's settings on the right.](help/interactions-panel.png)

## 6. Try it

1. Press **Preview**.
2. Click **Slide the box**. The box slides.
3. Want it to start from the left every time you click? Set **Do** to **Restart** on the **Control timeline** node instead of **Play**.

## Go further

- **Toggle.** Add a **Toggle** node after the event. Join its **a** output to **Control timeline: Play** and its **b** output to **Control timeline: Play in reverse**. Each click now alternates.
- **Hover.** Use **+ On hover** in the Inspector for a hover effect. Choose **Show / hide** or **Animate property** actions.
- **Wait.** A **Wait** node pauses a flow for some milliseconds before the next node.
- **Log.** A **Log** node writes to your browser's console, which is handy when you're not sure a flow ran. The Preview's event list also shows every event as it fires.

## What you learned

- **Events** (green) start flows, **actions** (blue) do things, **logic** (purple) chooses the way.
- You can drag from an output into empty space to add and join a node in one move.
- The **Preview** and its event list are the quickest way to test.

**Next:** [Tutorial 3: A state machine with variables](tutorial-state-machine). More on the graph: [Interactions](interactions) and [Interaction node reference](interaction-nodes).`
  },
  {
    id: "tutorial-state-machine",
    title: "Tutorial 3: A state machine with variables",
    group: "Getting started",
    summary: "Build a lamp that switches on and off, with a tap counter, using variables, a data binding and Set variable nodes.",
    keywords: "tutorial state machine variable boolean number toggle binding set variable counter lamp switch text expression braces state",
    body: `A *state machine* is a thing that is always in one state, and moves to another when something happens. In Interactives the state lives in **variables**, the things that happen are **events**, and the look of each state comes from **bindings**.

You will build a lamp. A button switches it on and off, and a counter shows how many times you pressed. It takes about ten minutes.

## 1. Make a project and two variables

1. Press **New project** on the projects page. In **Start a new project** keep **Blank project**, type **Lamp** as the name and press **Create project**.
2. Open the **Variables** tab at the bottom and press **+ Add variable**. A row appears.
3. In **Name** type \`lit\`, then press <kbd>Tab</kbd> (the name is saved when you leave the field). Set **Type** to **True/false**. Leave the starting value unticked (false).
4. Press **+ Add variable** again. Name it \`taps\`. Leave **Type** on **Number** with the starting value 0.

Names can only use letters, digits and \`_\`, and can't start with a digit. That is so they work inside expressions.

![The Variables tab: lit is true/false and starts false, taps is a number and starts at 0.](help/variables-panel.png)

## 2. Draw the lamp

1. Press <kbd>O</kbd> for the **Ellipse** tool. Drag on the artboard holding <kbd>Shift</kbd> to make a circle. Name it **Bulb**.
2. In the Inspector's **Fill**, set the colour to a pale grey, \`#c9ced6\`.
3. Press <kbd>T</kbd> for the **Text** tool and click under the bulb. Type \`Taps: {taps}\` and press <kbd>Escape</kbd> to finish. Anything in braces is an *expression*, so the text will show the number. Name the layer **Counter**.
4. Press <kbd>B</kbd>, drag a button under the text and set its **Label** to **Switch**.

## 3. Bind the bulb's colour to the variable

A *binding* keeps a property up to date with an expression.

1. Select **Bulb** and scroll the Inspector to **Data bindings**.
2. Choose **Fill colour** in the dropdown and press **Bind**.
3. In the expression box that appears, type:

\`\`\`
lit ? "#ffd23f" : "#c9ced6"
\`\`\`

That says: if \`lit\` is true the colour is yellow, otherwise it is grey. The fill now shows a link icon and can't be edited by hand while it is bound.

![The Data bindings section with a binding on fill.color. The + Convert… menu below changes the value before it is set.](help/bindings-section.png)

## 4. Add the interaction

1. Select the **Switch** button. In its **Interactions** section press **+ On click**.
2. Drag from the **On pointer** node's output dot into empty space. Choose **Action**, then **Set variable**.
3. In the settings, set **Variable** to **lit** and **Do** to **Toggle (boolean)**.
4. Drag from the new node's output into empty space again. Choose **Action**, then **Set variable**.
5. Set **Variable** to **taps**, **Do** to **Add**, and **Value** to \`1\`.

You now have: click → flip \`lit\` → add 1 to \`taps\`.

## 5. Try it

1. Press **Preview**.
2. Click **Switch**. The bulb turns yellow and the counter goes up. Click again and the bulb goes grey.
3. On the left of the Preview, the **Variables (live)** list shows \`lit\` and \`taps\`. Tick \`lit\` yourself, or type a number into \`taps\` and press <kbd>Enter</kbd>, to set them by hand. The **Events** list underneath records each click and the nodes it ran.

![The Preview with its debug panel: live variables on the left, the lamp in the middle and the events list underneath.](help/preview-debug.png)

## Go further: more than two states

- Make a variable called \`mode\` with **Type** **Choice** and the options \`off, on, broken\`. A choice shows as a dropdown wherever you set it.
- Bind the bulb's fill through a **Look up** converter (use **+ Convert…** under the binding): it lists every option for you to give a colour.
- Use an **If** node with a condition like \`taps >= 5\` to move to \`broken\` after five presses. **If** has a **true** and a **false** output.
- Tick **Remember** on a variable in the Variables tab to remember its value in the visitor's browser between visits.

## What you learned

- **Variables** hold state. They are shared by every artboard.
- **Set variable** changes them. **On variable change** reacts to a change.
- **Bindings** and \`{braces}\` in text show the state.

**Next:** [Tutorial 4: Importing a design file](tutorial-import-design). More: [Variables](variables), [Bindings](bindings) and [Expressions](expressions).`
  },
  {
    id: "tutorial-import-design",
    title: "Tutorial 4: Importing a design file",
    group: "Getting started",
    summary: "Bring a Photoshop, Illustrator, PDF, AutoCAD, Rive or Lottie file into a project, read the report and keep it linked.",
    keywords: "tutorial import psd photoshop illustrator ai pdf dxf autocad rive riv lottie svg link embed reconnect watch report design file",
    body: `You don't have to draw everything in Interactives. You can bring in a design from another app, then add the motion and the behaviour here. This tutorial uses a Photoshop file; the others work the same way.

## 1. Pick a file

Any of these will do:

| Format | File | Becomes |
|---|---|---|
| Photoshop | \`.psd\` | One artboard, with real layers and editable text |
| Illustrator | \`.ai\` (saved with **Create PDF Compatible File**) | One artboard per artboard in the file |
| PDF | \`.pdf\` | One artboard per page |
| AutoCAD | \`.dxf\` (not \`.dwg\`) | One artboard with a group per CAD layer |
| Rive | \`.riv\` | An artboard for each Rive artboard, with timelines and state machines |
| Rive editor | \`.rev\` | The same, with the layer names the export strips |
| Lottie | \`.json\` or \`.lottie\` | An artboard and a timeline |
| SVG | \`.svg\` | A group of editable shapes |

If you don't have one handy, any Photoshop file with a few layers and a text layer is a good test.

## 2. Bring it in

There are three ways:

- **Drop it** on the canvas of an open project. \`.psd\`, \`.ai\`, \`.pdf\` and \`.dxf\` files become new artboards.
- Press **+ Import file as artboard** at the bottom of the **Layers** panel. This adds artboards to the open project.
- Press **Import** on the projects page. This makes a **new project** from the file.

## 3. Choose: Link or Embed

For Photoshop, Illustrator, PDF, AutoCAD, VectorCraft and PhotoCraft files, a dialog called **Import design file** asks what to do with each file.

- **Embed** copies the file in once. This is the simplest choice and works in every browser.
- **Link** keeps a connection to the file on your computer. When you save the file in the design app, the changes come into the artboard, and your own edits stay. Linking needs Chrome or Edge.

Pick one for the file, or press **Embed all** or **Link all**. Then press **Import**.

![The Import design file dialog: one row per file with a Link / Embed choice, and Embed all, Link all and Import buttons.](help/link-or-embed-dialog.png)

## 4. Read the report

When the import finishes, a box lists anything that couldn't be carried over exactly, for example a blend mode with no equivalent. Read it once, then press the **×**. Nothing is hidden: it is the whole list.

![An import report. It says what was approximated, so you know what to check.](help/import-report.png)

## 5. Look at what you got

![A Photoshop file after import: each layer is a layer in the Layers panel, and the text is a live text layer with its own styling.](help/psd-import-result.png)

- Pixel layers became image layers. Folders became groups. Hidden layers stay hidden and show as faint ghosts on the canvas.
- Click a text layer. It is real text: change the words in the **Text** box. If it has several styles, a **Text runs** button lists them.
- If a font isn't a Google font, check the **Font** field in the Inspector. A font that isn't installed on the viewer's computer won't show.

## 6. Make it move

1. Select a layer and follow [Tutorial 1](tutorial-first-animation) to animate it, or add a button and follow [Tutorial 2](tutorial-first-interaction).
2. Your timelines, interactions and bindings are never touched by a re-import.

## 7. Keep a linked file up to date

If you chose **Link**:

1. Select the imported artboard. The Inspector shows **Linked to Poster.psd** with the time it was last updated.
2. Change the file in the design app and save it.
3. Within a couple of seconds a message says something like **Poster.psd updated: 3 layers changed, 1 added**. The change is one undo step.
4. Next time you open the project, a bar at the top may say **Reconnect**. Click it once so the browser may read the file again.
5. The Inspector also has **Re-import now**, **Unlink (keep as embedded)** and a **Watch for changes** switch.

Full details, including what each format does and doesn't carry over, are in [Importing](import).

**Next:** [Tutorial 5: Publishing and sharing](tutorial-publish).`
  },
  {
    id: "tutorial-publish",
    title: "Tutorial 5: Publishing and sharing",
    group: "Getting started",
    summary: "Check it in Preview, set the page options, then export a single HTML file or make a share link. Also how to hand a project over and get it back.",
    keywords: "tutorial publish share export html single file link embed iframe ixp package backup revision history restore collaborate preview fit page title",
    body: `Your interactive is ready. This tutorial gets it to other people. It works with any project; the lamp from [Tutorial 3](tutorial-state-machine) is a good one to use.

## 1. Check it in Preview

1. Press **Preview** at the top right. It plays the project exactly as the exported file will.
2. The dropdown at the top says **From the start artboard** or **From this artboard**. Use the second to test just the artboard you're working on.
3. Press **Restart** to start from scratch. Press <kbd>Esc</kbd> to close.

## 2. Set the page options

1. Click an empty part of the canvas, or the artboard's name, so nothing is selected. The Inspector shows **Artboard** and **Project**.
2. Under **Project**, set **Page title** (the title of the browser tab), **Fit** (how the artboard scales to its space) and **Page background** (the colour around the artboard).
3. Under **Artboard**, make sure the artboard people should see first is the start artboard. The button says **Start artboard** (greyed out) when it already is. If not, press **Make start artboard**.

![The Project section of the Inspector: name, page title, description, fit, page background, sandbox and reduced motion.](help/project-settings.png)

## 3. Export a single file

1. Press **Export** at the top right (it is only for files).
2. Choose **Single HTML file**. Your browser downloads one \`.html\` file that holds the player, the project and every image, font and sound.
3. Upload it anywhere that serves web pages, or show it in an iframe. It works offline too.

![The Export menu.](help/export-menu.png)

## 4. Or make a share link

A share link needs no uploading. Anyone with the link can play the project in their browser. They can't edit it.

1. Choose **Share → Share link…** (the **Share** button is next to **Export**).
2. Press **Create share link**. A link appears.
3. Press **Copy** and send it, or **Open** to try it.
4. The link is a snapshot. When you've changed the project, open the dialog again and press **Update to the latest version**.
5. To stop sharing, press **Turn off link** and confirm. The link then shows a "turned off" page.

Under it is the **Link for StudyDesk**. Use that one inside StudyDesk when you want each learner's score and progress kept, or when you want to see [Insights](insights). Tick **Allow remix** if you are happy for staff to copy the project into their own projects.

![The Share menu: Share link, Invite to collaborate, Save as template and Share for review.](help/share-menu.png)

![The Share link dialog: the link with Copy and Open, then Update to the latest version and Turn off link.](help/share-link-dialog.png)

## 5. Put it on a page

See [Embedding and the player API](embedding) for the iframe snippet, how the page can set variables and listen for messages, and the \`<interactives-player>\` web component.

## 6. Back it up, or hand it over

- **Export → Project package (.ixp)** saves the whole project with its assets. Anyone can bring it back with **Import** on the projects page.
- On the projects page, the download button on a project card does the same without opening it.
- The **history** button (the clock at the top) lists earlier saved versions. Pick one to preview it, then press **Restore this version**. What was there before is saved first, so you can come back. See [Live editing and saving](live-editing).

## 7. Work with other people

- **Invite someone to edit with you.** Choose **Share → Invite to collaborate…**, type their name and pick them from the list. The project appears on their projects page. When two or more people are in it, their initials appear at the top and you see each other's cursors. See [Live editing and saving](live-editing#inviting-people).
- **Ask for comments, not edits.** Choose **Share → Share for review…** and send the review link. Reviewers pin notes on the project and you answer them in the **Comments** tab. See [Review comments](comments).
- **Let others start from yours.** Choose **Share → Save as template…** to make a template with a checklist, or tick **Allow remix** on the Link for StudyDesk. See [Templates, examples and remix](templates).
- To let someone just play it, send a share link.
- An AI agent can join the same way. See [AI agents (MCP)](ai-agents).

## You're done

You've built, animated, wired up, imported and published. Keep going with the topics on the left. Good places to go next: [Timelines and keyframes](timelines), [Groups and frames](groups-frames), [Auto layout](auto-layout), [Data sources](data-sources) and [Troubleshooting and common questions](troubleshooting).`
  }
];
const TOPICS = [
  // ---------------------------------------------------------------- getting started
  {
    id: "welcome",
    title: "Welcome to Interactives",
    group: "Getting started",
    summary: "What Interactives is, how a project fits together, and where to start.",
    keywords: "intro overview start getting started tutorial beginner first learn new user onboarding glossary words",
    body: `Interactives builds 2D interactive pieces for the web: animated diagrams, explainers, quizzes, small games and UI prototypes. You draw on artboards, animate with timelines, wire up behaviour with an interaction graph, and publish a single HTML file or a package that the player runs anywhere. Everything runs in your browser and saves as you work.

![The editor: tools down the left edge, then Layers, Assets, Libraries and Comments, the artboards in the middle, the Inspector on the right, and the Timeline, Interactions, Scripts, Variables, Data and other tabs along the bottom. Share and Export are at the top right.](help/editor-overview.png)

## Getting started as a beta tester

Thank you for trying Interactives 0.5. It is a beta: the main parts work, a few edges are rough, and what you find now decides what gets fixed next. You don't need to read anything first. Follow the list below, and open the help page it links to when you want the detail.

### What to try first

About half an hour, in this order. Each step says what should happen, so you can tell when it doesn't.

1. **Play something finished.** On the projects page open the **Templates** tab, then **Examples**. Press **Play** on *Lamp*, *Bones and IK*, *Matching question* and *Hotspot question*. They should run with nothing to set up. Press **Make my copy** on one and change something in it. See [Templates, examples and remix](templates).
2. **Build something small.** Do [Tutorial 1](tutorial-first-animation) and [Tutorial 2](tutorial-first-interaction). A box should slide across the artboard, then a button should make it slide.
3. **Add a question.** Open **Web** in the tool bar, press **Add question** and choose **Matching (drag and drop)**. Press **Preview**, drop two terms in the wrong places and press **Check answer**, then fix them and check again. See [Questions and quizzes](question-kit).
4. **Start from a template.** Press **New project**: the **Start a new project** window opens. Choose **Built-in template**, then **Quiz**, then **Create project**. Work down the **Checklist** tab along the bottom, ticking things off as you change them. (The **Templates** tab has the same starters.) Also try the other choices in that window: **Copy a project or template** and **Copy an example** each have a search box, and the arrow keys move through the list.
5. **Share it.** Choose **Share**, then **Share link**, and open the link in a private window: it should play. Then choose **Share for review**, press **Create review link** and open it (tick **Let people comment without signing in** if you open it somewhere you aren't signed in to StudyDesk). Click on the artboard and write a note. Back in the editor the **Comments** tab shows it. See [Exporting](export#sharing) and [Review comments](comments).
6. **Bring in a file of your own.** Use **Import** on the projects page with a Rive, Photoshop, Illustrator, SVG or Lottie file you already have. The import report lists anything that didn't come across exactly. See [Importing](import).

### What is new to look at

Everything here is new or much changed in 0.5, and each has a page in this help:

- [Themes and colour tokens](themes): name a colour once and give it a value for Light, Dark and High contrast.
- Layers that hang outside a clipping artboard now show as a faint, diagonally striped copy beside it on the canvas, and a hidden layer in an auto-layout frame takes no space. See [Layers](layers-panel) and [Auto layout](auto-layout).
- [Questions and quizzes](question-kit): matching and hotspot questions. [Bones and skinning](bones): **Build an example to try**.
- [Auto layout](auto-layout#percent-padding-margin-and-gap): percent padding, margin and gap.
- [Review comments](comments), [inviting people by name](live-editing#inviting-people) and the **Share** menu next to **Export**.
- [Insights](insights) and [Results and progress](results), through the **Link for StudyDesk**.
- [Importing](import): Rive **.riv** files and the Rive editor's **.rev** files.
- Folding tool groups in the tool bar, and the gear beside the timeline for its settings. See [The editor at a glance](interface) and [Timelines and keyframes](timelines#timeline-settings).

### Reporting a problem

A small **(i)** icon shows which version you are running. It sits beside **Help** at the top of the help page and of the projects page, next to the open-in-new-tab icon in the help drawer, at the bottom right of the <kbd>F1</kbd> quick search, and in the title bar of **Preferences**. **Hover** it to read the version, for example \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`: the release, then the editor build and the player build. **Click** it to copy that line, then paste it into your report. **Put it in every report**, because it tells us exactly which code you had.

![The version icon beside Help at the top right of the help page.](help/version-icon.png)

A report that can be acted on has:
- the **version** (click the **(i)** icon to copy it);
- what you were trying to do, what you expected and what happened instead (a screenshot helps, and a short screen recording is better still);
- the **project name**, and the steps from a fresh project if you can find them. If the project is the problem and you can share it, send a **.ixp** package: **Export**, then **Project package**;
- your **browser**, and anything red in its console (<kbd>F12</kbd>, then **Console**) if you know how to look.

Send it straight to whoever invited you to the beta, by email or Teams. The editor also records its own faults on its own, without any names or content (see [What the editor records](what-is-recorded)), so a short note from you about what you were doing is what tells us the rest. Quick answers to common questions are in [Troubleshooting and common questions](troubleshooting).

### Known limits in 0.5

- **Browser.** Use a current Chrome or Edge. Linking design files (so changes in Photoshop or Illustrator flow in) needs the browser's file access, which only those two have. Everything else is meant to work in any current browser.
- **Results are the Toolbox's own.** A learner's score and completion are kept per learner and course in the Toolbox, not sent to the StudyDesk gradebook yet. Results and Insights only come from the **Link for StudyDesk**, and only for learners signed in to StudyDesk. See [Results and progress](results) and [Insights](insights).
- **Share links are snapshots.** After you change a project, press **Update to the latest version** in the Share link dialog, or learners keep seeing the old one.
- **Undo is yours alone.** In a live session it only undoes your own changes. Use the revision history to go further back. See [Live editing and saving](live-editing).
- **Comments have no email.** You are told in the editor (and by the bell on the projects page), not by mail. Anyone with a review link can read the whole project.
- **Libraries** carry artboards, styles, variables, fonts, data and assets, not project scripts, and only the latest version is kept. See [Libraries](libraries).
- **Themes are colours only.** Fonts, sizes and spacing don't follow a theme yet, and colours inside script and shader layers don't either.
- **Bones** have no weight painting brush yet: set weights per point in the Inspector.
- **Imports are close, not exact.** Lottie expressions, masks and mattes, and some Rive and Photoshop effects, can't be carried over, and \`.dwg\` files have to be saved as \`.dxf\` first. The import report is the whole list.
- **The accessibility checker reports what it found**, never that a project is compliant. See [Accessibility checker](accessibility-checker).

## New here? Start with the tutorials

Five short, hands-on tutorials, in order. Each has numbered steps you can follow exactly, and each ends with a link to the next.

1. [Your first animation](tutorial-first-animation): draw a box and make it slide with two keyframes.
2. [Your first interaction](tutorial-first-interaction): a button that plays the animation when it is clicked.
3. [A state machine with variables](tutorial-state-machine): a lamp that switches on and off, with a tap counter.
4. [Importing a design file](tutorial-import-design): bring in a Photoshop, Illustrator, PDF, AutoCAD, Rive or Lottie file.
5. [Publishing and sharing](tutorial-publish): export a single HTML file or make a share link.

Prefer to start from something finished? The **Templates** tab on the projects page has built-in starters and example projects you can play and copy: see [Templates, examples and remix](templates). If you like to look around first, read [The editor at a glance](interface). If something isn't working as you expect, try [Troubleshooting and common questions](troubleshooting).

## How a project fits together

- **Artboards** are the screens. Each has its own layers, timelines and interactions. See [Artboards](artboards).
- **Layers** are shapes, text, images, groups, frames, script layers and real web elements (buttons, inputs, links, embeds, video). See [Layers, hidden and locked layers](layers-panel).
- **Timelines** animate layer properties through keyframes. See [Timelines and keyframes](timelines).
- **Interactions** are a node graph: an event (a click, a key, a timer, a variable change) runs actions (play a timeline, set a variable, go to another artboard). See [Interactions](interactions).
- **Variables** and **data sources** hold values that text, bindings and lists read. See [Variables](variables) and [Data sources](data-sources).
- **Scripts** are JavaScript for anything the nodes can't do. See [Scripts](scripts).
- **Assets** are the files in the project: images, video, audio, fonts and data. See [The Assets panel](assets).

## Words you'll see

| Word | Means |
|---|---|
| Artboard | One screen of the interactive, with its own size, background, layers, timelines and interactions |
| Layer | One thing on an artboard: a shape, some text, a button, a group... |
| Inspector | The panel on the right that edits whatever is selected |
| Timeline | A set of tracks that animate layer properties over time |
| Keyframe (key) | A moment on a track with a value. The player works out the in-between |
| Record | The red button that turns every property change into a keyframe |
| Event, action, logic | The three kinds of node in the Interactions graph: what starts a flow, what it does, and how it chooses |
| Variable | A named value (number, text, true/false, colour, choice, list) shared by the whole project |
| Binding | A rule that keeps a layer property equal to an expression, such as \`lit ? "#ffd23f" : "#c9ced6"\` |
| Instance | One artboard placed inside another, like a reusable component |
| Preview | Plays the project exactly as the exported file will |

## Where to get help

Press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to search these pages. The **?** beside an Inspector section opens its page, and hovering a button or field shows a short explanation. The small **(i)** icon beside **Help** shows the version you are running when you hover it, and copies it when you click it: include it when you report a problem. See [Using this help](help).

> Everything saves automatically. The label next to the project name says **Saved**, **Saving…** or **Unsaved**.`
  },
  ...TUTORIALS,
  {
    id: "projects",
    title: "Projects page",
    group: "Getting started",
    summary: "Start a new project (blank, a copy, a built-in template or an example), open, duplicate, import and delete projects, and organise them with folders, tags, search and sort.",
    keywords: "home new project start blank chooser copy clone import duplicate delete package ixp god mode power user folder folders tag tags search sort organise organize filter",
    body: `The projects page lists the projects you own. Each card shows a picture of the project's start artboard, its name, when it last changed, how many artboards it has, its tags and a folder menu.

![The projects page: the folder list on the left, the search box, sort menu and tag filter along the top, and a card for each project.](help/projects-page.png)

## Making and opening projects

- **New project** (top right, or the **+** card) opens **Start a new project**, one window with four ways to begin. Pick one on the left (<kbd>Up</kbd> and <kbd>Down</kbd> move between them), then give the project a name and a folder at the bottom and press **Create project**. It opens straight away.
  - **Blank project**: one empty artboard called **Home**, with the Light, Dark and High contrast themes. Your default font (Open Sans unless you changed it) is added to it. See [Preferences](preferences).
  - **Copy a project or template**: a list of your own projects, your own templates and the ones shared with you. A project is copied whole, with its pictures, and the copy is called **Copy of ...**. A template opens with its checklist, as under [Templates](templates).
  - **Built-in template**: the starters that come with Interactives, shown with their pictures.
  - **Copy an example**: the finished examples, shown with their pictures. You get your own copy to change.
  
  The search box above each list filters it as you type. Press <kbd>Down</kbd> to move from the search box to the list, the arrow keys to move through it, and <kbd>Enter</kbd> to create the project from the one you picked. <kbd>Esc</kbd> closes the window without making anything. The name starts as something sensible and follows what you pick until you type your own. The folder starts as the one you were looking at, and you can change it.
- Click a card's picture to open the project. **Help** and the gear (**Preferences**) are at the top right too.
- The **Templates** tab (next to **Projects**) starts a project from a template, or from one of the finished examples. See [Templates, examples and remix](templates).
- **Import** (also the **import a file** link on the **+** card) opens a \`${PACKAGE_EXTENSION}\` package (a whole project with its assets), a project JSON file, or a design or animation file: Lottie (\`.json\`, \`.lottie\`), Rive (\`.riv\`, \`.rev\`), Photoshop (\`.psd\`), Illustrator (\`.ai\`), PDF, AutoCAD (\`.dxf\`), VectorCraft (\`.vectorcraft\`) or PhotoCraft (\`.pcraft\`). A package or JSON file comes back as a project of its own, and importing the same file twice gives you two copies. Any other file becomes a **new project**, and for design files the **Import design file** dialog first asks whether to link or embed ([Tutorial 4](tutorial-import-design)).
- Each card has three icon buttons: **Duplicate** (a copy of the project and its assets), **Export** a \`${PACKAGE_EXTENSION}\` package (a download of the whole project) and **Delete**. Delete asks first, and can't be undone, so download a package if you might want the project back.
- With no projects yet the page shows **Create your first project**, which opens the same **Start a new project** window.

## Search and sort

- The **Search name or tag** box shows only projects whose name or tags contain what you type. **Clear filters** appears if nothing matches.
- **Sort** orders the cards by **Last updated** (newest first, the default) or **Name**. The choice is remembered in this browser.
- **Thumbnails** and **Details** switch between cards with a picture and a one-row-per-project list. In Thumbnails, the slider next to them makes the pictures bigger or smaller. Both choices are remembered in this browser, the same as in the Assets tab. The page lays out at any window width: the header and folder list wrap instead of squeezing.

## Folders

Folders keep a long list tidy. A project is in one folder at most, and folders are one level deep.

- The list on the left shows **All projects**, **No folder** and each folder with its project count. Click one to show only those projects.
- Use the folder menu at the bottom of a card to **move the project to a folder**. Choose **New folder…** to start a new one: a dialog asks for its name. A folder exists as long as at least one project is in it.
- With a folder selected, a project you create or import goes into that folder, and **Start a new project** has it chosen in its **Folder** menu (change it there if you like). With **All projects** or **No folder** selected it starts in *No folder*.
- With a folder selected, the pencil **renames** it and the bin **deletes** it (both ask in a dialog). Deleting a folder never deletes projects: they just go back to *No folder*.

## Tags

Tags are short free-text labels, up to 20 per project and 40 characters each.

- Click **+ tag** on a card, type a tag and press <kbd>Enter</kbd> (<kbd>Esc</kbd> cancels). Tags you've used before are suggested. Click the **×** on a tag to remove it.
- The tag row at the top lists every tag in use with a count. Click one to show only projects with that tag, and click it again to clear it.

Folders and tags belong to the project record on the server, not to the project file, so they don't appear in exports, package files or the revision history.

## Who sees what

You see your own projects and the ones other people have invited you to collaborate on (their cards say *shared with you by* and the owner's name; see [Inviting people](live-editing#inviting-people)). Staff with power-user access can toggle the power-user view (the suite's shared shortcut, shown in a banner as **F9**) to see and open every project; the server checks that access again. In that view you can also file and tag other people's projects.`
  },
  {
    id: "interface",
    title: "The editor at a glance",
    group: "Getting started",
    summary: "Top bar, tools, Layers and Assets, canvas, Inspector, bottom tabs, arranging the panels, and Preview.",
    keywords: "layout panels toolbar inspector layers dock undock float floating window drag tab rearrange move panel reset layout ui top bar save live history undo zoom preview debug tabs tour",
    body: `![The editor with a project open.](help/editor-overview.png)

## Top bar
From left to right:

- **All projects** (the house): back to the projects page.
- The **project name**. Click to rename.
- The save state: **Saved**, **Saving…**, **Unsaved** or **Save failed** (hover it for the reason).
- **Live**: the project's live connection, **Live**, **Reconnecting** or **Deleted**. When other people are in the project too, their initials show beside it. See [Live editing and saving](live-editing).
- **Revision history** (the clock): earlier saved versions of the project.
- **Undo** and **Redo**.
- Zoom: **−**, the percentage (click it to fit everything) and **+**.
- **Preferences** (the gear, with the version **(i)** icon in its title bar) and **Help**.
- **Preview**, then **Export** (a menu of files to download, see [Exporting](export)) and **Share** (a menu: **Share link**, **Invite to collaborate**, **Save as template** and **Share for review**, see [Sharing](export#sharing)). Once the project has [themes](themes), a theme box shows in the bar too.

## Tool bar (left edge, unless you move it)
**Select** and **Hand** at the top, then the tools in groups you can fold and open with one click on their name: **Shapes** (artboard, frame, rectangle, ellipse, polygon, star) and **Draw** (line, pen, pencil, bend) start open; **Media** (text, script layer, shader layer, video, image), **Web** (button, input, link, embed, Add question) and **Rig** (bone, show/hide bones) start folded. The editor remembers which groups you keep open, and a folded group still shows the tool you're using. The **Comment** tool (<kbd>C</kbd>) sits below the groups: it pins a review note where you click, see [Review comments](comments). **Help** is at the bottom. Hover a tool to see its name and shortcut: **Select**, **Hand**, **Artboard**, **Frame**, **Rectangle**, **Ellipse**, **Polygon**, **Star**, **Line**, **Pen**, **Pencil (freehand)**, **Bend**, **Text**, **Script layer**, **Image**, then **Button**, **Input field**, **Link**, **Embed (HTML or iframe)** and **Video**. See [Shapes and paths](shapes), [Shape morphing and the Bend tool](shape-morphing), [Web elements](web-elements) and [Script layers](script-layers).

## What the pointer shows
The pointer says what a press will do. Over a selected layer it is the **move** cross; over a resize handle it is the double arrow along the way that handle drags, turned with the layer if the layer is turned; just outside a corner it is the **rotate** arrows, turned to sit round that corner; over a gradient handle an open hand; over an artboard's name the move cross. In point-edit mode a point shows the move cross and the outline shows an arrow with a **+** (double-click adds a point there). The Pen is a nib (with a ring over the first point, where a click closes the shape), the Pencil a pencil, the Hand an open hand that closes while you pan, and the Bone tool a crosshair (with a ring over a tip, which continues the chain). Edges between panels show the resize arrows, the timeline's empty lanes and ruler show a sideways arrow (a press scrubs), and a port in the interaction graph shows a crosshair.

When pressing will ask you something first, a note beside the pointer says so before you press: over a rectangle, ellipse, polygon or star the **Bend** tool says it will ask to turn it into a path, and dragging layers over another artboard says letting go will offer to move them there.

## Left panel
Four tabs:

- **Layers**: every artboard in the project, with its layer tree. Click to select, drag to reorder or nest, hover for the lock and the eye. See [Layers, hidden and locked layers](layers-panel).
- **Assets**: images, video, audio, fonts and data files in the project. See [The Assets panel](assets).
- **Libraries**: components and styles shared between projects. See [Libraries](libraries).
- **Comments**: the review notes pinned on the project, with filters. See [Review comments](comments).

Drag the left and right panels' inner edges (beside the canvas) to make them wider or narrower; double-click an edge to put it back. With an edge focused, the arrow keys move it (<kbd>Shift</kbd> for bigger steps). The widths are remembered in this browser.

## Canvas
All artboards side by side. See [Moving around the canvas](canvas). Right-click for menus: see [Layers, hidden and locked layers](layers-panel#right-click-menus).

## Inspector (right)
Settings for the selection. A layer's settings start with **Layer** (name, position, size, visibility, blend), then a section named after its kind (**Path**, **Text**, **Image**...) with what only that kind has. Click a section's title to fold it away or open it again; the arrow beside the title points down when it's open and right when it's folded. With several layers selected, the bar of align buttons at the top lines them up. With nothing selected, or just an artboard, it shows the artboard and its **Responsive**, **Steps**, **Joysticks**, **Blends** and **Bones** sections, then the **Project** settings and the **Fonts**. The chain between **W** and **H** (and between **Sx** and **Sy**, and on an artboard's size) links the two: linked, changing one changes the other and keeps their ratio, and the canvas's resize handles keep it too (hold <kbd>Shift</kbd> to resize freely). Each layer remembers its own. The Inspector starts 320 px wide. Section titles with a **?** link to the page in these docs, and the diamonds beside fields key them on the timeline.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables**, **Data**, **Accessibility**, **Insights**, **Public interface**, **Themes** and **Usage**. A project made from a template also has a **Checklist** tab. Click a tab to open it, click the open one again to fold the bottom panel down to its tabs, and drag the top edge to resize. Each has its own page: [Timelines](timelines), [Interactions](interactions), [Scripts](scripts), [Variables](variables), [Data sources](data-sources), [Accessibility checker](accessibility-checker), [Insights](insights), [Public interface](public-interface), [Themes](themes), [Usage](usage) and [Templates](templates#use-a-template).

## Arranging the panels
Every panel can go anywhere: the left, right or bottom area, or a window of its own floating over the canvas. Drag a panel by its tab.
- Onto another area's tabs: it docks there, in the gap you drop it in (a line shows where). Drag along its own tabs to change their order.
- Onto the canvas: it opens in its own window there (an outline shows where). While you drag, **Dock left**, **Dock right** and **Dock at the bottom** strips appear on the canvas's edges, so an area can be docked into even when nothing is in it yet.
- Onto a floating window's tabs: it joins that window.

A floating window moves by its title bar and resizes from its bottom-right corner. Its **×** closes it and sends its panels back to where they started. An area nothing is docked in takes no room.

Right-click a tab for **Dock on the left / right / at the bottom**, **Float in its own window** and **Reset panel layout** (everything back where it started). Right-click the tool bar to put it **On the left**, **On the right** or **Floating** (drag a floating tool bar by the strip along its top). The layout is remembered in this browser. Whatever opens a panel for you (choosing a timeline, **Edit** on an interaction) shows it wherever it is, and the timeline's keyframing follows whether the Timeline panel is on screen.

## Preview
**Preview** runs the project exactly as the exported file will, from the start artboard or the one you're on (the dropdown at the top). **Restart** starts again, and <kbd>Esc</kbd> closes it. The **Debug** panel (on by default) shows:

- **Now showing**: the artboard on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables (live)**: every value as it changes. Type a new value and press <kbd>Enter</kbd> (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too, and so are errors from script layers. With **Auto-scroll** ticked (the default) the list keeps the newest event in view; untick it to read back through earlier ones while the preview keeps running.

![The Preview with the Debug panel: live variables on the left and the Events list underneath.](help/preview-debug.png)

When the project has [responsive artboards](responsive), a **Page width** slider appears under the top bar. Drag it to resize the page the project runs in; the breakpoints are marked on the track and the player switches artboard as you cross them.`
  },
  {
    id: "canvas",
    title: "Moving around the canvas",
    group: "Getting started",
    summary: "Zoom, pan, fit, and the wheel preference.",
    keywords: "zoom pan scroll wheel trackpad pinch fit hand space middle mouse ctrl",
    body: `| Do this | To |
|---|---|
| Scroll the mouse wheel | Zoom in and out around the pointer (default) |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + wheel, or pinch on a trackpad | Zoom (always) |
| <kbd>Shift</kbd> + wheel | Pan sideways |
| Hold <kbd>Space</kbd> and drag, or drag with the middle button | Pan |
| <kbd>H</kbd> | Hand tool (drag to pan) |
| <kbd>Shift</kbd>+<kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to the selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |

## Big projects and artboard pictures
Artboards you aren't working on are shown as a *still*: a picture of themselves. That keeps panning and zooming smooth in projects with many artboards. Click an artboard (or a layer in it) and it comes alive for editing. The still updates by itself shortly after anything in it changes, so you never need to refresh it. If an artboard looks slightly soft while you pan, that is the still; click it to see it sharp. Stills are kept in this browser between sessions, so a big project opens with its artboards already showing instead of filling in one by one. An artboard that was changed since (by you or someone else) is just drawn again. While a project with several artboards opens, the canvas waits for the artboards in view (a moment) and then fades them in together.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.`
  },
  {
    id: "preferences",
    title: "Preferences",
    group: "Getting started",
    summary: "Your own editor settings: wheel, theme, default font, rulers, tooltips, layers outside clipped artboards.",
    keywords: "settings options wheel tooltips",
    body: `![The Preferences dialog.](help/preferences.png)

Open **Preferences** from the gear in the top bar (or on the projects page). They are yours: saved with your account, so they follow you to any browser you sign in on. The small **(i)** icon in the title bar shows the version of Interactives you are running when you hover it (for example \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`: the release, then the editor build and the player build), and copies it when you click it. It is the first thing to put in a problem report, and the same icon is beside **Help** on the help and projects pages.

- **Mouse wheel**: *Zoom (Shift+wheel pans)* or *Pan (Ctrl+wheel zooms)*. See [Moving around the canvas](canvas).
- **Theme**: *Dark*, *Light*, or *Auto (follow the system)*. Both are made from the StudyDesk palette (the same colours as the rest of the Toolbox): its greys, its blue for selection and focus, and UniSQ gold on primary buttons, the open tab and the line under the top bar. In Light, the palette's grey for secondary text is a little under the usual contrast guideline (4.4:1 on panels, 4.1:1 on the background, against 4.5:1); it is left as the palette has it so the editor matches the Toolbox.
- **Workspace** (in the editor only): switch every panel's place in one go. **Standard** is where everything starts; **Animate** has a tall timeline; **Interactions** has a big interaction graph with Variables and Scripts beside the properties; **Big canvas** puts all the panels in one column on the right and folds the bottom away; **Review** opens Comments and the accessibility checker. **Save current layout as…** keeps the way you've arranged things (see [Arranging the panels](interface#arranging-the-panels)) under a name of your own, up to 12, with rename and delete beside each. Saved workspaces follow you to any browser you sign in on.
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. It is Open Sans unless you change it. Click the box and type to search every Google font (the chips narrow it by Sans, Serif, Display, Handwriting or Mono), then pick one with <kbd>Enter</kbd> or a click; <kbd>Esc</kbd> closes the list. A name that isn't on the list can be used as typed. It applies to projects and text you make from now on, not to ones that exist.
- **Show rulers**: rulers and guides on the canvas (also <kbd>Shift</kbd>+<kbd>R</kbd>).
- **Show layers outside clipped artboards**: on by default. When an artboard has **Clip content to artboard** on, the parts of layers that hang outside it are drawn faintly, in diagonal stripes, beside it on the canvas, so you can still see them and click them to select. It is only how the canvas looks: Preview and exports still clip. Switch it off if the faint shapes get in the way.
- **Show tooltips**: explanations when you hover buttons and fields.
- **Accessibility features**: on by default. Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements while you Preview (and in the exports you make, which always keep them on). Switch it off to check whether a problem comes from it. See [Accessibility](accessibility).
- **Recording**: there is none to set. See [What the editor records](what-is-recorded).
- **Screen reader strip**: off by default. A strip under Preview that shows what a screen reader would be told by Announce nodes, as it is spoken. It only shows while Accessibility features is on. The same switch is in the Preview header, next to Accessibility.

Press <kbd>Esc</kbd> or the **×** to close. Project-wide settings (start artboard, fit, sandbox) are in the inspector with nothing selected. See [Project settings](project-settings).`
  },
  {
    id: "what-is-recorded",
    title: "What the editor records",
    group: "Getting started",
    summary: "The editor records how it is used, and its errors, to make it better. What is kept, what never is, and that there is no off switch.",
    keywords: "privacy analytics tracking data collected telemetry usage statistics errors bugs opt out consent record",
    body: `The editor records how it is used, and the faults it runs into, so that the people who make it can see what is used, what gets in the way and what breaks. **This is always on. There is no setting to turn it off.** It goes into the same StudyDesk analytics as the other Toolbox tools.

## What is recorded

- **That you were here**: a visit started, how long you were actively working (time with the tab showing and something being done), your browser and its version, your operating system and a rough window size.
- **Which parts you use**: the tool you pick and how long you stay in it, which panels and tabs you open, which layers you add (by kind: rectangle, text, button...), which properties you change (by name: *fill*, *opacity*...), and the bigger features you use (questions, steps, drag and drop, captions, responsive sets, the public interface, libraries, accessibility fixes, sharing).
- **Imports and exports**: the file type (*svg*, *riv*, *psd*...), how big it was, and whether it worked. For an export, the kind of file and its size.
- **Help**: which help topics you open, and how many words a search had and whether anything matched.
- **Previews**: that you opened one, and how long the project took to start.
- **Which parts of the server were called**, with the ids taken out (*projects/:id/comments*), how long they took, and the ones that failed.
- **Faults**: when something breaks (an error in the page, a part of the editor that stopped, a failed save, a file that could not be imported, a script or shader layer that failed), a short description of the error with anything in quotes, web addresses and long numbers taken out, which part it happened in, the browser, and the editor version.
- **Who and which project**: the rows carry your StudyDesk username and the id of the project you had open, like every other Toolbox analytics row.

Nothing is sent for every click. Events are added up and sent about once a minute, as a count with the time spent.

## What is never recorded

- Anything you type: text in layers, names of projects, layers, variables, artboards, libraries or files, search words, comments, captions, code, shader code.
- The contents of your projects, your images and your files. Only the *type* of a file you import or export is kept, never its name.
- The values you give properties (only that you changed *fill*, not to what).

## Published projects

A project shown through the **Link for StudyDesk** (in the Share link dialog) also reports how it ran: how long it took to show, and any script, shader, picture or data fault, with a short scrubbed description and the player version. This is for fixing bugs. This part records nothing a learner did or typed. What learners do (artboards reached, clicks, steps, answers) is a separate thing that you can read and switch off in the project, see [Insights](insights). A project exported as a file, or opened through the plain *Share link*, sends nothing anywhere.

## Who sees it

The people who make the product, as counts and lists of errors. If you are one of them, power user mode (**F9** on the projects page) has a *Usage and errors* page.`
  },
  {
    id: "dialogs",
    title: "Dialogs and confirmations",
    group: "Getting started",
    summary: "The editor asks in its own dialogs, not the browser's pop-ups: what they look like, which keys work, and when you will see one.",
    keywords: "dialog confirm prompt alert popup modal ok cancel enter escape delete are you sure danger red button link embed new folder rename move",
    body: `Whenever the editor needs an answer from you, it shows a dialog on top of the page. They look the same everywhere and work with the keyboard.

![A confirmation dialog.](help/move-to-artboard.png)

## How they work
- The **dialog** dims the page behind it. Nothing else can be clicked until you answer.
- <kbd>Enter</kbd> presses the main button. <kbd>Esc</kbd> cancels. <kbd>Tab</kbd> moves between the buttons and stays inside the dialog.
- A **red** main button, such as **Delete project**, means the action destroys something. Read the message first.
- Some dialogs have a text box, such as **New folder**. It is selected for you, so you can type straight away. If a name isn't allowed, a message under the box says why.
- Dialogs queue up: if two are needed, you get one after the other.
- None of them are the browser's own pop-ups, so they aren't blocked and they keep the editor's look.

## Where you'll see them
| Dialog | When |
|---|---|
| **Delete project**, **Delete folder** | On the projects page: delete a project (which can't be undone) or a folder (its projects are kept) |
| **New folder**, **Rename folder** | Moving a project to **New folder…**, or renaming with the pencil |
| **Move to artboard** | You dropped layers over a different artboard. See [Layers](layers-panel#moving-layers-to-another-artboard) |
| **Delete asset**, **Delete N assets**, **Remove unused assets** | Deleting from the [Assets panel](assets) or the [Usage](usage) tab. They list the files and warn about any still in use |
| **Delete timeline**, **Delete script** | The bin beside a timeline or script |
| **New variable** | Choosing **+ Create new variable…** in a node's settings |
| **Restore version** | Restoring from the [revision history](live-editing#revision-history) |
| **Turn off share link** | Stopping a [share link](export#share-link) |

The **Import design file** dialog has a **Link** / **Embed** switch for each file, plus **Embed all** and **Link all** buttons and **Cancel**. Files that can only be embedded (and every file in a browser without file linking) say so under their name. The dialog remembers your last choice.`
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    group: "Getting started",
    summary: "Every keyboard shortcut in the editor.",
    keywords: "keys hotkeys keyboard",
    body: `## Tools
| Key | Tool |
|---|---|
| <kbd>V</kbd> | Select |
| <kbd>H</kbd> | Hand (or hold <kbd>Space</kbd>) |
| <kbd>A</kbd> | Artboard |
| <kbd>F</kbd> | Frame |
| <kbd>R</kbd> | Rectangle |
| <kbd>O</kbd> | Ellipse |
| <kbd>L</kbd> | Line |
| <kbd>P</kbd> | Pen |
| <kbd>N</kbd> | Pencil (freehand) |
| <kbd>W</kbd> | Bend (drag an edge into a curve) |
| <kbd>T</kbd> | Text |
| <kbd>B</kbd> | Button |
| <kbd>C</kbd> | Comment (pin a review note where you click) |

## Editing
| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy / cut / paste (pasting image files inserts them) |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all on the artboard |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection (or the selected keyframes) |
| Arrow keys (<kbd>Shift</kbd> for 10px) | Nudge |
| <kbd>Alt</kbd>+arrow keys | Move the selected layer in the Layers list: up or down past a neighbour, right into the group above, left out of its group |
| <kbd>]</kbd> / <kbd>[</kbd> | Bring forward / send backward (<kbd>Ctrl</kbd> for front / back) |
| <kbd>Enter</kbd> | Go into a group or frame, edit a path's points, or edit text |
| <kbd>Escape</kbd> | Stop editing, go up a level, clear the selection, then back to Select |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save now |

## View
| Key | Does |
|---|---|
| <kbd>Shift</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |
| <kbd>Shift</kbd>+<kbd>R</kbd> | Show or hide rulers |

## Help
| Key | Does |
|---|---|
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> | Search the help (<kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to open) |
| <kbd>?</kbd> | Open the help |

## Text
Double-click a text layer to edit it. Select some of the text, then:

| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Bold / italic / underline the selection |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | Strikethrough |
| <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Finish editing |

(Use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd> on a Mac.)

## Interactions, dialogs and Preview
| Key | Does |
|---|---|
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | Delete the selected node or connection in the graph |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate the selected node |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy, cut or paste the selected node in the graph (it pastes into another artboard's graph too) |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> | Accept / cancel a [dialog](dialogs) |
| <kbd>Esc</kbd> | Close the Preview, Preferences or any open box |

## Mouse
| Do this | To |
|---|---|
| Hold <kbd>Alt</kbd> while drawing or resizing | Work from the centre |
| Hold <kbd>Ctrl</kbd> while dragging | Move without snapping |
| <kbd>Alt</kbd>-click a path point | Switch it between curve and corner |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>-click a layer | Select the deepest layer inside groups |
| Double-click a group | Select inside it |

While dragging: <kbd>Shift</kbd> keeps proportions or snaps angles, <kbd>Alt</kbd> resizes from the centre. In number fields, drag the label to scrub (<kbd>Shift</kbd> ×10, <kbd>Alt</kbd> ×0.1), use arrow keys to step, or type sums like \`100/2\`.`
  },
  // ---------------------------------------------------------------- design
  {
    id: "artboards",
    title: "Artboards",
    group: "Design",
    summary: "Screens with their own size, background, timelines and interactions.",
    keywords: "screen page scene size background start preset duplicate delete move resize clip",
    body: `An artboard is one screen of the interactive. Each has a size, a background, its layers, its timelines and its interactions. Variables, scripts, data and assets belong to the whole project and are shared.

- Make a new one with the **Artboard** tool (<kbd>A</kbd>), the **+ Add artboard** button at the bottom of the **Layers** panel, or by right-clicking empty canvas and choosing **New artboard here**.
- Click an artboard's name above it on the canvas, or its row in the **Layers** panel, to select it. Drag the name to move the artboard around the canvas, and drag its corners to resize it.
- With an artboard selected, the Inspector shows **Name**, **W** and **H** (and **Size presets…** such as Desktop, Tablet or Phone), **Background**, **Clip content to artboard** (the parts of layers outside it still show faintly on the canvas, see [Preferences](preferences)), **Make start artboard**, **Duplicate artboard** and **Delete artboard**. Then come its **Joysticks** and **Blends**, the **Project** settings and the **Fonts**.
- The **start artboard** is the one the player shows first. It has a **start** badge in the Layers panel. Use **Make start artboard** (also in the right-click menu) to change it.
- Drag layers and let go over another artboard and you're asked whether to move them there. See [Moving layers to another artboard](layers-panel#moving-layers-to-another-artboard).
- To show a different arrangement of an artboard on narrow or wide pages, add a variant: see [Responsive artboards](responsive).
- Move between artboards at runtime with the **Go to artboard** action (with a transition) or \`ix.goTo('Name', 'fade')\`.
- An artboard can also be placed inside another as an [instance](instances), like a reusable component. The **Use in** menu in the Inspector does it in one step.
- To bring a design file in as an artboard, see [Importing](import).`
  },
  {
    id: "layers-panel",
    title: "Layers, hidden and locked layers",
    group: "Design",
    summary: "The Layers panel, hiding and locking layers, ghosts and badges on the canvas, moving layers between artboards, and right-click menus.",
    keywords: "layers panel tree select rename reorder drag hide show hidden visible eye lock locked unlock ghost badge quick unlock move to artboard another artboard context menu right-click order group solo",
    body: `The **Layers** tab in the left panel lists every artboard in the project, with each artboard's layers beneath it, front-most first.

![The Layers panel. Sun is hidden, so its name is faded. Backdrop is locked.](help/layers-panel.png)

## Working with the list
- Click a layer to select it. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) or <kbd>Shift</kbd> and click to select several.
- Click the arrow beside a group, a frame or an artboard to open or close it. The artboard marked **start** is the one the player shows first.
- Double-click a name to rename it. <kbd>Enter</kbd> finishes and <kbd>Esc</kbd> cancels.
- Drag a row to reorder. A line shows where the layer will land, and how far it is indented shows which list it joins. Over the top or bottom third of a row the layer goes before or after it. Over the middle of a group or frame row the group is outlined and the layer goes inside it, at the front.
- Where a group ends, move the pointer left to drop the layer under the group instead of inside it: the line steps out one level for each step left. The empty space under the last row is the end of the list, so you can always drop at the very bottom without landing in a group that happens to be last. Drop on the artboard's own row to bring the layer to the top level, in front.
- From the keyboard, select one layer and press <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Down</kbd> to step it past a neighbour (and out of its group at the end), <kbd>Alt</kbd>+<kbd>Right</kbd> to put it inside the group just above it and <kbd>Alt</kbd>+<kbd>Left</kbd> to take it out, under that group.
- **+ Add artboard** and **+ Import file as artboard** are at the bottom. See [Artboards](artboards) and [Importing](import).

## Hide and lock
Hover a row and two small buttons appear at its right: a padlock (**Lock** / **Unlock**) and an eye (**Hide** / **Show**). They stay visible for any layer that is locked or hidden. The **Visible** and **Locked** ticks in the Inspector do the same.

- **Hidden** layers are not drawn by the player or in Preview. In the editor they show as a faint **ghost** on the canvas, so you can still see where they are and pick them. Their names are faded in the Layers panel. Hide a mask layer and its clipping stops.
- **Outside a clipping artboard**: when an artboard has **Clip content to artboard** on, the part of a layer that hangs past its edge is also drawn as a faint, diagonally striped ghost on the canvas, and clicking it selects the layer. Preview and exports still cut it off. You can switch this off in [Preferences](preferences).
- **Locked** layers can't be selected or moved by clicking on the canvas, so a backdrop never gets in your way. You can still select one in the Layers panel and edit it in the Inspector.
- A layer that is hidden only because its parent is a [Solo group](groups-frames#solo-groups) and it isn't the active child looks the same. Its eye says **Hidden by Solo on …: show this one instead**, and pressing it makes it the active child.

### Quick badges on the canvas
With the **Select** tool, move the pointer over a ghost or over a locked layer. A small badge appears at the top right of the layer:

- an eye with a line through it: click to **show** the layer;
- a padlock: click to **unlock** the layer.

Clicking selects the layer afterwards, ready to edit.

![A hidden layer (the faint circle) with its Show badge.](help/hidden-layer-ghost.png)

![Hovering the locked backdrop shows an Unlock badge at its top right.](help/locked-layer-badge.png)

## Moving layers to another artboard
Select layers and drag them on the canvas. If you let go over a **different artboard**, a dialog asks **Move to artboard**: *Move “Card” to the artboard “Menu”?* Press **Move** to do it or **Cancel** to put them back.

![The Move to artboard dialog.](help/move-to-artboard.png)

- The layers keep their place on the canvas, but now belong to the other artboard.
- Their keys in the old artboard's timelines are removed.
- Interactions in the old artboard that used them will need fixing. The [Usage](usage) tab's **Broken** list shows exactly which.

## Right-click menus
- **A layer**: **Cut**, **Copy**, **Paste**, **Duplicate**, **Delete**, **Order** (**Bring to front**, **Bring forward**, **Send backward**, **Send to back**), **Group**, **Ungroup**, **Combine shapes** (union, subtract, intersect, exclude), **Hide** or **Show**, **Lock**, **Add interaction** (**On click…**, **On hover…**) and, for text, buttons and links, **Edit text**. The shortcuts are shown beside each item.
- **An artboard**: **New** (a menu of layers to add where you clicked), **Paste**, **Make start artboard**, **Duplicate artboard**, **Zoom to artboard** and **Delete artboard**.
- **Empty canvas**: **New artboard here**, **Paste**, **Zoom to fit everything**, **Show rulers** or **Hide rulers**, and **Help**.`
  },
  {
    id: "shapes",
    title: "Shapes and paths",
    group: "Design",
    summary: "Rectangles, ellipses, polygons, stars, lines, the pen and the pencil, and editing points.",
    keywords: "rectangle ellipse circle polygon star line pen pencil freehand bezier vertices points path draw",
    body: `Pick a tool and drag on an artboard. Hold <kbd>Shift</kbd> for squares, circles and 45° lines, and <kbd>Alt</kbd> to draw from the centre. A single click makes a default-sized shape.

## Pen (P)
Click to add corner points, drag to add smooth points with handles. Click the first point to close the shape, or press <kbd>Enter</kbd>/<kbd>Escape</kbd> to finish an open path.

## Pencil (N)
Draw freehand. The stroke is smoothed into a few bezier curves when you let go. End where you started to make a closed, filled shape.

## Editing points
Select a path and press <kbd>Enter</kbd> (or double-click). Drag points and handles, click a point and press <kbd>Delete</kbd> to remove it, and <kbd>Alt</kbd>-click a point to switch it between a curve and a corner. <kbd>Escape</kbd> or <kbd>Enter</kbd> finishes. Double-click the outline to add a point. Drag an edge with the Bend tool (<kbd>W</kbd>) to curve it, and animate points to morph the shape: see [Shape morphing and the Bend tool](shape-morphing).

## Shape settings
- **Rectangle** (and **Frame**): corner radius. There are four fields, one per corner (top-left, top-right, bottom-left, bottom-right) and a padlock. Locked (the default while all four are the same), changing any field sets all four. Unlock it to give each corner its own radius, and each corner gets its own keyframe diamond so you can animate them separately. Locking again sets all four to the top-left value.
- **Polygon**: number of sides. **Star**: points and inner ratio (how deep the points are).
- **Path**: closed or open, fill rule (non-zero or even-odd for holes).
- Any shape can be a **mask** for the layers above it: tick *Use as mask* ([Groups and frames](groups-frames#masks)).

Boolean operations (union, subtract, intersect, exclude) turn several shapes into one path. See [Align, arrange and combine](arrange).`
  },
  {
    id: "fill-stroke",
    title: "Fill, stroke and effects",
    group: "Design",
    summary: "Solid, gradient and image fills; several fills and strokes per shape; strokes, dashes and trim; feather and drop shadows; shadow, blur and blend modes.",
    keywords: "colour color palette swatch preset toolbox brand gradient linear radial image fill stroke border dash cap join align inside outside shadow blur blend opacity trim path layers several multiple feather glow drop shadow eye hide reorder",
    body: `## Fill
Choose the type from the dropdown at the top of a fill: **None** (removes it), **Solid**, **Linear gradient**, **Radial gradient** or **Image** (cover, contain or fill). For a gradient, set the colour and position of each stop, press **+ Add stop** for more, and set the **Angle** of a linear one. Colours accept hex, \`rgb()\`, \`hsl()\` and names; the number box beside a colour is its opacity.

#### Exact gradient points
By default a linear gradient runs corner to corner along its angle, and a radial one from the middle of the layer to its farthest corner, so both stretch with the layer. **Set start and end points** (linear) or **Set centre and radius** (radial) pins the gradient to numbers instead: **From** and **To** (or **Centre** and **Radius**) in pixels from the layer's top-left corner. Pinned gradients stay where they are when the layer is resized, which is how Rive and Lottie place them. With the layer selected, the points also show on the canvas as dots joined by a dashed line (a radial one has a dot at its centre and one on its radius): drag them. **Use angle instead of points** (or **Use the box…**) goes back to the stretching kind. Points can be animated like any other number: choose \`Fill gradient start X\`, \`Fill gradient end Y\`, \`Fill gradient centre X\`, \`Fill gradient radius\` and so on in a timeline (the same for strokes and for the later fills), and a gradient stop's colour and position as \`fill.stops.1.color\` or \`fill.stops.1.offset\`. While recording, dragging a point on the canvas makes the keyframe.

### Toolbox palette
The small arrow beside every colour box (fills, strokes, gradient stops, text colours, variables, styles) opens the StudyDesk toolbox palette: the brand colours, greys, link and status colours, feature colours and gradient stops used across the suite. Hover a swatch for its name. A colour is named after its property (\`--ilar-swatch-yellow-dark\` is *Yellow dark*) unless the stylesheet gives it a name with a comment of three stars each side, \`/***name: Gold***/\`, written after the declaration on the same line, or on its own line just above it; the property name is still shown beside it. Picking one sets an ordinary colour on the layer (opacity is kept), so exports never depend on the palette. The palette is read from the toolbox's \`/styles/palette.css\` (or the minified \`palette.min.css\`, which has the colours but not the names, because minifying removes comments) when the editor opens, so changes to it appear after a reload. Where that stylesheet isn't available (a copy running outside the suite) the arrow simply isn't shown.

## Several fills and strokes
A shape can have as many fills and strokes as you like. The **+** in the **Fill** or **Stroke** header adds one on top of the others; the list shows the front-most first, like the layers panel. Each entry has:

- an **eye** to hide it without removing it, **↑** and **↓** (or drag its heading) to change the order, and a **×** to remove it;
- its own paint (solid, gradient or image) and, for a stroke, **W**idth, **Dash**, **Trim**, **Cap**, **Join** and **Align** (centre, inside or outside the outline; boxes default to inside, vector shapes to the centre);
- **α** (the opacity of that paint alone), **Blend** (how it mixes with what is under it), **Feather** (a soft blur of that paint, in pixels) and an **X / Y** offset.

Fills are drawn under strokes unless you change the paint order (below). Layers are numbered from the bottom: **Fill 1** is the shape's own fill (the one \`fill.color\` and a style refer to), **Fill 2** the next, and so on.

Some things to build with it:

- **Layered gradients**: a solid fill under a see-through gradient with **Blend** set to *multiply* or *overlay*.
- **An outline plus a glow**: a thin dark stroke over a wide, see-through stroke with a **Feather**.
- **A drop shadow that follows a shape's fill or stroke**: add a fill, make it dark and see-through (alpha in its colour or **α**), set **Feather** to 12 or so and **Y** to a few pixels, and move it down the list so it sits under the real fill. It is the way a Rive drop shadow is built, and Rive files import that way.

Each paint's numbers can be animated: look for the diamond next to a field. The property names are \`fill.opacity\`, \`fills.0.color\`, \`fills.0.opacity\`, \`fills.0.feather\`, \`fills.0.offsetX\`, \`strokes.0.width\`, \`strokes.0.paint.color\`, \`strokes.0.trimEnd\` and so on (\`fills.0\` is the second fill, \`strokes.1\` the third stroke); bindings, **Set property** nodes and scripts use the same names. A shape with one plain fill and stroke is drawn as before; a shape with layers, or with opacity, blend, feather, an offset, a cap, join or align on a paint, is drawn as SVG. Buttons and inputs draw only their first fill and stroke. Lottie export keeps every fill and stroke with their opacity, and leaves out the blend modes, feathered and offset paints (shadows), which Lottie cannot hold.

### Paint order
Some shapes need a stroke *under* a fill, or between two fills: an outline that shows only where a fill leaves it uncovered, or a fill that overlaps the inner half of its own stroke. Select one shape that has both a fill and a stroke and a **Paint order** section appears under **Stroke**, listing every paint in one list, front-most first (buttons and inputs, and several layers selected at once, don't have it). Press **↑** or **↓**, or drag a row, to move a paint in front of or behind the others. Each row shows a swatch and what the paint is (its colour, the kind of gradient, a stroke's width). Moving a fill past another fill swaps those two fills, so the numbers stay where they are while their colours trade places; the list in the **Fill** section follows. The moved row is highlighted and the arrow you pressed keeps the keyboard focus, so pressing it again keeps moving the same paint. A shape you have not reordered keeps all its fills under all its strokes, as before.

![Paint order of a shape with one fill and two strokes: the wide red stroke is moved under the yellow fill, so only its outer half shows. The list reads Stroke 2, Fill, Stroke 1 from the front.](help/paint-order.png)

![Pressing the arrows in the Paint order list: the wide stroke goes under the fill and comes back, and the picture follows.](help/paint-order-reorder.mp4)

On a frame, rectangle or ellipse the strokes that end up in front of the last fill are still drawn above the shape's children; strokes placed under a fill are drawn under the children with it. In a saved project the order is the shape's \`paintOrder\`, a list of \`"fill"\` and \`"stroke"\` entries from the bottom up (for example \`["fill", "stroke", "fill"]\`); it is left out when every fill is under every stroke. Rive files import with the order they were drawn in, and Lottie export follows it.

## Stroke
Colour, width, **cap** (butt, round, square), **join** (miter, round, bevel), **align** (centre, inside, outside) and **dash** (e.g. \`8 4\` for 8 on, 4 off).

### Trim path
The **Trim** row in the Stroke section has a start (**Trim**), an end (**to**) and an offset (**Off**), all 0–100%. They draw only part of a stroke. Animate the end (the *Trim end %* property) from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
Use **+** in the **Effects** section to add a shadow or a layer blur; each one has a **×** to remove it.

- **Shadow**: **X**, **Y**, **Blur**, **Spread** and **Colour**. Tick **Inner** to draw the shadow inside the shape instead of behind it.
- **Layer blur**: blurs the whole layer by an **Amount** in pixels.
- **Shader filter** (image layers only): draws the picture through a GPU shader, such as wave distortion, CRT scanlines, halftone dots or film grain. See [Shader layers](shader-layers#shader-filter-on-an-image).

Two related settings are in the **Layer** section at the top of the Inspector, with the position fields:

- **α** is the opacity of the whole layer (0 to 1).
- **Blend** is how the layer mixes with what is under it: *Normal*, *Dissolve*, *Darken*, *Multiply*, *Colour burn*, *Lighten*, *Screen*, *Colour dodge*, *Add (linear dodge)*, *Overlay*, *Soft light*, *Hard light*, *Difference*, *Exclusion*, *Hue*, *Saturation*, *Colour* or *Luminosity*. **Dissolve** draws each pixel either solid or not at all, with the layer's opacity as the odds: at 40% opacity, 40% of the pixels show at full strength, scattered, instead of everything fading. Animate the opacity for a speckled fade in or out. A single fill or stroke (in the paint list) can use every mode except Dissolve.

Most of these can be animated: look for the diamond next to a field. See [Animatable properties](animatable-properties).`
  },
  {
    id: "text",
    title: "Text",
    group: "Design",
    summary: "Text layers, fonts, sizing and live values in text.",
    keywords: "font typography type size weight align template variables google fonts upload rich text runs bold italic underline selection range several styles",
    body: `Use the **Text** tool (<kbd>T</kbd>): click for text that grows as you type, or drag a box for wrapping text. Double-click text to edit it, and <kbd>Escape</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

- **Sizing**: *Auto width* (one line, grows sideways), *Auto height* (fixed width, wraps and grows down) or *Fixed* (you set both). With *Fixed*, **Overflow** says what happens to lines that don't fit: *Show* them anyway, *Clip* them at the box, or cut the last line that fits with an *Ellipsis …*. Untick **Wrap lines** to keep the lines as written (long ones run on, or are clipped or cut by the overflow setting).
- **Animating the box**: a text layer's **Height**, **Width** and **Origin X / Y** can be keyed in a timeline like any other layer's. With *Fixed* sizing a changing height clips or ellipsises the lines that no longer fit, and the vertical alignment keeps following the box. *Auto width* and *Auto height* text work their size out from the text, so keys on the size they work out have no effect. **Origin Y** moves the pivot of the layer's turn and scale (0 top, 1 bottom).
- **Font**: a search box over every Google font. Click it and type to filter ("playf" finds Playfair Display), then use <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> or click to pick, <kbd>Esc</kbd> to close. Each row is drawn in its own font. The chips above the list narrow it to Sans, Serif, Display, Handwriting or Mono. The project's own fonts come first (tagged *In project* or *Uploaded*), then a few system fonts, then the rest. Picking a Google font the project doesn't have yet adds it to the project's **Fonts** with the weights the text uses, so the player and exports load it; one undo takes both back. Changing the **Weight** later loads that weight too. A name that isn't on the list can still be used as typed (it is not added to the project's fonts, so add it there if it is a Google font). A font file you upload in the [Assets panel](assets) is added to the fonts for you and shows in the list as *Uploaded*. New text starts in your [default font](preferences), Open Sans unless you changed it.
- Weight, italic, size, line height, letter spacing, alignment, vertical alignment, case and decoration.
- **Paragraph spacing**: extra space, in pixels, between paragraphs (the pieces of text between line breaks), on top of the line height. An *Auto height* or *Auto width* box grows to fit it. It does not apply to text with [modifiers](text-modifiers).

## Several styles in one text layer
Double-click a text layer to edit it. A small **toolbar floats over the text** while you do, like the one in a word processor:

![The toolbar over a text layer being edited, with "big" bold and a colour, size and link set on other words.](help/text-toolbar.png)

Select some of the text (or just put the caret in a word) and use:

- **B**, **I**, **U** and **S**: bold, italic, underline and strikethrough. A button that is lit means all the selected text has it; a button with a ring around it means only some of it does (press it to switch it on for all of it).
- **A** (colour): click it for the colour picker, or its arrow for the toolbox palette. The bar under the A shows the colour of the selection, a rainbow when it has several.
- **Size**: type a size in pixels and press <kbd>Enter</kbd>, or pick one from the list. The box is empty (it says *mixed*) when the selection has several sizes.
- **Font**: the project's fonts and the standard ones; *Mixed* when the selection has several. For any other Google font, pick it in the Inspector's **Font** field.
- **Link**: add a link to the selection, or edit the one the caret is in. Type the address (a web address, \`mailto:\` or \`tel:\`; \`example.com\` becomes \`https://example.com\`), choose whether it opens in a new tab, and press <kbd>Enter</kbd>. **Remove** takes it off. Linked text is marked with a thin line under it while you edit.
- **Tx** (clear formatting): takes every style off the selection, so it goes back to the layer's own.

With nothing selected the buttons work on the word the caret is in. Between words there is nothing to style, so they are switched off.

Shortcuts, in the text or in the toolbar (<kbd>Cmd</kbd> on a Mac): <kbd>Ctrl</kbd>+<kbd>B</kbd> bold, <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, <kbd>Ctrl</kbd>+<kbd>U</kbd> underline, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> strikethrough, <kbd>Ctrl</kbd>+<kbd>K</kbd> link (while editing text; <kbd>F1</kbd> still opens the help search), <kbd>Ctrl</kbd>+<kbd>\\</kbd> clear formatting.

The toolbar works from the keyboard too. <kbd>Tab</kbd> (or <kbd>Alt</kbd>+<kbd>F10</kbd>) goes from the text into the toolbar, the left and right arrows move along its buttons, <kbd>Enter</kbd> or <kbd>Space</kbd> presses one and puts you back in the text with the selection as it was. <kbd>Esc</kbd> also goes back to the text, and <kbd>Shift</kbd>+<kbd>Tab</kbd> from the first button does too. The toolbar sits above the text box, or below it when there is no room, and stays on the canvas. It works the same for *Auto width*, *Auto height* and *Fixed* text.

While part of the text is selected, the Font, Size, Weight, Letter, Colour, Italic and Decoration fields in the inspector change just that selection too. Select all of a layer that has no styled parts and they change the whole layer, as usual. Click outside the text to go back to styling the whole layer.

Each differently styled stretch is stored as a **run**. A run only records how it differs from the layer's own style, so changing the layer's colour or font still changes every run that doesn't set its own. You never need to see them, but the **Text runs** list is still there under **Advanced** in the inspector (closed until you open it) for fixing them by hand: edit a run's text, its styles and its link, add a run, or clear all run styling. Neighbouring runs with the same style merge by themselves. A run with a link is a hyperlink to that address in the player (links are inert while editing).

Things to know:
- The layer's **Text** field always shows the runs joined. Typing in it keeps the styling around your edit.
- Sizing, alignment, line height, case and the shadow belong to the whole layer, not to runs. Line height is one value for the whole layer, so a much bigger run makes its lines taller but not by a different multiplier.
- A **binding** on Text (or a timeline, tween or *Set property* action that sets Text) replaces the runs with that plain text for as long as it applies. Variables in braces like \`{score}\` still work inside each run, but a \`{...}\` slot should sit within one run.
- Lottie export writes the text in the layer's own style (Lottie text has one style per layer). SVG and PNG export, the player and the single-file export keep every run. Rive files with several text runs import as runs.

## Live values in text
Anything in braces is an [expression](expressions): \`Score: {score}\`, \`{name.toUpperCase()}\`, \`{items.length} items\`. Write \`{{\` for a literal brace.

To animate a text layer one letter, word or line at a time (typewriter, wave), see [Text modifiers](text-modifiers).`
  },
  {
    id: "text-modifiers",
    title: "Text modifiers",
    group: "Design",
    summary: "Animate text one letter, word or line at a time: typewriter, waves and staggered effects.",
    keywords: "text modifier animator range selector per letter word line typewriter wave stagger reveal offset start end shape randomize split chars characters",
    body: `A **text modifier** changes the letters, words or lines of a text layer inside a *range*. Slide the range along the text over time and the change travels through the text: a typewriter reveal, a wave, letters dropping in one after another. Select a text layer and open **Text modifiers** in the inspector.

## One click
- **Typewriter** adds a modifier that hides every letter, plus a timeline that slides its range off the end so the letters appear in order. The timeline plays when the artboard starts.
- **Wave** adds a modifier that lifts the letters under a smooth hump, plus a looping timeline that rolls the hump through the text.

Both create a new timeline named after the preset and open it, so you can change its length, easing or loop straight away.

## How a modifier works
- **Per**: the unit the range counts: *Letters* (spaces are skipped), *Words* or *Lines* (found from how the text wraps, so they follow the layer's width).
- **Start** and **End**: the range, as a percent of the text. **Offset** slides the whole range along the text, even past either end (-100 to 100). Keying the **Offset** is how most effects are made.
- **Shape**: how strongly units are hit across the range. *Square* hits all of them equally, *Ramp up* and *Ramp down* grow or fade across it, *Triangle*, *Round* and *Smooth* peak in the middle (*Smooth* has soft edges). *Falloff (ramps)* is Rive's range falloff: the weight climbs in a straight line from **Start** to **Ramp up to**, stays full, then falls in a straight line from **Ramp down from** to **End** (a Ramp up to at or before Start, or a Ramp down from at or after End, leaves that side a hard edge, and where the two cross the ramp up wins). Both points are percents of the text and move with **Offset**, and can be keyed. **Ease** shapes the weight.
- **Randomize** hits the units in a scrambled but repeatable order; change the **Seed** for another order.
- **Strength** is how much of the modifier applies, 0 to 100.
- The changes at full strength: **X** and **Y** move, **↻** turns and **Scale** scales (around the centre of each letter, word or line), **Opacity** fades, **Tint** mixes toward a colour, **Spacing** adds letter spacing and **Blur** blurs.

A unit halfway into the range gets half of each change. Several modifiers stack, top to bottom.

## Animating them
**Start**, **End**, **Offset**, **Strength** and the amounts all have a key button (◆) like any other property: turn on recording in the [timeline](timelines) and change them, or key them by hand. The tracks are named like \`modifiers.0.offset\`, the number being the modifier's position in the list. Deleting a modifier removes its tracks and renumbers the later ones. Bindings, *Set property* actions and scripts can set the same paths.

## Things to know
- Everything except **Spacing** is purely visual: it does not change how the text wraps or the layer's auto size. Letter spacing really spaces the letters, so the text may reflow.
- Modifiers work on rich text too: each letter keeps its run's styling. A word that crosses a run boundary is still one word.
- Letters and words are drawn as separate pieces, so kerning pairs and ligatures between them are not applied while a modifier is on (a modifier that only fades or tints keeps them as far as the browser allows).
- With **reduced motion** on, modifiers still apply, but timelines that animate them show their last frame instead of playing.
- Lottie files with text animators import as modifiers (range selector and the position, scale, rotation, opacity, colour and tracking properties). The Lottie export does not write them.`
  },
  {
    id: "assets",
    title: "The Assets panel",
    group: "Design",
    summary: "Every file in the project: upload, preview as thumbnails or a list, place on an artboard, check several and delete.",
    keywords: "assets files upload drop drag thumbnails details size slider checkbox select all delete remove place unused image video audio font data panel",
    body: `The **Assets** tab in the left panel lists every file in the project: images, video, audio, fonts and data files.

![The Assets panel in thumbnail view, with one asset checked and the Delete button showing.](help/assets-panel.png)

## Adding files
- **Upload files** opens a file picker. You can pick several at once.
- Drop files on the **Assets** panel itself to add them without placing anything: images, video, audio (\`.mp3\`, \`.wav\`, \`.ogg\`...), fonts and data files. The panel shows a dashed outline while you're over it.
- Or drop files on the canvas, or paste them. Dropped pictures and video are also placed on the artboard where you dropped them.
- Font files (\`.woff\`, \`.woff2\`, \`.ttf\`, \`.otf\`) are added to the project's fonts as well, and a message tells you.
- Data files (JSON, CSV, TSV, text) are used from the **Data** tab. See [Data sources](data-sources).
- Design files (\`.psd\`, \`.ai\`, \`.pdf\`, \`.dxf\`) aren't stored as assets: they become new artboards. They are listed under **Design files** at the top of the panel, each with **Update…** to bring in a new version. See [Updating a design file](import#updating-a-design-file).

## Replacing a file
The **↑** button on an asset (beside the bin) replaces its file with a new version of the same kind: a new picture, sound, video, font or data file. Everything that uses it (layers, fills, **Play sound** actions, timeline audio, fonts, data sources) shows the new file, and one undo puts the old one back. An image or video layer's inspector has **Replace file…** for the same thing.

## Looking at them
- **Thumbnails** shows a picture for each asset. Drag the slider beside it to make the thumbnails bigger or smaller.
- **Details** is a list with each asset's kind and size, and **unused** if nothing in the project refers to it.
- Hover an asset for its full name and size. Your choice of view and thumbnail size is remembered in this browser.

## Using them
- **Place** puts an image or video on the artboard you have open, in the middle, at 300 by 200. You can then resize it.
- Image fills, video and image layers, **Play sound** nodes and fonts pick their file from a dropdown of the project's assets. Most of those dropdowns also offer **+ Add a new image…** (or sound, video or data file), which uploads and selects in one step.

## Checking and deleting
- Click an asset, or its checkbox, to check it. <kbd>Shift</kbd>+click checks a range. The box above the list, **Select all**, checks or unchecks every asset.
- When anything is checked a red **Delete** button appears with the count. A dialog lists the files and warns if any are used. Deleting an asset that layers still use leaves those layers empty.
- The bin on one asset deletes just that one (it asks first).
- To clear out everything nothing uses, see [Usage](usage#removing-unused-assets).`
  },
  {
    id: "images-media",
    title: "Images, video and audio",
    group: "Design",
    summary: "Adding files, the Assets panel, and 9-slice scaling for images.",
    keywords: "image picture photo svg video audio sound mp3 upload drop paste asset nine slice 9-slice n-slice",
    body: `Drop files on the canvas, paste them, or use the **Image** tool. SVG files become editable vector layers; other images become image layers. Video files become video layers; audio files are stored as assets for the **Play sound** action.

Pictures dropped or pasted onto an artboard are scaled to fit (up to 600 px for images and 640 px for video) and centred where you dropped them. Every file is also kept in the project's **Assets** panel: see [The Assets panel](assets) for thumbnails, details, checking several at once and deleting.

## Image settings
**Fit** (cover, contain, stretch), corner radius, and:

### 9-slice scaling
Turn on **9-slice** and set the four insets (in image pixels). The corners keep their size and the edges and middle stretch, so a rounded panel or button image can be resized without distortion. **Fill edges** chooses between *Stretch* and *Tile*: with *Tile* the edges and middle repeat the picture at its own size instead of stretching.

## Video
Autoplay, loop, muted, controls and fit. Most browsers only autoplay muted video.

## Video playback in variables
Under **Playback into variables**, pick (or create, with **+ Create new variable…**) variables for the video's **Position** (seconds, a number), whether it is **Playing** (true/false) and its **Length** (seconds). The player keeps them up to date while the video plays, so you can show the time in text (\`{videoTime} s\`), bind a progress bar's width to \`videoTime / videoLength\`, run a [Variable changed](interaction-nodes) event when it passes a point, or check it in a condition. It works the other way too: set the **Position** variable from anywhere else (a slider bound to it, a **Set variable** node, a script) and the video jumps there. Positions are to the hundredth of a second. They work in Preview and in exports, not on the editing canvas, where the video doesn't play.`
  },
  {
    id: "groups-frames",
    title: "Groups and frames",
    group: "Design",
    summary: "Grouping layers, frames that clip and lay out, masks, solo groups, draw order and scrolling frames.",
    keywords: "group frame container clip mask masking clipping solo state switch draw order z-order nest focus scroll scrollable overflow",
    body: `- A **group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) moves, scales and animates its layers together. Its box stays around its layers: move, resize, add or remove one and the group's box follows (nothing moves on the canvas, and keys on the layers' positions are adjusted to match). Untick **Size to contents** in the Group section to keep a box you set yourself. A rotated or scaled group, and a repeater, keep the box they have, since refitting would move the point they turn around.
- A **frame** (<kbd>F</kbd>) is a box with its own fill, stroke and corner radius. It can **clip** its contents and can use [auto layout](auto-layout).

Press <kbd>Enter</kbd> on a group or frame to work inside it; <kbd>Escape</kbd> goes back out.

## Masks
Tick **Use as mask** on a shape or group and it clips the layers above it in the same group, up to the next mask, so they only show inside its outline (the way masks work in most design tools). A group masks with the shapes inside it. A picture used as a mask clips by its transparency (so a cut-out PNG works as a stencil), as long as it is stretched to its box (fit *fill*) and only moved or scaled. The mask itself is not drawn in the player; on the canvas it shows as a faint ghost so you can still pick it. Hide the mask layer to turn the clipping off. To clip just one layer, put the mask and that layer together in their own group.

**Mask mode** (shown once *Use as mask* is on) chooses how the mask's coverage is worked out. *Alpha* (the default) shows the layers where the mask has shapes. *Inverted* shows them everywhere the mask has none, a hole where the shapes are. *Luminance* shows them as brightly as the mask's painted shapes are: white lets everything through, black nothing, a grey, a gradient or a half-transparent shape part-way (a picture counts as the picture itself). *Inverted luminance* is the opposite of that. The inverted and luminance modes are drawn with an SVG mask, so they are not limited to the layer's box (and a picture works by its pixels in them); the plain alpha mode is the crisp clip path.

## Solo groups
Tick **Solo** on a group or frame and it shows only one child at a time, the one chosen under **Active child**. Use it for states of a character or a button: build each state as a child, then switch between them. The active child can be keyed on a timeline (a step change, like a cut) or set from interactions with **Set property** and the property *Solo: active child*, whose value can be a quoted layer name such as \`"Happy"\`. Children that are not active take no room in auto layout.

## Draw order
A group's **Draw order** section lists its children front to back with arrows to move them. With **Record** on, or with the diamond, a change becomes a keyframe on the *Draw order (children)* property, so layers can pass in front of and behind each other during an animation. Keys always step from one order to the next. Layers you do not list keep their place. From interactions or scripts, set the property \`drawOrder\` to a list of layer names, back to front.

## Scrolling frames
Set a frame's **Overflow** to *Scroll vertically*, *Scroll horizontally* or *Scroll both*. Content beyond the frame can then be scrolled with the wheel, a trackpad or touch in the player, like a scrollable panel. An **On scroll** event set to *Is scrolled* fires as it scrolls, with \`event.scrollTop\`, \`event.scrollLeft\` and \`event.progress\` (0 to 1). In the editor the frame stays still so you can edit it; scroll it in Preview.`
  },
  {
    id: "auto-layout",
    title: "Auto layout",
    group: "Design",
    summary: "Frames that arrange their children in rows, columns, grids or stacks, with fill, hug and percent sizes, grow, margins and aspect ratios.",
    keywords: "flex flexbox grid row column stack gap padding justify align wrap hug fill percent absolute responsive grow basis aspect ratio margin auto cell span layout item",
    body: `Turn on **Auto layout** on a frame and its children are placed for you, like CSS flexbox.

| Setting | Meaning |
|---|---|
| Direction | Row (left to right) or column (top to bottom) |
| Gap | Space between children, in px or a percent |
| Padding | Space inside the frame's edges (top, right, bottom, left), in px or a percent |
| Justify | Where children sit along the direction: start, centre, end, space between |
| Align | Across the direction: start, centre, end, stretch |
| Wrap | Start a new row/column when one is full (row or column layouts; a grid has no wrap). **Line gap** (shown while Wrap is ticked) is the space between the wrapped rows, or columns in a column layout. It starts out equal to Gap; type a different number to separate the rows more or less than the items in them |
| Hug width / height | The frame shrinks or grows to fit its children |
| Layout | *Row or column* (above), *Grid* or *Stack*: see [Grids and stacks](#grids-and-stacks) below |

A **hidden** layer takes no space in the frame, in the editor and in the player: hide one and the others close up over the gap it left, show it and they make room again.

![A frame whose Wrap is ticked: the nine cards fill a row, then continue on the next. Gap is 12 between cards and Line gap is 40 between the rows.](help/line-gap.png)

![Changing Line gap and Gap: the rows move apart and the cards spread or regroup.](help/line-gap.mp4)

## Percent padding, margin and gap
Every padding, gap and margin field takes **px** (the default) or a **percent**. Type \`10%\` (or \`10px\` to go back), or press the small **px / %** button at the right of the field; pressing it keeps the size the value comes to now, so 20 px in a 400 px wide frame turns into 5%. Each side can have its own unit.

A percent is worked out again on every layout, so it follows the frame as it is resized or the page changes size. It is a share of a **width**, on both axes (the way CSS and Rive do it, so a 10% padding is the same all the way round):

- **Padding and gap**: the inner width of the auto-layout frame this one sits in, or this frame's own width when it is not in one (the artboard's top layout, for one).
- **Margin**: the inner width of the frame that lays the layer out.

![The Auto layout section of a frame with the Gap switched to a percent: the small button at the right of the field says % and shows px again when pressed.](help/layout-percent.png)

A frame that hugs its width measures a percent against the width it had before the layout ran, so it settles in a pass or two rather than chasing itself. Percent **sizes** of a layer are separate (see *Percent* under child sizing); a track in a grid can be a percent too.

## Grids and stacks
Set **Layout** to **Grid** to put the children in the cells of a table instead of along a line, or to **Stack** to put them all on top of each other.

- **Columns** and **Rows** list the size of each track, separated by spaces, like \`100px 25% 1fr auto\`. A track is a size in px (a bare number is px too), a percent of the frame's inner size, \`fr\` (a share of what is left once the other tracks are taken, so \`1fr 2fr\` gives the second twice the first), or \`auto\` (as big as the biggest thing in it). Rows past the ones you list are \`auto\`, so an empty **Rows** box makes a row for every line of children. Words that are not sizes are dropped. With no columns listed there is one column; a frame that hugs its width has \`%\` and \`fr\` tracks only as big as what is in them.
- **Column gap** and **Row gap** are the spaces between tracks. (A grid has no **Wrap** or **Direction**: children fill the cells in layer order, left to right and then down, unless a child is given its own cell in **Layout item**.)
- **Cell alignment** is a 3x3 picker. A child smaller than its cell sits where you click: the top left corner, the centre, the bottom right and so on. A child set to **Fill** stretches to the whole cell instead.
- **Justify content** (*Start*, *Centre*, *Space between*) and **Align content** (*Start*, *Centre*) place the tracks when they don't add up to the frame's size, for example fixed-size tracks in a larger frame.
- A **stack** has no tracks: every child goes in one cell as big as the frame. There the picker is called **Stack position** and says where the children sit in the frame (in the picture, the pink tag sits in the bottom right of the stack); a child set to **Fill** covers the frame. Going back from Stack to Grid finds the tracks you had.

![A grid of 100px, 25%, 1fr and auto columns with the cell alignment picker at the centre, and a stack below it with its position at the bottom right.](help/grid-layout.png)

![Editing the columns, then moving the 3x3 picker: the tiles shift inside their cells. Then the stack's picker moves the badge around the photo.](help/grid-layout.mp4)

## Child sizing
Select a child of an auto-layout frame and its **Layout item** section says how it sits in the frame; it sits right under the first section of the Inspector. Only the settings that frame's kind of layout reads are shown (a stack has no margins, wrapping or aspect, for example). With several children selected (from the same frame), a change applies to all of them, and a field shows *Mixed* where they differ. Select layers from different kinds of layout and the section only tells you so.

![The Layout item section for the orange card: Fill width and fixed height, grow 2 from a zero basis. The dark button at the top right is pushed there by an auto margin.](help/layout-item.png)

![Ticking Auto margin: Left on the button pushes it to the end of the toolbar. Then changing Grow on a card changes how much of the free room it takes.](help/layout-item.mp4)

- **Position**: *In flow* (laid out with its siblings), *Absolute* (placed by **Inset** from the frame's edges, e.g. pinned to the bottom right; leave a side empty (*auto*) to leave that edge free, and set left and right, or top and bottom, to stretch a layer that isn't fixed size) or *Ignore* (keeps its own x/y and takes no room, and has no sizing fields).
- **Width** and **Height**:
  - *Fixed*: its own size.
  - *Hug*: fits its own contents (frames and text).
  - *Fill*: along a row or column, shares the frame's free space with the other fill children; across it, stretches; in a grid, fills its cell.
  - *Percent*: a share of the frame's inner size (of the cell, in a grid). Where the frame hugs that size, the frame is as big as everything else needs, and the percent layer then takes its share of that.
- **Grow** and **Basis** (row and column, on the axis the frame runs along, for a *Fill* layer): a fill layer starts from its basis (*Zero*, *Pixels*, *Percent* of the frame, or *Content*: as big as what is inside it), and the free space is shared on top of it by grow (default 1; 0 takes none). Layers that are over the line shrink in proportion to their basis. A wrapping line breaks at each fill layer's basis (zero when it has none), not at the size it was left with by the last layout.
- **Aspect** (width over height, like 1.78): when one side hugs and the other is known, the hugging side follows the ratio instead of its content. The field shows up once a ratio is set or exactly one side is *Hug* (in a grid: the height); *From size* takes the ratio from the layer's current size, and 0 clears it. **Derive** chooses between *Either side* and *Height only* (the width then keeps hugging). In a grid only the height is derived.
- **Wrap text** (text in a row or column): a text that hugs its width (Sizing set to *Auto width*; the section says so when it isn't) wraps at the room its frame offers, and then shrinks to its widest line.
- **Column**, **Row**, **Col span**, **Row span** (grid): which cell it starts in (1 is the first, negative counts back from the last, 0 takes the next free cell) and how many tracks it covers. Layers without a cell fill the free cells in order.
- **Margin** around it (top, right, bottom, left), in a row, column or grid, in px or a percent of the frame's inner width (see [Percent padding, margin and gap](#percent-padding-margin-and-gap)). In a row or column, **Auto margin** on a side makes that side take the free room of the line, split equally between the auto sides: it pushes a layer to the end or centres it, ahead of Justify. Across the line, auto on both sides centres the layer and on one side pushes it to the other edge.

These settings are not keyframed: they are part of the layout, not of an animation. Animate a layer's size or position with a timeline, or change the frame's layout from an action.

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.

## Animate changes
Turn on **Animate changes** in the frame's Auto layout section and, while the project plays (Preview and the published player), children glide to their new place instead of jumping. It covers layers shown or hidden, a solo or draw order switching, text changing length, a list gaining or losing items, the frame being resized, and direction, gap, padding or alignment being set by an action.

| Setting | Meaning |
|---|---|
| Duration | How long a glide takes, in milliseconds |
| Easing | A preset, or *Custom* to drag the curve's handles |
| Enter | How a layer looks as it appears (a layer shown, or a new list item): *None*, *Fade*, *Scale* (grows from nothing) or *Fade and scale* (from 80%) |
| Exit | How a layer looks as it goes (hidden, or a list item removed): it fades or shrinks where it was, then goes. Until it has gone it keeps its place in the layout, so the layers around it stay put and a frame that hugs its content keeps its size; then they glide together |

- A frame that hugs its content on an axis glides its own size along with its children when the content changes size (a layer shown or hidden, a list gaining or losing items).
- If a layer returns while it is still leaving, it fades back in from where it had got to and nothing moves. A layer that appears while another is still leaving waits until the layout is released. A solo swaps its layers at once with no hold.
- **Timelines win.** If a timeline or an *Animate property* action is moving a layer's x, y, width or height, the frame follows it exactly rather than gliding behind it, and a property a timeline has a track on is never glided.
- Text that sizes itself changes size at once (its position still glides), and layers set to *Ignore* are not moved by layout so they don't glide.
- The editor canvas always snaps, so you can design without things moving. Scrubbing a timeline snaps too.
- With **Respect reduced motion** on in Project settings, viewers who ask for less motion see everything snap.`
  },
  {
    id: "arrange",
    title: "Align, arrange and combine",
    group: "Design",
    summary: "Align and distribute, layer order, and boolean shape operations.",
    keywords: "align distribute center order front back boolean union subtract intersect exclude combine snap",
    body: `## Align and distribute
With several layers selected, the bar at the top of the inspector aligns their edges or centres, and distributes three or more evenly. With one layer selected it aligns to the parent.

## Snapping
Layers snap to other layers' edges and centres while you drag; guide lines show what snapped. Hold <kbd>Ctrl</kbd> to drag without snapping. Rulers (<kbd>Shift</kbd>+<kbd>R</kbd>) show positions, and dragging from a ruler makes a guide that layers snap to. Drag a guide back onto the ruler to remove it.

## Order
<kbd>]</kbd> and <kbd>[</kbd> move a layer up and down; add <kbd>Ctrl</kbd> to go to the top or bottom. Or drag in the Layers panel.

## Boolean operations
Select two or more shapes and press **Union**, **Subtract**, **Intersect** or **Exclude** in the Inspector (the four buttons in the shape section), or right-click and choose **Combine shapes**. *Subtract* takes the other shapes away from the bottom-most one. The result is a single path; the originals are replaced.`
  },
  {
    id: "responsive",
    title: "Responsive artboards",
    group: "Design",
    summary: "Variants of an artboard for narrow and wide pages: the player picks one by the width of its box and switches live, keeping what the viewer has done.",
    keywords: "responsive variant variants mobile phone tablet desktop breakpoint width container media query narrow wide switch resize layout set page width slider adaptive",
    body: `A diagram that reads well at 900 px often needs another arrangement at 360 px. A **responsive set** is an artboard and its **variants**: whole artboards of their own, each shown from a **breakpoint** (a minimum width) up. The player measures the box it is in, shows the member that fits, and switches as the box is resized or the phone is turned. Nothing has to be wired: the set is the wiring.

## Quick start: a phone version
1. Select an artboard (click its name above it on the canvas) and open **Responsive** in the Inspector.
2. Click **Add narrow variant**. You get a copy, 360 px wide, to the right on the canvas. The original becomes the **base** and is shown from **600 px**; the copy is shown below that.
3. Rearrange the copy for a narrow page: move, resize and restyle its layers. Its timelines and interactions are its own copies too, so change them if the phone needs something different.
4. Click **Preview**. A **Page width** slider appears under the top bar, with the breakpoint marked. Drag it across 600 and the player switches artboard while it runs.

![The Responsive section, with a base artboard and its narrow variant.](help/responsive-section.png)

## How a set works
- Each member has a **from** width in the Responsive section. The player shows the member with the largest *from* that the box reaches, and the narrowest member when the box is narrower than all of them. *Narrow 0–599 px* and *Wide 600+ px* is the usual pair.
- In the **Layers** panel the variants sit under their base, each with the range it is shown at. On the canvas every member of a set has a pill for each of the others above it: click one to go and edit it.
- **Add narrower** and **Add wider** put a new member below the narrowest or above the widest. Change a breakpoint at any time. **Make standalone** takes an artboard out of the set; **Make a variant of…** puts a loose artboard into one. Deleting the base promotes its narrowest variant.
- Everything else treats the set as one artboard. **Go to artboard**, the start artboard, the completion artboard, remembered progress and learner results all name the base, and the player shows whichever member fits. They are listed once in the pickers, as *Name (responsive)*.
- The width that counts is the width of the box the player is in (the page, an iframe or the \`<interactives-player>\` element), not the screen. An artboard used as an [instance](instances) always shows the artboard it names, so use the base for the page and variants only as pieces.

## What carries when it switches
When the box crosses a breakpoint the viewer is not sent back to the start, and **On start** does not run again.
- **Variables** are the project's, so they just stay.
- **Timelines** are paired by name. Each one keeps its time, direction and whether it was playing, so a timeline mid-way keeps going. One that has no namesake starts as that artboard says.
- **Layers** are paired by name. What interactions did to a layer (a Set property, a script, an animation that was still running, how far it was dragged) goes to the layer with the same name. What a timeline drives is left to that artboard's own timeline, at the carried time.
- **Drag and drop**: cards stay in the zones they were dropped in, by name, and sit in the new artboard's zones.
- **Steps**: the step in view stays. **Keyboard focus** moves to the layer of the same name.
- **Questions** live in variables, so answers and scores stay.
- These do not carry: a flow that was part-way through a **Wait**, a layer's state inside an instance, and **Blends** (they start as the new artboard says).

Name the layers and timelines the same in every member, and the pairing is exact. The **Responsive** section lists what would not carry between each two members:

- a layer or timeline only one of them has,
- several layers sharing a name (they pair in order),
- a layer that is a different kind in the two,
- steps in only one, and a card or drop zone in only one.

## A worked example: score keeper
A page has a **Score** variable, a bar chart that grows on a timeline called **Intro**, and a panel that fades out when it is clicked.
1. On the *Chart* artboard, name the layers **Bars**, **Panel** and **Title**, and the timeline **Intro**. Click **Add narrow variant**.
2. On *Chart narrow* stack the bars vertically and make the title smaller. Keep the names. The **Intro** timeline came across with the copy; edit its keys if the bars move differently.
3. **Preview** and let **Intro** start playing, then click the panel so it fades. Drag the **Page width** slider below 600: the artboard changes to the vertical one while **Intro** carries on from the same moment, the panel is still faded and **Score** is unchanged. Drag back above 600 and the wide one returns, still in step.

## Tips
- Build the wide artboard first, then add the narrow one: the copy has all the layers, interactions and timelines, so the pairing is complete from the start.
- A change to the wide artboard's interactions is not copied to the narrow one. If both should behave alike, change both (the report tells you when layers have drifted apart).
- Only small things are lost on a switch, but a viewer part-way through dragging a card or typing in a field can notice it. Breakpoints between 600 and 900 px are the ones people cross by turning a tablet.
- The **Fit width** setting in Project settings suits a set: each artboard fills the width of the page and the page height follows the artboard that is showing.
- A host page can listen for the switch: \`player.on('variantchange', ({ from, to, set, width }) => ...)\`, or \`ix-variant\` on the \`<interactives-player>\` element. \`player.resize()\` makes the player re-measure its box if the page changes its size without the browser reporting it.`
  },
  {
    id: "instances",
    title: "Instances (components)",
    group: "Design",
    summary: "Place one artboard inside another, with its own timelines, interactions and inputs.",
    keywords: "component nested artboard reuse symbol instance inputs",
    body: `Any artboard can be placed inside another as an **instance**: a live copy that runs its own timelines and interactions on the parent's clock. Edit the source artboard and every instance updates.

- Select the artboard you want to reuse and pick the artboard to put it in from **Use in** (it says **Instance in…**). Or choose an artboard in an instance layer's **Artboard** field.
- **Fit** decides how the artboard sits in the instance's box: **Stretch to the box**, **Contain**, **Cover** or **Actual size, centred**. **Reset size** puts the box back to the artboard's own size, and **Edit** followed by the artboard's name jumps to the source artboard.
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source. Write them as JSON, such as \`{"level": 3}\`.
- Messages sent inside an instance (**Send message**, \`ix.emit\`) bubble up to the parent.
- The parent can steer an instance while it plays. **Set instance input** (an action) sets one of the instance's variables by name: pick the instance layer, write the variable's name as it is in the instance's artboard, and give a value (an expression). **Fire instance trigger** sends a message into that instance only, so its *On message* nodes and scripts run, and the parent's own nodes do not hear it. Scripts do the same with \`ix.setInstanceInput('Badge', 'level', 3)\` and \`ix.fireInstanceTrigger('Badge', 'ping', payload)\`; both return \`false\` when no such instance is showing. A repeated instance answers in every copy.
- Read an instance's input back with \`instanceInput('Badge', 'level')\` in any expression (so *Set instance input* can flip a true/false input with \`!instanceInput('Badge', 'flag')\`) or \`ix.getInstanceInput('Badge', 'level')\` in a script. It gives the first copy's current value, and nothing when the instance is not showing.
- Inputs can be **animated**. Select the instance, pick *Input level* (any number or true/false variable of the project, and the inputs the layer already sets) in the Timeline's property list and press **+ Key**: a number tweens between keys inside the instance, a true/false or text input steps. Blends mix input tracks like any other number, and a [binding](bindings) can drive an input too. A value you set with *Set instance input* or a script stays until the track's next key changes it.

Instances can be nested up to six deep. An artboard that contains itself stops at that limit.

Components can also be shared between projects: see [Libraries](libraries).`
  },
  {
    id: "constraints",
    title: "Constraints",
    group: "Design",
    summary: "Make a layer follow a path or copy another layer's position, rotation or scale.",
    keywords: "constraint follow path motion path copy transform translation rotation scale attach",
    body: `Constraints keep a layer tied to another one while things move. Add one in the **Constraints** section of the inspector.

| Constraint | What it does |
|---|---|
| Follow path | Places the layer along a path. **Distance** (0–100%) is how far along; animate it to move along the path. **Orient** turns the layer to face along the path. |
| Copy position | Takes another layer's position (plus an offset). Untick **Copy x** or **Copy y** to take only one axis. |
| Copy rotation | Takes another layer's rotation. |
| Copy scale | Takes another layer's scale (untick **Copy x** or **Copy y** for one axis). |
| IK, Distance | Reach a target with a chain of bones, or keep a set distance from a layer. See [Bones and skinning](bones). |

The three copy constraints share some options. **Read** chooses *World values* (where the other layer ends up on the artboard) or *Local values* (its own position, rotation or scale inside its parent). **Factor** multiplies what is copied (0.5 follows half as far, -1 mirrors it). **Add to own** adds the copied value to the layer's own instead of replacing it (for scale it multiplies). **Limit** keeps the result within a range: *Min* and *Max* for x or rotation or horizontal scale, and *Min y* and *Max y* for the vertical ones.

Every constraint has a **Strength** (0–100%) that mixes between the layer's own value and the constrained one, and it can be animated. Constraints are applied in the player and on the canvas.`
  },
  {
    id: "bones",
    title: "Bones and skinning",
    group: "Motion",
    summary: "Rig a character with bones, bend paths and images with them, and pose limbs with IK.",
    keywords: "bone skeleton rig rigging skin skinning weights bind mesh deform ik inverse kinematics distance constraint character puppet example demo try tutorial arm",
    body: `A **bone** is a layer that only exists to be posed. Draw a chain of bones, **bind** paths and images to them, and the shapes bend where the bones turn. Bones are drawn on the canvas as blue glyphs while you edit; the player never shows them.

## Try bones in two minutes
Not sure where to start? Let the editor build a working rig, then take it apart.

1. With nothing selected, open the **Bones** section in the Inspector (the right panel) and click **Build an example to try**. (A selected bone has the same button.)
2. On the artboard you get a three-bone arm with a shape skinned to it, an **orange dot**, a **Wave** button and the instruction *Drag the orange dot*. The blue lines inside the arm are the bones; they show in the editor, never in the player. Click a bone in **Layers** (*Upper arm*, *Forearm*, *Hand*) to see it.
3. Click **Preview** (top right) and **drag the orange dot**. The arm bends to follow it: the dot is the target of an **IK** constraint on the *Hand* bone, three bones long. Drag it out of reach and the arm straightens toward it.
4. Press **Wave**. A timeline called *Example: wave* swings the bones by hand for two seconds, with the IK **Strength** keyed down to 0 so the keyed poses win. As the strength comes back to 1 the arm returns to the dot.
5. Close Preview, select the *Hand* bone and look at **Constraints**: *IK*, target *IK target (drag me)*, 3 bones. Try **Bend the other way**, or drop the bones to 2 to see the hand end swing free. Select *Arm* to see its **Skin**, and a point's weights in **Weights of**.

![The example arm bent toward the orange dot, with the Bones section of the Inspector open.](help/bones-example.png)

![Dragging the orange dot in Preview: the arm follows it. Then Wave swings the bones and hands the arm back to the dot.](help/bones-example.mp4)

The finished result is also on the **Templates** tab, under **Examples**, as **Bones and IK**: play it, or make your own copy.

The example is ordinary layers, bones, a timeline and two interaction nodes, so everything in it can be changed, copied or deleted. Press **Build an example to try** again for another copy.

## Drawing bones
Pick the **Bone** tool (<kbd>J</kbd>) and drag from a bone's base to its tip. To carry on a chain, start the next drag on the tip of the last bone: the new bone becomes its child, and turning a parent moves everything below it. A drag that starts anywhere else begins a new bone (inside the group you went into, if you double-clicked into one). Hold <kbd>Shift</kbd> to snap angles to 15°. The eye button in the toolbar (<kbd>Shift</kbd>+<kbd>J</kbd>) hides the glyphs.

With the Select tool, click a glyph to select the bone, drag its body or tip to turn it, and drag its round base to move it. A bone is posed like any layer: **X, Y**, **rotation**, **scale** and **length** (the *Len* field, which is the layer's width) can all be keyed on the [timeline](timelines), so turning a bone while recording makes a keyframe. Layers dropped inside a bone ride on it, which is the quickest rig of all: a hand shape inside the forearm bone needs no skinning.

## Skinning
Select a **path**, then in **Skin** pick the bones and press **Bind to bones** (or select the path and the bones together and press **Bind to selected bones**). Every point is given weights from its distance to the bones, up to 4 per point, so a point on a bone follows it and one between two bones blends them. The poses the bones are in when you bind become the **bind pose**: the shape looks exactly as drawn until a bone moves. Bind with the rig in its rest pose.

- A skinned path follows its bones, not its own position, so move the rig, not the path.
- **Weights of** shows one point's influences. Change a bone's weight (they are scaled to add up to 1), add or remove a bone, or press **Auto** to work the point out again. **Re-bind** works all of them out again from the current pose.
- Bezier handles are pulled along with their point.
- If the number of points changes after binding, points without weights keep their own position: re-bind.

An **image** can be skinned too. Binding makes a grid mesh over the picture (a few cells per 40 px) and weights its vertices the same way; the picture is drawn warped through that mesh. **Remove mesh** goes back to the plain picture.

## IK and distance
Add an **IK** constraint (see [Constraints](constraints)) to the bone at the *end* of a chain and pick a target layer: the chain turns so the end bone's tip reaches the target. **Chain bones** is how many bones turn, counting the end bone and its parents (1 points one bone at the target; 2 or 3 make a limb, like an arm reaching for a hand target). **Bend the other way** puts the elbow or knee on the other side. A target out of reach straightens the chain toward it. **Strength** mixes IK with the keyed pose, and can be animated, so a limb can swing from its animation onto a target.

A **Distance** constraint keeps a layer (or bone) a set distance from a target: exactly at it, no farther than it, or no nearer. Animate the distance to pull in or push out.

Constraints run first, then skinning, so a skinned shape follows bones that IK has moved.

## Importing
A Rive file's bones, skins (weights) and meshes, and its IK and distance constraints, come in as bones, skins and meshes. Rive's IK bend direction may come out mirrored: tick **Bend the other way** on the constraint if it does.

## Limits
Skinning is linear blend skinning: strong twists can pinch, so use more bones or weight points between them. There is no weight painting brush yet; set weights per point in the inspector. Meshes are regular grids made for you (an imported mesh keeps its own triangles).`
  },
  // ---------------------------------------------------------------- web
  {
    id: "web-elements",
    title: "Web elements",
    group: "Web elements",
    summary: "Real buttons, inputs, links, embeds and video that work with keyboards and screen readers.",
    keywords: "button input text field checkbox slider range select dropdown link embed iframe html video aria accessibility",
    body: `Web elements are real HTML controls, so they work with keyboards, screen readers and forms.

- **Button** (<kbd>B</kbd>): a label (which can use \`{expressions}\`), fill, stroke and corner radius. Use **On pointer → Click** to react.
- **Input**: text, number, email, password, multi-line, checkbox, slider (range) or dropdown (select). Bind it to a **variable** and it reads and writes that variable both ways. **On variable change** then reacts to what was typed.
- **Link**: text that opens a URL.
- **Embed**: an iframe from an \`https://\` URL, or your own HTML. The HTML runs in a sandboxed frame that can't reach the page it is on, so it can't read its cookies or call its code. In the editor an embed shows as a labelled box; open Preview to see it. Projects whose scripts don't run in the sandbox can switch on **Run embedded HTML in the page** in Project settings for HTML they wrote themselves.
- **Video**: a video file or URL.

## Accessibility
Every layer has an **Accessibility** section (roles, text alternative, keyboard reach, hiding decorative layers): see [Accessibility](accessibility). The **CSS class** is in the Advanced section. The [Accessibility checker](accessibility-checker) lists the layers that need a text alternative. The player honours the viewer's *reduce motion* setting when the project setting **Respect reduced motion** is on.`
  },
  {
    id: "accessibility",
    title: "Accessibility: roles and keyboard",
    group: "Web elements",
    summary: "Make shapes usable by keyboard and screen reader: roles, text alternatives, tab stops, Tab order and Announce.",
    keywords: "accessibility a11y aria role screen reader keyboard focus tab order enter space announce live region alt text decorative heading checkbox button wcag",
    body: `Buttons, inputs and links are real controls, so keyboards and screen readers already handle them. A **shape** (or text, image, group) with an *On pointer → Click* is different: a mouse can click it, but a keyboard or screen reader user can't reach it. The **Accessibility** section in the inspector closes that gap.

## The Accessibility section
- **Role**: what the layer is to a screen reader. *Button* and *Checkbox* make it a tab stop that Enter and Space click. *Heading* (with a level 1 to 6), *Image* and *Region* describe structure. *Decorative* hides the layer from screen readers and keyboards completely (backgrounds, flourishes).
- **Text alternative**: the name a screen reader says. For a picture, describe what it shows; for a clickable shape, say what it does ("Next question"). It can be bound or animated like other properties.
- **Description**: a longer explanation read after the name.
- **Tab stop**: *Automatic* (a layer is reachable when it has an *On pointer → Click*, an *On focus*, or a button or checkbox role), *Always*, or *Never*. The line underneath says what you get.
- A **Checkbox** role needs its state told: bind **Checked (checkbox role)** in Data bindings to the variable that holds it (see [Bindings](bindings)).
- Buttons, inputs and links show only the text alternative and description. They already have the right role and keyboard behaviour.

## What the keyboard does
- **Tab** and **Shift+Tab** move between tab stops, in layer order unless you set a tab order (below). A visible ring shows where the focus is (only for the keyboard, not after a mouse click).
- **Enter** clicks the focused layer, **Space** clicks it when released, the same way a real button does. It runs the layer's *On pointer → Click* nodes exactly like a mouse click, with the pointer position at the layer's centre.
- Only the layer itself is activated. A button or input inside a clickable frame does its own thing, so nothing runs twice.
- An Enter or Space that clicked a layer, or that was pressed on a button or link, does not also run an *On key* node for the same key, so a game's "press Space" and a button's click can't both fire from one press.
- Only *On pointer → Click* can be done from a keyboard. Hover, press, release and the older drag events can't, so give those layers a click alternative. Layers made [draggable](drag-and-drop) get a keyboard way (Space, arrows, Space) of their own.

## Tab order
With nothing selected, the **Tab order** section in the inspector lists every tab stop on the artboard in the order Tab visits them. Use the arrows to move a layer earlier or later, or click its name to select it. **Reset to layer order** goes back to the default. The order only applies within the player; stops you haven't placed follow the others in layer order.

## Announce
The **Announce** action says something to screen readers without showing anything: write the text as an expression, such as \`"Correct, " + score + " of 5"\`. *Polite* waits for the current speech to finish; *Assertive* interrupts, for errors and urgent feedback. Scripts do the same with \`ix.announce(text, 'polite' | 'assertive')\`. In **Preview**, a strip under the preview shows what would be said, once you switch **Screen reader** on (a button in the Preview header, or Preferences; it is off by default).

## Turning it off
**Preferences → Accessibility features** (also a button in Preview) switches all of the above off in Preview: no extra tab stops, no keyboard clicks, no roles, no announcements, as projects played before these features existed. It is on by default. The **Screen reader** strip under Preview, which shows what would be announced, is a separate preference (also a button in the Preview header) and is off by default. If something looks wrong, check it with the setting off; if it goes away, report it. Exported files and embedded players keep the features on. A page embedding the player can pass \`accessibility: false\` (or \`accessibility="off"\` on the web component) to turn them off.

## What it doesn't do
Reading order is the layer order (rearrange layers to change it). Moving focus after a button changes the artboard isn't automatic; use *Focus layer* to put it somewhere sensible. Colour contrast, missing descriptions and other problems are for an accessibility checker, not these settings.`
  },
  {
    id: "links-cursors",
    title: "Links and cursors",
    group: "Web elements",
    summary: "Make any layer a link, and choose the cursor shown when hovering it.",
    keywords: "hyperlink url href target new tab cursor pointer hand custom cursor image hotspot",
    body: `## Link
In the **Link** section, give any layer a **URL** and it becomes a real link. **Open in** chooses where: a new tab, the same frame, the parent frame, or the whole page (useful when the interactive is embedded in an iframe). URLs can contain \`{expressions}\`. Links go to \`http(s)\`, \`mailto\`, \`tel\` or relative addresses; anything else (such as \`javascript:\`) is ignored.

The **Open URL** action does the same from an interaction.

## Cursor
**Cursor on hover** sets the cursor shown while the pointer is over the layer and its children, the way CSS \`:hover { cursor: pointer }\` works. *Automatic* gives links and layers with a click, press or release interaction a pointer. Choose the cursor shown over the layer (pointer, grab, crosshair, text, not-allowed, …) or **Custom image** with a hotspot (the point of the image that clicks). Change it at runtime with **Set cursor** or \`ix.setCursor('grab')\`.`
  },
  // ---------------------------------------------------------------- motion
  {
    id: "timelines",
    title: "Timelines and keyframes",
    group: "Motion",
    summary: "Animate properties with keyframes, record mode, looping and playback.",
    keywords: "animation animate keyframe key record playhead loop ping pong autoplay speed duration track",
    body: `Each artboard can have any number of timelines. A timeline has **tracks**; each track animates one property of one layer through **keyframes**.

## Adding keyframes
- Press **Record** (the red dot). A red bar at the top of the Inspector says **Recording keyframes at …**. While recording, every change you make to an animatable property at the playhead becomes a keyframe. Press it again to stop.
- Or click the diamond next to a field in the inspector to key the value it shows at the playhead (between two keys, that's the in-between value). With several layers selected it keys all of them. The diamond is filled when there's already a key at the playhead, and clicking it then updates that key.
- Once a property has keys on the open timeline, changing it in the inspector or on the canvas changes its key at the playhead (or adds one there), with or without Record, since the value you see is the timeline's. To change a layer's own value, the one it has before the timeline plays, switch to **Design view (no timeline)**.
- On a timeline set to **Whole frames**, a key goes on the start of the frame the playhead is in.
- Or select a layer, choose a property in the dropdown at the top left of the Timeline and press **+ Key**.
- Drag keys to retime them (<kbd>Shift</kbd> snaps to 100 ms), <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove. The diamond on a layer's own row moves all of that layer's keys at that time.

## Timeline settings
The Timeline bar shows a short summary (length, loop, speed, autoplay, frame rate). Click the **gear** beside it to change them, and to rename the timeline; Esc or a click outside closes it.

| Setting | Meaning |
|---|---|
| Length | Duration in milliseconds |
| **Play once** / **Loop** / **Ping-pong** | What happens at the end |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast). To play backwards use a **Control timeline** node set to **Play in reverse** |
| Frame rate | Frames per second the animation was made at (1 to 240); 0 leaves it free |
| Whole frames | Shown once a frame rate is set. Values are read at the start of the frame, so they step from frame to frame instead of gliding. Playback time, markers, sound and captions still use the real time. Applies in the player, blends and the canvas. Imported animations that snap to frames (for example 24 fps hand-drawn motion) come in with it on |

![The Timeline bar with its settings open: name, length, loop, autoplay, speed and frame rate.](help/timeline-settings.png)

A timeline can also carry **sound** (a voice-over that follows the playhead, with a waveform) and **captions** (timed text with a transcript for viewers). See [Narration, captions and transcript](captions).

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). In the Tween panel, drag the two handles on the graph to make your own curve; the dashed lines mark the start (0) and end (1) values, and the graph grows to show overshoot. Select a key to change its time or value.

## Markers
A **marker** is a named point in time. Press **+ Marker** to add one at the playhead; it shows as a flag on the ruler and is called *Marker 1*, *Marker 2* and so on until you rename it. **Click** a marker to select it: it turns yellow, a dashed line runs down through the tracks, and a **Marker** panel appears at the right of the timeline with its name, its time, and (when [Steps](steps) use the timeline) its title and caption. Drag it to move it, press the <kbd>←</kbd> and <kbd>→</kbd> arrow keys to nudge it (10 ms, 100 ms with Shift, or one frame when the timeline has a frame rate), and press <kbd>Delete</kbd> to remove it. Right-click a marker for the same things as a menu, and right-click the ruler to add a marker there.

To **do something when playback reaches a marker**, select it and press **+ When the playhead reaches this…**. That adds an **On timeline marker** node for the marker and a **Set variable** node after it, and opens the Interactions tab on the Set variable node: pick the variable and the value there. The Marker panel says how many interactions already use the marker and has an **Open** link to them. If you rename the marker the nodes follow it. An **On timeline marker** node runs its flow whenever playback passes the marker: going forwards or in reverse, and on every lap of a loop or ping-pong. Leave *Marker name* empty to react to every marker on the timeline; \`event.marker\` and \`event.time\` say which one fired. Scrubbing and seeking do not fire markers, only playing.

![The timeline bar and tracks. The flag on the ruler is a marker.](help/timeline-markers.png)

## Design view and timeline view
There are two ways to look at an artboard.

- **Design view**: the canvas shows the layers as they really are, with no animation applied. This is where you place and style things. Opening an artboard starts here, and the Timeline tab says **Design view: the canvas shows the layers as they are. Choose a timeline to see and edit its animation.**
- **Timeline view**: choose a timeline from the dropdown at the top left of the Timeline tab and the canvas shows that timeline at the playhead. Drag the playhead to see any frame, and with **Record** on, changes become keyframes.

Choose **Design view (no timeline)** in the same dropdown to go back. Record turns itself off when you do.

## Switching children and draw order
Two properties are not numbers. **Solo: active child** on a [solo group](groups-frames) switches which child shows, and **Draw order (children)** changes which child is in front. Both step at their keys instead of blending. Key them from the group's Solo and Draw order sections in the inspector.

## Playing from interactions
**Control timeline** plays, restarts, pauses, stops, reverses, toggles or jumps to a time in a timeline. Give *Play*, *Restart* or *Reverse* a **Blend in** time (ms) to fade the timeline's pose in over the pose the layers have now instead of cutting to it: numbers and colours mix, anything else switches once the new pose weighs more. That is how to switch between looks (idle to wave) smoothly. Blend-in is off with reduced motion. For what the look being left does meanwhile, the easing of the blend and cutting in on one, see [Transitions between looks](timelines#transitions-between-looks). From scripts: \`ix.timeline('Intro').play()\`. **On timeline end** fires when one finishes, and **On timeline marker** fires at each [marker](timelines#markers).

## Transitions between looks
A transition is a **Blend in** on the node that starts the next look (**Control timeline**, or **Play blend** for a [blend](blends)). These settings shape it:

| Setting | What it does |
|---|---|
| Blend in (ms) | How long the new look takes to take over. 0 cuts straight to it |
| Blend easing | The curve of the take-over. Linear is an even cross-fade; *Ease in* starts slowly, *Ease out* starts fast, or draw a bezier curve |
| Blend out of | The timelines and blends being replaced, by name: \`"Idle"\` or \`["Idle", "Walk"]\`. They **keep running** under the blend-in, so a walk cycle does not freeze mid-step while the wave fades in, and stop when it is done. With no blend-in time they stop at once. Leave it empty to leave things as they are (pause the old timeline yourself) |
| Freeze while blending out | The ones being replaced stand still where they are instead of running on |
| Can be left early | Another change is allowed to cut in before this blend-in has finished |

A blend works as a look too: a timeline can blend into a blend, a blend into a timeline, or a blend into another blend. Into a blend, its whole pose fades in (numbers and colours mix; anything else switches once the new pose weighs more).

Two more nodes make a state machine out of these:

- **Wait for blend-in** holds the flow while a timeline or blend is still blending in, so a change does not cut it short. It lets the flow through at once if the blend-in is marked *Can be left early* or nothing is blending in. With **Give up instead of waiting** the change is dropped instead, like a button press that is ignored during a transition.
- **Wait for time in timeline** holds the flow until a timeline has played to a time in milliseconds or a percentage of its length (an exit time: leave the idle only after it has played half through). It carries on at once if the timeline is already past that time.

Put **Wait for time in timeline** after a condition to leave "no sooner than" a point in the animation, and **Wait for blend-in** just before a change of look that should not interrupt the last one. **Random** (in the [interaction graph](interactions)) picks the next look.`
  },
  {
    id: "shape-morphing",
    title: "Shape morphing and the Bend tool",
    group: "Motion",
    summary: "Bend edges into curves, key the points of a path and morph one shape into another.",
    keywords: "morph morphing vertex vertices points path shape keyframe bend curve warp handle tween blob",
    body: `Every point of a path, and the two handles on it, can be animated. Moving points over time makes a shape **morph**: a circle that squashes, a blob that wobbles, a mouth that opens.

## Bend an edge
1. Pick the **Bend** tool (<kbd>W</kbd>).
2. Move over an edge: the pointer becomes the **bend cursor** (an arrow with a bowed line) when a press there would bend it, and stays a plain arrow when it wouldn't. Press on the edge and drag. The edge turns into a curve that follows the pointer; a straight edge becomes curved by moving the handles of the two points at its ends.
3. Hold <kbd>Alt</kbd> to bend one side only: just the handle at the nearer end moves and the far end stays as it is.

On a rectangle, ellipse, polygon or star the tool first asks to **convert it to a path** (its outline needs points to bend). Its place, fill, stroke and keys stay; its corner radius, sides or inner ratio are replaced by the points, and its width and height no longer stretch the outline. You can also convert from the inspector (*Convert to path*).

## Morph a shape
1. Select the path layer and open the **Timeline** tab (make or pick a timeline).
2. Put the playhead where the morph starts (usually 0) and press **◆ Key shape** in the path's inspector section. Every point, and the handles it has, gets a key.
3. Move the playhead to where the shape should end up and turn on **Record**.
4. Edit the shape: drag points and handles in point-edit mode (double-click the path, or <kbd>Enter</kbd>), or drag edges with the Bend tool. Each point you change is keyed at the playhead; the points you leave alone stay where they were.
5. Play it, or scrub: the shape blends between the two poses. Click the line between two keys to change the [easing](easing).

Without Record, point edits change the layer's own shape and add no keys (where a point is keyed, the canvas shows its keys, not the layer's own shape, so edit keyed shapes while recording). **◆ Key shape** at a later time keys the shape as the canvas shows it there, which is a quick way to hold a pose.

## In the timeline
A path layer's shape keys are grouped by point: **Shape: point 3** holds that point's X and Y and the in and out handle numbers. Click a point's name to fold or open it (layers with many points start folded). The diamonds on a point's row stand for all its keys at that time: drag them to retime a point, select them and press <kbd>Delete</kbd>. Open the point to select single keys, edit a key's value, or click the line between two keys to change its easing. The **×** on a point's row removes its keys; **Clear shape keys** in the inspector removes every shape key of the layer from the open timeline.

## Adding and removing points
Point numbers are shared by all the keys of a path, so the editor keeps them in step:
- **Add a point** by double-clicking the outline while editing points. The point sits on the curve and the outline does not change. In every timeline that keys the path, the new point gets a key at each of the path's key times, placed on the curve of that frame (and its two neighbours' handles are adjusted to match), so existing morphs keep their shape. Later points are renumbered.
- **Delete a point** (select it, press <kbd>Delete</kbd>): its keys go and later points are renumbered in every timeline. In each frame the neighbours join directly, so the outline loses that corner.
- A handle that did not exist before (a corner you bend into a curve) is keyed as zero at the path's earlier key times, so earlier poses stay straight. A point's X and Y keyed for the first time at a later time hold that value before it, like any other property.

## Good to know
- Keys hold point positions in the layer's own coordinates. A path with shape keys keeps its box and points as they are when you leave point-edit mode, and resizing the layer scales its own shape but not its keys; resize before you key.
- Morphs look best when the two poses have the same points in the same order. Add points to the simpler pose first, then key.
- Turning a point between curve and corner (<kbd>Alt</kbd>-click) while recording keys that point's handle numbers at the playhead.
- Imported Rive animations with moving vertices use the same keys, so you can edit them here.`
  },
  {
    id: "easing",
    title: "Easing",
    group: "Motion",
    summary: "How a value moves between two keyframes.",
    keywords: "ease interpolation curve bezier linear step elastic bounce back cubic",
    body: `| Easing | Feels like |
|---|---|
| linear | Constant speed |
| step | Jumps at the next key (no in-between) |
| easeIn | Starts slow, ends fast |
| easeOut | Starts fast, settles gently |
| easeInOut | Slow at both ends |
| backIn / backOut | Pulls back before, or overshoots after |
| elasticOut | Springs past and wobbles into place |
| bounceOut | Bounces at the end |
| Custom bezier | Your own curve: drag the two handles |

The same names work in **Animate property** nodes and in \`node.animate(prop, value, { ease: 'easeOut' })\`.

## Choosing and drawing an easing
On a timeline, click the line between two keyframes (a *tween*). The **Tween** box shows the curve. Pick a name from **Ease**, or drag the two round handles on the graph to draw your own: the dashed lines mark the start (0) and the end (1) values, and the graph grows to show overshoot. **Use for all tweens** gives every tween in the timeline the same easing.

![The Tween box: a curve with two draggable handles, the Ease menu and Use for all tweens.](help/easing-editor.png)`
  },
  {
    id: "joysticks",
    title: "Joysticks",
    group: "Motion",
    summary: "Scrub one or two timelines from numbers, for dials, eyes that follow the pointer and blends.",
    keywords: "joystick blend scrub drive timeline progress follow pointer dial gauge",
    body: `A **joystick** connects numbers to timeline positions. Instead of playing over time, the timeline sits at the position the numbers say.

Add one in the **Joysticks** section of the artboard (select the artboard).

- **X timeline** and **Y timeline**: one or two timelines to drive (Y is optional).
- **X value** and **Y value**: [expressions](expressions) from 0 to 1, for example \`pointer.x / artboard.width\` or a variable \`volume\`.

- **Handle**: a layer (a knob or stick) that something else moves, for example a drag. Where its origin sits inside the **Area** (a rectangle in artboard pixels, shown when a handle is chosen) is \`handle.x\` and \`handle.y\`, from 0 at the left and top to 1 at the right and bottom. Use them in the value expressions: \`handle.x\` for X and \`handle.y\` for Y give a stick that scrubs two timelines, and \`1 - handle.x\` turns an axis round. Without a handle both are 0.5.

Examples: a dial that turns with a variable, a character whose eyes follow the pointer (a left-right timeline and an up-down timeline), or a gauge that fills with a score. \`pointer\` (\`{x, y}\` on the artboard) and \`artboard\` (\`{width, height}\`) are in scope.`
  },
  {
    id: "blends",
    title: "Blends",
    group: "Motion",
    summary: "Mix several timelines at once, weighted by numbers: idle, walk and run by speed, or a lean on top of a loop.",
    keywords: "blend mix weight 1d direct additive layer timelines locomotion speed rive blend state input",
    body: `A **blend** plays several [timelines](timelines) together and mixes their poses. How much each one counts comes from number [variables](variables), so a single number can turn *idle* into *walk* into *run*.

Add one in the **Blends** section of the artboard (select the artboard), then start it with a **Play blend** node (or tick *Start with the artboard*). **Stop blend** ends it.

![The Blends section with the example blend: Mode, Input, Start with the artboard and two timelines.](help/blends-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected (the inspector shows the artboard's settings).
2. Open the **Blends** section and click **Build an example to try**. On the artboard you get a ball and, under it, a slider with the caption **Drag me: blend weight** (with *0 = small and red* and *1 = big and blue* at its ends and the live value of *mix* below it). Behind them are two timelines (*Example: small and red* and *Example: big and blue*), a variable called *mix* that the slider is bound to, and a blend that starts with the artboard.
3. Click **Preview** (the button at the top right of the editor). The artboard opens in the Preview window: the slider is the horizontal bar under the ball. Drag its knob from the left end to the right end. At 0 the ball is small and red, at 1 it is big and blue, and in between it is a mix of the two. (In the Preview window's left panel, **Variables (live)** also has a *mix* box you can type a number into.)
4. Open either example timeline to see that each one is just a pose: the same values at the start and the end.

![Preview of the example: changing mix from 0 to 1 turns the small red ball into the big blue one.](help/blends-mix.mp4)

## Make your own, step by step
1. **Make the poses.** Create one timeline per pose (say *Idle*, *Walk*, *Run*) and key the layers in each. A pose can be still (the same keys at the start and end) or a loop that moves.
2. **Make the number.** In the **Variables** tab add a *number* variable, say *speed*. Anything can change it: a slider (an **Input field** with type *Range* bound to the variable), a **Set variable** node, a [joystick](joysticks), or a script.
3. **Add the blend.** Select the artboard, open **Blends** and click **+**. Leave the mode on **1D**, set **Input** to *speed*, and add your timelines with **+ timeline**. Give each one the value of *speed* where it should count fully, e.g. *Idle* 0, *Walk* 1, *Run* 2.
4. **Start it.** Tick **Start with the artboard**, or add a **Play blend** node to a flow in the Interactions tab.
5. **Preview** and change the number.

Use **Direct** when each pose should have its own weight (e.g. a *smile* and a *frown* amount from two sliders), and **Additive** to layer a small motion (a lean, a breath) on top of whatever is already playing.

## Modes
| Mode | How the weights work |
|---|---|
| **1D** | One *Input* variable is a position. Each timeline sits at a *value* along it. The two timelines either side of the input are mixed in proportion; below the first or above the last, that end timeline counts fully. |
| **Direct** | Each timeline has its own weight: a variable (from 0 up to *Full weight at*, so use 100 for percentages) or a fixed weight from 0 to 1. Weighted timelines are averaged. If the weights add up to less than 1 the rest is whatever the layer already had; if they add up to more than 1 they are scaled down. |
| **Additive** | Each timeline adds its *change from its first frame*, times its weight, on top of the layer's current value. Stopping the blend takes the change back out. |

## What gets mixed
- Numbers (position, size, rotation, opacity ...) and colours are blended.
- Everything else (visible, text, draw order, solo child) takes the value of the heaviest timeline that animates it, as long as the weights covering it add up to at least 0.5. Additive blends leave these alone.
- Only the properties the blend's timelines animate are touched, and only where the weights say something.

## How it plays
While a blend is on, each of its timelines plays on a playhead of the blend's own, following the timeline's loop setting. The same timeline can also play normally. Every frame the order is: normal timelines, [joysticks](joysticks), blends (in the order listed), then Animate property tweens. A blend therefore wins over a normal timeline animating the same property, except that Additive blends add to what the timeline wrote. *Play blend* does nothing if the blend is already on; *Stop blend* leaves the mixed pose where it is (Additive blends excepted).

## Imported blend states
Importing a Rive file turns its 1D and direct blend states into blends. Entering the state plays the blend; leaving stops it. Direct blend inputs run 0 to 100 as in Rive.`
  },
  // ---------------------------------------------------------------- interactivity
  {
    id: "steps",
    title: "Steps",
    group: "Motion",
    summary: "Turn a timeline's markers into the steps of an explainer: Next plays to the next marker, Back plays back, a step bar does the clicking.",
    keywords: "steps step through explainer next back story walkthrough slideshow tutorial marker caption dots progress scroll scrub scrollytelling stepper wizard",
    body: `**Steps** turn a [timeline's](timelines) markers into the steps of a "watch, then click Next" explainer. You animate the whole story on one timeline and put a marker at the end of each part. Next plays to the next marker and stops there, Back plays back to the one before, and a **step bar** (Back, Next, a dot for every step, "Step 3 of 7", the title and caption) does the clicking. Add or move a marker and the steps follow; nothing is wired by hand.

![The Steps section of the artboard, with the example explainer's four steps.](help/steps-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected.
2. Open **Steps** and click **Build an example to try**. You get a ball, a timeline with four markers (each with a title and a caption), Steps turned on, and a step bar along the bottom.
3. Click **Preview** and press **Next**. The ball grows, rolls across and turns green, one marker at a time. **Back** plays it in reverse. Click a dot to jump straight to a step. The Left and Right arrow keys work too.

## Make your own
1. Build the whole story on **one timeline**: key the layers as they should look at the end of each part.
2. Put a **marker** at the end of each part (**+ Marker** in the timeline bar, at the playhead). A marker at 0 is step 1; the editor adds one for you when you turn Steps on.
3. Click a marker on the ruler: with Steps on its **Title** and **Caption** appear beside the timeline. The title is the marker's name when left empty. A marker you untick **Is a step** stays out of the steps.
4. Select the artboard and open **Steps**. Pick the timeline (or press **Steps** in the timeline bar) to turn them on.
5. Click **Add a step bar**. It is made once as ordinary layers and nodes: restyle it, move it, delete the parts you do not want, or add another. Nothing needs updating when the markers change.

## What Next, Back and the dots do
- **Next** and **Back** play the timeline to the neighbouring marker, at the timeline's speed, and stop exactly on it. Press Next while a step is still playing and it finishes that step and goes on. Press Back and it turns round from where it has got to.
- A dot, **Go to step** with a number, **First step** and **Last step** show that step straight away (one step along plays). With reduced motion on, every move is straight away.
- The **step in view** changes as the move starts, so the caption is always the one for what is playing.
- The timeline does not autoplay: the steps own it. Do not also play it with a node.

## What jumping does with changes your interactions made
A jump shows the timeline's pose at that step. But the learner may have clicked something that changed a layer the timeline never animates, and the timeline cannot undo that. **Back and jumps** in the Steps section decides:

| Setting | Back and jumps |
|---|---|
| **Pose only** (default) | Only the timeline's pose is shown. Layers and values that interactions changed stay as they are |
| **Reset, then pose** | Every layer first goes back to how you authored it (running Animate property tweens stop, other timelines keep their pose), then the pose is shown |

**Next never resets**: it just plays on, so what the learner did in this step is still there in the next. **Variables are never reset** by either setting: use an **On step** node to set them for each step ("when step 3 is chosen, set *answered* to false").

## Step variables and the step list
Turning Steps on creates four variables the player keeps up to date: **step** (the number, from 1), **stepCount**, **stepTitle** and **stepCaption**. Use them in text (\`Step {step} of {stepCount}\`) and [bindings](bindings) (\`step >= stepCount\` for a Next button's *Button disabled*). Tick **Remember** on the step variable to bring a learner back to the step they left on.

Expressions also see \`steps\`, a list with one entry per step: \`step\`, \`title\`, \`caption\`, \`current\` and \`done\`. The step bar's dots are a [repeater](repeaters) over \`steps\`, so there is one dot per marker. A variable or data source of your own called \`steps\` wins.

## Events, nodes and scripts
- **On step** runs when a step is chosen, or (**When**) when its animation has finished. Give a step number to run for that step only. \`event.step\`, \`event.count\`, \`event.title\`, \`event.caption\`, \`event.from\` and \`event.direction\` (1 forward, -1 back) are in scope.
- **Go to step** is the action: next, previous, first, last, or a step number. In a repeated dot use \`event.index + 1\`.
- Scripts have \`ix.steps\`: \`step\`, \`count\`, \`title\`, \`caption\`, \`moving\`, \`next()\`, \`back()\`, \`first()\`, \`last()\` and \`goTo(n)\`.
- In [Results and progress](results), **Complete when** can be **A step-through artboard reaches its last step**.

## Accessibility
- Every step change says "Step 3 of 7: title. caption" through the same live region as the [Announce](accessibility) node (turn it off with **Announce each step**). The first step is not announced.
- Back and Next are real buttons. The dots are focusable (Tab, then Enter or Space), named "Go to step 3: title".
- **Arrow keys step** (on by default): Left and Right go back and forward while focus is inside the player, or when the player is alone in its frame. They are left alone in text fields.

## Scroll to scrub
Pick a frame under **Scroll to scrub** and scrolling it moves the timeline: the top of the scroll is step 1, the bottom is the last step, with the same stretch of scrolling for each step, and the nearest step is the one in view. Next and Back scroll the frame. The frame needs scrolling content taller than itself (a frame's **Scroll** setting, and children that reach past its bottom): **Add a scroll column** makes one, ready to use. Put the story's layers outside it so they stay still while the column scrolls, and put your own words in the column.

## Good to know
- Each artboard has its own steps. A marker's title and caption live on the marker, so editing them in the timeline changes the step bar at once.
- A timeline with no markers has no steps, and then plays as a normal timeline.
- **Turn off Steps** (the bin in the section header) keeps the timeline, markers, variables and step bar.`
  },
  {
    id: "captions",
    title: "Narration, captions and transcript",
    group: "Motion",
    summary: "Put a voice-over on a timeline, caption it by pasting a transcript, and let viewers turn captions on, change their size and jump around with the transcript.",
    keywords: "captions subtitles narration voice over voiceover audio sound transcript srt vtt webvtt waveform speech read aloud closed captions cc accessibility music volume fade deaf hearing",
    body: `A [timeline](timelines) can carry **sound** and **captions**. The sound plays while the timeline plays and stays with it: pause the timeline and it pauses, jump the playhead and it jumps, change the speed and it follows. The captions are timed text that the player draws over the page, with buttons so each viewer can switch them off, make them bigger, or open a **transcript** that jumps the timeline to any line.

## Worked example: narrate a short explanation
![The timeline with a narration clip and its waveform, and four captions under it.](help/narration-timeline.png)

1. Open the **Timeline** tab and pick or make a timeline. In the **Sound** row choose **+ Add sound…** and pick an audio file (**Upload audio…** adds a new one to the project). It appears as a clip with its waveform, starting at the playhead, and the timeline grows to hold it.
2. In the **Captions** row choose **Paste a transcript…**. Paste what the voice says, leave **Timing** on **Across the narration** and press **Make captions**. Each sentence becomes a caption, long ones are split at a comma, and the time is shared out in proportion to the words.
3. Play the timeline (the sound plays in the editor too). Where a caption comes in early or late, drag the caption's edges in the lane, or select it and press **Start = playhead** or **End = playhead** at the right moment.
4. Press **Preview**. The captions show over the page, the **CC**, **A−**, **A+**, **Transcript**, **Sound** and **Pause** buttons sit in the top corner, and pressing a line in the transcript jumps to it.
5. Run the [accessibility check](accessibility-checker). If the narration has no captions, or they cover little of it, it says so.

## Sound
- **Moving and trimming.** Drag a clip to start it later or earlier. Drag its left edge to skip the start of the file, its right edge to stop it sooner. The fields beside the timeline give exact milliseconds.
- **Volume.** The clip has a level, and **volume keys** that multiply it over time: double-click the clip to add one, drag it up and down for the level and sideways for the time. **Fade out** adds two keys for you.
- **Role.** **Narration** (the default) is speech and needs captions. **Music** and **Sound effect** do not. Muting a clip (the **M** button) keeps it in step but silent.
- **It follows the timeline.** The sound plays when the timeline plays forwards inside the clip. It is silent when the timeline is paused, reversed or outside the clip, and it follows the timeline's speed (between a quarter and four times). When a timeline blends in, its sound comes in with it. A timeline that never started stays silent.
- **Speed and pitch.** At another speed a clip keeps its pitch (it is time-stretched, like a browser's own audio player does it), so a voice at 1.25x sounds quicker, not higher. Untick **Keep pitch at other speeds** in the clip's settings for the record-player effect instead: faster is higher, slower is lower.
- **Media keys don't touch it.** Sound plays through the browser's Web Audio, not an audio player of its own, so the keyboard's play/pause key, headphone buttons and the system's media controls don't stop it behind the project's back. Only the project (its timelines and **Play sound**) decides what sounds.
- **When the browser says no.** Browsers will not start sound until the viewer has clicked, tapped or pressed a key. Then the player shows **Sound is waiting. Press to start it**, and any click or key press on the page starts it too. Put a **Start** button in front of an autoplaying narration if the first seconds matter.

## Captions
- **Typing, pasting, importing.** Double-click empty space in a caption lane for a new caption, or use the **Captions** menu: **New caption at the playhead**, **Paste a transcript…**, **Import WebVTT or SRT…**, **Export WebVTT**, **Export SRT** and **Add a language…**.
- **Pasting.** Cut by sentence, line or paragraph. Time them **across the narration** (or the whole timeline), **one per marker** (a [marker](timelines) at the start of each new caption), or **at reading speed**. A transcript with times at the start of its lines ("0:12 Welcome", "[01:05] Next") keeps them.
- **Each caption** has its words, an optional **speaker** (shown as "Dr Lee: …"), and a start and end. **Split at playhead** and **Merge with next** reshape them.
- **Languages.** Add a track per language. With more than one the viewer gets a language menu; the transcript follows.
- **Video layers** take captions too: select the layer and use **Captions** in its settings. They show through the video's own caption display and follow the viewer's CC button.

## What viewers see
Captions are on to start (unless you turn **Captions on to start** off in Project settings) and the viewer's choices (on or off, size, language, sound) are remembered in their browser. The **Captions and narration** section of the Project settings sets the look: the caption box's position, size, colours and font, or **A text layer of my own** (the player fills a text variable, and **Add a caption layer** makes the layer), and whether the buttons show. If you hide them, the **Captions and sound** [node](interaction-nodes) does the same jobs from your own buttons.

## Transcript and screen readers
The transcript is a labelled region of buttons, one per caption, with its time, the speaker and the words; the one showing is marked current. It is the way for a screen reader user to read what is said, so the caption box itself is hidden from screen readers (they would otherwise talk over the narration). Escape closes the transcript and returns focus to its button. Every viewer button works from the keyboard.

## Draft voice
Tick **Read aloud (draft voice)** on a caption track and the player reads each caption aloud with a voice installed on the viewer's computer, as a stand-in until the real recording is made. It uses only voices that run on the device: a voice that sends the words to an internet service is never used, and a device with no suitable voice says nothing. Browsers cannot save speech as a file, so this cannot make a recording for you; record the narration and add it as sound.

## With Steps
A [Steps](steps) timeline can carry sound and captions too: Next plays the narration to the next marker and it stops there. The step's own caption (on the marker) stays a separate thing in the step bar.

## Good to know
- Sound and captions belong to a timeline, so they stop with the artboard. An artboard shown inside another (an instance) brings its own.
- Exported files and share links carry the audio inside them, so a long recording makes a larger file.
- The timeline length is not changed by captions; adding a sound makes the timeline at least as long as the sound.`
  },
  {
    id: "interactions",
    title: "Interactions",
    group: "Interactivity",
    summary: "The node graph: events start a flow, actions do things, logic chooses the way.",
    keywords: "interaction graph node event action logic state machine wire edge connect flow group frame label organise comment box",
    body: `Open the **Interactions** tab. Each artboard has its own graph.

**See-through layers don't take clicks.** While the project plays, a layer that is partly see-through (its opacity under 100%, or a shape whose fill and stroke are all under 100%, say from a tween on *fill.opacity*) lets the pointer through to whatever is underneath: its link, hand cursor, clicks and hovers are off, for it and every layer inside it, until it is fully showing again (a fade-in finishes, for example). Hidden layers never take the pointer. To keep a faded layer clickable, tick **Clickable while see-through** in its **Interactions** section. Paths, polygons and stars also only take the pointer where they're painted, not across their whole box.

![The Interactions section of a layer whose opacity is 50%: the note says it can't be clicked while playing until it is fully showing, and the Clickable while see-through tick overrides that.](help/see-through-toggle.png)

- **Events** (green) start a flow: a click, a key, a timer, a variable changing, a timeline ending, a message from the host page, scrolling, data loading, the artboard starting, or the activity loading.
- **Actions** (blue) do something and continue: **Control timeline**, **Play blend**, **Wait for blend-in**, **Wait for time in timeline**, **Set variable**, **Set property**, **Animate property**, **Show / hide**, **Go to artboard**, **Open URL**, **Play sound**, **Run script**, **Send message**, **Wait** and more.
- **Logic** (purple) chooses where to go: **If** (a **true** and a **false** output), **Toggle** (alternates between **a** and **b**), **Once**, **Sequence** (runs **1**, then **2**, then **3**) and **Random** (continues down one of up to six outputs, picked at random; *Weights* is a list that sets each output's chance, [1, 3] making the second three times as likely, and *Only if* is a list of conditions, so an output whose condition is false is never picked).

![The Interactions tab: the node palette, the graph and the settings of the selected node.](help/interactions-panel.png)

**On pointer** reacts to a click, double click, press, release, hover start and end, the pointer **moving over** a layer, and **dragging** it: *Drag starts* (once the pointer has moved a few pixels with the button held), *Dragging* (on every move after that, even outside the layer) and *Drag ends*. Moves and drags give \`event.x\` and \`event.y\` (artboard coordinates) and \`event.stepX\`, \`event.stepY\` (movement since the last event); drags also give \`event.dx\` and \`event.dy\` (movement since the press), so *Set property* with \`x\` and an expression like \`start + event.dx\` moves a layer with the pointer.

**On key** reacts to a key going down or up anywhere on the page (the page itself, not only the artboard). Leave **Key** empty for any key, or write a name such as \`ArrowLeft\`, \`Enter\`, \`a\` or \`Space\`. Tick **Shift held**, **Ctrl held**, **Alt held** or **Meta held** to ask for a chord; they must all be down. A key held down fires once, unless **Fire again while held** is ticked. \`event.key\`, \`event.code\` and \`event.shift\`, \`event.ctrl\`, \`event.alt\`, \`event.meta\` say what was pressed. Pick a layer in **Only while this layer has focus** to hear the key only while that layer, or a layer inside it, has keyboard focus (the layer becomes a tab stop, and you can use the [Focus layer node](interaction-nodes) to move the focus there); leave it empty to react wherever the focus is.

**Before activity loads** and **On activity load** run once each time the activity is opened, unlike **On start**, which runs every time an artboard is shown. *Before activity loads* runs first, before anything is on screen, and the activity waits for everything it sets off to finish (up to 10 seconds) before it shows: the place for a **Load user data** or a **Set variable** that the first frame should already have. *On activity load* runs once the activity is showing, just before the first *On start*. Both fire on the artboard the activity opens on, so put them in that artboard's graph. **Start over** doesn't run them again.

**On focus** reacts to a layer gaining or losing keyboard focus, which is what tabbing, clicking or the **Focus layer** action does. A layer with an *On focus* node becomes a tab stop; buttons, inputs and links already are, and so is any layer with a click or a button role (see [Accessibility](accessibility)). **Focus layer** gives a layer focus, or clears whatever has it (for example on <kbd>Escape</kbd>).

Drag from an output port to the next node's input to connect them. Actions that take time (**Control timeline**, **Animate property**, **Play sound**) have a **Continue** setting: the next node runs when it finishes, part-way through (a percentage), or straight away. Let go on empty space instead and a menu offers only the nodes that fit (actions and logic when you drag from an output, anything with an output when you drag backwards from an input); the one you pick is added where you let go and connected for you, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd> takes the node and its connection back together (clicking a node only selects it, which is not an undo step). Press <kbd>Escape</kbd> or click away to cancel.

![Dragging a connection into empty space adds a node and joins it.](help/drag-to-connect.mp4)

Click a node in the palette on the left (or drag it onto the graph) to add it; select a node to edit its settings on the right. Settings that name a variable or a sound also offer **+ Create new variable…** or **+ Add a new sound…** in their dropdown, so you don't have to leave the graph. Each node has a **Note** box for a reminder to yourself, and **Delete node** at the bottom.

## Right-click and shortcuts
- Right-click empty graph for **Add node** and **Paste**. Start typing to filter the menu down to the nodes whose name (or description) matches, then use the arrow keys and <kbd>Enter</kbd>, or click one. The menu you get by dragging a connection into empty space filters the same way.
- Right-click a node for **Connect to new node**, **Connect to existing node**, **Disconnect**, **Cut**, **Copy** (<kbd>Ctrl</kbd>+<kbd>C</kbd>), **Duplicate** (<kbd>Ctrl</kbd>+<kbd>D</kbd>), **Help for this node** and **Delete** (<kbd>Del</kbd>).
- With a node selected in the graph, <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> copy and paste that node, not the layers on the artboard. A pasted node keeps its settings but not its connections.
- Right-click a connection to **Delete connection**.

## Groups
A **group** is a labelled frame around nodes that belong together ("Score", "Intro", "Wrong answers"), so a big graph stays readable. It doesn't change what runs.
- Right-click empty graph and choose **New group here**, or right-click a node and choose **Put in a new group** to frame it. Drag more nodes into the frame.
- A node is in a group when its middle is inside the frame. Click the group (its title or any empty space inside it) to select it, and drag it the same way to move it with every node in it; drag its edges or corners to resize it. Right-click inside a group for **Add node here** as well as its own settings.
- Double-click the title to rename it (or **Rename…** in its right-click menu). **Colour** gives it one of a few tints.
- <kbd>Del</kbd> with a group selected, or **Ungroup (keep the nodes)**, takes the frame away. **Delete group and N nodes** takes both.
- Right-click a *layer* on the canvas, choose **Add interaction**, then **On click…** or **On hover…** to add an **On pointer** event with a **Control timeline** action already joined to it.
- In the Inspector, a layer's **Interactions** section lists its events and has **+ On click** and **+ On hover**.

Test in **Preview**: the event list shows each event as it fires. Every node is listed in [Interaction node reference](interaction-nodes). For a walk-through, see [Tutorial 2](tutorial-first-interaction).

## What's in scope
Expression fields can use every variable and data source by name, \`event\` (details of what fired: \`event.key\`, \`event.x\`, \`event.index\` for a repeated copy, \`event.payload\` for a message) and \`Math\`.

## Messages to and from the host page
**Send message** (and \`ix.emit\`) posts \`{source: 'interactives', name, payload}\` to the page the interactive is in. The page can send messages back with \`player.send(name, payload)\` and **On message** reacts. See [Embedding and the player API](embedding).`
  },
  {
    id: "drag-and-drop",
    title: "Drag and drop",
    group: "Interactivity",
    summary: "Layers people can drag, drop zones that take them, and the same thing by keyboard and by tapping: sorting, matching, labelling and small games.",
    keywords: "drag drop draggable drop zone sort sorting match matching label diagram game slot snap swap return bounds axis grid keyboard touch tap accessible tags capacity",
    body: `Any layer can be made **draggable**, and any layer can be a **drop zone** that takes some of the draggable layers. That is all a sorting activity, a matching exercise, a labelled diagram or a jigsaw needs, and it works with a mouse, a finger, a pen, the keyboard and a screen reader.

## A worked example: sort the animals
Two buckets, four cards. Dropping a card in the right bucket keeps it there; dropping it in the wrong one sends it back.

1. Draw two rectangles and name them **Mammals** and **Birds**. Put a text label on each.
2. Select **Mammals**. In the **Drop zone** section of the inspector press **+**. Set **Takes tags** to \`mammal\`. Do the same for **Birds** with the tag \`bird\`.
3. Draw four cards (a rectangle with some text, grouped): *Dog*, *Cat*, *Eagle*, *Owl*. They must be **above** the buckets in the layers list, or the buckets would cover them.
4. Select a card. In the **Draggable** section press **+**. Put its tag in **Tags** (\`mammal\` for Dog and Cat, \`bird\` for the others). Set **Dropped off a zone** to *Goes back to where it started*. Select all four to set that once.
5. Open **Preview**. Drag a card into a bucket. The **Hit areas** button outlines every draggable layer (blue) and drop zone (green, with what it takes and how full it is) while you work out why a drop did not land.
6. Give feedback in **Interactions**: an **On drop** event with **Result** *Taken by the zone* → **Announce** \`event.layer + " is a " + event.zone\`, and one with *Refused by the zone* → **Announce** \`"Not that one. Try again"\`.
7. Score it. On the first card pick a **Zone variable** (a text variable): it always holds the name of the bucket the card is in, or nothing. A zone's **Contents variable** (a list variable) holds the names of the cards in it. Compare them in an expression such as \`mammalsBucket.length == 2\`.

## The Draggable section
- **Can be dragged**: untick to lock the layer. The **Allow dragging** action does the same while the project runs (lock the answers once they are checked).
- **Tags**: words that say what the layer is, separated by commas. A drop zone takes a layer when they share a tag.
- **Moves**: anywhere, or only left and right, or only up and down (a slider handle, a lane).
- **Stays inside**: nothing, its parent, the artboard, or another layer. The layer's whole box is kept inside.
- **Dropped off a zone**: stays where it was let go, or goes back to where the drag began (and to the zone it was in). Off a zone means no zone there, the wrong tag, or a full zone.
- **Zone decided by**: the layer's centre (the default), the pointer, or whichever zone it overlaps most. Use the pointer for a big card going onto a small slot.
- **Grid**: snaps the position to a grid of this many pixels while dragging.
- **Glide**: how long it glides into a zone or back (none when the viewer asked for less motion).
- **Tap to move**, **Hold to drag on touch**, **Key step**, **Name read out**, **Do not announce**: see below.

## Drop zones
- **Takes tags**: leave empty to take any draggable layer.
- **Holds**: how many layers fit (0 is no limit). **When full** either refuses the new layer, or **swaps**: the layer that has been there longest goes to where the dragged one came from, and the dragged one takes its place. Swapping is how slot puzzles and reordering work.
- **Dropped layers**: stay where they were dropped, centre in the zone, or sit at its top left corner. A layer sent by the keyboard, a tap or an action goes to the centre when this is left alone.
- **Outline when a layer is over it**: an outline appears on the zone while a layer it takes is over it (and a fainter one while any such layer is being dragged). Untick it if your artwork shows the state itself.
- A layer can be both: a tile that can be dropped on and then dragged on again.

## Events and actions
- **On drag start**, **On drag over zone** (moves over / off), **On drop** (taken, refused, or dropped on no zone) and **On drag end** (always fires, after On drop, and also when the pick-up is cancelled). Leave the layer empty to hear every draggable layer or zone. Each fires once per drag, however it ends.
- **On drag move** fires over and over while a layer is held and moving (dragged, nudged with Shift+arrows, or sent between zones with the arrow keys), at most once a frame. \`event.layerX\`/\`event.layerY\` say where the layer is, \`event.dx\`/\`event.dy\` how far it has come since it was picked up: set a variable from them to drive a gauge, move another layer along, or play a sound as it crosses a line.
- Their \`event\` holds \`layer\` (the draggable layer's name), \`zone\` (the zone it is in now), \`from\` (where it was), \`accepted\`, \`reason\` (\`tags\` or \`full\`), \`swapped\`, \`tags\`, \`result\` (accepted, rejected, missed or cancelled) and \`keyboard\` (true when it was not dragged).
- **Put layer in drop zone** moves a layer into a zone as if it had been dropped there; **Reset draggable** sends one (or all of them, for *Start again*) back to where it started; **Allow dragging** switches a draggable layer or a drop zone on and off. None of them fires the drag events, so they cannot start a loop.
- The older **On pointer → Dragging** events still work for scripted drags. Use the draggable settings when the point is to move a layer and drop it somewhere.
- Scripts have \`ix.drag.zoneOf('Dog')\`, \`ix.drag.contents('Mammals')\`, \`ix.drag.state()\` (every layer and its zone), \`ix.drag.put(layer, zone)\`, \`ix.drag.reset(layer?)\` and \`ix.drag.enable(layer, on)\`. The page that holds the player can read \`player.dragState()\`.

## Keyboard, touch and screen readers
Everyone should be able to finish the activity, so every drag has two ways that need no dragging.

- **Keyboard** (when [accessibility](accessibility) is on): Tab to a draggable layer, press **Space** or **Enter** to pick it up. The **arrow keys** step through the drop zones that take it (it moves onto each one so you can see it), **Home** and **End** jump to the first and last, **Space** drops it, **Escape** puts it back. With no zone to go to, or with **Shift** held, the arrows nudge it by the *Key step* (Shift: five times as far, Alt: a tenth). A layer with an *On pointer → Click* event keeps Enter for the click and is picked up with Space.
- **Tap to move**: tapping or clicking a draggable layer picks it up, and tapping a drop zone drops it there; tapping the layer again, or anywhere else, puts it back. This is on unless the layer has a click event of its own (the setting can force it on). It is the way to do it for someone who cannot drag at all.
- **Screen readers** hear the layer called a "draggable item", then what happens: picked up, which zone it is on (*Mammals, 1 of 2*, and *full* or *swaps with…* when that applies), dropped in, refused, put back. **Name read out** sets what they call the layer or zone (it uses the text alternative, then the layer name, otherwise). Tick **Do not announce** to say it yourself with Announce nodes. The Preview shows what would be spoken.
- **Touch**: a draggable layer stops the browser scrolling or selecting text under the finger. A layer locked to one axis leaves the other axis for scrolling. Inside a scrolling frame, tick **Hold to drag on touch**: the finger must rest a moment before the layer follows it, so swiping from the layer still scrolls the frame.

## Things to know
- Dragging changes the layer's **X** and **Y**. Do not animate those on a timeline that plays at the same time; animate a group around it instead.
- A pointer drag never changes the layer's parent or its place in the layer order; it is raised above everything while it is held. Drop zones can sit in another group or frame. A frame the viewer has scrolled is allowed for: a zone is found where it is drawn.
- Layers made by a [repeater](repeaters) cannot be dragged (every copy would move). A layer inside an auto layout frame can only be dragged when its **Position** (Layout section) is *Ignore*, otherwise the layout puts it back. The inspector says so.
- Layers that start inside a zone that takes them count as being in it.
- A draggable layer and the zones for it have to be on the same artboard, and in the same instance if they are inside one.
- The accessibility checker counts a draggable layer as interactive, so it asks for a name.`
  },
  {
    id: "interaction-nodes",
    title: "Interaction node reference",
    group: "Interactivity",
    summary: "Every event, action and logic node with its settings.",
    keywords: "nodes catalog reference events actions logic parameters",
    body: () => {
      const section = (title, cat) => `## ${title}

` + CATALOG.filter((d) => d.category === cat).map((d) => {
        const params = d.params.map((p) => `- **${p.label}**${p.help ? `: ${p.help}` : p.options ? `: ${p.options.map((o) => o.label).join(", ")}` : ""}`).join("\n");
        const outs = d.outputs.filter((o) => o.label).map((o) => o.label);
        return `### ${d.label}
${d.description}${outs.length ? ` Outputs: ${outs.join(", ")}.` : ""}

${params}`;
      }).join("\n\n");
      return [section("Events", "event"), section("Actions", "action"), section("Logic", "logic")].join("\n\n");
    }
  },
  {
    id: "question-kit",
    title: "Questions and quizzes",
    group: "Interactivity",
    summary: "Add multiple choice, true/false, fill in the blank, ordering, matching (drag and drop) and hotspot (click the right place) questions that check themselves, with hints, tries, score, shuffle and question banks.",
    keywords: "question quiz test assessment multiple choice true false fill blank ordering sequence matching match drag drop pairs terms definitions hotspot click picture image diagram area region answer correct feedback hint attempts score shuffle bank random self check learning",
    body: `Quizzes without wiring every button by hand. **Add question** (in the **Web** group of the tool bar, which starts folded: click **Web** to open it) builds a question on the open artboard out of ordinary layers, the variables it keeps and a few interaction nodes. Then the **Question** section in the Inspector changes the wording, answers, tries, hints and feedback whenever you like, without touching how it looks.

## Add one

Click **Add question**, pick a type, and a card appears with a prompt, the answers, a Check answer button, a Hint button, feedback text, a score and a Try again button. Edit the prompt and answers in the **Question** section, then press **Preview**.

| Type | The learner | Right when |
|---|---|---|
| Multiple choice (one answer) | picks one option | the picked option is marked right |
| Multiple response | ticks any number | exactly the right ones are ticked |
| True or false | picks True or False | it matches the statement |
| Fill in the blank | types into one or more inputs | each blank matches an accepted answer |
| Put in order | moves items up and down | every item is in its place |
| Matching (drag and drop) | drags each term onto its definition | every term is in its own slot |
| Hotspot (click the right place) | clicks an area of a picture | the picked area is marked right (or all of the right ones) |

## What gets built

Nothing is hidden. The question is a **frame** (named Question 1, Question 2, ...) holding:

- a **Prompt** text, \`{q1_prompt}\`;
- an **answer area**: for choices, one **Option** layer repeated once per option (a [repeater](repeaters) over \`q1_items\`, so you restyle the one template and every option follows); for blanks, a label and an input per blank; for ordering, an **Item** layer with Move up and Move down buttons;
- for matching, a **Terms** pile of draggable layers (one per pair) and a **Matches** column with, per pair, a definition text and a dashed **Slot** (a [drop zone](drag-and-drop) that holds one term); for a hotspot, a **Picture** and, over it, one invisible **Area** layer per area;
- **Hint text**, **Feedback**, and a row of **Check answer**, **Hint**, **Try again** and **Score**.

Every layer is yours: recolour it, change the font, move things around, swap a rectangle for an image, add animation. The layers are bound to the question's variables (for example the option fill follows \`item.selected\` and \`item.state\`), so they keep working. The **Restyle a part** buttons at the bottom of the Question section select a part for you; selecting any part shows a note saying it belongs to the question.

The behaviour is a handful of nodes in the **Interactions** tab, in rows of an event and what it runs: *On start* then **Reset question**; a click on the option then **Choose option**; a click on Check answer then **Check answer**; and so on. Add your own nodes after them. **Check answer** has three outputs: *right*, *wrong*, and *finished* (once the question is locked, because it is right or out of tries), so "when it is right, play the confetti timeline" is one wire.

## Variables

Each question keeps its state in variables named from its **Name prefix** (\`q1\` by default): \`q1_answered\`, \`q1_correct\`, \`q1_attempts\`, \`q1_triesLeft\`, \`q1_score\`, \`q1_locked\`, \`q1_feedback\`, \`q1_hint\`, \`q1_hintsUsed\`, \`q1_hintsLeft\`, \`q1_prompt\` and \`q1_items\` (what is shown, with \`selected\` and \`state\` per row). Use them anywhere: \`q1_score + q2_score\`, a progress bar bound to \`q1_attempts\`, a Next button shown when \`q1_correct\`. Renaming the prefix renames the variables and everything that reads them.

**Score** is the question's points times the share that is right, less **Retry −%** for each check after the first and **Hint −%** for each hint taken. With **Part marks** on, a multiple response, ordering or fill in the blank question is worth the share it got right.

## Worked examples

Two finished ones to play first: **Matching question** and **Hotspot question** on the **Templates** tab, under **Examples**. Press **Make my copy** and change the pairs, or the picture and the right area.

**Multiple choice.** Add question, *Multiple choice*. Type the prompt, type each option, and tick the right one. Set **Tries** to 2 and write a hint. In Preview pick a wrong option and press **Check answer**: the feedback says *Not quite*, and with a try left you can pick again. The second miss locks the question and (if **Show the right answer** is on) marks the right option.

**Multiple response.** Tick every right option. Turn **Part marks** on to give a share of the points for a half-right answer, and write **Partly right** feedback.

**True or false.** Write the statement as the prompt and set **Statement is** to True or False. Edit the two labels for other wording ("Agree" and "Disagree").

**Fill in the blank.** The accepted answers go one per line: \`Paris\`, \`city of light\`. Case and extra spaces are ignored unless you tick **Match case**. A number is compared as a number (\`3\` accepts \`3.0\`), and **± Tolerance** accepts near misses. A line written \`/colou?r/i\` is a pattern. **Add blank** adds another input in the look of the last one.

**Put in order.** List the items in the **right** order; the learner sees them shuffled (the first deal is never already right). Part marks give the share of items in the right place. When the question finishes wrong, the items snap to the right order and the ones that were out of place are marked.

**Matching.** Add question, *Matching (drag and drop)*. Each pair in the Question section is a term and what it matches (a country and its capital, a word and its meaning, a label and a place on a diagram). The learner drags each term into the slot beside a definition, or uses the keyboard: Tab to a term, Space to pick it up, the arrow keys to choose a slot, Space to drop, Escape to put it back (see [Drag and drop](drag-and-drop)). A slot holds one term; dropping another on it swaps them. **Check answer** is right when every term is in its own slot. With **Part marks** the score is the share of terms in the right place, and the feedback says how many (*2 of 4 matched correctly*). When the question finishes, each slot is marked ✓ Right or ✗ Wrong and (with **Show the right answer**) says which term belongs there; the terms stop moving. **Try again** puts the terms back. **Shuffle** deals the terms to different places each time it starts. Add or remove a pair and the layers follow; a new one takes the look of the others. To match labels to a diagram, move the slots over the picture and restyle the terms: they are ordinary layers.

![A matching question: four country names to drag onto their capitals, with dashed slots on the right.](help/question-matching.png)

**Hotspot.** Add question, *Hotspot (click the right place)*. The sample picture is drawn with shapes so the question works straight away: put your own image in its place (delete the shapes in the **Picture** layer, add an image, or give the Picture frame an image fill). Each **Area** in the Question section is a name, a tick for right, and a shape (rectangle, ellipse or polygon); **Edit on canvas** selects its layer so you can move, resize or reshape it with the usual tools, and **Show all areas** selects every one, since they are invisible until a learner picks one. Tick more than one area as right and the learner has to mark all of them (the areas become checkboxes, and **Part marks** score the share). Clicking an area picks it with a ring and a tint; after the question finishes the right areas are marked and *Right answer: Roof* is written under the picture, so it is not shown by colour alone. If clicks near an area should count, **Grow areas 8 px** makes every area bigger on each side (and **Shrink** the reverse). Each area can have its own feedback, said when it is the one clicked.

![A hotspot question over a drawn house: the Roof area is selected and shown with its outline.](help/question-hotspot.png)

## Shuffle

**Shuffle** deals the options (or ordering items, or a matching question's terms) in a new order every time the question starts or resets. In a multiple choice, tick **Stays in place when shuffled** on an option such as "None of these". Feedback and marking follow the option, not its place.

## Question banks from data

Banks work with the choice, true/false, fill in the blank and ordering types. A matching or hotspot question is built from layers you place, so it takes only the prompt, hints, feedback and points from a row.

Tick **Take the question from data** and give the name of a [data source](data-sources) (or part of one, like \`quiz.questions\`). Each row is a question; what a row leaves out stays as set in the Question section (except hints, which come only from the row). With a bank the card's Try again button becomes **Next question**, which draws the next row (**Random** shows every row once before any repeats; **In order** goes round).

Columns a row can have:

| Column | For |
|---|---|
| \`prompt\` | the question text |
| \`options\` | choices, as a list or text separated by \`\\|\` (also the items to order, right order first) |
| \`correct\` | the right choice(s) as text or position counting from 1 (\`B\` or \`2\`, several as \`A\\|C\`); true/false takes \`true\` or \`false\` |
| \`answer\`, \`answer2\` | accepted answers for each blank, several separated by \`\\|\` |
| \`items\` | ordering items, right order first |
| \`hint\`, \`hint2\`, \`feedback\`, \`feedbackCorrect\`, \`feedbackIncorrect\`, \`points\` | as the names say |

A CSV works the same way: the header names are the columns, in any case. The question reloads when its data source finishes loading.

## Results

**Report result** in the Question section adds a *Report result* node after **Check answer**'s *finished* output, sending the question's score (\`q1_score\`) to the project's Results (see the Results settings for the top score, pass mark and completion). With several questions, leave it off and report once yourself, for example a *Report result* node with the score \`q1_score + q2_score\` after the last one.

## Accessible by default

The prompt is a heading, the options are a radio group (or checkboxes) with their text as the name and *Right* / *Wrong* / *This was the right answer* as the description once they are marked, every part is reachable with Tab and operated with Enter and Space, and **Check answer**, **Hint** and the ordering moves announce through the live region (see [Accessibility](accessibility)): the feedback, the hint, "Evaporation, position 2 of 4". Right and wrong are shown with words (✓ Right, ✗ Wrong) as well as colour. A matching question's terms are named buttons that screen readers announce as draggable, picked up and dropped with the keyboard, and told where they landed. A hotspot's areas are focusable radio buttons (checkboxes when several are right) named after the area, so the picture can be answered without a mouse; give every area a name, and the picture an accessible description. These need the Accessibility preference on, which is the default.

## Copies, deleting and changing type

- **Duplicate** a question and the copy shares the original's variables, so the Question section warns and offers **Make this one independent**, which gives the copy its own variables and nodes.
- Changing **Type** rebuilds the answer area (a different set of layers) and keeps the prompt, buttons and feedback as you styled them. Settings that make no sense for the new type are left alone.
- Delete a button you don't want (say Hint): its wiring goes the next time settings change, and nothing else is affected. The Hint button hides itself when the question has no hints.

## Reference

The question frame holds its settings in \`question\`, and each part layer carries a \`questionPart\` marker so the settings can find it again after it is renamed or moved. Both are in the exported file; the player uses the settings and ignores the markers. The nodes are **Check answer**, **Reset question**, **Show hint**, **Choose option** and **Move item** in the [node reference](interaction-nodes). Not yet in the kit: matching (which would use [Drag and drop](drag-and-drop)) and hotspots.
`
  },
  {
    id: "variables",
    title: "Variables",
    group: "Interactivity",
    summary: "Named values (number, text, true/false, colour, choice) shared by the whole project.",
    keywords: "variable state value number string boolean color enum choice options input",
    body: `Variables hold the state of an interactive: a score, a name, whether a panel is open. They belong to the project, so every artboard sees the same values.

Add them in the **Variables** tab. Each has a name, a type and a starting value.

| Type | Holds |
|---|---|
| Number | \`0\`, \`3.5\` |
| Text | \`"Hello"\` |
| True/false | \`true\` or \`false\` |
| Colour | \`#ffb448\` |
| Choice | One of a list of options you define, like \`easy\`, \`medium\`, \`hard\` |
| List | Items, usually objects: \`[{"name": "Ann"}, {"name": "Bo"}]\` |

Choice variables show as a dropdown wherever you set them, so you can't type a value that isn't on the list. In expressions, \`enums.difficulty\` is the list of that choice's options, so \`enums.difficulty.indexOf(difficulty)\` is its position. A solo group's **active child** can be bound straight to a choice whose options are the children's names.

## Lists
A list variable holds the items a [repeater](repeaters) draws: put its name in **Repeat → Items**, and \`item\`/\`index\` are the current one. The starting items are JSON text in the Variables tab. Change the list while it runs with **Set variable**: *Append to list* adds an item (\`{name: "Cy"}\`), *Remove from list* takes out the item at a position (0 is the first), *Empty* clears it, and *Set to* replaces it. In scripts assign a new array: \`ix.vars.people = [...ix.vars.people, {name: 'Cy'}]\`. Text that is not a JSON array makes an empty list.

## Using variables
- In text: \`Score: {score}\`.
- In [bindings](bindings): drive any property from a variable.
- In interactions: **Set variable** (set, add, toggle), **On variable change**.
- On inputs: bind a text field, checkbox or slider to a variable.
- In scripts: \`ix.vars.score += 1\`.
- From the host page: \`player.setVariable('score', 10)\`.

Variable names must be letters, digits and \`_\` so expressions can use them. The name is saved when you leave the field. Tick **Remember** to keep the value between visits (for a score, a saved choice or a name): in the learner's record when the project is played from the Link for StudyDesk, otherwise in their browser. See [Results and progress](results). Press **+ Add variable** to make one, and the bin to delete it. See [Tutorial 3](tutorial-state-machine) for a worked example.

![The Variables tab.](help/variables-panel.png)`
  },
  {
    id: "expressions",
    title: "Expressions",
    group: "Interactivity",
    summary: "Short JavaScript formulas in text, bindings and node settings.",
    keywords: "expression formula javascript template braces condition ternary math",
    body: `An expression is a short formula that gives a value, written in a safe subset of JavaScript. Variables and data sources are in scope by name.

\`\`\`
score + 1
name.toUpperCase()
lives > 0 ? "Play again" : "Game over"
Math.round(progress * 100) + "%"
products.filter(p => p.inStock).length
\`\`\`

## Where they go
- **Text**: anything in \`{braces}\`.
- **Bindings**: a property's value. See [Bindings](bindings).
- **Node settings** marked *expr*, such as Set variable's value or If's condition.
- **Repeat → Items**: the list to repeat over.

In repeated copies, \`item\` and \`index\` are the current list item and its position. In interactions, \`event\` describes what fired.

## Helpers
These work in every expression:

| Call | Gives |
|---|---|
| \`fmt(n, decimals, thousands)\` | A number as text: \`fmt(1234.5, 2, true)\` is \`1,234.50\` |
| \`remap(v, inMin, inMax, outMin, outMax, clamp)\` | One range mapped onto another |
| \`clamp(v, min, max)\` | A number held between two limits |
| \`lookup(v, {a: 1, b: 2}, fallback)\` | The value stored under a key |
| \`pad(n, width)\` | Zero padding: \`pad(7, 3)\` is \`007\` |
| \`enums.name\` | The options of a choice variable |
| \`instanceInput(layer, name)\` | The current value of a variable inside an [instance](instances) layer (by name or id) |

## What you can write
Expressions are read by a small interpreter, not run as JavaScript, so a project can't use them to reach the page. These work:

- **Values**: numbers (\`12\`, \`.5\`, \`1e3\`, \`0xff\`), text in \`"…"\`, \`'…'\` or backticks with \`\${…}\` slots, \`true\`, \`false\`, \`null\`, \`undefined\`, lists \`[1, 2, ...more]\`, objects \`{a: 1, b}\`, and patterns \`/regex/flags\`.
- **Operators**: \`+ - * / % **\`, \`== != === !==\`, \`< > <= >=\`, \`&& || ??\`, \`!\`, \`typeof\`, \`in\`, \`a ? b : c\`, bit operators, and \`,\` inside brackets.
- **Looking inside**: \`a.b\`, \`a[b]\` and \`a?.b\`. Only the values you put there are readable: your variables, data and \`item\`, \`event\`, \`value\`; \`__proto__\`, \`constructor\` and \`prototype\` never are.
- **Calls**: the helpers above, \`Math.*\`, \`Number\`, \`String\`, \`Boolean\`, \`parseInt\`, \`parseFloat\`, \`isNaN\`, \`JSON.parse/stringify\`, \`Object.keys/values/entries\`, \`Array.isArray/from\`, \`Date.now()\` and \`new Date(…)\`, and the usual methods of text (\`slice\`, \`split\`, \`replace\`, \`padStart\`, \`toUpperCase\`…), numbers (\`toFixed\`, \`toLocaleString\`…), lists (\`map\`, \`filter\`, \`find\`, \`some\`, \`every\`, \`reduce\`, \`join\`, \`includes\`, \`slice\`, \`sort\`…) and dates.
- **Arrow functions** for those list methods: \`x => x * 2\`, \`(a, b) => a + b\`. They take plain names and an expression, not a block.

These don't: assignment (\`=\`, \`++\`), statements, \`function\`, \`this\`, loops, \`window\`, \`document\`, \`fetch\`, \`eval\`, and list methods that change a list in place (\`push\`, \`splice\`; \`sort\` and \`reverse\` give a sorted copy and leave the list alone). A slot that can't be read or fails is left as written in text and gives nothing elsewhere. Very large lists or text, and expressions that run for very long, are cut off.

## Patterns (regular expressions)
A \`/pattern/flags\` works with \`match\`, \`matchAll\`, \`search\`, \`replace\`, \`replaceAll\`, \`split\`, \`.test(text)\` and \`.exec(text)\`. Some patterns can make a browser freeze on the wrong text (a pattern like \`(a+)+$\` takes twice as long with every extra character), so patterns are checked before they run. A pattern is refused, with a message, when:

- it has a **backreference** (\`\\1\`, \`\\k<name>\`);
- a **repeated group contains another repetition**: \`(a+)+\`, \`(\\w+\\s?)*\`, \`(.*x){5}\`. Write it flat instead, for example \`[a-z]+\`;
- a repeated group has **alternatives that can start the same way** (letters that differ only in case count as the same with the \`i\` flag), or an alternative that begins with an optional part, or any optional part at all: \`(a|aa)+\`, \`(a|A)+\` with \`i\`, \`(a?b|b)+\` are refused, \`(cat|dog)+\` is fine;
- a repeated group has **more than one optional part**, or one that could also begin the group: \`(a?b?)+\`, \`(\\d\\d?)+\`; \`(\\d{3}-?)+\` is fine;
- the parts that **vary in length but are not open-ended multiply up** past 65,536: \`a?a?a?...\` thirty times followed by thirty \`a\`, or \`a{0,30}\` six times in a row;
- it has **more than 3 open-ended repetitions** (\`*\`, \`+\`, \`{n,}\`) or is **over 300 characters**.

The text a pattern runs over is limited too: 10,000 characters for a pattern with no more than one open-ended repetition, 1,000 with two and 200 with three. Patterns with bounded repetitions such as \`\\w{0,50}\` get a shorter limit still. Longer text gives an error rather than a freeze. Text you pass to \`match\`, \`matchAll\` and \`search\` is a pattern and follows the same rules; to \`replace\`, \`replaceAll\` and \`split\` it is plain text. The rules are cautious on purpose: some harmless patterns, like \`(\\.[a-z]+)+\`, are refused too.

A pattern that gets past these rules still never runs in the browser's own pattern engine, which can't be stopped once it is going. The player runs it with its own matcher, which remembers every place it has been and never works through the same one twice, so how a pattern is written can't make it slow, and each match has a time allowance (and so do all the matches in a page together, such as one pattern run over every row of a long list). A match that uses its allowance gives an error like the other refusals, instead of freezing the page. The matches are the same ones the browser would find (greedy and lazy, groups, \`$1\` and \`$<name>\` in replacements, lookahead and lookbehind, the \`i\`, \`m\`, \`s\`, \`u\`, \`g\`, \`y\` and \`d\` flags). The one difference: the text a group inside a lookbehind (or inside a repeat that can match nothing, \`(a*)*\`) captures can differ in rare corner cases.

In a text layer, a slot whose pattern is refused (or whose text is too long for it) is left as written, braces and all, as in the last line below; elsewhere it gives nothing.

![Three text slots with patterns: the first two work, the third, with a nested repetition, is refused and left as written.](help/patterns-refused.png)

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).`
  },
  {
    id: "bindings",
    title: "Bindings",
    group: "Interactivity",
    summary: "Drive a layer property from a variable, data or expression, live.",
    keywords: "bind binding data binding property drive reactive",
    body: `A binding sets a layer's property from an [expression](expressions), and keeps it up to date as variables and data change. In the **Data bindings** section of the Inspector, press **+ Add binding** (or the **+** in the section's header) and pick the property; type in the search box at the top to find it quickly (*opa* finds Opacity).

Each binding then says where its value comes from:
- **Variable**: pick a variable from the list (search it by name), or **+ New variable…** at the bottom of the list to make one. The property takes that variable's value as it is.
- **Formula**: work the value out from variables, for example \`lives > 0\` for *Visible*, or \`progress * 3\` for *Width*.

Under it, **+ Convert…** changes the value on its way, and the grey line at the bottom works the whole thing through with every variable at its starting value: *value2 is 1 → Look up: no line for 1, so it stays 1 → Opacity is set to 1*. If a binding doesn't do what you expect, that line shows where it goes another way. Bindings are separated by a short rule; the bin removes one.

![The Data bindings section: a binding on the fill colour, and the + Convert… menu.](help/bindings-section.png)

Examples:

| Property | Expression |
|---|---|
| Width | \`progress * 300\` |
| Fill colour | \`correct ? "#2e7d32" : "#c62828"\` |
| Visible | \`step === 3\` |
| Text | \`products[0].name\` |
| Rotation | \`speed * 3\` |
| Solo: active child | \`mode\` (a choice whose options are the children's names) |

A bound property shows a link icon and can't be changed by hand or keyframed until you remove the binding. Every animatable property can be bound; see [Animatable properties](animatable-properties).

The value is made to fit the property: a number property takes a number (\`true\`/\`false\` become 1/0, numeric text is read) and is left as it was if the expression gives something that is not a number; a true/false property takes a boolean; text and colour properties take text.

## Converters
Under a binding, the **+ Convert…** menu changes its value before it is set. They run in order, so a few can be chained.

| Converter | Does |
|---|---|
| Number to text | Decimals, thousands separators, zero padding, text before and after: \`$1,234.50\`, \`42%\` |
| Round | Round, floor or ceil to some decimals |
| Invert (not) | true/false flipped (a number becomes 1 - x) |
| Remap range | One range onto another, optionally kept inside it: 0-1 to 0-100 |
| Look up | A value to anything else. Bound to a **choice** variable, it lists every option for you to fill in. *Otherwise* is used for values not listed |
| To number / text / true/false | Change the type |
| Expression | Any [expression](expressions), with \`value\` as the incoming value |

Anything a converter does can also be written straight into the expression with the helpers (\`fmt\`, \`remap\`, \`lookup\`…), which is what to use in text \`{slots}\`.

Choices and lists work with bindings like any other value: bind a fill colour to a choice through a *Look up* converter, a text layer to \`people.length + " people"\`, or a [repeater](repeaters) to a list variable. Importing a Rive file turns its data bindings on layers into bindings with converters, and its view models into shared variables (see [Importing](import)).`
  },
  {
    id: "scripts",
    title: "Scripts",
    group: "Interactivity",
    summary: "JavaScript with the ix API, run safely in a sandbox.",
    keywords: "script javascript code ix api sandbox quickjs wasm onframe animate await",
    body: `Scripts are JavaScript for what the nodes can't do. Add them in the **Scripts** tab. A script runs on start (tick **Run on start**) or from a **Run script** node; short code can go straight into a **Run code** node.

\`\`\`
const ball = ix.node('Ball');
ix.onFrame((dt) => ball.set('x', (ball.get('x') + dt * 0.1) % ix.artboard.width));
ix.on('reset', () => { ix.vars.score = 0; });
await ix.node('Title').animate('opacity', 1, { duration: 600, ease: 'easeOut' });
\`\`\`

## The ix API
| Call | Does |
|---|---|
| \`ix.vars.name\`, \`ix.get(name)\`, \`ix.set(name, v)\` | Read and write variables |
| \`ix.node('Name')\` | A layer by name or id: \`.get(prop)\`, \`.set(prop, v)\`, \`.show()\`, \`.hide()\`, \`.toggle()\`, \`await .animate(prop, v, {duration, ease})\` |
| \`ix.timeline('Name')\` | \`.play()\`, \`.pause()\`, \`.stop()\`, \`.restart()\`, \`.reverse()\`, \`.seek(ms)\` |
| \`ix.goTo('Artboard', 'fade')\` | Go to another artboard |
| \`ix.emit(name, data)\` / \`ix.on(name, fn)\` | Send messages to the host page / react to them |
| \`ix.announce(text, 'polite' | 'assertive')\` | Say something to screen readers (see [Accessibility](accessibility)) |
| \`ix.setTheme(name)\` / \`ix.getTheme()\` / \`ix.themes()\` | Show a [theme](themes) by name (\`'auto'\` follows the viewer), read the one showing, list them |
| \`ix.record(name, value?)\` | Count that something happened, for [Insights](insights) (a name up to 60 characters, a short value) |
| \`ix.setInstanceInput(layer, name, v)\` / \`ix.getInstanceInput(layer, name)\` / \`ix.fireInstanceTrigger(layer, name, data)\` | Set or read a variable inside an [instance](instances), or send a message into it only |
| \`ix.onFrame((dt, t) => …)\` | Run every frame |
| \`ix.pointer\`, \`ix.artboard\` | Pointer \`{x, y, down}\`, artboard \`{name, width, height}\` |
| \`ix.data.name\`, \`await ix.loadData(name)\` | Data sources |
| \`ix.setCursor('grab')\`, \`ix.log(…)\` | Cursor, logging |

\`.set()\` and \`.animate()\` change the properties in the [Animatable properties](animatable-properties) (position, size, colour, text, visibility, link URL…) and a layer's \`fill\`, \`stroke\`, \`shadow\` and auto layout. Anything else, such as an embed's \`html\`, \`className\`, \`bindings\` or a layer's \`repeat\`, is part of how the project was built: the call throws an error saying so. Links only go to \`http(s)\`, \`mailto\`, \`tel\` or relative addresses.

To paint a layer from a script every frame (generative art, particles, charts), use a [Script layer](script-layers).

## The sandbox
New projects run scripts in a sandbox: a separate JavaScript engine compiled to WebAssembly. Scripts there can only use \`ix\`, timers and \`console\`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped. One thing the sandbox does not hide: \`ix.loadData(name, url)\` fetches the URL the script gives it, from the viewer's browser, so a script can read from, and send data to, the network that way. It follows the project's [data rules](data-sources#what-may-be-loaded): http(s) only, no cookies to other sites, and, if you list **Allowed data hosts** in Project settings, only those hosts. A refused URL makes \`loadData\` throw, so use \`try\`/\`catch\`. Without an allowed-hosts list, only run projects whose scripts you trust. Turn **Run scripts in the sandbox** off in Project settings only for code you trust that needs the page (\`node.element\`, \`fetch\`).`
  },
  {
    id: "script-layers",
    title: "Script layers",
    group: "Interactivity",
    summary: "A layer painted by a script every frame: generative art, particles, charts and custom visualisations.",
    keywords: "script layer draw canvas generative art particles chart graph visualisation visualization animation code g.rect g.circle fps pixel ratio sandbox",
    body: () => `A **Script layer** is a box that a script paints every frame. Use it for things shapes and timelines can't do well: particles, generative art, live charts, custom meters and any other visualisation that is easier to compute than to draw by hand.

Pick the **Script layer** tool (in the **Media** group of the tool bar, which starts folded: click **Media** to open it) and drag a box. It starts with a small script that already runs, and the **Start from** menu in the inspector replaces it with a starter: ${DRAW_TEMPLATES.map((t2) => `**${t2.name}**`).join(", ")}.

## The script

\`\`\`
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
\`\`\`

- \`draw(g, t, dt)\` runs every frame. **t** is seconds since the layer started and **dt** is seconds since its last frame.
- \`setup(g)\` is optional and runs once first.
- The layer is **cleared before every frame**, so draw everything each time. Keep animation state in variables outside \`draw\`.
- Coordinates are layer pixels, 0,0 at the top-left of the box. Resize the layer and \`g.width\` and \`g.height\` follow.
- Read project variables and data with \`ix.vars.name\` and \`ix.data.name\`, as in any [script](scripts). A bar chart can read a list variable, a meter a number. A script layer reads the project; it can't move other layers.

## The drawing API

\`g\` is a small recorder, not a canvas: each call adds a drawing command, and the player paints the list onto a real canvas. Fill and stroke are set first and then used by the shapes that follow.

| Call | Does |
|---|---|
${DRAW_API.map(([sig, what]) => `| \`${sig.replace(/\|/g, "\\|")}\` | ${what.replace(/\|/g, "\\|")} |`).join("\n")}

## Settings

- **FPS**: a frame rate cap. 0 draws on every frame; 30 is plenty for most charts.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the artboard's scale, up to 3. A fixed number is sharper but slower; very large layers are held to what the browser can allocate.
- **Paint while editing**: draws a single still frame on the canvas, at the timeline's time (0 when no timeline is showing), so you can lay out the artboard. Turn it off for a heavy script; the layer then shows as a placeholder. **Preview** always runs it.

The layer is an ordinary layer otherwise: move, rotate, fade, blend, mask and animate it, and click it with an **On pointer** event. Inside the script, \`g.pointer\` gives the pointer in the layer's own pixels (\`x\`, \`y\`, \`down\`, \`inside\`), correct even if the layer is rotated or inside a group.

## Errors and limits

- The script runs in the [sandbox](scripts) when the project has **Run scripts in the sandbox** on (the default): no page, network or storage access, and a frame that takes more than about 100 ms is stopped. Without the sandbox bundle the layer shows nothing.
- An error in the script **stops that layer only**. The message shows under the code, in the layer on the canvas, and in the Preview's event list. Edit the code to start it again.
- A frame is limited to 20,000 drawing commands. Past that, the rest are dropped and a warning is shown. Join many segments into one path with \`g.path\`.
- \`g.random()\` is seeded: the layer draws the same numbers on every run. Call \`g.seed(1)\` at the start of \`draw\` for a picture that stays the same from frame to frame.`
  },
  {
    id: "shader-layers",
    title: "Shader layers",
    group: "Interactivity",
    summary: "A layer painted by a GPU shader: clouds, plasma, ripples, glows, distortion of pictures, and your own GLSL.",
    keywords: "shader glsl webgl gpu fragment effect filter noise clouds plasma ripples glow voronoi grain crt scanlines halftone wave distortion uniform u_time u_mouse u_resolution preset image texture bloom",
    body: () => `A **Shader layer** is a box painted by a small program that runs on the graphics card for every pixel, many times a second. Use it for backgrounds that move, glows, noise, ripples and distortions of pictures: effects that shapes and timelines can't do.

Pick the **Shader layer** tool (in the **Media** group of the tool bar, which starts folded) and drag a box. It starts with drifting clouds, so you have a result at once. The **Start from** menu in the inspector replaces the shader with a preset: ${SHADER_PRESETS.map((p) => `**${p.name}**`).join(", ")}. The presets marked *(image)* filter a picture: choose an image for their \`u_image\` uniform (until you do, they show a built-in test picture).

## The code

You write one function. Everything else (precision, the built-in values, your uniforms) is added for you.

\`\`\`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;          // 0 to 1 across the layer, y up
  float glow = 0.5 + 0.5 * sin(u_time * speed + uv.x * 6.0);
  fragColor = vec4(tint.rgb * glow, 1.0);      // straight alpha
}
\`\`\`

- \`fragCoord\` is the pixel being painted, in canvas pixels with the origin at the **bottom-left**. \`fragColor\` is the colour to paint, with **straight** (not premultiplied) alpha.
- It is GLSL ES: WebGL 2 (ES 3.00) when the browser has it, otherwise WebGL 1 (ES 1.00). Write code that works in both: \`texture2D\` and \`texture\` both work, and loops need constant limits.
- Don't write \`main\` or declare \`uniform\`s for the built-ins: the player does.

## Built-in values

| Name | What |
|---|---|
| \`u_time\` | Seconds since the layer started. Frozen for viewers who prefer reduced motion. |
| \`u_resolution\` | \`vec2\`: the canvas size in pixels. |
| \`u_mouse\` | \`vec3\`: the pointer over the layer, x and y from 0 to 1 (y up), z is 1 while the button is down. Correct even if the layer is rotated or inside a group. |
| \`u_frame\` | Frames drawn so far. |
| \`v_uv\` | \`vec2\`: 0 to 1 across the layer, y up. |

## Uniforms: your own values

The **Uniforms** list gives the shader values you can change. Press **Add a uniform**, choose a type, and give it a **name**: that name is a variable in the code. Types: **Number** (a \`float\`), **Vector 2**, **Vector 3** and **Vector 4** (\`vec2\`, \`vec3\`, \`vec4\`), **Colour** (a \`vec4\` of red, green, blue and alpha, 0 to 1) and **Image** (a \`sampler2D\`, with \`name_size\` as a \`vec2\` of its pixel size, 0 until it has loaded).

- **Animate** them: the **◆** beside a value keys it at the playhead on the timeline. A vector keys each part (x, y, z, w) on its own track, a colour fades between colours, and an image uniform switches picture at each key. The tracks are \`uniforms.<number>.value\`, and \`uniforms.<number>.value.<part>\` for the parts of a vector, counting from 0 in list order.
- **Bind** them to variables in **Data bindings**: pick the uniform from the property list (for example *Uniform speed*) and type an expression, such as \`score / 100\`.
- A name has letters, digits and underscores, can't start with a digit, and can't be a built-in or a GLSL word. A uniform with a bad name is left out and the inspector says why.
- Removing a uniform also removes the tracks and bindings that were aimed at it, and the ones after it move up.

## Settings

- **FPS**: a frame rate cap while it animates. 0 draws on every frame.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the artboard's scale, up to 2. Shaders cost time for every pixel, so a layer is held to about 4 million pixels however large it is: past that it is drawn smaller and stretched.
- **Animate while editing**: runs the shader live on the editor canvas. Off (the default) paints one still frame at the timeline's time (0 when none is showing), which keeps editing smooth. **Preview** always runs it.

## Errors

If the shader doesn't compile, the layer shows a placeholder and the inspector lists each problem with its **line number** in your code; those lines are marked in the editor. The same messages appear in Preview's event list. Other layers carry on. Fix the code and the shader starts again.

## Limits and performance

- All shader layers on a page share **one WebGL context**, so the browser's limit on contexts doesn't apply. Each layer is limited to 24 on a page; extra ones show a placeholder and a warning.
- A shader is **paused while it is off screen** or the browser tab is hidden. A shader that reads neither \`u_time\` nor \`u_mouse\` (it only uses its uniforms) is drawn only when something changes.
- Without WebGL (some remote desktops and very old devices) the layer shows a placeholder and says so.
- **Pictures** you use as image uniforms must come from your project's assets (or a site that allows it); a picture the browser won't hand to WebGL is skipped with a warning.
- **Export**: shader layers work in the single-file export, **.ixp** packages and the embeddable player. A **PNG or SVG picture** of an artboard shows the layer's current frame (at the timeline's time, or 0), not a running animation.

## Shader filter on an image

An **image** layer can draw itself through a shader: **+** in **Effects**, then **Shader filter**. It has the same code editor, uniforms and settings, and \`u_image\` (the layer's own picture, with its fit applied) and \`u_image_size\` are ready to use. The plain picture shows until the shader has drawn, and again if it fails. This works for **image layers only** (not with a 9-slice); other layers can't be filtered this way. To run a shader over something else, make it a **Shader layer** with an image uniform.`
  },
  {
    id: "usage",
    title: "Usage: what uses what",
    group: "Reference",
    summary: "Find where an asset, variable, artboard, script, timeline or data source is used, and clear out what is not.",
    keywords: "usage dependencies dependency graph unused references used by find remove cleanup orphan broken missing",
    body: `![The Usage tab: variables on the left, and what each one is used by on the right.](help/usage-tab.png)

The **Usage** tab (bottom panel) answers "what is this used by?" for the whole project, and shows what nothing uses.

Pick a group along the top (**Artboards**, **Assets**, **Variables**, **Data**, **Scripts**, **Timelines**, **Layers**) and an item on the left. The right side lists everything that uses it. **Click an entry to jump there**: layers are selected on the canvas, artboards and timelines are opened, and interactions open the **Interactions** tab on that node. Scripts and data sources open their tab.

A yellow **unused** flag marks items nothing refers to, and the number on each group is how many there are. Tick **Unused only** to list just those.

## What counts as a use

- **Assets**: image and video layers, image fills and strokes, cursor images, artboard backgrounds, fonts, data files and *Play sound* nodes.
- **Artboards**: instances, *Go to artboard* nodes, and being the start artboard.
- **Variables**: input fields bound to them, bindings, text and link templates (\`{score}\`), repeaters, joysticks, blends, instance inputs, and interaction nodes that name them or use them in an expression.
- **Data sources**: the same expressions, plus *Load data* and *On data loaded* nodes, and being a font or data file.
- **Scripts**: *Run script* nodes, or having *Run on start* ticked.
- **Timelines**: *Control timeline*, *On timeline end* and *On timeline marker* nodes, joysticks, blends, autoplay, and scripts that name them.
- **Layers** tab: layers that a constraint, an interaction node or a timeline track points at.

Uses found by reading script or *Run code* text are marked **?**. A name in code can match something that is not really a use, so check before deleting something that is used only by a **?**.

## Removing unused assets

**Remove unused assets** deletes every asset flagged unused, after a confirmation that lists them. It only ever touches assets, and the project text is searched for the asset's id before it is called unused. The removal can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, but the uploaded file itself is deleted from the server, so you would need to upload it again.

## Broken references

The **Broken** group lists references that point at something that has been deleted, such as a button that targets a layer that no longer exists. Click one to go to the thing holding the reference and fix it.`
  },
  {
    id: "themes",
    title: "Themes and colour tokens",
    group: "Design",
    summary: "Name a colour once, give it a value for Light, Dark and High contrast, and let layers follow it.",
    keywords: "theme themes token tokens colour color dark mode light high contrast prefers-color-scheme prefers-contrast forced colours moodle css variables bs-primary setTheme style styles palette contrast",
    body: `![The Themes tab: the starter tokens down the side with their Light, Dark and High contrast colours, and the contrast check.](help/themes-panel.png)

A **token** is a name for a colour, like \`color/primary\`. A **theme** (Light, Dark, High contrast) is a column of values for those names. A fill, stroke, gradient stop, shadow, text or rich text colour that **uses a token** changes when the theme does. A colour that is just a colour never changes. A **new project** starts with the three themes and the starter tokens already in it, the artboard on the Light background, and every layer you add follows the tokens, so it looks right in Dark and High contrast without you picking anything. Projects made before this, and imported ones, have none until you add them in the Themes tab, and behave exactly as before.

## The Themes panel
Open the **Themes** tab (bottom panel). A new project already has the starter themes. For one without (an older or imported project), **Add Light, Dark and High contrast** makes the three themes and the starter tokens, in the same look as the StudyDesk toolbox: its greys, and its gold for buttons with black, bolder text.
- **color/background**, **color/surface** and **color/surface-muted** are the page, a card and a hover or quiet grey. **color/text** and **color/muted** are the copy on them.
- **color/button** and **color/on-button** are the gold button and its black label. **color/primary** and **color/on-primary** are the accent for selections, which in the toolbox is the same gold. **color/link** is the toolbox's hyperlink blue, used by new Link layers.
- **color/border** is the outline of controls, **color/divider** a quiet line, and **color/focus** the keyboard focus ring.
- **color/success**, **color/error** and **color/warning** each come with a **-surface** tint, for the right, wrong and missed answers.

**Toolbox colours come from the shared StudyDesk palette and stay in step with it.** Light is the toolbox exactly as the toolbox draws itself: each token takes the palette colour the toolbox uses for that job (cards are the palette's grey 1, text grey 7, outlines and quiet text grey 4, buttons the primary button colours, the accent and focus ring the primary gold), read from \`/styles/palette.min.css\`. A token made this way remembers the palette colour it came from, shown by a small link mark beside its colour. Whenever the editor opens the project it refreshes those colours from the live palette, and the player does the same when the page it runs in can reach \`/styles/palette.min.css\`, so a change to the palette reaches published pieces without re-editing them. **Change a colour by hand and that colour stops following the palette.** If the palette can't be reached (an exported file, offline, another host) the last stored colour is used. Dark and High contrast are built for contrast and take their colours from the same palette where it has suitable ones; a few tints and lighter or darker shades are mixed from two palette colours.

Dark and High contrast are the same names with values made for them. Then:
- Each row is a token, each column a theme. Click a colour to change it. **Used** counts the places that follow the token.
- **+ Theme** copies the default theme. **+ Token** adds a row. Rename either; layers keep following a renamed token.
- A theme can answer to a **Light** or **Dark scheme**, be marked **High contrast**, and be the **Default**. These decide which theme a viewer gets (see below).
- **Showing** (and the theme box in the top bar) picks the theme the canvas draws while you edit. It is not saved with the project. Pictures, SVG and PNG exports, and Lottie, write the colours of the theme being shown.
- **Convert colour styles to tokens** makes a token from every colour style, with its colour in every theme to start with. Layers that follow a style keep following it, now through the token. Styles from a library convert too, and a library update keeps the link.
- **Update starter colours** shows on a project made before this look that still has the old starter tokens. It gives the tokens you never edited the new values and adds the ones the project lacks. Layers that follow those tokens change with them; plain colours and tokens you edited do not. Nothing changes until you press it.
- The count at the top says how many plain colours are **not following a theme**.

## Using a token
In any colour picker in the inspector, open the arrow beside the swatch and choose the **Tokens** tab. Pick a token and the swatch shows a ring and link badge, and a named chip replaces the hex box with the token's value in each theme underneath. The **x** on the chip **detaches** it: the colour as it is now stays, as a plain colour. Choosing any other colour does the same.

## New layers, questions and starters
A new button is gold with black, bolder text, an input has a grey outline, a shape is a neutral grey, text is the toolbox black. In a project that has the starter tokens, new layers, the [question kit](question-kit) and the step bar follow those tokens instead, so a new layer looks right in Dark and High contrast without you picking anything. In a project with no tokens they get the same colours as plain ones. The built-in [starters](templates) come with the themes and use the tokens.

## Imported files keep plain colours
Lottie, Rive, PSD, SVG and package imports bring their colours in as plain colours. Nothing guesses which colour "is" the primary. Mixing plain and token colours in one project is normal.

## Contrast
- The Themes panel checks the pairs that matter in every theme, by token name: **color/text** and **color/muted** on **color/background**, **color/surface** and **color/surface-muted**, **color/on-primary** on **color/primary**, **color/on-button** on **color/button**, each of **success**, **error** and **warning** on its surface, and **color/primary**, **color/border** and **color/focus** against **color/background** and **color/surface**. Dark and High contrast pass every one. **Light does not, and that is expected:** it is the shared StudyDesk palette as the toolbox uses it, and these pairs fall below WCAG AA in it: muted text on background 2.59:1, muted text on surface 2.38:1, muted text on muted surface 1.96:1, primary on background 1.75:1, link on background 3.60:1, link on surface 3.30:1, outline against background 2.59:1, outline against surface 2.38:1, focus ring on background 1.75:1, focus ring on surface 1.61:1, success on its surface 3.90:1, error on its surface 3.13:1, warning on its surface 2.67:1. The Themes panel and the [Accessibility checker](accessibility-checker) report them as they are and are not told to ignore them. Choose different colours for a piece that has to pass. A pair that is too low shows its ratio on the cell and in the list.
- The [Accessibility checker](accessibility-checker) checks text contrast in every theme, not only the one shown. A finding that starts "In Dark:" is about Dark. It offers no automatic fix for text that follows a token, since a fix would write a plain colour over the token.
- **Theme colour on a fixed colour** is a warning for text that follows a token but sits on a plain colour. The theme changes one and not the other, so white text on a plain white card goes unreadable in Dark.

## How the finished interactive picks a theme
In this order:
1. The page or a script chose one: \`player.setTheme('Dark')\`, \`ix.setTheme('Dark')\`, the **Set theme** action, or \`theme="Dark"\` on \`<interactives-player>\`. A message \`{ target: 'interactives', type: 'setTheme', theme: 'Dark' }\` to the single-file export does the same.
2. Otherwise, with **Follow the viewer's settings** on (the default): a **High contrast** theme for a viewer who asks for more contrast (\`prefers-contrast: more\`) or uses forced colours, a **Dark scheme** theme for \`prefers-color-scheme: dark\`, else the default theme. It changes live when the viewer's setting does.
3. \`"auto"\` or \`null\` in step 1 goes back to step 2.

\`player.getTheme()\` / \`ix.getTheme()\` give the name showing and \`ix.themes()\` the list. A \`themechange\` event (\`ix-theme\` on the element, with \`{ id, name }\`) says when it changed. The player's stage carries \`data-ix-theme\`.

**Preview** has a theme box (a theme, or follow the viewer), a **Viewer** box to pretend dark mode or more contrast is on, and, with the page option below, a **Host** box.

## Taking colours from the page
Tick **Map tokens from the page's CSS variables** and a token is read from a CSS variable on the page that holds the player before the theme's own value. The **Moodle** preset maps the starter names onto Bootstrap's: \`color/primary\` and \`color/button\` to \`--bs-primary\`, \`color/on-button\` to \`--bs-white\`, \`color/background\` to \`--bs-body-bg\`, \`color/text\` to \`--bs-body-color\`, \`color/muted\` to \`--bs-secondary-color\`, \`color/border\` to \`--bs-border-color\`, and so on. Type your own variable names (comma separated, tried in order) beside a token to map any other. A missing or odd variable just leaves the theme's colour, and only plain colours are accepted. A High contrast theme is never replaced by the page's colours. The player option \`hostVariables: false\` ignores all of this.

## Not yet
Tokens are colours only. Fonts, radii and spacing are not tokens. Colours inside script and shader layers, captions settings, and images do not follow themes. A keyframe that animates a colour between two token colours snaps instead of blending.`
  },
  {
    id: "accessibility-checker",
    title: "Accessibility checker",
    group: "Reference",
    summary: "Find contrast, keyboard, label, autoplay and flashing problems per artboard, fix the safe ones, and export a report for sign-off.",
    keywords: "accessibility a11y wcag contrast check checker audit screen reader keyboard aria label alt text description captions autoplay reduced motion flashing seizure target size report sign off compliance",
    body: `![The Accessibility tab: findings listed under their artboard on the left, and on the right what was found, why it matters, what to do and a fix button.](help/accessibility-checker.png)

The **Accessibility** tab (bottom panel) runs a set of automatic checks over the whole project and lists what it found, artboard by artboard. It is there so you find out while you are designing, not from an audit at the end.

**It lists checks found. It does not say the project is accessible or that it complies with WCAG.** Some problems cannot be seen by a program, and some checks cannot be sure; those come back as **to look at** and a person decides. What the checks cannot see is listed under [What it cannot see](accessibility-checker#what-it-cannot-see), and in every exported report.

## Reading the list

Each finding has a coloured dot:

- **Problem** (red): a check found a problem, for example grey text on white at 2.8:1 when it needs 4.5:1.
- **Probable** (amber): probably a problem, and a person decides, for example a picture with no description (it might be decoration).
- **To look at** (blue): the checker could not tell, for example text over a photo that is only partly dark, a video (it cannot hear captions) or embedded HTML.

Click a finding to **select the layer** (and open its artboard). The right side says what was found, with the numbers, **why it matters** to the person using the page in plain words, **what to do**, and which WCAG 2.2 success criteria it speaks to. The dots at the top are filters: click one to hide that group.

## The checks

| Check | Looks for |
|---|---|
| **Text contrast** | Text colour against what is behind it (in every [theme](themes) when the project has colour tokens): layers drawn under the text, solid fills, gradients (every stop must pass), pictures (sampled from the file) and the layer's own opacity. Normal text needs 4.5:1, large text (24 px, or 18.66 px and bold) needs 3:1. Rich text is checked run by run. |
| **Small text** | Text under 12 px on the artboard, counting the scale of any group it is in. This is a rule of thumb, not a WCAG number. |
| **Needs a mouse or touch** | A layer that reacts to a click, hover or drag, is not a Button or link, and has no *On key* interaction that does the same thing. |
| **No name for assistive technology** | Clickable layers, buttons, links and fields with no text and no ARIA label. A field named only by its placeholder is a probable problem. |
| **No description** | Pictures, videos and embedded pages with no ARIA label. Script and shader layers are listed to look at. |
| **Small click target** | Anything clicked or used that is under 24 by 24 px. |
| **Animation starts by itself** | Autoplay timelines when the project does not respect reduced motion. |
| **No way to pause moving content** | An autoplaying timeline that loops or runs over 5 seconds, with no *Control timeline* node set to pause, stop or toggle it. |
| **Video starts by itself** | Autoplay video with sound or without controls. Also a timeline that plays sound on its own when the viewer buttons are hidden and nothing mutes or pauses it. |
| **Flashing** | A timeline that makes a large layer (a tenth of the artboard or more) go bright and dark more than three times in a second. |
| **Video and narration need captions** | Narration on a timeline with no captions is an issue, and captions that cover under half of it a warning (music and effects are left alone; see [Narration, captions and transcript](captions)). A video layer with imported captions passes; one without is listed to look at, since a program cannot tell if the file has them. |
| **Page title** | The project has no title. |

### How contrast is worked out

The checker does not take a screenshot. It reads the layers: the artboard background, then everything drawn before the text, in drawing order, at a grid of points over the part of the box the words fill. Where a gradient or a picture is behind the text it takes the range of colours there. If every point passes, there is no finding. If every point fails, it is a problem. If some pass and some do not, or the colour behind cannot be known (a video, a shader, a script layer, a blend mode, a freeform shape), it says **to look at** instead of guessing. Pictures are sampled from the asset file at a coarse resolution once they have loaded.

A binding or timeline that changes a colour while the page runs is not followed: only the starting colour is checked, and the finding says so.

## Fixing

When a fix is safe, the finding has a **Fix** button, and a green **fix** tag in the list.

- **Text contrast**: moves the text colour toward black or white by the smallest amount that passes. Not offered when the colour comes from a style, a binding, or a faded parent.
- **Small text**: raises it to 12 px. Check the layout around it.
- **Names and descriptions**: type the label and press **Apply** (or Enter). A layer name that reads like a name ("Logo") is offered as the starting text; "Rectangle 4" is not.
- **Autoplay**: turns on *Respect reduced motion*, mutes a video, shows its controls.
- **Page title**: uses the project name.

Every fix is one undo step. **Apply quick fixes** does every fix that needs no typing in the current list at once. Nothing is fixed behind your back.

## Marking reviewed

For a finding you have looked at and accepted ("it is decoration", "the captions are in the player"), use **Mark reviewed**. It leaves the finding out of the counts, and the report lists it with the date. The marks are kept in this browser, per project, and do not travel with the file.

## Exporting a report

**Export report** downloads one printable HTML page: a summary per artboard, every finding with why it matters and what to do, which ones were reviewed, the checks that ran, what was not checked, and a box to sign. **CSV** downloads the findings as a spreadsheet.

## What it cannot see

- Whether text is right: reading order, headings, plain language, the page language.
- Anything a script or code node does, and embedded HTML or pages.
- Whether a video has captions or audio description.
- Colour as the only way to tell things apart, and text that is part of a picture.
- Flashing that does not come from a timeline.
- Tab order and focus rings. Layer order sets the Tab order.

Test with a keyboard, a screen reader and your own eyes as well.`
  },
  // ---------------------------------------------------------------- data
  {
    id: "data-sources",
    title: "Data sources",
    group: "Data",
    summary: "JSON, CSV, TSV or text from an uploaded file or a URL, used by name.",
    keywords: "data json csv tsv text url fetch api spreadsheet refresh cors",
    body: `Open the **Data** tab and add a source **From file** (upload) or **From URL** (fetched by the player).

- **Format**: JSON, CSV or TSV (first row is the column names), or plain text. CSV and TSV become a list of rows, with numbers and true/false converted.
- **URL**: fetched as soon as you press Enter or leave the field. **Reload** fetches it again.
- **Refresh** (URLs): fetch again every n seconds; 0 loads once.
- The preview on the right shows what was loaded, with the field names you can use.

Use a source by its **name** anywhere expressions go: \`{products.length} products\`, a binding \`products[0].price\`, or **Repeat → Items** \`products\`. Scripts read \`ix.data.products\`.

**Load data** reloads a source (optionally from a different URL); **On data loaded** fires when it arrives. The host page can push data with \`player.setData('products', [...])\`.

## What may be loaded
Every data request, from a source, the **Load data** node or \`ix.loadData(name, url)\`, follows the same rules:

- Only \`http:\` and \`https:\` addresses load, plus \`blob:\` and \`data:\` addresses up to 1,000,000 characters. \`file:\`, \`javascript:\` and anything else is refused.
- Cookies and logins are sent only to the page's own site, never to another site.
- Relative addresses and the page's own site always work.
- **Allowed data hosts** (Project settings) is an optional list. Leave it empty to allow any http(s) host. Once it has entries, other sites must match one: \`api.example.com\`, \`*.example.com\` (its subdomains, not \`example.com\` itself), \`example.com:8080\` (an entry without a port matches any port), or a full origin like \`https://api.example.com\` (that scheme and port only). A redirect to a site off the list is refused too. Files uploaded to the project are not affected.

A refused request loads nothing and writes a warning to the console; in a script, \`ix.loadData\` throws.

> URLs must allow cross-origin requests (CORS) from wherever the interactive is published.`
  },
  {
    id: "repeaters",
    title: "Repeated lists",
    group: "Data",
    summary: "Copy a layer once per item in a list, with item and index in scope.",
    keywords: "repeat repeater list loop for each item index grid table",
    body: `Select a group or frame and, in its **Repeat (list)** section, tick **Repeat the first child for each item**. Its **first child** is then copied once per item in **Items** (an expression that gives a list, like \`products\` or \`[1, 2, 3]\`).

**Items** can be a [data source](data-sources) or a *List* [variable](variables): the repeater redraws when the list changes, so a *Set variable* node that appends to the list adds a row.

Inside the copies, \`item\` is the current item and \`index\` its position (from 0): \`{index + 1}. {item.name} - {item.price}\`.

**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best). A grid has a **Fill** direction: *Rows first* goes across each row and then down (1 2 3 / 4 5 6 / 7), *Columns first* goes down each column and then across (1 4 7 / 2 5 / 3 6), with **Cols** still the number of columns.

**Instances in a repeater** can take their [inputs](instances) from the item: select the instance, open *Bindings*, add *Input <name>* and write an expression such as \`item.title\` or \`item.score * 10\`. Every copy then shows its own item's values, and follows the list when it changes.

Clicks on a copy fire **On pointer** for the template layer with \`event.index\`, so \`products[event.index]\` is the item that was clicked.`
  },
  {
    id: "results",
    title: "Results and progress",
    group: "Getting started",
    summary: "Report a score and completion, remember progress between visits, and see how learners did.",
    keywords: "results score pass mark completion complete report progress remember resume start over attempts learners studydesk lms grade save load user data",
    body: `A project can report how a learner did and remember where they were, so closing the page does not lose their progress.

## Set it up
Open **Results and progress** in the Project section of the Inspector (click an empty part of the canvas).

| Setting | Meaning |
|---|---|
| Score variable | The number variable that holds the score |
| Top score | The score that counts as 100% (the default is 100). A score above it is reported as 100% |
| Pass mark | Tick it and give a percentage to report pass or fail as well as the score |
| Complete when | **Report result node only**, **Reaching an artboard**, **A variable turns on** (a true/false one), **Score meets the pass mark** or **A step-through artboard reaches its last step** (see [Steps](steps)). Completing reports the result once |
| Resume on the same artboard | A returning learner opens on the artboard they left |

Then tick **Remember** on each variable that should keep its value between visits (the Variables tab).

## Report result and Start over
- **Report result** (action node) sends the result: *Complete* marks this attempt complete, *Score so far* reports the score without completing. Leave **Score** empty to use the score variable, or give an expression such as \`correct * 10\`. In scripts: \`ix.report({ completed: true, score: 7 })\`.
- **Start over** (action node, or \`ix.startOver()\`) puts every variable back to its starting value, clears remembered progress, counts a new attempt and shows the start artboard. Nothing after it in the same flow runs. Scripts keep their own state.
- \`ix.result\` reads the result as it stands, \`{completed, score, max, percent, passed}\`. Reading it reports nothing.

## Where it goes
The player works with no server: with nothing else around it, **Remember** keeps values in the browser and a reported result goes nowhere (the page around an iframe also receives it as a message).

Inside StudyDesk, give learners the **Link for StudyDesk** from [Share link](export#share-link) rather than the share link. It plays the same project, and keeps one record per learner per course in the Toolbox's own database: completion, score, pass or fail, attempts and the remembered variables. Learners are identified by their StudyDesk session. The same link also counts what learners do for [Insights](insights). Someone opening it with no session plays as normal and their progress stays in their own browser. Nothing is sent to the LMS gradebook yet.

## Save user data and Load user data
**Remember** keeps a variable's value all the time, on its own. When you'd rather choose the moment, use the two action nodes instead: **Save user data** keeps the variables you tick, as they are right then (say, when the learner presses *Submit*), and **Load user data** puts them back on a later visit. Put the load in **Before activity loads** so the values are in place before anything shows. *Load user data* goes on from **Loaded** when anything came back, and from **Nothing saved** on a first visit, so you can set up a fresh start there.

They go to the same places as remembered progress: on the **Link for StudyDesk**, one record per learner per course, kept by their StudyDesk session; with no session, in an export, or in Preview, in the browser. Each save only changes the variables it names. User data is kept apart from remembered progress and from results, so **Clear results** and **Start over** leave it alone; deleting the project deletes it.

## See the results
**View results…** in this section, or **Results…** in Share link, shows learners, the percentage who completed and passed, the average best score and attempts, and a row per learner. It is for the project's owner. **Clear results** deletes every record for the project (handy after testing).

## Good to know
- A result is what the learner's browser says. It is good for tracking progress, not for marks that must be tamper-proof.
- The project's share link has to be on: results are only kept while it is.
- **Update to the latest version** in Share link after changing these settings, so the link plays the new version.`
  },
  {
    id: "insights",
    title: "Insights: what learners did",
    group: "Getting started",
    summary: "See where learners go, click and struggle: artboards reached, a click heat map, steps, answers to each question and your own records, as counts.",
    keywords: "insights analytics records record learners activity funnel heat map heatmap clicks steps answers questions struggle csv export privacy consent studydesk",
    body: `The **Insights** tab (bottom panel) answers "where do learners get stuck?" with counts. It shows nothing until learners have played the project from the **Link for StudyDesk** (see [Share link](export#share-link)) while signed in to StudyDesk.

## What you see
- **Learners, visits, clicks, answers checked.** A learner is one StudyDesk user however many times they came back. A visit is one time the page was opened.
- **Artboards reached.** A bar per artboard, in the project's order, of how many different learners saw it, and what share of the people who reached the start artboard that is. A big drop between two bars is where people left, or where nothing led them on.
- **Steps reached** for each step-through artboard, so you can see which step people stopped at.
- **One card per question.** How many learners answered, how many checks were right, how many were right the first time, and a bar for how often each option was chosen (the right answer in green). An option nobody chose shows as zero. Typed and ordered answers are only counted as right or wrong.
- **Where learners clicked.** The buttons, links and clickable layers learners clicked most. Tick **Click heat on the canvas** to draw every click over the artboard you are editing: blue is a few, red is many. Clicks that land on nothing show up too, which is how you find the thing people expected to be clickable.
- **Your records**, from the *Record* node and \`ix.record\`.
- **Courses**, when the project is used in more than one.

Choose how far back to count (7 days to all time) and press **Refresh**. **Export CSV** downloads every count in a spreadsheet-friendly file.

## Your own records
Add a **Record** action node (Interactions tab) anywhere in a flow: give it a **Name** ("opened hint") and, if you like, a **Value** (an expression: a choice, a level, a score band). Insights counts how often each name happened, how many learners it happened to, and how often each value came up. In scripts: \`ix.record('chose route', 'B')\`. Names are cut at 60 characters and values at 120.

## What is and is not recorded
- Automatic records: an artboard was shown, a click (where, and which button or link), a step was reached, and a question was checked (right or wrong, which options were chosen).
- Nothing a learner types is recorded. A typed answer is only marked right or wrong.
- Insights shows counts and numbers of different learners. It never lists a learner. With only a handful of learners a count can be one person, so wait for more before drawing conclusions.
- The records go to the Toolbox's usual analytics as the learner's StudyDesk session (the same way every other toolbox item is counted), so the people who read those reports can see which user they came from. Tell learners what is counted, the way you would for any other usage statistics.
- A page load sends at most 500 records, 300 of them clicks.
- Switch recording off, or any kind of automatic record, in **Learner records** in the Project section (click an empty part of the canvas). Off means off: Record nodes send nothing either.
- The player on its own sends nothing anywhere. A standalone export, the editor's Preview and a plain share link keep no records. Only the Link for StudyDesk passes them on.

## Good to know
- Records are the learner's browser's word, so they are good for seeing patterns, not for proof.
- Only the project's owner (and power users) can open Insights.
- **Update to the latest version** in Share link after changing record settings or adding Record nodes, so the link plays the new version.`
  },
  {
    id: "public-interface",
    title: "Public interface: inputs and outputs for developers",
    group: "Import and export",
    summary: "List the variables and messages a page that embeds the project may use, with descriptions; get a reference page, TypeScript definitions, player.describe() and web component options.",
    keywords: "public interface inputs outputs host embed developer api attributes input- inputs lazy loading poster start click pause offscreen describe typescript d.ts reference page web component restrict messages ix-variable ix-message postMessage",
    body: `Someone who embeds your project should not have to read through it to find which variables and messages are meant for them. The **Public interface** tab (bottom panel) is that list.

## The list
- **Variables** are marked **Input** (the page sets it), **Output** (the page reads it) or **Both**, each with a description. They are held by the variable, not its name: rename a variable and the row says so, with **Use the new name** to accept it (the page then has to change too).
- **Messages** are the ones the project **receives** from the page (the ones *On message* nodes and \`ix.on\` handlers listen for) and the ones it **sends** (*Send message* nodes and \`ix.emit\`). Each can have a description and a payload shape: nothing, text, number, true or false, anything, or an object with named fields.
- **Add from what the project uses** finds every message in the project's flows and scripts, and the variables its flows and controls work with. A message found but not listed shows as a **+** button under the messages. Pick any other variable from **Add a variable…**.
- A row is flagged when a listed variable was renamed or deleted, or when no node or script sends or listens for a listed message.

## What you get
- **Reference page** (button in the tab, and **Export > Public interface reference**): inputs, outputs, messages, the element options and a worked embed example, as a page you can send to a developer. A \`${PACKAGE_EXTENSION}\` package of a project with a public interface also holds it as \`reference.html\`, with \`interface.d.ts\` beside it.
- **TypeScript definitions** (the **.d.ts** button, **Export > TypeScript definitions**): types for each input, output and message, and a player type whose \`setVariable\`, \`getVariable\`, \`send\` and \`on\` know your names.
- **player.describe()** returns the same list at run time: \`{ title, declared, restrictInputs, variables: [{ name, type, direction, description, initial, options }], messages: [{ name, direction, description, payload }], issues }\`.
- **Exporting asks first** when the list no longer matches the project (renamed or deleted variables, messages nothing handles), so an embed does not break without anyone knowing.

## Embedding with options
\`\`\`html
<script src="interactives-player.iife.js"><\/script>
<interactives-player src="quiz.ixp" style="width:800px;height:600px"
    loading="lazy" poster="quiz.jpg" pause-offscreen
    input-level="hard" input-learnername="Sam"></interactives-player>
<script>
  const el = document.querySelector('interactives-player');
  el.addEventListener('ix-variable', (e) => console.log(e.detail.name, e.detail.value)); // outputs
  el.addEventListener('ix-message', (e) => console.log(e.detail.name, e.detail.payload));
  el.addEventListener('ix-ready', () => el.player.send('addToCart', { sku: 'A1' }));
<\/script>
\`\`\`
- **\`input-<name>="value"\`** and a JSON **\`inputs='{"level": "hard"}'\`** attribute set variables before the first frame, and again whenever they change. Names are matched ignoring case (attribute names are lower case). Values are converted to the variable's type: a number must be a number, a choice must be one of its options, a list must be JSON. A value that does not fit is skipped with a console warning.
- **\`loading="lazy"\`**: the project is not fetched until the element is within 200 px of the viewport.
- **\`poster="image"\`**: an image shows until the project is ready (and while it waits to load).
- **\`start="click"\`**: the poster (or a plain box) with a play button, and nothing loads until it is used. \`el.start()\` does the same from script. The click also lets the browser play sound.
- **\`pause-offscreen\`**: timelines and sound pause while the element is not on screen, and carry on when it comes back.
- **\`label\`**: the play button's accessible name.
- Outputs arrive as **\`ix-variable\`** events (\`detail\` is \`{ name, value, previous }\`) and, from the single-file export inside an iframe, as \`{ source: 'interactives-variable', name, value }\` posted to the parent page. Only variables listed as outputs are announced.

## Only public inputs can be set from outside
Off by default, so embeds that already exist keep working. Turn it on and attributes on the element, and \`{ target: 'interactives', type: 'setVariable' | 'send' }\` messages from the page around an exported file, can only set the **Input** and **Both** variables and send the **Received** messages on the list. Anything else is refused with a console warning. Code that holds the player object (\`el.player.setVariable\`) is the page's own code and is not held to it.

## Good to know
- The list is documentation first. Nothing about how the project plays changes when you add to it, apart from this option.
- Message names found in scripts are only the ones written out as text (\`ix.emit('done')\`), not names built from other values. Add those by hand.
- **Update to the latest version** in Share link after changing the list, so the link plays the new version.`
  },
  {
    id: "project-settings",
    title: "Project settings",
    group: "Getting started",
    summary: "Start artboard, fit, page title, fonts, sandbox and reduced motion.",
    keywords: "settings start artboard fit scale page title background fonts sandbox reduced motion",
    body: `![The Project section of the Inspector, with Allowed data hosts filled in and the library and reduced motion boxes below it.](help/project-settings.png)

Click an empty part of the canvas, or an artboard's name, to see the **Project** settings in the Inspector (below the artboard's own).

| Setting | Meaning |
|---|---|
| Name | The project's name, as on the projects page |
| Page title | The title of the browser tab for the exported page |
| Description | A note about the project, kept in the file |
| Fit | How the artboard scales to the space it's given: **Contain (letterbox)**, **Cover (crop)**, **Stretch**, **Fit width (page height follows)** or **Actual size** |
| Page background | The colour around the artboard in the exported page |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Run embedded HTML in the page | Only shown while the sandbox box above is off. Lets Embed layers with HTML reach the page, for HTML you wrote and trust. See [Web elements](web-elements) |
| Allowed data hosts | Hosts that data may be loaded from, one per line (\`api.example.com\`, \`*.example.com\`). Empty allows any http(s) host. See [Data sources](data-sources#what-may-be-loaded) |
| This project is a library | Shares the artboards you publish, with the project's styles and assets, as components for other projects. See [Libraries](libraries) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |
| Results and progress | The score, pass mark and when the project counts as complete. See [Results and progress](results) |
| Start artboard | Shown first in the player: set with **Make start artboard** on an artboard |
| Fonts | The fonts the project loads. **Add a Google font…** is a search box over every Google font (type, then <kbd>Enter</kbd> or click; the chips narrow it by Sans, Serif, Display, Handwriting or Mono), or upload font files in the **Assets** panel. New projects start with Open Sans. Choosing a font for a text layer adds it here by itself |`
  },
  // ---------------------------------------------------------------- import/export
  {
    id: "import",
    title: "Importing Lottie, Rive (.riv and .rev), Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft and SVG",
    group: "Import and export",
    summary: "Bring in Lottie JSON / dotLottie, Rive .riv and Rive editor .rev files, Photoshop .psd files, Illustrator .ai files, PDFs, AutoCAD DXF (and what to do with DWG), VectorCraft .vectorcraft and PhotoCraft .pcraft files, SVG and project packages.",
    keywords: "import vectorcraft drawcraft photocraft pcraft lottie dotlottie rive riv rev editor project backup svg after effects bodymovin convert photoshop psd layers illustrator ai pdf autocad cad dxf dwg drawing plan layers artboards vector link linked embed watch reimport re-import update new version source file changes reconnect",
    body: `| File | Becomes | Update from file |
|---|---|---|
| Lottie (\`.json\`, \`.lottie\`) | An artboard and a timeline | No |
| Rive (\`.riv\`) | An artboard for each Rive artboard, with timelines, state machines and bindings | No |
| Rive editor project (\`.rev\`) | The same, plus the layer names and the artboards a \`.riv\` export leaves out | No |
| Photoshop (\`.psd\`) | An artboard of layers, with editable text | Yes |
| Illustrator (\`.ai\`) and PDF | An artboard per page, as vector art | Yes |
| AutoCAD (\`.dxf\`) | An artboard with a group per CAD layer (\`.dwg\` must be saved as DXF first) | Yes |
| VectorCraft, PhotoCraft | Artboards of layers | Yes |
| SVG | A group of editable shapes | No |

New to this? [Tutorial 4](tutorial-import-design) walks through an import step by step.

Lottie, Rive (\`.riv\` or \`.rev\`), Photoshop, Illustrator, PDF, AutoCAD (\`.dxf\`), VectorCraft and PhotoCraft files: use **+ Import file as artboard** in the Layers panel (adds artboards to this project) or on the projects page (makes a new project). A \`.psd\`, \`.ai\`, \`.pdf\` or \`.dxf\` file dropped on the canvas also becomes new artboards.

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients (with their exact start and end points, centre and radius, see [exact gradient points](fill-stroke#exact-gradient-points); they are written out the same way), transforms, trim paths and keyframes with easing become layers and a timeline. Text animators with range selectors become [text modifiers](text-modifiers). Expressions, layer masks, track mattes, layer effects, skew and time remapping are not carried over, and the import report lists what was dropped.

## Rive (.riv)
![A Rive file after import: each Rive artboard is an artboard, with its animations as timelines and its state machine as interactions.](help/rive-import-result.png)

Each Rive artboard becomes an artboard: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Shape morphing (animated path points), holes, clipping shapes (a clip shape that follows another shape keeps following it) and the translation, rotation, scale, transform and follow path constraints (with factors, limits and local space) are carried over, and so are bones, skins (weights), image meshes, and IK and distance constraints (see [Bones and skinning](bones)); other constraints are not. A transition's blend time becomes a **Blend in** on the next state's *Control timeline* or *Play blend* (a percentage of the old animation is converted to milliseconds, disabled transitions are skipped), with its mix curve as the blend easing, the state left running on under it (or frozen, for *pause on exit*) and *early exit* as *Can be left early*; a state that is being mixed into cannot be left until the mix is done, unless that allows it (a trigger pressed meanwhile is lost, as in Rive). An exit time becomes a **Wait for time in timeline**. Transitions out of one state that carry different random weights become one **Random** node (up to six; a weight of 0 is never picked). Transitions from the Any state are not held up by a mix in progress. Layout padding, margins and gaps given as percentages stay percentages (a share of the width of the layout around them, the way Rive does it, so they follow the layout when it is resized), and absolute insets given as percentages are worked out against the layout's size (and fixed at the file's size); a layout's border widths take room inside it like padding, auto margins push a layer to the end, and a gap between wrapped lines keeps its own value. Rectangles and layouts with a different radius on each corner keep them, and dash lengths given as a share of the outline become pixels (fixed at the file's size). A fill and a stroke that Rive draws in a mixed order keep that [paint order](fill-stroke#paint-order). A text box's vertical alignment, overflow (clip, ellipsis) and no-wrap come in; paragraph spacing comes in too (as the layer's *Paragraph spacing*); shrink-to-fit does not. Rive centres a stroke on its outline, so a stroked rectangle or ellipse comes in a stroke-width bigger to keep the same outer edge. State machine layers that start an animation from any state with nothing to wait for (the looping animations of an icon) start when the artboard does. A transition that has an exit time at the end of the animation and also conditions is taken as soon as both hold, even when the conditions come true long after the animation finished (a splash that plays once and waits for a button); with no exit time and nothing to wait for it is taken the moment the state is entered. An entry transition that has conditions leaves the layer idle until they hold. Actions on a state or a transition (set a view model property when it is entered, left, started or finished) become *Set variable* nodes. A layer's open-link event does not fire when the artboard starts, and one link is not opened twice within two seconds. Listeners on a nested artboard (the buttons of a layout built from several artboards) change the shared view model variables the main artboard's state machine reads. In play, an imported Rive artboard lets the pointer through every layer except the ones its listeners name (the artboard's **pointerThrough** setting in a saved project), so a hidden panel or a picture on top of a button does not stop its click, as in Rive.

Rive **listeners** import as events: pointer enter, exit, press, release, click, move and drag as *On pointer*, **keyboard listeners** as *On key* (the key, its modifiers, and the down, repeat and up phases; the key codes are the ones Rive uses, so letters, digits, arrows, function and numpad keys all map), and **focus** and **blur** listeners as *On focus*, with Rive's focus actions as *Focus layer* (focus traversal actions are not imported). A keyboard listener on a layer imports with *Only while this layer has focus* set to it, so it hears the key only while that layer (or one inside it) has the focus, as in Rive; one on the artboard reacts wherever the focus is. Rive has no scroll-wheel listener, so there is nothing to import there; gamepad, text input and semantic listeners are listed in the report. **Nested artboards** keep their starting inputs, and what Rive does to their inputs comes in too: a listener action that sets a nested number or bool or fires a nested trigger becomes *Set instance input* or *Fire instance trigger* (a nested bool that Rive toggles flips what it is now: the instance's input is read back with \`instanceInput()\`). Keys on a nested bool or trigger in an animation become [timeline markers](timelines) (named like *Badge: flag = true*) with an *On timeline marker* flow, and a nested number animated between keys becomes a track on the instance's input (*Input level*), so it tweens (see [instances](instances)). A **9-slice image** (an image with slice axes) imports with its insets, and tile modes become **Fill edges**; Rive scales such an image to resize it, so the box is resized here and the corners keep their size (when the scale is animated the scale is kept instead). N-sliced groups, which resize a group's shapes, import as plain groups.

Rive pointer listeners are tested **by shape**, the way the Rive runtime does it: a listener's target is under the pointer where the shapes inside it cover (their fill, whatever its colour or opacity, not their stroke and not the box around them), and every target is tested on its own, so regions that overlap are all hovered. Targets entered at the same moment act from the front of the layers to the back, so the one lowest in the layers has the last word (that is what Rive answers at an overlap). Layers that are not shown (a [solo](groups-frames) that has moved on) are not in the way. A state's animation that has played out keeps its last pose while the machine stays in that state, over the layers before it, as in Rive (it matters when a later layer holds a region view that an earlier layer's hover exit would otherwise put away). Re-import a Rive file made before this to get it.

Rive **events** become messages: a *Send message* node with the event's name, and its custom properties as the payload (an object, e.g. \`event.payload.power\`). An event keyed on an animation becomes a [timeline marker](timelines) with an *On timeline marker* node; events fired by listeners and by states or transitions (at their start or end) become *Send message* nodes in those flows, and Rive event listeners become *On message* nodes. An **audio event** also plays its embedded sound (a *Play sound* node, with the audio stored as a project asset), and an **open URL event** also opens its link (an *Open URL* node). Audio that is hosted on Rive's CDN instead of embedded is skipped, and the import report says so.

Rive **gradients** keep their exact start and end points (a radial one its centre and radius), moved into the layer's box, so they land where Rive draws them and stay put when the layer is resized; keys on the points and on the stops' colours and positions become timeline tracks (see [exact gradient points](fill-stroke#exact-gradient-points)). **Text** boxes can animate their height and origin: a fixed-size text box keeps its top left where Rive keeps it while its height or origin is keyed (lines that no longer fit are clipped or cut with an ellipsis as the box shrinks, and the vertical alignment follows the box), while the height of auto-width and auto-height text is worked out from its text, as in Rive, and its keys are ignored. **Actions on states and transitions** that set a view model property (at the start or end of a state or a transition) become *Set variable* nodes in the state's flow, next to the ones for Rive events.

Rive **view models** become shared [variables](variables): numbers, true/false, text, colours, triggers (a count that goes up when it fires) and enums (a *Choice* with the enum's options), and a list property becomes a *List* of the first items' values. Transitions and listeners that read or write them keep working. **Data binds on layers** (a view model value driving a layer's position, rotation, scale, opacity, text, fill or stroke colour, stroke width and so on) become [bindings](bindings), with the bind's converters (to text with decimals, rounding, boolean negate, range mapper, add, subtract, multiply, divide, to number, string pad and trim, formulas that are plain arithmetic) as converters. Two-way and to-source binds are brought in one way only (value to layer), and interpolating converters apply instantly.

Rive **joysticks** become [joysticks](joysticks): a joystick that has a handle layer gets that layer and its rectangle as the **Handle** and **Area**, so the timelines follow where the handle sits (inverted axes are turned round, and a joystick without a handle keeps its set position). A *listener action that aligns a layer to the pointer* (what moves a joystick handle on drag) becomes *Set property* nodes that set the layer's x and y from the pointer. Keys that move a joystick's own x and y are not imported.

Rive **layer masks** become [masks](groups-frames#masks): the masked layer goes in a group with a masking copy of the source layer (a shape, a group of shapes, an image) in front of it, and the source itself is hidden unless the mask says it keeps drawing. Inverted, luminance and inverted luminance masks keep their mode (see *Mask mode* in [Groups and frames](groups-frames#masks)); custom bounds and the mask resolution are ignored, and the report lists those.

Rive **text modifiers** become [text modifiers](text-modifiers): each range of a group is one modifier, with the group's move, turn, scale and fade (the units are letters, words or lines, ranges by percent or by index, with the offset, strength and falloff) and keys on a range or group follow onto it. Falloffs import as the *Falloff* shape, which matches Rive letter for letter (it was measured against Rive's own runtime), and ranges that combine by subtracting, multiplying, min or max, ranges limited to one text run, text follow path and per-letter variable font axes are not imported; the report lists them.

Rive **scroll constraints** make the layout a scrollable [frame](groups-frames) in the direction they scroll, and the browser scrolls it. Elastic bounce and momentum, snapping, endless and virtualised lists, drag speed and a starting offset are not imported, and neither are scroll bars (the browser draws its own). A scroll constraint the viewer cannot drag is skipped.

Rive **artboard component lists** become a frame that repeats an [instance](instances) of the item artboard once per item of the list [variable](variables), laid out along the parent's direction with its gap. Each item shows its own values: the properties of the item's view model that the item artboard reads become that instance's inputs, bound to the matching fields of the item (*Input title* bound to \`item.title\`; nested view models as \`item.style.color\`), and those variables are one per instance rather than shared. A list that shows different artboards for different kinds of items shows the first, and a list without a list property or an item artboard is skipped.


## Rive editor project (.rev)
A \`.rev\` is the file the Rive editor itself saves (the project or a backup of it), as opposed to the \`.riv\` it exports for playing. It opens through the same import as a \`.riv\`, so everything above applies, and an artboard comes out the same as the one from the \`.riv\` exported from that project. What the editor file adds:

- **Layer names.** An export strips the names of everything but artboards, animations and state machines; the editor file still has them, so layers keep names like *Hover* or *Shape 7* instead of *Group*.
- **Artboards the export leaves out.** Every artboard in the project comes in, in the order the file has them, with the project's default artboard first.
- Only fonts, images and sounds something uses come in; the editor also keeps the files it was given and never used.

The editor's own organisation (folders, the original SVG files that were imported, the position of states in the state machine graph, built-in enum tables) is skipped. Nothing about the format is published, so the reader was written from real files: if a \`.rev\` holds something it does not understand, the report says so and carries on with the rest, and a file it cannot read at all fails with a message. Export a \`.riv\` from the Rive editor and import that if it does.
## Photoshop (.psd)
![A Photoshop file after import: layers, a live text layer, and hidden layers kept hidden.](help/psd-import-result.png)

The document becomes an artboard of the same size. Every pixel layer becomes an image layer (stored as a PNG asset) at its position, folders become groups, and the layer name, visibility, opacity (including fill opacity) and blend modes carry over: normal, dissolve, multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge (add), difference, exclusion, hue, saturation, color and luminosity. Modes a browser can't draw come in as the nearest one there is, and the report lists them: linear burn as multiply, darker color as darken, lighter color as lighten, vivid, linear and pin light and hard mix as hard light, and divide as color dodge. 8 and 16 bit RGB and grayscale files import as layers. Indexed colour and CMYK files (and files with no layers) import as one flattened picture, and 32 bit, bitmap, Lab, duotone and multichannel files are not supported. Layers with nothing in them are skipped without comment.

**Text layers** become real, editable text layers: the text, font, size, colour, alignment, line height, letter spacing (tracking) and bold, italic, underline and strikethrough, with a style run for each stretch that differs (so a heading with one red word stays one layer). Photoshop stores a font as a PostScript name such as \`Montserrat-SemiBold\`; the importer turns it into a family and weight. Families that are Google fonts are added to the project's fonts so they load; any other font keeps its name and shows only where that font is installed, so check the font field in the inspector. Point text (a click on the canvas) becomes a box that does not wrap, paragraph text (a dragged box) keeps its width and height. Text with a layer mask stays real text, with the mask over it. Only text Photoshop warps, sets vertically or stores in a way the importer can't read stays a picture of its pixels. That layer is named after the text with **(text as picture)**, shows with the picture icon in the Layers panel (real text has the **T**), and the import report lists it by name with the reason, so you know which ones to retype.

**Clipping groups.** In Photoshop a layer set to *Create clipping mask* only shows inside the layer below it. Each such base and its clipped layers become a group named after the base with "(clipped)" added: the base, then a copy of the base used as a [mask](groups-frames#masks) (a picture masks by its transparency), then the clipped layers. The group carries the base's opacity and blend mode. Move or resize the base and its mask copy together, or delete the mask copy to stop the clipping.

**Masks.** A layer's pixel mask is baked into the layer's transparency. A folder's pixel mask becomes a mask picture placed over the folder, inside a wrapper group. A vector mask becomes a path layer used as a mask, in a group with the layer (edit the path to reshape the cut-out); the outline of a shape layer is not a mask and is left alone.

Not carried over, and listed in the report: layer styles and effects (shadows, strokes, glows), adjustment layers, smart-object filters, the subtract blend mode (it imports as normal), and layer comps. Each layer is stored at its full size, so a large document with many layers makes a big project.

## Illustrator (.ai) and PDF
Illustrator saves a PDF inside its files when **Create PDF Compatible File** is ticked in the save options (it is by default). The importer reads that PDF, so a \`.ai\` file saved without it can't be imported: you'll see "Save the file with 'Create PDF Compatible File' ticked", and re-saving from Illustrator fixes it. Ordinary \`.pdf\` files import the same way.

Every page becomes an artboard of the page's size (the trim box when the file has one), laid out side by side. A file with one artboard gives an artboard named after the file; with several, each is named *file / Artboard 2* and so on.

What you get is editable vector art:

- **Paths** become path layers, with fills, strokes (width, caps, joins, dashes) and even-odd fills. The positions and any scaling or rotation are applied to the points, so every shape sits where it was.
- **Colours** in grayscale, RGB, CMYK, spot (separation) and indexed spaces; CMYK is converted with an approximation, so print colours can look a little different on screen.
- **Gradients**: linear and radial gradients (axial and radial shadings) become linear and radial fills. A radial gradient is centred on its shape.
- **Clipping** becomes a [mask](groups-frames#masks): a group holding a path used as a mask in front of the layers it clips. Clips that cover everything inside them are dropped.
- **Opacity** (fill and stroke) and these blend modes: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, difference, exclusion, hue, saturation, color and luminosity.
- **Text** becomes text layers with the font name, size and colour. Pieces on one baseline join into one layer, and following lines in the same style become one multi-line layer. Fonts are matched by name, so install or [choose](text) the real font if it isn't available. Text that has no Unicode mapping in the file may show wrong characters.
- **Pictures** become image layers (PNG assets, or the original JPEG), with soft masks as transparency and stencil masks in the fill colour.
- **Layers**: Illustrator's layers become groups with the layer's name, and hidden layers stay hidden.

Not carried over, and listed in the report: pattern fills, gradient meshes, opacity masks, blend modes outside the list, live effects (the PDF holds what they produced, as paths or pictures), overprint, Type 3 fonts, JPEG 2000 and fax pictures, and encrypted files. Artboard names can't be read from the file, so they are numbered.

## AutoCAD (.dxf, and .dwg)
![An AutoCAD drawing after import: lines, a hatch and text as editable layers.](help/dxf-import-result.png)

A **DXF** file becomes one artboard of editable vector layers, named after the file. ASCII and binary DXF both work. Only the **model space** is imported; paper space layouts (sheets) are skipped and reported. If the file has nothing in the model space, its paper space is imported instead.

- **Fitting.** The drawing is scaled evenly, with the y axis flipped (CAD has y up), so its longest side is 1600 px, plus a 20 px margin. The report tells you the scale ("1 px = 5 mm") from the file's drawing units. Objects on layers that are off or frozen don't count when fitting. If a stray object far from the drawing would shrink it, the artboard shows the extents saved in the file instead and says so.
- **Layers.** Each DXF layer becomes a group with the layer's name, in the file's order. Layers that are off or frozen are imported hidden, so you can show them again. A layer with hundreds of plain lines has them merged into a few path layers (per colour, width and dash) to keep the project light.
- **Shapes.** Lines, polylines (with arc segments), circles, arcs, ellipses, splines (as cubic curves), points, solids, 3D faces (outline only) and leaders become path layers. Hatches become filled paths with their holes (even-odd), and gradient hatches become a two colour gradient.
- **Blocks.** Block inserts are expanded in place, including nested blocks, scale, rotation, mirroring and row / column arrays. Layer 0 and BYBLOCK properties follow the insert. Dimensions are drawn from the shapes AutoCAD saved with them. Attributes become text.
- **Text.** TEXT and MTEXT become text layers with their height, rotation and alignment. Formatting codes are removed and stacked fractions become *a/b*. CAD fonts aren't in the file as real fonts, so the text uses the default font and the box is an estimate: check long labels.
- **Colours.** AutoCAD colour numbers, BYLAYER, BYBLOCK and true colours all work. White (and AutoCAD's colour 7) is drawn **black**, because the artboard is white.
- **Line weights and linetypes.** CAD lines are thin, so lines without a weight are 1 px; a weight of 0.25 mm is 1 px, 0.5 mm is 2 px, 1 mm is 4 px (up to 14 px). Linetypes (dashed, dotted, ...) become dash patterns, scaled by the file's linetype scale.

Not carried over, and listed in the report: hatch pattern lines (a pattern hatch is a light tint of its colour), images, 3D solids and surfaces, multileaders, external references, infinite lines, mesh surfaces and proxy objects.

**DWG files** (the AutoCAD drawing format itself) can't be read directly: you'll see "DWG version AC1032 (AutoCAD 2018 and later): save it as DXF from your CAD program". In AutoCAD, BricsCAD, DraftSight, LibreCAD and similar, use **File > Save As > DXF** (any version; R2000 or later keeps the most) and import that file. Like Photoshop and Illustrator files, a DXF can be updated later with **Update from file…**.

## VectorCraft (.vectorcraft)
A VectorCraft file (and the older \`.drawcraft\` name) is read as editable vector art. Each artboard in the file becomes an artboard (one artboard is named after the file, several are named *file - Artboard name*), holding the artwork that touches it.

- **Layers and groups** become groups with the same name; hidden stays hidden, and opacity and these blend modes are kept: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge, difference, exclusion, hue, saturation, color and luminosity. A clip group or clipped layer becomes a [mask](groups-frames#masks) in front of what it clips.
- **Paths and compound paths** become path layers. Solid, linear and radial gradient fills and strokes (width, caps, joins, dashes) are kept, and an object with several fills or strokes becomes a group with one path layer for each. CMYK, gray and Lab colours are converted to RGB with a simple formula, so print colours can look a little different.
- **Live objects**: shapes keep their outline, symbols are placed as copies, Repeat objects (radial, grid, mirror) become copies, and a Blend between two paths with the same points gets its steps. Envelope distortions are not applied: the art stays undistorted. Gradient meshes become flat patches.
- **Text** becomes text layers (font, size, colour, tracking, leading, alignment and style runs). Fonts are matched by name, so check the font field when a family is not one of the Google fonts.
- **Pictures** become image layers. A picture linked to a file on disk comes across only when VectorCraft saved its preview in the file.
- **Effects**: drop shadow and outer glow become the layer's shadow, and Gaussian blur its blur.

Not carried over, and listed in the report: opacity masks, pattern fills, brushes and variable-width strokes, arrowheads, inside and outside stroke alignment, type on a path, other live effects, placed documents, and blend modes outside the list.

## PhotoCraft (.pcraft)
A PhotoCraft file is read like a Photoshop file: pixel layers become image layers (PNG assets), folders become groups, and an artboard folder becomes an artboard.

- Opacity (times fill opacity), blend modes, visibility, **clipping layers** (as in Photoshop: a group with a copy of the base used as a mask), layer masks (baked into the pixels, or a mask picture for text, shapes and folders) and vector masks (a path used as a mask).
- **Text** becomes text layers: font, size, colour, tracking, leading, alignment and style runs. Warped, vertical and on-a-path text keeps its rendered pixels.
- **Shape layers** become path layers with fill, gradient and stroke; **fill layers** become a rectangle over the canvas. Smart objects use their rendered pixels.
- A drop shadow becomes the layer's shadow.

Not carried over, and listed in the report: adjustment layers, other layer styles, pattern fills, blend modes outside the list, and mask feather. A file that is a folder rather than a ZIP archive has to be zipped first. If nothing can be rebuilt, the flattened picture saved in the file is imported instead.

## SVG
Drop an SVG file on the canvas, paste it, or pick it with the **Image** tool. It becomes a group of editable vector layers: shapes and paths (with their transforms applied), groups, solid and gradient fills, strokes and dashes, and simple text. Masks, filters, patterns and embedded images are listed as not carried over.

## Updating a design file
A Photoshop, Illustrator, PDF, AutoCAD (DXF), VectorCraft or PhotoCraft file is copied into the project when you import it, and its artboards remember which file they came from. When the designer saves a new version, bring it in with **Update from file…**:
- Select one of its artboards: the inspector's **Source file** section says **From Poster.psd (Photoshop, updated 2 h ago)** and has **Update from file…**.
- Or open the **Assets** panel: **Design files** at the top lists each file with **Update…**.

Pick the new version (it can have a new name; the artboards then say they came from that one). The editor can't notice a file changing on your computer by itself, since it runs in a web page, so updating is always this one step.

How a re-import merges (your edits are kept):
- Layers are matched by name (in the same folder, the nth layer of a repeated name), and a layer renamed in the file is recognised by its picture or text and position.
- A property (position, size, opacity, visibility, text, style, ...) the file changed is updated **unless you changed it too**: what you edited stays. Pictures that changed in the file are replaced; one you swapped for another picture stays.
- New layers in the file appear in their place in the layer order. Layers you added yourself, and all timelines, interactions and bindings, are left alone.
- A layer the file no longer has is removed. If you gave it keys, interactions or bindings it stays instead, hidden, and is renamed "(removed from file)", so nothing you built is lost. A layer you deleted here stays deleted.
- One undo step undoes a whole re-import. Pictures the file no longer uses are kept in the project (so undo can bring them back); they show as unused in the Usage tab, and **Remove unused assets** deletes them. A toast says what happened ("Poster.psd updated: 3 layers changed, 1 added").

**Forget source file**, under the button, drops the connection: the layers stay as they are and **Update from file** goes away.

Artboards that were *linked* to a file on disk before (an older way of doing this, in Chrome and Edge only) keep **Re-import now** and **Watch for changes** beside **Update from file…** in the browser that linked them.

After an import, a report lists anything that couldn't be carried over exactly. It is the whole list: nothing is skipped without a note. Press the **×** to close it.

![An import report for a DXF file.](help/import-report-dxf.png)`
  },
  {
    id: "export",
    title: "Exporting",
    group: "Import and export",
    summary: "Single HTML file, project package, JSON, Lottie, PNG and SVG.",
    keywords: "export download html single file package ixp json lottie png svg image publish",
    body: `**Export** in the top bar:

| Export | Gives you |
|---|---|
| Single HTML file | One file with the player, the project and every asset. Upload or embed it anywhere; it works offline. |
| Project package (${PACKAGE_EXTENSION}) | The whole project with assets, to re-import or play with the player library |
| Project JSON | The document only, without asset files |
| Public interface reference…, TypeScript definitions (.d.ts) | What a page that embeds the project can set, read and hear, as a reference page and typed names. See [Public interface](public-interface). These three exports ask first when the list no longer matches the project |
| Lottie JSON (this artboard), dotLottie (this artboard) | The open artboard's shapes and timeline, for Lottie players (no interactivity). A report lists what couldn't be written |
| PNG image (this artboard), PNG image, 1× | The open artboard as a picture, at 2× or at actual size, at the timeline's playhead |
| SVG image (this artboard) | The open artboard as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |

Sharing is on its own button, **Share**, next to Export (below).

The files are named after the project (and the artboard, for pictures and Lottie).

![The Export menu.](help/export-menu.png)

## Sharing
**Share** in the top bar (next to Export) has three ways to share a project:

| Share | Gives you |
|---|---|
| Share link… | A link that plays the project in the browser (below), and a second one, the **Link for StudyDesk**, that keeps learners' results |
| Invite to collaborate… | People who can open and edit the project with you, live, found by name, email or username (see [Collaborating](live-editing#inviting-people)) |
| Save as template… | A copy other people (or you) start new projects from, with a checklist of what to change (see [Templates](templates#save-as-template)) |
| Share for review… | A link where reviewers look at the project and leave comments, without editing it (see [Review comments](comments)) |

![The Share menu.](help/share-menu.png)

Export gives you **files**; Share gives you **links and people**. Nothing under Share downloads anything.

## Share link
**Share → Share link** publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it); links are long and random so they can't be guessed. It is a snapshot: press **Update to the latest version** to publish later changes, or **Turn off link** to stop it working (after you confirm, the link shows a "turned off" page). **Copy** copies the link and **Open** opens it in a new tab.

![The Share link dialog.](help/share-link-dialog.png)

**Link for StudyDesk** plays the same project but keeps each signed-in learner's score, completion and progress. Use it in StudyDesk when you set a score or tick **Remember** on variables, and see [Results and progress](results). **Results…** shows how learners did.

That link opens the **learner page**: a small page around your project that knows who the learner is from their StudyDesk session. It gives the project the learner's saved progress, keeps their results, and, when **Learner records** is on, passes on the activity that [Insights](insights) counts. Put this link in your StudyDesk page, not the plain one. A learner who isn't signed in just plays it, and their progress stays in their own browser. **Allow remix**, under the link, adds a **Remix this** button for signed-in staff who open it, which copies the project into their own projects: see [Templates, examples and remix](templates#allow-remix-on-a-share-link).

For a walk-through, see [Tutorial 5](tutorial-publish).`
  },
  {
    id: "embedding",
    title: "Embedding and the player API",
    group: "Import and export",
    summary: "Put an interactive on a page, size it, and talk to it from JavaScript.",
    keywords: "embed iframe player api web component script host postmessage height resize toolbox",
    body: `## The simplest way
Upload the **Single HTML file** and show it in an iframe. Inside the StudyDesk Toolbox the player reports its height to the page so the iframe fits (the suite's \`setILARSize\` or a \`{width: null, height, cacheID}\` message).

## The web component
\`\`\`
<script src="interactives-player.iife.js"><\/script>
<interactives-player src="scene.ixp" fit="contain" style="width:800px;height:600px"></interactives-player>
\`\`\`
Messages the project sends arrive as \`ix-message\` events. Add \`accessibility="off"\` to play without layer roles and keyboard operation (see [Accessibility](accessibility)). Add \`theme="Dark"\` to show one of the project's [themes](themes); without it the viewer's colour scheme and contrast settings choose, and \`ix-theme\` events report a change.

## From JavaScript
\`\`\`
import { Player, loadProject } from 'interactives-player';
const player = new Player(document.getElementById('stage'), await loadProject('scene.ixp'));
player.on('message', ({ name, payload }) => console.log(name, payload));
player.send('addToCart', { sku: 'A1' });
player.setVariable('score', 10);
player.timeline('Intro').play();
player.goTo('Checkout', 'fade');
player.setTheme('Dark');   // or null to follow the viewer
player.setData('products', [...]);
\`\`\``
  },
  // ---------------------------------------------------------------- together
  {
    id: "libraries",
    title: "Libraries (shared components and styles)",
    group: "Working together",
    summary: "Publish components, colours, text styles and assets from one project and use them, with updates, in others.",
    keywords: "library component share publish update detach style swatch version design system",
    body: `A **library** is an ordinary project that publishes some of its artboards as **components**, along with its named colour and text styles and the assets they use. Other projects add the library, drag its components onto the canvas, and are told when a newer version is published. It is how you keep one button, header or colour palette in step across many projects. Everything lives in the **Libraries** tab of the left panel.

## Making a library
1. Turn on **This project is a library** (Inspector, **Project** section, or **Make this project a library** in the Libraries tab). The projects page marks it with a **Library** badge.
2. Select an artboard and tick **Publish to library**. Do this for each artboard you want to offer. An artboard that a published one uses as an [instance](instances) comes along automatically.
3. In the Libraries tab press **Publish**, with an optional note. Each publish with something new in it makes the next **version** (v1, v2 ...). Publishing with nothing changed does not.
4. **Share**: tick **Everyone can use it**, or type usernames, then **Save sharing**. Only you see the library until you do. **Stop publishing** withdraws it; projects that already use it keep their copies.

## Using a library
- Under **Available libraries** press **Add**. Its components and colours appear under **Libraries in this project**.
- **Drag a component onto the canvas**, or press **Place** to put it in the open artboard. The first time, the component's artboard is copied into your project as a **library artboard** (badged *library* in the layers list) and an [instance](instances) of it is placed. That copy is only there for the instance to use, so it is kept **off the canvas**: you see one thing placed, not two. The eye on its row in Layers shows it on the canvas (and hides it again), and picking the row shows it too. Placing it again reuses the same copy. **Add artboard** copies it onto the canvas as an artboard of its own, without placing anything.
- A library artboard is **read-only**: its layers, timelines and interactions come from the library. You can move it and rename it. Variables, fonts, data sources and assets it needs are added to your project (a variable or data source you already have with the same name is left alone).
- Libraries are copied, not linked live: the artboards, assets and styles are in your project, so [exports](export) and the player are self-contained.

## Updates
When the library publishes a new version, its entry shows **Updates available**. Press it to **review**: each changed component lists what changed (layers added, removed or changed, size, timelines, interactions), and styles are listed too. Then **Update all**, or **Update this one** per component.

What is kept when you update: the instances you placed in your own artboards, their **Inputs**, their position and size, your variables (and their values), your own artboards and your own styles. A component the library has removed stays in your project as it is until you detach or delete it.

## Detach
**Detach to edit** (Inspector, or in the library's list) turns a library artboard into a normal artboard you can edit. It stops getting updates. **Stop using this library** detaches everything from it and makes its styles your own.

## Styles
**Styles** holds named colours and text styles.
- **+ Colour** and **+ Text** create one from the selected layer. A colour made from a layer's fill is also that layer's fill from then on, so changing the colour changes the layer; select other layers and press **Fill**, **Stroke** or **Text** on a style to make them follow it too. Double-click a name to rename it; the colour box edits a colour.
- **Fill**, **Stroke** and **Text** (colours), and **Apply** (text styles) set the selected layers from a style. A layer **follows** the style: edit the style, or update the library it came from, and the layer changes too. Changing that property on the layer yourself stops it following.
- A library's styles are added to your project when you add the library, kept in step on update, and cannot be edited here.

## Limits
- Components carry artboards (with their timelines and interaction graphs), variables, fonts, data sources and assets. Project **scripts** are not carried; instances do not run scripts of their own anyway.
- An update replaces a copy's content by layer id. Inputs that name a variable the library renamed or removed are left as they were.
- Only the latest version is kept on the server, so you cannot go back to an older one (undo works right after an update, and the [revision history](live-editing#revision-history) goes further back).`
  },
  {
    id: "templates",
    title: "Templates, examples and remix",
    group: "Working together",
    summary: "Start a project from a template with a checklist of what to change, save your own, play and copy the examples, allow remix on a share link, and pull template updates in.",
    keywords: "template starter checklist example remix copy duplicate update version save share quiz flip cards sorting branching story timeline intro review",
    body: `A **template** is a whole project saved so other people (or you) can start new projects from it. Nobody has to begin from a blank artboard, and a **checklist** walks whoever uses it through replacing the sample content, so a template's wording does not end up in front of learners. Everything is on the **Templates** tab of the projects page (next to **Projects**).

![The Templates tab on the projects page: Mine, Shared, Built-in and Examples, with a card for each built-in starter.](help/templates-tab.png)

## The Templates tab
- **Mine**: templates you saved. **Shared**: templates other people saved and let everyone use. **Built-in**: starters that come with Interactives. **Examples**: finished projects to play and copy (below).
- A card shows the picture, title, what it is for, its version, and how many things it asks you to change. **Use template** makes your own project from it, in the folder you pick.
- **New project** on the **Projects** tab opens **Start a new project**, which offers the same templates and examples as one of its choices (**Copy a project or template**, **Built-in template**, **Copy an example**) next to **Blank project**, without leaving the projects page. It makes the project the same way as **Use template** and **Make my copy** do, so a template still opens with its checklist.
- On your own templates, the pencil changes the title, description, checklist and who can use it; the bin deletes it (projects already made from it keep their content).

## Use a template
1. **Templates** > pick a card > **Use template**. The window lists the checklist first, so you see what it expects of you.
2. Give the project a name and pick a folder, then **Create project**. It opens with the **Checklist** tab already open along the bottom.
3. Work down the list. **Click an item** and the editor selects the layer it is about and puts it in the middle of the canvas; change it, then **tick the item off**.
4. A badge saying **Still the template's** means the layer an item points at has not been changed at all yet, even if you ticked it. **Layer deleted** means it was removed.
5. **Review** (top of the Checklist tab) before you share: it lists what is not ticked and what is ticked but untouched, each one a link to the layer. **Mark as reviewed** when you are happy. **Remove** takes the checklist away and leaves the project as it is.

![A project made from the Quiz starter, with the Checklist tab open along the bottom: one item ticked, the layer of the next one selected.](help/templates-checklist.png)

### A worked example
Pick **Quiz** under **Built-in**, then **Use template**. The checklist asks you to:
- change the title and the line under it: click the item, then double-click the text on the canvas and type;
- write your own question and answer options: click the item and look under **Question** in the Inspector;
- mark the right option and add a hint, reword the feedback, and set the points.
Tick each as you go. When all five are ticked, press **Review**. If you ticked "Change the quiz title" without actually changing it, the Review lists it under "ticked, but the layer is still exactly the template's".

## Save as template
Open a project and choose **Share > Save as template**.
- **Title** and **Description** are what the card shows. Say what the template is for.
- **Everyone can use this template** (off: only you see it). People who use it get their own copy; yours is never changed.
- **Checklist**: one line for each thing to change ("Replace the question text"). Select a layer first and press **Link** on an item to point it at that layer, or **Add for the selected layers** for one item per layer. Clicking an item later selects the layer. Reword the items for the person who will use it, not for you.
- The picture on the card is the project's own thumbnail, and the whole project (artboards, pictures, fonts, variables, interactions) goes with it. Review comments and results do not.
- Saving again from the same project, choosing **The next version of ...**, makes **version 2**, **3** and so on. Saving with nothing changed only updates the title, description, checklist and visibility.

![The Save as template window: title, description, who can use it, and a checklist whose first item points at the selected layer.](help/templates-save.png)

Do not leave real names, private pictures or course content in a template that is shared with everyone: anyone can use it, and the pictures go with it.

## Update from template
Projects made from a saved template remember which version they came from, and what every artboard, layer, timeline, interaction node and variable was when they were copied. When the author saves a newer version, the Checklist tab shows **Update available**. Press it to see:
- parts the template changed that **you have not touched**: they are updated, in place, with your own layers inside them left alone;
- parts the template **added**: they are added where they sit in the template;
- parts you changed: **kept as they are**, listed so you know the template changed them too;
- things you deleted stay deleted, and things the author removed stay in your project.
![The Update from template window: a changed layer and a new layer offered, and the layer the person had edited kept as it is.](help/templates-update.png)

Untick anything you do not want, then **Update**. It is one undo step (Ctrl+Z). Built-in starters are generated by the editor, so they have no newer versions to pull.

## Examples
**Examples** are finished projects that ship with Interactives: the tutorial projects (**First animation**, **First interaction**, **Lamp**), layout and drawing demos, web controls, an imported Rive animation, **Bones and IK**, and the **Matching question** and **Hotspot question**. They are the same for everybody and **read only**: nobody can change one. **Play** runs it in a window without touching anything of yours; **Make my copy** puts your own editable copy in your projects (in the folder you choose), where you can change or break it freely.

## Allow remix on a share link
In **Share > Share link**, tick **Allow remix**. People who open the **Link for StudyDesk** while signed in to the editor get a **Remix this** button; pressing it copies the project into their own projects and opens it. The copy is theirs: it does not change your project, and it is not tied to it. A remix copies the project **as it is now** (not the version last published to the link), with every artboard, layer and picture, including parts the page does not show, so only allow it for projects you are happy to give away. Turn it off at any time; copies already made stay.

## Good to know
- Layer ids stay the same in a copy, so a checklist and updates can find things. Duplicating or pasting layers inside the copy makes new ids as usual.
- The server keeps a template as a snapshot with its own copy of the files, so deleting or editing the project it came from does not change it.
- Templates are one level: a copy of a template does not become a template of its own until you save it as one.`
  },
  {
    id: "live-editing",
    title: "Live editing and saving",
    group: "Working together",
    summary: "Several people in one project, autosave, revisions and conflicts.",
    keywords: "multiplayer collaborate live share presence cursor save autosave conflict undo revision history version restore",
    body: `Everything saves as you work. A project can be opened by its owner, by people the owner has invited to collaborate (below), and by staff with power-user access (see [Projects page](projects#who-sees-what)); to let anyone else play it, use a [share link](export#share-link). When more than one person opens the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.
- If the server refuses a batch of changes for good (too large, not allowed), live editing stops with a message and the whole project is saved the normal way instead. A temporary server error is retried, waiting a little longer each time.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **Revision history** button (the clock) in the top bar. The list on the left shows each version with its date and how long ago it was; click one to see a picture of it and a count of its artboards and variables. **Restore this version** asks **Restore version** in a dialog first. What is there now is saved in the history before the restore, so you can come back to it, and the page reloads with the restored project.

![The Revision history dialog.](help/revision-history.png)

## When two copies disagree
If the project was saved from another tab, or by someone else without live editing, a red bar says **This project was changed in another tab or by someone else since you opened it. Your edits are not saved.** **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Pick carefully: the other one is lost (the revision history may still have it).

## Inviting people
**Share → Invite to collaborate…** lets other people open and edit the project with you.

1. Open the project and choose **Share**, then **Invite to collaborate…**.
2. Start typing their name, email or username. A list of matching people appears: pick the right one and they are invited at once. If you already know their StudyDesk username (for example *u1234567*) you can type it and press **Invite**.
3. They are listed under the box. The bin beside a name takes them off again (you are asked first, and their changes stay).
4. The project now shows on their own projects page, marked *shared with you by* your name. When you both have it open you see each other's cursors and changes live.

![The Invite to collaborate window: a search box for a name, email or username, and the list of people already invited.](help/invite-dialog.png)

Only staff who have used the StudyDesk Toolbox before can be found by name, and students are never listed. Someone who isn't found can still be invited by typing their exact username. Collaborators can edit, comment, export and share it; only the owner can delete the project or change who's invited (a collaborator can take themselves off the list). To let someone look and comment without editing, use **Share for review** instead ([Review comments](comments)).`
  },
  {
    id: "comments",
    title: "Review comments",
    group: "Working together",
    summary: "Pin notes to a layer or a spot, reply, resolve and assign them, and collect comments from reviewers with a review link.",
    keywords: "comment comments review reviewer feedback note pin thread reply resolve assign assignee mention notify notification guest share link subject expert",
    body: `Comments are notes pinned to the project. Subject experts and reviewers can say what they think right where it applies, and you can reply, hand a note to someone, and tick it off when it is dealt with, instead of collecting email and screenshots.

Comments are kept on the server apart from the project. They are never part of the project file, an **export**, a **.ixp package**, a **share link** or **Preview**, and a duplicate of the project starts with none. Deleting the project deletes its comments.

![The Comments tab with two open conversations, and the first one open on the canvas: its pin follows the Bulb layer, with Resolve, Assigned to and a reply box.](help/comments-panel.png)

## Leaving a comment
Pick the **Comment** tool (<kbd>C</kbd>) and click where you want to say something. If there is a layer under the click, the note is pinned to that layer at that spot, so the pin **follows the layer** when it moves, scales or rotates. If the layer is deleted the pin stays where it was, drawn with a dashed edge, and the **Comments** panel says the layer is gone. A click on empty artboard pins the note to that point of the artboard.

Type the note and press **Comment** (<kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends too). Type **@** to mention someone from the list of people in the project. As the owner you can pick an **Assign to** person as you send it.

## Replies, resolve and assign
Click a pin to open its conversation next to it. Reply in the box under it; edit or delete your own messages (the owner and power users can delete any). **Resolve** marks a conversation as dealt with and **Reopen** brings it back. **Assigned to** hands it to a person from the list: the owner, and everyone who has commented. They are told (see below), and it shows under **Assigned to me** in their Comments panel.

Pins are numbered. A resolved pin turns grey with a tick, a pin handed to you has an amber ring, and the one that is open has a halo. **Escape** puts a conversation away.

## The Comments panel
The **Comments** tab beside Layers lists every conversation with its first words, where it is, who wrote it and how many replies it has. Click one to go to it: the artboard, the layer, the pin in the middle of the canvas and its conversation open.

Filter by **Open**, **Resolved** or **All**, by **Everyone**, **Mine** (conversations you took part in) or **Assigned to me**, and by **artboard**. The eye button hides the pins on the canvas (your choice is remembered in this browser); the panel still lists them. The number on the tab is how many are open. The projects page shows the same number on each project's card, ringed in amber when some are for you.

## The review link
In **Share**, **Can comment: review link** makes a second link, apart from the share link. Send it to reviewers. They see the project as it is now, one artboard at a time as a still with the pins on it, can open any artboard from the top, **Play** the real thing, and leave, reply to and resolve comments. They cannot change the project. Because the page always reads the project as it is, there is nothing to update when you change it.

- **Signed in to StudyDesk** (open the link from StudyDesk): comments carry the reviewer's own name. They can resolve, and edit or delete their own.
- **Let people comment without signing in**: anyone with the link can comment after giving a **display name**. Guests are marked *(guest)*, cannot resolve, assign or mention, and are limited to a few comments every few minutes per address and per link. Leave this off when the project is not meant for people outside StudyDesk. Without it, the link asks for a signed in StudyDesk user.
- **Turn off review link** ends the link at once, including for anyone who has it open. The comments are kept.

Anyone who has the review link can read the whole project, as with a share link. The link is long and random so it cannot be guessed; do not post it anywhere public.

## Notices
When a conversation is **assigned to you**, you are **mentioned**, or someone **replies** in a conversation you are in, you are told: a message appears while a project is open, and a bell on the projects page counts what is unread. Opening the project clears its notices. Turn this off with **Comment notices** in [Preferences](preferences). There is no email.

## Live
Comments arrive for everyone looking at the project as they are written, in the editor and on the review page, without reloading. If the connection drops, *offline* shows in the panel and anything missed is fetched when it is back.

## Limits
A note is up to 2000 characters, a conversation holds 200 messages, and a project 1000 comments. See [Keyboard shortcuts](shortcuts) and [Share links](export#share-link).`
  },
  {
    id: "ai-agents",
    title: "AI agents (MCP)",
    group: "Working together",
    summary: "Let an AI agent join your editing session to build, change and debug alongside you.",
    keywords: "ai agent claude mcp model context protocol assistant automation llm copilot url connect http",
    body: () => {
      const page = typeof location !== "undefined" && /^https?:$/.test(location.protocol) ? location : null;
      const base2 = page ? `${page.origin}${page.pathname.replace(/\/(index\.html)?$/, "")}` : "https://<your server>/interactives";
      const url = `${base2}/mcp?agent=Claude`;
      let sid = "";
      try {
        const v = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("sessionID") : null;
        if (v && v !== "null") sid = v;
      } catch {
      }
      const session = sid || "<your session id>";
      return `An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects to this editor's **MCP server** over the network. There is nothing to download or install: any MCP client that can use an HTTP server (Claude Code, Claude Desktop and others) only needs the address below.

## A first conversation
1. Open a project in the editor, so you can watch.
2. Add the MCP server to your agent (below).
3. Ask the agent: *List my projects, then join the one called Lamp.* A person called **<name> (AI)** appears in the top bar.
4. Select a layer yourself, then ask: *Make the selected button pulse when I hover over it.* The agent reads your selection and makes the change while you watch.
5. Ask it to run **validate** when it is done, to find broken references and expressions that don't parse.

## Setting it up
The MCP server for this editor is at:

\`\`\`
${url}
\`\`\`

In **Claude Code**, run:

\`\`\`
claude mcp add --transport http interactives "${url}" --header "X-Session-ID: ${session}"
\`\`\`

For a client set up with a JSON file (Claude Desktop and most others):

\`\`\`
{
  "mcpServers": {
    "interactives": {
      "type": "http",
      "url": "${url}",
      "headers": { "X-Session-ID": "${session}" }
    }
  }
}
\`\`\`

Use the **Copy** button on each box.

${sid ? `> The \`X-Session-ID\` above is **your** sign-in for this tab. The agent can open and change whatever you can, so treat it like a password and don't paste it anywhere shared. It stops working when your StudyDesk session ends: open this page again for a fresh one and update the setting.` : `> **<your session id>** is your StudyDesk sign-in. Open this page from the editor while signed in and it is filled in for you. Without one the agent sees what a signed-out visitor sees, which on most servers is nothing.`}

| Part | Meaning |
|---|---|
| \`?agent=Claude\` | The name people see in the top bar, as **Claude (AI)**. Change it to anything (up to 40 letters) |
| \`X-Session-ID\` | Who the agent works as. It can only open the projects that session can open. \`Authorization: Bearer <session id>\` works too |

## What the agent can do
| Tool | Does |
|---|---|
| list_projects | Your projects |
| join_session | Joins a project's live session; reports who is there and what they have selected |
| leave_session | Leaves the session |
| get_selection | The layers each person has selected, in full |
| get_overview, get_layers, get_interactions | Read artboards, layer trees, timelines, variables, interactions |
| edit | Add, change, move and delete layers; add artboards, variables, timelines, interactions and scripts, in one batch |
| validate | Find broken references, unconnected events and expressions that don't parse |
| read_reference | These help pages, plus generated references for layer fields, interaction nodes and animatable properties |

## Staying in control
- Everything the agent does goes through the same live editing as people, so you watch it happen.
- Your **Undo** only undoes your own changes. To roll back an agent's work, use the [revision history](live-editing#revision-history) (a snapshot is kept every few minutes while the project changes).
- The agent can only open projects its session can open.
- An agent that goes quiet for two hours is disconnected and leaves any project it was in. Its client reconnects by itself the next time it is used.`;
    }
  },
  // ---------------------------------------------------------------- reference
  {
    id: "animatable-properties",
    title: "Animatable properties",
    group: "Reference",
    summary: "Every property timelines, bindings and the property nodes can change.",
    keywords: "property properties animatable list prop path",
    body: () => `These properties can be keyframed, bound to an expression, and changed with **Set property** and **Animate property**. The path (left) is what scripts use: \`ix.node('Box').set('fill.color', '#f00')\`.

| Path | Property | Kind |
|---|---|---|
` + ANIMATABLE_PROPS.map((p) => `| \`${p.prop}\` | ${p.label} | ${p.kind} |`).join("\n")
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting and common questions",
    group: "Reference",
    summary: "Quick answers: the box won't move, a layer can't be selected, text shows braces, imports and links, saving conflicts.",
    keywords: "troubleshoot problem help faq not working stuck cannot cant why does nothing happens missing wont move select locked hidden record keyframe blank preview conflict save link reconnect dwg cors autoplay",
    body: `Short answers to the things new users ask most. Each links to the page with the full story.

## Animation
**My layer doesn't move when the timeline plays.**
A track needs **two or more** keyframes. With one key it just holds that value. Add a second at another time. See [Tutorial 1](tutorial-first-animation).

**I'm in Record mode but nothing is keyed.**
- The **Timeline** tab must be open, with a timeline chosen. In **Design view (no timeline)** changes are ordinary edits.
- The property must be one that can animate (see [Animatable properties](animatable-properties)).
- A property driven by a [binding](bindings) can't be keyed. Remove the binding first.

**The timeline plays once and stops.**
Set **Play once** to **Loop** or **Ping-pong**, and tick **Autoplay** if it should start by itself. See [Timelines and keyframes](timelines).

**An edit I make shows up as a keyframe I didn't want.**
Record is still on. Press the red dot to switch it off.

## Selecting and seeing layers
**I can't click a layer on the canvas.**
It is probably **locked**, or **hidden** (shown as a faint ghost). Hover it for the badge that unlocks or shows it, or use the eye and padlock in the Layers panel. See [Layers, hidden and locked layers](layers-panel).

**A layer is in the editor but not in Preview.**
Check that it is **Visible**; that it isn't hidden by a **Solo** group's active child; that it sits inside the artboard (**Clip content to artboard** hides what is outside in Preview and in exports; on the canvas the part outside shows faintly); and that no mask above it is clipping it. See [Groups and frames](groups-frames).

**A field is greyed out and has a link icon.**
It is bound to an expression. Remove the binding in **Data bindings** to edit it by hand. See [Bindings](bindings).

## Text, variables and expressions
**My text shows \`{score}\` instead of the number.**
The variable needs to exist with exactly that name (it's case sensitive). Make it in the **Variables** tab. To show a real brace, write \`{{\`. See [Variables](variables).

**It says "Use letters, digits and _ only".**
Variable and data source names are used inside expressions, so they can't contain spaces or dashes. Try \`high_score\`. A variable whose name is empty or not valid is not saved: it stays in the field as a draft, with this message, and the project keeps the last good name until you fix it.

**A script does nothing.**
Open **Preview** and look at the **Events** list for an error message. Scripts in the sandbox can only use \`ix\`, timers and \`console\`. See [Scripts](scripts).

## Importing and updating design files
**The designer saved a new version of the Photoshop (or Illustrator, ...) file.**
Select one of its artboards and press **Update from file…** in the inspector, or **Update…** beside it under **Design files** in the Assets panel, then pick the new file. Your own edits are kept. See [Updating a design file](import#updating-a-design-file).

**A bar asks me to Reconnect.**
That's an artboard linked to a file on disk the older way. Press **Reconnect** to let the browser read it again, or just use **Update from file…**.

**"The linked file was moved, renamed or deleted."**
Use **Update from file…** and pick it where it is now.

**An Illustrator file says to save with "Create PDF Compatible File".**
Re-save it from Illustrator with that option ticked. **A DWG file** must be saved as DXF first. See [Importing](import).

## Beta tester questions
**Where is the version number?**
Hover the small **(i)** icon beside **Help** (on the help page and the projects page), or the one in the title bar of **Preferences**: it reads like \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`. Click it to copy it, and put it in any problem report. See [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).

**A tool I'm looking for isn't in the tool bar.**
Some groups start folded. Click **Media** (text, script layer, shader layer, video, image), **Web** (button, input, link, embed, Add question) or **Rig** (bones) to open them. See [The editor at a glance](interface).

**A faded layer won't take clicks in Preview.**
A layer that is partly see-through lets the pointer through. Tick **Clickable while see-through** in its **Interactions** section. See [Interactions](interactions).

**I invited someone and they can't see the project.**
They need to be signed in to StudyDesk, and to reload their projects page. Check you picked them from the list, or typed their username exactly. See [Live editing and saving](live-editing#inviting-people).

**The Link for StudyDesk shows no Results or Insights.**
Both only count learners who are signed in to StudyDesk and opened the **Link for StudyDesk** (not the plain share link) while it was on. After you change score or record settings, press **Update to the latest version**. See [Results and progress](results) and [Insights](insights).

## Saving and sharing
**A red bar says the project changed in another tab or by someone else.**
Another copy saved first. **Reload theirs** brings in what is saved, and **Overwrite with mine** keeps your version. Pick carefully: the other one is lost. See [Live editing and saving](live-editing).

**Undo doesn't undo someone else's change.**
Undo only undoes your own changes. Use the [revision history](live-editing#revision-history) to go back further.

**A video doesn't autoplay.**
Browsers only autoplay *muted* video. Tick **Muted**.

**Data from a web address doesn't load.**
The address must allow cross-origin requests (CORS) from where the interactive is shown, and, if the project lists **Allowed data hosts**, its host must be on the list. See [Data sources](data-sources).

**A formula with a pattern (\`/…/\`) says "Pattern not allowed", or its \`{…}\` shows as written in text.**
The pattern could freeze the page on some text, so it is refused. See *Patterns* in [Expressions](expressions#patterns-regular-expressions).

## The editor itself
**The page zooms when I scroll.**
That's the default. Set **Mouse wheel** to **Pan (Ctrl+wheel zooms)** in [Preferences](preferences).

**A shortcut doesn't work.**
Shortcuts are ignored while a text box is focused. Click the canvas first. See [Keyboard shortcuts](shortcuts).

**Export doesn't have my share link any more.**
Sharing moved to its own **Share** button next to Export. See [Exporting](export#sharing).

**Where's my project?**
Check the projects page for an active folder, tag or search (the **Clear filters** button resets them). You only see your own projects. See [Projects page](projects).`
  },
  {
    id: "help",
    title: "Using this help",
    group: "Reference",
    summary: "Search, tooltips and help links.",
    keywords: "help docs search tooltip question",
    body: `- **Search**: press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere for quick search. Type a few words and press <kbd>Enter</kbd> to open the best match.
- **Help button**: the **?** at the bottom of the tool bar (it opens the page for the tool you're using), the **?** in the top bar, the **Help** link on the projects page, or <kbd>?</kbd>.
- **Getting started**: the five tutorials start at [Tutorial 1](tutorial-first-animation). Stuck? [Troubleshooting and common questions](troubleshooting).
- **Contents**: the list on the left groups every page. In the narrow drawer, the button at its top left shows and hides it. **Previous** and **next** links at the bottom of each page walk through them in order.
- **Pictures and clips**: click a picture to open it full size. Clips play on a loop without sound, and have controls if you want to pause.
- **Tooltips**: hover a button or a field's name for a short explanation. Turn them off in [Preferences](preferences).
- **Version**: the small **(i)** icon beside **Help** (and in the help drawer, the <kbd>F1</kbd> quick search and Preferences) shows the version you are running when you hover it, and copies it when you click it. Include it when you report a problem: see [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).
- **? links**: inspector sections have a **?** that opens their page here.`
  }
];
function topicBody(t2) {
  return typeof t2.body === "function" ? t2.body() : t2.body;
}
const envContext = {
  base: (process.env.INTERACTIVES_URL ?? "http://127.0.0.1:3048/interactives").replace(/\/$/, ""),
  sessionId: process.env.INTERACTIVES_SESSION_ID ?? "",
  agent: process.env.INTERACTIVES_AGENT_NAME ?? "Agent",
  sessions: /* @__PURE__ */ new Map()
};
const contexts = new AsyncLocalStorage();
const ctx = () => contexts.getStore() ?? envContext;
function runAs(c2, fn) {
  return contexts.run(c2, fn);
}
const VERSION = "0.1.0";
async function api(path, init = {}) {
  const headers = { ...init.headers };
  if (ctx().sessionId) headers["X-Session-ID"] = ctx().sessionId;
  const res = await fetch(`${ctx().base}/api/${path}`, { ...init, headers });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
  }
  if (!res.ok) throw new Error(body?.error ?? `Server said ${res.status}`);
  return body;
}
const loadProject = async (id) => (await api(`projects/${encodeURIComponent(id)}`)).project;
const sessions = envContext.sessions;
function join(projectId) {
  const existing = ctx().sessions.get(projectId);
  if (existing) return existing;
  const clientId = `agent-${uid("")}`;
  const abort = new AbortController();
  const s = { projectId, clientId, peers: /* @__PURE__ */ new Map(), abort, ready: Promise.resolve() };
  s.ready = new Promise((resolve, reject) => {
    const headers = { Accept: "text/event-stream" };
    if (ctx().sessionId) headers["X-Session-ID"] = ctx().sessionId;
    fetch(`${ctx().base}/api/projects/${encodeURIComponent(projectId)}/live?clientId=${clientId}&agent=${encodeURIComponent(ctx().agent)}`, { headers, signal: abort.signal }).then(async (res) => {
      if (!res.ok || !res.body) throw new Error(`Could not join the live session (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === "hello") {
            for (const p of d.peers ?? []) if (p.clientId !== clientId) s.peers.set(p.clientId, p);
            resolve();
          } else if (ev === "presence" && d.clientId !== clientId) {
            if (d.left) s.peers.delete(d.clientId);
            else s.peers.set(d.clientId, { ...s.peers.get(d.clientId) ?? {}, ...d });
          } else if (ev === "deleted") s.abort.abort();
        }
      }
    }).catch((err) => {
      ctx().sessions.delete(projectId);
      reject(err);
    });
  });
  ctx().sessions.set(projectId, s);
  return s;
}
async function presence(s, p) {
  await api(`projects/${encodeURIComponent(s.projectId)}/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: s.clientId, presence: p }) }).catch(() => void 0);
}
function locate(p, id) {
  for (const ab of p.artboards) {
    let found = null;
    const rec = (list, parent) => {
      for (const n of list) {
        if (found) return;
        if (n.id === id) found = { ab, node: n, parent };
        else if (isContainer(n)) rec(n.children, n);
      }
    };
    rec(ab.children, null);
    if (found) return found;
  }
  return null;
}
function outline(list, depth, maxDepth, out, limit) {
  for (const n of [...list].reverse()) {
    if (limit.n-- <= 0) return;
    const extra = [];
    if (n.type === "text") extra.push(JSON.stringify(n.text.slice(0, 40)) + (n.runs?.length ? ` (${n.runs.length} runs)` : ""));
    if (n.type === "button") extra.push(JSON.stringify(n.label.slice(0, 40)));
    if (n.type === "instance") extra.push(`artboard=${n.artboardId}`);
    if (n.type === "draw") extra.push(`script layer${n.fps ? ` ${n.fps}fps` : ""}, ${n.code.split("\n").length} lines`);
    if (n.type === "shader") extra.push(`shader layer, ${n.code.split("\n").length} lines, uniforms: ${(n.uniforms ?? []).map((u) => `${u.name}:${u.type}`).join(",") || "none"}`);
    if (n.type === "image" && n.shaderFilter) extra.push(`shader filter, ${n.shaderFilter.code.split("\n").length} lines`);
    if (!n.visible) extra.push("hidden");
    if (n.locked) extra.push("locked");
    if (n.bindings && Object.keys(n.bindings).length) extra.push(`bindings: ${Object.keys(n.bindings).join(",")}`);
    out.push(`${"  ".repeat(depth)}- ${n.name} [${n.type} ${n.id}] @${r(n.x)},${r(n.y)} ${r(n.width)}x${r(n.height)}${extra.length ? " " + extra.join(" ") : ""}`);
    if (isContainer(n)) {
      if (depth + 1 >= maxDepth) {
        if (n.children.length) out.push(`${"  ".repeat(depth + 1)}… ${n.children.length} children (use get_layers or a deeper depth)`);
      } else outline(n.children, depth + 1, maxDepth, out, limit);
    }
  }
}
const r = (v) => Math.round(v * 10) / 10;
function overview(p, opts2) {
  const lines = [`# ${p.name} (${p.id})`, `Start artboard: ${p.settings.startArtboardId}`, ""];
  for (const ab of p.artboards) {
    if (opts2.artboardId && ab.id !== opts2.artboardId) continue;
    lines.push(`## Artboard ${ab.name} [${ab.id}] ${ab.width}x${ab.height}`);
    if (ab.timelines.length) lines.push(`Timelines: ${ab.timelines.map((t2) => `${t2.name} [${t2.id}] ${t2.duration}ms ${t2.loop}${t2.autoplay ? " autoplay" : ""} (${t2.tracks.length} tracks)`).join("; ")}`);
    if (ab.blends?.length) lines.push(`Blends: ${ab.blends.map((b) => `${b.name} [${b.id}] ${b.mode} (${b.entries.length} timelines)`).join("; ")}`);
    if (ab.logic.nodes.length) lines.push(`Interactions: ${ab.logic.nodes.length} nodes, ${ab.logic.edges.length} connections (use get_interactions)`);
    const out = [];
    outline(ab.children, 0, opts2.depth ?? (opts2.artboardId ? 8 : 2), out, { n: opts2.artboardId ? 600 : 80 });
    lines.push(...out, "");
  }
  if (p.variables.length) lines.push("## Variables", ...p.variables.map((v) => `- ${v.name} [${v.id}] ${v.type} = ${JSON.stringify(v.initial)}${v.shared ? " shared" : ""}${v.options ? ` options=${v.options.join("|")}` : ""}`), "");
  if (p.dataSources.length) lines.push("## Data sources", ...p.dataSources.map((d) => `- ${d.name} [${d.id}] ${d.kind} from ${d.source === "url" ? d.url : `asset ${d.assetId}`}`), "");
  if (p.scripts.length) lines.push("## Scripts", ...p.scripts.map((sc) => `- ${sc.name} [${sc.id}]${sc.runOnStart ? " runs on start" : ""} (${sc.code.split("\n").length} lines)`), "");
  if (p.assets.length) lines.push("## Assets", ...p.assets.map((a) => `- ${a.name} [${a.id}] ${a.mime}`));
  return lines.join("\n");
}
function interactions(p, abId) {
  const ab = p.artboards.find((a) => a.id === abId || a.name === abId);
  if (!ab) throw new Error("No such artboard");
  const names = /* @__PURE__ */ new Map();
  walk(ab.children, (n) => names.set(n.id, n.name));
  const label = (n) => CATALOG.find((d) => d.kind === n.kind)?.label ?? n.kind;
  const lines = ab.logic.nodes.map((n) => {
    const params = Object.entries(n.params).filter(([, v]) => v !== "" && v !== void 0).map(([k, v]) => `${k}=${typeof v === "string" && names.has(v) ? `${names.get(v)}(${v})` : JSON.stringify(v)}`).join(" ");
    const outs = ab.logic.edges.filter((e) => e.from === n.id).map((e) => `${e.fromPort !== "out" ? e.fromPort + " " : ""}→ ${e.to}`);
    return `- ${label(n)} [${n.kind} ${n.id}] ${params}${outs.length ? ` ${outs.join(", ")}` : ""}${n.note ? ` // ${n.note}` : ""}`;
  });
  return [`Interactions on ${ab.name} [${ab.id}]`, ...lines].join("\n");
}
function validate(p) {
  const problems = [];
  const varIds = new Set(p.variables.map((v) => v.id));
  for (const ab of p.artboards) {
    const ids = /* @__PURE__ */ new Set();
    walk(ab.children, (n) => ids.add(n.id));
    const tl = new Set(ab.timelines.map((t2) => t2.id));
    for (const t2 of ab.timelines) for (const tr of t2.tracks) if (!ids.has(tr.nodeId)) problems.push(`${ab.name}: timeline "${t2.name}" animates a layer that is gone (${tr.nodeId}, ${tr.prop})`);
    for (const n of ab.logic.nodes) {
      const def = CATALOG.find((d) => d.kind === n.kind);
      if (!def) {
        problems.push(`${ab.name}: unknown interaction node kind ${n.kind} (${n.id})`);
        continue;
      }
      for (const pd of def.params) {
        const v = n.params[pd.key];
        if (v === void 0 || v === "") continue;
        if (pd.type === "node" && !ids.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing layer ${v}`);
        if (pd.type === "timeline" && !tl.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing timeline ${v}`);
        if (pd.type === "blend" && !ab.blends?.some((b) => b.id === String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing blend ${v}`);
        if (pd.type === "variable" && !varIds.has(String(v))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing variable ${v}`);
        if (pd.type === "variables") {
          for (const id of Array.isArray(v) ? v : []) if (!varIds.has(String(id))) problems.push(`${ab.name}: "${def.label}" (${n.id}) points at a missing variable ${id}`);
        }
        if (pd.type === "expr") {
          try {
            checkExpression(String(v));
          } catch (e) {
            problems.push(`${ab.name}: "${def.label}" (${n.id}) ${pd.label}: ${e.message} in \`${v}\``);
          }
        }
      }
      if (def.category === "event" && !ab.logic.edges.some((e) => e.from === n.id)) problems.push(`${ab.name}: "${def.label}" (${n.id}) is not connected to anything`);
    }
    for (const e of ab.logic.edges) if (!ab.logic.nodes.some((n) => n.id === e.to) || !ab.logic.nodes.some((n) => n.id === e.from)) problems.push(`${ab.name}: a connection points at a missing node (${e.id})`);
  }
  return problems;
}
function applyChanges(p0, changes) {
  const p = structuredClone(p0);
  const created = {};
  const touched = [];
  const ref = (v) => typeof v === "string" && v.startsWith("$") ? created[v.slice(1)] ?? v : v;
  const findAb = (id) => {
    const ab = p.artboards.find((a) => a.id === ref(id) || a.name === id);
    if (!ab) throw new Error(`No artboard ${String(id)}`);
    return ab;
  };
  const resolveRefs = (o) => typeof o === "string" ? ref(o) : Array.isArray(o) ? o.map(resolveRefs) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolveRefs(v)])) : o;
  for (const [i, c2] of changes.entries()) {
    const where = `change ${i + 1} (${c2.op})`;
    const key = typeof c2.ref === "string" ? c2.ref : void 0;
    switch (c2.op) {
      case "set_props": {
        const loc = locate(p, ref(c2.id));
        if (!loc) throw new Error(`${where}: no layer ${String(c2.id)}`);
        const props = resolveRefs(c2.props);
        for (const [k, v] of Object.entries(props)) {
          if (k === "id" || k === "type" || k === "children") continue;
          setPath(loc.node, k, v);
        }
        syncRuns(loc.node, props);
        sanitizeLayerInPlace(loc.node);
        touched.push(loc.node.id);
        break;
      }
      case "add_layer": {
        const ab = findAb(c2.artboard_id);
        const node = createNode(c2.type, resolveRefs(c2.props ?? {}));
        if (isContainer(node) && Array.isArray(c2.children)) node.children = [];
        syncRuns(node, resolveRefs(c2.props ?? {}));
        sanitizeLayerInPlace(node);
        let list = ab.children;
        if (c2.parent_id) {
          const parent = locate(p, ref(c2.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent ${String(c2.parent_id)} is not a group or frame`);
          list = parent.node.children;
        }
        const index = typeof c2.index === "number" ? Math.max(0, Math.min(list.length, c2.index)) : list.length;
        list.splice(index, 0, node);
        if (key) created[key] = node.id;
        touched.push(node.id);
        break;
      }
      case "delete": {
        const id = ref(c2.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const list = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        list.splice(list.indexOf(loc.node), 1);
        break;
      }
      case "move": {
        const id = ref(c2.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const from = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        from.splice(from.indexOf(loc.node), 1);
        let to = c2.artboard_id ? findAb(c2.artboard_id).children : loc.ab.children;
        if (c2.parent_id) {
          const parent = locate(p, ref(c2.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent is not a group or frame`);
          to = parent.node.children;
        }
        to.splice(typeof c2.index === "number" ? c2.index : to.length, 0, loc.node);
        touched.push(id);
        break;
      }
      case "add_artboard": {
        const right = Math.max(0, ...p.artboards.map((a) => a.canvasX + a.width));
        const ab = createArtboard({ name: String(c2.name ?? "Artboard"), width: Number(c2.width ?? 800), height: Number(c2.height ?? 600), canvasX: right + 100, canvasY: 0 });
        p.artboards.push(ab);
        if (key) created[key] = ab.id;
        break;
      }
      case "set_artboard": {
        const ab = findAb(c2.id);
        for (const [k, v] of Object.entries(resolveRefs(c2.props ?? {}))) if (!["id", "children", "timelines", "logic"].includes(k)) ab[k] = v;
        break;
      }
      case "add_variable": {
        const v = { id: uid("v"), name: String(c2.name), type: c2.type ?? "number", initial: c2.initial ?? 0 };
        if (Array.isArray(c2.options)) v.options = c2.options.map(String);
        if (c2.shared) v.shared = true;
        if (p.variables.some((x) => x.name === v.name)) throw new Error(`${where}: a variable called ${v.name} already exists`);
        p.variables.push(v);
        if (key) created[key] = v.id;
        break;
      }
      case "set_variable": {
        const v = p.variables.find((x) => x.id === ref(c2.id) || x.name === c2.id);
        if (!v) throw new Error(`${where}: no variable ${String(c2.id)}`);
        Object.assign(v, resolveRefs(c2.props ?? {}), { id: v.id });
        break;
      }
      case "add_timeline": {
        const ab = findAb(c2.artboard_id);
        const tl = {
          id: uid("tl"),
          name: String(c2.name ?? `Timeline ${ab.timelines.length + 1}`),
          duration: Number(c2.duration ?? 1e3),
          loop: c2.loop ?? "once",
          autoplay: !!c2.autoplay,
          speed: 1,
          tracks: (c2.tracks ?? []).map((tr) => ({
            id: uid("tr"),
            nodeId: ref(tr.node_id),
            prop: tr.prop,
            keys: tr.keys.map((k) => ({ id: uid("k"), t: k.t, value: k.value, ease: k.ease ?? "easeInOut" }))
          }))
        };
        ab.timelines.push(tl);
        if (key) created[key] = tl.id;
        break;
      }
      case "add_interactions": {
        const ab = findAb(c2.artboard_id);
        const localIds = {};
        const nodes = c2.nodes ?? [];
        const baseY = 40 + Math.max(0, ...ab.logic.nodes.map((n) => n.y));
        nodes.forEach((n, j) => {
          const def = CATALOG.find((d) => d.kind === n.kind);
          if (!def) throw new Error(`${where}: unknown node kind ${n.kind} (see read_reference "interactions")`);
          const id = uid("lg");
          if (n.ref) localIds[n.ref] = id;
          if (n.ref) created[n.ref] = id;
          const defaults = Object.fromEntries(def.params.filter((pd) => pd.default !== void 0).map((pd) => [pd.key, pd.default]));
          ab.logic.nodes.push({ id, kind: n.kind, x: n.x ?? 40 + j * 260, y: n.y ?? baseY, params: { ...defaults, ...resolveRefs(n.params ?? {}) }, ...n.note ? { note: n.note } : {} });
        });
        for (const e of c2.edges ?? []) {
          const from = localIds[e.from] ?? ref(e.from);
          const to = localIds[e.to] ?? ref(e.to);
          ab.logic.edges.push({ id: uid("e"), from, fromPort: e.from_port ?? "out", to, toPort: "in" });
        }
        break;
      }
      case "remove_interactions": {
        const ab = findAb(c2.artboard_id);
        const ids = new Set((c2.ids ?? []).map(ref));
        ab.logic.nodes = ab.logic.nodes.filter((n) => !ids.has(n.id));
        ab.logic.edges = ab.logic.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to));
        break;
      }
      case "add_script": {
        const sc = { id: uid("s"), name: String(c2.name ?? "Script"), code: String(c2.code ?? ""), runOnStart: !!c2.run_on_start };
        p.scripts.push(sc);
        if (key) created[key] = sc.id;
        break;
      }
      case "set_script": {
        const sc = p.scripts.find((x) => x.id === ref(c2.id) || x.name === c2.id);
        if (!sc) throw new Error(`${where}: no script ${String(c2.id)}`);
        if (typeof c2.code === "string") sc.code = c2.code;
        if (typeof c2.name === "string") sc.name = c2.name;
        if (typeof c2.run_on_start === "boolean") sc.runOnStart = c2.run_on_start;
        break;
      }
      default:
        throw new Error(`${where}: unknown op "${c2.op}"`);
    }
  }
  return { project: p, created, touched };
}
function syncRuns(node, props) {
  if (node.type !== "text") return;
  if (Array.isArray(props.runs)) {
    const patch = runsPatch(props.runs.filter((r2) => !!r2 && typeof r2.text === "string"));
    node.text = patch.text;
    if (patch.runs) node.runs = patch.runs;
    else delete node.runs;
  } else if ("text" in props || props.runs === null) delete node.runs;
}
function setPath(obj, path, v) {
  const keys = path.split(".");
  let cur = obj;
  for (const k of keys.slice(0, -1)) {
    if (k === "__proto__" || k === "constructor") return;
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = v;
}
function reference(topic) {
  if (topic === "interactions") {
    return CATALOG.map((d) => `### ${d.kind} — ${d.label} (${d.category})
${d.description}${d.outputs.length > 1 || d.outputs[0]?.label ? `
Outputs: ${d.outputs.map((o) => o.id).join(", ")}` : ""}
${d.params.map((pd) => `- ${pd.key} (${pd.type}${pd.options ? `: ${pd.options.map((o) => o.value).join("|")}` : ""}${pd.default !== void 0 ? `, default ${JSON.stringify(pd.default)}` : ""})${pd.help ? `: ${pd.help}` : ""}`).join("\n")}`).join("\n\n");
  }
  if (topic === "properties") return ANIMATABLE_PROPS.map((a) => `- ${a.prop} (${a.kind}): ${a.label}`).join("\n");
  if (topic === "layers") {
    const types = ["rect", "ellipse", "polygon", "star", "path", "text", "image", "group", "frame", "button", "input", "link", "embed", "video", "instance", "draw", "shader", "bone"];
    return 'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, link {url, target}, shadow, blur, ariaLabel (text alternative), ariaDescription, role (button|checkbox|heading|image|region), headingLevel, ariaChecked, decorative (hide from assistive tech), focusable (tab stop override), tabOrder, className, bindings {prop: expression}, converters {prop: [{type: format|round|invert|range|map|toNumber|toText|toBoolean|expr, ...}]} (applied to the binding value in order), layoutItem, constraints, draggable {tags[], axis both|x|y, bounds none|parent|artboard|<layer id>, onMiss stay|return, hit center|pointer|overlap, grid, glideMs, step, tapToMove, holdToDrag, label, silent, zoneVariable} (let viewers drag the layer; also by keyboard and tap), dropZone {accepts[] (tags, empty = any), capacity (0 = no limit), whenFull reject|swap, snap none|center|topLeft, label, highlight, contentsVariable} (where draggable layers can be dropped; the zone goes behind the layers that go in it).\nText layers can hold rich text: runs: [{text, fontFamily?, fontSize?, fontWeight?, italic?, color?, underline?, strike?, letterSpacing?, link?: {url, target}}]; each run lists only how it differs from the layer\'s own text style. `text` always equals the runs joined (it is rewritten for you when you set runs); setting `text` alone replaces the runs with that plain text, so set `runs` to restyle part of a text.\nText layers can animate per letter/word/line with modifiers: [{unit: letter|word|line, start, end, offset (percent of the text; offset -100..100 slides the range), shape: square|ramp-up|ramp-down|triangle|round|smooth, ease?, randomize?, seed?, strength (0-100), x, y (px), rotation (deg), scale (factor), opacity (factor 0-1), color? (mix to), letterSpacing (px), blur (px)}]. Units inside the range get that fraction of each change. Animate them with timeline tracks on `modifiers.<index>.offset` (also start, end, strength, x, y, rotation, scale, opacity, color, letterSpacing, blur); a typewriter is a letter modifier with start 0, end 100, opacity 0 and an offset track from 0 to 100.\nScript layers (type "draw", shown as "Script layer"): a box painted by a script every frame, for generative art, particles, charts and custom visualisations. Fields: code (the script), fps (0 = every frame, else a cap), pixelRatio ("auto" or a number), runInEditor (paint on the editor canvas, one still frame). The code defines function draw(g, t, dt) and optionally function setup(g); g records drawing commands, it is not a canvas. The script runs in the sandbox (projects with settings.scriptSandbox, the default; without the sandbox bundle the layer shows nothing). Errors stop that layer only. Starter scripts to adapt (set as `code`): ' + DRAW_TEMPLATES.map((t22) => `"${t22.name}"`).join(", ") + ". The g API:\n" + DRAW_API.map(([sig, what]) => `  ${sig}: ${what}`).join("\n") + `
Example: {"type":"draw","name":"Pulse","width":320,"height":200,"code":"function draw(g, t) {\\n  g.clear('#10131a');\\n  g.fill('#6f8cff');\\n  g.circle(g.width / 2, g.height / 2, 24 + Math.sin(t * 2) * 8);\\n}"}.
Shader layers (type "shader", shown as "Shader layer"): a box painted by a GPU fragment shader (WebGL, GLSL). Fields: code, uniforms, fps (0 = every frame), pixelRatio ("auto" or a number, capped at 3), animateInEditor (run live on the editor canvas; default off, one still frame). The code defines void mainImage(out vec4 fragColor, in vec2 fragCoord): fragCoord is in canvas pixels with the origin bottom-left, fragColor is straight (not premultiplied) alpha. Built in: ` + SHADER_BUILTINS.join(", ") + " (u_time seconds; u_resolution vec2 canvas pixels; u_mouse vec3 = pointer 0-1 over the layer with y up and z = 1 while the button is down; u_frame; v_uv vec2 0-1 y up). `uniforms` is a list of {name, type: " + SHADER_UNIFORM_TYPES.join("|") + ", value, min?, max?}: the name is the GLSL identifier and is declared for the shader automatically, so the code just uses it (a color is a vec4; an image is a sampler2D plus name_size, a vec2; its value is an asset id). Values: float a number, vec2/3/4 an array, color a CSS colour, image an asset id. Animate them with timeline tracks on `uniforms.<index>.value` (a float, a colour, or an image asset id as a step), and `uniforms.<index>.value.<k>` (k = 0-3) for the parts of a vector; bindings use the same paths. A compile error stops that layer only: the editor shows the message with line numbers (in the code) and the layer shows a placeholder. All shader layers share one WebGL context, off-screen layers and hidden tabs are paused, and a layer that reads neither u_time nor u_mouse is only redrawn when something changes. Presets to start from (set code and uniforms to the same preset's): " + SHADER_PRESETS.map((p) => `"${p.id}" (${p.name}${p.kind === "filter" ? ", reads u_image" : ""})`).join(", ") + '. Example: {"type":"shader","name":"Glow","width":400,"height":240,"code":"void mainImage(out vec4 fragColor, in vec2 fragCoord) {\\n  vec2 uv = fragCoord / u_resolution;\\n  fragColor = vec4(uv, 0.5 + 0.5 * sin(u_time * speed), 1.0);\\n}","uniforms":[{"name":"speed","type":"float","value":1}]}.\nShader filter: an image layer can also carry shaderFilter: {preset?, code, uniforms, fps?, pixelRatio?, animateInEditor?}. Same code and uniforms as a shader layer, plus u_image (sampler2D, the layer\'s own picture with its fit applied) and u_image_size; its uniforms animate and bind as `shaderFilter.uniforms.<index>.value`. It only works on image layers (not with a 9-slice) and the plain picture shows until the shader has drawn and if it fails. There is no generic filter for other layer types.\nBones (type "bone"): a container whose origin is its base; its width is its length, it points along local +x, and a child bone sits at its parent\'s tip (x = parent width, y = 0). Pose with x, y, rotation, scaleX/Y, width (all animatable). A path is skinned by `skin: {bones: [{bone: boneId, bind: [a,b,c,d,e,f]}], weights: [[{w: [{b: boneIndex, w: weight}]}]]}` (weights[subPath][point], up to 4 influences summing to 1; bind = inverse(boneWorld) * layerWorld at bind time); an image by `mesh: {vertices: [{x,y,u,v}], triangles: [i,j,k...], skin}`. Constraints `ik` (on the end bone: target, bones = chain length, invertBend, strength) and `distance` (target, distance px, mode within|outside|exact) pose bones before skinning.\nPaths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer\'s own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}], from?: {x,y}, to?: {x,y}} | {type:"radial", stops, center?: {x,y}, radius?} | {type:"image", assetId, fit}. With from/to (or center/radius) a gradient sits exactly there, in px from the layer\'s top-left, instead of running corner to corner along the angle; they can be animated as `fill.from.x`, `fill.to.y`, `fill.center.x`, `fill.radius` (also `stroke.paint.…`, `fills.0.…`). Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?, cap?, join?, align?: "center"|"inside"|"outside"}. Several fills and strokes: fill/stroke is the first (bottom) one and fills: Paint[] / strokes: Stroke[] hold the ones painted on top, bottom to top. All fills are under all strokes unless paintOrder says otherwise: paintOrder: ("fill"|"stroke")[], one entry per paint from the bottom up, e.g. ["stroke","fill"] draws the stroke under the fill (left out = plain order). Any paint or stroke may also have opacity (0-1), blend, visible (false hides it), feather (soft blur, px) and offsetX/offsetY, so a drop shadow is an extra fill that is dark, see-through, feathered and offset. Paths for set_props and tracks: "fills.0.color", "fills.0.opacity", "strokes.0.width", "strokes.0.paint.color".\n\nDefaults per type (what add_layer fills in):\n' + types.map((t22) => `- ${t22}: ${JSON.stringify(Object.fromEntries(Object.entries(createNode(t22)).filter(([k]) => !["id", "name", "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY", "opacity", "visible"].includes(k))))}`).join("\n");
  }
  const t2 = TOPICS.find((x) => x.id === topic);
  if (t2) return `# ${t2.title}
${t2.summary}

${topicBody(t2)}`;
  return `Topics: interactions, properties, layers, and the help pages: ${TOPICS.map((x) => x.id).join(", ")}`;
}
const S = (props, required = []) => ({ type: "object", properties: props, required });
const str = (description) => ({ type: "string", description });
const TOOLS = [
  {
    name: "list_projects",
    description: "List the Interactives projects this session can see (id, name, last change).",
    inputSchema: S({}),
    run: async () => {
      const list = await api("projects");
      return list.map((x) => `- ${x.name} [${x.id}] ${x.artboards} artboards, updated ${x.updated}`).join("\n") || "No projects.";
    }
  },
  {
    name: "join_session",
    description: `Join a project's live editing session, the same way an editor tab does. People in the editor see you as "<name> (AI)" and see your edits as they happen. Returns who is there and what each person has selected. Call this before editing.`,
    inputSchema: S({ project_id: str("Project id, e.g. from list_projects or the editor URL #/p/<id>") }, ["project_id"]),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const p = await loadProject(s.projectId);
      return `Joined "${p.name}" as ${ctx().agent} (AI).

${people(s, p)}

${overview(p, {})}`;
    }
  },
  {
    name: "get_selection",
    description: 'What each person in the session has selected (full layer JSON), so you can act on "this" or "the selected layer".',
    inputSchema: S({ project_id: str("Project id") }, ["project_id"]),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const p = await loadProject(s.projectId);
      const out = [people(s, p)];
      for (const peer of s.peers.values())
        for (const id of peer.selection ?? []) {
          const loc = locate(p, id);
          if (loc) out.push(`
${peer.name} selected ${loc.node.name} on ${loc.ab.name}:
${JSON.stringify(loc.node, null, 1)}`);
        }
      return out.join("\n");
    }
  },
  {
    name: "get_overview",
    description: "Outline of a project: artboards, layer trees (name, type, id, position, size), timelines, variables, data sources, scripts, assets. Give artboard_id for one artboard in full depth.",
    inputSchema: S({ project_id: str("Project id"), artboard_id: str("Optional: one artboard (id or name), shown in more depth"), depth: { type: "number", description: "How many levels of nesting to show" } }, ["project_id"]),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      const ab = a.artboard_id ? p.artboards.find((x) => x.id === a.artboard_id || x.name === a.artboard_id) : void 0;
      return overview(p, { artboardId: ab?.id, depth: typeof a.depth === "number" ? a.depth : void 0 });
    }
  },
  {
    name: "get_layers",
    description: "Full JSON of specific layers (by id), including children.",
    inputSchema: S({ project_id: str("Project id"), ids: { type: "array", items: { type: "string" } } }, ["project_id", "ids"]),
    run: async (a) => {
      const p = await loadProject(String(a.project_id));
      return a.ids.map((id) => locate(p, id)?.node ?? { missing: id }).map((n) => JSON.stringify(n, null, 1)).join("\n\n");
    }
  },
  {
    name: "get_interactions",
    description: "An artboard's interaction graph: each event/action/logic node with its settings and where it connects.",
    inputSchema: S({ project_id: str("Project id"), artboard_id: str("Artboard id or name") }, ["project_id", "artboard_id"]),
    run: async (a) => interactions(await loadProject(String(a.project_id)), String(a.artboard_id))
  },
  {
    name: "edit",
    description: 'Change the project. Changes apply in order as one batch and reach everyone in the live session immediately (the server keeps revision history, so a person can roll back). Each change is {op, ...}: set_props {id, props: {path: value}} (paths like "fill.color", "stroke.width", "bindings.width"); add_layer {artboard_id, type, props?, parent_id?, index?, ref?}; delete {id}; move {id, parent_id?, artboard_id?, index?}; add_artboard {name, width, height, ref?}; set_artboard {id, props}; add_variable {name, type: number|string|boolean|color|enum|list, initial (for a list: JSON text, an array of objects), options? (enum), shared?, ref?}; set_variable {id or name, props}; add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, keys: [{t, value, ease}]}], ref?}; add_interactions {artboard_id, nodes: [{ref, kind, params, note?}], edges: [{from, to, from_port?}]} (from/to are refs or ids); remove_interactions {artboard_id, ids}; add_script {name, code, run_on_start, ref?}; set_script {id or name, code?, name?, run_on_start?}. Give "ref" to name something you create, then use "$ref" in later changes in the same batch. Read read_reference("layers"), ("interactions") and ("properties") first.',
    inputSchema: S({ project_id: str("Project id"), changes: { type: "array", items: { type: "object" } }, explain: str("One line saying what this does (shown in the editor log)") }, ["project_id", "changes"]),
    run: async (a) => {
      const s = join(String(a.project_id));
      await s.ready;
      const before = await loadProject(s.projectId);
      const { project, created, touched } = applyChanges(before, a.changes);
      const ops = diff(before, project);
      if (!ops.length) return "Nothing changed.";
      await api(`projects/${encodeURIComponent(s.projectId)}/ops`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: s.clientId, ops }) });
      const first = touched.map((id) => locate(project, id)).find(Boolean);
      if (first) await presence(s, { artboardId: first.ab.id, selection: touched.slice(0, 50), cursor: { x: first.ab.canvasX + first.node.x + first.node.width, y: first.ab.canvasY + first.node.y } });
      const problems = validate(project);
      return `Applied ${a.changes.length} change(s) as ${ops.length} op(s).${Object.keys(created).length ? `
Created: ${JSON.stringify(created)}` : ""}${problems.length ? `

Problems now in the project:
- ${problems.slice(0, 30).join("\n- ")}` : ""}`;
    }
  },
  {
    name: "validate",
    description: "Check a project for broken references (layers, timelines, variables that no longer exist), unconnected events and expressions that do not parse.",
    inputSchema: S({ project_id: str("Project id") }, ["project_id"]),
    run: async (a) => {
      const problems = validate(await loadProject(String(a.project_id)));
      return problems.length ? `- ${problems.join("\n- ")}` : "No problems found.";
    }
  },
  {
    name: "read_reference",
    description: 'Reference for building: "layers" (layer types, fields and defaults), "interactions" (every event/action/logic node and its params), "properties" (animatable/bindable property paths), or any help page id (e.g. "expressions", "scripts", "auto-layout", "repeaters", "data-sources", "timelines"). No topic lists them.',
    inputSchema: S({ topic: str("Topic id") }),
    run: async (a) => reference(String(a.topic ?? ""))
  },
  {
    name: "leave_session",
    description: "Leave a project's live session (people stop seeing you).",
    inputSchema: S({ project_id: str("Project id") }, ["project_id"]),
    run: async (a) => {
      const s = ctx().sessions.get(String(a.project_id));
      s?.abort.abort();
      ctx().sessions.delete(String(a.project_id));
      return s ? "Left the session." : "Was not in that session.";
    }
  }
];
function people(s, p) {
  const list = [...s.peers.values()].filter((x) => !x.left);
  if (!list.length) return "Nobody else is in this project right now.";
  return "In the session:\n" + list.map((x) => {
    const ab = p.artboards.find((a) => a.id === x.artboardId);
    const sel = (x.selection ?? []).map((id) => locate(p, id)?.node.name ?? id);
    return `- ${x.name}${ab ? ` on ${ab.name}` : ""}${sel.length ? `, selected: ${sel.join(", ")}` : ""}`;
  }).join("\n");
}
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
async function respond(msg) {
  const reply = (result2) => msg.id !== void 0 ? { jsonrpc: "2.0", id: msg.id, result: result2 } : void 0;
  const fail = (code, message) => msg.id !== void 0 ? { jsonrpc: "2.0", id: msg.id, error: { code, message } } : void 0;
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "interactives", version: VERSION },
        instructions: 'Interactives is a 2D interactive builder. Start with list_projects, then join_session on the project the person is editing, so your edits show live and you can see their selection. Read read_reference("layers") and ("interactions") before editing, make changes with edit, and check them with validate.'
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = TOOLS.find((t2) => t2.name === msg.params?.name);
      if (!tool) return fail(-32602, `Unknown tool ${String(msg.params?.name)}`);
      try {
        const text = await tool.run(msg.params?.arguments ?? {});
        return reply({ content: [{ type: "text", text }] });
      } catch (err) {
        return reply({ content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
async function handle(msg) {
  const r2 = await respond(msg);
  if (r2) send(r2);
}
function closeContext(c2) {
  for (const s of c2.sessions.values()) s.abort.abort();
  c2.sessions.clear();
}
if (!process.env.INTERACTIVES_MCP_NO_STDIO) {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        void handle(JSON.parse(line));
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
    }
  });
  process.stdin.on("end", () => {
    closeContext(envContext);
    process.exit(0);
  });
}
export {
  TOOLS,
  applyChanges,
  closeContext,
  handle,
  interactions,
  locate,
  overview,
  reference,
  respond,
  runAs,
  sessions,
  setPath,
  syncRuns,
  validate
};
