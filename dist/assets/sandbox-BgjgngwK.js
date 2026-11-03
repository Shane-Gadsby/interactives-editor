import{_ as p,D as g,S as v,E as w,F as S}from"./index-Cl20l6AU.js";async function b(o){let r=_(await o),[e,i,{QuickJSWASMModule:t}]=await Promise.all([r.importModuleLoader().then(_),r.importFFI(),p(()=>import("./module-ES6BEMUI-DtDrHF3o.js"),[],import.meta.url).then(_)]),s=await e();s.type="sync";let n=new i(s);return new t(s,n)}function _(o){return o&&"default"in o&&o.default?o.default&&"default"in o.default&&o.default.default?o.default.default:o.default:o}function c(o){let r=typeof o=="number"?o:o.getTime();return function(){return Date.now()>r}}var y={type:"sync",importFFI:()=>p(()=>import("./ffi-Boa1QuFa.js"),[],import.meta.url).then(o=>o.QuickJSFFI),importModuleLoader:()=>p(()=>import("./emscripten-module.browser-XIKQQPVU-DxtMXd9O.js"),[],import.meta.url).then(o=>o.default)},k=y;const T=new Set(["play","pause","stop","restart","reverse","seek"]),M=String.raw`
"use strict";
const __fns = new Map();
let __nextFn = 1;
const __pending = new Map();
const __call = (op, ...args) => {
  const r = __host(op, JSON.stringify(args));
  // the host refused (a property scripts may not change): its message comes back after a NUL, as an error
  if (typeof r === 'string' && r.charCodeAt(0) === 0) throw new Error(r.slice(1));
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
`+S+String.raw`
const __drawRt = __makeDrawRuntime(ix, vars);
globalThis.__drawCompile = (id, code, seed) => __drawRt.compile(id, code, seed);
globalThis.__drawFrame = (id, json) => __drawRt.frame(id, json);
globalThis.__drawDrop = (id) => { __drawRt.drop(id); return ''; };
`;function d(o){if(o!==void 0)try{return JSON.parse(JSON.stringify(o))}catch{return String(o)}}class h{constructor(r,e,i){this.ix=e,this.opts=i,this.nextToken=1,this.offs=new Map,this.timers=new Map,this.disposed=!1,this.runtime=r.newRuntime(),this.runtime.setMemoryLimit(i.memoryLimit),this.runtime.setMaxStackSize(1024*1024),this.vm=this.runtime.newContext();const t=this.vm.newFunction("__host",(s,n)=>{const a=this.vm.getString(s),l=JSON.parse(this.vm.getString(n));let m;try{m=this.handle(a,l)}catch(u){if(u instanceof v)return this.vm.newString("\0"+u.message);console.error(`[interactives sandbox] ${a} failed:`,u)}return m===void 0?this.vm.undefined:this.vm.newString(JSON.stringify(m))});this.vm.setProp(this.vm.global,"__host",t),t.dispose(),this.eval(M,"prelude")}nodeOf(r){return this.ix.node(String(r))}handle(r,e){const i=this.ix;switch(r){case"get":return d(i.get(String(e[0])));case"set":i.set(String(e[0]),e[1]);return;case"varNames":return Object.keys(i.vars);case"node":{const t=i.node(String(e[0]));return t?{id:t.id,name:t.name,type:t.type}:null}case"nodes":return i.nodes().map(t=>({id:t.id,name:t.name,type:t.type}));case"nodeGet":return d(this.nodeOf(e[0])?.get(String(e[1])));case"nodeSet":this.nodeOf(e[0])?.set(String(e[1]),e[2]);return;case"nodeToggle":this.nodeOf(e[0])?.toggle();return;case"animate":{const t=this.nextToken++,s=this.nodeOf(e[0]);return(s?s.animate(String(e[1]),e[2],e[3]??{}):Promise.resolve()).then(()=>this.settle(t,!0,void 0)),t}case"timeline":{const t=i.timeline(String(e[0]));return t?t.name:null}case"tl":{const t=i.timeline(String(e[0]));t&&T.has(String(e[1]))&&t[String(e[1])](e[2]);return}case"tlState":{const t=i.timeline(String(e[0]));return{time:t?.time??0,playing:!!t?.playing}}case"goTo":i.goTo(String(e[0]),e[1],e[2]);return;case"emit":i.emit(String(e[0]),e[1]);return;case"on":{const t=Number(e[1]);this.offs.set(t,i.on(String(e[0]),s=>this.dispatch(t,[d(s)])));return}case"onFrame":{const t=Number(e[0]);this.offs.set(t,i.onFrame((s,n)=>this.dispatch(t,[s,n])));return}case"off":this.offs.get(Number(e[0]))?.(),this.offs.delete(Number(e[0]));return;case"pointer":return d(i.pointer);case"artboard":return d(i.artboard);case"data":return d(i.data);case"loadData":{const t=this.nextToken++,s=e[1]?String(e[1]):void 0;let n;try{s&&w(s,i.dataPolicy??{}),n=i.loadData(String(e[0]),s)}catch(a){n=Promise.reject(a)}return n.then(a=>this.settle(t,!0,d(a)),a=>this.settle(t,!1,String(a))),t}case"setData":i.setData(String(e[0]),e[1]);return;case"setCursor":i.setCursor(String(e[0]));return;case"log":i.log(...e);return;case"timer":{const t=Number(e[0]),s=Math.max(0,Number(e[1])||0),a=!!e[2]?setInterval(()=>this.dispatch(t,[]),Math.max(4,s)):setTimeout(()=>{this.timers.delete(t),this.dispatch(t,[]),this.callGlobal("__drop",[t])},s);this.timers.set(t,a);return}case"clearTimer":{const t=this.timers.get(Number(e[0]));t!==void 0&&(clearTimeout(t),clearInterval(t),this.timers.delete(Number(e[0])));return}default:console.warn(`[interactives sandbox] unknown op ${r}`);return}}callGlobal(r,e){if(this.disposed)return;const i=this.vm.getProp(this.vm.global,r),t=e.map(n=>n===void 0?this.vm.undefined:typeof n=="number"?this.vm.newNumber(n):typeof n=="boolean"?n?this.vm.true:this.vm.false:this.vm.newString(String(n)));this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const s=this.vm.callFunction(i,this.vm.undefined,...t);i.dispose();for(const n of t)n.alive&&n!==this.vm.undefined&&n!==this.vm.true&&n!==this.vm.false&&n.dispose();if(s.error){const n=this.vm.dump(s.error);s.error.dispose(),console.error("[interactives sandbox] script error:",n)}else s.value.dispose();this.pump()}dispatch(r,e){this.callGlobal("__dispatch",[r,JSON.stringify(e)])}settle(r,e,i){this.callGlobal("__resolve",[r,e,i===void 0?void 0:JSON.stringify(i)])}callString(r,e,i){if(this.disposed)throw new Error("The script sandbox was released.");const t=this.vm.getProp(this.vm.global,r),s=e.map(l=>typeof l=="number"?this.vm.newNumber(l):this.vm.newString(l));this.runtime.setInterruptHandler(c(Date.now()+i));const n=this.vm.callFunction(t,this.vm.undefined,...s);t.dispose();for(const l of s)l.dispose();if(n.error){const l=this.vm.dump(n.error);n.error.dispose();const m=typeof l=="string"?l:`${l?.name?`${l.name}: `:""}${l?.message??"failed"}`;throw new Error(/interrupted/i.test(m)?`The script ran for more than ${i} ms in one frame and was stopped (is there a loop that never ends?).`:m)}const a=this.vm.getString(n.value);return n.value.dispose(),a}drawRuntime(){return{compile:(r,e,i)=>this.callString("__drawCompile",[r,e,i],this.opts.timeLimitMs),frame:(r,e)=>this.callString("__drawFrame",[r,e],this.opts.drawTimeLimitMs),drop:r=>{this.disposed||this.callString("__drawDrop",[r],this.opts.timeLimitMs)}}}pump(){if(this.disposed)return;this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const r=this.runtime.executePendingJobs();if(r.error){const e=this.vm.dump(r.error);r.error.dispose(),console.error("[interactives sandbox] script error:",e)}}eval(r,e){this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const i=this.vm.evalCode(r,`${e}.js`);if(i.error){const t=this.vm.dump(i.error);i.error.dispose(),console.error(`[interactives sandbox] script "${e}" failed:`,t)}else i.value.dispose();this.pump()}run(r,e,i){const t=i.replace(/[^\w-]/g,"_");this.runtime.setInterruptHandler(c(Date.now()+this.opts.timeLimitMs));const s=this.vm.evalCode(`(async (event) => {
${r}
})(${JSON.stringify(d(e)??null)});`,`${t}.js`);if(s.error){const a=this.vm.dump(s.error);s.error.dispose(),console.error(`[interactives sandbox] script "${i}" failed:`,a);return}const n=this.vm.resolvePromise(s.value);s.value.dispose(),n.then(a=>{if(!this.disposed)if(a.error){const l=this.vm.dump(a.error);a.error.dispose(),console.error(`[interactives sandbox] script "${i}" failed:`,l)}else a.value.dispose()}),this.pump()}dispose(){if(!this.disposed){this.disposed=!0;for(const r of this.offs.values())r();for(const r of this.timers.values())clearTimeout(r),clearInterval(r);this.vm.dispose(),this.runtime.dispose()}}}class N{constructor(r,e){this.module=r,this.opts=e,this.bridges=new WeakMap}run(r,e,i,t){let s=this.bridges.get(e);s||(s=new h(this.module,e,this.opts),this.bridges.set(e,s)),s.run(r,i,t)}createDraw(r,e,i,t){let s=this.bridges.get(e);return s||(s=new h(this.module,e,this.opts),this.bridges.set(e,s)),new g(s.drawRuntime(),r,t)}release(r){this.bridges.get(r)?.dispose(),this.bridges.delete(r)}}let f=null;async function D(o={}){f??(f=b(k));const r=await f;return new N(r,{memoryLimit:o.memoryLimit??64*1024*1024,timeLimitMs:o.timeLimitMs??250,drawTimeLimitMs:o.drawTimeLimitMs??100})}export{N as SandboxScriptHost,D as createSandboxHost};
