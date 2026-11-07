/*! built from the player's media sources 48bccdc9ac0c4a016d4a */
const MEDIA_SOURCE = "interactives-media";
const MEDIA_TARGET = "interactives";
const MEDIA_VERSION = 2;
const MEDIA_MIN_VERSION = 1;
const LISTEN_SINCE = 2;
const MEDIA_OPS = ["hello", "start", "stop", "take", "discard", "download", "preview", "snapshot", "pick", "save", "optout", "listen"];
const BAND_COUNT = 8;
const LISTEN_PER_SECOND = 25;
const BAND_EDGES = Array.from({ length: BAND_COUNT + 1 }, (_, i) => Math.round(80 * Math.pow(8e3 / 80, i / BAND_COUNT)));
const MAX_SLOTS = 8;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;
const MAX_RECORDING_BYTES = 60 * 1024 * 1024;
const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const IMAGE_EDGE = 1600;
const IMAGE_EDGE_MIN = 64;
const IMAGE_EDGE_MAX = 4096;
const SLOT = /^[A-Za-z0-9][\w .-]{0,39}$/;
const DEFAULT_SLOT = "recording";
function cleanSlot(v) {
  return typeof v === "string" && SLOT.test(v.trim()) ? v.trim() : DEFAULT_SLOT;
}
const finite = (n) => typeof n === "number" && Number.isFinite(n);
function cleanFileName(name, fallback, ext) {
  let n = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").replace(/^[.\s]+/, "") : "";
  n = n.replace(/\.[A-Za-z0-9]{1,5}$/, "").slice(0, 80).trim();
  return `${n || fallback}.${ext}`;
}
const SAVE_TYPES = { "text/plain": "txt", "text/csv": "csv", "application/json": "json", "text/markdown": "md" };
function cleanSave(raw) {
  const mime = typeof raw.mime === "string" && SAVE_TYPES[raw.mime] ? raw.mime : "text/plain";
  const text = typeof raw.text === "string" ? raw.text : "";
  if (!text || text.length > MAX_SAVE_BYTES) return null;
  return { name: cleanFileName(raw.name, "report", SAVE_TYPES[mime]), mime, text };
}
function cleanRect(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const num = (n, lo, hi) => finite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : lo;
  return { x: num(r.x, -1e4, 1e4), y: num(r.y, -1e4, 1e4), w: num(r.w, 0, 1e4), h: num(r.h, 0, 1e4) };
}
function cleanEdge(v) {
  return finite(v) ? Math.max(IMAGE_EDGE_MIN, Math.min(IMAGE_EDGE_MAX, Math.round(v))) : IMAGE_EDGE;
}
function cleanRequest(raw, nonce) {
  if (!raw || typeof raw !== "object") return null;
  const m = raw;
  if (m.source !== MEDIA_SOURCE || typeof m.v !== "number" || m.v < MEDIA_MIN_VERSION || m.v > MEDIA_VERSION) return null;
  if (typeof m.nonce !== "string" || !nonce || m.nonce !== nonce) return null;
  if (typeof m.rid !== "string" || m.rid.length === 0 || m.rid.length > 64) return null;
  if (typeof m.op !== "string" || !MEDIA_OPS.includes(m.op)) return null;
  if (m.op === "listen" && m.v < LISTEN_SINCE) return null;
  return { rid: m.rid, op: m.op, args: m };
}
function cleanStart(a) {
  return { slot: cleanSlot(a.slot), video: a.video === true, audio: a.audio !== false, ...finite(a.maxSeconds) ? { maxSeconds: a.maxSeconds } : {} };
}
function cleanPreview(a) {
  return { on: a.on === true, rect: cleanRect(a.rect), mirror: a.mirror !== false, facing: a.facing === "environment" ? "environment" : "user", ...typeof a.play === "string" ? { play: cleanSlot(a.play) } : {} };
}
function cleanListen(a) {
  return { on: a.on === true };
}
function cleanPick(a) {
  return { capture: a.capture === "user" || a.capture === "environment" ? a.capture : "", maxEdge: cleanEdge(a.maxEdge) };
}
function browserEnv(win = window) {
  const nav = win.navigator;
  const md = nav.mediaDevices;
  const doc = win.document;
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  return {
    getUserMedia: md?.getUserMedia ? (c) => md.getUserMedia(c) : void 0,
    enumerateDevices: md?.enumerateDevices ? () => md.enumerateDevices() : void 0,
    queryPermission: nav.permissions?.query ? async (name) => {
      const r = await nav.permissions.query({ name });
      return r.state;
    } : void 0,
    Recorder: win.MediaRecorder,
    AudioContext: win.AudioContext ?? win.webkitAudioContext,
    policyAllows: policy ? (f) => policy.allowsFeature(f) : void 0,
    secure: win.isSecureContext,
    now: () => Date.now()
  };
}
const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const VIDEO_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4", "video/webm"];
function problemFromError(err, policy) {
  const name = err?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return policy === false ? "blocked" : "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no-device";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  if (name === "TypeError") return "unsupported";
  return "failed";
}
const LISTEN_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
function bandsFromSpectrum(data, sampleRate, fftSize) {
  const hz = sampleRate / fftSize;
  const out = new Array(BAND_COUNT).fill(0);
  for (let b = 0; b < BAND_COUNT; b++) {
    const lo = Math.max(1, Math.floor(BAND_EDGES[b] / hz));
    const hi = Math.min(data.length - 1, Math.max(lo, Math.ceil(BAND_EDGES[b + 1] / hz) - 1));
    let top = 0;
    for (let i = lo; i <= hi; i++) if (data[i] > top) top = data[i];
    out[b] = Math.round(top / 255 * 100) / 100;
  }
  return out;
}
function levelFromSamples(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.min(1, Math.sqrt(sum / Math.max(1, buf.length)) * 4);
}
class MediaEngine {
  constructor(env, events = {}) {
    this.env = env;
    this.events = events;
    this.capture = null;
    this.listen_ = null;
    this.camera = null;
    this.cameraWanted = false;
    this.recs = /* @__PURE__ */ new Map();
    this.now = env.now ?? (() => Date.now());
  }
  /** Whether this browser can do it at all, as a problem, or null. */
  unsupported(what) {
    if (this.env.secure === false) return "insecure";
    if (!this.env.getUserMedia) return "unsupported";
    if (this.env.policyAllows?.(what) === false) return "blocked";
    return null;
  }
  /** The device check: can this be used, and if not, why. Opens nothing. */
  async check(what) {
    const no = this.unsupported(what);
    if (no) return { state: "unavailable", problem: no };
    if (what === "microphone" && !this.env.Recorder) return { state: "unavailable", problem: "unsupported" };
    try {
      const p = await this.env.queryPermission?.(what);
      if (p === "denied") return { state: "denied", problem: "denied" };
    } catch {
    }
    try {
      const list2 = await this.env.enumerateDevices?.() ?? [];
      const kind = what === "microphone" ? "audioinput" : "videoinput";
      if (list2.length && !list2.some((d) => d.kind === kind)) return { state: "unavailable", problem: "no-device" };
    } catch {
    }
    return { state: "ready" };
  }
  async stream(constraints, what) {
    const no = this.unsupported(what);
    if (no) return { ok: false, problem: no };
    try {
      return { ok: true, stream: await this.env.getUserMedia(constraints) };
    } catch (err) {
      return { ok: false, problem: problemFromError(err, this.env.policyAllows?.(what)) };
    }
  }
  get recording() {
    const c = this.capture;
    return c ? { slot: c.slot, video: c.video, seconds: this.seconds(c), max: c.max } : null;
  }
  recordingOf(slot) {
    return this.recs.get(slot);
  }
  slots() {
    return [...this.recs.values()];
  }
  seconds(c) {
    return Math.max(0, Math.round((this.now() - c.started) / 1e3 * 10) / 10);
  }
  total() {
    let n = 0;
    for (const r of this.recs.values()) n += r.size;
    return n;
  }
  /** Start recording into a slot (replacing what it held, once the new one finishes). One recording at a time. */
  async record(slot, o) {
    if (this.capture) return { ok: false, problem: "already-recording" };
    if (!this.recs.has(slot) && this.recs.size >= MAX_SLOTS || this.total() >= MAX_TOTAL_BYTES) return { ok: false, problem: "too-big" };
    if (!this.env.Recorder) return { ok: false, problem: "unsupported" };
    const wantsMic = !o.video || o.audio;
    if (wantsMic) this.stopListening("released");
    let stream;
    if (o.video) {
      if (this.camera && !wantsMic) stream = this.camera;
      else {
        const got = await this.stream({ video: { facingMode: o.facing ?? "user" }, audio: wantsMic }, "camera");
        if (!got.ok) return got;
        if (this.camera) this.dropCamera();
        stream = got.stream;
        this.camera = stream;
        this.events.onCamera?.(stream);
      }
    } else {
      const got = await this.stream({ audio: true }, "microphone");
      if (!got.ok) return got;
      stream = got.stream;
    }
    const types = o.video ? VIDEO_TYPES : AUDIO_TYPES;
    const mime = types.find((t) => this.env.Recorder.isTypeSupported?.(t)) ?? "";
    let recorder;
    try {
      recorder = new this.env.Recorder(stream, mime ? { mimeType: mime } : void 0);
    } catch {
      this.releaseStream(stream, o.video);
      return { ok: false, problem: "unsupported" };
    }
    const max = Math.max(1, o.maxSeconds);
    const chunks = [];
    let settle = () => void 0;
    const done = new Promise((resolve) => settle = resolve);
    let ended = false;
    const cap = {
      slot,
      video: o.video,
      stream,
      recorder,
      chunks,
      size: 0,
      started: this.now(),
      max,
      tick: setInterval(() => this.events.onTick?.(slot, this.seconds(cap)), 250),
      limit: setTimeout(() => void cap.finish("limit"), max * 1e3),
      level: null,
      audio: null,
      done,
      reason: "stopped",
      finish: (reason) => {
        if (ended) return done;
        ended = true;
        cap.reason = reason;
        clearInterval(cap.tick);
        clearTimeout(cap.limit);
        if (cap.level) clearInterval(cap.level);
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else recorder.onstop?.();
        } catch {
          recorder.onstop?.();
        }
        void cap.audio?.close();
        cap.audio = null;
        this.events.onLevel?.(0);
        this.releaseStream(stream, o.video);
        return done;
      }
    };
    this.capture = cap;
    recorder.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      chunks.push(e.data);
      cap.size += e.data.size;
      if (cap.size > MAX_RECORDING_BYTES) void cap.finish("limit");
    };
    recorder.onerror = () => void cap.finish("device-lost");
    recorder.onstop = () => {
      const reason = cap.reason;
      if (this.capture === cap) this.capture = null;
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || (o.video ? "video/webm" : "audio/webm") });
      const seconds = Math.min(max, this.seconds(cap));
      let rec = null;
      if (blob.size > 0 && reason !== "released") {
        rec = { slot, kind: o.video ? "video" : "audio", mime: blob.type, seconds, size: blob.size, blob };
        this.recs.set(slot, rec);
      }
      settle(rec);
      this.events.onFinished?.(rec, reason, slot);
    };
    for (const t of stream.getTracks()) t.onended = () => void cap.finish("device-lost");
    this.startLevel(cap, stream);
    try {
      recorder.start(1e3);
    } catch {
      void cap.finish("device-lost");
      return { ok: false, problem: "failed" };
    }
    return { ok: true, maxSeconds: max };
  }
  startLevel(cap, stream) {
    const AC = this.env.AudioContext;
    if (!AC || !stream.getAudioTracks().length) return;
    try {
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      cap.audio = ctx;
      void ctx.resume?.();
      const buf = new Float32Array(an.fftSize);
      let shown = 0;
      cap.level = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const raw = Math.min(1, rms * 4);
        shown = raw > shown ? raw : shown * 0.8 + raw * 0.2;
        this.events.onLevel?.(Math.round(shown * 100) / 100);
      }, 66);
    } catch {
    }
  }
  get listening() {
    return !!this.listen_;
  }
  /**
   * Listen live: open the microphone with no recorder, and about `LISTEN_PER_SECOND` times a second hand `onSound` the level and the
   * bands. Nothing is kept: the samples are measured and dropped. Already listening is fine (it stays as it is).
   */
  async listen() {
    if (this.listen_) return { ok: true };
    if (this.capture && (!this.capture.video || this.capture.stream.getAudioTracks().length)) return { ok: false, problem: "already-recording" };
    const AC = this.env.AudioContext;
    if (!AC) return { ok: false, problem: "unsupported" };
    const got = await this.stream({ audio: LISTEN_AUDIO }, "microphone");
    if (!got.ok) return got;
    if (this.listen_) {
      for (const t of got.stream.getTracks()) t.stop();
      return { ok: true };
    }
    const stream = got.stream;
    let ctx;
    let analyser;
    try {
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      void ctx.resume?.();
    } catch {
      for (const t of stream.getTracks()) t.stop();
      return { ok: false, problem: "failed" };
    }
    const wave = new Float32Array(analyser.fftSize);
    const spectrum = new Uint8Array(analyser.frequencyBinCount ?? analyser.fftSize / 2);
    const rate = ctx.sampleRate ?? 48e3;
    let shown = 0;
    let last = "";
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(wave);
      const raw = levelFromSamples(wave);
      shown = raw > shown ? raw : shown * 0.8 + raw * 0.2;
      const level = Math.round(shown * 100) / 100;
      let bands;
      if (analyser.getByteFrequencyData) {
        analyser.getByteFrequencyData(spectrum);
        bands = bandsFromSpectrum(spectrum, rate, analyser.fftSize);
      } else bands = new Array(BAND_COUNT).fill(0);
      const key = `${level}|${bands.join(",")}`;
      if (key === last) return;
      last = key;
      this.events.onSound?.(level, bands);
    }, Math.round(1e3 / LISTEN_PER_SECOND));
    this.listen_ = { stream, ctx, timer };
    for (const t of stream.getTracks()) t.onended = () => this.stopListening("device-lost");
    this.events.onListening?.(true, "started");
    return { ok: true };
  }
  /** Let go of the microphone and say so. Safe to call when not listening. */
  stopListening(reason = "stopped") {
    const l = this.listen_;
    if (!l) return;
    this.listen_ = null;
    clearInterval(l.timer);
    for (const t of l.stream.getTracks()) {
      t.onended = null;
      t.stop();
    }
    void l.ctx.close();
    this.events.onSound?.(0, new Array(BAND_COUNT).fill(0));
    this.events.onListening?.(false, reason);
  }
  /** Stop the recording in a slot and hand it over. A slot that is not recording gives what it holds, if anything. */
  async stop(slot) {
    const c = this.capture;
    if (c && c.slot === slot) return c.finish("stopped");
    return this.recs.get(slot) ?? null;
  }
  /** Stop whatever is recording, whichever slot (the bar's Stop button). */
  async stopActive() {
    return this.capture ? this.capture.finish("stopped") : null;
  }
  discard(slot) {
    if (this.capture?.slot === slot) void this.capture.finish("released");
    this.recs.delete(slot);
  }
  releaseStream(stream, video) {
    if (video && this.cameraWanted && stream === this.camera) {
      for (const t of stream.getAudioTracks()) t.stop();
      return;
    }
    for (const t of stream.getTracks()) {
      t.onended = null;
      t.stop();
    }
    if (stream === this.camera) {
      this.camera = null;
      this.events.onCamera?.(null);
    }
  }
  dropCamera() {
    const s = this.camera;
    this.camera = null;
    if (s) for (const t of s.getTracks()) t.stop();
  }
  /** Open the camera for a preview and keep it open until `closeCamera`. */
  async openCamera(facing) {
    this.cameraWanted = true;
    if (this.camera) return { ok: true, stream: this.camera };
    const got = await this.stream({ video: { facingMode: facing }, audio: false }, "camera");
    if (!got.ok) {
      this.cameraWanted = false;
      return got;
    }
    this.camera = got.stream;
    for (const t of got.stream.getTracks()) t.onended = () => this.closeCamera();
    this.events.onCamera?.(got.stream);
    return { ok: true, stream: got.stream };
  }
  closeCamera() {
    this.cameraWanted = false;
    if (this.capture?.video) return;
    if (this.camera) {
      for (const t of this.camera.getTracks()) {
        t.onended = null;
        t.stop();
      }
      this.camera = null;
      this.events.onCamera?.(null);
    }
  }
  get cameraOpen() {
    return !!this.camera;
  }
  get cameraStream() {
    return this.camera;
  }
  /** Let go of everything: the recording in progress (kept nowhere), the camera, the devices. Recordings already made stay in memory. */
  releaseAll() {
    this.cameraWanted = false;
    this.stopListening("released");
    if (this.capture) void this.capture.finish("released");
    this.closeCamera();
  }
  /** Forget the recordings too (the learner left, or opted out). */
  dispose() {
    this.releaseAll();
    this.recs.clear();
  }
}
function fitWithin(width, height, edge = IMAGE_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0, scaled: false };
  const long = Math.max(width, height);
  if (long <= edge) return { width: Math.round(width), height: Math.round(height), scaled: false };
  const k = edge / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}
async function downscaleImage(file, edge, env, quality = 0.85) {
  const img = await env.decode(file).catch(() => null);
  if (!img) return null;
  try {
    const size = fitWithin(img.width, img.height, edge);
    if (!size.width) return null;
    const blob = await env.encode(img.source, size.width, size.height, quality);
    return blob ? { blob, width: size.width, height: size.height } : null;
  } finally {
    img.close?.();
  }
}
async function toMediaImage(r) {
  return { mime: r.blob.type || "image/jpeg", width: r.width, height: r.height, bytes: await r.blob.arrayBuffer() };
}
function browserImageEnv(doc = document) {
  return {
    async decode(file) {
      if (typeof createImageBitmap !== "function") return null;
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close() };
    },
    encode(source, width, height, quality) {
      const canvas = doc.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext("2d");
      if (!g) return Promise.resolve(null);
      g.fillStyle = "#fff";
      g.fillRect(0, 0, width, height);
      g.drawImage(source, 0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
    }
  };
}
const SENSOR_KINDS = ["microphone", "camera", "photos"];
const DEFAULT_AUDIO_SECONDS = 120;
const DEFAULT_VIDEO_SECONDS = 60;
const MAX_AUDIO_SECONDS = 600;
const MAX_VIDEO_SECONDS = 180;
const MIN_SECONDS = 5;
const PURPOSE_MAX = 140;
const REASON_MAX = 300;
const oneLine = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
function cleanSensors(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return void 0;
  const r = raw;
  const out = {};
  if (r.microphone === true) out.microphone = true;
  if (r.camera === true) out.camera = true;
  if (out.microphone && (r.listen === true || r.listenOnly === true)) out.listen = true;
  if (out.microphone && r.listenOnly === true) out.listenOnly = true;
  if (r.photos === true) out.photos = true;
  const purpose = oneLine(r.purpose, PURPOSE_MAX);
  if (purpose) out.purpose = purpose;
  if (typeof r.maxSeconds === "number" && Number.isFinite(r.maxSeconds)) out.maxSeconds = Math.max(MIN_SECONDS, Math.min(MAX_AUDIO_SECONDS, Math.round(r.maxSeconds)));
  const why = oneLine(r.noAlternative, REASON_MAX);
  if (why) out.noAlternative = why;
  return Object.keys(out).length ? out : void 0;
}
function sensorsUsed(s) {
  return s ? SENSOR_KINDS.filter((k) => s[k] === true) : [];
}
const declaresSensors = (s) => sensorsUsed(s).length > 0;
function recordingCap(s, video) {
  const hard = video ? MAX_VIDEO_SECONDS : MAX_AUDIO_SECONDS;
  const own = s?.maxSeconds;
  const base = video ? DEFAULT_VIDEO_SECONDS : DEFAULT_AUDIO_SECONDS;
  return Math.max(MIN_SECONDS, Math.min(hard, typeof own === "number" && Number.isFinite(own) ? Math.round(own) : base));
}
const list = (words) => words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
function things(s) {
  const w = [];
  if (s.microphone) w.push("microphone");
  if (s.camera) w.push("camera");
  const base = w.length ? `your ${list(w)}` : "";
  if (s.photos) return base ? `${base}, and lets you choose or take a photo` : "a photo you choose or take";
  return base;
}
const NEVER_LABEL = "Do not use my microphone or camera";
function consentText(s) {
  const d = s ?? {};
  const lines = [];
  if (d.microphone && !d.listenOnly) lines.push("The microphone records only while the recording bar is showing at the top of the page. You can stop it at any time.");
  if (d.microphone && d.listen) {
    const how = 'only while the "Listening" bar is showing at the top of the page, to move things on the screen with how loud the sound is and how low or high. Nothing is recorded or saved from it, and you can stop it at any time.';
    lines.push(`${d.listenOnly ? "The microphone listens live" : "The microphone can also listen live"}, ${how}`);
  }
  if (d.camera) lines.push("The camera shows you a preview, and records only while the recording bar is showing. You can stop it at any time.");
  if (d.microphone && !d.listenOnly || d.camera) lines.push("Recordings are kept in this page, on your device. They are not saved on a server, and they are gone when you close or reload the page unless you download them.");
  if (d.photos) lines.push("A photo you choose or take is shown in this activity. It is not uploaded or saved on a server.");
  const why = d.noAlternative ? oneLine(d.noAlternative, REASON_MAX) : "";
  const alternative = why ? `There is no other way to do this part. ${why.replace(/[.!?]*$/, ".")} If you cannot or would rather not, you can skip it.` : `You do not have to use ${d.microphone || d.camera ? "them" : "it"}. Choose "${NEVER_LABEL}" and every activity will offer another way to finish.`;
  return {
    title: `This activity wants to use ${things(d) || "your device"}`,
    purpose: d.purpose ? `It is used to ${d.purpose.replace(/^to\s+/i, "").replace(/[.!?]*$/, "")}.` : "",
    lines,
    alternative,
    continue: "Continue",
    later: "Not now",
    never: NEVER_LABEL
  };
}
const PROBLEM_TEXT = {
  denied: "Your browser is not letting this page use your microphone or camera. Allow it for this site in your browser, then try again. If it still does not work, the course page may not allow it, so tell your teacher. You can also finish without it.",
  "no-device": "No microphone or camera was found. Plug one in, or switch to a device that has one, then try again. You can also finish without it.",
  blocked: "The course page this activity is on does not allow the microphone or camera. Tell your teacher, and use the other way to finish for now.",
  busy: "Another app or tab is using your microphone or camera. Close it, then try again.",
  unsupported: "This browser cannot record from a microphone or camera. Try a recent Chrome, Edge, Firefox or Safari, or finish another way.",
  insecure: "Recording needs a secure page (https). Tell your teacher.",
  failed: "The microphone or camera would not start. Try again, or finish another way.",
  off: "You chose not to use your microphone or camera, so this activity is offering another way to finish.",
  declined: "Not started. You can try again whenever you like.",
  "not-declared": "This activity did not say it uses a microphone or camera, so it cannot.",
  "no-page": "This page cannot use a microphone or camera here, so use the other way to finish.",
  cancelled: "Nothing was chosen.",
  "too-big": "That is too big to use. Try a smaller one.",
  "camera-off": "The camera is not on yet.",
  "already-recording": "Something is already being recorded. Stop it first."
};
function stateAfter(problem) {
  switch (problem) {
    case null:
    case "declined":
    case "cancelled":
    case "busy":
    case "failed":
    case "too-big":
    case "camera-off":
    case "already-recording":
      return "ready";
    case "off":
      return "off";
    case "denied":
      return "denied";
    default:
      return "unavailable";
  }
}
const CSS = `
.ixm-veil{position:fixed;inset:0;z-index:2147483646;background:rgba(10,10,14,.72);display:flex;align-items:center;justify-content:center;padding:16px;font:16px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.ixm-card{background:#fff;color:#1a1a1f;max-width:30rem;width:100%;max-height:100%;overflow:auto;border-radius:12px;padding:22px 24px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.ixm-card h2{margin:0 0 10px;font-size:1.2rem;line-height:1.3}
.ixm-card p{margin:0 0 10px}
.ixm-card ul{margin:0 0 12px;padding-left:1.2em}
.ixm-card li{margin:0 0 6px}
.ixm-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.ixm-btn{font:inherit;font-weight:600;min-height:44px;min-width:44px;padding:8px 16px;border-radius:8px;border:2px solid #2f49d0;background:#fff;color:#2f49d0;cursor:pointer}
.ixm-btn.primary{background:#2f49d0;color:#fff}
.ixm-btn:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}
.ixm-btn.quiet{border-color:transparent;text-decoration:underline;font-weight:500}
.ixm-bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;max-width:calc(100% - 20px);background:#1b1b1f;color:#fff;border:2px solid #fff;border-radius:999px;padding:6px 8px 6px 16px;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5)}
.ixm-dot{width:12px;height:12px;border-radius:50%;background:#ff3b30;flex:none;animation:ixm-pulse 1.2s infinite}
@media (prefers-reduced-motion:reduce){.ixm-dot{animation:none}}
@keyframes ixm-pulse{50%{opacity:.35}}
.ixm-meter{width:70px;height:10px;border-radius:5px;background:#4a4a52;overflow:hidden;flex:none}
.ixm-meter i{display:block;height:100%;width:100%;background:#4cd964;transform-origin:left;transform:scaleX(0)}
.ixm-time{font-variant-numeric:tabular-nums;white-space:nowrap}
.ixm-bar .ixm-btn{border-color:#fff;background:#fff;color:#1b1b1f;border-radius:999px;padding:6px 18px}
.ixm-chip{position:fixed;left:12px;bottom:12px;z-index:2147483645;display:flex;gap:8px;align-items:center;background:#1b1b1f;color:#fff;border-radius:999px;padding:4px 6px 4px 14px;font:500 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
.ixm-chip .ixm-btn{min-height:36px;padding:2px 12px;font-size:14px;background:#fff;color:#1b1b1f;border-color:#fff;border-radius:999px}
.ixm-preview{position:fixed;z-index:2147483644;object-fit:cover;background:#000;border-radius:6px;pointer-events:none}
.ixm-live{position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
class MediaUi {
  /** `requireTrusted` (the default): a button only counts when a person pressed it, not when a script clicked it. Tests turn it off. */
  constructor(doc, requireTrusted = true) {
    this.requireTrusted = requireTrusted;
    this.root = null;
    this.veil = null;
    this.bar = null;
    this.video = null;
    this.chip = null;
    this.live = null;
    this.playingUrl = null;
    this.doc = doc;
  }
  mount() {
    if (this.root) return this.root;
    const doc = this.doc;
    const style = doc.createElement("style");
    style.textContent = CSS;
    doc.head.appendChild(style);
    const root = doc.createElement("div");
    root.setAttribute("data-ix-media", "");
    doc.body.appendChild(root);
    const live = doc.createElement("div");
    live.className = "ixm-live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    root.appendChild(live);
    this.live = live;
    this.root = root;
    return root;
  }
  el(tag, cls = "", text = "") {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  announce(text) {
    this.mount();
    if (!this.live) return;
    this.live.textContent = "";
    setTimeout(() => {
      if (this.live) this.live.textContent = text;
    }, 30);
  }
  /** A modal card with these buttons; resolves with the one pressed. Escape is the last (the "not now" one). */
  modal(opts) {
    const root = this.mount();
    this.closeVeil();
    const prev = this.doc.activeElement;
    const veil = this.el("div", "ixm-veil");
    const card = this.el("div", "ixm-card");
    card.setAttribute("role", opts.role);
    card.setAttribute("aria-modal", "true");
    const h = this.el("h2", "", opts.title);
    h.id = `ixm-h-${Math.random().toString(36).slice(2, 8)}`;
    card.setAttribute("aria-labelledby", h.id);
    card.appendChild(h);
    opts.body(card);
    const row = this.el("div", "ixm-row");
    card.appendChild(row);
    veil.appendChild(card);
    root.appendChild(veil);
    this.veil = veil;
    return new Promise((resolve) => {
      const btns = [];
      let settled = false;
      const done = (id) => {
        if (settled) return;
        settled = true;
        veil.remove();
        if (this.veil === veil) this.veil = null;
        this.doc.removeEventListener("keydown", onKey, true);
        prev?.focus?.();
        resolve(id);
      };
      for (const b of opts.buttons) {
        const btn = this.el("button", `ixm-btn ${b.cls ?? ""}`, b.label);
        btn.type = "button";
        btn.addEventListener("click", (e) => {
          if (this.requireTrusted && !e.isTrusted) return;
          done(b.id);
        });
        row.appendChild(btn);
        btns.push(btn);
      }
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          done(opts.escape);
        } else if (e.key === "Tab" && btns.length) {
          const i = btns.indexOf(this.doc.activeElement);
          const next = e.shiftKey ? i <= 0 ? btns.length - 1 : i - 1 : i === btns.length - 1 ? 0 : i + 1;
          e.preventDefault();
          btns[next].focus();
        }
      };
      this.doc.addEventListener("keydown", onKey, true);
      btns[0]?.focus();
      veil.ixmCancel = () => done(opts.escape);
    });
  }
  closeVeil() {
    this.veil?.ixmCancel?.();
    this.veil = null;
  }
  /** The one consent screen. */
  consent(t) {
    return this.modal({
      title: t.title,
      role: "dialog",
      body: (card) => {
        if (t.purpose) card.appendChild(this.el("p", "", t.purpose));
        const ul = this.el("ul");
        for (const l of t.lines) ul.appendChild(this.el("li", "", l));
        card.appendChild(ul);
        card.appendChild(this.el("p", "", t.alternative));
      },
      buttons: [
        { id: "continue", label: t.continue, cls: "primary" },
        { id: "later", label: t.later },
        { id: "never", label: t.never, cls: "quiet" }
      ],
      escape: "later"
    });
  }
  /** Something went wrong, in plain words. */
  problem(message) {
    return this.modal({
      title: "That did not work",
      role: "alertdialog",
      body: (card) => card.appendChild(this.el("p", "", message)),
      buttons: [{ id: "ok", label: "OK", cls: "primary" }],
      escape: "ok"
    }).then(() => void 0);
  }
  /** A step that needs the learner's own tap (the browser only lets a tap start the microphone, a download or the picker). */
  askTap(message, label) {
    return this.modal({
      title: message,
      role: "dialog",
      body: () => void 0,
      buttons: [
        { id: "go", label, cls: "primary" },
        { id: "cancel", label: "Cancel" }
      ],
      escape: "cancel"
    }).then((r) => r === "go");
  }
  /** Ask the learner to confirm turning the microphone and camera off for good. */
  confirmOptOut(label) {
    return this.modal({
      title: `${label}?`,
      role: "dialog",
      body: (card) => card.appendChild(this.el("p", "", "Every activity will then offer another way to finish, and you will not be asked again on this browser. You can turn them back on from the button that stays at the bottom left of the page.")),
      buttons: [
        { id: "yes", label, cls: "primary" },
        { id: "no", label: "Cancel" }
      ],
      escape: "no"
    }).then((r) => r === "yes");
  }
  /** The recording bar. It is the learner's control: Stop always works, and nothing the project does reaches it. */
  showBar(o) {
    this.hideBar();
    const root = this.mount();
    const bar = this.el("div", "ixm-bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Recording");
    const dot = this.el("span", "ixm-dot");
    dot.setAttribute("aria-hidden", "true");
    const label = this.el("span", "", `Recording ${o.what}`);
    const meter = this.el("span", "ixm-meter");
    meter.setAttribute("aria-hidden", "true");
    const fill = this.el("i");
    meter.appendChild(fill);
    const time = this.el("span", "ixm-time", `0:00 of ${fmt(o.max)}`);
    time.setAttribute("aria-hidden", "true");
    const stop = this.el("button", "ixm-btn", "Stop");
    stop.type = "button";
    stop.setAttribute("aria-label", "Stop recording");
    stop.addEventListener("click", () => o.onStop());
    bar.append(dot, label, meter, time, stop);
    root.appendChild(bar);
    this.announce(`Recording ${o.what} started. Use the Stop button at the top of the page to finish. Up to ${fmt(o.max).replace(":", " minutes ")} seconds.`);
    let lastSaid = 0;
    this.bar = {
      update: (seconds, level) => {
        time.textContent = `${fmt(seconds)} of ${fmt(o.max)}`;
        fill.style.transform = `scaleX(${Math.max(0, Math.min(1, level))})`;
        if (seconds - lastSaid >= 30) {
          lastSaid = seconds;
          this.announce(`${Math.floor(seconds)} seconds recorded`);
        }
      },
      close: () => bar.remove()
    };
    stop.focus({ preventScroll: true });
  }
  /** The bar for live listening: the same place and the same Stop as a recording, with no timer, and words that say nothing is being recorded. */
  showListening(o) {
    this.hideBar();
    const root = this.mount();
    const bar = this.el("div", "ixm-bar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Listening");
    const dot = this.el("span", "ixm-dot");
    dot.setAttribute("aria-hidden", "true");
    const label = this.el("span", "", "Listening to the microphone, nothing is recorded");
    const meter = this.el("span", "ixm-meter");
    meter.setAttribute("aria-hidden", "true");
    const fill = this.el("i");
    meter.appendChild(fill);
    const stop = this.el("button", "ixm-btn", "Stop");
    stop.type = "button";
    stop.setAttribute("aria-label", "Stop listening");
    stop.addEventListener("click", () => o.onStop());
    bar.append(dot, label, meter, stop);
    root.appendChild(bar);
    this.announce("Listening to the microphone has started. Nothing is recorded. Use the Stop button at the top of the page to finish.");
    this.bar = {
      update: (_seconds, level) => {
        fill.style.transform = `scaleX(${Math.max(0, Math.min(1, level))})`;
      },
      close: () => bar.remove()
    };
    stop.focus({ preventScroll: true });
  }
  updateBar(seconds, level) {
    this.bar?.update(seconds, level);
  }
  hideBar() {
    this.bar?.close();
    this.bar = null;
  }
  get barShowing() {
    return !!this.bar;
  }
  ensureVideo() {
    if (this.video) return this.video;
    const v = this.doc.createElement("video");
    v.className = "ixm-preview";
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-label", "Camera preview");
    this.mount().appendChild(v);
    this.video = v;
    return v;
  }
  /** Where the preview sits, clamped into the page so it cannot cover the recording bar's strip or run off the edge. */
  place(v, rect, mirror) {
    const win = this.doc.defaultView;
    const W = win?.innerWidth ?? 800;
    const H = win?.innerHeight ?? 600;
    const w = Math.max(40, Math.min(W, rect.w));
    const h = Math.max(40, Math.min(H, rect.h));
    const x = Math.max(0, Math.min(W - w, rect.x));
    const y = Math.max(0, Math.min(H - h, rect.y));
    Object.assign(v.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, transform: mirror ? "scaleX(-1)" : "" });
  }
  showPreview(stream, rect, mirror) {
    const v = this.ensureVideo();
    this.endPlayback();
    if (v.srcObject !== stream) v.srcObject = stream;
    this.place(v, rect, mirror);
    v.style.display = "";
    void Promise.resolve(v.play?.()).catch(() => void 0);
  }
  movePreview(rect, mirror) {
    if (this.video) this.place(this.video, rect, mirror);
  }
  hidePreview() {
    if (!this.video) return;
    this.endPlayback();
    this.video.srcObject = null;
    this.video.remove();
    this.video = null;
  }
  /** Play a finished video recording where the preview was. Calls `onEnd` when it finishes. */
  playRecording(url, rect, onEnd) {
    const v = this.ensureVideo();
    v.srcObject = null;
    this.playingUrl = url;
    v.muted = false;
    v.src = url;
    this.place(v, rect, false);
    v.style.display = "";
    v.onended = () => {
      this.endPlayback();
      onEnd();
    };
    void Promise.resolve(v.play?.()).catch(() => void 0);
  }
  endPlayback() {
    if (!this.video || !this.playingUrl) return;
    this.video.onended = null;
    this.video.pause?.();
    this.video.removeAttribute("src");
    this.video.muted = true;
    URL.revokeObjectURL(this.playingUrl);
    this.playingUrl = null;
  }
  get playing() {
    return !!this.playingUrl;
  }
  /** The live preview, for taking a still from it. */
  get previewElement() {
    return this.video && !this.playingUrl ? this.video : null;
  }
  /** "Microphone and camera are off", with the way back. */
  showChip(label, onTurnOn) {
    this.hideChip();
    const chip = this.el("div", "ixm-chip");
    chip.setAttribute("role", "group");
    chip.setAttribute("aria-label", "Microphone and camera");
    chip.appendChild(this.el("span", "", "Microphone and camera are off"));
    const b = this.el("button", "ixm-btn", label);
    b.type = "button";
    b.addEventListener("click", onTurnOn);
    chip.appendChild(b);
    this.mount().appendChild(chip);
    this.chip = chip;
  }
  hideChip() {
    this.chip?.remove();
    this.chip = null;
  }
  /** The device's photo picker. Resolves with the file, or null when the person backs out. */
  pickFile(capture) {
    return new Promise((resolve) => {
      const input = this.doc.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      if (capture) input.setAttribute("capture", capture);
      input.style.display = "none";
      this.mount().appendChild(input);
      let settled = false;
      const win = this.doc.defaultView;
      const done = (f) => {
        if (settled) return;
        settled = true;
        win?.removeEventListener("focus", onFocus);
        input.remove();
        resolve(f);
      };
      const onFocus = () => setTimeout(() => done(input.files?.[0] ?? null), 1200);
      input.addEventListener("change", () => done(input.files?.[0] ?? null));
      input.addEventListener("cancel", () => done(null));
      win?.addEventListener("focus", onFocus);
      input.click();
    });
  }
  /** Hand the learner a file. */
  download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = this.doc.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    this.mount().appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3e4);
  }
  /** Take it all away (the page is leaving, or a new document took the frame). */
  reset() {
    this.closeVeil();
    this.hideBar();
    this.hidePreview();
    this.hideChip();
  }
}
const OPT_OUT_KEY = "ix-sensors-off";
function localOptOut(win = window) {
  let memory = false;
  return {
    get() {
      try {
        return win.localStorage?.getItem(OPT_OUT_KEY) === "1" || memory;
      } catch {
        return memory;
      }
    },
    set(v) {
      memory = v;
      try {
        if (v) win.localStorage?.setItem(OPT_OUT_KEY, "1");
        else win.localStorage?.removeItem(OPT_OUT_KEY);
      } catch {
      }
    }
  };
}
const EXT = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "video/webm": "webm", "video/mp4": "mp4" };
const extOf = (mime) => EXT[mime.split(";")[0].trim().toLowerCase()] ?? "webm";
class TrustedMedia {
  constructor(opts) {
    this.consented = false;
    this.problems = {};
    this.checked = false;
    this.level = 0;
    this.seconds = 0;
    this.busy = Promise.resolve();
    this.expectStop = "";
    this.previewWanted = null;
    this.playingSlot = "";
    this.disposed = false;
    this.opts = opts;
    this.declaration = cleanSensors(opts.declaration);
    this.store = opts.store ?? localOptOut();
    this.imageEnv = opts.imageEnv ?? browserImageEnv(opts.doc);
    this.optedOut = this.store.get();
    this.ui = new MediaUi(opts.doc, opts.requireTrusted ?? true);
    this.engine = new MediaEngine(opts.env, {
      onLevel: (l) => {
        this.level = l;
        this.ui.updateBar(this.seconds, l);
        opts.emit({ event: "level", level: l });
      },
      onSound: (level, bands) => {
        this.level = level;
        this.ui.updateBar(0, level);
        opts.emit({ event: "sound", level, bands });
      },
      onListening: (on, reason) => {
        if (on) return;
        this.ui.hideBar();
        if (this.disposed) return;
        if (reason !== "released") this.ui.announce(reason === "device-lost" ? "Listening stopped: the microphone went away" : "Listening stopped");
        opts.emit({ event: "listening", on: false, reason });
      },
      onTick: (slot, s) => {
        this.seconds = s;
        this.ui.updateBar(s, this.level);
        opts.emit({ event: "tick", slot, seconds: s });
      },
      onFinished: (rec, reason, slot) => void this.finished(rec, reason, slot),
      onCamera: (stream) => {
        if (stream && this.previewWanted) this.ui.showPreview(stream, this.previewWanted.rect, this.previewWanted.mirror);
        else if (!stream && !this.ui.playing) this.ui.hidePreview();
      }
    });
    if (this.optedOut) this.showChip();
  }
  // ------------------------------------------------------------ state
  declared(kind) {
    return !!this.declaration?.[kind];
  }
  stateOf(kind) {
    if (!this.declared(kind)) return "unavailable";
    if (this.optedOut) return "off";
    const p = this.problems[kind];
    return p ? stateAfter(p) : "ready";
  }
  state() {
    const kinds = sensorsUsed(this.declaration);
    const first = kinds.map((k) => this.problems[k]).find((p) => p && stateAfter(p) !== "ready");
    return {
      microphone: this.stateOf("microphone"),
      camera: this.stateOf("camera"),
      photos: this.stateOf("photos"),
      optedOut: this.optedOut,
      message: this.optedOut ? PROBLEM_TEXT.off : first ? PROBLEM_TEXT[first] : ""
    };
  }
  publish() {
    this.opts.emit({ event: "state", state: this.state() });
  }
  setProblem(kind, p) {
    const before = this.stateOf(kind);
    if (p) this.problems[kind] = p;
    else delete this.problems[kind];
    if (this.stateOf(kind) !== before) this.publish();
  }
  /** The device check, for what is declared, without opening anything: it makes the first state the project sees a true one. */
  async deviceCheck() {
    if (this.checked) return;
    this.checked = true;
    for (const kind of ["microphone", "camera"]) {
      if (!this.declared(kind)) continue;
      const r = await this.engine.check(kind);
      if (r.problem) this.problems[kind] = r.problem;
    }
    if (this.declared("photos") && !this.imageEnv) this.problems.photos = "unsupported";
  }
  // ------------------------------------------------------------ the learner's choices
  showChip() {
    this.ui.showChip("Turn on", () => this.turnOn());
  }
  turnOn() {
    this.optedOut = false;
    this.store.set(false);
    this.ui.hideChip();
    this.publish();
  }
  /** "Do not use my microphone or camera": everything stops, and every project is told `off`. Only the learner can undo it. */
  optOut() {
    this.optedOut = true;
    this.store.set(true);
    this.engine.dispose();
    this.previewWanted = null;
    this.ui.reset();
    this.showChip();
    this.publish();
  }
  // ------------------------------------------------------------ starting anything
  /** Whether this may go ahead now. A failure is the problem to tell the project; null is yes. */
  async authorise(kind) {
    if (!this.declared(kind)) return "not-declared";
    if (this.optedOut) return "off";
    await this.deviceCheck();
    const known = this.problems[kind];
    if (known && known !== "denied" && known !== "busy" && known !== "failed") return known;
    if (!this.consented) {
      const choice = await this.ui.consent(consentText(this.declaration));
      if (choice === "never") {
        this.optOut();
        return "off";
      }
      if (choice === "later") return "declined";
      this.consented = true;
      return null;
    }
    const active = this.opts.activation?.() ?? null;
    if (active !== true) {
      const ok = await this.ui.askTap(kind === "photos" ? "Choose a photo" : "Ready to start?", kind === "photos" ? "Choose a photo" : "Start");
      if (!ok) return "declined";
    }
    return null;
  }
  async fail(kind, problem) {
    const message = PROBLEM_TEXT[problem];
    const quiet = problem === "off" || problem === "declined" || problem === "cancelled" || problem === "not-declared";
    this.setProblem(kind, quiet ? null : problem);
    if (!quiet) await this.ui.problem(message);
    return { ok: false, problem, message, state: this.state() };
  }
  /** Needs a tap before a download or a picker; true when there is one (or the learner has just given it). */
  async tapped(label, button) {
    if (this.opts.activation?.() === true) return true;
    return this.ui.askTap(label, button);
  }
  // ------------------------------------------------------------ the requests
  /** One request at a time, so two taps never open two consent screens. */
  handle(op, args) {
    const run = this.busy.then(
      () => this.run(op, args),
      () => this.run(op, args)
    );
    this.busy = run.catch(() => void 0);
    return run;
  }
  async run(op, args) {
    if (this.disposed) return { ok: false, problem: "no-page", message: PROBLEM_TEXT["no-page"] };
    try {
      switch (op) {
        case "hello":
          await this.deviceCheck();
          return { ok: true, version: MEDIA_VERSION, state: this.state(), declared: { microphone: this.declared("microphone"), camera: this.declared("camera"), photos: this.declared("photos") } };
        case "start":
          return await this.start(args);
        case "stop":
          return await this.stop(args);
        case "take": {
          const rec = this.engine.recordingOf(cleanSlot(args.slot));
          return rec ? { ok: true, recording: this.meta(rec), bytes: await this.bytes(rec) } : { ok: false, problem: "cancelled", message: "There is no recording yet." };
        }
        case "discard":
          this.engine.discard(cleanSlot(args.slot));
          return { ok: true };
        case "download":
          return await this.download(args);
        case "listen":
          return await this.listen(args);
        case "preview":
          return await this.preview(args);
        case "snapshot":
          return await this.snapshot(args);
        case "pick":
          return await this.pick(args);
        case "save":
          return await this.save(args);
        case "optout": {
          if (this.optedOut) return { ok: true, state: this.state() };
          if (await this.ui.confirmOptOut(NEVER_LABEL)) this.optOut();
          return { ok: true, state: this.state() };
        }
      }
    } catch (err) {
      console.warn("[interactives] media bridge failed:", err);
      return { ok: false, problem: "failed", message: PROBLEM_TEXT.failed };
    }
    return { ok: false, problem: "failed", message: PROBLEM_TEXT.failed };
  }
  async start(args) {
    const a = cleanStart(args);
    const kind = a.video ? "camera" : "microphone";
    if (a.video && a.audio && (this.declared("microphone") === false || this.declaration?.listenOnly)) a.audio = false;
    if (!a.video && this.declaration?.listenOnly) return this.fail("microphone", "not-declared");
    const no = await this.authorise(kind);
    if (no) return this.fail(kind, no);
    const max = recordingCap(this.declaration, a.video);
    const asked = a.maxSeconds ? Math.max(1, Math.min(max, Math.round(a.maxSeconds))) : max;
    const r = await this.engine.record(a.slot, { video: a.video, audio: a.audio, maxSeconds: asked, facing: this.previewWanted ? void 0 : "user" });
    if (!r.ok) return this.fail(kind, r.problem);
    this.setProblem(kind, null);
    this.seconds = 0;
    this.ui.showBar({ what: a.video ? a.audio ? "camera and microphone" : "camera" : "microphone", max: r.maxSeconds, onStop: () => void this.engine.stopActive() });
    return { ok: true, maxSeconds: r.maxSeconds, state: this.state() };
  }
  /** Live listening: the microphone with no recorder, numbers only, a "Listening" bar with a Stop that always works. */
  async listen(args) {
    const a = cleanListen(args);
    if (!a.on) {
      this.engine.stopListening("stopped");
      return { ok: true, listening: false, state: this.state() };
    }
    if (!this.declaration?.listen) return this.fail("microphone", "not-declared");
    if (this.engine.listening) return { ok: true, listening: true, state: this.state() };
    const no = await this.authorise("microphone");
    if (no) return this.fail("microphone", no);
    const r = await this.engine.listen();
    if (!r.ok) return this.fail("microphone", r.problem);
    this.setProblem("microphone", null);
    this.ui.showListening({ onStop: () => this.engine.stopListening("stopped") });
    return { ok: true, listening: true, state: this.state() };
  }
  async bytes(rec) {
    return rec.kind === "audio" ? rec.blob.arrayBuffer() : void 0;
  }
  meta(rec) {
    return { slot: rec.slot, kind: rec.kind, mime: rec.mime, seconds: rec.seconds, size: rec.size };
  }
  async finished(rec, reason, slot) {
    this.ui.hideBar();
    if (reason === "released" || this.disposed) return;
    this.ui.announce(reason === "limit" ? "Recording stopped: it reached its time limit" : reason === "device-lost" ? "Recording stopped: the microphone or camera went away" : "Recording stopped");
    if (this.expectStop === slot) return;
    if (!rec) {
      this.opts.emit({ event: "failed", slot, problem: "failed", message: PROBLEM_TEXT.failed });
      return;
    }
    this.opts.emit({ event: "ready", recording: this.meta(rec), reason });
  }
  async stop(args) {
    const slot = cleanSlot(args.slot);
    this.expectStop = slot;
    let rec;
    try {
      rec = await this.engine.stop(slot);
    } finally {
      this.expectStop = "";
    }
    if (!rec) return { ok: false, problem: "cancelled", message: "There is no recording to stop." };
    return { ok: true, recording: this.meta(rec), bytes: await this.bytes(rec), state: this.state() };
  }
  async download(args) {
    const slot = cleanSlot(args.slot);
    const rec = this.engine.recordingOf(slot);
    if (!rec) return { ok: false, problem: "cancelled", message: "There is no recording to save yet." };
    if (!await this.tapped("Save your recording", "Save")) return { ok: false, problem: "declined", message: PROBLEM_TEXT.declined };
    this.ui.download(rec.blob, cleanFileName(args.name, slot, extOf(rec.mime)));
    return { ok: true };
  }
  async save(args) {
    const f = cleanSave(args);
    if (!f) return { ok: false, problem: "too-big", message: PROBLEM_TEXT["too-big"] };
    if (!await this.tapped("Save this file", "Save")) return { ok: false, problem: "declined", message: PROBLEM_TEXT.declined };
    this.ui.download(new Blob([f.text], { type: `${f.mime};charset=utf-8` }), f.name);
    return { ok: true };
  }
  async preview(args) {
    const a = cleanPreview(args);
    if (!a.on) {
      this.previewWanted = null;
      this.engine.closeCamera();
      if (!this.engine.recording?.video) this.ui.hidePreview();
      return { ok: true };
    }
    if (a.play) {
      const rec = this.engine.recordingOf(a.play);
      if (!rec || rec.kind !== "video") return { ok: false, problem: "cancelled", message: "There is no video to play yet." };
      this.playingSlot = a.play;
      this.ui.playRecording(URL.createObjectURL(rec.blob), a.rect, () => {
        const slot = this.playingSlot;
        this.playingSlot = "";
        this.opts.emit({ event: "played", slot });
        const live = this.engine.cameraStream;
        if (live && this.previewWanted) this.ui.showPreview(live, this.previewWanted.rect, this.previewWanted.mirror);
        else this.ui.hidePreview();
      });
      return { ok: true };
    }
    this.previewWanted = { rect: a.rect, mirror: a.mirror };
    if (this.engine.cameraOpen) {
      this.ui.movePreview(a.rect, a.mirror);
      return { ok: true, state: this.state() };
    }
    const no = await this.authorise("camera");
    if (no) {
      this.previewWanted = null;
      return this.fail("camera", no);
    }
    const r = await this.engine.openCamera(a.facing);
    if (!r.ok) {
      this.previewWanted = null;
      return this.fail("camera", r.problem);
    }
    this.setProblem("camera", null);
    this.ui.showPreview(r.stream, a.rect, a.mirror);
    return { ok: true, state: this.state() };
  }
  async snapshot(args) {
    if (!this.declared("camera")) return this.fail("camera", "not-declared");
    if (this.optedOut) return this.fail("camera", "off");
    const v = this.ui.previewElement;
    if (!v || !v.videoWidth) return { ok: false, problem: "camera-off", message: PROBLEM_TEXT["camera-off"] };
    const size = fitWithin(v.videoWidth, v.videoHeight, cleanEdge(args.maxEdge));
    const blob = await this.imageEnv.encode(v, size.width, size.height, 0.85);
    if (!blob) return { ok: false, problem: "failed", message: PROBLEM_TEXT.failed };
    return { ok: true, image: await toMediaImage({ blob, width: size.width, height: size.height }) };
  }
  async pick(args) {
    const a = cleanPick(args);
    const no = await this.authorise("photos");
    if (no) return this.fail("photos", no);
    const file = await this.ui.pickFile(a.capture);
    if (!file) return { ok: false, problem: "cancelled", message: PROBLEM_TEXT.cancelled, cancelled: true };
    const out = await downscaleImage(file, a.maxEdge, this.imageEnv);
    if (!out) return this.fail("photos", "unsupported");
    return { ok: true, image: await toMediaImage(out) };
  }
  // ------------------------------------------------------------ leaving
  /** A new document took the project's frame, or the page is going: devices off, the bar and preview gone. Recordings stay for the same project. */
  release() {
    this.engine.releaseAll();
    this.previewWanted = null;
    this.ui.reset();
    if (this.optedOut) this.showChip();
  }
  dispose() {
    this.disposed = true;
    this.engine.dispose();
    this.previewWanted = null;
    this.ui.reset();
  }
}
const buffers = (o) => [o.bytes, o.image?.bytes].filter((b) => b instanceof ArrayBuffer);
function startBridge(o) {
  const win = o.win ?? window;
  const post = (msg, transfer = []) => {
    try {
      o.frame.contentWindow?.postMessage({ target: MEDIA_TARGET, v: MEDIA_VERSION, ...msg }, "*", transfer);
    } catch {
    }
  };
  const trusted = new TrustedMedia({
    declaration: o.declaration,
    doc: win.document,
    env: o.env ?? browserEnv(win),
    store: o.store ?? localOptOut(win),
    activation: () => {
      const ua = win.navigator.userActivation;
      return ua ? ua.isActive : null;
    },
    emit: (ev) => post({ type: "media-event", ...ev }),
    requireTrusted: o.requireTrusted
  });
  const onMessage = (e) => {
    if (e.source !== o.frame.contentWindow) return;
    const req = cleanRequest(e.data, o.nonce);
    if (!req) return;
    if (req.op === "hello") trusted.release();
    void trusted.handle(req.op, req.args).then((reply) => post({ type: "media", rid: req.rid, ...reply }, buffers(reply)));
  };
  win.addEventListener("message", onMessage);
  void trusted.handle("hello", {}).then((r) => r.state && post({ type: "media-event", event: "state", state: r.state }));
  const onLoad = () => trusted.release();
  o.frame.addEventListener("load", onLoad);
  const leave = (e) => e.persisted ? trusted.release() : trusted.dispose();
  win.addEventListener("pagehide", leave);
  return {
    trusted,
    stop() {
      win.removeEventListener("message", onMessage);
      win.removeEventListener("pagehide", leave);
      o.frame.removeEventListener("load", onLoad);
      trusted.dispose();
    }
  };
}
export {
  cleanSensors,
  declaresSensors,
  startBridge
};
