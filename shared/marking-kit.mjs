/*! built from the player's marking sources 78cf08e8ec874f643081 */
const MAX_PATTERN = 300;
const MAX_UNBOUNDED = 3;
const MAX_WORK = 65536;
const INPUT_LIMITS = [1e4, 1e4, 1e3, 200];
class RegexRefused extends Error {
}
const newGroup = () => ({ multi: false, optional: 0, alternation: false, firsts: [], complex: false, atBranchStart: true, work: 1, starts: [], optionals: [], nextStarts: false });
const SAMPLE = [...Array.from({ length: 128 }, (_, i) => i), 160, 233, 305, 383, 8490, 945, 1046, 19968, 128512].map((c) => String.fromCodePoint(c));
const overlaps = /* @__PURE__ */ new Map();
function canShare(a, b, flags) {
  if (a.src === null || b.src === null) return true;
  const key = `${flags}/${a.src}/${b.src}`;
  let hit = overlaps.get(key);
  if (hit === void 0) {
    const f = flags.replace(/[gy]/g, "");
    try {
      const ra = new RegExp(`^(?:${a.src})$`, f);
      const rb = new RegExp(`^(?:${b.src})$`, f);
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
  const c = src[i];
  let min;
  let max;
  let end;
  if (c === "*") [min, max, end] = [0, Infinity, i + 1];
  else if (c === "+") [min, max, end] = [1, Infinity, i + 1];
  else if (c === "?") [min, max, end] = [0, 1, i + 1];
  else if (c === "{") {
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
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1] ?? "";
      if (/[1-9]/.test(n) || n === "k" && src[i + 2] === "<") throw new RegexRefused("backreferences (\\1, \\k<name>) are not allowed");
      const len = escapeLength(src, i);
      last = noteAtom(/[a-zA-Z0-9]/.test(n) ? null : n, /^\\[bB]/.test(src.slice(i, i + 2)) ? null : src.slice(i, i + len));
      i += len;
    } else if (c === "[") {
      let j = i + 1;
      if (src[j] === "^") j++;
      for (let depth = 0; j < src.length && (src[j] !== "]" || depth > 0); j++) {
        if (src[j] === "\\") j++;
        else if (nestedClasses && src[j] === "[") depth++;
        else if (nestedClasses && src[j] === "]") depth--;
      }
      last = noteAtom(null, src.slice(i, j + 1));
      i = j + 1;
    } else if (c === "(") {
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
    } else if (c === ")") {
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
    } else if (c === "|") {
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
          for (const o of g.optionals) if (g.starts.some((f) => f !== o && canShare(o, f, flags))) throw new RegexRefused("a repeated group has an optional part that could also start it, like (\\d\\d?)+");
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
        if (c === "^" || c === "$") {
          cur.complex = true;
          last = { atom: { src: null } };
        } else last = noteAtom(c === "." ? null : c, c === "." ? "." : c.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"));
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
function safeRegExp(source, flags = "") {
  assertSafePattern(source, flags);
  return new RegExp(source, flags);
}
class RegexBudget extends RegexRefused {
}
const STEP_BUDGET = 3e5;
const WINDOW_STEPS = 4e6;
const WINDOW_MS = 250;
const MAX_PROGRAM = 4e3;
const MAX_STATES = 6e6;
const isWord = (c) => c >= 48 && c <= 57 || c >= 65 && c <= 90 || c === 95 || c >= 97 && c <= 122;
const isDigit = (c) => c >= 48 && c <= 57;
const isSpace = (c) => c === 32 || c >= 9 && c <= 13 || c === 160 || c === 5760 || c >= 8192 && c <= 8202 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
const isLine = (c) => c === 10 || c === 13 || c === 8232 || c === 8233;
const propCache = /* @__PURE__ */ new Map();
function property(name, negated) {
  const key = (negated ? "P" : "p") + name;
  let f = propCache.get(key);
  if (!f) {
    const re = new RegExp(`^\\${negated ? "P" : "p"}{${name}}$`, "u");
    const memo = /* @__PURE__ */ new Map();
    f = (cp) => {
      let v = memo.get(cp);
      if (v === void 0) {
        v = re.test(String.fromCodePoint(cp));
        if (memo.size > 4e3) memo.clear();
        memo.set(cp, v);
      }
      return v;
    };
    propCache.set(key, f);
  }
  return f;
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
    const c = peek();
    const capStart = ncap;
    let node2;
    let quantifiable = true;
    if (c === "^") {
      p++;
      return { t: "assert", k: "bol" };
    } else if (c === "$") {
      p++;
      return { t: "assert", k: "eol" };
    } else if (c === "(") {
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
    } else if (c === ".") {
      p++;
      node2 = { t: "any" };
    } else if (c === "[") {
      p++;
      node2 = { t: "class", cls: classBody() };
    } else if (c === "\\") {
      p++;
      const e = escape(false);
      if (typeof e === "object" && "assert" in e) return { t: "assert", k: e.assert };
      node2 = typeof e === "number" ? { t: "char", c: e } : { t: "class", cls: e };
    } else if (c === "*" || c === "+" || c === "?") {
      return refuse("nothing to repeat");
    } else if (c === "{" && !u && braces() === null) {
      p++;
      node2 = { t: "char", c: 123 };
    } else if (c === "{" && !u) {
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
    const c = src[p++];
    switch (c) {
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
        if (!u) return c.charCodeAt(0);
        const end = src.indexOf("}", p);
        const name = src.slice(p + 1, end);
        p = end + 1;
        return { test: property(name, c === "P") };
      }
      case "k":
        return hasNamed ? refuse("named backreferences") : 107;
      default:
        if (c >= "1" && c <= "9") return refuse("backreferences");
        if (c === "-" && !inClass && u) return 45;
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
  const c = up.charCodeAt(0);
  return cp >= 128 && c < 128 ? cp : c;
}
function compileProgram(source, flagText) {
  const f = { g: flagText.includes("g"), y: flagText.includes("y"), d: flagText.includes("d"), i: flagText.includes("i"), m: flagText.includes("m"), s: flagText.includes("s"), u: flagText.includes("u") };
  const { node, ncap, names } = parse(source, f);
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
        if (f.i) {
          const c = canon(n.c, f.u);
          const s = String.fromCodePoint(n.c);
          if (s.toLowerCase() !== s.toUpperCase()) {
            const lo = s.toLowerCase();
            const up = s.toUpperCase();
            if (lo.length === s.length && up.length === s.length) {
              classes.push({ test: (cp) => cp === n.c || canon(cp, f.u) === c });
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
          widths.set(at, widthOf(n.node, f.u));
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
        const canBeEmpty = widthOf(n.node, f.u)[0] === 0;
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
  if (!f.i && op[1] === 0 && a[1] <= 65535) first = a[1];
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
    ...f,
    first,
    widths
  };
}
const programs = /* @__PURE__ */ new Map();
function compile(source, flags) {
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
  const t = now();
  if (t - windowStart > WINDOW_MS) {
    windowStart = t;
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
  const ctx = { prog, text, n, width, caps, target: -1 };
  try {
    for (let s = from; s <= n; ) {
      if (!sticky && prog.first >= 0) {
        const at = text.indexOf(String.fromCharCode(prog.first), s);
        if (at < 0) break;
        s = at;
      }
      if (run(ctx, 0, s, gen)) return caps;
      if (sticky) break;
      s += prog.u && s < n && text.codePointAt(s) > 65535 ? 2 : 1;
    }
    return null;
  } finally {
    charge(steps);
    if (visited.length > 6e5) visited = new Uint32Array(0);
  }
}
function run(ctx, startPc, startPos, gen) {
  const { prog, text, n, width, caps } = ctx;
  const { op, a, b, encl } = prog;
  const base = stackBase;
  let sp = base;
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
  while (sp > base) {
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
          const c = a[pc];
          if (c > 65535) {
            if (text.codePointAt(pos) !== c) break thread;
            pos += 2;
          } else {
            if (text.charCodeAt(pos) !== c) break thread;
            pos++;
          }
          pc++;
          break;
        }
        case 1: {
          if (pos >= n) break thread;
          const c = unicode ? text.codePointAt(pos) : text.charCodeAt(pos);
          if (!prog.s && isLine(c)) break thread;
          pos += c > 65535 ? 2 : 1;
          pc++;
          break;
        }
        case 2: {
          if (pos >= n) break thread;
          const c = unicode ? text.codePointAt(pos) : text.charCodeAt(pos);
          if (!prog.classes[a[pc]].test(c)) break thread;
          pos += c > 65535 ? 2 : 1;
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
          const saveTarget = ctx.target;
          let ok = false;
          try {
            if (!behind) {
              ctx.target = -1;
              ok = run(ctx, pc + 1, pos, nextGen());
            } else {
              const [lo, hi] = prog.widths.get(pc);
              ctx.target = pos;
              const g = nextGen();
              for (let s = pos - lo; s >= 0 && (hi === Infinity || s >= pos - hi); s--) {
                if (run(ctx, pc + 1, s, g)) {
                  ok = true;
                  break;
                }
              }
            }
          } finally {
            stackBase = base;
            ctx.target = saveTarget;
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
          if (ctx.target >= 0 && pos !== ctx.target) break thread;
          return true;
        case 13:
          return true;
      }
    }
  }
  return false;
}
let stackBase = 0;
const progOf = (re) => compile(re.source, re.flags);
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
const isMultiple = (q) => q.kind === "multiple" || q.kind === "hotspot" && (q.multi ?? q.options.filter((o) => o.correct).length > 1);
function newQuestion(kind, prefix = "q1") {
  const base = {
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
      return { ...base, prompt: "Which of these is a prime number?", options: opts(["9", "11", "15", "21"], [1]), hints: ["It has exactly two factors: 1 and itself."] };
    case "multiple":
      return { ...base, prompt: "Which of these are fruits? Choose all that apply.", options: opts(["Apple", "Carrot", "Banana", "Potato"], [0, 2]) };
    case "truefalse":
      return { ...base, prompt: "The Pacific is the largest ocean on Earth.", options: [{ id: "o1", text: "True", correct: true }, { id: "o2", text: "False" }] };
    case "blank":
      return { ...base, prompt: "Complete the sentence.", blanks: [{ id: "b1", label: "The capital of France is", answers: ["Paris"] }] };
    case "ordering":
      return { ...base, prompt: "Put these steps of the water cycle in order.", shuffle: true, options: opts(["Evaporation", "Condensation", "Precipitation", "Collection"], []) };
    case "matching":
      return {
        ...base,
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
        ...base,
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
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, d = "") => typeof v === "string" ? v : d;
const num = (v, d, lo = -Infinity, hi = Infinity) => typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
function normaliseQuestion(raw) {
  if (!isObj(raw)) return null;
  const kind = QUESTION_KINDS.some((k) => k.value === raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const d = newQuestion(kind);
  const list = (v, max) => Array.isArray(v) ? v.filter(isObj).slice(0, max) : [];
  const options = list(raw.options, MAX_OPTIONS).map((o, i) => ({
    id: str(o.id) || `o${i + 1}`,
    text: str(o.text),
    ...o.correct === true ? { correct: true } : {},
    ...str(o.feedback) ? { feedback: str(o.feedback) } : {},
    ...o.fixed === true ? { fixed: true } : {}
  }));
  const blanks = list(raw.blanks, MAX_BLANKS).map((b, i) => ({
    id: str(b.id) || `b${i + 1}`,
    label: str(b.label),
    answers: (Array.isArray(b.answers) ? b.answers : []).filter((a) => typeof a === "string").slice(0, 40),
    ...b.caseSensitive === true ? { caseSensitive: true } : {},
    ...typeof b.tolerance === "number" && Number.isFinite(b.tolerance) && b.tolerance > 0 ? { tolerance: b.tolerance } : {}
  }));
  const pairs = list(raw.pairs, MAX_PAIRS).map((pr, i) => ({ id: str(pr.id) || `p${i + 1}`, term: str(pr.term), match: str(pr.match) }));
  const bank = isObj(raw.bank) && str(raw.bank.items).trim() ? { items: str(raw.bank.items), order: raw.bank.order === "sequence" ? "sequence" : "random" } : null;
  return {
    kind,
    prefix: isIdentifier(str(raw.prefix)) ? str(raw.prefix) : d.prefix,
    prompt: str(raw.prompt),
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
    feedbackCorrect: str(raw.feedbackCorrect),
    feedbackPartial: str(raw.feedbackPartial),
    feedbackIncorrect: str(raw.feedbackIncorrect),
    feedbackOutOfTries: str(raw.feedbackOutOfTries),
    reveal: raw.reveal !== false,
    bank,
    ...typeof raw.spoken === "string" && raw.spoken.trim() ? { spoken: raw.spoken.slice(0, 2e3) } : {},
    ...typeof raw.explain === "string" && raw.explain.trim() ? { explain: raw.explain.slice(0, 2e3) } : {},
    ...raw.numberKeys === true ? { numberKeys: true } : {},
    ...raw.listen === true ? { listen: true } : {},
    ...raw.report === "complete" || raw.report === "progress" ? { report: raw.report } : {},
    ...raw.serverMarked === true ? { serverMarked: true } : {},
    ...raw.answersOnServer === true ? { answersOnServer: true } : {},
    ...raw.multi === true ? { multi: true } : {},
    ...typeof raw.hintTotal === "number" && Number.isFinite(raw.hintTotal) && raw.hintTotal > 0 ? { hintTotal: Math.min(MAX_HINTS, Math.floor(raw.hintTotal)) } : {}
  };
}
function shuffled(list, rng, fixed = () => false) {
  const out = list.slice();
  const free = out.map((_x, i) => i).filter((i) => !fixed(out[i]));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = free[i];
    const b = free[j];
    [out[a], out[b]] = [out[b], out[a]];
  }
  return out;
}
function buildItems(q, random = Math.random) {
  if (q.kind === "blank") {
    return q.blanks.map((b, i) => ({ id: b.id, text: "", label: b.label, number: i + 1, selected: false, state: "" }));
  }
  if (q.kind === "matching") {
    return q.pairs.map((p, i) => ({ id: p.id, text: p.term, label: p.match, number: i + 1, selected: false, state: "" }));
  }
  let list = q.options;
  if (q.kind === "ordering") {
    if (q.shuffle && list.length > 1) {
      let tries = 0;
      let mixed = shuffled(list, random);
      while (tries++ < 8 && mixed.every((o, i) => o.id === list[i].id)) mixed = shuffled(list, random);
      if (mixed.every((o, i) => o.id === list[i].id)) mixed = [...list.slice(1), list[0]];
      list = mixed;
    }
  } else if (q.shuffle && q.kind !== "truefalse" && q.kind !== "hotspot") list = shuffled(list, random, (o) => !!o.fixed);
  return list.map((o, i) => ({ id: o.id, text: o.text, number: i + 1, selected: false, state: "" }));
}
function tidyAnswer(s, caseSensitive = false) {
  const t = s.normalize("NFC").replace(/\s+/g, " ").trim();
  return caseSensitive ? t : t.toLowerCase();
}
const asNumber = (s) => {
  const t = s.replace(/,/g, "").trim();
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
function blankMatches(typed, blank) {
  const cs = !!blank.caseSensitive;
  const got = tidyAnswer(typed, cs);
  if (!got) return false;
  const gotNum = asNumber(got);
  for (const accepted of blank.answers) {
    const pat = /^\/(.+)\/([a-z]*)$/.exec(accepted.trim());
    if (pat) {
      try {
        if (linearExec(safeRegExp(pat[1], pat[2]), typed.trim())) return true;
      } catch {
      }
      continue;
    }
    const want = tidyAnswer(accepted, cs);
    if (!want) continue;
    if (want === got) return true;
    const wantNum = asNumber(want);
    if (wantNum !== null && gotNum !== null && Math.abs(wantNum - gotNum) <= Math.max(0, blank.tolerance ?? 0) + 1e-12) return true;
  }
  return false;
}
function gradeChoice(q, selected) {
  const right = new Set(q.options.filter((o) => o.correct).map((o) => o.id));
  const picked = new Set(selected);
  const states = {};
  let hit = 0;
  let miss = 0;
  for (const o of q.options) {
    const on = picked.has(o.id);
    const ok = right.has(o.id);
    if (on && ok) {
      hit++;
      states[o.id] = "correct";
    } else if (on) {
      miss++;
      states[o.id] = "wrong";
    } else if (ok) states[o.id] = "missed";
    else states[o.id] = "";
  }
  let correct;
  const several = isMultiple(q);
  if (several) correct = right.size > 0 && miss === 0 && hit === right.size;
  else correct = picked.size === 1 && hit === 1;
  const fraction = correct ? 1 : q.partial && several && right.size ? Math.max(0, (hit - miss) / right.size) : 0;
  return { correct, fraction, states };
}
function gradeOrdering(q, order) {
  const states = {};
  let hit = 0;
  q.options.forEach((o, i) => {
    const ok = order[i] === o.id;
    if (ok) hit++;
    states[o.id] = ok ? "correct" : "wrong";
  });
  const n = q.options.length;
  const correct = n > 0 && hit === n && order.length === n;
  return { correct, fraction: correct ? 1 : q.partial && n ? hit / n : 0, states };
}
function gradeMatching(q, placed) {
  const states = {};
  let hit = 0;
  for (const p of q.pairs) {
    const ok = placed[p.id] === p.id;
    if (ok) hit++;
    states[p.id] = ok ? "correct" : "wrong";
  }
  const n = q.pairs.length;
  const correct = n > 0 && hit === n;
  return { correct, fraction: correct ? 1 : q.partial && n ? hit / n : 0, states };
}
function gradeBlanks(q, values) {
  const states = {};
  let hit = 0;
  q.blanks.forEach((b, i) => {
    const ok = blankMatches(values[i] ?? "", b);
    if (ok) hit++;
    states[b.id] = ok ? "correct" : "wrong";
  });
  const n = q.blanks.length;
  const correct = n > 0 && hit === n;
  return { correct, fraction: correct ? 1 : q.partial && n ? hit / n : 0, states };
}
function scoreFor(q, fraction, attempts, hintsUsed) {
  const factor = Math.min(1, Math.max(0, 1 - q.attemptPenalty * Math.max(0, attempts - 1) - q.hintPenalty * hintsUsed));
  return Math.round(q.points * fraction * factor * 100) / 100;
}
function nothingToCheck(q, a) {
  if (q.kind === "blank") return (a.values ?? []).some((v) => v.trim()) ? null : "Type an answer first.";
  if (q.kind === "ordering") return null;
  if (q.kind === "matching") return q.pairs.some((p) => a.placed?.[p.id]) ? null : "Drag at least one item into place first.";
  if (a.selected?.length) return null;
  return q.kind === "hotspot" ? "Click the picture first." : q.kind === "multiple" ? "Choose at least one option first." : "Choose an answer first.";
}
function markAnswer(q, a, prior) {
  let grade;
  let chosen = [];
  let placedPairs = 0;
  if (q.kind === "blank") {
    grade = gradeBlanks(q, a.values ?? []);
  } else if (q.kind === "ordering") {
    grade = gradeOrdering(q, a.order ?? []);
  } else if (q.kind === "matching") {
    const placed = a.placed ?? {};
    grade = gradeMatching(q, placed);
    placedPairs = q.pairs.filter((p) => placed[p.id] === p.id).length;
  } else {
    const selected = a.selected ?? [];
    grade = gradeChoice(q, selected);
    chosen = q.options.filter((o) => selected.includes(o.id));
  }
  const attempts = prior.attempts + 1;
  const outOfTries = !grade.correct && q.attempts > 0 && attempts >= q.attempts;
  const locked = grade.correct || outOfTries;
  const part = !grade.correct && grade.fraction > 0 && q.feedbackPartial.trim();
  const generic = grade.correct ? q.feedbackCorrect : outOfTries && q.feedbackOutOfTries.trim() ? q.feedbackOutOfTries : part ? q.feedbackPartial : q.feedbackIncorrect;
  const extra = chosen.map((o) => o.feedback?.trim()).filter(Boolean)[0] ?? "";
  const count = q.kind === "matching" && !grade.correct ? `${placedPairs} of ${q.pairs.length} matched correctly.` : "";
  const reveal = locked && q.reveal && !grade.correct;
  const m = {
    correct: grade.correct,
    fraction: grade.fraction,
    attempts,
    locked,
    triesLeft: q.attempts > 0 ? Math.max(0, q.attempts - attempts) : -1,
    score: scoreFor(q, grade.fraction, attempts, prior.hintsUsed),
    feedback: [generic.trim(), extra, count].filter(Boolean).join(" "),
    states: {},
    reveal,
    chosen: chosen.map((o) => o.id),
    placedPairs
  };
  if (!locked) return m;
  for (const [id, s] of Object.entries(grade.states)) m.states[id] = s === "missed" && !reveal ? "" : s;
  if (q.kind === "blank" && reveal) {
    m.answers = {};
    q.blanks.forEach((b) => {
      if (grade.states[b.id] === "wrong") m.answers[b.id] = b.answers.find((x) => !/^\/.+\/[a-z]*$/.test(x.trim())) ?? "";
    });
  }
  if (q.kind === "ordering" && reveal) m.order = q.options.map((o) => o.id);
  return m;
}
function serverMarkingProblem(q) {
  if (q.kind === "matching") return "Matching questions are marked in the page: which term belongs in which slot is part of how the layers are set up, so it cannot be taken out of what the learner downloads.";
  if (q.bank) return "Questions drawn from a data bank are marked in the page: the bank is data the learner downloads with the project.";
  return null;
}
function stripQuestion(q, frameId, idFor) {
  const ordering = q.kind === "ordering";
  let options = q.options.map((o) => ({ id: ordering ? idFor(frameId, o.id) : o.id, text: o.text, ...o.fixed && !ordering ? { fixed: true } : {} }));
  if (ordering) {
    options.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (options.length > 1 && options.every((o, i) => o.id === idFor(frameId, q.options[i].id))) options = [...options.slice(1), options[0]];
  }
  const out = {
    ...q,
    options,
    blanks: q.blanks.map((b) => ({ id: b.id, label: b.label, answers: [] })),
    hints: [],
    hintTotal: q.hints.length,
    feedbackCorrect: "",
    feedbackPartial: "",
    feedbackIncorrect: "",
    feedbackOutOfTries: "",
    answersOnServer: true
  };
  if (!q.hints.length) delete out.hintTotal;
  delete out.explain;
  if (q.kind === "hotspot") out.multi = isMultiple(q);
  return out;
}
function stripProject(project, idFor) {
  const out = { questions: {}, skipped: [] };
  const visit = (nodes) => {
    for (const n of nodes ?? []) {
      if (n.type === "frame" && n.question && n.question.serverMarked === true && typeof n.id === "string") {
        const q = n.question;
        const problem = serverMarkingProblem(q) ?? (out.questions[n.id] ? "Two layers have the same id." : null);
        if (problem) out.skipped.push({ frame: n.id, name: n.name ?? n.id, reason: problem });
        else {
          out.questions[n.id] = JSON.parse(JSON.stringify(q));
          const stripped = stripQuestion(q, n.id, idFor);
          n.question = stripped;
          if (q.kind === "ordering") {
            const v = project.variables.find((x) => x.name === `${q.prefix}_items`);
            if (v) v.initial = JSON.stringify(buildItems(stripped, () => 0.5));
          }
        }
      }
      visit(n.children);
    }
  };
  for (const ab of project.artboards) visit(ab.children);
  return out;
}
const shortText = (v, max) => typeof v === "string" && v.length <= max ? v : null;
function cleanMarkRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body;
  if (b.action !== "check" && b.action !== "hint" && b.action !== "reset") return null;
  const question = shortText(b.question, 100);
  if (!question) return null;
  const req = { action: b.action, question };
  if (b.action === "check") {
    const a = b.answer;
    if (!a || typeof a !== "object" || Array.isArray(a)) return null;
    const ans = a;
    const strings = (v, max, len) => {
      if (v === void 0) return void 0;
      if (!Array.isArray(v) || v.length > max) return null;
      const list = [];
      for (const x of v) {
        const s = shortText(x, len);
        if (s === null) return null;
        list.push(s);
      }
      return list;
    };
    const selected = strings(ans.selected, MAX_OPTIONS, 100);
    const order = strings(ans.order, MAX_OPTIONS, 100);
    const values = strings(ans.values, MAX_BLANKS, 1e3);
    if (selected === null || order === null || values === null) return null;
    req.answer = { ...selected ? { selected } : {}, ...order ? { order } : {}, ...values ? { values } : {} };
  }
  return req;
}
const freshState = (round = 1, counted = null) => ({ round, attempts: 0, hints: 0, locked: false, correct: false, score: 0, last: null, counted });
const round2 = (n) => Math.round(n * 100) / 100;
function resultOf(key, states) {
  let score = 0;
  let max = 0;
  let done = 0;
  const ids = Object.keys(key.questions);
  for (const id of ids) {
    max += key.questions[id].points;
    const c = states[id]?.counted;
    if (c) {
      score += c.score;
      done++;
    }
  }
  score = round2(score);
  const percent = max > 0 ? round2(Math.min(100, Math.max(0, score / max * 100))) : 0;
  return { completed: ids.length > 0 && done === ids.length, score, max: round2(max), passed: key.passMark !== null && Number.isFinite(key.passMark) ? percent >= key.passMark : null };
}
const viewOf = (q, st) => ({
  attempts: st.attempts,
  triesLeft: q.attempts > 0 ? Math.max(0, q.attempts - st.attempts) : -1,
  hintsUsed: st.hints,
  hintsLeft: Math.max(0, q.hints.length - st.hints),
  locked: st.locked,
  score: st.score,
  correct: st.correct,
  answered: st.attempts > 0
});
function realAnswer(q, frameId, a, idFor) {
  if (q.kind === "blank") {
    const given = a.values ?? [];
    if (given.length > q.blanks.length) return null;
    return { values: q.blanks.map((_, i) => given[i] ?? "") };
  }
  if (q.kind === "ordering") {
    const back = new Map(q.options.map((o) => [idFor(frameId, o.id), o.id]));
    const order = a.order ?? [];
    if (order.length !== q.options.length) return null;
    const real = order.map((id) => back.get(id));
    if (real.some((id) => id === void 0) || new Set(real).size !== real.length) return null;
    return { order: real };
  }
  const known = new Set(q.options.map((o) => o.id));
  const selected = [...new Set(a.selected ?? [])];
  if (selected.some((id) => !known.has(id))) return null;
  return { selected };
}
function markingForPage(q, frameId, m, idFor) {
  if (q.kind !== "ordering") return m;
  const states = {};
  for (const [id, s] of Object.entries(m.states)) states[idFor(frameId, id)] = s;
  return { ...m, states, ...m.order ? { order: m.order.map((id) => idFor(frameId, id)) } : {} };
}
function stepMarking(key, states, req, idFor) {
  const q = key.questions[req.question];
  if (!q) return { error: "That question is not marked on the server" };
  const st = states[req.question] ?? freshState();
  const put = (next2) => ({ ...states, [req.question]: next2 });
  if (req.action === "reset") {
    const next2 = st.locked ? freshState(st.round + 1, st.counted) : st;
    return { reply: { status: "ok", state: viewOf(q, next2) }, states: next2 === st ? states : put(next2) };
  }
  if (req.action === "hint") {
    if (st.locked || st.hints >= q.hints.length) return { reply: { status: "ok", hint: "", state: viewOf(q, st) }, states };
    const next2 = { ...st, hints: st.hints + 1 };
    return { reply: { status: "ok", hint: q.hints[st.hints], state: viewOf(q, next2) }, states: put(next2) };
  }
  if (st.locked && st.last) return { reply: { status: "ok", marking: markingForPage(q, req.question, st.last, idFor), replay: true, state: viewOf(q, st) }, states };
  const answer = req.answer ? realAnswer(q, req.question, req.answer, idFor) : null;
  if (!answer) return { error: "That answer does not fit the question" };
  const nothing = nothingToCheck(q, answer);
  if (nothing) return { reply: { status: "empty", say: nothing, state: viewOf(q, st) }, states };
  const m = markAnswer(q, answer, { attempts: st.attempts, hintsUsed: st.hints });
  const first = m.locked && !st.counted;
  const next = { ...st, attempts: m.attempts, correct: m.correct, score: m.score, locked: m.locked, last: m.locked ? m : null, counted: first ? { score: m.score, points: q.points } : st.counted };
  return { reply: { status: "ok", marking: markingForPage(q, req.question, m, idFor), state: viewOf(q, next) }, states: put(next), ...first ? { counted: true } : {} };
}
function parseStates(raw) {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : null;
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function pruneStates(key, states) {
  const out = {};
  for (const id of Object.keys(states)) if (key.questions[id]) out[id] = states[id];
  return out;
}
const MARK_RATE = { max: 30, windowMs: 6e4 };
const RATE_LIMITED = ["check", "hint"];
function makeLimiter(max = MARK_RATE.max, windowMs = MARK_RATE.windowMs) {
  const seen = /* @__PURE__ */ new Map();
  return {
    take(key, now2) {
      const recent = (seen.get(key) ?? []).filter((t) => now2 - t < windowMs);
      if (recent.length >= max) {
        seen.set(key, recent);
        return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now2 - recent[0])) / 1e3)) };
      }
      recent.push(now2);
      seen.set(key, recent);
      if (seen.size > 5e3) {
        for (const [k, list] of seen) if (!list.length || now2 - list[list.length - 1] >= windowMs) seen.delete(k);
      }
      return { ok: true };
    }
  };
}
export {
  MARK_RATE,
  RATE_LIMITED,
  cleanMarkRequest,
  makeLimiter,
  normaliseQuestion,
  parseStates,
  pruneStates,
  resultOf,
  stepMarking,
  stripProject
};
