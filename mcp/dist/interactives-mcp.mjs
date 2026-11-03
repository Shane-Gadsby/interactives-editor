#!/usr/bin/env node
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
  { value: "pointerleave", label: "Hover end" }
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
    kind: "event.pointer",
    label: "On pointer",
    category: "event",
    description: "When a layer is clicked, pressed or hovered.",
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
    description: "When a keyboard key is pressed or released. Leave the key empty for any key.",
    outputs: OUT,
    hasInput: false,
    params: [
      { key: "key", label: "Key", type: "text", placeholder: "e.g. ArrowLeft, a, Enter" },
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
    description: "Play, pause, stop, restart, reverse or jump a timeline.",
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
      ...CONTINUE.map((c) => c.key === "continue" ? { ...c, showIf: { key: "op", values: ["play", "restart", "reverse", "toggle"] } } : c)
    ]
  },
  {
    kind: "action.blendPlay",
    label: "Play blend",
    category: "action",
    description: "Start a blend: its timelines play together and are mixed by the weights from its number variables, until it is stopped. Does nothing if it is already playing.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "blend", label: "Blend", type: "blend" }]
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
    kind: "action.delay",
    label: "Wait",
    category: "action",
    description: "Pause this flow for a time.",
    outputs: OUT,
    hasInput: true,
    params: [{ key: "ms", label: "Milliseconds", type: "number", default: 500 }]
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
  { prop: "originX", label: "Origin X (0-1)", kind: "number" },
  { prop: "originY", label: "Origin Y (0-1)", kind: "number" },
  { prop: "fill.color", label: "Fill colour", kind: "color" },
  { prop: "stroke.width", label: "Stroke width", kind: "number" },
  { prop: "stroke.paint.color", label: "Stroke colour", kind: "color" },
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
  { prop: "ariaLabel", label: "Accessible name", kind: "string" },
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
  { prop: "modifiers.0.x", label: "Text modifier X", kind: "number" },
  { prop: "modifiers.0.y", label: "Text modifier Y", kind: "number" },
  { prop: "modifiers.0.rotation", label: "Text modifier rotation", kind: "number" },
  { prop: "modifiers.0.scale", label: "Text modifier scale", kind: "number" },
  { prop: "modifiers.0.opacity", label: "Text modifier opacity", kind: "number" },
  { prop: "modifiers.0.color", label: "Text modifier colour", kind: "color" },
  { prop: "modifiers.0.letterSpacing", label: "Text modifier letter spacing", kind: "number" },
  { prop: "modifiers.0.blur", label: "Text modifier blur", kind: "number" }
];
function isContainer(node) {
  return node.type === "group" || node.type === "frame";
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
  draw: "Script layer"
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
const DEFAULT_TEXT_STYLE = {
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 400,
  fontStyle: "normal",
  lineHeight: 1.3,
  letterSpacing: 0,
  color: "#111111",
  align: "left",
  verticalAlign: "top"
};
const DEFAULT_DRAW_CODE = DRAW_TEMPLATES[0].code;
const GREY = { type: "solid", color: "#d9d9d9" };
const FACTORIES = {
  rect: () => ({ fill: GREY, stroke: null, cornerRadius: 0 }),
  ellipse: () => ({ fill: GREY, stroke: null }),
  polygon: () => ({ fill: GREY, stroke: null, sides: 6 }),
  star: () => ({ fill: GREY, stroke: null, points: 5, innerRatio: 0.45 }),
  path: () => ({
    fill: null,
    stroke: { paint: { type: "solid", color: "#111111" }, width: 2 },
    paths: [],
    lineCap: "round",
    lineJoin: "round"
  }),
  text: () => ({ ...DEFAULT_TEXT_STYLE, text: "Text", autoSize: "height", width: 200, height: 24 }),
  image: () => ({ assetId: null, fit: "cover", cornerRadius: 0 }),
  group: () => ({ children: [] }),
  frame: () => ({
    children: [],
    fill: { type: "solid", color: "#ffffff" },
    stroke: null,
    cornerRadius: 0,
    clip: true
  }),
  button: () => ({
    ...DEFAULT_TEXT_STYLE,
    fill: { type: "solid", color: "#3b5bfd" },
    stroke: null,
    color: "#ffffff",
    fontWeight: 600,
    align: "center",
    verticalAlign: "middle",
    label: "Button",
    cornerRadius: 8,
    width: 140,
    height: 44
  }),
  input: () => ({
    ...DEFAULT_TEXT_STYLE,
    fill: { type: "solid", color: "#ffffff" },
    stroke: { paint: { type: "solid", color: "#c4c4c4" }, width: 1 },
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
    color: "#3b5bfd",
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
  draw: () => ({
    code: DEFAULT_DRAW_CODE,
    fps: 0,
    pixelRatio: "auto",
    runInEditor: true,
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

![The finished animation: Record is on, two keyframes are set, and the box slides when you press Play.](help/first-animation.mp4)

## 1. Make a project

1. Open the Interactives page and press **New project**. The editor opens with one white artboard called **Home**, 800 by 600.
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

1. Press **New project** on the projects page. Rename the project **Lamp**.
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
- Tick **Persist** on a variable in the Variables tab to remember its value in the visitor's browser between visits.

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
| Lottie | \`.json\` or \`.lottie\` | An artboard and a timeline |
| SVG | \`.svg\` | A group of editable shapes |

If you don't have one handy, any Photoshop file with a few layers and a text layer is a good test.

## 2. Bring it in

There are three ways:

- **Drop it** on the canvas of an open project. \`.psd\`, \`.ai\`, \`.pdf\` and \`.dxf\` files become new artboards.
- Press **+ Import Lottie / Rive / PSD / AI / PDF / VectorCraft / PhotoCraft as artboard** at the bottom of the **Layers** panel. This adds artboards to the open project.
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
2. Under **Project**, set **Page title** (the title of the browser tab), **Fit** (how the artboard scales to its space) and **Page bg** (the colour around the artboard).
3. Under **Artboard**, make sure the artboard people should see first is the start artboard. The button says **Start artboard** (greyed out) when it already is. If not, press **Make start artboard**.

![The Project section of the Inspector: name, page title, description, fit, page background, sandbox and reduced motion.](help/project-settings.png)

## 3. Export a single file

1. Press **Export** at the top right.
2. Choose **Single HTML file**. Your browser downloads one \`.html\` file that holds the player, the project and every image, font and sound.
3. Upload it anywhere that serves web pages, or show it in an iframe. It works offline too.

![The Export menu.](help/export-menu.png)

## 4. Or make a share link

A share link needs no uploading. Anyone with the link can play the project in their browser. They can't edit it.

1. Choose **Export → Share link…**.
2. Press **Create share link**. A link appears.
3. Press **Copy** and send it, or **Open** to try it.
4. The link is a snapshot. When you've changed the project, open the dialog again and press **Update to the latest version**.
5. To stop sharing, press **Turn off link** and confirm. The link then shows a "turned off" page.

![The Share link dialog: the link with Copy and Open, then Update to the latest version and Turn off link.](help/share-link-dialog.png)

## 5. Put it on a page

See [Embedding and the player API](embedding) for the iframe snippet, how the page can set variables and listen for messages, and the \`<interactives-player>\` web component.

## 6. Back it up, or hand it over

- **Export → Project package (.ixp)** saves the whole project with its assets. Anyone can bring it back with **Import** on the projects page.
- On the projects page, the download button on a project card does the same without opening it.
- The **history** button (the clock at the top) lists earlier saved versions. Pick one to preview it, then press **Restore this version**. What was there before is saved first, so you can come back. See [Live editing and saving](live-editing).

## 7. Work with other people

- A project can be opened by its owner, and by staff with power-user access (they use the all-projects view on the projects page). When two or more people are in the same project, a **Live** badge shows, their initials appear at the top, and you see each other's cursors. To let someone else play it without editing, send a share link instead. See [Live editing and saving](live-editing).
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

![The editor: tools down the left edge, then Layers and Assets, the artboards in the middle, the Inspector on the right, and the Timeline, Interactions, Scripts, Variables, Data and Usage tabs along the bottom.](help/editor-overview.png)

## New here? Start with the tutorials

Five short, hands-on tutorials, in order. Each has numbered steps you can follow exactly, and each ends with a link to the next.

1. [Your first animation](tutorial-first-animation): draw a box and make it slide with two keyframes.
2. [Your first interaction](tutorial-first-interaction): a button that plays the animation when it is clicked.
3. [A state machine with variables](tutorial-state-machine): a lamp that switches on and off, with a tap counter.
4. [Importing a design file](tutorial-import-design): bring in a Photoshop, Illustrator, PDF, AutoCAD, Rive or Lottie file.
5. [Publishing and sharing](tutorial-publish): export a single HTML file or make a share link.

If you like to look around first, read [The editor at a glance](interface). If something isn't working as you expect, try [Troubleshooting and common questions](troubleshooting).

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

Press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere to search these pages. The **?** beside an Inspector section opens its page, and hovering a button or field shows a short explanation. See [Using this help](help).

> Everything saves automatically. The label next to the project name says **Saved**, **Saving…** or **Unsaved**.`
  },
  ...TUTORIALS,
  {
    id: "projects",
    title: "Projects page",
    group: "Getting started",
    summary: "Create, open, duplicate, import and delete projects, and organise them with folders, tags, search and sort.",
    keywords: "home new import duplicate delete package ixp god mode power user folder folders tag tags search sort organise organize filter",
    body: `The projects page lists the projects you own. Each card shows a picture of the project's start artboard, its name, when it last changed, how many artboards it has, its tags and a folder menu.

![The projects page: the folder list on the left, the search box, sort menu and tag filter along the top, and a card for each project.](help/projects-page.png)

## Making and opening projects

- **New project** (top right, or the **+** card) makes an empty project with one artboard called **Home**. Your default font is added to it. See [Preferences](preferences).
- Click a card's picture to open the project. **Help** and the gear (**Preferences**) are at the top right too.
- **Import** (also the **import a file** link on the **+** card) opens a \`${PACKAGE_EXTENSION}\` package (a whole project with its assets), a project JSON file, or a design or animation file: Lottie (\`.json\`, \`.lottie\`), Rive (\`.riv\`), Photoshop (\`.psd\`), Illustrator (\`.ai\`), PDF, AutoCAD (\`.dxf\`), VectorCraft (\`.vectorcraft\`) or PhotoCraft (\`.pcraft\`). A package or JSON file comes back as a project of its own, and importing the same file twice gives you two copies. Any other file becomes a **new project**, and for design files the **Import design file** dialog first asks whether to link or embed ([Tutorial 4](tutorial-import-design)).
- Each card has three icon buttons: **Duplicate** (a copy of the project and its assets), **Export** a \`${PACKAGE_EXTENSION}\` package (a download of the whole project) and **Delete**. Delete asks first, and can't be undone, so download a package if you might want the project back.
- With no projects yet the page shows **Create your first project**.

## Search and sort

- The **Search name or tag** box shows only projects whose name or tags contain what you type. **Clear filters** appears if nothing matches.
- **Sort** orders the cards by **Last updated** (newest first, the default) or **Name**. The choice is remembered in this browser.

## Folders

Folders keep a long list tidy. A project is in one folder at most, and folders are one level deep.

- The list on the left shows **All projects**, **No folder** and each folder with its project count. Click one to show only those projects.
- Use the folder menu at the bottom of a card to **move the project to a folder**. Choose **New folder…** to start a new one: a dialog asks for its name. A folder exists as long as at least one project is in it.
- With a folder selected, the pencil **renames** it and the bin **deletes** it (both ask in a dialog). Deleting a folder never deletes projects: they just go back to *No folder*.

## Tags

Tags are short free-text labels, up to 20 per project and 40 characters each.

- Click **+ tag** on a card, type a tag and press <kbd>Enter</kbd> (<kbd>Esc</kbd> cancels). Tags you've used before are suggested. Click the **×** on a tag to remove it.
- The tag row at the top lists every tag in use with a count. Click one to show only projects with that tag, and click it again to clear it.

Folders and tags belong to the project record on the server, not to the project file, so they don't appear in exports, package files or the revision history.

## Who sees what

You see only your own projects. Staff with power-user access can toggle the power-user view (the suite's shared shortcut, shown in a banner as **F9**) to see and open every project; the server checks that access again. In that view you can also file and tag other people's projects.`
  },
  {
    id: "interface",
    title: "The editor at a glance",
    group: "Getting started",
    summary: "Top bar, tools, Layers and Assets, canvas, Inspector, bottom tabs and Preview.",
    keywords: "layout panels toolbar inspector layers dock ui top bar save live history undo zoom preview debug tabs tour",
    body: `![The editor with a project open.](help/editor-overview.png)

## Top bar
From left to right:

- **All projects** (the house): back to the projects page.
- The **project name**. Click to rename.
- The save state: **Saved**, **Saving…**, **Unsaved** or **Save failed** (hover it for the reason).
- **Live**, when others are in the project too: **Live**, **Reconnecting** or **Deleted**. Their initials show beside it. See [Live editing and saving](live-editing).
- **Revision history** (the clock): earlier saved versions of the project.
- **Undo** and **Redo**.
- Zoom: **−**, the percentage (click it to fit everything) and **+**.
- **Preferences** (the gear) and **Help**.
- **Preview** and **Export**.

## Tool bar (left edge)
Drawing tools, then the web-element tools, then **Help** at the bottom. Hover a tool to see its name and shortcut: **Select**, **Hand**, **Artboard**, **Frame**, **Rectangle**, **Ellipse**, **Polygon**, **Star**, **Line**, **Pen**, **Pencil (freehand)**, **Bend**, **Text**, **Script layer**, **Image**, then **Button**, **Input field**, **Link**, **Embed (HTML or iframe)** and **Video**. See [Shapes and paths](shapes), [Shape morphing and the Bend tool](shape-morphing), [Web elements](web-elements) and [Script layers](script-layers).

## Left panel
Two tabs:

- **Layers**: every artboard in the project, with its layer tree. Click to select, drag to reorder or nest, hover for the lock and the eye. See [Layers, hidden and locked layers](layers-panel).
- **Assets**: images, video, audio, fonts and data files in the project. See [The Assets panel](assets).

## Canvas
All artboards side by side. See [Moving around the canvas](canvas). Right-click for menus: see [Layers, hidden and locked layers](layers-panel#right-click-menus).

## Inspector (right)
Settings for the selection. With several layers selected, the bar of align buttons at the top lines them up. With nothing selected, or just an artboard, it shows the artboard, its **Joysticks** and **Blends**, the **Project** settings and the **Fonts**. Section titles with a **?** link to the page in these docs, and the diamonds beside fields key them on the timeline.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables**, **Data** and **Usage**. Click a tab to open it, click it again to close it, and drag the top edge to resize. Each has its own page: [Timelines](timelines), [Interactions](interactions), [Scripts](scripts), [Variables](variables), [Data sources](data-sources) and [Usage](usage).

## Preview
**Preview** runs the project exactly as the exported file will, from the start artboard or the one you're on (the dropdown at the top). **Restart** starts again, and <kbd>Esc</kbd> closes it. The **Debug** panel (on by default) shows:

- **Now showing**: the artboard on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables (live)**: every value as it changes. Type a new value and press <kbd>Enter</kbd> (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too, and so are errors from script layers.

![The Preview with the Debug panel: live variables on the left and the Events list underneath.](help/preview-debug.png)`
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
Artboards you aren't working on are shown as a *still*: a picture of themselves. That keeps panning and zooming smooth in projects with many artboards. Click an artboard (or a layer in it) and it comes alive for editing. The still updates by itself shortly after anything in it changes, so you never need to refresh it. If an artboard looks slightly soft while you pan, that is the still; click it to see it sharp.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.`
  },
  {
    id: "preferences",
    title: "Preferences",
    group: "Getting started",
    summary: "Your own editor settings: wheel, theme, default font, rulers, tooltips.",
    keywords: "settings options wheel tooltips",
    body: `![The Preferences dialog.](help/preferences.png)

Open **Preferences** from the gear in the top bar (or on the projects page). They are yours: saved with your account, so they follow you to any browser you sign in on.

- **Mouse wheel**: *Zoom (Shift+wheel pans)* or *Pan (Ctrl+wheel zooms)*. See [Moving around the canvas](canvas).
- **Theme**: *Dark*, *Light*, or *Auto (follow the system)*.
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. Open Sans unless you change it; any Google font name works.
- **Show rulers**: rulers and guides on the canvas (also <kbd>Shift</kbd>+<kbd>R</kbd>).
- **Show tooltips**: explanations when you hover buttons and fields.

Press <kbd>Esc</kbd> or the **×** to close. Project-wide settings (start artboard, fit, sandbox) are in the inspector with nothing selected. See [Project settings](project-settings).`
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
| **Import design file** | Dropping or picking Photoshop, Illustrator, PDF, AutoCAD, VectorCraft or PhotoCraft files: **Link** or **Embed** each one. See [Importing](import#linking-design-files-instead-of-embedding-them) |
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
- With an artboard selected, the Inspector shows **Name**, **W** and **H** (and **Size presets…** such as Desktop, Tablet or Phone), **Background**, **Clip content to artboard**, **Make start artboard**, **Duplicate artboard** and **Delete artboard**. Then come its **Joysticks** and **Blends**, the **Project** settings and the **Fonts**.
- The **start artboard** is the one the player shows first. It has a **start** badge in the Layers panel. Use **Make start artboard** (also in the right-click menu) to change it.
- Drag layers and let go over another artboard and you're asked whether to move them there. See [Moving layers to another artboard](layers-panel#moving-layers-to-another-artboard).
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
- Drag a row to reorder. Drop it above or below another row, or onto a group or frame to put it inside. Drop it on its own artboard's row to bring it to the top level.
- **+ Add artboard** and **+ Import Lottie / Rive / PSD / AI / PDF / VectorCraft / PhotoCraft as artboard** are at the bottom. See [Artboards](artboards) and [Importing](import).

## Hide and lock
Hover a row and two small buttons appear at its right: a padlock (**Lock** / **Unlock**) and an eye (**Hide** / **Show**). They stay visible for any layer that is locked or hidden. The **Visible** and **Locked** ticks in the Inspector do the same.

- **Hidden** layers are not drawn by the player or in Preview. In the editor they show as a faint **ghost** on the canvas, so you can still see where they are and pick them. Their names are faded in the Layers panel. Hide a mask layer and its clipping stops.
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
- **Rectangle**: corner radius.
- **Polygon**: number of sides. **Star**: points and inner ratio (how deep the points are).
- **Path**: closed or open, fill rule (non-zero or even-odd for holes).
- Any shape can be a **mask** for the layers above it: tick *Use as mask* ([Groups and frames](groups-frames#masks)).

Boolean operations (union, subtract, intersect, exclude) turn several shapes into one path. See [Align, arrange and combine](arrange).`
  },
  {
    id: "fill-stroke",
    title: "Fill, stroke and effects",
    group: "Design",
    summary: "Solid, gradient and image fills; strokes, dashes and trim; shadow, blur and blend modes.",
    keywords: "colour color gradient linear radial image fill stroke border dash cap join shadow blur blend opacity trim path",
    body: `## Fill
Choose the type from the dropdown at the top of the **Fill** section: **None**, **Solid**, **Linear gradient**, **Radial gradient** or **Image** (cover, contain or fill). For a gradient, set the colour and position of each stop, press **+ Add stop** for more, and set the **Angle** of a linear one. Colours accept hex, \`rgb()\`, \`hsl()\` and names; the number box beside a colour is its opacity. The **×** in a section's header removes the fill or stroke, and the **+** adds it back.

## Stroke
Colour, width, **cap** (butt, round, square), **join** (miter, round, bevel) and **dash** (e.g. \`8 4\` for 8 on, 4 off).

### Trim path
The **Trim** row in the Stroke section has a start (**Trim**), an end (**to**) and an offset (**Off**), all 0–100%. They draw only part of a stroke. Animate the end (the *Trim end %* property) from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
Use **+** in the **Effects** section to add a shadow or a layer blur; each one has a **×** to remove it.

- **Shadow**: **X**, **Y**, **Blur**, **Spread** and **Colour**. Tick **Inner** to draw the shadow inside the shape instead of behind it.
- **Layer blur**: blurs the whole layer by an **Amount** in pixels.

Two related settings are in the top section of the Inspector, with the position fields:

- **α** is the opacity of the whole layer (0 to 1).
- **Blend** is how the layer mixes with what is under it: *normal*, *multiply*, *screen*, *overlay*, *darken*, *lighten*, *color-dodge*, *color-burn*, *difference* or *exclusion*.

Most of these can be animated: look for the diamond next to a field. See [Animatable properties](animatable-properties).`
  },
  {
    id: "text",
    title: "Text",
    group: "Design",
    summary: "Text layers, fonts, sizing and live values in text.",
    keywords: "font typography type size weight align template variables google fonts upload rich text runs bold italic underline selection range several styles",
    body: `Use the **Text** tool (<kbd>T</kbd>): click for text that grows as you type, or drag a box for wrapping text. Double-click text to edit it, and <kbd>Escape</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

- **Sizing**: *Auto width* (one line, grows sideways), *Auto height* (fixed width, wraps and grows down) or *Fixed* (clips nothing, you set both).
- **Font**: any Google font by name (add it in the **Fonts** section of the Project settings), or a font file you upload in the [Assets panel](assets), which is added to the fonts for you.
- Weight, italic, size, line height, letter spacing, alignment, vertical alignment, case and decoration.

## Several styles in one text layer
Double-click a text layer, select some of the text and press <kbd>Ctrl</kbd>+<kbd>B</kbd> (bold), <kbd>Ctrl</kbd>+<kbd>I</kbd> (italic), <kbd>Ctrl</kbd>+<kbd>U</kbd> (underline) or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> (strikethrough); <kbd>Cmd</kbd> on a Mac. While part of the text is selected, the Font, Size, Weight, Letter, Colour, Italic and Decoration fields in the inspector change just that selection. Select all of a layer that has no styled parts and they change the whole layer, as usual. Click outside the text to go back to styling the whole layer.

Each differently styled stretch is a **run**. A run only records how it differs from the layer's own style, so changing the layer's colour or font still changes every run that doesn't set its own. The **Text runs** list in the inspector shows them: edit a run's text, toggle bold/italic/underline/strikethrough, change its colour or size, give it a link, add a run, or clear all run styling. Neighbouring runs with the same style merge by themselves. Runs can also link: a run with a link URL is a hyperlink to that address in the player (links in runs are inert while editing).

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
- **Shape**: how strongly units are hit across the range. *Square* hits all of them equally, *Ramp up* and *Ramp down* grow or fade across it, *Triangle*, *Round* and *Smooth* peak in the middle (*Smooth* has soft edges). **Ease** shapes the falloff.
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
    keywords: "assets files upload thumbnails details size slider checkbox select all delete remove place unused image video audio font data panel",
    body: `The **Assets** tab in the left panel lists every file in the project: images, video, audio, fonts and data files.

![The Assets panel in thumbnail view, with one asset checked and the Delete button showing.](help/assets-panel.png)

## Adding files
- **Upload files** opens a file picker. You can pick several at once.
- Or drop files on the canvas, or paste them. Dropped pictures and video are also placed on the artboard where you dropped them.
- Font files (\`.woff\`, \`.woff2\`, \`.ttf\`, \`.otf\`) are added to the project's fonts as well, and a message tells you.
- Data files (JSON, CSV, TSV, text) are used from the **Data** tab. See [Data sources](data-sources).
- Design files (\`.psd\`, \`.ai\`, \`.pdf\`, \`.dxf\`) aren't stored as assets: they become new artboards. See [Importing](import).

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
Turn on **9-slice** and set the four insets (in image pixels). The corners keep their size and the edges and middle stretch, so a rounded panel or button image can be resized without distortion.

## Video
Autoplay, loop, muted, controls and fit. Most browsers only autoplay muted video.`
  },
  {
    id: "groups-frames",
    title: "Groups and frames",
    group: "Design",
    summary: "Grouping layers, frames that clip and lay out, masks, solo groups, draw order and scrolling frames.",
    keywords: "group frame container clip mask masking clipping solo state switch draw order z-order nest focus scroll scrollable overflow",
    body: `- A **group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) moves, scales and animates its layers together. Its size follows its contents.
- A **frame** (<kbd>F</kbd>) is a box with its own fill, stroke and corner radius. It can **clip** its contents and can use [auto layout](auto-layout).

Press <kbd>Enter</kbd> on a group or frame to work inside it; <kbd>Escape</kbd> goes back out.

## Masks
Tick **Use as mask** on a shape or group and it clips the layers above it in the same group, up to the next mask, so they only show inside its outline (the way masks work in most design tools). A group masks with the shapes inside it. A picture used as a mask clips by its transparency (so a cut-out PNG works as a stencil), as long as it is stretched to its box (fit *fill*) and only moved or scaled. The mask itself is not drawn in the player; on the canvas it shows as a faint ghost so you can still pick it. Hide the mask layer to turn the clipping off. To clip just one layer, put the mask and that layer together in their own group.

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
    summary: "Frames that arrange their children in rows or columns, with fill, hug and percent sizes.",
    keywords: "flex flexbox row column stack gap padding justify align wrap hug fill percent absolute responsive",
    body: `Turn on **Auto layout** on a frame and its children are placed for you, like CSS flexbox.

| Setting | Meaning |
|---|---|
| Direction | Row (left to right) or column (top to bottom) |
| Gap | Space between children |
| Padding | Space inside the frame's edges |
| Justify | Where children sit along the direction: start, centre, end, space between |
| Align | Across the direction: start, centre, end, stretch |
| Wrap | Start a new row/column when one is full |
| Hug width / height | The frame shrinks or grows to fit its children |

## Child sizing
Each child of an auto-layout frame gets a **Layout** section:

- **Fixed**: its own width/height.
- **Fill**: shares the frame's free space with other fill children.
- **Hug**: fits its own contents (frames and text).
- **Percent**: a percentage of the frame.
- **Margin** around it.
- **Position**: *In flow* (laid out), *Absolute* (placed by insets from the frame's edges, e.g. pinned to the bottom right) or *Ignore* (keeps its own x/y).

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.

## Animate changes
Turn on **Animate changes** in the frame's Auto layout section and, while the project plays (Preview and the published player), children glide to their new place instead of jumping. It covers layers shown or hidden, a solo or draw order switching, text changing length, a list gaining or losing items, the frame being resized, and direction, gap, padding or alignment being set by an action.

| Setting | Meaning |
|---|---|
| Duration | How long a glide takes, in milliseconds |
| Easing | A preset, or *Custom* to drag the curve's handles |
| Enter | How a layer looks as it appears (a layer shown, or a new list item): *None*, *Fade*, *Scale* (grows from nothing) or *Fade and scale* (from 80%) |
| Exit | How a layer looks as it goes (hidden, or a list item removed): it fades or shrinks where it was, then goes |

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
    id: "instances",
    title: "Instances (components)",
    group: "Design",
    summary: "Place one artboard inside another, with its own timelines, interactions and inputs.",
    keywords: "component nested artboard reuse symbol instance inputs",
    body: `Any artboard can be placed inside another as an **instance**: a live copy that runs its own timelines and interactions on the parent's clock. Edit the source artboard and every instance updates.

- Select the artboard you want to reuse and pick the artboard to put it in from **Use in** (it says **Place as an instance in…**). Or choose an artboard in an instance layer's **Artboard** field.
- **Fit** decides how the artboard sits in the instance's box: **Stretch to the box**, **Contain**, **Cover** or **Actual size, centred**. **Reset size** puts the box back to the artboard's own size, and **Edit** followed by the artboard's name jumps to the source artboard.
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source. Write them as JSON, such as \`{"level": 3}\`.
- Messages sent inside an instance (**Send message**, \`ix.emit\`) bubble up to the parent.

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
| Copy scale | Takes another layer's scale. |

Every constraint has a **Strength** (0–100%) that mixes between the layer's own value and the constrained one, and it can be animated. Constraints are applied in the player and on the canvas.`
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
- **Embed**: an iframe from a URL, or your own HTML.
- **Video**: a video file or URL.

## Accessibility
Every layer has an **ARIA label** and a **CSS class** in the Advanced section. Give shapes that act like buttons an ARIA label. The player honours the viewer's *reduce motion* setting when the project setting **Respect reduced motion** is on.`
  },
  {
    id: "links-cursors",
    title: "Links and cursors",
    group: "Web elements",
    summary: "Make any layer a link, and choose the cursor shown when hovering it.",
    keywords: "hyperlink url href target new tab cursor pointer hand custom cursor image hotspot",
    body: `## Link
In the **Link** section, give any layer a **URL** and it becomes a real link. **Open in** chooses where: a new tab, the same frame, the parent frame, or the whole page (useful when the interactive is embedded in an iframe). URLs can contain \`{expressions}\`.

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
- Or click the diamond next to a field in the inspector to key its current value.
- Or select a layer, choose a property in the dropdown at the top left of the Timeline and press **+ Key**.
- Drag keys to retime them (<kbd>Shift</kbd> snaps to 100 ms), <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove. The diamond on a layer's own row moves all of that layer's keys at that time.

## Timeline settings
| Setting | Meaning |
|---|---|
| Length | Duration in milliseconds |
| **Play once** / **Loop** / **Ping-pong** | What happens at the end |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast). To play backwards use a **Control timeline** node set to **Play in reverse** |

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). In the Tween panel, drag the two handles on the graph to make your own curve; the dashed lines mark the start (0) and end (1) values, and the graph grows to show overshoot. Select a key to change its time or value.

## Markers
A **marker** is a named point in time. Press **+ Marker** to add one at the playhead; it shows as a flag on the ruler and is called *Marker 1*, *Marker 2* and so on until you rename it. Drag it to move it, or select it to rename it, set its time or delete it. An **On timeline marker** node runs its flow whenever playback passes the marker: going forwards or in reverse, and on every lap of a loop or ping-pong. Leave *Marker name* empty to react to every marker on the timeline; \`event.marker\` and \`event.time\` say which one fired. Scrubbing and seeking do not fire markers, only playing.

![The timeline bar and tracks. The flag on the ruler is a marker.](help/timeline-markers.png)

## Design view and timeline view
There are two ways to look at an artboard.

- **Design view**: the canvas shows the layers as they really are, with no animation applied. This is where you place and style things. Opening an artboard starts here, and the Timeline tab says **Design view: the canvas shows the layers as they are. Choose a timeline to see and edit its animation.**
- **Timeline view**: choose a timeline from the dropdown at the top left of the Timeline tab and the canvas shows that timeline at the playhead. Drag the playhead to see any frame, and with **Record** on, changes become keyframes.

Choose **Design view (no timeline)** in the same dropdown to go back. Record turns itself off when you do.

## Switching children and draw order
Two properties are not numbers. **Solo: active child** on a [solo group](groups-frames) switches which child shows, and **Draw order (children)** changes which child is in front. Both step at their keys instead of blending. Key them from the group's Solo and Draw order sections in the inspector.

## Playing from interactions
**Control timeline** plays, restarts, pauses, stops, reverses, toggles or jumps to a time in a timeline. From scripts: \`ix.timeline('Intro').play()\`. **On timeline end** fires when one finishes, and **On timeline marker** fires at each [marker](timelines#markers).`
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
2. Press on an edge of a path and drag. The edge turns into a curve that follows the pointer; a straight edge becomes curved by moving the handles of the two points at its ends.
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
2. Open the **Blends** section and click **Build an example to try**. You get a ball, two timelines (*Example: small and red* and *Example: big and blue*), a variable called *mix*, a slider bound to it, and a blend that starts with the artboard.
3. Click **Preview** and drag the slider. At 0 the ball is small and red, at 1 it is big and blue, and in between it is a mix of the two.
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
    id: "interactions",
    title: "Interactions",
    group: "Interactivity",
    summary: "The node graph: events start a flow, actions do things, logic chooses the way.",
    keywords: "interaction graph node event action logic state machine wire edge connect flow",
    body: `Open the **Interactions** tab. Each artboard has its own graph.

- **Events** (green) start a flow: a click, a key, a timer, a variable changing, a timeline ending, a message from the host page, scrolling, data loading, or the artboard starting.
- **Actions** (blue) do something and continue: **Control timeline**, **Play blend**, **Set variable**, **Set property**, **Animate property**, **Show / hide**, **Go to artboard**, **Open URL**, **Play sound**, **Run script**, **Send message**, **Wait** and more.
- **Logic** (purple) chooses where to go: **If** (a **true** and a **false** output), **Toggle** (alternates between **a** and **b**), **Once** and **Sequence** (runs **1**, then **2**, then **3**).

![The Interactions tab: the node palette, the graph and the settings of the selected node.](help/interactions-panel.png)

Drag from an output port to the next node's input to connect them. Actions that take time (**Control timeline**, **Animate property**, **Play sound**) have a **Continue** setting: the next node runs when it finishes, part-way through (a percentage), or straight away. Let go on empty space instead and a menu offers only the nodes that fit (actions and logic when you drag from an output, anything with an output when you drag backwards from an input); the one you pick is added where you let go and connected for you. Press <kbd>Escape</kbd> or click away to cancel.

![Dragging a connection into empty space adds a node and joins it.](help/drag-to-connect.mp4)

Click a node in the palette on the left (or drag it onto the graph) to add it; select a node to edit its settings on the right. Settings that name a variable or a sound also offer **+ Create new variable…** or **+ Add a new sound…** in their dropdown, so you don't have to leave the graph. Each node has a **Note** box for a reminder to yourself, and **Delete node** at the bottom.

## Right-click and shortcuts
- Right-click empty graph for **Add node**.
- Right-click a node for **Connect to new node**, **Connect to existing node**, **Disconnect**, **Duplicate** (<kbd>Ctrl</kbd>+<kbd>D</kbd>), **Help for this node** and **Delete** (<kbd>Del</kbd>).
- Right-click a connection to **Delete connection**.
- Right-click a *layer* on the canvas, choose **Add interaction**, then **On click…** or **On hover…** to add an **On pointer** event with a **Control timeline** action already joined to it.
- In the Inspector, a layer's **Interactions** section lists its events and has **+ On click** and **+ On hover**.

Test in **Preview**: the event list shows each event as it fires. Every node is listed in [Interaction node reference](interaction-nodes). For a walk-through, see [Tutorial 2](tutorial-first-interaction).

## What's in scope
Expression fields can use every variable and data source by name, \`event\` (details of what fired: \`event.key\`, \`event.x\`, \`event.index\` for a repeated copy, \`event.payload\` for a message) and \`Math\`.

## Messages to and from the host page
**Send message** (and \`ix.emit\`) posts \`{source: 'interactives', name, payload}\` to the page the interactive is in. The page can send messages back with \`player.send(name, payload)\` and **On message** reacts. See [Embedding and the player API](embedding).`
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
| Colour | \`#3b5bfd\` |
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

Variable names must be letters, digits and \`_\` so expressions can use them. The name is saved when you leave the field. Tick **Persist** to remember the value in the visitor's browser between visits (for a score, a saved choice or a name). Press **+ Add variable** to make one, and the bin to delete it. See [Tutorial 3](tutorial-state-machine) for a worked example.

![The Variables tab.](help/variables-panel.png)`
  },
  {
    id: "expressions",
    title: "Expressions",
    group: "Interactivity",
    summary: "Short JavaScript formulas in text, bindings and node settings.",
    keywords: "expression formula javascript template braces condition ternary math",
    body: `An expression is a short piece of JavaScript that gives a value. Variables and data sources are in scope by name.

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

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).`
  },
  {
    id: "bindings",
    title: "Bindings",
    group: "Interactivity",
    summary: "Drive a layer property from a variable, data or expression, live.",
    keywords: "bind binding data binding property drive reactive",
    body: `A binding sets a layer's property from an [expression](expressions), and keeps it up to date as variables and data change. In the **Data bindings** section of the Inspector, pick a property in the dropdown, press **Bind**, and type the expression.

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
| \`ix.onFrame((dt, t) => …)\` | Run every frame |
| \`ix.pointer\`, \`ix.artboard\` | Pointer \`{x, y, down}\`, artboard \`{name, width, height}\` |
| \`ix.data.name\`, \`await ix.loadData(name)\` | Data sources |
| \`ix.setCursor('grab')\`, \`ix.log(…)\` | Cursor, logging |

To paint a layer from a script every frame (generative art, particles, charts), use a [Script layer](script-layers).

## The sandbox
New projects run scripts in a sandbox: a separate JavaScript engine compiled to WebAssembly. Scripts there can only use \`ix\`, timers and \`console\`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped. Turn **Run scripts in the sandbox** off in Project settings only for code you trust that needs the page (\`node.element\`, \`fetch\`).`
  },
  {
    id: "script-layers",
    title: "Script layers",
    group: "Interactivity",
    summary: "A layer painted by a script every frame: generative art, particles, charts and custom visualisations.",
    keywords: "script layer draw canvas generative art particles chart graph visualisation visualization animation code g.rect g.circle fps pixel ratio sandbox",
    body: () => `A **Script layer** is a box that a script paints every frame. Use it for things shapes and timelines can't do well: particles, generative art, live charts, custom meters and any other visualisation that is easier to compute than to draw by hand.

Pick the **Script layer** tool in the toolbar and drag a box. It starts with a small script that already runs, and the **Start from** menu in the inspector replaces it with a starter: ${DRAW_TEMPLATES.map((t) => `**${t.name}**`).join(", ")}.

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
- **Pixels**: canvas pixels per layer pixel. **Auto** follows the screen's density and the artboard's scale, up to 3. A fixed number is sharper but slower; very large layers are held to what the browser can allocate.
- **Paint while editing**: draws a single still frame on the canvas, at the timeline's time (0 when no timeline is showing), so you can lay out the artboard. Turn it off for a heavy script; the layer then shows as a placeholder. **Preview** always runs it.

The layer is an ordinary layer otherwise: move, rotate, fade, blend, mask and animate it, and click it with an **On pointer** event. Inside the script, \`g.pointer\` gives the pointer in the layer's own pixels (\`x\`, \`y\`, \`down\`, \`inside\`), correct even if the layer is rotated or inside a group.

## Errors and limits

- The script runs in the [sandbox](scripts) when the project has **Run scripts in the sandbox** on (the default): no page, network or storage access, and a frame that takes more than about 100 ms is stopped. Without the sandbox bundle the layer shows nothing.
- An error in the script **stops that layer only**. The message shows under the code, in the layer on the canvas, and in the Preview's event list. Edit the code to start it again.
- A frame is limited to 20,000 drawing commands. Past that, the rest are dropped and a warning is shown. Join many segments into one path with \`g.path\`.
- \`g.random()\` is seeded: the layer draws the same numbers on every run. Call \`g.seed(1)\` at the start of \`draw\` for a picture that stays the same from frame to frame.`
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
  // ---------------------------------------------------------------- data
  {
    id: "data-sources",
    title: "Data sources",
    group: "Data",
    summary: "JSON, CSV, TSV or text from an uploaded file or a URL, used by name.",
    keywords: "data json csv tsv text url fetch api spreadsheet refresh cors",
    body: `Open the **Data** tab and add a source **From file** (upload) or **From URL** (fetched by the player).

- **Format**: JSON, CSV or TSV (first row is the column names), or plain text. CSV and TSV become a list of rows, with numbers and true/false converted.
- **Refresh** (URLs): fetch again every n seconds; 0 loads once.
- The preview on the right shows what was loaded, with the field names you can use.

Use a source by its **name** anywhere expressions go: \`{products.length} products\`, a binding \`products[0].price\`, or **Repeat → Items** \`products\`. Scripts read \`ix.data.products\`.

**Load data** reloads a source (optionally from a different URL); **On data loaded** fires when it arrives. The host page can push data with \`player.setData('products', [...])\`.

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

**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best).

Clicks on a copy fire **On pointer** for the template layer with \`event.index\`, so \`products[event.index]\` is the item that was clicked.`
  },
  {
    id: "project-settings",
    title: "Project settings",
    group: "Getting started",
    summary: "Start artboard, fit, page title, fonts, sandbox and reduced motion.",
    keywords: "settings start artboard fit scale page title background fonts sandbox reduced motion",
    body: `![The Project section of the Inspector.](help/project-settings.png)

Click an empty part of the canvas, or an artboard's name, to see the **Project** settings in the Inspector (below the artboard's own).

| Setting | Meaning |
|---|---|
| Name | The project's name, as on the projects page |
| Page title | The title of the browser tab for the exported page |
| Description | A note about the project, kept in the file |
| Fit | How the artboard scales to the space it's given: **Contain (letterbox)**, **Cover (crop)**, **Stretch**, **Fit width (page height follows)** or **Actual size** |
| Page bg | The colour around the artboard in the exported page |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |
| Start artboard | Shown first in the player: set with **Make start artboard** on an artboard |
| Fonts | Google fonts by name (type one and press **Add**), or font files you upload in the **Assets** panel |`
  },
  // ---------------------------------------------------------------- import/export
  {
    id: "import",
    title: "Importing Lottie, Rive, Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft and SVG",
    group: "Import and export",
    summary: "Bring in Lottie JSON / dotLottie, Rive .riv files, Photoshop .psd files, Illustrator .ai files, PDFs, AutoCAD DXF (and what to do with DWG), VectorCraft .vectorcraft and PhotoCraft .pcraft files, SVG and project packages.",
    keywords: "import vectorcraft drawcraft photocraft pcraft lottie dotlottie rive riv svg after effects bodymovin convert photoshop psd layers illustrator ai pdf autocad cad dxf dwg drawing plan layers artboards vector link linked embed watch reimport re-import update changes reconnect",
    body: `| File | Becomes | Can be linked |
|---|---|---|
| Lottie (\`.json\`, \`.lottie\`) | An artboard and a timeline | No |
| Rive (\`.riv\`) | An artboard for each Rive artboard, with timelines, state machines and bindings | No |
| Photoshop (\`.psd\`) | An artboard of layers, with editable text | Yes |
| Illustrator (\`.ai\`) and PDF | An artboard per page, as vector art | Yes |
| AutoCAD (\`.dxf\`) | An artboard with a group per CAD layer (\`.dwg\` must be saved as DXF first) | Yes |
| VectorCraft, PhotoCraft | Artboards of layers | Yes |
| SVG | A group of editable shapes | No |

New to this? [Tutorial 4](tutorial-import-design) walks through an import step by step.

Lottie, Rive, Photoshop, Illustrator, PDF, AutoCAD (\`.dxf\`), VectorCraft and PhotoCraft files: use **+ Import Lottie / Rive / PSD / AI / PDF / VectorCraft / PhotoCraft as artboard** in the Layers panel (adds artboards to this project) or on the projects page (makes a new project). A \`.psd\`, \`.ai\`, \`.pdf\` or \`.dxf\` file dropped on the canvas also becomes new artboards.

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients, transforms, trim paths and keyframes with easing become layers and a timeline. Text animators with range selectors become [text modifiers](text-modifiers). Expressions, layer masks, track mattes, layer effects, skew and time remapping are not carried over, and the import report lists what was dropped.

## Rive (.riv)
![A Rive file after import: each Rive artboard is an artboard, with its animations as timelines and its state machine as interactions.](help/rive-import-result.png)

Each Rive artboard becomes an artboard: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Shape morphing (animated path points), holes, clipping shapes (a clip shape that follows another shape keeps following it) and translation and transform constraints are carried over; bones and meshes are not. Rive centres a stroke on its outline, so a stroked rectangle or ellipse comes in a stroke-width bigger to keep the same outer edge. State machine layers that start an animation from any state with nothing to wait for (the looping animations of an icon) start when the artboard does.

Rive **events** become messages: a *Send message* node with the event's name, and its custom properties as the payload (an object, e.g. \`event.payload.power\`). An event keyed on an animation becomes a [timeline marker](timelines) with an *On timeline marker* node; events fired by listeners and by states or transitions (at their start or end) become *Send message* nodes in those flows, and Rive event listeners become *On message* nodes. An **audio event** also plays its embedded sound (a *Play sound* node, with the audio stored as a project asset), and an **open URL event** also opens its link (an *Open URL* node). Audio that is hosted on Rive's CDN instead of embedded is skipped, and the import report says so.

Rive **view models** become shared [variables](variables): numbers, true/false, text, colours, triggers (a count that goes up when it fires) and enums (a *Choice* with the enum's options), and a list property becomes a *List* of the first items' values. Transitions and listeners that read or write them keep working. **Data binds on layers** (a view model value driving a layer's position, rotation, scale, opacity, text, fill or stroke colour, stroke width and so on) become [bindings](bindings), with the bind's converters (to text with decimals, rounding, boolean negate, range mapper, add, subtract, multiply, divide, to number, string pad and trim, formulas that are plain arithmetic) as converters. Two-way and to-source binds are brought in one way only (value to layer), and interpolating converters apply instantly.

## Photoshop (.psd)
![A Photoshop file after import: layers, a live text layer, and hidden layers kept hidden.](help/psd-import-result.png)

The document becomes an artboard of the same size. Every pixel layer becomes an image layer (stored as a PNG asset) at its position, folders become groups, and the layer name, visibility, opacity (including fill opacity) and these blend modes carry over: multiply, screen, overlay, darken, lighten, color dodge, color burn, difference and exclusion. 8 and 16 bit RGB and grayscale files import as layers. Indexed colour and CMYK files (and files with no layers) import as one flattened picture, and 32 bit, bitmap, Lab, duotone and multichannel files are not supported. Layers with nothing in them are skipped without comment.

**Text layers** become real, editable text layers: the text, font, size, colour, alignment, line height, letter spacing (tracking) and bold, italic, underline and strikethrough, with a style run for each stretch that differs (so a heading with one red word stays one layer). Photoshop stores a font as a PostScript name such as \`Montserrat-SemiBold\`; the importer turns it into a family and weight. Families that are Google fonts are added to the project's fonts so they load; any other font keeps its name and shows only where that font is installed, so check the font field in the inspector. Point text (a click on the canvas) becomes a box that does not wrap, paragraph text (a dragged box) keeps its width and height. Text that is warped, vertical or has a layer mask stays a picture of its pixels, named after the text, and is listed in the report.

**Clipping groups.** In Photoshop a layer set to *Create clipping mask* only shows inside the layer below it. Each such base and its clipped layers become a group named after the base with "(clipped)" added: the base, then a copy of the base used as a [mask](groups-frames#masks) (a picture masks by its transparency), then the clipped layers. The group carries the base's opacity and blend mode. Move or resize the base and its mask copy together, or delete the mask copy to stop the clipping.

**Masks.** A layer's pixel mask is baked into the layer's transparency. A folder's pixel mask becomes a mask picture placed over the folder, inside a wrapper group. A vector mask becomes a path layer used as a mask, in a group with the layer (edit the path to reshape the cut-out); the outline of a shape layer is not a mask and is left alone.

Not carried over, and listed in the report: layer styles and effects (shadows, strokes, glows), adjustment layers, smart-object filters, other blend modes (they import as normal), and layer comps. Each layer is stored at its full size, so a large document with many layers makes a big project.

## Illustrator (.ai) and PDF
Illustrator saves a PDF inside its files when **Create PDF Compatible File** is ticked in the save options (it is by default). The importer reads that PDF, so a \`.ai\` file saved without it can't be imported: you'll see "Save the file with 'Create PDF Compatible File' ticked", and re-saving from Illustrator fixes it. Ordinary \`.pdf\` files import the same way.

Every page becomes an artboard of the page's size (the trim box when the file has one), laid out side by side. A file with one artboard gives an artboard named after the file; with several, each is named *file / Artboard 2* and so on.

What you get is editable vector art:

- **Paths** become path layers, with fills, strokes (width, caps, joins, dashes) and even-odd fills. The positions and any scaling or rotation are applied to the points, so every shape sits where it was.
- **Colours** in grayscale, RGB, CMYK, spot (separation) and indexed spaces; CMYK is converted with an approximation, so print colours can look a little different on screen.
- **Gradients**: linear and radial gradients (axial and radial shadings) become linear and radial fills. A radial gradient is centred on its shape.
- **Clipping** becomes a [mask](groups-frames#masks): a group holding a path used as a mask in front of the layers it clips. Clips that cover everything inside them are dropped.
- **Opacity** (fill and stroke) and these blend modes: multiply, screen, overlay, darken, lighten, color dodge, color burn, difference and exclusion.
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

**DWG files** (the AutoCAD drawing format itself) can't be read directly: you'll see "DWG version AC1032 (AutoCAD 2018 and later): save it as DXF from your CAD program". In AutoCAD, BricsCAD, DraftSight, LibreCAD and similar, use **File > Save As > DXF** (any version; R2000 or later keeps the most) and import that file. Like Photoshop and Illustrator files, a DXF can be linked and watched for changes.

## VectorCraft (.vectorcraft)
A VectorCraft file (and the older \`.drawcraft\` name) is read as editable vector art. Each artboard in the file becomes an artboard (one artboard is named after the file, several are named *file - Artboard name*), holding the artwork that touches it.

- **Layers and groups** become groups with the same name; hidden stays hidden, and opacity and these blend modes are kept: multiply, screen, overlay, darken, lighten, color dodge, color burn, difference and exclusion. A clip group or clipped layer becomes a [mask](groups-frames#masks) in front of what it clips.
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

## Linking design files instead of embedding them
When you drop (or pick) a Photoshop, Illustrator, PDF, VectorCraft or PhotoCraft file, a dialog asks for each file whether to **Link** or **Embed** it, with **Link all** and **Embed all** for the lot. Embed copies the file in once. **Link** keeps a connection to the file on your computer: the editor checks it every couple of seconds while the tab is open and when you come back to it, and when you save it in the design app the changes come into the artboard.

How a re-import merges (your edits are kept):
- Layers are matched by name (in the same folder, the nth layer of a repeated name), and a layer renamed in the file is recognised by its picture or text and position.
- A property (position, size, opacity, visibility, text, style, ...) the file changed is updated **unless you changed it too**: what you edited stays. Pictures that changed in the file are replaced; one you swapped for another picture stays.
- New layers in the file appear in their place in the layer order. Layers you added yourself, and all timelines, interactions and bindings, are left alone.
- A layer the file no longer has is removed. If you gave it keys, interactions or bindings it stays instead, hidden, and is renamed "(removed from file)", so nothing you built is lost. A layer you deleted here stays deleted.
- One undo step undoes a whole re-import. A toast says what happened ("Poster.psd updated: 3 layers changed, 1 added").

Select a linked artboard to see **Linked to Poster.psd (updated 2 min ago)** in the inspector, with **Re-import now**, **Unlink (keep as embedded)** and a **Watch for changes** switch. Unlinking leaves the layers as they are.

Linking needs a browser with the File System Access API (Chrome or Edge). In Firefox and Safari files are embedded, and the dialog says so. Each time you open the project the browser must be allowed to read the file again, so a bar asks you to click **Reconnect**. The link lives in the browser that made it: other people in the project see the last imported state and get updates when the person with the file saves them, and the bar tells them whose computer has it. A copy of a linked artboard is not linked.

![The Import design file dialog.](help/link-or-embed-dialog.png)

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
| Lottie JSON (this artboard), dotLottie (this artboard) | The open artboard's shapes and timeline, for Lottie players (no interactivity). A report lists what couldn't be written |
| PNG image (this artboard), PNG image, 1× | The open artboard as a picture, at 2× or at actual size, at the timeline's playhead |
| SVG image (this artboard) | The open artboard as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |
| Share link… | A link that plays the project in the browser (below) |

The files are named after the project (and the artboard, for pictures and Lottie).

![The Export menu.](help/export-menu.png)

## Share link
**Export → Share link** publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it); links are long and random so they can't be guessed. It is a snapshot: press **Update to the latest version** to publish later changes, or **Turn off link** to stop it working (after you confirm, the link shows a "turned off" page). **Copy** copies the link and **Open** opens it in a new tab.

![The Share link dialog.](help/share-link-dialog.png)

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
Messages the project sends arrive as \`ix-message\` events.

## From JavaScript
\`\`\`
import { Player, loadProject } from 'interactives-player';
const player = new Player(document.getElementById('stage'), await loadProject('scene.ixp'));
player.on('message', ({ name, payload }) => console.log(name, payload));
player.send('addToCart', { sku: 'A1' });
player.setVariable('score', 10);
player.timeline('Intro').play();
player.goTo('Checkout', 'fade');
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
- **Drag a component onto the canvas**, or press **Place** to put it in the open artboard. The first time, the component's artboard is copied into your project as a **library artboard** (badged *library* in the layers list) and an [instance](instances) of it is placed. Placing it again reuses the same copy. **Add artboard** copies it in without placing anything.
- A library artboard is **read-only**: its layers, timelines and interactions come from the library. You can move it and rename it. Variables, fonts, data sources and assets it needs are added to your project (a variable or data source you already have with the same name is left alone).
- Libraries are copied, not linked live: the artboards, assets and styles are in your project, so [exports](export) and the player are self-contained.

## Updates
When the library publishes a new version, its entry shows **Updates available**. Press it to **review**: each changed component lists what changed (layers added, removed or changed, size, timelines, interactions), and styles are listed too. Then **Update all**, or **Update this one** per component.

What is kept when you update: the instances you placed in your own artboards, their **Inputs**, their position and size, your variables (and their values), your own artboards and your own styles. A component the library has removed stays in your project as it is until you detach or delete it.

## Detach
**Detach to edit** (Inspector, or in the library's list) turns a library artboard into a normal artboard you can edit. It stops getting updates. **Stop using this library** detaches everything from it and makes its styles your own.

## Styles
**Styles** holds named colours and text styles.
- **+ Colour** and **+ Text** create one from the selected layer. Double-click a name to rename it; the colour box edits a colour.
- **Fill**, **Stroke** and **Text** (colours), and **Apply** (text styles) set the selected layers from a style. A layer **follows** the style: edit the style, or update the library it came from, and the layer changes too. Changing that property on the layer yourself stops it following.
- A library's styles are added to your project when you add the library, kept in step on update, and cannot be edited here.

## Limits
- Components carry artboards (with their timelines and interaction graphs), variables, fonts, data sources and assets. Project **scripts** are not carried; instances do not run scripts of their own anyway.
- An update replaces a copy's content by layer id. Inputs that name a variable the library renamed or removed are left as they were.
- Only the latest version is kept on the server, so you cannot go back to an older one (undo works right after an update, and the [revision history](live-editing#revision-history) goes further back).`
  },
  {
    id: "live-editing",
    title: "Live editing and saving",
    group: "Working together",
    summary: "Several people in one project, autosave, revisions and conflicts.",
    keywords: "multiplayer collaborate live share presence cursor save autosave conflict undo revision history version restore",
    body: `Everything saves as you work. A project can be opened by its owner and by staff with power-user access (see [Projects page](projects#who-sees-what)); to let anyone else play it, use a [share link](export#share-link). When more than one person opens the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **Revision history** button (the clock) in the top bar. The list on the left shows each version with its date and how long ago it was; click one to see a picture of it and a count of its artboards and variables. **Restore this version** asks **Restore version** in a dialog first. What is there now is saved in the history before the restore, so you can come back to it, and the page reloads with the restored project.

![The Revision history dialog.](help/revision-history.png)

## When two copies disagree
If the project was saved from another tab, or by someone else without live editing, a red bar says **This project was changed in another tab or by someone else since you opened it. Your edits are not saved.** **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Pick carefully: the other one is lost (the revision history may still have it).`
  },
  {
    id: "ai-agents",
    title: "AI agents (MCP)",
    group: "Working together",
    summary: "Let an AI agent join your editing session to build, change and debug alongside you.",
    keywords: "ai agent claude mcp model context protocol assistant automation llm copilot",
    body: `An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects through the **Interactives MCP server**, a small program any MCP client (Claude Code, Claude Desktop and others) can start.

## A first conversation
1. Open a project in the editor, so you can watch.
2. Add the MCP server to your agent's settings (below).
3. Ask the agent: *List my projects, then join the one called Lamp.* A person called **<name> (AI)** appears in the top bar.
4. Select a layer yourself, then ask: *Make the selected button pulse when I hover over it.* The agent reads your selection and makes the change while you watch.
5. Ask it to run **validate** when it is done, to find broken references and expressions that don't parse.

## Setting it up
The server is \`mcp/dist/interactives-mcp.mjs\` in the editor's repository. Add it to your MCP client, for example in Claude Code:

\`\`\`
claude mcp add interactives -e INTERACTIVES_URL=https://<your server>/interactives -e INTERACTIVES_AGENT_NAME=Claude -- node /path/to/interactives-editor/mcp/dist/interactives-mcp.mjs
\`\`\`

| Setting | Meaning |
|---|---|
| \`INTERACTIVES_URL\` | The editor's address (default \`http://127.0.0.1:3048/interactives\`) |
| \`INTERACTIVES_SESSION_ID\` | Your suite session id, where the server requires a signed-in session |
| \`INTERACTIVES_AGENT_NAME\` | The name people see (default Agent) |

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
- The agent can only open projects your session can open.`
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
Check that it is **Visible**; that it isn't hidden by a **Solo** group's active child; that it sits inside the artboard (**Clip content to artboard** hides what is outside); and that no mask above it is clipping it. See [Groups and frames](groups-frames).

**A field is greyed out and has a link icon.**
It is bound to an expression. Remove the binding in **Data bindings** to edit it by hand. See [Bindings](bindings).

## Text, variables and expressions
**My text shows \`{score}\` instead of the number.**
The variable needs to exist with exactly that name (it's case sensitive). Make it in the **Variables** tab. To show a real brace, write \`{{\`. See [Variables](variables).

**It says "Use letters, digits and _ only".**
Variable and data source names are used inside expressions, so they can't contain spaces or dashes. Try \`high_score\`.

**A script does nothing.**
Open **Preview** and look at the **Events** list for an error message. Scripts in the sandbox can only use \`ix\`, timers and \`console\`. See [Scripts](scripts).

## Importing and linking
**It says Link isn't available, or "Embedded in this browser".**
Linking needs the File System Access API, which is in Chrome and Edge. In other browsers files are embedded. A file *dropped* from some places can be embedded only; use the import button in the **Layers** panel to pick it instead.

**A bar asks me to Reconnect.**
Press **Reconnect**. The browser needs your permission each time you open a project before it can read a linked file again. See [Importing](import#linking-design-files-instead-of-embedding-them).

**"The file was moved, renamed or deleted."**
Put it back where it was, or press **Unlink (keep as embedded)** on the artboard.

**An Illustrator file says to save with "Create PDF Compatible File".**
Re-save it from Illustrator with that option ticked. **A DWG file** must be saved as DXF first. See [Importing](import).

## Saving and sharing
**A red bar says the project changed in another tab or by someone else.**
Another copy saved first. **Reload theirs** brings in what is saved, and **Overwrite with mine** keeps your version. Pick carefully: the other one is lost. See [Live editing and saving](live-editing).

**Undo doesn't undo someone else's change.**
Undo only undoes your own changes. Use the [revision history](live-editing#revision-history) to go back further.

**A video doesn't autoplay.**
Browsers only autoplay *muted* video. Tick **Muted**.

**Data from a web address doesn't load.**
The address must allow cross-origin requests (CORS) from where the interactive is shown. See [Data sources](data-sources).

## The editor itself
**The page zooms when I scroll.**
That's the default. Set **Mouse wheel** to **Pan (Ctrl+wheel zooms)** in [Preferences](preferences).

**A shortcut doesn't work.**
Shortcuts are ignored while a text box is focused. Click the canvas first. See [Keyboard shortcuts](shortcuts).

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
- **? links**: inspector sections have a **?** that opens their page here.`
  }
];
function topicBody(t) {
  return typeof t.body === "function" ? t.body() : t.body;
}
const BASE = (process.env.INTERACTIVES_URL ?? "http://127.0.0.1:3048/interactives").replace(/\/$/, "");
const SESSION = process.env.INTERACTIVES_SESSION_ID ?? "";
const AGENT = process.env.INTERACTIVES_AGENT_NAME ?? "Agent";
const VERSION = "0.1.0";
async function api(path, init = {}) {
  const headers = { ...init.headers };
  if (SESSION) headers["X-Session-ID"] = SESSION;
  const res = await fetch(`${BASE}/api/${path}`, { ...init, headers });
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
const sessions = /* @__PURE__ */ new Map();
function join(projectId) {
  const existing = sessions.get(projectId);
  if (existing) return existing;
  const clientId = `agent-${uid("")}`;
  const abort = new AbortController();
  const s = { projectId, clientId, peers: /* @__PURE__ */ new Map(), abort, ready: Promise.resolve() };
  s.ready = new Promise((resolve, reject) => {
    const headers = { Accept: "text/event-stream" };
    if (SESSION) headers["X-Session-ID"] = SESSION;
    fetch(`${BASE}/api/projects/${encodeURIComponent(projectId)}/live?clientId=${clientId}&agent=${encodeURIComponent(AGENT)}`, { headers, signal: abort.signal }).then(async (res) => {
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
      sessions.delete(projectId);
      reject(err);
    });
  });
  sessions.set(projectId, s);
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
function overview(p, opts) {
  const lines = [`# ${p.name} (${p.id})`, `Start artboard: ${p.settings.startArtboardId}`, ""];
  for (const ab of p.artboards) {
    if (opts.artboardId && ab.id !== opts.artboardId) continue;
    lines.push(`## Artboard ${ab.name} [${ab.id}] ${ab.width}x${ab.height}`);
    if (ab.timelines.length) lines.push(`Timelines: ${ab.timelines.map((t) => `${t.name} [${t.id}] ${t.duration}ms ${t.loop}${t.autoplay ? " autoplay" : ""} (${t.tracks.length} tracks)`).join("; ")}`);
    if (ab.blends?.length) lines.push(`Blends: ${ab.blends.map((b) => `${b.name} [${b.id}] ${b.mode} (${b.entries.length} timelines)`).join("; ")}`);
    if (ab.logic.nodes.length) lines.push(`Interactions: ${ab.logic.nodes.length} nodes, ${ab.logic.edges.length} connections (use get_interactions)`);
    const out = [];
    outline(ab.children, 0, opts.depth ?? (opts.artboardId ? 8 : 2), out, { n: opts.artboardId ? 600 : 80 });
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
    const tl = new Set(ab.timelines.map((t) => t.id));
    for (const t of ab.timelines) for (const tr of t.tracks) if (!ids.has(tr.nodeId)) problems.push(`${ab.name}: timeline "${t.name}" animates a layer that is gone (${tr.nodeId}, ${tr.prop})`);
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
        if (pd.type === "expr") {
          try {
            new Function(`return (${String(v)}
);`);
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
  for (const [i, c] of changes.entries()) {
    const where = `change ${i + 1} (${c.op})`;
    const key = typeof c.ref === "string" ? c.ref : void 0;
    switch (c.op) {
      case "set_props": {
        const loc = locate(p, ref(c.id));
        if (!loc) throw new Error(`${where}: no layer ${String(c.id)}`);
        const props = resolveRefs(c.props);
        for (const [k, v] of Object.entries(props)) {
          if (k === "id" || k === "type" || k === "children") continue;
          setPath(loc.node, k, v);
        }
        syncRuns(loc.node, props);
        touched.push(loc.node.id);
        break;
      }
      case "add_layer": {
        const ab = findAb(c.artboard_id);
        const node = createNode(c.type, resolveRefs(c.props ?? {}));
        if (isContainer(node) && Array.isArray(c.children)) node.children = [];
        syncRuns(node, resolveRefs(c.props ?? {}));
        let list = ab.children;
        if (c.parent_id) {
          const parent = locate(p, ref(c.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent ${String(c.parent_id)} is not a group or frame`);
          list = parent.node.children;
        }
        const index = typeof c.index === "number" ? Math.max(0, Math.min(list.length, c.index)) : list.length;
        list.splice(index, 0, node);
        if (key) created[key] = node.id;
        touched.push(node.id);
        break;
      }
      case "delete": {
        const id = ref(c.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const list = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        list.splice(list.indexOf(loc.node), 1);
        break;
      }
      case "move": {
        const id = ref(c.id);
        const loc = locate(p, id);
        if (!loc) throw new Error(`${where}: no layer ${id}`);
        const from = loc.parent && isContainer(loc.parent) ? loc.parent.children : loc.ab.children;
        from.splice(from.indexOf(loc.node), 1);
        let to = c.artboard_id ? findAb(c.artboard_id).children : loc.ab.children;
        if (c.parent_id) {
          const parent = locate(p, ref(c.parent_id));
          if (!parent || !isContainer(parent.node)) throw new Error(`${where}: parent is not a group or frame`);
          to = parent.node.children;
        }
        to.splice(typeof c.index === "number" ? c.index : to.length, 0, loc.node);
        touched.push(id);
        break;
      }
      case "add_artboard": {
        const right = Math.max(0, ...p.artboards.map((a) => a.canvasX + a.width));
        const ab = createArtboard({ name: String(c.name ?? "Artboard"), width: Number(c.width ?? 800), height: Number(c.height ?? 600), canvasX: right + 100, canvasY: 0 });
        p.artboards.push(ab);
        if (key) created[key] = ab.id;
        break;
      }
      case "set_artboard": {
        const ab = findAb(c.id);
        for (const [k, v] of Object.entries(resolveRefs(c.props ?? {}))) if (!["id", "children", "timelines", "logic"].includes(k)) ab[k] = v;
        break;
      }
      case "add_variable": {
        const v = { id: uid("v"), name: String(c.name), type: c.type ?? "number", initial: c.initial ?? 0 };
        if (Array.isArray(c.options)) v.options = c.options.map(String);
        if (c.shared) v.shared = true;
        if (p.variables.some((x) => x.name === v.name)) throw new Error(`${where}: a variable called ${v.name} already exists`);
        p.variables.push(v);
        if (key) created[key] = v.id;
        break;
      }
      case "set_variable": {
        const v = p.variables.find((x) => x.id === ref(c.id) || x.name === c.id);
        if (!v) throw new Error(`${where}: no variable ${String(c.id)}`);
        Object.assign(v, resolveRefs(c.props ?? {}), { id: v.id });
        break;
      }
      case "add_timeline": {
        const ab = findAb(c.artboard_id);
        const tl = {
          id: uid("tl"),
          name: String(c.name ?? `Timeline ${ab.timelines.length + 1}`),
          duration: Number(c.duration ?? 1e3),
          loop: c.loop ?? "once",
          autoplay: !!c.autoplay,
          speed: 1,
          tracks: (c.tracks ?? []).map((tr) => ({
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
        const ab = findAb(c.artboard_id);
        const localIds = {};
        const nodes = c.nodes ?? [];
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
        for (const e of c.edges ?? []) {
          const from = localIds[e.from] ?? ref(e.from);
          const to = localIds[e.to] ?? ref(e.to);
          ab.logic.edges.push({ id: uid("e"), from, fromPort: e.from_port ?? "out", to, toPort: "in" });
        }
        break;
      }
      case "remove_interactions": {
        const ab = findAb(c.artboard_id);
        const ids = new Set((c.ids ?? []).map(ref));
        ab.logic.nodes = ab.logic.nodes.filter((n) => !ids.has(n.id));
        ab.logic.edges = ab.logic.edges.filter((e) => !ids.has(e.id) && !ids.has(e.from) && !ids.has(e.to));
        break;
      }
      case "add_script": {
        const sc = { id: uid("s"), name: String(c.name ?? "Script"), code: String(c.code ?? ""), runOnStart: !!c.run_on_start };
        p.scripts.push(sc);
        if (key) created[key] = sc.id;
        break;
      }
      case "set_script": {
        const sc = p.scripts.find((x) => x.id === ref(c.id) || x.name === c.id);
        if (!sc) throw new Error(`${where}: no script ${String(c.id)}`);
        if (typeof c.code === "string") sc.code = c.code;
        if (typeof c.name === "string") sc.name = c.name;
        if (typeof c.run_on_start === "boolean") sc.runOnStart = c.run_on_start;
        break;
      }
      default:
        throw new Error(`${where}: unknown op "${c.op}"`);
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
    const types = ["rect", "ellipse", "polygon", "star", "path", "text", "image", "group", "frame", "button", "input", "link", "embed", "video", "instance", "draw"];
    return 'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, link {url, target}, shadow, blur, ariaLabel, className, bindings {prop: expression}, converters {prop: [{type: format|round|invert|range|map|toNumber|toText|toBoolean|expr, ...}]} (applied to the binding value in order), layoutItem, constraints.\nText layers can hold rich text: runs: [{text, fontFamily?, fontSize?, fontWeight?, italic?, color?, underline?, strike?, letterSpacing?, link?: {url, target}}]; each run lists only how it differs from the layer\'s own text style. `text` always equals the runs joined (it is rewritten for you when you set runs); setting `text` alone replaces the runs with that plain text, so set `runs` to restyle part of a text.\nText layers can animate per letter/word/line with modifiers: [{unit: letter|word|line, start, end, offset (percent of the text; offset -100..100 slides the range), shape: square|ramp-up|ramp-down|triangle|round|smooth, ease?, randomize?, seed?, strength (0-100), x, y (px), rotation (deg), scale (factor), opacity (factor 0-1), color? (mix to), letterSpacing (px), blur (px)}]. Units inside the range get that fraction of each change. Animate them with timeline tracks on `modifiers.<index>.offset` (also start, end, strength, x, y, rotation, scale, opacity, color, letterSpacing, blur); a typewriter is a letter modifier with start 0, end 100, opacity 0 and an offset track from 0 to 100.\nScript layers (type "draw", shown as "Script layer"): a box painted by a script every frame, for generative art, particles, charts and custom visualisations. Fields: code (the script), fps (0 = every frame, else a cap), pixelRatio ("auto" or a number), runInEditor (paint on the editor canvas, one still frame). The code defines function draw(g, t, dt) and optionally function setup(g); g records drawing commands, it is not a canvas. The script runs in the sandbox (projects with settings.scriptSandbox, the default; without the sandbox bundle the layer shows nothing). Errors stop that layer only. Starter scripts to adapt (set as `code`): ' + DRAW_TEMPLATES.map((t2) => `"${t2.name}"`).join(", ") + ". The g API:\n" + DRAW_API.map(([sig, what]) => `  ${sig}: ${what}`).join("\n") + `
Example: {"type":"draw","name":"Pulse","width":320,"height":200,"code":"function draw(g, t) {\\n  g.clear('#10131a');\\n  g.fill('#6f8cff');\\n  g.circle(g.width / 2, g.height / 2, 24 + Math.sin(t * 2) * 8);\\n}"}.
Paths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer's own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}]} | {type:"radial", stops} | {type:"image", assetId, fit}. Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?}.

Defaults per type (what add_layer fills in):
` + types.map((t2) => `- ${t2}: ${JSON.stringify(Object.fromEntries(Object.entries(createNode(t2)).filter(([k]) => !["id", "name", "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY", "opacity", "visible"].includes(k))))}`).join("\n");
  }
  const t = TOPICS.find((x) => x.id === topic);
  if (t) return `# ${t.title}
${t.summary}

${topicBody(t)}`;
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
      return `Joined "${p.name}" as ${AGENT} (AI).

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
      const s = sessions.get(String(a.project_id));
      s?.abort.abort();
      sessions.delete(String(a.project_id));
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
async function handle(msg) {
  const reply = (result) => msg.id !== void 0 && send({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => msg.id !== void 0 && send({ jsonrpc: "2.0", id: msg.id, error: { code, message } });
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
      const tool = TOOLS.find((t) => t.name === msg.params?.name);
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
  for (const s of sessions.values()) s.abort.abort();
  process.exit(0);
});
