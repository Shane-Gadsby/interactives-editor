/*! built from the player's media sources 5b499eaf2d562a9c7b81 */
const YT_ID = /^[\w-]{6,20}$/;
const VIMEO_ID = /^\d{5,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i;
const PANOPTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PANOPTO_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.panopto\.(com|eu)$/i;
function validPlatformVideo(v) {
  if (!v || typeof v !== "object") return false;
  const o = v;
  if (o.start !== void 0 && !(typeof o.start === "number" && o.start >= 0 && o.start < 1e6)) return false;
  if (o.provider === "youtube") return typeof o.id === "string" && YT_ID.test(o.id);
  if (o.provider === "vimeo") return typeof o.id === "string" && VIMEO_ID.test(o.id) && (o.hash === void 0 || typeof o.hash === "string" && VIMEO_HASH.test(o.hash));
  if (o.provider === "panopto") return typeof o.id === "string" && PANOPTO_ID.test(o.id) && typeof o.host === "string" && PANOPTO_HOST.test(o.host);
  return false;
}
function platformFrameUrl(v, origin, opts = {}) {
  if (!validPlatformVideo(v)) return "about:blank";
  const start = v.start ? Math.floor(v.start) : 0;
  if (v.provider === "youtube") {
    const q2 = new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0" });
    if (/^https?:\/\//.test(origin)) q2.set("origin", origin);
    if (start) q2.set("start", String(start));
    if (opts.controls === false) q2.set("controls", "0");
    if (opts.autoplay) q2.set("autoplay", "1");
    if (opts.muted) q2.set("mute", "1");
    if (opts.loop) {
      q2.set("loop", "1");
      q2.set("playlist", v.id);
    }
    return `https://www.youtube-nocookie.com/embed/${v.id}?${q2}`;
  }
  if (v.provider === "vimeo") {
    const q2 = new URLSearchParams({ api: "1", dnt: "1" });
    if (v.hash) q2.set("h", v.hash);
    if (opts.controls === false) q2.set("controls", "0");
    if (opts.autoplay) q2.set("autoplay", "1");
    if (opts.muted) q2.set("muted", "1");
    if (opts.loop) q2.set("loop", "1");
    return `https://player.vimeo.com/video/${v.id}?${q2}${start ? `#t=${start}s` : ""}`;
  }
  const q = new URLSearchParams({ id: v.id, autoplay: opts.autoplay ? "true" : "false", offerviewer: "true", showtitle: "true", showbrand: "false", captions: "false", interactivity: "all" });
  if (start) q.set("start", String(start));
  return `https://${v.host}/Panopto/Pages/Embed.aspx?${q}`;
}
function platformOrigin(v) {
  if (v.provider === "youtube") return "https://www.youtube-nocookie.com";
  if (v.provider === "vimeo") return "https://player.vimeo.com";
  return `https://${v.host}`;
}
const MAX = 8;
function startPlatformRelay(opts) {
  const outer = opts.frame;
  const doc = outer.ownerDocument;
  const win = doc.defaultView;
  const mounts = /* @__PURE__ */ new Map();
  const tell = (msg) => {
    try {
      outer.contentWindow?.postMessage({ target: "interactives", type: "platform", ...msg }, "*");
    } catch {
    }
  };
  const position = (m) => {
    const b = outer.getBoundingClientRect();
    const sx = outer.offsetWidth ? b.width / outer.offsetWidth : 1;
    const sy = outer.offsetHeight ? b.height / outer.offsetHeight : 1;
    const f = { left: b.left + outer.clientLeft * sx, top: b.top + outer.clientTop * sy, right: b.left + (outer.clientLeft + outer.clientWidth) * sx, bottom: b.top + (outer.clientTop + outer.clientHeight) * sy };
    const left = f.left + win.scrollX + m.rect.x * sx;
    const top = f.top + win.scrollY + m.rect.y * sy;
    const w = m.rect.w * sx;
    const h = m.rect.h * sy;
    const cl = Math.max(0, f.left - (left - win.scrollX));
    const ct = Math.max(0, f.top - (top - win.scrollY));
    const cr = Math.max(0, left - win.scrollX + w - f.right);
    const cb = Math.max(0, top - win.scrollY + h - f.bottom);
    const visible = m.shown && w > 2 && h > 2 && cl + cr < w && ct + cb < h;
    Object.assign(m.box.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${w}px`,
      height: `${h}px`,
      display: visible ? "block" : "none",
      clipPath: cl || ct || cr || cb ? `inset(${ct}px ${cr}px ${cb}px ${cl}px)` : "",
      borderRadius: m.radius ? `${m.radius * Math.min(sx, sy)}px` : ""
    });
  };
  const unmount = (key) => {
    const m = mounts.get(key);
    if (!m) return;
    m.box.remove();
    mounts.delete(key);
  };
  const heard = (e) => {
    for (const [key2, m2] of mounts) {
      if (e.source === m2.frame.contentWindow) {
        if (e.origin === platformOrigin(m2.video)) tell({ op: "event", key: key2, data: e.data });
        return;
      }
    }
    if (e.source !== outer.contentWindow) return;
    const d = e.data;
    if (!d || d.source !== "interactives-platform") return;
    const key = typeof d.key === "string" ? d.key.slice(0, 120) : "";
    if (d.op === "hello") {
      for (const k of [...mounts.keys()]) unmount(k);
      tell({ op: "hello" });
      return;
    }
    if (!key) return;
    if (d.op === "mount") {
      if (!validPlatformVideo(d.video) || mounts.size >= MAX && !mounts.has(key)) return;
      unmount(key);
      const o = d.opts && typeof d.opts === "object" ? d.opts : {};
      const video = { provider: d.video.provider, id: d.video.id, hash: d.video.hash, host: d.video.host, start: d.video.start };
      const box = doc.createElement("div");
      Object.assign(box.style, { position: "absolute", zIndex: "2147483000", overflow: "hidden", display: "none", background: "#000" });
      const frame = doc.createElement("iframe");
      frame.title = typeof d.title === "string" && d.title ? d.title.slice(0, 120) : "Video";
      frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      Object.assign(frame.style, { border: "0", width: "100%", height: "100%", display: "block" });
      frame.src = platformFrameUrl(video, win.location.origin, { controls: o.controls !== false, autoplay: o.autoplay === true, muted: o.muted === true, loop: o.loop === true });
      box.appendChild(frame);
      doc.body.appendChild(box);
      const m2 = { video, box, frame, held: [], rect: { x: 0, y: 0, w: 0, h: 0 }, radius: 0, shown: false };
      frame.addEventListener("load", () => {
        const held = m2.held ?? [];
        m2.held = null;
        for (const msg of held) frame.contentWindow?.postMessage(msg, platformOrigin(video));
      });
      mounts.set(key, m2);
      return;
    }
    const m = mounts.get(key);
    if (!m) return;
    if (d.op === "place") {
      const r = d.rect && typeof d.rect === "object" ? d.rect : {};
      const n = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
      m.rect = { x: n(r.x), y: n(r.y), w: Math.max(0, n(r.w)), h: Math.max(0, n(r.h)) };
      m.radius = Math.max(0, Math.min(200, n(d.radius)));
      m.shown = d.shown === true;
      position(m);
    } else if (d.op === "cmd") {
      if (m.held) {
        if (m.held.length < 50) m.held.push(d.msg);
        return;
      }
      try {
        m.frame.contentWindow?.postMessage(d.msg, platformOrigin(m.video));
      } catch {
      }
    } else if (d.op === "unmount") unmount(key);
  };
  const again = () => {
    for (const m of mounts.values()) position(m);
  };
  win.addEventListener("message", heard);
  win.addEventListener("scroll", again, true);
  win.addEventListener("resize", again);
  const watch = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
  watch?.observe(outer);
  return {
    place: again,
    stop() {
      win.removeEventListener("message", heard);
      win.removeEventListener("scroll", again, true);
      win.removeEventListener("resize", again);
      watch?.disconnect();
      for (const k of [...mounts.keys()]) unmount(k);
    }
  };
}
export {
  startPlatformRelay
};
