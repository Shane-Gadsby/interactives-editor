//Templates, the project side: the built-in starters (valid, wired to things that exist, each checklist item pointing at a real layer),
//the checklist and its review, and "Update from template" (what is offered, what is kept, what is applied).
import { describe, expect, it } from 'vitest';
import { CATALOG_BY_KIND, createNode, isContainer, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { STARTERS, projectFromStarter } from '../src/lib/template-starters';
import { applyTemplateUpdate, baselineOf, checklistProgress, findLayer, hasChecklist, itemState, markReviewed, planTemplateUpdate, reviewReport, setItemDone, updateAvailable } from '../src/lib/templates';
import { produce } from 'immer';

const allNodes = (ab: Artboard): SceneNode[] => {
  const out: SceneNode[] = [];
  walk(ab.children, (n: SceneNode) => out.push(n));
  return out;
};

describe('built-in starters', () => {
  it('there are six, with distinct keys', () => {
    expect(STARTERS.map((s) => s.key)).toEqual(['quiz', 'step-explainer', 'flip-cards', 'sorting', 'branching-story', 'timeline-intro']);
  });

  for (const s of STARTERS) {
    describe(s.name, () => {
      const { project, checklist } = s.build();

      it('is a valid project that survives normalising unchanged', () => {
        const again = normalizeProject(JSON.parse(JSON.stringify(project)));
        expect(again.artboards.map((a) => a.id)).toEqual(project.artboards.map((a) => a.id));
        expect(project.settings.startArtboardId ?? project.artboards[0].id).toBeTruthy();
      });

      it('has unique layer ids and nothing wired to something missing', () => {
        const ids = new Set<string>();
        for (const ab of project.artboards) {
          const layers = allNodes(ab);
          for (const n of layers) {
            expect(ids.has(n.id), `${n.name} repeated`).toBe(false);
            ids.add(n.id);
          }
          const have = new Set(layers.map((n) => n.id));
          for (const t of ab.timelines) for (const tr of t.tracks) expect(have.has(tr.nodeId), `track on ${tr.nodeId}`).toBe(true);
          const logic = new Set(ab.logic.nodes.map((n) => n.id));
          for (const e of ab.logic.edges) {
            expect(logic.has(e.from) && logic.has(e.to), 'edge ends').toBe(true);
          }
          for (const g of ab.logic.nodes) {
            const def = CATALOG_BY_KIND[g.kind];
            expect(def, g.kind).toBeTruthy();
            for (const p of def.params) {
              const v = (g.params as Record<string, unknown>)[p.key];
              if (typeof v !== 'string' || !v) continue;
              if (p.type === 'node') expect(have.has(v), `${g.kind}.${p.key} -> ${v}`).toBe(true);
              if (p.type === 'variable') expect(project.variables.some((x) => x.id === v), `${g.kind}.${p.key}`).toBe(true);
              if (p.type === 'timeline') expect(ab.timelines.some((x) => x.id === v), `${g.kind}.${p.key}`).toBe(true);
              if (p.type === 'artboard') expect(project.artboards.some((x) => x.id === v), `${g.kind}.${p.key}`).toBe(true);
            }
          }
        }
      });

      it('has a checklist whose items point at layers and artboards that exist', () => {
        expect(checklist.length).toBeGreaterThanOrEqual(4);
        for (const i of checklist) {
          expect(i.text.length).toBeGreaterThan(10);
          expect(i.done).toBe(false);
          if (i.artboardId) expect(project.artboards.some((a) => a.id === i.artboardId)).toBe(true);
          if (i.nodeId) expect(findLayer(project, i.nodeId, i.artboardId), i.text).toBeTruthy();
        }
        expect(new Set(checklist.map((i) => i.id)).size).toBe(checklist.length);
      });

      it('comes as a project with the checklist on it', () => {
        const p = projectFromStarter(s, 'Mine');
        expect(p.name).toBe('Mine');
        expect(p.template).toMatchObject({ builtin: s.key, name: s.name, version: 1 });
        expect(hasChecklist(p)).toBe(true);
        expect(p.template?.id).toBeUndefined();
      });
    });
  }

  it('the quiz has a real question, the sorting a drop zone for each group, and the story three artboards', () => {
    const quiz = STARTERS[0].build().project;
    expect(allNodes(quiz.artboards[0]).some((n) => n.type === 'frame' && n.question)).toBe(true);
    const sort = STARTERS[3].build().project;
    const nodes = allNodes(sort.artboards[0]);
    expect(nodes.filter((n) => n.dropZone).length).toBe(2);
    expect(nodes.filter((n) => n.draggable).length).toBe(4);
    expect(STARTERS[4].build().project.artboards).toHaveLength(3);
    expect(STARTERS[1].build().project.artboards[0].steps).toBeTruthy();
    expect(STARTERS[5].build().project.artboards[0].timelines[0].autoplay).toBe(true);
  });
});

/** A small project to treat as "the template", with a baseline taken the way the server takes it. */
function template(): Project {
  const p = normalizeProject({
    format: 'interactives',
    version: 1,
    id: 'tp',
    name: 'T',
    created: '',
    updated: '',
    artboards: [
      {
        id: 'ab1',
        name: 'Main',
        width: 400,
        height: 300,
        children: [
          createNode('text', { id: 't1', name: 'Title', text: 'Title here' }),
          createNode('text', { id: 't2', name: 'Body', text: 'Body here' }),
          createNode('frame', { id: 'f1', name: 'Box', children: [createNode('rect', { id: 'r1', name: 'Inner' })] }),
        ],
        timelines: [{ id: 'tl1', name: 'Intro', duration: 1000, loop: 'once', autoplay: true, speed: 1, tracks: [{ id: 'tr1', nodeId: 't1', prop: 'opacity', keys: [] }] }],
        logic: { nodes: [{ id: 'g1', kind: 'event.start', x: 0, y: 0, params: {} }], edges: [] },
      },
    ],
    variables: [{ id: 'v1', name: 'score', type: 'number', initial: 0 }],
  });
  return p;
}

/** Make a project from a template the way the server does. */
function useIt(t: Project, version = 1): Project {
  const copy = JSON.parse(JSON.stringify(t)) as Project;
  copy.id = 'mine';
  copy.template = { id: 'tpl1', name: 'T', version, base: baselineOf(copy), checklist: [{ id: 'c1', text: 'Replace the title', artboardId: 'ab1', nodeId: 't1', done: false }, { id: 'c2', text: 'Rewrite the body', artboardId: 'ab1', nodeId: 't2', done: false }, { id: 'c3', text: 'Pick colours', done: false }] };
  return copy;
}
const edit = (p: Project, f: (d: Project) => void) => produce(p, f);
const textOf = (p: Project, id: string) => (findLayer(p, id)!.node as { text: string }).text;

describe('the checklist', () => {
  it('counts ticks, and unticking reopens a finished review', () => {
    let p = useIt(template());
    expect(checklistProgress(p)).toEqual({ done: 0, total: 3 });
    p = edit(p, (d) => setItemDone(d, 'c1', true));
    expect(checklistProgress(p)).toEqual({ done: 1, total: 3 });
    p = edit(p, markReviewed);
    expect(p.template!.reviewed).toBeTruthy();
    p = edit(p, (d) => setItemDone(d, 'c1', false));
    expect(p.template!.reviewed).toBeUndefined();
    expect(checklistProgress(edit(p, (d) => setItemDone(d, 'nope', true)))).toEqual({ done: 0, total: 3 });
  });

  it('says whether the layer an item is about still holds the template\'s content', () => {
    let p = useIt(template());
    const [c1, c2, c3] = p.template!.checklist;
    expect(itemState(p, c1)).toBe('untouched');
    expect(itemState(p, c3)).toBe('general');
    p = edit(p, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'My own title';
    });
    expect(itemState(p, c1)).toBe('changed');
    expect(itemState(p, c2)).toBe('untouched');
    p = edit(p, (d) => {
      d.artboards[0].children = d.artboards[0].children.filter((n) => n.id !== 't2');
    });
    expect(itemState(p, c2)).toBe('missing');
  });

  it('a project with no baseline (a built-in starter) never claims a layer is untouched', () => {
    const p = projectFromStarter(STARTERS[0]);
    for (const i of p.template!.checklist) expect(['general', 'changed']).toContain(itemState(p, i));
  });

  it('the review lists what is left: unticked, and ticked without anything changed', () => {
    let p = useIt(template());
    expect(reviewReport(p)).toMatchObject({ clean: false });
    expect(reviewReport(p).open).toHaveLength(3);
    p = edit(p, (d) => {
      for (const i of d.template!.checklist) i.done = true;
    });
    const r = reviewReport(p);
    expect(r.open).toHaveLength(0);
    expect(r.untouched.map((i) => i.id)).toEqual(['c1', 'c2']);
    expect(r.clean).toBe(false);
    p = edit(p, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'A';
      (findLayer(d, 't2')!.node as { text: string }).text = 'B';
    });
    expect(reviewReport(p).clean).toBe(true);
  });
});

describe('update from template', () => {
  it('offers nothing when the template has not moved', () => {
    const t = template();
    const p = useIt(t);
    expect(planTemplateUpdate(p, t)).toEqual({ changes: [], kept: [], removed: 0 });
  });

  it('offers a changed layer you have not touched, keeps one you changed, and says so', () => {
    const t = template();
    let p = useIt(t);
    p = edit(p, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'My title';
    });
    const t2 = edit(t, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'Their new title';
      (findLayer(d, 't2')!.node as { text: string }).text = 'Their new body';
    });
    const plan = planTemplateUpdate(p, t2);
    expect(plan.changes.map((c) => c.key)).toEqual(['n:t2']);
    expect(plan.changes[0]).toMatchObject({ kind: 'update', part: 'layer', label: 'Layer "Body"', where: 'Main' });
    expect(plan.kept.map((c) => c.key)).toEqual(['n:t1']);
  });

  it('applies chosen updates in place, keeps your changes, and moves the baseline so they are not offered again', () => {
    const t = template();
    let p = useIt(t);
    p = edit(p, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'My title';
    });
    const t2 = edit(t, (d) => {
      (findLayer(d, 't1')!.node as { text: string }).text = 'Their new title';
      (findLayer(d, 't2')!.node as { text: string }).text = 'Their new body';
    });
    const plan = planTemplateUpdate(p, t2);
    p = edit(p, (d) => {
      applyTemplateUpdate(d, t2, plan.changes.map((c) => c.key), { version: 2 });
    });
    expect(textOf(p, 't2')).toBe('Their new body');
    expect(textOf(p, 't1')).toBe('My title');
    expect(p.template!.version).toBe(2);
    expect(planTemplateUpdate(p, t2).changes).toEqual([]);
    // the one you changed is still in conflict, still yours
    expect(planTemplateUpdate(p, t2).kept.map((c) => c.key)).toEqual(['n:t1']);
  });

  it('updating a container keeps your children, and the layers inside are judged on their own', () => {
    const t = template();
    let p = useIt(t);
    p = edit(p, (d) => {
      const box = findLayer(d, 'f1')!.node as unknown as { children: SceneNode[] };
      box.children.push(createNode('rect', { id: 'mine1', name: 'My extra' }));
    });
    const t2 = edit(t, (d) => {
      (findLayer(d, 'f1')!.node as { name: string }).name = 'Renamed box';
      (findLayer(d, 'r1')!.node as { opacity: number }).opacity = 0.5;
    });
    const plan = planTemplateUpdate(p, t2);
    expect(plan.changes.map((c) => c.key).sort()).toEqual(['n:f1', 'n:r1']);
    p = edit(p, (d) => {
      applyTemplateUpdate(d, t2, plan.changes.map((c) => c.key), { version: 2 });
    });
    const box = findLayer(p, 'f1')!.node;
    expect(box.name).toBe('Renamed box');
    expect(isContainer(box) && box.children.map((c) => c.id)).toEqual(['r1', 'mine1']);
    expect(findLayer(p, 'r1')!.node.opacity).toBe(0.5);
  });

  it('adds what the template added since, in its place, and leaves alone what you deleted', () => {
    const t = template();
    let p = useIt(t);
    p = edit(p, (d) => {
      d.artboards[0].children = d.artboards[0].children.filter((n) => n.id !== 't2');
    });
    const t2 = edit(t, (d) => {
      d.artboards[0].children.splice(1, 0, createNode('text', { id: 'new1', name: 'Fresh', text: 'Added in v2' }));
      const box = findLayer(d, 'f1')!.node as unknown as { children: SceneNode[] };
      box.children.push(createNode('rect', { id: 'new2', name: 'Fresh inner' }));
      d.variables.push({ id: 'v2', name: 'lives', type: 'number', initial: 3 });
      d.artboards[0].timelines.push({ id: 'tl2', name: 'Outro', duration: 500, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'trx', nodeId: 'new1', prop: 'opacity', keys: [] }, { id: 'try', nodeId: 't2', prop: 'opacity', keys: [] }], markers: [] });
      d.artboards[0].logic.nodes.push({ id: 'g2', kind: 'event.start', x: 0, y: 100, params: {} });
    });
    const plan = planTemplateUpdate(p, t2);
    expect(plan.changes.map((c) => c.key).sort()).toEqual(['g:g2', 'n:new1', 'n:new2', 't:tl2', 'v:v2']);
    expect(plan.changes.every((c) => c.kind === 'add')).toBe(true);
    p = edit(p, (d) => {
      applyTemplateUpdate(d, t2, plan.changes.map((c) => c.key), { version: 2 });
    });
    // t2 stays deleted; the new layer sits where the template has it (after Title)
    expect(p.artboards[0].children.map((n) => n.id)).toEqual(['t1', 'new1', 'f1']);
    expect((findLayer(p, 'f1')!.node as unknown as { children: SceneNode[] }).children.map((n) => n.id)).toEqual(['r1', 'new2']);
    expect(p.variables.map((v) => v.name)).toEqual(['score', 'lives']);
    // the new timeline loses the track on the layer that is gone here
    expect(p.artboards[0].timelines.find((x) => x.id === 'tl2')!.tracks.map((x) => x.id)).toEqual(['trx']);
    expect(p.artboards[0].logic.nodes.map((n) => n.id)).toEqual(['g1', 'g2']);
    expect(planTemplateUpdate(p, t2).changes).toEqual([]);
  });

  it('a new artboard comes whole, and nothing inside it is listed on its own', () => {
    const t = template();
    let p = useIt(t);
    const t2 = edit(t, (d) => {
      d.artboards.push({ ...JSON.parse(JSON.stringify(d.artboards[0])), id: 'ab2', name: 'Second', children: [createNode('text', { id: 'x1', name: 'On second' })], timelines: [], logic: { nodes: [], edges: [] } });
    });
    const plan = planTemplateUpdate(p, t2);
    expect(plan.changes.map((c) => c.key)).toEqual(['a:ab2']);
    p = edit(p, (d) => {
      applyTemplateUpdate(d, t2, ['a:ab2'], { version: 2 });
    });
    expect(p.artboards.map((a) => a.name)).toEqual(['Main', 'Second']);
    expect(p.artboards[1].children[0].id).toBe('x1');
    expect(planTemplateUpdate(p, t2).changes).toEqual([]);
  });

  it('a variable or timeline you changed is kept, one you did not is updated', () => {
    const t = template();
    let p = useIt(t);
    p = edit(p, (d) => {
      d.variables[0].initial = 10;
    });
    const t2 = edit(t, (d) => {
      d.variables[0].initial = 5;
      d.artboards[0].timelines[0].duration = 2000;
    });
    const plan = planTemplateUpdate(p, t2);
    expect(plan.changes.map((c) => c.key)).toEqual(['t:tl1']);
    expect(plan.kept.map((c) => c.key)).toEqual(['v:v1']);
  });

  it('reports parts removed from the template without removing yours', () => {
    const t = template();
    const p = useIt(t);
    const t2 = edit(t, (d) => {
      d.artboards[0].children = d.artboards[0].children.filter((n) => n.id !== 't2');
    });
    expect(planTemplateUpdate(p, t2)).toMatchObject({ changes: [], removed: 1 });
  });

  it('brings along the pictures and fonts a new layer needs, and the checklist items the author added', () => {
    const t = template();
    let p = useIt(t);
    const t2 = edit(t, (d) => {
      d.assets.push({ id: 'pic0000001', name: 'pic.png', mime: 'image/png', size: 1, width: 1, height: 1 } as never);
      d.fonts.push({ family: 'Lora', source: 'google', weights: [400] });
      d.artboards[0].children.push(createNode('image', { id: 'im1', name: 'Picture', assetId: 'pic0000001' }), createNode('text', { id: 'lx', name: 'Serif', text: 'x', fontFamily: 'Lora' }));
    });
    const plan = planTemplateUpdate(p, t2);
    let needs: { id: string }[] = [];
    p = edit(p, (d) => {
      needs = applyTemplateUpdate(d, t2, plan.changes.map((c) => c.key), { version: 2, checklist: [{ id: 'c9', text: 'Check the picture', nodeId: 'im1' }, { id: 'c1', text: 'ignored: already there' }] });
    });
    expect(needs.map((a) => a.id)).toEqual(['pic0000001']);
    expect(p.assets.map((a) => a.id)).toEqual(['pic0000001']);
    expect(p.fonts.map((f) => f.family)).toContain('Lora');
    expect(p.template!.checklist.map((i) => i.id)).toEqual(['c1', 'c2', 'c3', 'c9']);
    expect(p.template!.checklist[0].text).toBe('Replace the title');
  });

  it('only offers an update when a saved template has a higher version than the copy', () => {
    const p = useIt(template(), 2);
    expect(updateAvailable(p.template, 3)).toBe(true);
    expect(updateAvailable(p.template, 2)).toBe(false);
    expect(updateAvailable(p.template, null)).toBe(false);
    expect(updateAvailable(projectFromStarter(STARTERS[0]).template, 5)).toBe(false);
    expect(updateAvailable(undefined, 5)).toBe(false);
  });
});
