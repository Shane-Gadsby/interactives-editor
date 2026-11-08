import{_ as p,$ as f,a0 as v,a1 as S,a2 as y,a3 as b}from"./index-RZKhjL0-.js";async function w(o){let s=_(await o),[e,t,{QuickJSWASMModule:r}]=await Promise.all([s.importModuleLoader().then(_),s.importFFI(),p(()=>import("./module-ES6BEMUI-DtDrHF3o.js"),[],import.meta.url).then(_)]),n=await e();n.type="sync";let i=new t(n);return new r(n,i)}function _(o){return o&&"default"in o&&o.default?o.default&&"default"in o.default&&o.default.default?o.default.default:o.default:o}function u(o){let s=typeof o=="number"?o:o.getTime();return function(){return Date.now()>s}}var k={type:"sync",importFFI:()=>p(()=>import("./ffi-Boa1QuFa.js"),[],import.meta.url).then(o=>o.QuickJSFFI),importModuleLoader:()=>p(()=>import("./emscripten-module.browser-XIKQQPVU-DxtMXd9O.js"),[],import.meta.url).then(o=>o.default)},T=k;const I=new Set(["play","pause","stop","restart","reverse","seek"]),x=String.raw`
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
  report: (o) => __call('report', o),
  record: (n, v) => __call('record', n, v),
  startOver: () => __call('startOver'),
  reset: (...names) => __call('reset', names),
  toggleItem: (name, value) => __call('toggleItem', name, value),
  removeValue: (name, value) => __call('removeValue', name, value),
  setItem: (name, index, value, field) => __call('setItem', name, index, value, field),
  get result() { return __call('result'); },
  setInstanceInput: (layer, name, value) => __call('setInstanceInput', layer, name, value),
  getInstanceInput: (layer, name) => __call('getInstanceInput', layer, name),
  fireInstanceTrigger: (layer, name, payload) => __call('fireInstanceTrigger', layer, name, payload),
  emit: (name, payload) => __call('emit', name, payload),
  announce: (text, politeness) => __call('announce', text, politeness),
  speech: {
    say: (text, o) => __await(__call('speechSay', text, o || {})),
    stop: () => __call('speechDo', 'stop'),
    pause: () => __call('speechDo', 'pause'),
    resume: () => __call('speechDo', 'resume'),
    repeat: () => __await(__call('speechSay')),
    get available() { return __call('speechState').available; },
    get speaking() { return __call('speechState').speaking; },
    get paused() { return __call('speechState').paused; },
    get rate() { return __call('speechState').rate; },
    setRate: (r) => __call('speechDo', 'setRate', r),
  },
  soundPlaying: (which) => __call('soundPlaying', which),
  soundsPlaying: () => __call('soundsPlaying'),
  setTheme: (name) => __call('setTheme', name),
  getTheme: () => __call('getTheme'),
  themes: () => __call('themes'),
  steps: {
    get step() { return __call('stepsState').step; },
    get count() { return __call('stepsState').count; },
    get title() { return __call('stepsState').title; },
    get caption() { return __call('stepsState').caption; },
    get moving() { return __call('stepsState').moving; },
    next: () => __call('stepsDo', 'next'),
    back: () => __call('stepsDo', 'back'),
    first: () => __call('stepsDo', 'first'),
    last: () => __call('stepsDo', 'last'),
    goTo: (n) => __call('stepsDo', 'goTo', n),
  },
  on: (name, fn) => { const id = __keep(fn); __call('on', name, id); return () => { __call('off', id); __fns.delete(id); }; },
  onFrame: (fn) => { const id = __keep(fn); __call('onFrame', id); return () => { __call('off', id); __fns.delete(id); }; },
  get pointer() { return __call('pointer'); },
  get artboard() { return __call('artboard'); },
  get data() { return __call('data'); },
  get context() { return __call('context'); },
  loadData: (name, url) => __await(__call('loadData', name, url)),
  setData: (name, value) => __call('setData', name, value),
  setCursor: (c) => __call('setCursor', c),
  drag: {
    zoneOf: (layer) => __call('dragZoneOf', layer),
    contents: (zone) => __call('dragContents', zone),
    state: () => __call('dragState'),
    put: (layer, zone) => __call('dragPut', layer, zone),
    reset: (layer) => __call('dragReset', layer),
    enable: (layer, on) => __call('dragEnable', layer, on),
  },
  log: (...args) => __call('log', ...args.map((a) => { try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); } })),
};
globalThis.vars = ix.vars;
globalThis.console = { log: ix.log, info: ix.log, warn: ix.log, error: ix.log };
globalThis.setTimeout = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, false); return id; };
globalThis.setInterval = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, true); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { __call('clearTimer', id); __fns.delete(id); };
`+b+String.raw`
const __drawRt = __makeDrawRuntime(ix, vars);
globalThis.__drawCompile = (id, code, seed) => __drawRt.compile(id, code, seed);
globalThis.__drawFrame = (id, json) => __drawRt.frame(id, json);
globalThis.__drawDrop = (id) => { __drawRt.drop(id); return ''; };
`;function c(o){if(o!==void 0)try{return JSON.parse(JSON.stringify(o))}catch{return String(o)}}class g{constructor(s,e,t){this.ix=e,this.opts=t,this.nextToken=1,this.offs=new Map,this.timers=new Map,this.disposed=!1,this.runtime=s.newRuntime(),this.runtime.setMemoryLimit(t.memoryLimit),this.runtime.setMaxStackSize(1024*1024),this.vm=this.runtime.newContext();const r=this.vm.newFunction("__host",(n,i)=>{const a=this.vm.getString(n),l=JSON.parse(this.vm.getString(i));let d;try{d=this.handle(a,l)}catch(m){if(m instanceof v)return this.vm.newString("\0"+m.message);console.error(`[interactives sandbox] ${a} failed:`,m)}return d===void 0?this.vm.undefined:this.vm.newString(JSON.stringify(d))});this.vm.setProp(this.vm.global,"__host",r),r.dispose(),this.eval(x,"prelude")}nodeOf(s){return this.ix.node(String(s))}handle(s,e){const t=this.ix;switch(s){case"get":return c(t.get(String(e[0])));case"set":t.set(String(e[0]),e[1]);return;case"varNames":return Object.keys(t.vars);case"node":{const r=t.node(String(e[0]));return r?{id:r.id,name:r.name,type:r.type}:null}case"nodes":return t.nodes().map(r=>({id:r.id,name:r.name,type:r.type}));case"nodeGet":return c(this.nodeOf(e[0])?.get(String(e[1])));case"nodeSet":this.nodeOf(e[0])?.set(String(e[1]),e[2]);return;case"nodeToggle":this.nodeOf(e[0])?.toggle();return;case"animate":{const r=this.nextToken++,n=this.nodeOf(e[0]);return(n?n.animate(String(e[1]),e[2],e[3]??{}):Promise.resolve()).then(()=>this.settle(r,!0,void 0)),r}case"timeline":{const r=t.timeline(String(e[0]));return r?r.name:null}case"tl":{const r=t.timeline(String(e[0]));r&&I.has(String(e[1]))&&r[String(e[1])](e[2]);return}case"tlState":{const r=t.timeline(String(e[0]));return{time:r?.time??0,playing:!!r?.playing}}case"report":{const r=e[0]&&typeof e[0]=="object"?e[0]:{};return c(t.report({completed:r.completed===void 0?void 0:!!r.completed,score:typeof r.score=="number"?r.score:void 0}))}case"record":t.record(String(e[0]??""),typeof e[1]=="string"||typeof e[1]=="number"||typeof e[1]=="boolean"?e[1]:void 0);return;case"startOver":t.startOver();return;case"reset":t.reset(...Array.isArray(e[0])?e[0].map(String):[]);return;case"toggleItem":t.toggleItem(String(e[0]),e[1]);return;case"removeValue":t.removeValue(String(e[0]),e[1]);return;case"setItem":t.setItem(String(e[0]),Number(e[1]),e[2],typeof e[3]=="string"?e[3]:void 0);return;case"result":return c(t.result);case"goTo":t.goTo(String(e[0]),e[1],e[2]);return;case"setInstanceInput":return t.setInstanceInput(String(e[0]),String(e[1]),e[2]);case"getInstanceInput":return c(t.getInstanceInput(String(e[0]),String(e[1])));case"fireInstanceTrigger":return t.fireInstanceTrigger(String(e[0]),String(e[1]),e[2]);case"emit":t.emit(String(e[0]),e[1]);return;case"stepsState":{const r=t.steps;return{step:r.step,count:r.count,title:r.title,caption:r.caption,moving:r.moving}}case"stepsDo":{const r=String(e[0]);r==="goTo"?t.steps.goTo(Number(e[1])):(r==="next"||r==="back"||r==="first"||r==="last")&&t.steps[r]();return}case"speechSay":{const r=this.nextToken++,n=e[1]??{};return(e.length===0?t.speech.repeat():t.speech.say(String(e[0]??""),{lang:typeof n.lang=="string"?n.lang:void 0,rate:typeof n.rate=="number"?n.rate:void 0})).then(a=>this.settle(r,!0,a),a=>this.settle(r,!1,String(a))),r}case"speechDo":{const r=String(e[0]);r==="stop"||r==="pause"||r==="resume"?t.speech[r]():r==="setRate"&&t.speech.setRate(Number(e[1]));return}case"speechState":return{available:t.speech.available,speaking:t.speech.speaking,paused:t.speech.paused,rate:t.speech.rate};case"announce":t.announce(String(e[0]??""),e[1]==="assertive"?"assertive":"polite");return;case"setTheme":return t.setTheme(e[0]===null||e[0]===void 0?null:String(e[0]));case"soundPlaying":return t.soundPlaying(e[0]===void 0||e[0]===null?void 0:String(e[0]));case"soundsPlaying":return t.soundsPlaying();case"getTheme":return t.getTheme();case"themes":return t.themes();case"on":{const r=Number(e[1]);this.offs.set(r,t.on(String(e[0]),n=>this.dispatch(r,[c(n)])));return}case"onFrame":{const r=Number(e[0]);this.offs.set(r,t.onFrame((n,i)=>this.dispatch(r,[n,i])));return}case"off":this.offs.get(Number(e[0]))?.(),this.offs.delete(Number(e[0]));return;case"pointer":return c(t.pointer);case"artboard":return c(t.artboard);case"data":return c(t.data);case"context":return c(t.context);case"loadData":{const r=this.nextToken++,n=e[1]?String(e[1]):void 0;let i;try{n&&S(n,t.dataPolicy??{}),i=t.loadData(String(e[0]),n)}catch(a){i=Promise.reject(a)}return i.then(a=>this.settle(r,!0,c(a)),a=>this.settle(r,!1,String(a))),r}case"setData":t.setData(String(e[0]),e[1]);return;case"setCursor":t.setCursor(String(e[0]));return;case"dragZoneOf":return t.drag.zoneOf(String(e[0]));case"dragContents":return c(t.drag.contents(String(e[0])));case"dragState":return c(t.drag.state());case"dragPut":return t.drag.put(String(e[0]),String(e[1]));case"dragReset":t.drag.reset(e[0]===void 0||e[0]===null?void 0:String(e[0]));return;case"dragEnable":return t.drag.enable(String(e[0]),!!e[1]);case"log":t.log(...e);return;case"timer":{const r=Number(e[0]),n=Math.max(0,Number(e[1])||0),a=!!e[2]?setInterval(()=>this.dispatch(r,[]),Math.max(4,n)):setTimeout(()=>{this.timers.delete(r),this.dispatch(r,[]),this.callGlobal("__drop",[r])},n);this.timers.set(r,a);return}case"clearTimer":{const r=this.timers.get(Number(e[0]));r!==void 0&&(clearTimeout(r),clearInterval(r),this.timers.delete(Number(e[0])));return}default:console.warn(`[interactives sandbox] unknown op ${s}`);return}}callGlobal(s,e){if(this.disposed)return;const t=this.vm.getProp(this.vm.global,s),r=e.map(i=>i===void 0?this.vm.undefined:typeof i=="number"?this.vm.newNumber(i):typeof i=="boolean"?i?this.vm.true:this.vm.false:this.vm.newString(String(i)));this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.callFunction(t,this.vm.undefined,...r);t.dispose();for(const i of r)i.alive&&i!==this.vm.undefined&&i!==this.vm.true&&i!==this.vm.false&&i.dispose();if(n.error){const i=this.vm.dump(n.error);n.error.dispose(),console.error("[interactives sandbox] script error:",i),this.failed(i)}else n.value.dispose();this.pump()}dispatch(s,e){this.callGlobal("__dispatch",[s,JSON.stringify(e)])}settle(s,e,t){this.callGlobal("__resolve",[s,e,t===void 0?void 0:JSON.stringify(t)])}callString(s,e,t){if(this.disposed)throw new Error("The script sandbox was released.");const r=this.vm.getProp(this.vm.global,s),n=e.map(l=>typeof l=="number"?this.vm.newNumber(l):this.vm.newString(l));this.runtime.setInterruptHandler(u(Date.now()+t));const i=this.vm.callFunction(r,this.vm.undefined,...n);r.dispose();for(const l of n)l.dispose();if(i.error){const l=this.vm.dump(i.error);i.error.dispose();const d=typeof l=="string"?l:`${l?.name?`${l.name}: `:""}${l?.message??"failed"}`;throw new Error(/interrupted/i.test(d)?`The script ran for more than ${t} ms in one frame and was stopped (is there a loop that never ends?).`:d)}const a=this.vm.getString(i.value);return i.value.dispose(),a}drawRuntime(){return{compile:(s,e,t)=>this.callString("__drawCompile",[s,e,t],this.opts.timeLimitMs),frame:(s,e)=>this.callString("__drawFrame",[s,e],this.opts.drawTimeLimitMs),drop:s=>{this.disposed||this.callString("__drawDrop",[s],this.opts.timeLimitMs)}}}failed(s){const e=s&&typeof s=="object"?s:{message:String(s)},t=new Error(typeof e.message=="string"?e.message:String(s));t.name=typeof e.name=="string"?e.name:"Error",t.stack=typeof e.stack=="string"?`${t.name}: ${t.message}
${e.stack}`:void 0,y(this.ix,t,"sandbox")}pump(){if(this.disposed)return;this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const s=this.runtime.executePendingJobs();if(s.error){const e=this.vm.dump(s.error);s.error.dispose(),console.error("[interactives sandbox] script error:",e),this.failed(e)}}eval(s,e){this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const t=this.vm.evalCode(s,`${e}.js`);if(t.error){const r=this.vm.dump(t.error);t.error.dispose(),console.error(`[interactives sandbox] script "${e}" failed:`,r),this.failed(r)}else t.value.dispose();this.pump()}run(s,e,t){const r=t.replace(/[^\w-]/g,"_");this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.evalCode(`(async (event) => {
${s}
})(${JSON.stringify(c(e)??null)});`,`${r}.js`);if(n.error){const a=this.vm.dump(n.error);n.error.dispose(),console.error(`[interactives sandbox] script "${t}" failed:`,a),this.failed(a);return}const i=this.vm.resolvePromise(n.value);n.value.dispose(),i.then(a=>{if(!this.disposed)if(a.error){const l=this.vm.dump(a.error);a.error.dispose(),console.error(`[interactives sandbox] script "${t}" failed:`,l),this.failed(l)}else a.value.dispose()}),this.pump()}dispose(){if(!this.disposed){this.disposed=!0;for(const s of this.offs.values())s();for(const s of this.timers.values())clearTimeout(s),clearInterval(s);this.vm.dispose(),this.runtime.dispose()}}}class D{constructor(s,e){this.module=s,this.opts=e,this.bridges=new WeakMap}run(s,e,t,r){let n=this.bridges.get(e);n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),n.run(s,t,r)}createDraw(s,e,t,r){let n=this.bridges.get(e);return n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),new f(n.drawRuntime(),s,r)}release(s){this.bridges.get(s)?.dispose(),this.bridges.delete(s)}}let h=null;async function N(o={}){h??(h=w(T));const s=await h;return new D(s,{memoryLimit:o.memoryLimit??64*1024*1024,timeLimitMs:o.timeLimitMs??250,drawTimeLimitMs:o.drawTimeLimitMs??100})}export{D as SandboxScriptHost,N as createSandboxHost};
