import{_,D as g,x as v}from"./index-CnlF_EcP.js";async function w(o){let i=u(await o),[e,r,{QuickJSWASMModule:t}]=await Promise.all([i.importModuleLoader().then(u),i.importFFI(),_(()=>import("./module-ES6BEMUI-DtDrHF3o.js"),[],import.meta.url).then(u)]),s=await e();s.type="sync";let n=new r(s);return new t(s,n)}function u(o){return o&&"default"in o&&o.default?o.default&&"default"in o.default&&o.default.default?o.default.default:o.default:o}function c(o){let i=typeof o=="number"?o:o.getTime();return function(){return Date.now()>i}}var S={type:"sync",importFFI:()=>_(()=>import("./ffi-Boa1QuFa.js"),[],import.meta.url).then(o=>o.QuickJSFFI),importModuleLoader:()=>_(()=>import("./emscripten-module.browser-XIKQQPVU-DxtMXd9O.js"),[],import.meta.url).then(o=>o.default)},b=S;const y=String.raw`
"use strict";
const __fns = new Map();
let __nextFn = 1;
const __pending = new Map();
const __call = (op, ...args) => {
  const r = __host(op, JSON.stringify(args));
  return r === undefined ? undefined : JSON.parse(r);
};
const __keep = (fn) => { const id = __nextFn++; __fns.set(id, fn); return id; };
globalThis.__dispatch = (id, json) => {
  const fn = __fns.get(id);
  if (fn) fn(...(json === undefined ? [] : JSON.parse(json)));
};
globalThis.__drop = (id) => __fns.delete(id);
globalThis.__resolve = (token, ok, json) => {
  const p = __pending.get(token);
  __pending.delete(token);
  if (!p) return;
  const v = json === undefined ? undefined : JSON.parse(json);
  ok ? p.resolve(v) : p.reject(new Error(String(v)));
};
const __await = (token) => new Promise((resolve, reject) => __pending.set(token, { resolve, reject }));

const __node = (info) => info && {
  id: info.id, name: info.name, type: info.type,
  get: (prop) => __call('nodeGet', info.id, prop),
  set: (prop, value) => __call('nodeSet', info.id, prop, value),
  show: () => __call('nodeSet', info.id, 'visible', true),
  hide: () => __call('nodeSet', info.id, 'visible', false),
  toggle: () => __call('nodeToggle', info.id),
  animate: (prop, to, options) => __await(__call('animate', info.id, prop, to, options || {})),
  element: undefined,
};
const __timeline = (name) => name && {
  name,
  play: () => __call('tl', name, 'play'),
  pause: () => __call('tl', name, 'pause'),
  stop: () => __call('tl', name, 'stop'),
  restart: () => __call('tl', name, 'restart'),
  reverse: () => __call('tl', name, 'reverse'),
  seek: (ms) => __call('tl', name, 'seek', ms),
  get time() { return __call('tlState', name).time; },
  get playing() { return __call('tlState', name).playing; },
};

globalThis.ix = {
  vars: new Proxy({}, {
    get: (_, k) => typeof k === 'string' ? __call('get', k) : undefined,
    set: (_, k, v) => { __call('set', k, v); return true; },
    has: (_, k) => __call('varNames').includes(k),
    ownKeys: () => __call('varNames'),
    getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: __call('get', k) }),
  }),
  get: (n) => __call('get', n),
  set: (n, v) => __call('set', n, v),
  node: (key) => __node(__call('node', key)),
  nodes: () => __call('nodes').map(__node),
  timeline: (key) => __timeline(__call('timeline', key)),
  goTo: (a, t, d) => __call('goTo', a, t, d),
  emit: (name, payload) => __call('emit', name, payload),
  on: (name, fn) => { const id = __keep(fn); __call('on', name, id); return () => { __call('off', id); __fns.delete(id); }; },
  onFrame: (fn) => { const id = __keep(fn); __call('onFrame', id); return () => { __call('off', id); __fns.delete(id); }; },
  get pointer() { return __call('pointer'); },
  get artboard() { return __call('artboard'); },
  get data() { return __call('data'); },
  loadData: (name, url) => __await(__call('loadData', name, url)),
  setData: (name, value) => __call('setData', name, value),
  setCursor: (c) => __call('setCursor', c),
  log: (...args) => __call('log', ...args.map((a) => { try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); } })),
};
globalThis.vars = ix.vars;
globalThis.console = { log: ix.log, info: ix.log, warn: ix.log, error: ix.log };
globalThis.setTimeout = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, false); return id; };
globalThis.setInterval = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, true); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { __call('clearTimer', id); __fns.delete(id); };
`+v+String.raw`
const __drawRt = __makeDrawRuntime(ix, vars);
globalThis.__drawCompile = (id, code, seed) => __drawRt.compile(id, code, seed);
globalThis.__drawFrame = (id, json) => __drawRt.frame(id, json);
globalThis.__drawDrop = (id) => { __drawRt.drop(id); return ''; };
`;function d(o){if(o!==void 0)try{return JSON.parse(JSON.stringify(o))}catch{return String(o)}}class p{constructor(i,e,r){this.ix=e,this.opts=r,this.nextToken=1,this.offs=new Map,this.timers=new Map,this.disposed=!1,this.runtime=i.newRuntime(),this.runtime.setMemoryLimit(r.memoryLimit),this.runtime.setMaxStackSize(1024*1024),this.vm=this.runtime.newContext();const t=this.vm.newFunction("__host",(s,n)=>{const l=this.vm.getString(s),a=JSON.parse(this.vm.getString(n));let m;try{m=this.handle(l,a)}catch(f){console.error(`[interactives sandbox] ${l} failed:`,f)}return m===void 0?this.vm.undefined:this.vm.newString(JSON.stringify(m))});this.vm.setProp(this.vm.global,"__host",t),t.dispose(),this.eval(y,"prelude")}nodeOf(i){return this.ix.node(String(i))}handle(i,e){const r=this.ix;switch(i){case"get":return d(r.get(String(e[0])));case"set":r.set(String(e[0]),e[1]);return;case"varNames":return Object.keys(r.vars);case"node":{const t=r.node(String(e[0]));return t?{id:t.id,name:t.name,type:t.type}:null}case"nodes":return r.nodes().map(t=>({id:t.id,name:t.name,type:t.type}));case"nodeGet":return d(this.nodeOf(e[0])?.get(String(e[1])));case"nodeSet":this.nodeOf(e[0])?.set(String(e[1]),e[2]);return;case"nodeToggle":this.nodeOf(e[0])?.toggle();return;case"animate":{const t=this.nextToken++,s=this.nodeOf(e[0]);return(s?s.animate(String(e[1]),e[2],e[3]??{}):Promise.resolve()).then(()=>this.settle(t,!0,void 0)),t}case"timeline":{const t=r.timeline(String(e[0]));return t?t.name:null}case"tl":{const t=r.timeline(String(e[0]));t&&typeof t[String(e[1])]=="function"&&t[String(e[1])](e[2]);return}case"tlState":{const t=r.timeline(String(e[0]));return{time:t?.time??0,playing:!!t?.playing}}case"goTo":r.goTo(String(e[0]),e[1],e[2]);return;case"emit":r.emit(String(e[0]),e[1]);return;case"on":{const t=Number(e[1]);this.offs.set(t,r.on(String(e[0]),s=>this.dispatch(t,[d(s)])));return}case"onFrame":{const t=Number(e[0]);this.offs.set(t,r.onFrame((s,n)=>this.dispatch(t,[s,n])));return}case"off":this.offs.get(Number(e[0]))?.(),this.offs.delete(Number(e[0]));return;case"pointer":return d(r.pointer);case"artboard":return d(r.artboard);case"data":return d(r.data);case"loadData":{const t=this.nextToken++;return r.loadData(String(e[0]),e[1]?String(e[1]):void 0).then(s=>this.settle(t,!0,d(s)),s=>this.settle(t,!1,String(s))),t}case"setData":r.setData(String(e[0]),e[1]);return;case"setCursor":r.setCursor(String(e[0]));return;case"log":r.log(...e);return;case"timer":{const t=Number(e[0]),s=Math.max(0,Number(e[1])||0),l=!!e[2]?setInterval(()=>this.dispatch(t,[]),Math.max(4,s)):setTimeout(()=>{this.timers.delete(t),this.dispatch(t,[]),this.callGlobal("__drop",[t])},s);this.timers.set(t,l);return}case"clearTimer":{const t=this.timers.get(Number(e[0]));t!==void 0&&(clearTimeout(t),clearInterval(t),this.timers.delete(Number(e[0])));return}default:console.warn(`[interactives sandbox] unknown op ${i}`);return}}callGlobal(i,e){if(this.disposed)return;const r=this.vm.getProp(this.vm.global,i),t=e.map(n=>n===void 0?this.vm.undefined:typeof n=="number"?this.vm.newNumber(n):typeof n=="boolean"?n?this.vm.true:this.vm.false:this.vm.newString(String(n)));this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const s=this.vm.callFunction(r,this.vm.undefined,...t);r.dispose();for(const n of t)n.alive&&n!==this.vm.undefined&&n!==this.vm.true&&n!==this.vm.false&&n.dispose();if(s.error){const n=this.vm.dump(s.error);s.error.dispose(),console.error("[interactives sandbox] script error:",n)}else s.value.dispose();this.pump()}dispatch(i,e){this.callGlobal("__dispatch",[i,JSON.stringify(e)])}settle(i,e,r){this.callGlobal("__resolve",[i,e,r===void 0?void 0:JSON.stringify(r)])}callString(i,e,r){if(this.disposed)throw new Error("The script sandbox was released.");const t=this.vm.getProp(this.vm.global,i),s=e.map(a=>typeof a=="number"?this.vm.newNumber(a):this.vm.newString(a));this.runtime.setInterruptHandler(c(Date.now()+r));const n=this.vm.callFunction(t,this.vm.undefined,...s);t.dispose();for(const a of s)a.dispose();if(n.error){const a=this.vm.dump(n.error);n.error.dispose();const m=typeof a=="string"?a:`${a?.name?`${a.name}: `:""}${a?.message??"failed"}`;throw new Error(/interrupted/i.test(m)?`The script ran for more than ${r} ms in one frame and was stopped (is there a loop that never ends?).`:m)}const l=this.vm.getString(n.value);return n.value.dispose(),l}drawRuntime(){return{compile:(i,e,r)=>this.callString("__drawCompile",[i,e,r],this.opts.timeLimitMs),frame:(i,e)=>this.callString("__drawFrame",[i,e],this.opts.drawTimeLimitMs),drop:i=>{this.disposed||this.callString("__drawDrop",[i],this.opts.timeLimitMs)}}}pump(){if(this.disposed)return;this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const i=this.runtime.executePendingJobs();if(i.error){const e=this.vm.dump(i.error);i.error.dispose(),console.error("[interactives sandbox] script error:",e)}}eval(i,e){this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const r=this.vm.evalCode(i,`${e}.js`);if(r.error){const t=this.vm.dump(r.error);r.error.dispose(),console.error(`[interactives sandbox] script "${e}" failed:`,t)}else r.value.dispose();this.pump()}run(i,e,r){const t=r.replace(/[^\w-]/g,"_");this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const s=this.vm.evalCode(`(async (event) => {
${i}
})(${JSON.stringify(d(e)??null)});`,`${t}.js`);if(s.error){const l=this.vm.dump(s.error);s.error.dispose(),console.error(`[interactives sandbox] script "${r}" failed:`,l);return}const n=this.vm.resolvePromise(s.value);s.value.dispose(),n.then(l=>{if(!this.disposed)if(l.error){const a=this.vm.dump(l.error);l.error.dispose(),console.error(`[interactives sandbox] script "${r}" failed:`,a)}else l.value.dispose()}),this.pump()}dispose(){if(!this.disposed){this.disposed=!0;for(const i of this.offs.values())i();for(const i of this.timers.values())clearTimeout(i),clearInterval(i);this.vm.dispose(),this.runtime.dispose()}}}class k{constructor(i,e){this.module=i,this.opts=e,this.bridges=new WeakMap}run(i,e,r,t){let s=this.bridges.get(e);s||(s=new p(this.module,e,this.opts),this.bridges.set(e,s)),s.run(i,r,t)}createDraw(i,e,r,t){let s=this.bridges.get(e);return s||(s=new p(this.module,e,this.opts),this.bridges.set(e,s)),new g(s.drawRuntime(),i,t)}release(i){this.bridges.get(i)?.dispose(),this.bridges.delete(i)}}let h=null;async function x(o={}){h??(h=w(b));const i=await h;return new k(i,{memoryLimit:o.memoryLimit??64*1024*1024,timeLimitMs:o.timeLimitMs??250,drawTimeLimitMs:o.drawTimeLimitMs??100})}export{k as SandboxScriptHost,x as createSandboxHost};
