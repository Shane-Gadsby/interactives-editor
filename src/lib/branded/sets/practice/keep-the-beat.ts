//Keep the beat (tap version): a pulse plays and shows, drops out, and the learner keeps it going with Space, a tap anywhere or the big button.
//There is no metronome timer: one steady 16 ms clock (held back by its Only while until a drill is running) reads Date.now() against the start time, so the
//beats are exact and only the click can jitter (by up to a frame). The drill cards and the beat markers are repeaters, and the tempo readout is live variables.
//Taps are scored from Date.now() the moment they arrive, against the nearest beat, inside a tolerance window (ms, set per drill in the "presets" variable).
import { createNode, type FrameNode, type LogicNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, solid, text, todo, type BrandedStarter, type LayoutState } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { join } from '../../graph-kit';
import { fill, stack } from '../../parts';
import { addVar as variable, announce, bind, boxText, click, go, goNext, goPrevious, graph, graphNote, heroPage, resetVars, setVar, toggleVar } from '../media/shared';
import { addPlaceholderSound } from '../media/sounds';
import { labelled } from './recording';

//Beats the learner has to keep going, and so how many markers there are (the layout is built for 16)
export const KEEP = 16;
//How far a beat's window stretches either side, in ms, is the drill's own `tol`. A tap this close to a beat counts for it
const TAP_GAP = 120;

//The three drills. bpm is where it starts, min and max what the + and - buttons allow, lead the beats played before the learner takes over, tol the window in ms
export const PRESETS = [
  { name: 'Music rhythm drill', bpm: 90, min: 60, max: 140, lead: 8, tol: 130, note: 'Listen to eight beats, then keep the beat going on your own when the click stops. Try it at a few different tempos.', script: '' },
  { name: 'Compression pace (rhythm practice only)', bpm: 110, min: 100, max: 120, lead: 8, tol: 150, note: 'Rhythm practice only. This is not first aid training and does not replace a course. The pace to practise is 100 to 120 beats a minute.', script: '' },
  { name: 'Speak to the beat', bpm: 120, min: 90, max: 150, lead: 8, tol: 160, note: 'Say one word on each beat and tap as you say it. A comfortable speaking pace is about 120 to 150 words a minute.', script: 'Today I want to explain why a steady pace helps every listener follow what I say.' },
];

//Each tap's error grows by the same amount from beat to beat when the tempo is off: the slope of error against beat (ms a beat), from the first half of the recent taps against the second
const HALF = 'Math.floor(recent.length / 2)';
const LAST = `recent.slice(recent.length - ${HALF})`;
const FIRST = `recent.slice(0, ${HALF})`;
const SLOPE = `recent.length < 4 ? 0 : (${LAST}.reduce((a, t) => a + t.e, 0) - ${FIRST}.reduce((a, t) => a + t.e, 0)) / (${LAST}.reduce((a, t) => a + t.k, 0) - ${FIRST}.reduce((a, t) => a + t.k, 0))`;

type G = ReturnType<typeof graph>;

//The steps that run when an If node holds (its `true` port), one after the other. Returns the last node.
function whenTrue(g: G, cond: LogicNode, ...steps: [string, Record<string, unknown>][]): LogicNode {
  const [first, ...rest] = steps;
  return g.run(g.then(cond, first[0], first[1], 'true'), ...rest);
}

//The If node's false branch, one step after another (whenTrue is the true one)
function whenFalse(g: G, cond: LogicNode, ...steps: [string, Record<string, unknown>][]): LogicNode {
  const [first, ...rest] = steps;
  return g.run(g.then(cond, first[0], first[1], 'false'), ...rest);
}

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Keep the beat');
  const { project, L } = ctx;
  const v = {
    presets: variable(project, 'presets', 'list', PRESETS),
    preset: variable(project, 'preset', 'number', 0),
    bpm: variable(project, 'bpm', 'number', PRESETS[0].bpm),
    //Live: what the chosen drill says, and the length of a beat from the tempo, so choosing a drill sets only its number and its tempo
    period: variable(project, 'period', 'number', 60000 / PRESETS[0].bpm, { formula: '60000 / bpm', live: true }),
    lead: variable(project, 'lead', 'number', PRESETS[0].lead, { formula: 'presets[preset].lead', live: true }),
    keep: variable(project, 'keep', 'number', KEEP),
    tol: variable(project, 'tol', 'number', PRESETS[0].tol, { formula: 'presets[preset].tol', live: true }),
    goal: variable(project, 'goal', 'number', 80),
    phase: variable(project, 'phase', 'string', 'idle'),
    startAt: variable(project, 'startAt', 'number', 0),
    beat: variable(project, 'beat', 'number', -1),
    lastBeat: variable(project, 'lastBeat', 'number', -1),
    judged: variable(project, 'judged', 'number', -1),
    flash: variable(project, 'flash', 'boolean', false),
    guide: variable(project, 'guide', 'boolean', false),
    //One empty mark for every beat to keep, worked out from `keep` (and again on Reset variables)
    marks: variable(project, 'marks', 'list', Array.from({ length: KEEP }, () => ''), { formula: 'Array.from({length: keep}, () => "")' }),
    hits: variable(project, 'hits', 'number', 0),
    streak: variable(project, 'streak', 'number', 0),
    best: variable(project, 'best', 'number', 0),
    bestEver: variable(project, 'bestEver', 'number', 0),
    stray: variable(project, 'stray', 'number', 0),
    accuracy: variable(project, 'accuracy', 'number', 0, { formula: 'Math.round(100 * hits / keep)', live: true }),
    taps: variable(project, 'taps', 'list', []),
    //Live: the taps of the last ten seconds, and how fast or slow they say the learner is running (the slope of each tap's error against its beat, first half of the taps against the second)
    recent: variable(project, 'recent', 'list', [], { formula: 'taps.filter(t => Date.now() - t.at <= 10000)', live: true }),
    slopeMs: variable(project, 'slopeMs', 'number', 0, { formula: SLOPE, live: true }),
    drift: variable(project, 'drift', 'number', 0, { formula: 'Math.round(60000 / (period + slopeMs) - 60000 / period)', live: true }),
    driftText: variable(project, 'driftText', 'string', 'Keep tapping: I need a few taps to read your tempo.', { formula: 'recent.length < 4 ? "Keep tapping: I need a few taps to read your tempo." : Math.abs(drift) < 3 ? "Your tempo is steady: within 3 beats a minute of the target." : "You drifted about " + Math.abs(drift) + " beats a minute " + (drift > 0 ? "fast" : "slow") + " over the last ten seconds."', live: true }),
    lastTap: variable(project, 'lastTap', 'string', ''),
    tapAt: variable(project, 'tapAt', 'number', 0),
    lastTapAt: variable(project, 'lastTapAt', 'number', 0),
    rel: variable(project, 'rel', 'number', 0),
    k: variable(project, 'k', 'number', 0),
    err: variable(project, 'err', 'number', 0),
    relNow: variable(project, 'relNow', 'number', 0),
    closed: variable(project, 'closed', 'number', -1),
    newMiss: variable(project, 'newMiss', 'number', 0),
  };
  const sounds = {
    click: addPlaceholderSound(project, 'Beat click (replace).wav', [{ hz: 1000, ms: 45, level: 0.9 }]),
    accent: addPlaceholderSound(project, 'Accent click (replace).wav', [{ hz: 1500, ms: 55, level: 0.95 }]),
  };

  const { page: hero, start } = heroPage(ctx, 'Keep the beat', 'Listen to the beat, then keep it going yourself. Tap with the Space bar, the big button or the screen, and see how steady you are.', 'Start', 'Start button');
  hero.name = 'Start';
  const pick = brandedPage(ctx, 'Pick a drill', { name: 'Pick a drill', footer: 'Keep the beat' });
  const drill = brandedPage(ctx, 'Keep the beat', { name: 'Drill', footer: 'Scores are for comparing your own tries, not for measuring' });
  const results = brandedPage(ctx, 'Your result', { name: 'Results', footer: 'Scores are for comparing your own tries, not for measuring' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
    checklist.push(item('Write the title and the line under it on the first page', byName(hero, 'Subtitle'), hero));
  }

  //Pick a drill: a card for each entry of the "presets" list (a repeater, so one flow serves every drill and a drill added to the list gets its card)
  const pb = contentBox(pick);
  let chooseButton: SceneNode;
  {
    const g = graph(pick);
    const name = heading(ctx, 'Drill name', '{item.name}', 20, 18, 248, { fontSize: 21, autoSize: 'none', height: 56, lineHeight: 1.2 } as never);
    const rate = text(ctx, 'Drill tempo', '{item.bpm} beats a minute', 20, 82, 248, { fontSize: 18, fontWeight: 700 });
    const about = text(ctx, 'Drill note', '{item.note}', 20, 116, 248, { fontSize: 15, lineHeight: 1.35, color: L.muted, autoSize: 'none', height: 130 });
    const choose = bind(button(ctx, 'Choose drill', 'Choose', 20, 262, 248, true), { ariaLabel: '"Choose " + item.name' });
    chooseButton = choose;
    const panel = createNode('frame', { name: 'Drill card', x: 0, y: 0, width: 288, height: 330, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false, role: 'region', children: [name, rate, about, choose] }) as FrameNode;
    const drills = createNode('frame', { name: 'Drills', x: pb.x, y: pb.y, width: pb.width, height: 330, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Drills', repeat: { items: 'presets', layout: 'grid', gap: 32, columns: 3 }, children: [panel] } as never) as FrameNode;
    const how = text(ctx, 'How it works', `Each drill plays ${PRESETS[0].lead} beats you can hear and see. Then the click stops and you keep the beat going for ${KEEP} beats. Each beat marker turns green when your tap lands close enough. You can change the tempo on the next page.`, pb.x, pb.y + 350, pb.width, { fontSize: 16, lineHeight: 1.4, color: L.muted });
    pick.children.push(drills, how);
    //One flow for every card: the number and the tempo are all that is set, the lead-in and the window follow the drill (live)
    g.run(click(g, choose, 'Choose a drill'), setVar(v.preset, 'event.index'), setVar(v.bpm, 'presets[event.index].bpm'), setVar(v.phase, '"idle"'), goNext());
    checklist.push(
      todo('Rename, retune or reword the drills', 'Rename, retune or reword the drills: the "presets" variable (Variables tab) is a list with, for each drill, name, bpm (the starting tempo), min and max (what the + and - buttons allow), lead (beats played before the learner takes over), tol (how many milliseconds either side of a beat still counts) and note. Each entry is a card with its own Choose button, up to three across', chooseButton, pick),
      todo('Keep the compression pace drill as rhythm practice only', 'The compression pace drill must stay worded as rhythm practice only: check its note still says so, and keep its tempo range to 100 to 120 beats a minute', drills, pick),
    );
  }

  //The drill page
  const b = contentBox(drill);
  const ids: Record<string, SceneNode> = {};
  {
    const status = text(ctx, 'Status', 'Press Start', b.x, b.y, b.width, {
      fontSize: 21,
      fontWeight: 700,
      autoSize: 'none',
      height: 34,
      bindings: {
        text: `phase == "idle" ? "Press Start. You will hear " + lead + " beats, then keep the beat going yourself." : phase == "lead" ? (lastBeat >= lead - 1 ? "Get ready: the next beat is yours" : "Listen to the beat") : phase == "keep" ? "Your turn: keep the beat going (" + Math.max(0, Math.min(keep, lastBeat - lead + 1)) + " of " + keep + ")" : "Done"`,
      },
    } as never);
    //The pulse. It only changes colour (and grows a little when the viewer has not asked for less motion)
    const pulse = createNode('ellipse', {
      name: 'Pulse',
      x: b.x + 12,
      y: b.y + 58,
      width: 148,
      height: 148,
      fill: solid(L.surfaceMuted),
      stroke: { paint: solid(L.border), width: 3 },
      decorative: true,
      bindings: {
        'fill.color': `flash ? "${L.accent}" : "${L.surfaceMuted}"`,
        width: 'flash && !reducedMotion ? 172 : 148',
        height: 'flash && !reducedMotion ? 172 : 148',
        x: `flash && !reducedMotion ? ${b.x} : ${b.x + 12}`,
        y: `flash && !reducedMotion ? ${b.y + 46} : ${b.y + 58}`,
      },
    } as never);
    const cx = b.x + 200;
    const tempo = heading(ctx, 'Tempo', '{bpm} beats a minute', cx, b.y + 58, 420, { fontSize: 30, headingLevel: 2 });
    const drillName = text(ctx, 'Drill name', '{presets[preset].name}', cx, b.y + 100, 420, { fontSize: 16, color: L.muted });
    const slower = button(ctx, 'Slower button', '- 5', cx, b.y + 136, 72, false);
    slower.ariaLabel = 'Five beats a minute slower';
    const faster = button(ctx, 'Faster button', '+ 5', cx + 84, b.y + 136, 72, false);
    faster.ariaLabel = 'Five beats a minute faster';
    bind(slower, { disabled: 'phase != "idle" || bpm <= presets[preset].min' });
    bind(faster, { disabled: 'phase != "idle" || bpm >= presets[preset].max' });
    const guide = bind(button(ctx, 'Guide switch', 'Guide pulse: off', cx + 172, b.y + 136, 220, false), { label: 'guide ? "Guide pulse: on" : "Guide pulse: off"', disabled: 'phase != "idle"' });
    guide.ariaDescription = 'On keeps the click and the flash going while you tap, which is easier. Off, they stop and you keep the beat yourself.';
    const word = text(ctx, 'Word to say', '', cx, b.y + 192, 420, { fontSize: 24, fontWeight: 700, autoSize: 'none', height: 32, bindings: { text: 'presets[preset].script != "" && phase == "keep" && lastBeat >= lead ? presets[preset].script.split(" ")[lastBeat - lead] ?? "" : ""' } } as never);
    const startBtn = bind(button(ctx, 'Start button', 'Start', b.x + 664, b.y + 58, 264), { visible: 'phase == "idle"' });
    const stopBtn = bind(button(ctx, 'Stop button', 'Stop', b.x + 664, b.y + 58, 264, false), { visible: 'phase == "lead" || phase == "keep"' });
    const aside = text(ctx, 'Drill note', '{presets[preset].note}', b.x + 664, b.y + 118, 264, { fontSize: 14, lineHeight: 1.3, color: L.muted, autoSize: 'none', height: 112 } as never);
    //Beat markers: a repeater over the marks, a tick in each when the tap landed, a cross when the beat went by. The mark is a symbol as well as a colour
    const dot = createNode('ellipse', { name: 'Beat marker', x: 0, y: 0, width: 40, height: 40, fill: solid(L.surfaceMuted), stroke: null, decorative: true, bindings: { 'fill.color': `item == "hit" ? "${L.success}" : item == "miss" ? "${L.error}" : "${L.surfaceMuted}"` } } as never);
    const mark = boxText(ctx, 'Beat marker mark', '{index + 1}', 0, 0, 40, 40, { fontSize: 15, fontWeight: 700, align: 'center', bindings: { text: 'item == "hit" ? "✓" : item == "miss" ? "✗" : index + 1', color: `item == "" ? "${L.text}" : "${L.background}"` } } as never);
    const cell = createNode('frame', { name: 'Beat marker cell', x: 0, y: 0, width: 40, height: 40, fill: null, stroke: null, clip: false, decorative: true, children: [dot, mark] }) as FrameNode;
    const row = createNode('frame', {
      name: 'Beat markers',
      x: b.x,
      y: b.y + 236,
      width: b.width,
      height: 40,
      fill: null,
      stroke: null,
      clip: false,
      role: 'image',
      ariaLabel: 'Beat markers',
      bindings: { ariaLabel: '"Beat markers: " + hits + " of " + keep + " beats on the beat"' },
      repeat: { items: 'marks', layout: 'grid', gap: 18, columns: KEEP },
      children: [cell],
    } as never);
    const pad = button(ctx, 'Tap pad', 'Tap here, press Space, or tap anywhere', b.x, b.y + 292, b.width);
    Object.assign(pad, { height: 90, cornerRadius: 24, fontSize: 24 });
    pad.ariaLabel = 'Tap the beat. You can also press the space bar.';
    const accuracy = text(ctx, 'Accuracy', '', b.x, b.y + 398, 220, { fontSize: 22, fontWeight: 700, bindings: { text: '"Accuracy " + Math.round(100 * hits / Math.max(1, hits + marks.filter(m => m == "miss").length)) + "%"' } } as never);
    const streak = text(ctx, 'Streak', '', b.x + 240, b.y + 398, 280, { fontSize: 22, fontWeight: 700, bindings: { text: '"Streak " + streak + " (best " + best + ")"' } } as never);
    const readout = text(ctx, 'Tempo readout', '{driftText}', b.x + 540, b.y + 398, 388, { fontSize: 16, fontWeight: 600, lineHeight: 1.3 });
    const last = text(ctx, 'Last tap', '{lastTap}', b.x, b.y + 434, 520, { fontSize: 15, color: L.muted });
    drill.children.push(status, pulse, tempo, drillName, slower, faster, guide, word, startBtn, stopBtn, aside, row, pad, accuracy, streak, readout, last);
    Object.assign(ids, { status, startBtn, stopBtn, pad, row, slower, aside, tempo, readout });

    const g = graph(drill);

    //Tempo and the guide switch
    g.run(click(g, slower, 'Slower'), setVar(v.bpm, 'Math.max(presets[preset].min, bpm - 5)'));
    g.run(click(g, faster, 'Faster'), setVar(v.bpm, 'Math.min(presets[preset].max, bpm + 5)'));
    g.run(click(g, guide, 'Guide pulse'), toggleVar(v.guide));

    //Start: everything back to nothing (one Reset variables node, the live ones follow by themselves), then a short wait so the first beat is not on top of the press
    g.run(
      click(g, startBtn, 'Start'),
      setVar(v.startAt, 'Date.now() + 700'),
      resetVars(v.lastBeat, v.beat, v.judged, v.hits, v.streak, v.best, v.stray, v.lastTapAt, v.flash, v.marks, v.taps, v.lastTap),
      setVar(v.phase, '"lead"'),
      announce('"Listen to " + lead + " beats, then keep the beat going."')
    );
    g.run(click(g, stopBtn, 'Stop'), setVar(v.phase, '"idle"'), setVar(v.flash, 'false'), ['action.stopSound', {}]);

    graphNote(drill, { anchor: labelled(drill, /^Start$/), colour: 'sky', text: '**Start sets startAt 700 ms ahead** so the first beat is not on top of the press, and one Reset variables puts every score back (the live ones follow on their own). The lead-in plays first, then the learner keeps the beat.' });

    //One steady clock for both jobs, held back (Only while) until a drill is running. It reads Date.now() against the start time. The click plays on each new
    //beat of the lead-in (and on all of them with the guide on), and a beat whose window has gone by without a tap is a miss that ends the streak
    {
      const tick = g.event('event.timer', { ms: 16, repeat: true, steady: true, while: 'phase == "lead" || phase == "keep"' }, 'Beat clock');
      const read = g.run(tick, setVar(v.beat, 'Math.floor((Date.now() - startAt) / period)'), setVar(v.flash, 'beat >= 0 && (beat < lead || guide) && (Date.now() - startAt - beat * period) < 130'));
      const fresh = g.then(read, 'logic.if', { condition: 'beat > lastBeat' });
      const moved = whenTrue(g, fresh, setVar(v.lastBeat, 'beat'), setVar(v.phase, 'beat >= lead ? "keep" : "lead"'));
      const audible = g.then(moved, 'logic.if', { condition: 'beat >= 0 && (beat < lead || guide)' });
      const accent = g.then(audible, 'logic.if', { condition: 'beat % 4 == 0' }, 'true');
      g.then(accent, 'action.sound', { asset: sounds.accent, continue: 'start' }, 'true');
      g.then(accent, 'action.sound', { asset: sounds.click, continue: 'start' }, 'false');

      graphNote(drill, { anchor: tick, colour: 'sky', text: '**One steady clock does the beat and the judging.** Its *Only while* holds it back until a drill runs, and it reads `Date.now()` against `startAt` instead of counting ticks, so a slow frame cannot drift the tempo.' });
      //Judging, off the same clock. After the last beat, the results
      const keeping = g.then(tick, 'logic.if', { condition: 'phase == "keep"' });
      const where = whenTrue(g, keeping, setVar(v.relNow, '(Date.now() - startAt) / period - lead'), setVar(v.closed, 'Math.min(keep - 1, Math.floor(relNow - tol / period))'));
      const some = g.then(where, 'logic.if', { condition: 'closed > judged' });
      const marked = whenTrue(
        g,
        some,
        setVar(v.newMiss, 'marks.slice(judged + 1, closed + 1).filter(m => m == "").length'),
        setVar(v.marks, 'marks.map((m, i) => i <= closed && m == "" ? "miss" : m)'),
        setVar(v.streak, 'newMiss > 0 ? 0 : streak'),
        setVar(v.judged, 'closed')
      );
      graphNote(drill, { anchor: keeping, colour: 'sky', text: '**A beat whose window has gone by with no tap is closed as a miss** and ends the streak, so a learner who stops tapping still reaches the results after the last beat.' });
      const over = g.then(marked, 'logic.if', { condition: 'judged >= keep - 1' });
      whenTrue(
        g,
        over,
        setVar(v.phase, '"done"'),
        setVar(v.flash, 'false'),
        setVar(v.bestEver, 'Math.max(bestEver, best)'),
        announce('"You hit " + hits + " of " + keep + " beats, " + accuracy + " percent. " + driftText'),
        ['action.delay', { ms: 600 }],
        goNext()
      );
    }

    //A tap, from the screen, the Space bar or the big button (a keyboard press on the focused button arrives as its click). A second tap inside 120 ms is the same press arriving twice
    {
      const screen = g.event('event.pointer', { type: 'pointerdown' }, 'Tap anywhere on the screen');
      const space = g.event('event.key', { key: 'Space', type: 'keydown' }, 'Space bar');
      const padKey = click(g, pad, 'Big button, from the keyboard');
      const live = g.then(screen, 'logic.if', { condition: `(phase == "lead" || phase == "keep") && Date.now() - lastTapAt > ${TAP_GAP}` });
      graphNote(drill, { anchor: screen, colour: 'sky', text: '**The screen, the Space bar and the big button share one If.** A second tap inside 120 ms is dropped as the same press arriving twice (a keyboard press on a focused button is a click too).' });
      join(drill, space, live);
      join(drill, padKey, live);
      //The tap's moment, taken the instant it arrives, then which beat it is nearest to and how far off it was (ms, early is negative)
      const stamped = whenTrue(
        g,
        live,
        setVar(v.tapAt, 'Date.now()'),
        setVar(v.lastTapAt, 'tapAt'),
        setVar(v.rel, '(tapAt - startAt) / period - lead'),
        setVar(v.k, 'Math.round(rel)'),
        setVar(v.err, 'Math.round((rel - k) * period)')
      );
      //Taps during the lead-in are free practice; only taps from half a beat before the first beat to the last count
      const inPlay = g.then(stamped, 'logic.if', { condition: 'rel > -0.5 && rel < keep - 0.5' });
      graphNote(drill, { anchor: live, colour: 'sky', text: '**A tap becomes k, the nearest beat, and err, how many ms off** (early is negative), the instant it arrives. [ ] The window either side of a beat is each drill\'s `tol` in `presets`.' });
      const onBeat = g.then(inPlay, 'logic.if', { condition: 'k >= 0 && k < keep && Math.abs(err) <= tol && marks[k] != "hit"' }, 'true');
      whenTrue(
        g,
        onBeat,
        setVar(v.marks, 'marks.map((m, i) => i == k ? "hit" : m)'),
        setVar(v.hits, '1', 'add'),
        setVar(v.streak, '1', 'add'),
        setVar(v.best, 'Math.max(best, streak)'),
        setVar(v.taps, '{k: k, e: err, at: tapAt}', 'push'),
        setVar(v.lastTap, '"Beat " + (k + 1) + ": " + (err < 0 ? Math.abs(err) + " ms early" : err > 0 ? err + " ms late" : "dead on")')
      );
      whenFalse(g, onBeat, setVar(v.stray, '1', 'add'), setVar(v.streak, '0'), setVar(v.lastTap, '"That tap missed the beat window (" + (err < 0 ? Math.abs(err) + " ms early" : err + " ms late") + ")"'));
    }
  }

  //The results: accuracy, streak, the goal and the tempo reading
  const rb = contentBox(results);
  {
    const figure = (name: string, label: string, big: string, caption: string) => {
      const l = text(ctx, `${name} label`, label, 0, 0, 240, { fontSize: 17, fontWeight: 600, color: L.muted });
      const n = text(ctx, name, big, 0, 0, 240, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 });
      const c = text(ctx, `${name} caption`, caption, 0, 0, 240, { fontSize: 16, lineHeight: 1.3 });
      return { card: fill(stack(`${name} card`, 0, 0, 288, { gap: 8, padding: 24, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [l, n, c] })), n };
    };
    const accuracyCard = figure('Accuracy figure', 'Accuracy', '{accuracy}%', '{hits} of {keep} beats landed inside the window');
    const streakCard = figure('Streak figure', 'Best streak', '{best}', 'Best this session: {bestEver}');
    const goalCard = figure('Goal figure', 'Goal', '{goal}%', '{accuracy >= goal ? "Goal reached. Well done." : "Not yet: " + (goal - accuracy) + " points to go."}');
    const acc = accuracyCard.n;
    const figures = stack('Result figures', 0, 0, rb.width, { direction: 'row', gap: 32, align: 'start', children: [accuracyCard.card, streakCard.card, goalCard.card] });
    const tempoText = text(ctx, 'Tempo result', '{driftText}', 0, 0, rb.width, { fontSize: 21, fontWeight: 700, lineHeight: 1.3 });
    const small = text(ctx, 'Taps note', 'Stray taps: {stray}. Scores are for comparing your own tries. A phone screen, a keyboard and a speaker each add a little delay of their own, so they are not a measurement.', 0, 0, rb.width, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const again = button(ctx, 'Try again button', 'Try again', 0, 0, 200);
    const other = button(ctx, 'Other drill button', 'Pick another drill', 0, 0, 240, false);
    const buttons = stack('Result buttons', 0, 0, rb.width, { direction: 'row', gap: 20, align: 'start', children: [again, other] });
    results.children.push(stack('Result column', rb.x, rb.y, rb.width, { gap: 20, children: [figures, tempoText, small, buttons] }));
    const g = graph(results);
    g.run(click(g, again, 'Try again'), setVar(v.phase, '"idle"'), goPrevious());
    g.run(click(g, other, 'Pick another drill'), setVar(v.phase, '"idle"'), go(pick));
    g.run(g.event('event.start', {}, 'Results page'), announce('"Accuracy " + accuracy + " percent, best streak " + best + ". " + driftText'));
    graphNote(results, { anchor: labelled(results, /^Results page$/), colour: 'sky', text: '**The results page reads itself aloud** from the live `accuracy`, `best` and `driftText`, the same ones the screen shows. Try again and Pick another drill both put `phase` back to idle first, so the beat clock stays off.' });
    checklist.push(todo('Change the accuracy goal', 'Change the goal: the "goal" variable (Variables tab) is the accuracy in percent that counts as reaching it', acc, results));
  }

  //Notes for whoever edits the template, below each page
  const below = (page: typeof pick, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(pick, { ...below(pick, 0, 440), text: '**Repeater** The drill cards are one card repeated over `presets`, with one flow that sets the drill\'s number and tempo. `lead`, `tol` and `period` are live variables that follow it.', colour: 'sky' });
  addNote(drill, { ...below(drill, 0, 440), text: '**One clock** A single steady 16 ms timer, held back by Only while until a drill runs, plays the click and judges the beats. [ ] Widen `tol` in `presets` if good taps on a phone are being missed.', colour: 'sky' });
  addNote(drill, { ...below(drill, 456, 440), text: '**Live variables** `recent`, `slopeMs`, `drift`, `driftText` and `accuracy` are worked out from the taps, so no step recalculates the tempo reading.', colour: 'gold' });
  addNote(results, { ...below(results, 0, 440), text: '[ ] Set the `goal` percentage. Scores are for comparing a learner\'s own tries, never a measurement, and the compression drill stays worded as rhythm practice only.', colour: 'orange' });

  checklist.push(
    todo('Swap the placeholder clicks for your own sounds', 'Swap the two placeholder clicks for your own (Assets panel, the arrow beside each "(replace)" sound), or change the Play sound nodes on the beat clock in the Interactions tab. The accent is the first of every four beats', byName(drill, 'Start button'), drill),
    todo('Tune the beat window and try it on a real phone', 'Tuning: the beat window is each drill\'s tol (milliseconds either side of the beat that still count) in the "presets" variable. Phone screens add their own delay, so try it on a real phone and widen it if good taps are being missed', byName(drill, 'Beat markers'), drill),
    todo('Change how many beats you keep going', `To change the number of beats you keep going (${KEEP}): change the "keep" variable. The markers are a repeater over "marks", which is worked out from it, so they follow (the row is laid out for ${KEEP} across)`, byName(drill, 'Beat markers'), drill),
    todo('Write one word for every beat you keep going', 'Speak to the beat: the drill\'s script in "presets" needs one word for every beat you keep going (' + KEEP + '). Each word shows as its beat comes', byName(drill, 'Word to say'), drill),
    todo('Reword the note on each drill and the results page', 'Reword the note on each drill and on the results page. Keep the compression pace worded as rhythm practice only', byName(drill, 'Drill note'), drill),
    todo('Try it with the keyboard only', 'Try it with the keyboard: press Space to tap, and Tab to the buttons. The beat is shown as well as heard (a flash and the markers), and the flash only changes colour for anyone who has asked for less motion', byName(drill, 'Tap pad'), drill),
    todo('Pick a colourway (the brand parts are locked)', 'Pick the colourway on the Themes tab. The brand parts are locked', undefined, drill),
  );
  return { project, checklist };
}

/** States for the layout check: the drill running with some taps in, the results page with a long reading, and the picker. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'running', page: 'Drill', vars: { phase: 'keep', lastBeat: 12, hits: 9, streak: 4, best: 7, marks: ['hit', 'hit', 'miss', 'hit', 'hit', 'hit', 'hit', 'hit', 'hit', 'hit', '', '', '', '', '', ''], lastTap: 'Beat 9: 112 ms early' } },
  { label: 'done', page: 'Results', vars: { hits: 12, best: 9, bestEver: 11, stray: 3 } },
];

export const keepTheBeat: BrandedStarter = {
  key: 'practice/keep-the-beat',
  set: 'practice',
  name: 'Keep the beat',
  description: 'A tempo trainer: a pulse plays and shows, then drops out and you keep it going by tapping (Space, the big button or the screen). Beat markers turn green inside a tolerance window, with streak, accuracy and a plain readout of drift. Drills for music, a compression pace (rhythm practice only) and speaking pace.',
  tags: ['tempo', 'rhythm', 'pace', 'tapping'],
  build,
  layoutStates: LAYOUT_STATES,
};
