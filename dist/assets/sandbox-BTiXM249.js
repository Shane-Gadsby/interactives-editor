import{_ as p,a1 as f,a2 as v,a3 as S,a4 as y,a5 as w}from"./index-Bm2by7it.js";async function b(a){let s=_(await a),[e,r,{QuickJSWASMModule:t}]=await Promise.all([s.importModuleLoader().then(_),s.importFFI(),p(()=>import("./module-ES6BEMUI-DtDrHF3o.js"),[],import.meta.url).then(_)]),n=await e();n.type="sync";let i=new r(n);return new t(n,i)}function _(a){return a&&"default"in a&&a.default?a.default&&"default"in a.default&&a.default.default?a.default.default:a.default:a}function u(a){let s=typeof a=="number"?a:a.getTime();return function(){return Date.now()>s}}var k={type:"sync",importFFI:()=>p(()=>import("./ffi-Boa1QuFa.js"),[],import.meta.url).then(a=>a.QuickJSFFI),importModuleLoader:()=>p(()=>import("./emscripten-module.browser-XIKQQPVU-DxtMXd9O.js"),[],import.meta.url).then(a=>a.default)},T=k;const I=new Set(["play","pause","stop","restart","reverse","seek"]),x=String.raw`
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
  shared: {
    add: (name, answers) => __await(__call('sharedAdd', name, answers)),
    withdraw: (name, answers) => __await(__call('sharedWithdraw', name, answers)),
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
`+w+String.raw`
const __drawRt = __makeDrawRuntime(ix, vars);
globalThis.__drawCompile = (id, code, seed) => __drawRt.compile(id, code, seed);
globalThis.__drawFrame = (id, json) => __drawRt.frame(id, json);
globalThis.__drawDrop = (id) => { __drawRt.drop(id); return ''; };
`;function c(a){if(a!==void 0)try{return JSON.parse(JSON.stringify(a))}catch{return String(a)}}class g{constructor(s,e,r){this.ix=e,this.opts=r,this.nextToken=1,this.offs=new Map,this.timers=new Map,this.disposed=!1,this.runtime=s.newRuntime(),this.runtime.setMemoryLimit(r.memoryLimit),this.runtime.setMaxStackSize(1024*1024),this.vm=this.runtime.newContext();const t=this.vm.newFunction("__host",(n,i)=>{const o=this.vm.getString(n),l=JSON.parse(this.vm.getString(i));let d;try{d=this.handle(o,l)}catch(m){if(m instanceof v)return this.vm.newString("\0"+m.message);console.error(`[interactives sandbox] ${o} failed:`,m)}return d===void 0?this.vm.undefined:this.vm.newString(JSON.stringify(d))});this.vm.setProp(this.vm.global,"__host",t),t.dispose(),this.eval(x,"prelude")}nodeOf(s){return this.ix.node(String(s))}handle(s,e){const r=this.ix;switch(s){case"get":return c(r.get(String(e[0])));case"set":r.set(String(e[0]),e[1]);return;case"varNames":return Object.keys(r.vars);case"node":{const t=r.node(String(e[0]));return t?{id:t.id,name:t.name,type:t.type}:null}case"nodes":return r.nodes().map(t=>({id:t.id,name:t.name,type:t.type}));case"nodeGet":return c(this.nodeOf(e[0])?.get(String(e[1])));case"nodeSet":this.nodeOf(e[0])?.set(String(e[1]),e[2]);return;case"nodeToggle":this.nodeOf(e[0])?.toggle();return;case"animate":{const t=this.nextToken++,n=this.nodeOf(e[0]);return(n?n.animate(String(e[1]),e[2],e[3]??{}):Promise.resolve()).then(()=>this.settle(t,!0,void 0)),t}case"timeline":{const t=r.timeline(String(e[0]));return t?t.name:null}case"tl":{const t=r.timeline(String(e[0]));t&&I.has(String(e[1]))&&t[String(e[1])](e[2]);return}case"tlState":{const t=r.timeline(String(e[0]));return{time:t?.time??0,playing:!!t?.playing}}case"report":{const t=e[0]&&typeof e[0]=="object"?e[0]:{};return c(r.report({completed:t.completed===void 0?void 0:!!t.completed,score:typeof t.score=="number"?t.score:void 0}))}case"record":r.record(String(e[0]??""),typeof e[1]=="string"||typeof e[1]=="number"||typeof e[1]=="boolean"?e[1]:void 0);return;case"startOver":r.startOver();return;case"reset":r.reset(...Array.isArray(e[0])?e[0].map(String):[]);return;case"toggleItem":r.toggleItem(String(e[0]),e[1]);return;case"removeValue":r.removeValue(String(e[0]),e[1]);return;case"setItem":r.setItem(String(e[0]),Number(e[1]),e[2],typeof e[3]=="string"?e[3]:void 0);return;case"result":return c(r.result);case"goTo":r.goTo(String(e[0]),e[1],e[2]);return;case"setInstanceInput":return r.setInstanceInput(String(e[0]),String(e[1]),e[2]);case"getInstanceInput":return c(r.getInstanceInput(String(e[0]),String(e[1])));case"fireInstanceTrigger":return r.fireInstanceTrigger(String(e[0]),String(e[1]),e[2]);case"emit":r.emit(String(e[0]),e[1]);return;case"stepsState":{const t=r.steps;return{step:t.step,count:t.count,title:t.title,caption:t.caption,moving:t.moving}}case"stepsDo":{const t=String(e[0]);t==="goTo"?r.steps.goTo(Number(e[1])):(t==="next"||t==="back"||t==="first"||t==="last")&&r.steps[t]();return}case"speechSay":{const t=this.nextToken++,n=e[1]??{};return(e.length===0?r.speech.repeat():r.speech.say(String(e[0]??""),{lang:typeof n.lang=="string"?n.lang:void 0,rate:typeof n.rate=="number"?n.rate:void 0})).then(o=>this.settle(t,!0,o),o=>this.settle(t,!1,String(o))),t}case"speechDo":{const t=String(e[0]);t==="stop"||t==="pause"||t==="resume"?r.speech[t]():t==="setRate"&&r.speech.setRate(Number(e[1]));return}case"speechState":return{available:r.speech.available,speaking:r.speech.speaking,paused:r.speech.paused,rate:r.speech.rate};case"announce":r.announce(String(e[0]??""),e[1]==="assertive"?"assertive":"polite");return;case"setTheme":return r.setTheme(e[0]===null||e[0]===void 0?null:String(e[0]));case"soundPlaying":return r.soundPlaying(e[0]===void 0||e[0]===null?void 0:String(e[0]));case"soundsPlaying":return r.soundsPlaying();case"getTheme":return r.getTheme();case"themes":return r.themes();case"on":{const t=Number(e[1]);this.offs.set(t,r.on(String(e[0]),n=>this.dispatch(t,[c(n)])));return}case"onFrame":{const t=Number(e[0]);this.offs.set(t,r.onFrame((n,i)=>this.dispatch(t,[n,i])));return}case"off":this.offs.get(Number(e[0]))?.(),this.offs.delete(Number(e[0]));return;case"pointer":return c(r.pointer);case"artboard":return c(r.artboard);case"data":return c(r.data);case"context":return c(r.context);case"loadData":{const t=this.nextToken++,n=e[1]?String(e[1]):void 0;let i;try{n&&S(n,r.dataPolicy??{}),i=r.loadData(String(e[0]),n)}catch(o){i=Promise.reject(o)}return i.then(o=>this.settle(t,!0,c(o)),o=>this.settle(t,!1,String(o))),t}case"setData":r.setData(String(e[0]),e[1]);return;case"sharedAdd":case"sharedWithdraw":{const t=this.nextToken++,n=typeof e[1]=="string"?e[1]:Array.isArray(e[1])?e[1].map(String):void 0;return(s==="sharedAdd"?r.shared.add(String(e[0]),n??""):r.shared.withdraw(String(e[0]),n)).then(o=>this.settle(t,!0,c(o??null)),o=>this.settle(t,!1,String(o))),t}case"setCursor":r.setCursor(String(e[0]));return;case"dragZoneOf":return r.drag.zoneOf(String(e[0]));case"dragContents":return c(r.drag.contents(String(e[0])));case"dragState":return c(r.drag.state());case"dragPut":return r.drag.put(String(e[0]),String(e[1]));case"dragReset":r.drag.reset(e[0]===void 0||e[0]===null?void 0:String(e[0]));return;case"dragEnable":{const t=e[2]??{};return r.drag.enable(e[0]===void 0||e[0]===null?void 0:String(e[0]),!!e[1],{tag:t.tag,what:t.what})}case"log":r.log(...e);return;case"timer":{const t=Number(e[0]),n=Math.max(0,Number(e[1])||0),o=!!e[2]?setInterval(()=>this.dispatch(t,[]),Math.max(4,n)):setTimeout(()=>{this.timers.delete(t),this.dispatch(t,[]),this.callGlobal("__drop",[t])},n);this.timers.set(t,o);return}case"clearTimer":{const t=this.timers.get(Number(e[0]));t!==void 0&&(clearTimeout(t),clearInterval(t),this.timers.delete(Number(e[0])));return}default:console.warn(`[interactives sandbox] unknown op ${s}`);return}}callGlobal(s,e){if(this.disposed)return;const r=this.vm.getProp(this.vm.global,s),t=e.map(i=>i===void 0?this.vm.undefined:typeof i=="number"?this.vm.newNumber(i):typeof i=="boolean"?i?this.vm.true:this.vm.false:this.vm.newString(String(i)));this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.callFunction(r,this.vm.undefined,...t);r.dispose();for(const i of t)i.alive&&i!==this.vm.undefined&&i!==this.vm.true&&i!==this.vm.false&&i.dispose();if(n.error){const i=this.vm.dump(n.error);n.error.dispose(),console.error("[interactives sandbox] script error:",i),this.failed(i)}else n.value.dispose();this.pump()}dispatch(s,e){this.callGlobal("__dispatch",[s,JSON.stringify(e)])}settle(s,e,r){this.callGlobal("__resolve",[s,e,r===void 0?void 0:JSON.stringify(r)])}callString(s,e,r){if(this.disposed)throw new Error("The script sandbox was released.");const t=this.vm.getProp(this.vm.global,s),n=e.map(l=>typeof l=="number"?this.vm.newNumber(l):this.vm.newString(l));this.runtime.setInterruptHandler(u(Date.now()+r));const i=this.vm.callFunction(t,this.vm.undefined,...n);t.dispose();for(const l of n)l.dispose();if(i.error){const l=this.vm.dump(i.error);i.error.dispose();const d=typeof l=="string"?l:`${l?.name?`${l.name}: `:""}${l?.message??"failed"}`;throw new Error(/interrupted/i.test(d)?`The script ran for more than ${r} ms in one frame and was stopped (is there a loop that never ends?).`:d)}const o=this.vm.getString(i.value);return i.value.dispose(),o}drawRuntime(){return{compile:(s,e,r)=>this.callString("__drawCompile",[s,e,r],this.opts.timeLimitMs),frame:(s,e)=>this.callString("__drawFrame",[s,e],this.opts.drawTimeLimitMs),drop:s=>{this.disposed||this.callString("__drawDrop",[s],this.opts.timeLimitMs)}}}failed(s){const e=s&&typeof s=="object"?s:{message:String(s)},r=new Error(typeof e.message=="string"?e.message:String(s));r.name=typeof e.name=="string"?e.name:"Error",r.stack=typeof e.stack=="string"?`${r.name}: ${r.message}
${e.stack}`:void 0,y(this.ix,r,"sandbox")}pump(){if(this.disposed)return;this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const s=this.runtime.executePendingJobs();if(s.error){const e=this.vm.dump(s.error);s.error.dispose(),console.error("[interactives sandbox] script error:",e),this.failed(e)}}eval(s,e){this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const r=this.vm.evalCode(s,`${e}.js`);if(r.error){const t=this.vm.dump(r.error);r.error.dispose(),console.error(`[interactives sandbox] script "${e}" failed:`,t),this.failed(t)}else r.value.dispose();this.pump()}run(s,e,r){const t=r.replace(/[^\w-]/g,"_");this.runtime.setInterruptHandler(u(Date.now()+this.opts.timeLimitMs));const n=this.vm.evalCode(`(async (event) => {
${s}
})(${JSON.stringify(c(e)??null)});`,`${t}.js`);if(n.error){const o=this.vm.dump(n.error);n.error.dispose(),console.error(`[interactives sandbox] script "${r}" failed:`,o),this.failed(o);return}const i=this.vm.resolvePromise(n.value);n.value.dispose(),i.then(o=>{if(!this.disposed)if(o.error){const l=this.vm.dump(o.error);o.error.dispose(),console.error(`[interactives sandbox] script "${r}" failed:`,l),this.failed(l)}else o.value.dispose()}),this.pump()}dispose(){if(!this.disposed){this.disposed=!0;for(const s of this.offs.values())s();for(const s of this.timers.values())clearTimeout(s),clearInterval(s);this.vm.dispose(),this.runtime.dispose()}}}class D{constructor(s,e){this.module=s,this.opts=e,this.bridges=new WeakMap}run(s,e,r,t){let n=this.bridges.get(e);n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),n.run(s,r,t)}createDraw(s,e,r,t){let n=this.bridges.get(e);return n||(n=new g(this.module,e,this.opts),this.bridges.set(e,n)),new f(n.drawRuntime(),s,t)}release(s){this.bridges.get(s)?.dispose(),this.bridges.delete(s)}}let h=null;async function N(a={}){h??(h=b(T));const s=await h;return new D(s,{memoryLimit:a.memoryLimit??64*1024*1024,timeLimitMs:a.timeLimitMs??250,drawTimeLimitMs:a.drawTimeLimitMs??100})}export{D as SandboxScriptHost,N as createSandboxHost};
