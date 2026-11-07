import { describe, expect, it } from 'vitest';
import { createNode, createProject, uid, type LogicNode, type Project } from 'interactives-player';
import { checkAccessibility, CHECKS, sensorRoutes } from '../src/lib/a11y/checks';
import { applyFix } from '../src/lib/a11y/fixes';

type N = [id: string, kind: string, params?: Record<string, unknown>];
type E = [from: string, to: string, port?: string];

/** A project with a button 'Go' and a button 'Type' on one artboard, and this logic. */
function project(nodes: N[], edges: E[], sensors: Project['settings']['sensors'] | null = { microphone: true }): Project {
  const p = createProject('Sensors');
  p.settings.title = 'Sensors';
  if (sensors) p.settings.sensors = sensors;
  const ab = p.artboards[0];
  ab.children.push(createNode('button', { id: 'go', name: 'Go', label: 'Speak', x: 0, y: 0, width: 120, height: 44 } as never), createNode('button', { id: 'type', name: 'Type', label: 'Type instead', x: 0, y: 60, width: 160, height: 44 } as never));
  ab.logic.nodes.push(...nodes.map(([id, kind, params], i): LogicNode => ({ id, kind, x: i * 90, y: 0, params: params ?? {} })));
  ab.logic.edges.push(...edges.map(([from, to, port]) => ({ id: uid('e'), from, fromPort: port ?? 'out', to, toPort: 'in' })));
  return p;
}
const found = (p: Project) => checkAccessibility(p).findings.filter((f) => f.check === 'sensors');

const click = (id: string, target: string): N => [id, 'event.pointer', { target, type: 'click' }];

describe('the sensors check', () => {
  it('is one rule in the list, with a fix written for the author', () => {
    const c = CHECKS.find((x) => x.id === 'sensors')!;
    expect(c.how).toContain('Type your answer instead');
    expect(c.how).toContain('No equal way to finish');
    expect(c.wcag).toContain('2.1.1');
  });

  it('says nothing about a project that declares no sensor', () => {
    expect(found(project([click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult']], [['c', 'rec'], ['rec', 'done']], null))).toEqual([]);
  });

  it('says nothing when nothing in the project finishes (nothing to be locked out of)', () => {
    expect(found(project([click('c', 'go'), ['rec', 'action.recordStart']], [['c', 'rec']]))).toEqual([]);
    expect(found(project([click('c', 'go'), ['rec', 'action.recordStart'], ['part', 'action.reportResult', { completed: 'progress' }]], [['c', 'rec'], ['rec', 'part']]))).toEqual([]);
  });

  it('is an issue when every way to finish goes through the microphone, with a clear message', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult', { completed: 'complete' }]], [['c', 'rec'], ['rec', 'done']]);
    const [f] = found(p);
    expect(f).toMatchObject({ severity: 'issue', title: 'Needs a microphone or camera to finish', nodeId: null });
    expect(f.detail).toContain('This activity uses your microphone.');
    expect(f.detail).toContain('Every way to finish (1 in all) goes through the microphone');
    expect(f.detail).toContain('Add a button or a typed answer that finishes without it');
    expect(f.fix?.input?.key).toBe('settings.sensors.noAlternative');
    expect(f.detail).not.toContain('—');
  });

  it('counts Listen live as a sensor node, and only its Could not start output as a way on', () => {
    const through = project([click('c', 'go'), ['on', 'action.listen'], ['done', 'action.reportResult']], [['c', 'on'], ['on', 'done']], { microphone: true, listen: true });
    expect(found(through)[0]).toMatchObject({ severity: 'issue', title: 'Needs a microphone or camera to finish' });
    const around = project([click('c', 'go'), ['on', 'action.listen'], ['done', 'action.reportResult']], [['c', 'on'], ['on', 'done', 'failed']], { microphone: true, listen: true });
    expect(found(around)).toEqual([]);
  });

  it('names what is used', () => {
    const p = project([click('c', 'go'), ['rec', 'action.cameraPreview'], ['done', 'action.artboard', { artboard: 'x' }]], [['c', 'rec'], ['rec', 'done']], { camera: true, photos: true });
    expect(found(p)[0].detail).toContain('through the camera and the photo picker');
  });

  it('passes when a click, key or typed change reaches a finish without the sensor', () => {
    const base: N[] = [click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult']];
    expect(found(project([...base, click('t', 'type'), ['alt', 'action.reportResult']], [['c', 'rec'], ['rec', 'done'], ['t', 'alt']]))).toEqual([]);
    expect(found(project([...base, ['k', 'event.key', { key: 'Enter' }], ['alt', 'action.artboard']], [['c', 'rec'], ['rec', 'done'], ['k', 'alt']]))).toEqual([]);
    expect(found(project([...base, ['v', 'event.variable', { variable: 'typed' }], ['alt', 'action.questionCheck']], [['c', 'rec'], ['rec', 'done'], ['v', 'alt']]))).toEqual([]);
  });

  it('counts carrying on from "could not start" as a way, and a branch on the state as one too', () => {
    const base: N[] = [click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult'], ['skip', 'action.reportResult']];
    expect(found(project(base, [['c', 'rec'], ['rec', 'done'], ['rec', 'skip', 'failed']]))).toEqual([]);
    const withIf: N[] = [click('c', 'go'), ['gate', 'logic.if', { condition: 'microphone == "ready"' }], ['rec', 'action.recordStart'], ['done', 'action.reportResult'], ['skip', 'action.reportResult']];
    expect(found(project(withIf, [['c', 'gate'], ['gate', 'rec', 'true'], ['rec', 'done'], ['gate', 'skip', 'false']]))).toEqual([]);
  });

  it('does not count the sensor path itself, or a finish that only an On microphone event reaches', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['ev', 'event.media', { when: 'ready' }], ['done', 'action.reportResult']], [['c', 'rec'], ['ev', 'done']]);
    expect(found(p)[0].severity).toBe('issue');
    const q = project([click('c', 'go'), ['play', 'action.recordPlay', { op: 'play' }], ['done', 'action.reportResult']], [['c', 'play'], ['play', 'done']]);
    expect(found(q)[0].severity).toBe('issue');
    const r = project([click('c', 'go'), ['ph', 'action.photo'], ['done', 'action.reportResult']], [['c', 'ph'], ['ph', 'done', 'none']]);
    expect(found(r)).toEqual([]);
  });

  it('follows the completion variable too', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['set', 'action.setVariable', { variable: 'vdone', op: 'set', value: 'true' }]], [['c', 'rec'], ['rec', 'set']]);
    p.variables.push({ id: 'vdone', name: 'done', type: 'boolean', initial: false });
    p.settings.reporting = { completion: 'variable', completionVariable: 'vdone' };
    expect(sensorRoutes(p)).toEqual({ finishes: 1, free: 0 });
    expect(found(p)[0].severity).toBe('issue');
  });

  it('counts finishes and free ones across artboards', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult'], click('t', 'type'), ['alt', 'action.reportResult']], [['c', 'rec'], ['rec', 'done'], ['t', 'alt']]);
    expect(sensorRoutes(p)).toEqual({ finishes: 2, free: 1 });
  });

  it('lets the author say why there is no equal way: the learner is told, and the check becomes a review', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult']], [['c', 'rec'], ['rec', 'done']]);
    const [f] = found(p);
    expect(applyFix(p, f.fix!, '')).toBe(false);
    expect(applyFix(p, f.fix!, 'This task assesses speaking')).toBe(true);
    expect(p.settings.sensors?.noAlternative).toBe('This task assesses speaking');
    const [g] = found(p);
    expect(g).toMatchObject({ severity: 'review', title: 'No equal way to finish (you said why)' });
    expect(g.detail).toContain('"This task assesses speaking"');
    expect(g.fix).toBeUndefined();
  });

  it('keeps one stable id, so marking it reviewed survives edits', () => {
    const p = project([click('c', 'go'), ['rec', 'action.recordStart'], ['done', 'action.reportResult']], [['c', 'rec'], ['rec', 'done']]);
    expect(found(p)[0].id).toBe('sensors:project:sensors');
    p.settings.sensors = { microphone: true, noAlternative: 'x' };
    expect(found(p)[0].id).toBe('sensors:project:sensors');
  });
});
