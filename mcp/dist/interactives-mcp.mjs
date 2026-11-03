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
    description: "Set, add to or toggle a variable.",
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
          { value: "toggle", label: "Toggle (boolean)" }
        ],
        default: "set"
      },
      { key: "value", label: "Value", type: "expr", default: "0", showIf: { key: "op", values: ["set", "add"] }, help: 'Expression, e.g. 1, "hi", score * 2' }
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
  { prop: "fill.color", label: "Fill colour", kind: "color" },
  { prop: "stroke.width", label: "Stroke width", kind: "number" },
  { prop: "stroke.paint.color", label: "Stroke colour", kind: "color" },
  { prop: "color", label: "Text colour", kind: "color" },
  { prop: "fontSize", label: "Font size", kind: "number" },
  { prop: "letterSpacing", label: "Letter spacing", kind: "number" },
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
  { prop: "src", label: "Embed/video URL", kind: "string" },
  { prop: "stroke.trimStart", label: "Trim start %", kind: "number" },
  { prop: "stroke.trimEnd", label: "Trim end %", kind: "number" },
  { prop: "stroke.trimOffset", label: "Trim offset %", kind: "number" },
  { prop: "solo.active", label: "Solo: active child", kind: "string" },
  { prop: "drawOrder", label: "Draw order (children)", kind: "list" },
  { prop: "constraints.0.distance", label: "Follow path distance", kind: "number" },
  { prop: "constraints.0.strength", label: "Constraint strength", kind: "number" }
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
  instance: "Instance"
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
  instance: () => ({ artboardId: "", fit: "fill" })
};
function createNode(type, partial = {}) {
  return { ...base(type), ...FACTORIES[type](), ...partial, type };
}
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
const TOPICS = [
  // ---------------------------------------------------------------- getting started
  {
    id: "welcome",
    title: "Welcome to Interactives",
    group: "Getting started",
    summary: "What Interactives is and how a project fits together.",
    keywords: "intro overview start tutorial",
    body: `Interactives builds 2D interactive pieces for the web: animated diagrams, explainers, quizzes, small games and UI prototypes. You draw on artboards, animate with timelines, wire up behaviour with an interaction graph, and publish a single HTML file or a package that the player runs anywhere.

## How a project fits together

- **Artboards** are the screens. Each has its own layers, timelines and interactions. See [Artboards](artboards).
- **Layers** are shapes, text, images, groups, frames and real web elements (buttons, inputs, links, embeds, video).
- **Timelines** animate layer properties through keyframes. See [Timelines and keyframes](timelines).
- **Interactions** are a node graph: an event (a click, a key, a timer, a variable change) runs actions (play a timeline, set a variable, go to another artboard). See [Interactions](interactions).
- **Variables** and **data sources** hold values that text, bindings and lists read. See [Variables](variables) and [Data sources](data-sources).
- **Scripts** are JavaScript for anything the nodes can't do. See [Scripts](scripts).

## A first project in five minutes

1. On the projects page choose **New project**.
2. Pick the **Rectangle** tool (<kbd>R</kbd>) and drag on the artboard.
3. Open the **Timeline** tab at the bottom, press **Record**, move the playhead to 1s and drag the rectangle somewhere else. A keyframe appears.
4. Open **Interactions**, add **On pointer** (target: the rectangle, click) and connect it to **Play timeline**.
5. Press **Preview**. Click the rectangle and it moves.
6. **Export → Single HTML file** gives you one file to upload anywhere.

> Everything saves automatically. The label next to the project name says Saved, Saving… or Unsaved.`
  },
  {
    id: "projects",
    title: "Projects page",
    group: "Getting started",
    summary: "Create, open, duplicate, import and delete projects, and organise them with folders and tags.",
    keywords: "home new import duplicate delete package ixp god mode power user folder folders tag tags search sort organise organize filter",
    body: `The projects page lists the projects you own, newest first.

- **New project** makes an empty project with one artboard.
- **Import** opens a \`${PACKAGE_EXTENSION}\` package (a whole project with its assets), a project JSON file, a Lottie file, a Rive \`.riv\` file, a Photoshop \`.psd\` file, an Illustrator \`.ai\` file or a PDF. Lottie, Rive, Photoshop, Illustrator and PDF files become a new project.
- Each card can be opened, **duplicated**, **downloaded** as a package or **deleted**. Deleting can't be undone, so download a package first if you might want it back.
- Use the **Help** link at the top for these pages, or press <kbd>F1</kbd> anywhere.

## Folders

Folders keep a long list tidy. A project is in one folder at most, and folders are one level deep.

- The list on the left shows **All projects**, **No folder** and each folder with its project count. Click one to show only those projects.
- Use the folder menu at the bottom of a card to **move the project to a folder**. Choose **New folder...** to start a new one; a folder exists as long as at least one project is in it.
- With a folder selected, the pencil **renames** it and the bin **deletes** it. Deleting a folder never deletes projects: they just go back to *No folder*.

## Tags

Tags are short free-text labels, up to 20 per project and 40 characters each.

- Click **+ tag** on a card, type a tag and press <kbd>Enter</kbd>. Tags you've used before are suggested. Click the **x** on a tag to remove it.
- The tag row at the top lists every tag in use. Click one to show only projects with that tag, and click it again to clear it.
- The **search** box matches project names and tags. **Sort** orders the cards by last updated or by name (the choice is remembered in this browser).

Folders and tags belong to the project record on the server, not to the project file, so they don't appear in exports, package files or the revision history.

## Who sees what

You see only your own projects. Staff with power-user access can toggle the power-user view (the suite's shared shortcut) to see and open every project; the server checks that access again. In that view you can also file and tag other people's projects.`
  },
  {
    id: "interface",
    title: "The editor at a glance",
    group: "Getting started",
    summary: "Tools, layers, canvas, inspector and the bottom panels.",
    keywords: "layout panels toolbar inspector layers dock ui",
    body: `## Top bar
The project name (click to rename), save state, **Live** indicator, people currently in the project, undo/redo, zoom, **Preview**, **Export**, **Preferences** and **Help**.

## Tool bar (left edge)
Drawing tools, then the web-element tools, then **Help** at the bottom. Hover a tool to see its name and shortcut. See [Shapes and paths](shapes) and [Web elements](web-elements).

## Left panel
- **Layers**: the layer tree of the open artboard. Drag to reorder or nest, click the eye to hide and the lock to lock. Double-click to rename.
- **Assets**: images, video, audio, fonts and data files in the project.
- **Artboards**: every artboard; click one to open it.

## Canvas
All artboards side by side. See [Moving around the canvas](canvas). Right-click a layer for cut, copy, order, group, hide, lock and *Add interaction*; right-click an artboard to add a new layer where you clicked, or to duplicate, delete or zoom to it; right-click empty canvas for a new artboard there.

## Inspector (right)
Settings for the selection. With nothing selected it shows the artboard and the project settings. Section titles with a **?** link to the page in these docs.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables**, **Data** and **Usage**. Click a tab to open it, click it again to close it, and drag the top edge to resize.

## Preview
**Preview** runs the project exactly as the exported file will, from the start artboard or the one you're on. **Restart** starts again. The **Debug** panel (on by default) shows:

- **Now showing**: the artboard on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables**: every value as it changes. Type a new value (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too.`
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

## Big projects
Artboards you aren't working on are shown as a picture of themselves, which keeps panning and zooming smooth in projects with many artboards. Click an artboard (or a layer in it) and it comes alive for editing; the picture updates by itself shortly after anything in it changes.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.`
  },
  {
    id: "preferences",
    title: "Preferences",
    group: "Getting started",
    summary: "Your own editor settings: wheel, theme, default font, rulers, tooltips.",
    keywords: "settings options wheel tooltips",
    body: `Open **Preferences** from the gear in the top bar (or on the projects page). They are yours: saved with your account, so they follow you to any browser.

- **Mouse wheel**: *Zoom* (the wheel zooms, Shift+wheel pans) or *Pan* (the wheel pans, Ctrl+wheel zooms). See [Moving around the canvas](canvas).
- **Theme**: dark, light, or auto (follows your system).
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. Open Sans unless you change it; any Google font name works.
- **Show rulers**: rulers and guides on the canvas (also <kbd>Shift</kbd>+<kbd>R</kbd>).
- **Show tooltips**: explanations when you hover buttons and fields.

Project-wide settings (start artboard, fit, sandbox) are in the inspector with nothing selected. See [Project settings](project-settings).`
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
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> | Search the help |
| <kbd>?</kbd> | Open the help |

While dragging: <kbd>Shift</kbd> keeps proportions or snaps angles, <kbd>Alt</kbd> resizes from the centre. In number fields, drag the label to scrub (<kbd>Shift</kbd> ×10, <kbd>Alt</kbd> ×0.1), use arrow keys to step, or type sums like \`100/2\`.`
  },
  // ---------------------------------------------------------------- design
  {
    id: "artboards",
    title: "Artboards",
    group: "Design",
    summary: "Screens with their own size, background, timelines and interactions.",
    keywords: "screen page scene size background start",
    body: `An artboard is one screen of the interactive. Each has a size, a background, its layers, its timelines and its interactions. Variables, scripts, data and assets belong to the whole project and are shared.

- Draw a new one with the **Artboard** tool (<kbd>A</kbd>) or add one from the Artboards list.
- Click an artboard's name on the canvas to select it; the inspector then shows its size, background and **Clip content to artboard**.
- Drag layers and let go over another artboard and you're asked whether to move them there. They keep their place on the canvas; their keys in the old artboard's timelines are removed, and interactions there that used them need fixing (the **Usage** tab lists broken references).
- The **start artboard** is the one the player shows first (Project settings).
- Move between artboards at runtime with the **Go to artboard** action (with a transition) or \`ix.goTo('Name', 'fade')\`.
- An artboard can also be placed inside another as an [instance](instances), like a reusable component.`
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
Select a path and press <kbd>Enter</kbd> (or double-click). Drag points and handles, click a point and press <kbd>Delete</kbd> to remove it. <kbd>Escape</kbd> or <kbd>Enter</kbd> finishes.

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
Solid colour, **linear** or **radial** gradient (add and move stops, set the angle) or an **image** fill (cover, contain or stretch). Colours accept hex, \`rgb()\`, \`hsl()\` and names; the number box beside a colour is its opacity.

## Stroke
Colour, width, **cap** (butt, round, square), **join** (miter, round, bevel) and **dash** (e.g. \`8 4\` for 8 on, 4 off).

### Trim path
**Trim start**, **Trim end** and **Trim offset** (all 0–100%) draw only part of a stroke. Animate *Trim end* from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
Use **+** in the Effects section to add a shadow or a layer blur; each one has a **×** to remove it. Fill and Stroke have the same **×** and **+** in their headers.

- **Opacity** of the whole layer.
- **Shadow**: x, y, blur, spread and colour.
- **Layer blur**: blurs the layer.
- **Blend**: how the layer mixes with what is under it (multiply, screen, overlay, …).

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
- **Font**: any Google font by name, or a font file you upload in the **Fonts** section of Project settings.
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
Anything in braces is an [expression](expressions): \`Score: {score}\`, \`{name.toUpperCase()}\`, \`{items.length} items\`. Write \`{{\` for a literal brace.`
  },
  {
    id: "images-media",
    title: "Images, video, audio and assets",
    group: "Design",
    summary: "Adding files, the Assets panel, and 9-slice scaling for images.",
    keywords: "image picture photo svg video audio sound mp3 upload drop paste asset nine slice 9-slice n-slice",
    body: `Drop files on the canvas, paste them, or use the **Image** tool. SVG files become editable vector layers; other images become image layers. Video files become video layers; audio files are stored as assets for the **Play sound** action.

The **Assets** panel lists every file in the project. Switch between **Thumbnails** (drag the slider to change their size) and **Details** (a list with the type, size and whether anything uses it). Click an asset, or its checkbox, to check it; Shift+click checks a range, and the box at the top checks or unchecks them all. **Delete** removes the checked assets after asking. Deleting an asset that layers still use leaves those layers empty.

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

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.`
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
Select two or more shapes and choose **Union**, **Subtract**, **Intersect** or **Exclude** in the inspector. The result is a single path; the originals are replaced.`
  },
  {
    id: "instances",
    title: "Instances (components)",
    group: "Design",
    summary: "Place one artboard inside another, with its own timelines, interactions and inputs.",
    keywords: "component nested artboard reuse symbol instance inputs",
    body: `Any artboard can be placed inside another as an **instance**: a live copy that runs its own timelines and interactions on the parent's clock. Edit the source artboard and every instance updates.

- Select a layer and use **Place as instance** in the inspector, or choose an artboard in an instance layer's **Artboard** field.
- **Fit** decides how the artboard sits in the instance's box (fill, contain, cover, none).
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source.
- Messages sent inside an instance (**Send message**, \`ix.emit\`) bubble up to the parent.

Instances can be nested up to six deep. An artboard that contains itself stops at that limit.`
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
- Press **Record** (the red dot). While recording, every change you make to an animatable property at the playhead becomes a keyframe.
- Or click the diamond next to a field in the inspector to key its current value.
- Drag keys to retime them, <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove.

## Timeline settings
| Setting | Meaning |
|---|---|
| Duration | Length in milliseconds |
| Loop | Once, loop, or ping-pong |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast, negative plays backwards) |

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). In the Tween panel, drag the two handles on the graph to make your own curve; the dashed lines mark the start (0) and end (1) values, and the graph grows to show overshoot. Select a key to change its time or value.

## Markers
A **marker** is a named point in time. Press **+ Marker** to add one at the playhead; it shows as a flag on the ruler. Drag it to move it, or select it to rename it, set its time or delete it. An **On timeline marker** node runs its flow whenever playback passes the marker: going forwards or in reverse, and on every lap of a loop or ping-pong. Leave *Marker name* empty to react to every marker on the timeline; \`event.marker\` and \`event.time\` say which one fired. Scrubbing and seeking do not fire markers, only playing.

## Design view
Switching artboards opens them in **design view**: the canvas shows the layers as they are, not a frame of an animation. Choose a timeline in the Timeline tab to see and edit its frames; choose *Design view* again to go back.

## Switching children and draw order
Two properties are not numbers. **Solo: active child** on a [solo group](groups-frames) switches which child shows, and **Draw order (children)** changes which child is in front. Both step at their keys instead of blending. Key them from the group's Solo and Draw order sections in the inspector.

## Playing from interactions
**Play timeline** plays, pauses, stops, restarts, reverses or seeks a timeline. From scripts: \`ix.timeline('Intro').play()\`. **On timeline end** fires when one finishes, and **On timeline marker** fires at each [marker](timelines).`
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

The same names work in **Animate property** nodes and in \`node.animate(prop, value, { ease: 'easeOut' })\`.`
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

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected (the inspector shows the artboard's settings).
2. Open the **Blends** section and click **Build an example to try**. You get a ball, two timelines (*Example: small and red* and *Example: big and blue*), a variable called *mix*, a slider bound to it, and a blend that starts with the artboard.
3. Click **Preview** and drag the slider. At 0 the ball is small and red, at 1 it is big and blue, and in between it is a mix of the two.
4. Open either example timeline to see that each one is just a pose: the same values at the start and the end.

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
- **Actions** (blue) do something and continue: play a timeline, set a variable, set or animate a property, show or hide, go to another artboard, open a URL, play a sound, run a script, send a message, wait.
- **Logic** (purple) chooses where to go: *If*, *Switch*, *Once*, *Sequence*.

Drag from an output port to the next node's input to connect them. Actions that take time (**Control timeline**, **Animate property**, **Play sound**) have a **Continue** setting: the next node runs when it finishes, part-way through (a percentage), or straight away. Let go on empty space instead and a menu offers only the nodes that fit (actions and logic when you drag from an output, anything with an output when you drag backwards from an input); the one you pick is added where you let go and connected for you. Press <kbd>Escape</kbd> or click away to cancel. Click a node in the palette on the left (or drag it onto the graph) to add it; select a node to edit its settings on the right. Every node is listed in [Interaction node reference](interaction-nodes).

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

Choice variables show as a dropdown wherever you set them, so you can't type a value that isn't on the list.

## Using variables
- In text: \`Score: {score}\`.
- In [bindings](bindings): drive any property from a variable.
- In interactions: **Set variable** (set, add, toggle), **On variable change**.
- On inputs: bind a text field, checkbox or slider to a variable.
- In scripts: \`ix.vars.score += 1\`.
- From the host page: \`player.setVariable('score', 10)\`.

Variable names must be letters, digits and \`_\` so expressions can use them.`
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

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).`
  },
  {
    id: "bindings",
    title: "Bindings",
    group: "Interactivity",
    summary: "Drive a layer property from a variable, data or expression, live.",
    keywords: "bind binding data binding property drive reactive",
    body: `A binding sets a layer's property from an [expression](expressions), and keeps it up to date as variables and data change. In the **Data bindings** section of the inspector, pick a property and type the expression.

Examples:

| Property | Expression |
|---|---|
| Width | \`progress * 300\` |
| Fill colour | \`correct ? "#2e7d32" : "#c62828"\` |
| Visible | \`step === 3\` |
| Text | \`products[0].name\` |
| Rotation | \`speed * 3\` |

A bound property shows a link icon and can't be changed by hand or keyframed until you remove the binding. Every animatable property can be bound; see [Animatable properties](animatable-properties).`
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

## The sandbox
New projects run scripts in a sandbox: a separate JavaScript engine compiled to WebAssembly. Scripts there can only use \`ix\`, timers and \`console\`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped. Turn **Run scripts in the sandbox** off in Project settings only for code you trust that needs the page (\`node.element\`, \`fetch\`).`
  },
  {
    id: "usage",
    title: "Usage: what uses what",
    group: "Design",
    summary: "Find where an asset, variable, artboard, script, timeline or data source is used, and clear out what is not.",
    keywords: "usage dependencies dependency graph unused references used by find remove cleanup orphan broken missing",
    body: `The **Usage** tab (bottom panel) answers "what is this used by?" for the whole project, and shows what nothing uses.

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
    body: `Turn on **Repeat** on a group or frame and its **first child** is copied once per item in **Items** (an expression that gives a list, like \`products\` or \`[1, 2, 3]\`).

Inside the copies, \`item\` is the current item and \`index\` its position (from 0): \`{index + 1}. {item.name} - {item.price}\`.

**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best).

Clicks on a copy fire **On pointer** for the template layer with \`event.index\`, so \`products[event.index]\` is the item that was clicked.`
  },
  {
    id: "project-settings",
    title: "Project settings",
    group: "Data",
    summary: "Start artboard, fit, page title, fonts, sandbox and reduced motion.",
    keywords: "settings start artboard fit scale page title background fonts sandbox reduced motion",
    body: `Click an empty part of the canvas to see Project settings in the inspector.

| Setting | Meaning |
|---|---|
| Start artboard | Shown first in the player |
| Fit | How the artboard scales to the space it's given: contain, cover, fill, fit width, or none |
| Page title / Page bg | Title and background of the exported HTML page |
| Fonts | Google fonts by name, or uploaded font files |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |`
  },
  // ---------------------------------------------------------------- import/export
  {
    id: "import",
    title: "Importing Lottie, Rive, Photoshop, Illustrator, PDF and SVG",
    group: "Import and export",
    summary: "Bring in Lottie JSON / dotLottie, Rive .riv files, Photoshop .psd files, Illustrator .ai files, PDFs, SVG and project packages.",
    keywords: "import lottie dotlottie rive riv svg after effects bodymovin convert photoshop psd layers illustrator ai pdf artboards vector",
    body: `Lottie, Rive, Photoshop, Illustrator and PDF files: use **Import** in the Layers panel (adds artboards to this project) or on the projects page (makes a new project). A \`.psd\`, \`.ai\` or \`.pdf\` file dropped on the canvas also becomes new artboards.

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients, transforms, trim paths, masks and keyframes with easing become layers and a timeline. Expressions, effects and text animators are not carried over.

## Rive (.riv)
Each Rive artboard becomes an artboard: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Shape morphing (animated path points), holes, clipping shapes and translation constraints are carried over; bones, meshes and data binding are not yet.

Rive **events** become messages: a *Send message* node with the event's name, and its custom properties as the payload (an object, e.g. \`event.payload.power\`). An event keyed on an animation becomes a [timeline marker](timelines) with an *On timeline marker* node; events fired by listeners and by states or transitions (at their start or end) become *Send message* nodes in those flows, and Rive event listeners become *On message* nodes. An **audio event** also plays its embedded sound (a *Play sound* node, with the audio stored as a project asset), and an **open URL event** also opens its link (an *Open URL* node). Audio that is hosted on Rive's CDN instead of embedded is skipped, and the import report says so.

## Photoshop (.psd)
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

## SVG
Drop an SVG file on the canvas, paste it, or pick it with the **Image** tool. It becomes a group of editable vector layers: shapes and paths (with their transforms applied), groups, solid and gradient fills, strokes and dashes, and simple text. Masks, filters, patterns and embedded images are listed as not carried over.

After an import, a report lists anything that couldn't be carried over exactly.`
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
| Lottie JSON / dotLottie | The open artboard's shapes and timeline, for Lottie players (no interactivity) |
| PNG image | The open artboard as a picture, at 2× or 1×, at the timeline's playhead |
| SVG image | The open artboard as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |

## Share link
**Export → Share link** publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it); links are long and random so they can't be guessed. It is a snapshot: press **Update to the latest version** to publish later changes, or **Turn off link** to stop it working.`
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
    id: "live-editing",
    title: "Live editing and saving",
    group: "Working together",
    summary: "Several people in one project, autosave, revisions and conflicts.",
    keywords: "multiplayer collaborate live share presence cursor save autosave conflict undo revision history version restore",
    body: `Everything saves as you work. When others open the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **history** button (the clock) in the top bar to see them, preview one, and **Restore** it. Restoring is itself saved as a new revision, so it can be undone.`
  },
  {
    id: "ai-agents",
    title: "AI agents (MCP)",
    group: "Working together",
    summary: "Let an AI agent join your editing session to build, change and debug alongside you.",
    keywords: "ai agent claude mcp model context protocol assistant automation llm copilot",
    body: `An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects through the **Interactives MCP server**, a small program any MCP client (Claude Code, Claude Desktop and others) can start.

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
    id: "help",
    title: "Using this help",
    group: "Reference",
    summary: "Search, tooltips and help links.",
    keywords: "help docs search tooltip question",
    body: `- **Search**: press <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere for quick search. Type a few words and press <kbd>Enter</kbd> to open the best match.
- **Help button**: the **?** at the bottom of the tool bar, the **Help** link on the projects page, or <kbd>?</kbd>.
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
    const types = ["rect", "ellipse", "polygon", "star", "path", "text", "image", "group", "frame", "button", "input", "link", "embed", "video", "instance"];
    return 'Every layer has: id, type, name, x, y (top-left in the parent), width, height, rotation (deg), scaleX, scaleY, originX/originY (0-1), opacity, visible, locked, blendMode, cursor, link {url, target}, shadow, blur, ariaLabel, className, bindings {prop: expression}, layoutItem, constraints.\nText layers can hold rich text: runs: [{text, fontFamily?, fontSize?, fontWeight?, italic?, color?, underline?, strike?, letterSpacing?, link?: {url, target}}]; each run lists only how it differs from the layer\'s own text style. `text` always equals the runs joined (it is rewritten for you when you set runs); setting `text` alone replaces the runs with that plain text, so set `runs` to restyle part of a text.\nPaths: paths: [{closed, points: [{x, y, in?: {x,y}, out?: {x,y}}]}] in the layer\'s own box. Paint: {type:"solid", color} | {type:"linear", angle, stops:[{offset, color}]} | {type:"radial", stops} | {type:"image", assetId, fit}. Stroke: {paint, width, dash?, trimStart?, trimEnd?, trimOffset?}.\n\nDefaults per type (what add_layer fills in):\n' + types.map((t2) => `- ${t2}: ${JSON.stringify(Object.fromEntries(Object.entries(createNode(t2)).filter(([k]) => !["id", "name", "x", "y", "rotation", "scaleX", "scaleY", "originX", "originY", "opacity", "visible"].includes(k))))}`).join("\n");
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
    description: 'Change the project. Changes apply in order as one batch and reach everyone in the live session immediately (the server keeps revision history, so a person can roll back). Each change is {op, ...}: set_props {id, props: {path: value}} (paths like "fill.color", "stroke.width", "bindings.width"); add_layer {artboard_id, type, props?, parent_id?, index?, ref?}; delete {id}; move {id, parent_id?, artboard_id?, index?}; add_artboard {name, width, height, ref?}; set_artboard {id, props}; add_variable {name, type: number|string|boolean|color|enum, initial, options?, shared?, ref?}; set_variable {id or name, props}; add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, keys: [{t, value, ease}]}], ref?}; add_interactions {artboard_id, nodes: [{ref, kind, params, note?}], edges: [{from, to, from_port?}]} (from/to are refs or ids); remove_interactions {artboard_id, ids}; add_script {name, code, run_on_start, ref?}; set_script {id or name, code?, name?, run_on_start?}. Give "ref" to name something you create, then use "$ref" in later changes in the same batch. Read read_reference("layers"), ("interactions") and ("properties") first.',
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
