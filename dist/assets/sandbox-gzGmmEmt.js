import{_ as p,cg as f,ch as v,ci as S,cj as w,ck as y}from"./index-BucaBEPb.js";async function b(a){let r=_(await a),[e,s,{QuickJSWASMModule:t}]=await Promise.all([r.importModuleLoader().then(_),r.importFFI(),p(()=>import("./module-ES6BEMUI-DtDrHF3o.js"),[],import.meta.url).then(_)]),n=await e();n.type="sync";let i=new s(n);return new t(n,i)}function _(a){return a&&"default"in a&&a.default?a.default&&"default"in a.default&&a.default.default?a.default.default:a.default:a}function u(a){let r=typeof a=="number"?a:a.getTime();return function(){return Date.now()>r}}var k={type:"sync",importFFI:()=>p(()=>import("./ffi-Boa1QuFa.js"),[],import.meta.url).then(a=>a.QuickJSFFI),importModuleLoader:()=>p(()=>import("./emscripten-module.browser-XIKQQPVU-DxtMXd9O.js"),[],import.meta.url).then(a=>a.default)},T=k;const I=new Set(["play","pause","stop","restart","reverse","seek"]),x=String.raw`
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
  goTo: (a, t, d, f) => __call('goTo', a, t, d, f),
  moveView: (layer, options) => __await(__call('moveView', layer, options || {})),
  resetView: (options) => __await(__call('resetView', options || {})),
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
  shared: {
    add: (name, answers) => __await(__call('sharedAdd', name, answers)),
    withdraw: (name, answers) => __await(__call('sharedWithdraw', name, answers)),
  },
  course: {
    stamp: (collection, stamps) => __await(__call('courseStamp', collection, stamps)),
    count: (collection, name, value) => __await(__call('courseCount', collection, name, value)),
    read: (collection) => __await(__call('courseRead', collection)),
  },
  setCursor: (c) => __call('setCursor', c),
  drag: {
    zoneOf: (layer) => __call('dragZoneOf', layer),
    contents: (zone) => __call('dragContents', zone),
    state: () => __call('dragState'),
    put: (layer, zone) => __call('dragPut', layer, zone),
    reset: (layer) => __call('dragReset', layer),
    enable: (layer, on, opts) => __call('dragEnable', layer, on, opts),
  },
  log: (...args) => __call('log', ...args.map((a) => { try { return JSON.parse(JSON.stringify(a)); } catch { return String(a); } })),
};
globalThis.vars = ix.vars;
globalThis.console = { log: ix.log, info: ix.log, warn: ix.log, error: ix.log };
globalThis.setTimeout = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, false); return id; };
globalThis.setInterval = (fn, ms) => { const id = __keep(fn); __call('timer', id, ms || 0, true); return id; };
globalThis.clearTimeout = globalThis.clearInterval = (id) => { __call('clearTimer', id); __fns.delete(id); };
`+y+String.raw`
const __drawRt = __makeDrawRuntime(ix, vars);
globalThis.__drawCompile = (id, code, seed) => __drawRt.compile(id, code, seed);
globalThis.__drawFrame = (id, json) => __drawRt.frame(id, json);
globalThis.__drawDrop = (id) => { __drawRt.drop(id); return ''; };
`;function c(a){if(a!==void 0)try{return JSON.parse(JSON.stringify(a))}catch{return String(a)}}class g{constructor(r,e,s){this.ix=e,this.opts=s,this.nextToken=1,this.offs=new Map,this.timers=new Map,this.disposed=!1,this.runtime=r.newRuntime(),this.runtime.setMemoryLimit(s.memoryLimit),this.runtime.setMaxStackSize(1024*1024),this.vm=this.runtime.newContext();const t=this.vm.newFunction("__host",(n,i)=>{const o=this.vm.getString(n),l=JSON.parse(this.vm.getString(i));let d;try{d=this.handle(o,l)}catch(m){if(m instanceof v)return this.vm.newString("\0"+m.message);console.error(`[interactives sandbox] ${o} failed:`,m)}return d===void 0?this.vm.undefined:this.vm.newString(JSON.stringify(d))});this.vm.setProp(this.vm.global,"__host",t),t.dispose(),this.eval(x,"prelude")}nodeOf(r){return this.ix.node(String(r))}handle(r,e){const s=this.ix;switch(r){case"get":return c(s.get(String(e[0])));case"set":s.set(String(e[0]),e[1]);return;case"varNames":return Object.keys(s.vars);case"node":{const t=s.node(String(e[0]));return t?{id:t.id,name:t.name,type:t.type}:null}case"nodes":return s.nodes().map(t=>({id:t.id,name:t.name,type:t.type}));case"nodeGet":return c(this.nodeOf(e[0])?.get(String(e[1])));case"nodeSet":this.nodeOf(e[0])?.set(String(e[1]),e[2]);return;case"nodeToggle":this.nodeOf(e[0])?.toggle();return;case"animate":{const t=this.nextToken++,n=this.nodeOf(e[0]);return(n?n.animate(String(e[1]),e[2],e[3]??{}):Promise.resolve()).then(()=>this.settle(t,!0,void 0)),t}case"timeline":{const t=s.timeline(String(e[0]));return t?t.name:null}case"tl":{const t=s.timeline(String(e[0]));t&&I.has(String(e[1]))&&t[String(e[1])](e[2]);return}case"tlState":{const t=s.timeline(String(e[0]));return{time:t?.time??0,playing:!!t?.playing}}case"report":{const t=e[0]&&typeof e[0]=="object"?e[0]:{};return c(s.report({completed:t.completed===void 0?void 0:!!t.completed,score:typeof t.score=="number"?t.score:void 0}))}case"record":s.record(String(e[0]??""),typeof e[1]=="string"||typeof e[1]=="number"||typeof e[1]=="boolean"?e[1]:void 0);return;case"startOver":s.startOver();return;case"reset":s.reset(...Array.isArray(e[0])?e[0].map(String):[]);return;case"toggleItem":s.toggleItem(String(e[0]),e[1]);return;case"removeValue":s.removeValue(String(e[0]),e[1]);return;case"setItem":s.setItem(String(e[0]),Number(e[1]),e[2],typeof e[3]=="string"?e[3]:void 0);return;case"result":return c(s.result);case"moveView":{const t=this.nextToken++;return s.moveView(String(e[0]),e[1]??{}).then(()=>this.settle(t,!0,void 0)),t}case"resetView":{const t=this.nextToken++;return s.resetView(e[0]??{}).then(()=>this.settle(t,!0,void 0)),t}case"goTo":s.goTo(String(e[0]),e[1],e[2],e[3]);return;case"setInstanceInput":return s.setInstanceInput(String(e[0]),String(e[1]),e[2]);case"getInstanceInput":return c(s.getInstanceInput(String(e[0]),String(e[1])));case"fireInstanceTrigger":return s.fireInstanceTrigger(String(e[0]),String(e[1]),e[2]);case"emit":s.emit(String(e[0]),e[1]);return;case"stepsState":{const t=s.steps;return{step:t.step,count:t.count,title:t.title,caption:t.caption,moving:t.moving}}case"stepsDo":{const t=String(e[0]);t==="goTo"?s.steps.goTo(Number(e[1])):(t==="next"||t==="back"||t==="first"||t==="last")&&s.steps[t]();return}case"speechSay":{const t=this.nextToken++,n=e[1]??{};return(e.length===0?s.speech.repeat():s.speech.say(String(e[0]??""),{lang:typeof n.lang=="string"?n.lang:void 0,rate:typeof n.rate=="number"?n.rate:void 0})).then(o=>this.settle(t,!0,o),o=>this.settle(t,!1,String(o))),t}case"speechDo":{const t=String(e[0]);t==="stop"||t==="pause"||t==="resume"?s.speech[t]():t==="setRate"&&s.speech.setRate(Number(e[1]));return}case"speechState":return{available:s.speech.available,speaking:s.speech.speaking,paused:s.speech.paused,rate:s.speech.rate};case"announce":s.announce(String(e[0]??""),e[1]==="assertive"?"assertive":"polite");return;case"setTheme":return s.setTheme(e[0]===null||e[0]===void 0?null:String(e[0]));case"soundPlaying":return s.soundPlaying(e[0]===void 0||e[0]===null?void 0:String(e[0]));case"soundsPlaying":return s.soundsPlaying();case"getTheme":return s.getTheme();case"themes":return s.themes();case"on":{const t=Number(e[1]);this.offs.set(t,s.on(String(e[0]),n=>this.dispatch(t,[c(n)])));return}case"onFrame":{const t=Number(e[0]);this.offs.set(t,s.onFrame((n,i)=>this.dispatch(t,[n,i])));return}case"off":this.offs.get(Number(e[0]))?.(),this.offs.delete(Number(e[0]));return;case"pointer":return c(s.pointer);case"artboard":return c(s.artboard);case"data":return c(s.data);case"context":return c(s.context);case"loadData":{const t=this.nextToken++,n=e[1]?String(e[1]):void 0;let i;try{n&&S(n,s.dataPolicy??{}),i=s.loadData(String(e[0]),n)}catch(o){i=Promise.reject(o)}return i.then(o=>this.settle(t,!0,c(o)),o=>this.settle(t,!1,String(o))),t}case"setData":s.setData(String(e[0]),e[1]);return;case"sharedAdd":case"sharedWithdraw":{const t=this.nextToken++,n=typeof e[1]=="string"?e[1]:Array.isArray(e[1])?e[1].map(String):void 0;return(r==="sharedAdd"?s.shared.add(String(e[0]),n??""):s.shared.withdraw(String(e[0]),n)).then(o=>this.settle(t,!0,c(o??null)),o=>this.settle(t,!1,String(o))),t}case"courseStamp":case"courseCount":case"courseRead":{const t=this.nextToken++,n=typeof e[1]=="string"?e[1]:Array.isArray(e[1])?e[1].map(String):[];return(r==="courseStamp"?s.course.stamp(String(e[0]),n):r==="courseCount"?s.course.count(String(e[0]),String(e[1]),Number(e[2])):s.course.read(String(e[0]))).then(o=>this.settle(t,!0,c(o??null)),o=>this.settle(t,!1,String(o))),t}case"setCursor":s.setCursor(String(e[0]));return;case"dragZoneOf":return s.drag.zoneOf(String(e[0]));case"dragContents":return c(s.drag.contents(String(e[0])));case"dragState":return c(s.drag.state());case"dragPut":return s.drag.put(String(e[0]),String(e[1]));case"dragReset":s.drag.reset(e[0]===void 0||e[0]===null?void 0:String(e[0]));return;case"dragEnable":{const t=e[2]??{};return s.drag.enable(e[0]===void 0||e[0]===null?void 0:String(e[0]),!!e[1],{tag:t.tag,what:t.what})}case"log":s.log(...e);return;case"timer":{const t=Number(e[0]),n=Math.max(0,Number(e[1])||0),o=!!e[2]?setInterval(()=>this.dispatch(t,[]),Math.max(4,n)):setTimeout(()=>{this.timers.delete(t),this.dispatch(t,[]),this.callGlobal("__drop",[t])},n);this.timers.set(t,o);return}case"clearTimer":{const t=this.timers.get(Number(e[0]));t!==void 0&&(clearTimeout(t),clearInterval(t),this.timers.delete(Number(e[0])));return}default:console.warn(`[interactives sandbox] unknown op ${r}`);return}}callGlobal(r,e){if(this.disposed)return;const s=this.vm.getProp(this.vm.global,r),t=e.map(i=>i===void 0?this.vm.undefined:typeof i=="number"?this.vm.newNumber(i):typeof i=="boolean"?i?this.vm.true:this.vm.false:this.vm.newString(String(i)));this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.callFunction(s,this.vm.undefined,...t);s.dispose();for(const i of t)i.alive&&i!==this.vm.undefined&&i!==this.vm.true&&i!==this.vm.false&&i.dispose();if(n.error){const i=this.vm.dump(n.error);n.error.dispose(),console.error("[interactives sandbox] script error:",i),this.failed(i)}else n.value.dispose();this.pump()}dispatch(r,e){this.callGlobal("__dispatch",[r,JSON.stringify(e)])}settle(r,e,s){this.callGlobal("__resolve",[r,e,s===void 0?void 0:JSON.stringify(s)])}callString(r,e,s){if(this.disposed)throw new Error("The script sandbox was released.");const t=this.vm.getProp(this.vm.global,r),n=e.map(l=>typeof l=="number"?this.vm.newNumber(l):this.vm.newString(l));this.runtime.setInterruptHandler(u(Date.now()+s));const i=this.vm.callFunction(t,this.vm.undefined,...n);t.dispose();for(const l of n)l.dispose();if(i.error){const l=this.vm.dump(i.error);i.error.dispose();const d=typeof l=="string"?l:`${l?.name?`${l.name}: `:""}${l?.message??"failed"}`;throw new Error(/interrupted/i.test(d)?`The script ran for more than ${s} ms in one frame and was stopped (is there a loop that never ends?).`:d)}const o=this.vm.getString(i.value);return i.value.dispose(),o}drawRuntime(){return{compile:(r,e,s)=>this.callString("__drawCompile",[r,e,s],this.opts.timeLimitMs),frame:(r,e)=>this.callString("__drawFrame",[r,e],this.opts.drawTimeLimitMs),drop:r=>{this.disposed||this.callString("__drawDrop",[r],this.opts.timeLimitMs)}}}failed(r){const e=r&&typeof r=="object"?r:{message:String(r)},s=new Error(typeof e.message=="string"?e.message:String(r));s.name=typeof e.name=="string"?e.name:"Error",s.stack=typeof e.stack=="string"?`${s.name}: ${s.message}
${e.stack}`:void 0,w(this.ix,s,"sandbox")}pump(){if(this.disposed)return;this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const r=this.runtime.executePendingJobs();if(r.error){const e=this.vm.dump(r.error);r.error.dispose(),console.error("[interactives sandbox] script error:",e),this.failed(e)}}eval(r,e){this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const s=this.vm.evalCode(r,`${e}.js`);if(s.error){const t=this.vm.dump(s.error);s.error.dispose(),console.error(`[interactives sandbox] script "${e}" failed:`,t),this.failed(t)}else s.value.dispose();this.pump()}run(r,e,s){const t=s.replace(/[^\w-]/g,"_");this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.evalCode(`(async (event) => {
${r}
})(${JSON.stringify(c(e)??null)});`,`${t}.js`);if(n.error){const o=this.vm.dump(n.error);n.error.dispose(),console.error(`[interactives sandbox] script "${s}" failed:`,o),this.failed(o);return}const i=this.vm.resolvePromise(n.value);n.value.dispose(),i.then(o=>{if(!this.disposed)if(o.error){const l=this.vm.dump(o.error);o.error.dispose(),console.error(`[interactives sandbox] script "${s}" failed:`,l),this.failed(l)}else o.value.dispose()}),this.pump()}dispose(){if(!this.disposed){this.disposed=!0;for(const r of this.offs.values())r();for(const r of this.timers.values())clearTimeout(r),clearInterval(r);this.vm.dispose(),this.runtime.dispose()}}}class D{constructor(r,e){this.module=r,this.opts=e,this.bridges=new WeakMap}run(r,e,s,t){let n=this.bridges.get(e);n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),n.run(r,s,t)}createDraw(r,e,s,t){let n=this.bridges.get(e);return n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),new f(n.drawRuntime(),r,t)}release(r){this.bridges.get(r)?.dispose(),this.bridges.delete(r)}}let h=null;async function N(a={}){h??(h=b(T));const r=await h;return new D(r,{memoryLimit:a.memoryLimit??64*1024*1024,timeLimitMs:a.timeLimitMs??250,drawTimeLimitMs:a.drawTimeLimitMs??100})}export{D as SandboxScriptHost,N as createSandboxHost};
