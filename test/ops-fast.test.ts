// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { apply, diff } from '../shared/ops.mjs';
import { createNode, createProject } from 'interactives-player';

/* eslint-disable */
// The diff as it was before the same-order fast path, to check the fast path gives the same ops
//An array is addressed by ids when every element is an object with a string id
const isIdArray = (a) => Array.isArray(a) && a.length > 0 && a.every((e) => e && typeof e === 'object' && typeof e.id === 'string')

const same = (a, b) => {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  let ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (let k of ka) if (!same(a[k], b[k])) return false
  return true
}

//Longest increasing subsequence of positions, the elements that can stay where they are when reordering
function stayers(order) {
  let tails = [], prev = new Array(order.length), tailIdx = []
  for (let i = 0; i < order.length; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) {
      let mid = (lo + hi) >> 1
      if (tails[mid] < order[i]) lo = mid + 1
      else hi = mid
    }
    tails[lo] = order[i]
    tailIdx[lo] = i
    prev[i] = lo ? tailIdx[lo - 1] : -1
  }
  let keep = new Set(), k = tailIdx[tails.length - 1]
  while (k !== undefined && k >= 0) {
    keep.add(k)
    k = prev[k]
  }
  return keep
}

//Ops that turn `a` into `b`. Unchanged subtrees are skipped by reference, so with immer's structural sharing
//this only walks what actually changed
function legacyDiff(a, b, path = [], out = []) {
  if (a === b) return out
  let aObj = a && typeof a === 'object', bObj = b && typeof b === 'object'
  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    if (!same(a, b)) out.push({t: 'set', p: path, v: b})
    return out
  }
  if (Array.isArray(a)) {
    let idArrays = (isIdArray(a) || a.length === 0) && (isIdArray(b) || b.length === 0) && (a.length || b.length)
    if (!idArrays) {
      if (!same(a, b)) out.push({t: 'set', p: path, v: b})
      return out
    }
    let aIds = new Map(a.map((e, i) => [e.id, i])), bIds = new Set(b.map((e) => e.id))
    for (let e of a) if (!bIds.has(e.id)) out.push({t: 'del', p: path, id: e.id})
    //Common elements in b's order; the ones off the longest in-order run get moved (del + ins)
    let common = b.filter((e) => aIds.has(e.id)), keep = stayers(common.map((e) => aIds.get(e.id))), moved = new Set()
    common.forEach((e, i) => {
      if (!keep.has(i)) moved.add(e.id)
    })
    for (let id of moved) out.push({t: 'del', p: path, id})
    b.forEach((e, i) => {
      let after = i ? b[i - 1].id : null
      if (!aIds.has(e.id) || moved.has(e.id)) out.push({t: 'ins', p: path, v: e, after})
      else legacyDiff(a[aIds.get(e.id)], e, [...path, {i: e.id}], out)
    })
    return out
  }
  for (let k of Object.keys(a)) if (!(k in b)) out.push({t: 'set', p: [...path, k], v: undefined})
  for (let k of Object.keys(b)) legacyDiff(a[k], b[k], [...path, k], out)
  return out
}


const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('ops diff fast path', () => {
  it('gives the same ops as the full diff for edits, inserts, removals and moves', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
    for (let round = 0; round < 200; round++) {
      const a = createProject('A');
      const n = 1 + rnd(12);
      for (let i = 0; i < n; i++) a.artboards[0].children.push(createNode(i % 2 ? 'rect' : 'ellipse', { name: 'n' + i }) as never);
      const b = produce(a, (d) => {
        const kids = d.artboards[0].children;
        for (let k = 0; k < 1 + rnd(4); k++) {
          const op = rnd(5);
          if (op === 0 && kids.length) kids[rnd(kids.length)].x = rnd(100);
          else if (op === 1 && kids.length) kids.splice(rnd(kids.length), 1);
          else if (op === 2) kids.splice(rnd(kids.length + 1), 0, createNode('star', { name: 'ins' }) as never);
          else if (op === 3 && kids.length > 1) { const [m] = kids.splice(rnd(kids.length), 1); kids.splice(rnd(kids.length + 1), 0, m); }
          else if (kids.length) { kids[rnd(kids.length)].name = 'renamed' + rnd(9); kids[rnd(kids.length)].opacity = 0.5; }
        }
      });
      const fast = diff(a, b);
      expect(fast).toEqual(legacyDiff(a, b));
      const c = clone(a);
      apply(c, fast);
      expect(c).toEqual(clone(b));
    }
  });

  it('copes with arrays whose elements are not all id objects', () => {
    const a = { list: [{ id: 'a', v: 1 }, 5, { id: 'c', v: 3 }] };
    const b = { list: [{ id: 'a', v: 2 }, 5, { id: 'c', v: 3 }] };
    expect(diff(a, b)).toEqual(legacyDiff(a, b));
    const c = { list: [{ id: 'a' }, { id: 'b' }] };
    const d = { list: [{ id: 'b' }, { id: 'a' }] };
    expect(diff(c, d)).toEqual(legacyDiff(c, d));
  });
});
