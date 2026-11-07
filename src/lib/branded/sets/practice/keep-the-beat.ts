//Keep the beat (tap version): a pulse plays and shows, drops out, and the learner keeps it going with Space, a tap anywhere or the big button.
//There is no metronome timer: a 16 ms clock reads Date.now() against the start time, so the beats are exact and only the click can jitter (by up to a frame).
//Taps are scored from Date.now() the moment they arrive, against the nearest beat, inside a tolerance window (ms, set per drill in the "presets" variable).
import { createNode, type LogicNode, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, solid, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { whenTrue } from '../assessment/gate';
import { announce, bind, click, clearVar, go, graph, setVar, toggleVar, variable } from '../assessment/shared';
import { boxText, heroPage, join } from '../drag/shared';
import { addPlaceholderSound } from '../media/sounds';

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

type G = ReturnType<typeof graph>;

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
    period: variable(project, 'period', 'number', 60000 / PRESETS[0].bpm),
    lead: variable(project, 'lead', 'number', PRESETS[0].lead),
    keep: variable(project, 'keep', 'number', KEEP),
    tol: variable(project, 'tol', 'number', PRESETS[0].tol),
    goal: variable(project, 'goal', 'number', 80),
    phase: variable(project, 'phase', 'string', 'idle'),
    startAt: variable(project, 'startAt', 'number', 0),
    beat: variable(project, 'beat', 'number', -1),
    lastBeat: variable(project, 'lastBeat', 'number', -1),
    judged: variable(project, 'judged', 'number', -1),
    flash: variable(project, 'flash', 'boolean', false),
    guide: variable(project, 'guide', 'boolean', false),
    marks: variable(project, 'marks', 'list', Array.from({ length: KEEP }, () => '')),
    hits: variable(project, 'hits', 'number', 0),
    streak: variable(project, 'streak', 'number', 0),
    best: variable(project, 'best', 'number', 0),
    bestEver: variable(project, 'bestEver', 'number', 0),
    stray: variable(project, 'stray', 'number', 0),
    accuracy: variable(project, 'accuracy', 'number', 0),
    taps: variable(project, 'taps', 'list', []),
    recent: variable(project, 'recent', 'list', []),
    slopeMs: variable(project, 'slopeMs', 'number', 0),
    drift: variable(project, 'drift', 'number', 0),
    driftText: variable(project, 'driftText', 'string', ''),
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

  const { page: hero, start } = heroPage(ctx, 'Keep the beat', 'Listen to the beat, then keep it going yourself. Tap with the Space bar, the big button or the screen, and see how steady you are.');
  const pick = brandedPage(ctx, 'Pick a drill', { name: 'Pick a drill', footer: 'Keep the beat' });
  const drill = brandedPage(ctx, 'Keep the beat', { name: 'Drill', footer: 'Scores are for comparing your own tries, not for measuring' });
  const results = brandedPage(ctx, 'Your result', { name: 'Results', footer: 'Scores are for comparing your own tries, not for measuring' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(pick));
    checklist.push(item('Write the title and the line under it on the first page', byName(hero, 'Subtitle'), hero));
  }

  //Pick a drill: a card for each entry of the "presets" list
  const pb = contentBox(pick);
  const chooseButtons: SceneNode[] = [];
  {
    const g = graph(pick);
    PRESETS.forEach((_, i) => {
      const x = pb.x + i * 320;
      const r = `presets[${i}]`;
      const panel = card(ctx, `Drill ${i + 1} card`, x, pb.y, 288, 330);
      const name = heading(ctx, `Drill ${i + 1} name`, PRESETS[i].name, x + 20, pb.y + 18, 248, { fontSize: 21, autoSize: 'none', height: 56, lineHeight: 1.2, bindings: { text: `${r}.name` } } as never);
      const rate = text(ctx, `Drill ${i + 1} tempo`, `${PRESETS[i].bpm} beats a minute`, x + 20, pb.y + 82, 248, { fontSize: 18, fontWeight: 700, bindings: { text: `${r}.bpm + " beats a minute"` } } as never);
      const about = text(ctx, `Drill ${i + 1} note`, PRESETS[i].note, x + 20, pb.y + 116, 248, { fontSize: 15, lineHeight: 1.35, color: L.muted, autoSize: 'none', height: 130, bindings: { text: `${r}.note` } } as never);
      const choose = button(ctx, `Choose drill ${i + 1}`, 'Choose', x + 20, pb.y + 262, 248, i === 0);
      choose.ariaLabel = `Choose ${PRESETS[i].name}`;
      bind(choose, { ariaLabel: `"Choose " + ${r}.name` });
      pick.children.push(panel, name, rate, about, choose);
      chooseButtons.push(choose);
      g.run(click(g, choose, `Choose drill ${i + 1}`), setVar(v.preset, String(i)), setVar(v.bpm, `${r}.bpm`), setVar(v.lead, `${r}.lead`), setVar(v.tol, `${r}.tol`), setVar(v.phase, '"idle"'), go(drill));
    });
    const how = text(ctx, 'How it works', `Each drill plays ${PRESETS[0].lead} beats you can hear and see. Then the click stops and you keep the beat going for ${KEEP} beats. Each beat marker turns green when your tap lands close enough. You can change the tempo on the next page.`, pb.x, pb.y + 350, pb.width, { fontSize: 16, lineHeight: 1.4, color: L.muted });
    pick.children.push(how);
    checklist.push(
      item('Rename, retune or reword the three drills: the "presets" variable (Variables tab) is a list with, for each drill, name, bpm (the starting tempo), min and max (what the + and - buttons allow), lead (beats played before the learner takes over), tol (how many milliseconds either side of a beat still counts) and note. Keep the three drills, or delete a card and its Choose button', chooseButtons[0], pick),
      item('The compression pace drill must stay worded as rhythm practice only: check its note still says so, and keep its tempo range to 100 to 120 beats a minute', byName(pick, 'Drill 2 note'), pick),
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
    //Beat markers: a tick in each when the tap landed, a cross when the beat went by. The mark is a symbol as well as a colour
    const markers = Array.from({ length: KEEP }, (_, i) => {
      const dot = createNode('ellipse', {
        name: `Beat marker ${i + 1}`,
        x: i * 58,
        y: 0,
        width: 40,
        height: 40,
        fill: solid(L.surfaceMuted),
        stroke: null,
        decorative: true,
        bindings: { 'fill.color': `marks[${i}] == "hit" ? "${L.success}" : marks[${i}] == "miss" ? "${L.error}" : "${L.surfaceMuted}"` },
      } as never);
      const mark = boxText(ctx, `Beat marker ${i + 1} mark`, String(i + 1), i * 58, 0, 40, 40, {
        fontSize: 15,
        fontWeight: 700,
        align: 'center',
        bindings: { text: `marks[${i}] == "hit" ? "✓" : marks[${i}] == "miss" ? "✗" : ${i + 1}`, color: `marks[${i}] == "" ? "${L.text}" : "${L.background}"` },
      } as never);
      return [dot, mark];
    }).flat();
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
      children: markers,
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

    //Start: everything back to nothing, then a short wait so the first beat is not on top of the press
    g.run(
      click(g, startBtn, 'Start'),
      setVar(v.period, '60000 / bpm'),
      setVar(v.startAt, 'Date.now() + 700'),
      setVar(v.lastBeat, '-1'),
      setVar(v.beat, '-1'),
      setVar(v.judged, '-1'),
      setVar(v.hits, '0'),
      setVar(v.streak, '0'),
      setVar(v.best, '0'),
      setVar(v.stray, '0'),
      setVar(v.lastTapAt, '0'),
      setVar(v.flash, 'false'),
      setVar(v.marks, JSON.stringify(Array.from({ length: KEEP }, () => ''))),
      clearVar(v.taps),
      clearVar(v.recent),
      setVar(v.drift, '0'),
      setVar(v.driftText, '"Keep tapping: I need a few taps to read your tempo."'),
      setVar(v.lastTap, '""'),
      setVar(v.phase, '"lead"'),
      announce('"Listen to " + lead + " beats, then keep the beat going."')
    );
    g.run(click(g, stopBtn, 'Stop'), setVar(v.phase, '"idle"'), setVar(v.flash, 'false'), ['action.stopSound', {}]);

    //The beat clock: reads Date.now() against the start time. The click plays on each new beat of the lead-in (and on all of them with the guide on)
    {
      const tick = g.event('event.timer', { ms: 16, repeat: true }, 'Beat clock');
      const running = g.then(tick, 'logic.if', { condition: 'phase == "lead" || phase == "keep"' });
      const read = whenTrue(g, running, setVar(v.beat, 'Math.floor((Date.now() - startAt) / period)'), setVar(v.flash, 'beat >= 0 && (beat < lead || guide) && (Date.now() - startAt - beat * period) < 130'));
      const fresh = g.then(read, 'logic.if', { condition: 'beat > lastBeat' });
      const moved = whenTrue(g, fresh, setVar(v.lastBeat, 'beat'), setVar(v.phase, 'beat >= lead ? "keep" : "lead"'));
      const audible = g.then(moved, 'logic.if', { condition: 'beat >= 0 && (beat < lead || guide)' });
      const accent = g.then(audible, 'logic.if', { condition: 'beat % 4 == 0' }, 'true');
      g.then(accent, 'action.sound', { asset: sounds.accent, continue: 'start' }, 'true');
      g.then(accent, 'action.sound', { asset: sounds.click, continue: 'start' }, 'false');
    }

    //Judging: a beat whose window has gone by without a tap is a miss and ends the streak. After the last one, the results
    {
      const tick = g.event('event.timer', { ms: 16, repeat: true }, 'Judge the beats');
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
      const over = g.then(marked, 'logic.if', { condition: 'judged >= keep - 1' });
      whenTrue(
        g,
        over,
        setVar(v.phase, '"done"'),
        setVar(v.flash, 'false'),
        setVar(v.accuracy, 'Math.round(100 * hits / keep)'),
        setVar(v.bestEver, 'Math.max(bestEver, best)'),
        ...driftSteps(v),
        announce('"You hit " + hits + " of " + keep + " beats, " + accuracy + " percent. " + driftText'),
        ['action.delay', { ms: 600 }],
        go(results)
      );
    }

    //A tap, from the screen, the Space bar or the big button (a keyboard press on the focused button arrives as its click). A second tap inside 120 ms is the same press arriving twice
    {
      const screen = g.event('event.pointer', { type: 'pointerdown' }, 'Tap anywhere on the screen');
      const space = g.event('event.key', { key: 'Space', type: 'keydown' }, 'Space bar');
      const padKey = click(g, pad, 'Big button, from the keyboard');
      const live = g.then(screen, 'logic.if', { condition: `(phase == "lead" || phase == "keep") && Date.now() - lastTapAt > ${TAP_GAP}` });
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
      const onBeat = g.then(inPlay, 'logic.if', { condition: 'k >= 0 && k < keep && Math.abs(err) <= tol && marks[k] != "hit"' }, 'true');
      whenTrue(
        g,
        onBeat,
        setVar(v.marks, 'marks.map((m, i) => i == k ? "hit" : m)'),
        setVar(v.hits, '1', 'add'),
        setVar(v.streak, '1', 'add'),
        setVar(v.best, 'Math.max(best, streak)'),
        ['action.setVariable', { variable: v.taps.id, op: 'push', value: '{k: k, e: err, at: tapAt}' }],
        setVar(v.lastTap, '"Beat " + (k + 1) + ": " + (err < 0 ? Math.abs(err) + " ms early" : err > 0 ? err + " ms late" : "dead on")'),
        ...driftSteps(v)
      );
      whenFalse(g, onBeat, setVar(v.stray, '1', 'add'), setVar(v.streak, '0'), setVar(v.lastTap, '"That tap missed the beat window (" + (err < 0 ? Math.abs(err) + " ms early" : err + " ms late") + ")"'));
    }
  }

  //The results: accuracy, streak, the goal and the tempo reading
  const rb = contentBox(results);
  {
    const figure = (name: string, x: number, label: string, big: string, caption: string) => {
      const panel = card(ctx, `${name} card`, x, rb.y, 288, 220);
      const l = text(ctx, `${name} label`, label, x + 24, rb.y + 20, 240, { fontSize: 17, fontWeight: 600, color: L.muted });
      const n = text(ctx, name, big, x + 24, rb.y + 52, 240, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 });
      const c = text(ctx, `${name} caption`, caption, x + 24, rb.y + 148, 240, { fontSize: 16, lineHeight: 1.3, autoSize: 'none', height: 58 } as never);
      results.children.push(panel, l, n, c);
      return n;
    };
    const acc = figure('Accuracy figure', rb.x, 'Accuracy', '{accuracy}%', '{hits} of {keep} beats landed inside the window');
    figure('Streak figure', rb.x + 320, 'Best streak', '{best}', 'Best this session: {bestEver}');
    figure('Goal figure', rb.x + 640, 'Goal', '{goal}%', '{accuracy >= goal ? "Goal reached. Well done." : "Not yet: " + (goal - accuracy) + " points to go."}');
    const tempoText = text(ctx, 'Tempo result', '{driftText}', rb.x, rb.y + 240, rb.width, { fontSize: 21, fontWeight: 700, lineHeight: 1.3 });
    const small = text(ctx, 'Taps note', 'Stray taps: {stray}. Scores are for comparing your own tries. A phone screen, a keyboard and a speaker each add a little delay of their own, so they are not a measurement.', rb.x, rb.y + 292, rb.width, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const again = button(ctx, 'Try again button', 'Try again', rb.x, rb.y + 372, 200);
    const other = button(ctx, 'Other drill button', 'Pick another drill', rb.x + 220, rb.y + 372, 240, false);
    results.children.push(tempoText, small, again, other);
    const g = graph(results);
    g.run(click(g, again, 'Try again'), setVar(v.phase, '"idle"'), go(drill));
    g.run(click(g, other, 'Pick another drill'), setVar(v.phase, '"idle"'), go(pick));
    g.run(g.event('event.start', {}, 'Results page'), announce('"Accuracy " + accuracy + " percent, best streak " + best + ". " + driftText'));
    checklist.push(item('Change the goal: the "goal" variable (Variables tab) is the accuracy in percent that counts as reaching it', acc, results));
  }

  checklist.push(
    item('Swap the two placeholder clicks for your own (Assets panel, the arrow beside each "(replace)" sound), or change the Play sound nodes on the beat clock in the Interactions tab. The accent is the first of every four beats', byName(drill, 'Start button'), drill),
    item('Tuning: the beat window is each drill\'s tol (milliseconds either side of the beat that still count) in the "presets" variable. Phone screens add their own delay, so try it on a real phone and widen it if good taps are being missed', byName(drill, 'Beat markers'), drill),
    item(`To change the number of beats you keep going (${KEEP}): the markers, the "keep" variable, the empty list in "marks" and the same list in the Set variable node that follows Start all need to agree`, byName(drill, 'Beat marker 1'), drill),
    item('Speak to the beat: the drill\'s script in "presets" needs one word for every beat you keep going (' + KEEP + '). Each word shows as its beat comes', byName(drill, 'Word to say'), drill),
    item('Reword the note on each drill and on the results page. Keep the compression pace worded as rhythm practice only', byName(drill, 'Drill note'), drill),
    item('Try it with the keyboard: press Space to tap, and Tab to the buttons. The beat is shown as well as heard (a flash and the markers), and the flash only changes colour for anyone who has asked for less motion', byName(drill, 'Tap pad'), drill),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, drill),
  );
  return { project, checklist };
}

/** The steps that work out how fast or slow the learner is running, from the taps of the last ten seconds. */
function driftSteps(v: Record<string, Variable>): [string, Record<string, unknown>][] {
  const half = 'Math.floor(recent.length / 2)';
  const last = `recent.slice(recent.length - ${half})`;
  const first = `recent.slice(0, ${half})`;
  return [
    setVar(v.recent, 'taps.filter(t => Date.now() - t.at <= 10000)'),
    //Each tap's error grows by the same amount from beat to beat when the tempo is off: the slope of error against beat (ms a beat), from the first half of the taps against the second
    setVar(v.slopeMs, `recent.length < 4 ? 0 : (${last}.reduce((a, t) => a + t.e, 0) - ${first}.reduce((a, t) => a + t.e, 0)) / (${last}.reduce((a, t) => a + t.k, 0) - ${first}.reduce((a, t) => a + t.k, 0))`),
    setVar(v.drift, 'Math.round(60000 / (period + slopeMs) - 60000 / period)'),
    setVar(v.driftText, 'recent.length < 4 ? "Keep tapping: I need a few taps to read your tempo." : Math.abs(drift) < 3 ? "Your tempo is steady: within 3 beats a minute of the target." : "You drifted about " + Math.abs(drift) + " beats a minute " + (drift > 0 ? "fast" : "slow") + " over the last ten seconds."'),
  ];
}

export const keepTheBeat: BrandedStarter = {
  key: 'practice/keep-the-beat',
  set: 'practice',
  name: 'Keep the beat',
  description: 'A tempo trainer: a pulse plays and shows, then drops out and you keep it going by tapping (Space, the big button or the screen). Beat markers turn green inside a tolerance window, with streak, accuracy and a plain readout of drift. Drills for music, a compression pace (rhythm practice only) and speaking pace.',
  tags: ['tempo', 'rhythm', 'pace', 'tapping'],
  build,
};
