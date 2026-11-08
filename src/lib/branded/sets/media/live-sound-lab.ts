//Live sound lab: the microphone drives the screen and nothing is recorded. Two scenes after the hero page: a loudness meter with a target band
//(steady volume practice, or a workplace noise check worded as a rough guide) and eight frequency bars ("whistle higher, what changed?").
//The numbers are micLevel and micBands, which the player keeps up to date about 25 times a second while a Listen live node has the microphone on.
//Every display reads `listening ? micLevel : simLevel` (and the same for the bands), and a slider makes simLevel and simPitch, so each scene
//works with no microphone at all: denied, no device, blocked by the course page, switched off by the learner, or just a quiet room.
//The band edges and the loudest band are live variables (nothing polls for them), and the meter is a native Progress layer read out as a meter.
//Phone and laptop microphones tidy the sound themselves (automatic gain, noise removal), so the starter says "rough guide" wherever it shows a level.
//No pitch tracking: the bars show where the sound is, not which note it is.
import { createNode, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, barY, brandedPage, brandedProject, button, byName, contentBox, heading, solid, stroke, text, todo, type BrandedStarter, type LayoutState } from '\.\./\.\./kit';
import { BRAND_FONT } from '../../looks';
import { Graph, addVar, announce, bind, go, goNext, goPrevious, graphNote, heroPage, resetVars, set, toggleVar } from './shared';

//The meter's width, and the bars' plot height, in page pixels
const W = 576;
const H = 248;

//The bands the page reports, low to high (the player's BAND_EDGES: 80 to 8000 Hz, log-spaced). What each is "roughly" is only a guide
const BANDS = [
  { label: '80-140', what: 'very low hum' },
  { label: '140-250', what: 'low voice' },
  { label: '250-450', what: 'voice' },
  { label: '450-800', what: 'voice and vowels' },
  { label: '0.8-1.4k', what: 'voice and whistling' },
  { label: '1.4-2.5k', what: 'whistling and "ee" vowels' },
  { label: '2.5-4.5k', what: 'high whistling and "sh" sounds' },
  { label: '4.5-8k', what: '"s" and "f" hiss' },
];

//What the displays read: the live microphone while listening, the slider otherwise
const LEVEL = '(listening ? micLevel : simLevel)';
const NOW = '(listening ? micBands : [0, 1, 2, 3, 4, 5, 6, 7].map(i => simLevel * Math.max(0, 1 - Math.abs(i - simPitch) / 1.8)))';
const IDLE = '(!listening && simLevel == 0)';

const noMic = 'microphone == "ready" ? "Nothing is recorded. The page only measures the sound." : (mediaMessage != "" ? mediaMessage : "There is no microphone here.") + " Use the slider instead."';

function build(colourway: Parameters<BrandedStarter['build']>[0]) {
  const ctx = brandedProject(colourway, 'Live sound lab');
  const { project, L } = ctx;
  //Listening only, and never recording: the page refuses every Start recording, and the consent screen says so
  project.settings.sensors = { microphone: true, listen: true, listenOnly: true, purpose: 'move a meter and some bars with the sound around you' };

  const use = addVar(project, 'use', 'string', 'steady');
  addVar(project, 'steadyLo', 'number', 0.35);
  addVar(project, 'steadyHi', 'number', 0.6);
  addVar(project, 'noiseLine', 'number', 0.7);
  //Live variables: the band to aim for follows the mode, and the loudest band follows whatever the displays read, so no step sets either
  addVar(project, 'bandLo', 'number', 0.35, { formula: 'use == "steady" ? steadyLo : 0', live: true });
  addVar(project, 'bandHi', 'number', 0.6, { formula: 'use == "steady" ? steadyHi : noiseLine', live: true });
  const simLevel = addVar(project, 'simLevel', 'number', 0);
  const simPitch = addVar(project, 'simPitch', 'number', 3);
  const zone = addVar(project, 'zone', 'string', 'low');
  const steady = addVar(project, 'steady', 'number', 0);
  const best = addVar(project, 'best', 'number', 0);
  addVar(project, 'peak', 'number', -1, { formula: `Math.max(...${NOW}) < 0.08 ? -1 : ${NOW}.indexOf(Math.max(...${NOW}))`, live: true });
  const shown = addVar(project, 'shown', 'boolean', false);
  addVar(project, 'bandLabels', 'list', BANDS);

  const hero = heroPage(ctx, 'Live sound lab', 'Watch your voice move a loudness meter and a set of sound bars. The microphone only measures, and nothing is recorded.');
  const meter = brandedPage(ctx, 'How loud am I?', { footer: 'Live sound lab. A rough guide, nothing is recorded' });
  const bars = brandedPage(ctx, 'Which sounds are high, which are low?', { footer: 'Live sound lab. A rough guide, nothing is recorded' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(todo('Write the title and keep the nothing-is-recorded sentence', 'Write the title and the line under it on the first page. Keep the sentence that says nothing is recorded: it is true, and it is the reason a learner can say yes', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  const box = contentBox(meter);
  const rx = box.x + W + 32;
  const rw = box.width - W - 32;

  //A slider that writes a number variable, labelled for a screen reader
  const slider = (name: string, label: string, v: typeof simLevel, x: number, y: number, w: number, min: number, max: number, step: number, describe: string) =>
    bind(
      createNode('input', {
        name,
        ...lookDefaults(project, 'input'),
        inputType: 'range',
        variableId: v.id,
        min,
        max,
        step,
        value: String(min),
        x,
        y,
        width: w,
        height: 32,
        fontFamily: BRAND_FONT,
        color: L.button,
        ariaLabel: label,
      } as never),
      { visible: '!listening', ariaDescription: describe },
    );
  const small = (name: string, value: string, x: number, y: number, w: number, extra: Record<string, unknown> = {}) => text(ctx, name, value, x, y, w, { fontSize: 14, color: L.muted, lineHeight: 1.35, ...extra });

  //Start and Stop are one button: its label and what a press does follow `listening`, and it steps aside when the microphone is off or missing
  const micControls = (page: typeof meter, g: Graph, y: number) => {
    const listen = bind(button(ctx, 'Listen button', 'Start listening', rx, y, rw, true), {
      label: 'listening ? "Stop listening" : "Start listening"',
      ariaLabel: 'listening ? "Stop listening" : "Start listening with the microphone. Nothing is recorded"',
      visible: 'listening || (microphone != "unavailable" && microphone != "off")',
    });
    const msg = small('Microphone message', `{${noMic}}`, rx, y + 54, rw, { autoSize: 'none', height: 52 });
    page.children.push(listen, msg);
    //A start that did not work leaves by Could not start: the slider is right there
    const onListen = g.click(listen, 'Start or stop listening');
    graphNote(page, { anchor: onListen, colour: 'sky', text: '**One button starts and stops listening.** A start that fails leaves by **Failed**, which points at the slider, and `stopOnLeave` turns the microphone off when the learner leaves the page. Nothing is recorded.' });
    const going = g.add('logic.if', { condition: 'listening' }, onListen);
    g.add('action.listen', { op: 'stop' }, going, 'true');
    const on = g.add('action.listen', { op: 'start', stopOnLeave: true }, going, 'false', { dy: 70 });
    g.add('action.announce', { text: '"The microphone did not start. " + mediaMessage + " Use the slider instead."', politeness: 'polite' }, on, 'failed');
    return { listen, msg };
  };

  // ------------------------------------------------------------------ scene 1: the loudness meter

  //The status line and what it asks for
  const status = text(
    ctx,
    'Status',
    `{${IDLE} ? "Start listening, or move the slider to try it." : use == "steady" ? (zone == "in" ? "In the band. Hold it there." : zone == "low" ? "A little louder." : "A little softer.") : (zone == "high" ? "Loud, for a rough guide." : "Comfortable, for a rough guide.")}`,
    box.x,
    box.y + 4,
    W,
    { fontSize: 28, fontWeight: 700, lineHeight: 1.25, autoSize: 'none', height: 70 },
  );
  //The meter is a native Progress layer (read out as a meter): the track is the layer, the bar its fill, and the level its value
  const level = bind(createNode('progress', { name: 'Level', x: 0, y: 0, width: W, height: 64, value: 0, max: 1, fill: solid(L.surface), stroke: stroke(L.border, 1.5), barFill: solid(L.muted), cornerRadius: 12, orientation: 'horizontal', semantics: 'meter', ariaLabel: 'Loudness' } as never), { value: `clamp(${LEVEL}, 0, 1)`, 'barFill.color': `zone == "in" || (use == "noise" && zone != "high") ? "${L.primary}" : "${L.muted}"` });
  //The target band is an outline, so it shows in every colourway and for a viewer who cannot tell the colours apart
  const band = bind(createNode('frame', { name: 'Target band', x: 0, y: -6, width: 100, height: 76, cornerRadius: 10, fill: null, stroke: stroke(L.text, 3), clip: false, decorative: true }), { x: `bandLo * ${W}`, width: `Math.max(8, (bandHi - bandLo) * ${W})` });
  const gauge = createNode('frame', { name: 'Meter', x: box.x, y: box.y + 84, width: W, height: 64, fill: null, stroke: null, clip: false, role: 'region', children: [level, band] }) as FrameNode;
  bind(gauge, { ariaLabel: `"Loudness " + Math.round(${LEVEL} * 100) + " out of 100. " + (use == "steady" ? "Target band " + Math.round(steadyLo * 100) + " to " + Math.round(steadyHi * 100) + "." : "Rough guide line at " + Math.round(noiseLine * 100) + ".")` });
  const quiet = small('Scale quiet', 'Quiet', box.x, box.y + 156, 120);
  const loud = small('Scale loud', 'Loud', box.x + W - 120, box.y + 156, 120, { align: 'right' });
  const bandLabel = bind(small('Band label', '{use == "steady" ? "Target band" : "Rough comfort guide"}', box.x, box.y + 178, 220, { fontWeight: 700, color: L.text }), { x: `${box.x} + bandLo * ${W}` });
  const readout = text(ctx, 'Level readout', `Level: {Math.round(${LEVEL} * 100)} out of 100`, box.x, box.y + 214, W, { fontSize: 18, fontWeight: 600 });
  const stats = bind(text(ctx, 'Steady stats', 'Steady in the band: {steady} s. Best run: {best} s', box.x, box.y + 244, W, { fontSize: 18 }), { visible: 'use == "steady"' });
  const guide = text(
    ctx,
    'Guide',
    '{use == "steady" ? "Read a sentence aloud and keep the bar inside the outlined band. Try to hold it there for ten seconds. A steady voice is easier to listen to than a loud one." : "This is a rough guide only. Phone and laptop microphones adjust their own volume (automatic gain), so the bar shows louder or quieter, not decibels. For a real workplace noise check, use a sound level meter."}',
    box.x,
    box.y + 284,
    W,
    { fontSize: 16, lineHeight: 1.4, color: L.muted, autoSize: 'none', height: 92 },
  );
  meter.children.push(status, gauge, quiet, loud, bandLabel, readout, stats, guide);

  //The right column: what to check, the microphone, and the slider for when there is none
  const modeHead = heading(ctx, 'Mode heading', 'What do you want to check?', rx, box.y + 4, rw, { fontSize: 18 });
  const steadyBtn = button(ctx, 'Steady volume', 'Steady volume', rx, box.y + 34, rw, false);
  const noiseBtn = button(ctx, 'Noise check', 'Noise check', rx, box.y + 88, rw, false);
  //The chosen mode is a pressed button (native, so it is announced) with a tick in front of it as well as the colour
  for (const [btn, mode, label] of [[steadyBtn, 'steady', 'Steady volume'], [noiseBtn, 'noise', 'Noise check']] as const) {
    bind(btn, { label: `use == "${mode}" ? "✓ ${label}" : "${label}"`, ariaLabel: `"${label}"`, ariaPressed: `use == "${mode}"`, 'fill.color': `use == "${mode}" ? "${L.button}" : "${L.background}"`, color: `use == "${mode}" ? "${L.onButton}" : "${L.text}"` });
  }
  meter.children.push(modeHead, steadyBtn, noiseBtn);
  const g1 = new Graph(meter);
  const mic1 = micControls(meter, g1, box.y + 152);
  const simHead = bind(heading(ctx, 'Slider heading', 'No microphone? Use the slider', rx, box.y + 270, rw, { fontSize: 18 }), { visible: '!listening' });
  const levelSlider = slider('Practice level slider', 'Practice loudness', simLevel, rx, box.y + 300, rw, 0, 1, 0.01, '"Practice loudness " + Math.round(simLevel * 100) + " out of 100"');
  const simRead = bind(small('Practice readout', 'Practice loudness: {Math.round(simLevel * 100)}', rx, box.y + 340, rw), { visible: '!listening' });
  meter.children.push(simHead, levelSlider, simRead);

  const next = button(ctx, 'Next scene', 'Next: sound bars', box.x, barY(box), 240, true);
  const back = button(ctx, 'Back to start', 'Back to the start', box.x + 256, barY(box), 220, false);
  meter.children.push(next, back);
  g1.run(g1.click(next, 'To the bars'), goNext());
  g1.run(g1.click(back, 'To the start'), go(hero.page));

  const onSteady = g1.click(steadyBtn, 'Steady volume');
  graphNote(meter, { anchor: onSteady, colour: 'sky', text: '**Steady volume and Noise check only set use.** The live `bandLo` and `bandHi` read it to move the target band, and the score (`steady`, `best`) starts again.' });
  g1.run(onSteady, set(use, '"steady"'), resetVars(steady, best), announce('"Steady volume. Keep the bar inside the outlined band."'));
  g1.run(g1.click(noiseBtn, 'Noise check'), set(use, '"noise"'), resetVars(steady, best), announce('"Noise check, as a rough guide. This is not a decibel reading."'));
  g1.run(g1.start('Open on steady volume'), resetVars(use, steady, best));

  //Four times a second, kept on the beat (steady): which zone the level is in, with a little give so it does not flicker at the edge (which needs its last value, so it
  //is not a live variable), and how long it has stayed in the band
  const tick1 = g1.add('event.timer', { ms: 250, repeat: true, steady: true }, null, 'out', { note: 'Four times a second' });
  g1.run(
    tick1,
    set(zone, `zone == "in" ? (${LEVEL} < bandLo - 0.03 ? "low" : ${LEVEL} > bandHi + 0.03 ? "high" : "in") : (${LEVEL} < bandLo ? "low" : ${LEVEL} > bandHi ? "high" : "in")`),
    set(steady, `use == "steady" && zone == "in" && !${IDLE} ? Math.round((steady + 0.25) * 100) / 100 : 0`),
    set(best, 'Math.max(best, steady)'),
  );
  graphNote(meter, { anchor: tick1, colour: 'sky', text: '**A timer, not a live variable**, because `zone` needs its own last value to give the band edge 0.03 of slack and not flicker. `steady` adds a quarter second per tick inside the band, and `best` keeps the longest.' });
  g1.gap(40);
  //Said once when the zone changes, and only while there is a sound to speak of (the event's Only if, not an If node)
  const changed = g1.add('event.variable', { variable: zone.id, onlyIf: `!${IDLE}` }, null, 'out', { note: 'The zone changed' });
  g1.add('action.announce', { text: 'use == "steady" ? (zone == "in" ? "In the band." : zone == "low" ? "A little louder." : "A little softer.") : (zone == "high" ? "Loud, for a rough guide." : "Comfortable, for a rough guide.")', politeness: 'polite' }, changed);
  graphNote(meter, { anchor: changed, colour: 'sky', text: '**Spoken once per change of zone**, not every tick. *Only if* skips it in silence (no microphone and the slider at 0), so the page is quiet until there is a sound.' });
  g1.gap(60);

  checklist.push(
    todo('Set the target band for the meter', 'Set the target band: Project > Variables > "steadyLo" and "steadyHi" (0 to 1, the part of the meter to aim for) and "noiseLine" (where "loud" starts in the noise check). The sample is a comfortable speaking volume. Move the band to suit your task', byName(meter, 'Target band'), meter),
    todo('Check the words around the noise check', 'Check the words around the noise check. It says "rough guide" because phones and laptops adjust the volume themselves (automatic gain), so the bar is not decibels. Do not use it as a safety measurement. For a real workplace noise check, point to a sound level meter and your own policy', guide, meter),
    todo('Check the microphone setting', 'Check the microphone setting: Project > Microphone and camera has Live listening ticked and "Only ever listen, never record", with a sentence for what it is used for. The learners\' consent screen is made from those. Update the Link for StudyDesk after any change, and make sure the StudyDesk page\'s iframe has allow="microphone; camera"', mic1.listen, meter),
    todo('Keep the slider for learners who cannot use a microphone', 'Keep the slider. It makes the same numbers as the microphone (simLevel and simPitch), so the scenes work for a learner who cannot or would rather not use a microphone, and for a quiet room. If you remove it, add another way for them to finish', levelSlider, meter),
    todo('Decide whether the microphone stays on across scenes', 'Learners press Start listening on each scene: the microphone is let go when they leave a page. To keep it on across the scenes, untick "Stop when the learner leaves this page" on the Listen live nodes (Interactions tab). The Listening bar at the top of the page always has a Stop', mic1.listen, meter),
  );

  // ------------------------------------------------------------------ scene 2: the frequency bars

  const peakText = text(
    ctx,
    'Loudest band',
    '{peak < 0 ? "Make a sound, or move the sliders." : "Loudest band: " + bandLabels[peak].label + " Hz (" + bandLabels[peak].what + ")"}',
    box.x,
    box.y + H + 52,
    W,
    { fontSize: 19, fontWeight: 700, autoSize: 'none', height: 30 },
  );
  const peakColour = `"${L.deep}"`;
  const bar = bind(createNode('rect', { name: 'Bar', x: 0, y: 0, width: 64, height: 3, cornerRadius: 8, fill: solid(L.button), stroke: null, decorative: true }), {
    height: `Math.max(3, ${H} * clamp(${NOW}[index], 0, 1))`,
    y: `${H} - Math.max(3, ${H} * clamp(${NOW}[index], 0, 1))`,
    'fill.color': `index == peak ? ${peakColour} : "${L.button}"`,
  });
  const ground = createNode('rect', { name: 'Bar baseline', x: 0, y: H, width: 64, height: 2, fill: solid(L.border), stroke: null, decorative: true });
  const tag = text(ctx, 'Band name', '{item.label}', 0, H + 6, 64, { fontSize: 12, color: L.muted, align: 'center', autoSize: 'none', height: 16 });
  const cell = createNode('frame', { name: 'Band', x: 0, y: 0, width: 64, height: H + 24, fill: null, stroke: null, clip: false, children: [bar, ground, tag] }) as FrameNode;
  const plot = createNode('frame', {
    name: 'Bars',
    x: box.x,
    y: box.y + 4,
    width: W,
    height: H + 24,
    fill: null,
    stroke: null,
    clip: false,
    role: 'img',
    repeat: { items: 'bandLabels', layout: 'grid', gap: 8, columns: 8 },
    children: [cell],
  } as never) as FrameNode;
  bind(plot, { ariaLabel: '"Eight bars from low sound on the left to high sound on the right. " + (peak < 0 ? "No sound yet." : "The loudest is " + bandLabels[peak].label + " hertz, " + bandLabels[peak].what + ".")' });
  const axis = small('Axis caption', 'Frequency in hertz (Hz), low to high', box.x, box.y + H + 34, W, { fontSize: 13 });
  const note2 = small('Bars note', 'Each bar is a band of sound, from low on the left to high on the right. The page measures the sound on your device and keeps none of it. Microphones tidy the sound themselves, so read the bars as a guide, not a measurement.', box.x, box.y + H + 90, W, { autoSize: 'none', height: 60 });
  bars.children.push(plot, axis, peakText, note2);

  const g2 = new Graph(bars);
  micControls(bars, g2, box.y + 4);
  const simHead2 = bind(heading(ctx, 'Slider heading', 'No microphone? Use the sliders', rx, box.y + 120, rw, { fontSize: 18 }), { visible: '!listening' });
  const loudSlider = slider('Practice loudness slider', 'Practice loudness', simLevel, rx, box.y + 150, rw, 0, 1, 0.01, '"Practice loudness " + Math.round(simLevel * 100) + " out of 100"');
  const pitchLabel = bind(small('Pitch label', 'Practice pitch, low to high', rx, box.y + 188, rw), { visible: '!listening' });
  const pitchSlider = slider('Practice pitch slider', 'Practice pitch, low to high', simPitch, rx, box.y + 210, rw, 0, 7, 0.1, '"Practice pitch: bar " + (Math.round(simPitch) + 1) + " of 8"');
  bars.children.push(simHead2, loudSlider, pitchLabel, pitchSlider);

  const askHead = heading(ctx, 'Challenge heading', 'Try this', rx, box.y + 262, rw, { fontSize: 18 });
  const ask = text(ctx, 'Challenge', '{shown ? "A higher whistle has a higher frequency, so the loudest bar moves to the right. A deeper hum moves it to the left. How loud you are changes how tall the bars are, not which one is loudest." : "Whistle or hum a low note, then a higher one. Which bar is loudest, and which way does it move?"}', rx, box.y + 292, rw, { fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 112 });
  const reveal = button(ctx, 'Show or hide', 'Show what to look for', rx, box.y + 410, rw, false);
  bind(reveal, { label: 'shown ? "Show the question again" : "Show what to look for"' });
  bars.children.push(askHead, ask, reveal);
  const onReveal = g2.click(reveal, 'Show or hide the answer');
  graphNote(bars, { anchor: onReveal, colour: 'sky', text: '**One Toggle on shown** flips the challenge text and the button label together, and Start again clears it. [ ] Write your own question and answer in the text it reads.' });
  g2.run(onReveal, toggleVar(shown));

  const back2 = button(ctx, 'Back to meter', 'Back to the meter', box.x, barY(box), 240, false);
  const again = button(ctx, 'Start again', 'Start again', box.x + 256, barY(box), 200, true);
  bars.children.push(back2, again);
  g2.run(g2.click(back2, 'Back to the meter'), goPrevious());
  g2.run(g2.click(again, 'Start again'), resetVars(shown), go(hero.page));

  checklist.push(
    todo('Check the eight band names', 'Check the eight band names in Project > Variables > "bandLabels": the label is the band in hertz and "what" is a rough guide to what lives there. The page\'s microphone reports eight log-spaced bands from 80 Hz to 8 kHz, so keep eight. It shows where the sound is, not which note, and there is no pitch tracking', byName(bars, 'Bars'), bars),
    todo('Rewrite the challenge to suit your lesson', 'Rewrite the challenge to suit your lesson (a physics question about frequency, a singing exercise, a speech sound to try) and its answer: the text on the right, which flips with the Show button', ask, bars),
    todo('Check the slider route works without a microphone', 'Check the slider route on this page: the loudness and pitch sliders make the same numbers as the microphone, so the bars move with no microphone. Try the real microphone from the Link for StudyDesk, not Preview, where a pretend microphone makes a moving bump of bands', pitchSlider, bars),
  );

  //Notes for whoever edits the template, below each page
  const below = (page: typeof meter, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(meter, { ...below(meter, 0, 440), text: '**Live variables** `bandLo`, `bandHi` and `peak` are worked out from the mode and from what the displays read, so there is no timer polling for the loudest band and no Set step on a mode change.', colour: 'sky' });
  addNote(meter, { ...below(meter, 456, 440), text: '**Slider route** The sliders make `simLevel` and `simPitch`, which every display reads when the microphone is off. [ ] Keep them, so the scene works with no microphone.', colour: 'gold' });
  addNote(bars, { ...below(bars, 0, 440), text: '**Rough guide** Microphones tidy the sound themselves, so the wording says guide, never measurement. Keep it that way.', colour: 'orange' });
  return { project, checklist };
}

/** States for the layout check: the noise check with a long guide, and the answer shown on the bars page. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'noise check', page: 'How loud am I?', vars: { use: 'noise', simLevel: 0.9 } },
  { label: 'answer shown', page: 'Which sounds are high, which are low?', vars: { shown: true, simLevel: 0.8, simPitch: 5 } },
];

export const liveSoundLab: BrandedStarter = {
  key: 'media/live-sound-lab',
  set: 'media',
  name: 'Live sound lab',
  description: 'The microphone as an input, with nothing recorded. Two scenes: a loudness meter with a target band (steady volume practice, or a noise check worded as a rough guide) and eight frequency bars (whistle higher, what changed?). The numbers move about 25 times a second while the learner listens, and a slider makes the same numbers for a learner with no microphone.',
  tags: ['microphone', 'sound', 'live', 'loudness', 'frequency', 'physics', 'voice', 'privacy'],
  build,
  layoutStates: LAYOUT_STATES,
};
